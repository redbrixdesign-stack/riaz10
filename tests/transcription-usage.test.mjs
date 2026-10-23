import assert from 'node:assert/strict';
import { createTranscriptionUsage, TRANSCRIPTION_LIMITS, RESERVE_SCRIPT } from '../server/transcription-usage.mjs';
import handler, { _setTranscriptionUsage } from '../api/transcribe.mjs';

assert.deepEqual(TRANSCRIPTION_LIMITS, { attempts: 100, bytes: 100_000_000, concurrent: 2, leaseMs: 120_000 });
let reply = [1, 0, 0], calls = [], removed = [];
const redis = { eval: async (...args) => { calls.push(args); return reply; }, zrem: async (...args) => removed.push(args) };
const usage = createTranscriptionUsage({ getClient: () => redis });
const first = await usage.reserve(32);
assert(first.allowed);
assert.equal(calls[0][0], RESERVE_SCRIPT);
assert.deepEqual(calls[0][2].slice(0, 5), [32, 100, 100_000_000, 2, 120_000]);
const second = await usage.reserve(64);
assert.notEqual(calls[0][2][5], calls[1][2][5], 'Distinct leases, no shared decrement counter');
await first.release(); await second.release();
assert.equal(removed[0][1], calls[0][2][5]);
for (const [code, reason] of [[1, 'daily_attempts'], [2, 'daily_audio'], [3, 'busy']]) {
  reply = [0, code, 15];
  assert.deepEqual(await usage.reserve(32), { allowed: false, reason, retryAfter: 15 });
}
for (const invalid of [null, [1], [0, 9, 30], [0, 1, -1]]) {
  reply = invalid;
  assert.equal((await usage.reserve(32)).reason, 'unavailable');
}
assert.equal((await createTranscriptionUsage({ getClient: () => { throw new Error('store down'); } }).reserve(32)).reason, 'unavailable');
assert.equal((await createTranscriptionUsage({ getClient: () => redis }).reserve(0)).reason, 'unavailable');

process.env.NODE_ENV = 'test'; process.env.ALLOWED_ORIGIN = 'https://synthetic.example'; process.env.AI_SECRET = 'synthetic-secret';
let reserves = 0, releases = 0, upstream = 0, providerMode = 'success', denial;
_setTranscriptionUsage({ reserve: async bytes => {
  reserves++; assert.equal(bytes, 3);
  return denial || { allowed: true, release: async () => { releases++; } };
} });
global.fetch = async () => {
  upstream++;
  if (providerMode === 'abort') throw Object.assign(new Error('synthetic timeout'), { name: 'AbortError' });
  if (providerMode === 'network') throw new Error('synthetic network');
  return { ok: providerMode !== 'reject', status: 429, json: async () => {
    if (providerMode === 'json') throw new Error('synthetic json');
    return { text: providerMode === 'empty' ? '' : 'SYNTHETIC context' };
  } };
};
async function call({ secret = 'synthetic-secret', origin = 'https://synthetic.example', audio = 'AAAA' } = {}) {
  const req = { method: 'POST', headers: { origin, 'x-ai-key': secret }, body: { audio, mediaType: 'audio/wav' } };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } };
  await handler(req, res); return res;
}
assert.equal((await call({ secret: 'wrong' })).statusCode, 403);
assert.equal((await call({ origin: 'https://wrong.example' })).statusCode, 403);
assert.equal((await call({ audio: '' })).statusCode, 400);
assert.equal(reserves, 0, 'Auth/payload failures do not consume shared quota');
for (const reason of ['daily_attempts', 'daily_audio', 'busy', 'unavailable']) {
  denial = { allowed: false, reason, retryAfter: 30 };
  const result = await call();
  assert.equal(result.statusCode, reason === 'unavailable' ? 503 : 429);
  assert.equal(result.headers['retry-after'], '30');
  assert(result.body.message.includes('available'));
}
assert.equal(upstream, 0, 'No paid provider request after quota/store denial');
denial = null;
for (const mode of ['success', 'reject', 'empty', 'abort', 'network', 'json']) {
  providerMode = mode;
  const before = releases;
  const result = await call();
  assert.equal(releases, before + 1, 'Lease released after ' + mode);
  if (mode === 'success') assert.equal(result.statusCode, 200);
  if (mode === 'abort') assert.equal(result.statusCode, 504);
}
console.log('PASS shared transcription guard wiring, exact approved limits, fail-closed store, no provider on denial, auth/payload exclusion and all-path lease release');
