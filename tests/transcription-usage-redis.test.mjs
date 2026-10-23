// Explicit integration check against configured Redis. Unique synthetic keys;
// never calls a model, reads customer data, or changes the actual pilot allowance.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RESERVE_SCRIPT, TRANSCRIPTION_LIMITS as limits } from '../server/transcription-usage.mjs';
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) throw new Error('Configured Redis unavailable; integration NOT verified');
const redis = new Redis({ url, token, retry: false, enableAutoPipelining: false, signal: () => AbortSignal.timeout(5000) });
const prefix = 'beelo:{transcription-audit-' + randomUUID() + '}';
const keys = [prefix + ':day', prefix + ':active'];
const reserve = (bytes = 1, lease = randomUUID()) => redis.eval(RESERVE_SCRIPT, keys, [bytes, limits.attempts, limits.bytes, limits.concurrent, limits.leaseMs, lease]);
const reset = () => redis.del(...keys);
try {
  const now = await redis.time();
  const day = Math.floor(Number(now[0]) / 86400);
  await redis.hset(keys[0], { day, attempts: 99, bytes: 0 }); await redis.expire(keys[0], 300);
  assert.equal((await reserve())[0], 1, '100th allowed');
  assert.equal((await reserve())[1], 1, '101st rejected');
  await reset();
  await redis.hset(keys[0], { day, attempts: 0, bytes: 99_000_000 }); await redis.expire(keys[0], 300);
  assert.equal((await reserve(1_000_000))[0], 1, 'Exact 100 MB accepted');
  assert.equal((await reserve())[1], 2, 'One byte over rejected');
  await reset();
  const race = await Promise.all(Array.from({ length: 12 }, () => reserve()));
  assert.equal(race.filter(r => r[0] === 1).length, 2, 'Atomic race admits exactly two');
  assert.equal(race.filter(r => r[1] === 3).length, 10);
  assert.equal(Number(await redis.hget(keys[0], 'attempts')), 2, 'Busy requests do not consume attempts');
  const leases = await redis.zrange(keys[1], 0, -1);
  await redis.zrem(keys[1], leases[0]);
  assert.equal((await reserve(1, 'new-synthetic-lease'))[0], 1);
  await redis.zrem(keys[1], leases[0]);
  assert.equal(Number(await redis.zcard(keys[1])), 2, 'Late old release cannot delete new lease');
  // Simulate a crashed/expired lease without waiting two minutes.
  await redis.zadd(keys[1], { score: 0, member: leases[1] });
  assert.equal((await reserve())[0], 1, 'Expired lease recovered');
  await reset();
  await redis.hset(keys[0], { day: day - 1, attempts: 100, bytes: 100_000_000 }); await redis.expire(keys[0], 300);
  const nextDay = await reserve();
  assert.equal(nextDay[0], 1, 'Redis-clock new UTC day resets both allowances');
  assert.equal(Number(await redis.hget(keys[0], 'attempts')), 1);
  assert.equal(Number(await redis.hget(keys[0], 'bytes')), 1);
  console.log('PASS real Redis Lua: 100 attempts, exact 100 MB, atomic 12-request race, release identity, expired crash lease and UTC reset. Synthetic keys only; no model calls.');
} finally { await reset(); }
