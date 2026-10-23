import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

// One shared pilot allowance, not a per-device identity or a monetary budget.
export const TRANSCRIPTION_LIMITS = Object.freeze({ attempts: 100, bytes: 100_000_000, concurrent: 2, leaseMs: 120_000 });
// Redis time and a single atomic script prevent instance races and clock drift.
export const RESERVE_SCRIPT = `
local now = redis.call('TIME')
local seconds = tonumber(now[1])
local millis = seconds * 1000 + math.floor(tonumber(now[2]) / 1000)
local day = math.floor(seconds / 86400)
local retry = (day + 1) * 86400 - seconds
local savedDay = tonumber(redis.call('HGET', KEYS[1], 'day') or '-1')
local count = 0
local bytes = 0
if savedDay == day then
  count = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0')
  bytes = tonumber(redis.call('HGET', KEYS[1], 'bytes') or '0')
end
if count >= tonumber(ARGV[2]) then return {0, 1, retry} end
if bytes + tonumber(ARGV[1]) > tonumber(ARGV[3]) then return {0, 2, retry} end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', millis)
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return {0, 3, 15} end
redis.call('HSET', KEYS[1], 'day', day, 'attempts', count + 1, 'bytes', bytes + tonumber(ARGV[1]))
redis.call('EXPIRE', KEYS[1], retry + 86400)
redis.call('ZADD', KEYS[2], millis + tonumber(ARGV[5]), ARGV[6])
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[5]) + 1000)
return {1, 0, 0}
`;

export function createTranscriptionUsage({ getClient, prefix = 'beelo:{transcription-pilot}:v1' } = {}) {
  let client;
  const configuredClient = getClient || (() => {
    if (client) return client;
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('usage_store_missing');
    client = new Redis({ url, token, retry: false, enableAutoPipelining: false, signal: () => AbortSignal.timeout(5000) });
    return client;
  });
  return {
    async reserve(bytes) {
      try {
        if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('invalid_audio_size');
        const redis = configuredClient();
        const lease = randomUUID();
        const limits = TRANSCRIPTION_LIMITS;
        const result = await redis.eval(RESERVE_SCRIPT, [prefix + ':day', prefix + ':active'],
          [bytes, limits.attempts, limits.bytes, limits.concurrent, limits.leaseMs, lease]);
        if (!Array.isArray(result) || result.length !== 3 || ![0, 1].includes(result[0])) throw new Error('invalid_usage_response');
        if (result[0] === 1) return { allowed: true, release: async () => {
          try { await redis.zrem(prefix + ':active', lease); }
          catch { console.warn('[transcribe] usage lease release unavailable'); }
        } };
        const reason = { 1: 'daily_attempts', 2: 'daily_audio', 3: 'busy' }[result[1]];
        if (!reason || !Number.isFinite(result[2]) || result[2] < 1) throw new Error('invalid_usage_response');
        return { allowed: false, reason, retryAfter: result[2] };
      } catch {
        // Never fall back to an instance-local counter for paid requests.
        console.warn('[transcribe] shared usage protection unavailable');
        return { allowed: false, reason: 'unavailable', retryAfter: 30 };
      }
    }
  };
}
