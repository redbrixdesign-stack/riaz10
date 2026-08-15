/* ============================================
   ADVISOROS — SELF-HOSTED PROXY (server/index.js) TESTS
   Run with: npm run test:proxy-server  (node tests/proxy-server.test.js)

   The self-hosted Express server must expose EXACTLY the same hardened
   contract as the serverless handler (api/claude.mjs), which
   tests/ai.test.js covers in-process. This suite boots the real Express
   app on an ephemeral port and proves the guards survive the HTTP
   boundary: CORS lockdown, shared-secret check, production fail-closed,
   per-address rate limiting, size caps, generic non-leaking upstream
   errors, and the happy path. The Anthropic upstream is stubbed.
   ============================================ */

'use strict';

const assert = require('assert');

let failures = 0;
function ok(label, cond, extra) {
  if (cond) {
    console.log('  OK ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

const savedEnv = {};
const envKeys = ['ANTHROPIC_API_KEY', 'AI_SECRET', 'ALLOWED_ORIGIN', 'NODE_ENV', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'ANTHROPIC_TIMEOUT_MS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
for (const k of envKeys) savedEnv[k] = process.env[k];
process.env.ANTHROPIC_API_KEY = 'test-key';
delete process.env.AI_SECRET;
delete process.env.ALLOWED_ORIGIN;
delete process.env.NODE_ENV;

// Stub the Anthropic upstream BEFORE the server imports the shared handler.
const path = require('path');
const realFetch = global.fetch;
let stubbedAnthropic = null;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    if (stubbedAnthropic) return stubbedAnthropic(url, opts);
    throw new Error('fake: no anthropic stub installed');
  }
  return realFetch(url, opts);
};

function anthropicOk(text) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } })
  };
}
function anthropicError(status) {
  return {
    ok: false,
    status,
    statusText: 'Anthropic error',
    json: async () => ({ error: { message: 'sk-ant secret internal detail: invalid x-api-key', code: 'x' } })
  };
}

const { app } = require(path.join(__dirname, '..', 'server', 'index.js'));

// Default upstream answers "pong" unless a test overrides the stub.
stubbedAnthropic = () => anthropicOk('pong');

let server, base;
function start() {
  return new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      base = 'http://127.0.0.1:' + server.address().port;
      resolve();
    });
  });
}
function stop() {
  return new Promise(resolve => server.close(resolve));
}
function post(p, { headers = {}, body = {}, method = 'POST' } = {}) {
  return fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body)
  });
}

(async () => {
  await start();

  // Health endpoint.
  const health = await fetch(base + '/health');
  ok('server: /health 200 ok', health.status === 200 && (await health.json()).ok === true);

  // Method guard.
  let r = await post('/', { method: 'GET' });
  ok('server: GET rejected 405', r.status === 405, r.status);

  // CORS preflight (mounts: / and /api/ai).
  r = await post('/', { method: 'OPTIONS', headers: { origin: 'https://app.example' } });
  ok('server: OPTIONS 204', r.status === 204);
  ok('server: CORS echo origin', r.headers.get('access-control-allow-origin') === 'https://app.example');
  ok('server: CORS allows x-ai-key', r.headers.get('access-control-allow-headers').includes('x-ai-key'));
  r = await post('/api/ai', { method: 'OPTIONS', headers: { origin: 'https://app.example' } });
  ok('server: /api/ai OPTIONS 204 (backwards-compatible mount)', r.status === 204);

  // Type validation.
  r = await post('/', { body: { type: 'teleport' } });
  ok('server: bad type 400', r.status === 400 && (await r.json()).error === 'bad_request');

  // Body size guard: contract-level 413 JSON (not Express HTML) for oversized
  // payloads, even with a valid type.
  r = await post('/', { body: { type: 'route', text: 'y'.repeat(5 * 1024 * 1024) } });
  const tooBig = await r.json();
  ok('server: oversized body 413 via JSON contract', r.status === 413 && tooBig.error === 'too_large', r.status);

  // Shared-secret guard.
  process.env.AI_SECRET = 's3cret';
  r = await post('/', { body: { type: 'ping' } });
  ok('server: missing secret 403', r.status === 403);
  r = await post('/', { headers: { 'x-ai-key': 'wrong' }, body: { type: 'ping' } });
  ok('server: wrong secret 403', r.status === 403);
  delete process.env.AI_SECRET;

  // Origin allow-list guard.
  process.env.ALLOWED_ORIGIN = 'https://app.example';
  r = await post('/', { headers: { origin: 'https://evil.example' }, body: { type: 'ping' } });
  ok('server: disallowed origin 403', r.status === 403, r.status);
  r = await post('/', { headers: { origin: 'https://app.example' }, body: { type: 'ping' } });
  ok('server: allowed origin reaches upstream', r.status === 200, r.status);
  delete process.env.ALLOWED_ORIGIN;

  // Production fail-closed.
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOWED_ORIGIN;
  delete process.env.AI_SECRET;
  r = await post('/', { headers: { origin: 'https://app.example' }, body: { type: 'ping' } });
  ok('server: production without ALLOWED_ORIGIN fails closed 500', r.status === 500 && (await r.json()).error === 'config', r.status);
  process.env.ALLOWED_ORIGIN = 'https://app.example';
  r = await post('/', { headers: { origin: 'https://app.example' }, body: { type: 'ping' } });
  ok('server: production without AI_SECRET fails closed 500', r.status === 500 && (await r.json()).error === 'config', r.status);
  process.env.ALLOWED_ORIGIN = 'https://app.example';
  process.env.AI_SECRET = 's3cret';
  r = await post('/', { headers: { origin: 'https://app.example', 'x-ai-key': 's3cret' }, body: { type: 'ping' } });
  ok('server: production configured passes the guard', r.status === 200, r.status);
  delete process.env.NODE_ENV;
  delete process.env.ALLOWED_ORIGIN;
  delete process.env.AI_SECRET;

  // Happy path: ping through the HTTP boundary.
  stubbedAnthropic = () => anthropicOk('pong');
  r = await post('/', { body: { type: 'ping' } });
  const pingBody = await r.json();
  ok('server: ping 200 ok:true', r.status === 200 && pingBody.ok === true && pingBody.text === 'pong', pingBody);
  ok('server: ping returns model + type + usage', pingBody.model === 'claude-haiku-4-5' && pingBody.type === 'ping' && pingBody.usage && pingBody.usage.cost !== undefined);

  // Upstream errors: status mapped, provider internals never forwarded.
  stubbedAnthropic = () => anthropicError(401);
  r = await post('/', { body: { type: 'ping' } });
  const authBody = await r.json();
  ok('server: upstream 401 -> 502 auth', r.status === 502 && authBody.error === 'auth', r.status);
  ok('server: provider error detail never reaches the client', !JSON.stringify(authBody).includes('x-api-key') && !JSON.stringify(authBody).includes('sk-ant'), authBody);
  stubbedAnthropic = () => anthropicError(529);
  r = await post('/', { body: { type: 'ping' } });
  ok('server: upstream 529 -> 502 overloaded', r.status === 502 && (await r.json()).error === 'overloaded');

  // Rate limiting across the HTTP boundary.
  stubbedAnthropic = () => anthropicOk('pong');
  process.env.RATE_LIMIT_MAX = '3';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    const res = await post('/', { headers: { 'x-forwarded-for': '203.0.113.50' }, body: { type: 'ping' } });
    statuses.push(res.status);
  }
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.RATE_LIMIT_WINDOW_MS;
  ok('server: rate limit allows within window', statuses[0] === 200 && statuses[1] === 200 && statuses[2] === 200, statuses);
  ok('server: rate limit blocks excess with 429', statuses[3] === 429, statuses);
  r = await post('/', { body: { type: 'ping' } });
  ok('server: rate limit is per client address', r.status === 200, r.status);

  // Rate limiting — Redis-backed path (mock the Redis client).
  stubbedAnthropic = () => anthropicOk('pong');
  process.env.RATE_LIMIT_MAX = '3';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  // Inject a mock Redis client that records calls and behaves like Upstash.
  const mockRedisCalls = [];
  const mockRedis = {
    zremrangebyscore: async (key, min, max) => { mockRedisCalls.push({ op: 'zremrangebyscore', key, min, max }); },
    zcard: async (key) => {
      mockRedisCalls.push({ op: 'zcard', key });
      // Return the current count for this key (track in-memory).
      if (!mockRedis._counts) mockRedis._counts = {};
      return mockRedis._counts[key] || 0;
    },
    zadd: async (key, { score, member }) => {
      mockRedisCalls.push({ op: 'zadd', key, score, member });
      if (!mockRedis._counts) mockRedis._counts = {};
      mockRedis._counts[key] = (mockRedis._counts[key] || 0) + 1;
    },
    expire: async (key, ttl) => { mockRedisCalls.push({ op: 'expire', key, ttl }); }
  };
  const { _setRedisClient } = await import('../api/claude.mjs');
  _setRedisClient(mockRedis);

  const redisStatuses = [];
  for (let i = 0; i < 4; i++) {
    const res = await post('/', { headers: { 'x-forwarded-for': '203.0.113.99' }, body: { type: 'ping' } });
    redisStatuses.push(res.status);
  }
  _setRedisClient(null); // reset

  delete process.env.RATE_LIMIT_MAX;
  delete process.env.RATE_LIMIT_WINDOW_MS;

  ok('server (redis): rate limit allows within window', redisStatuses[0] === 200 && redisStatuses[1] === 200 && redisStatuses[2] === 200, redisStatuses);
  ok('server (redis): rate limit blocks excess with 429', redisStatuses[3] === 429, redisStatuses);
  ok('server (redis): Redis zadd was called for each allowed request', mockRedisCalls.filter(c => c.op === 'zadd').length === 3, mockRedisCalls.length);
  ok('server (redis): Redis zremrangebyscore/zcard were called for each request', mockRedisCalls.filter(c => c.op === 'zremrangebyscore' || c.op === 'zcard').length >= 4, mockRedisCalls.length);

  // Per-client isolation still holds with Redis: a fresh address gets a clean window.
  const r2 = await post('/', { body: { type: 'ping' } });
  ok('server (redis): rate limit is per client address', r2.status === 200, r2.status);

  await stop();

  // Restore environment.
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }

  console.log('\n' + (failures === 0 ? 'ALL PROXY-SERVER TESTS PASSED' : failures + ' PROXY-SERVER TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => {
  console.error('UNEXPECTED ERROR:', e);
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
  process.exit(1);
});