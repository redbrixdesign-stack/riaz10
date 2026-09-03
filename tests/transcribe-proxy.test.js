'use strict';

(async () => {
  let failures = 0;
  const ok = (label, value) => { console.log((value ? '  OK ' : '  FAIL ') + label); if (!value) failures++; };
  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ALLOWED_ORIGIN = 'https://beelo.example';
  process.env.AI_SECRET = 'test-secret';
  let upstream = null;
  global.fetch = async (url, options) => { upstream = { url, options }; return { ok: true, status: 200, json: async () => ({ text: 'Measured the synthetic bedroom window.' }) }; };
  const { default: handler } = await import('../api/transcribe.mjs?test=1');
  const call = async ({ method = 'POST', body = {}, origin = 'https://beelo.example', secret = 'test-secret' } = {}) => {
    const req = { method, body, headers: { origin, 'x-ai-key': secret } };
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(value = '') { this.body = value; } };
    await handler(req, res); return { status: res.statusCode, body: JSON.parse(res.body || '{}'), headers: res.headers };
  };
  let result = await call({ body: { audio: Buffer.from('synthetic audio').toString('base64'), mediaType: 'audio/webm' } });
  ok('valid audio returns transcript', result.status === 200 && result.body.text.includes('synthetic bedroom'));
  ok('proxy uses fixed OpenAI transcription endpoint', upstream?.url === 'https://api.openai.com/v1/audio/transcriptions');
  ok('proxy keeps API key server-side', upstream?.options?.headers?.authorization === 'Bearer test-key');
  ok('proxy sends multipart audio', upstream?.options?.body instanceof FormData);
  result = await call({ origin: 'https://attacker.example', body: { audio: 'AAAA', mediaType: 'audio/webm' } });
  ok('wrong origin is rejected', result.status === 403);
  result = await call({ secret: 'wrong', body: { audio: 'AAAA', mediaType: 'audio/webm' } });
  ok('wrong shared secret is rejected', result.status === 403);
  result = await call({ body: { audio: 'AAAA', mediaType: 'application/octet-stream' } });
  ok('unsupported media is rejected', result.status === 415);
  console.log(failures ? `\n${failures} TRANSCRIPTION PROXY TEST(S) FAILED` : '\nALL TRANSCRIPTION PROXY TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
