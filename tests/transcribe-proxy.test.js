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
  const call = async ({ method = 'POST', body = {}, origin = 'https://beelo.example', secret = 'test-secret', extraHeaders = {}, chunks } = {}) => {
    const req = { method, body, headers: { origin, 'x-ai-key': secret, ...extraHeaders } };
    if (chunks) { delete req.body; req[Symbol.asyncIterator] = async function* () { yield* chunks; }; }
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
  upstream = null;
  result = await call({ body: { audio: Buffer.alloc(3_000_001).toString('base64'), mediaType: 'audio/webm' } });
  ok('audio above conservative 3 MB limit is rejected before provider', result.status === 413 && !upstream);
  for (const bytes of [2_999_999, 3_000_000]) {
    result = await call({ body: { audio: Buffer.alloc(bytes).toString('base64'), mediaType: 'audio/webm' } });
    ok(`audio boundary ${bytes} accepted with mocked provider`, result.status === 200);
  }
  const envelope = { audio: 'AAAA', mediaType: 'audio/webm', padding: '' };
  envelope.padding = 'x'.repeat(4_100_000 - Buffer.byteLength(JSON.stringify(envelope)));
  result = await call({ body: envelope });
  ok('parsed envelope at exact 4.1 MB accepted', result.status === 200);
  const exactRaw = Buffer.from(JSON.stringify(envelope));
  result = await call({ chunks: [exactRaw.subarray(0, 17), exactRaw.subarray(17)] });
  ok('streamed envelope at exact 4.1 MB accepted', result.status === 200);
  envelope.padding += 'x';
  upstream = null;
  result = await call({ body: envelope });
  ok('parsed envelope one byte over rejected before provider', result.status === 413 && result.body.error === 'body_too_large' && !upstream);
  const raw = Buffer.from(JSON.stringify(envelope));
  result = await call({ chunks: [raw.subarray(0, 10), raw.subarray(10)] });
  ok('streamed envelope one byte over rejected before provider', result.status === 413 && !upstream);
  result = await call({ extraHeaders: { 'content-length': '4100001' } });
  ok('oversized declared length rejected before parsing/provider', result.status === 413 && !upstream);
  result = await call({ body: { audio: 'AAAA', mediaType: 'audio/webm', padding: '🧪'.repeat(1_100_000) } });
  ok('parsed envelope counts UTF-8 bytes, not characters', result.status === 413 && !upstream);
  console.log(failures ? `\n${failures} TRANSCRIPTION PROXY TEST(S) FAILED` : '\nALL TRANSCRIPTION PROXY TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
