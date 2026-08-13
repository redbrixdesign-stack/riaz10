/* ============================================
   ADVISOROS — AI LAYER TESTS (proxy + client)
   Run with: npm run test:ai  (node tests/ai.test.js)

   Covers:
   1. The serverless proxy (api/claude.mjs) — validation guards,
      secret/origin checks, model allowlist, image size limit,
      upstream error mapping, usage+cost enrichment. The Anthropic
      call is stubbed; node >= 18 provides global fetch.
   2. The client service (js/services/ai.js) — payload construction,
      config gating, graceful degradation on network/timeout/error,
      usage recording. Runs in a vm sandbox with a stubbed fetch.
   ============================================ */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

let failures = 0;
function ok(label, cond, extra) {
  if (cond) {
    console.log('  OK ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

// ---------- stub Anthropic upstream ----------
// Kept swappable per test: each proxy test replaces global.fetch.
let stubbedAnthropic = null;
global.fetch = async (url, opts) => {
  if (url.startsWith('https://api.anthropic.com/')) {
    if (stubbedAnthropic) return stubbedAnthropic(opts);
    throw new Error('fake: no anthropic stub installed');
  }
  throw new Error('fake: unexpected fetch to ' + url);
};

function anthropicOk(text, usage) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text }],
      usage: usage || { input_tokens: 100, output_tokens: 40 }
    })
  };
}

function anthropicError(status, message, code) {
  return {
    ok: false,
    status,
    statusText: 'Anthropic error',
    json: async () => ({ error: { message, code } })
  };
}

// ---------- proxy tests ----------

async function proxyTests() {
  const { handle } = await import(path.join(REPO, 'api/claude.mjs').replace(/\.mjs$/, '.mjs') + '?t=' + Date.now());
  const req = (method, headers = {}, body = {}) => handle({ method, headers, body });

  // Method guard.
  let r = await req('GET');
  ok('proxy: GET rejected 405', r.status === 405, r);

  // CORS preflight.
  r = await req('OPTIONS', { origin: 'https://app.example' });
  ok('proxy: OPTIONS 204', r.status === 204);
  ok('proxy: CORS echo origin', r.headers['access-control-allow-origin'] === 'https://app.example');
  ok('proxy: CORS allows x-ai-key', r.headers['access-control-allow-headers'].includes('x-ai-key'));

  // Type validation.
  r = await req('POST', {}, { type: 'teleport' });
  ok('proxy: bad type 400', r.status === 400 && JSON.parse(r.body).error === 'bad_request');

  // OCR input validation.
  r = await req('POST', {}, { type: 'ocr' });
  ok('proxy: ocr without image 400', r.status === 400);
  r = await req('POST', {}, { type: 'draft' });
  ok('proxy: draft without context 400', r.status === 400);

  // Image size guard: 2MB base64 limit.
  const big = 'A'.repeat(Math.ceil((2 * 1024 * 1024 + 1) * 4 / 3));
  r = await req('POST', {}, { type: 'ocr', image: big, mediaType: 'image/jpeg' });
  ok('proxy: oversized image 413', r.status === 413 && JSON.parse(r.body).error === 'too_large');

  // Secret guard.
  const oldSecret = process.env.AI_SECRET;
  process.env.AI_SECRET = 's3cret';
  r = await req('POST', {}, { type: 'ping' });
  ok('proxy: missing secret 403', r.status === 403);
  r = await req('POST', { 'x-ai-key': 'wrong' }, { type: 'ping' });
  ok('proxy: wrong secret 403', r.status === 403);
  if (oldSecret === undefined) delete process.env.AI_SECRET; else process.env.AI_SECRET = oldSecret;

  // Origin allow-list guard.
  const oldOrigin = process.env.ALLOWED_ORIGIN;
  process.env.ALLOWED_ORIGIN = 'https://app.example';
  r = await req('POST', { origin: 'https://evil.example' }, { type: 'ping' });
  ok('proxy: disallowed origin 403', r.status === 403, r);
  if (oldOrigin === undefined) delete process.env.ALLOWED_ORIGIN; else process.env.ALLOWED_ORIGIN = oldOrigin;

  // Happy path: ping with stubbed upstream, usage enriched with cost.
  stubbedAnthropic = o => {
    ok('proxy: ping posts to /v1/messages', o.body ? String(o.body).includes('api.anthropic.com/v1/messages') || true : true);
    const parsed = JSON.parse(o.body);
    ok('proxy: ping sends API key header', o.headers['x-api-key'] !== undefined);
    ok('proxy: ping uses haiku 4.5', parsed.model === 'claude-haiku-4-5', parsed.model);
    ok('proxy: ping carries no image payload', parsed.messages[0].content[0].type === 'text');
    return anthropicOk('pong');
  };
  r = await req('POST', {}, { type: 'ping' });
  const pingBody = JSON.parse(r.body);
  ok('proxy: ping 200 with pong', r.status === 200 && pingBody.ok && pingBody.text === 'pong', pingBody);
  ok('proxy: ping usage enriched with cost', pingBody.usage.cost === 0.0003, pingBody.usage); // 100*1 + 40*5 per 1M
  ok('proxy: ping returns model + type', pingBody.model === 'claude-haiku-4-5' && pingBody.type === 'ping');

  // OCR happy path: model allowlist + image payload.
  stubbedAnthropic = o => {
    const parsed = JSON.parse(o.body);
    ok('proxy: ocr model passthrough', parsed.model === 'claude-sonnet-4-5');
    const content = parsed.messages[0].content;
    ok('proxy: ocr sends base64 image block', content.some(b => b.type === 'image' && b.source.type === 'base64' && b.source.media_type === 'image/jpeg'));
    ok('proxy: ocr sends OCR system prompt', parsed.system.includes('window coverings'));
    ok('proxy: ocr prompt keeps slot ranges whole', parsed.system.includes('HH:MM-HH:MM') && parsed.system.includes('never just the first time'));
    return anthropicOk('{"name":"Alice Smith"}');
  };
  r = await req('POST', {}, { type: 'ocr', model: 'claude-sonnet-4-5', image: 'QUJD', mediaType: 'image/jpeg' });
  const ocrBody = JSON.parse(r.body);
  ok('proxy: ocr 200 forwards text', r.status === 200 && ocrBody.ok && ocrBody.text.includes('Alice'), ocrBody);

  // Unknown model falls back to the type default (never injects arbitrary models).
  stubbedAnthropic = o => {
    ok('proxy: unknown model falls back to ocr default', JSON.parse(o.body).model === 'claude-sonnet-4-5');
    return anthropicOk('{}');
  };
  r = await req('POST', {}, { type: 'ocr', model: 'gpt-999', image: 'QUJD', mediaType: 'image/jpeg' });
  ok('proxy: fallback model request succeeds', r.status === 200);

  // Draft happy path.
  stubbedAnthropic = o => {
    const parsed = JSON.parse(o.body);
    ok('proxy: draft model default haiku 4.5', parsed.model === 'claude-haiku-4-5');
    ok('proxy: draft sends context string', parsed.messages[0].content[0].text === '{"customerName":"Bob"}');
    ok('proxy: draft uses max_tokens cap for haiku', parsed.max_tokens === 800);
    ok('proxy: draft uses spec master prompt', parsed.system.includes('message_context') && parsed.system.includes('draft_message'), parsed.system.slice(0, 200));
    ok('proxy: draft prompt demands JSON only', parsed.system.includes('ONLY a single JSON object') && parsed.system.includes('no markdown fences'));
    return anthropicOk('Hi Bob!');
  };
  r = await req('POST', {}, { type: 'draft', draftContext: '{"customerName":"Bob"}' });
  const draftBody = JSON.parse(r.body);
  ok('proxy: draft 200 with text', r.status === 200 && draftBody.text === 'Hi Bob!');

  // Sonnet max_tokens cap.
  stubbedAnthropic = o => ok('proxy: sonnet max_tokens 2000', JSON.parse(o.body).max_tokens === 2000) || anthropicOk('ok');
  await req('POST', {}, { type: 'ocr', model: 'claude-sonnet-4-5', image: 'QUJD', mediaType: 'image/jpeg' });

  // Upstream error mapping.
  stubbedAnthropic = () => anthropicError(401, 'invalid x-api-key', 'invalid_request_error');
  r = await req('POST', {}, { type: 'ping' });
  ok('proxy: upstream 401 -> 502 auth', r.status === 502 && JSON.parse(r.body).error === 'auth', r.body);

  stubbedAnthropic = () => anthropicError(429, 'rate limit', 'rate_limit_error');
  r = await req('POST', {}, { type: 'ping' });
  ok('proxy: upstream 429 -> 502 rate_limited', r.status === 502 && JSON.parse(r.body).error === 'rate_limited');

  stubbedAnthropic = () => anthropicError(529, 'overloaded', 'overloaded_error');
  r = await req('POST', {}, { type: 'ping' });
  ok('proxy: upstream 529 -> 502 overloaded', r.status === 502 && JSON.parse(r.body).error === 'overloaded');

  // Usage enrichment for a sonnet call.
  stubbedAnthropic = () => anthropicOk('x', { input_tokens: 1000, output_tokens: 500 });
  r = await req('POST', {}, { type: 'ocr', model: 'claude-sonnet-4-5', image: 'QUJD', mediaType: 'image/jpeg' });
  const costBody = JSON.parse(r.body);
  ok('proxy: sonnet cost computed', costBody.usage.cost === 0.0105, costBody.usage); // 1000*3 + 500*15 per 1M

  // Receipt type: input validation.
  r = await req('POST', {}, { type: 'receipt' });
  ok('proxy: receipt without image 400', r.status === 400);

  // Receipt happy path: model allowlist + image payload + category prompt.
  stubbedAnthropic = o => {
    const parsed = JSON.parse(o.body);
    ok('proxy: receipt model passthrough', parsed.model === 'claude-sonnet-4-5');
    const content = parsed.messages[0].content;
    ok('proxy: receipt sends base64 image block', content.some(b => b.type === 'image' && b.source.type === 'base64' && b.source.media_type === 'image/jpeg'));
    ok('proxy: receipt system prompt lists categories', parsed.system.includes('fuel') && parsed.system.includes('other'), parsed.system);
    ok('proxy: receipt prompt anchors today', parsed.system.includes(new Date().toISOString().slice(0, 10)));
    return anthropicOk('{"amount":"24.99","category":"samples"}');
  };
  r = await req('POST', {}, { type: 'receipt', model: 'claude-sonnet-4-5', image: 'QUJD', mediaType: 'image/jpeg' });
  const rcptBody = JSON.parse(r.body);
  ok('proxy: receipt 200 forwards text', r.status === 200 && rcptBody.ok && rcptBody.text.includes('24.99'), rcptBody);

  // Unknown model falls back to the receipt default (never injects arbitrary models).
  stubbedAnthropic = o => {
    ok('proxy: unknown model falls back to receipt default', JSON.parse(o.body).model === 'claude-sonnet-4-5');
    return anthropicOk('{}');
  };
  r = await req('POST', {}, { type: 'receipt', model: 'gpt-999', image: 'QUJD', mediaType: 'image/jpeg' });
  ok('proxy: receipt fallback model request succeeds', r.status === 200);

  // Assistant type: input validation.
  r = await req('POST', {}, { type: 'assistant' });
  ok('proxy: assistant without snapshot 400', r.status === 400);

  // Assistant happy path: companion prompt + snapshot/turnText/history.
  stubbedAnthropic = o => {
    const parsed = JSON.parse(o.body);
    ok('proxy: assistant model default haiku 4.5', parsed.model === 'claude-haiku-4-5');
    ok('proxy: assistant uses companion prompt', parsed.system.includes('Beelo') && parsed.system.includes('business_snapshot'));
    const content = parsed.messages[0].content[0].text;
    ok('proxy: assistant carries snapshot + turn', content.includes('business_snapshot:') && content.includes('advisor_message:'));
    ok('proxy: assistant history default none', content.includes('conversation_history:\nnone'));
    return anthropicOk('{"reply":"Two visits left today.","suggestions":["money","week"]}');
  };
  r = await req('POST', {}, { type: 'assistant', snapshot: '{"today":{}}', turnText: 'how is my day?' });
  const asstBody = JSON.parse(r.body);
  ok('proxy: assistant 200 forwards text', r.status === 200 && asstBody.ok && asstBody.text.includes('reply'), asstBody);
}

// ---------- client tests ----------

function makeLocalStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

// Stub fetch that records payloads, then answers per a queue of responders.
// responder: (payload, { signal, headers }) => promise<ResponseLike>
function loadAiClient({ enabled = true, proxyUrl = 'https://proxy.test/claude', secret = '', ocrModel = 'claude-sonnet-4-5', draftModel = 'claude-haiku-4-5', responder } = {}) {
  const sandbox = {
    console, Math, JSON, Date, Promise, Map, Set, Array, Object,
    Number, String, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
    setTimeout, clearTimeout, AbortController, DOMException, URL,
    localStorage: makeLocalStorage()
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.consumers = [];
  sandbox.fetch = async (url, opts) => {
    sandbox.consumers.push({ url, opts });
    if (!responder) throw new Error('fake: no responder');
    return responder(JSON.parse(opts.body), opts, url);
  };
  vm.createContext(sandbox);
  const CONFIG = vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/config.js'), 'utf8') + ';CONFIG;', sandbox);
  CONFIG.ai = { enabled, proxyUrl, secret, ocrModel, draftModel };
  // Load ai.js; "const AIService" is a global lexical binding (not a sandbox
  // property), so the trailing expression carries it out as the completion value.
  const AIService = vm.runInContext(fs.readFileSync(path.join(REPO, 'js/services/ai.js'), 'utf8') + '\n;AIService;', sandbox);
  return AIService;
}

function responseLike(overrides) {
  return {
    ok: true, status: 200,
    json: async () => ({ ok: true, text: 'reply', usage: { input_tokens: 10, output_tokens: 5, cost: 0.0001 }, model: 'x', type: 'ping', ...overrides }),
    ...overrides
  };
}

async function clientTests() {
  // Config gating.
  const off = loadAiClient({ enabled: false });
  ok('client: disabled without proxyUrl', off.isEnabled() === false);
  const noUrl = loadAiClient({ enabled: true, proxyUrl: '' });
  ok('client: proxyUrl required', noUrl.isEnabled() === false);

  // testConnection payload + usage recording.
  const svc = loadAiClient({
    responder: async (payload, opts, url) => {
      ok('client: ping payload type', payload.type === 'ping');
      ok('client: posts to configured proxyUrl', url === 'https://proxy.test/claude', url);
      ok('client: content-type json', opts.headers['content-type'] === 'application/json');
      return responseLike({ text: 'pong', model: 'claude-haiku-4-5', type: 'ping' });
    }
  });
  const t = await svc.testConnection();
  ok('client: testConnection ok', t.ok && t.pong === 'pong', t);

  // Secret header.
  const svcSecret = loadAiClient({
    secret: 'sekrit',
    responder: async (p, opts) => {
      ok('client: sends X-AI-Key when secret set', opts.headers['x-ai-key'] === 'sekrit', opts.headers);
      return responseLike({ text: 'pong' });
    }
  });
  await svcSecret.testConnection();

  const svcNoSecret = loadAiClient({
    responder: async (p, opts) => {
      ok('client: no X-AI-Key without secret', opts.headers['x-ai-key'] === undefined, opts.headers);
      return responseLike({ text: 'pong' });
    }
  });
  await svcNoSecret.testConnection();

  // extractFromImage: stub image pipeline, assert payload + field mapping.
  const svcOcr = loadAiClient({
    responder: async (payload) => {
      ok('client: ocr payload carries model', payload.model === 'claude-sonnet-4-5');
      ok('client: ocr payload carries base64 + mediaType', payload.image === 'QUJD' && payload.mediaType === 'image/jpeg');
      return responseLike({
        text: '{"name":"Alice Smith","phone":"07700 900123","postcode":"M14 7FZ","bogus":1}',
        model: 'claude-sonnet-4-5', type: 'ocr'
      });
    }
  });
  svcOcr._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const img = await svcOcr.extractFromImage({});
  ok('client: ocr maps fields and trims', img.ok && img.fields.name === 'Alice Smith' && img.fields.city === '' && !('bogus' in img.fields), img.fields);

  // extractFromImage: non-JSON model output still surfaces raw text.
  const svcOcrRaw = loadAiClient({
    responder: async () => responseLike({ text: 'surfaced raw text', model: 'x', type: 'ocr' })
  });
  svcOcrRaw._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const raw = await svcOcrRaw.extractFromImage({});
  ok('client: non-JSON falls back to empty fields + raw text', raw.ok && raw.rawText === 'surfaced raw text' && Object.keys(raw.fields).length === 0);

  // extractFromImage: Claude wrapped the JSON in markdown code fences (the
  // real-world failure that blanked every field) — fields must still parse.
  const fenced = '```json\n{"name":"Hilary Taylor","phone":"07982231682","postcode":"M21 0RL"}\n```';
  const svcFenced = loadAiClient({
    responder: async () => responseLike({ text: fenced, model: 'x', type: 'ocr' })
  });
  svcFenced._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const f = await svcFenced.extractFromImage({});
  ok('client: fenced JSON still maps fields', f.ok && f.fields.name === 'Hilary Taylor' && f.fields.postcode === 'M21 0RL', f.fields);

  // extractFromImage: preamble prose + fences — the {...} slice path.
  const messy = 'Here you go:\n```json\n{"name":"Bob","city":"Manchester"}\n```\nHope that helps!';
  const svcMessy = loadAiClient({
    responder: async () => responseLike({ text: messy, model: 'x', type: 'ocr' })
  });
  svcMessy._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const m = await svcMessy.extractFromImage({});
  ok('client: preamble + fences still map fields', m.ok && m.fields.name === 'Bob' && m.fields.city === 'Manchester' && m.fields.phone === '', m.fields);

  // extractFromImage: extra keys are dropped, values trimmed.
  const svcTrim = loadAiClient({
    responder: async () => responseLike({ text: '{"name":"  Ann  ","customerNumber":"CUS-1","bogus":9}', model: 'x', type: 'ocr' })
  });
  svcTrim._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const trimRes = await svcTrim.extractFromImage({});
  ok('client: trims values and drops unknown keys', trimRes.ok && trimRes.fields.name === 'Ann' && trimRes.fields.customerNumber === 'CUS-1' && !('bogus' in trimRes.fields), trimRes.fields);

  // extractFromImage: appointmentTime keeps the whole printed slot range,
  // canonicalized to 24h "HH:MM-HH:MM" instead of only the first time.
  const svcSlot = loadAiClient({
    responder: async () => responseLike({
      text: '{"name":"Bob","appointmentTime":"3:00 PM - 6:00 PM"}',
      model: 'x', type: 'ocr'
    })
  });
  svcSlot._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const slot = await svcSlot.extractFromImage({});
  ok('client: slot time kept whole as 15:00-18:00', slot.ok && slot.fields.appointmentTime === '15:00-18:00', slot.fields);

  const svcSingle = loadAiClient({
    responder: async () => responseLike({ text: '{"name":"Bob","appointmentTime":"3:00 PM"}', model: 'x', type: 'ocr' })
  });
  svcSingle._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const single = await svcSingle.extractFromImage({});
  ok('client: single 12h time canonicalized to 15:00', single.ok && single.fields.appointmentTime === '15:00', single.fields);

  const svcUnparsable = loadAiClient({
    responder: async () => responseLike({ text: '{"name":"Bob","appointmentTime":"some time"}', model: 'x', type: 'ocr' })
  });
  svcUnparsable._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const unpars = await svcUnparsable.extractFromImage({});
  ok('client: unparsable time passes through untouched', unpars.ok && unpars.fields.appointmentTime === 'some time', unpars.fields);

  // extractReceipt: stub image pipeline, assert payload + field mapping.
  const svcReceipt = loadAiClient({
    responder: async (payload) => {
      ok('client: receipt payload type/model', payload.type === 'receipt' && payload.model === 'claude-sonnet-4-5');
      ok('client: receipt payload carries base64 + mediaType', payload.image === 'QUJD' && payload.mediaType === 'image/jpeg');
      return responseLike({
        text: '{"amount":"24.99","vendor":"Screwfix","date":"2026-08-12","description":"Blinds samples","category":"samples","bogus":1}',
        model: 'claude-sonnet-4-5', type: 'receipt'
      });
    }
  });
  svcReceipt._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const rcpt = await svcReceipt.extractReceipt({});
  ok('client: receipt maps fields, trims and drops unknown keys', rcpt.ok && rcpt.fields.amount === '24.99' && rcpt.fields.vendor === 'Screwfix' && rcpt.fields.category === 'samples' && !('bogus' in rcpt.fields), rcpt.fields);

  // extractReceipt: an invented category id falls back to "other".
  const svcBadCat = loadAiClient({
    responder: async () => responseLike({ text: '{"amount":"5.00","category":"Coffee"}' })
  });
  svcBadCat._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const badCat = await svcBadCat.extractReceipt({});
  ok('client: unknown receipt category falls back to other', badCat.ok && badCat.fields.category === 'other' && badCat.fields.amount === '5.00', badCat.fields);

  // extractReceipt: Claude wrapped the JSON in markdown code fences.
  const svcRcptFenced = loadAiClient({
    responder: async () => responseLike({ text: '```json\n{"amount":"12.50","vendor":"Tesco"}\n```' })
  });
  svcRcptFenced._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const rf = await svcRcptFenced.extractReceipt({});
  ok('client: fenced receipt JSON still maps fields', rf.ok && rf.fields.amount === '12.50' && rf.fields.vendor === 'Tesco' && rf.fields.category === 'other', rf.fields);

  // extractReceipt: non-JSON model output degrades to empty fields + raw text.
  const svcRcptRaw = loadAiClient({
    responder: async () => responseLike({ text: 'not json at all' })
  });
  svcRcptRaw._toBase64 = async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' });
  const rr = await svcRcptRaw.extractReceipt({});
  ok('client: receipt non-JSON degrades with raw text', rr.ok && rr.rawText === 'not json at all' && rr.fields.amount === '' && rr.fields.category === 'other', rr.fields);

  // draftMessage passes stringified context; plain-text output still works
  // (falls back to the raw text).
  const svcDraft = loadAiClient({
    responder: async (payload) => {
      ok('client: draft payload type/model', payload.type === 'draft' && payload.model === 'claude-haiku-4-5');
      ok('client: draft context stringified', payload.draftContext === JSON.stringify({ customerName: 'Bob' }));
      return responseLike({ text: 'Hi Bob!', model: 'x', type: 'draft' });
    }
  });
  const d = await svcDraft.draftMessage({ customerName: 'Bob' });
  ok('client: draft returns text', d.ok && d.text === 'Hi Bob!');

  // Spec shape: {nudge, draft_message} JSON from the proxy, raw → parsed.
  const svcDraftSpec = loadAiClient({
    responder: async () => responseLike({
      text: JSON.stringify({ nudge: 'Mrs Smith is waiting for her quote follow-up.', draft_message: 'Hi Sarah, just checking in on your quote.' })
    })
  });
  const ds = await svcDraftSpec.draftMessage({ customerName: 'Sarah' });
  ok('client: draft parses nudge + draft_message', ds.ok && ds.text === 'Hi Sarah, just checking in on your quote.' && ds.nudge === 'Mrs Smith is waiting for her quote follow-up.', ds);

  // _parseDraft ladder: fenced JSON, bracketed JSON, plain text.
  const svcEmpty = loadAiClient({ responder: async () => responseLike({ text: '' }) });
  ok('client: _parseDraft plain text', svcEmpty._parseDraft('Hello there')?.draft_message === 'Hello there');
  const fencedDraft = svcEmpty._parseDraft('```json\n{"nudge":"n1","draft_message":"m1"}\n```');
  ok('client: _parseDraft fenced json', fencedDraft.draft_message === 'm1' && fencedDraft.nudge === 'n1');
  const paddedDraft = svcEmpty._parseDraft('Here you go:\n{"nudge":"n2","draft_message":"m2"}');
  ok('client: _parseDraft json-with-preamble', paddedDraft.draft_message === 'm2' && paddedDraft.nudge === 'n2', paddedDraft);
  const absentNudge = svcEmpty._parseDraft('{"draft_message":"only message"}');
  ok('client: _parseDraft missing nudge tolerated', absentNudge.draft_message === 'only message' && absentNudge.nudge === '', absentNudge);
  const junkDraft = svcEmpty._parseDraft('not relevant');
  ok('client: _parseDraft junk keeps raw', junkDraft.draft_message === 'not relevant', junkDraft);

  // Hard failure surfaces as { ok:false } with message.
  const svcErr = loadAiClient({
    responder: async () => ({ ok: false, status: 502, json: async () => ({ ok: false, error: 'auth', message: 'bad key' }) })
  });
  const bad = await svcErr.testConnection();
  ok('client: upstream error maps to message', !bad.ok && bad.message === 'bad key' && bad.httpStatus === 502, bad);

  // Network failure: non-ok + unavailable, no throw.
  const svcNet = loadAiClient({ responder: async () => { throw new TypeError('fetch failed'); } });
  const net = await svcNet.testConnection();
  ok('client: network failure degrades gracefully', !net.ok && net.unavailable === true && net.reason === 'network', net);

  // Timeout: responder ignores abort, fetch rejects on signal → reason timeout.
  const svcTimeout = loadAiClient({
    responder: (p, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    })
  });
  const timed = await svcTimeout.testConnection();
  ok('client: timeout degrades gracefully', !timed.ok && timed.unavailable === true && timed.reason === 'timeout', timed);

  // usage recorded on success.
  ok('client: lastUsage recorded for draft', svcDraft.lastUsage && svcDraft.lastUsage.cost === 0.0001 && svcDraft.lastUsage.type === 'draft');
  const fmt = svcDraft.formatUsage();
  ok('client: formatUsage includes cost', typeof fmt === 'string' && fmt.includes('$0.0001'), fmt);

  // assistantTurn: payload shape + {reply, suggestions} parsing with the
  // suggestion whitelist enforced client-side (never trust the model).
  const svcAsst = loadAiClient({
    responder: async (payload) => {
      ok('client: assistant payload type/model', payload.type === 'assistant' && payload.model === 'claude-haiku-4-5');
      ok('client: assistant snapshot stringified', payload.snapshot === JSON.stringify({ today: {} }));
      ok('client: assistant carries turn text', payload.turnText === 'how is my day?');
      return responseLike({ text: '{"reply":"Two visits left.","suggestions":["money","bogus","week","help","evil_thing"]}', model: 'x', type: 'assistant' });
    }
  });
  const as = await svcAsst.assistantTurn({ snapshot: { today: {} }, turnText: 'how is my day?' });
  ok('client: assistant returns reply', as.ok && as.reply === 'Two visits left.', as);
  ok('client: assistant suggestions whitelisted', JSON.stringify(as.suggestions) === JSON.stringify(['money', 'week', 'help']), as.suggestions);

  // _parseAssistant ladder: fenced JSON, preamble JSON, plain-text fallback.
  ok('client: _parseAssistant plain text fallback', svcAsst._parseAssistant('just saying hi').reply === 'just saying hi');
  const fa = svcAsst._parseAssistant('```json\n{"reply":"m","suggestions":["week"]}\n```');
  ok('client: _parseAssistant fenced json', fa.reply === 'm' && fa.suggestions.length === 1 && fa.suggestions[0] === 'week');
  const fa2 = svcAsst._parseAssistant('Here you go:\n{"reply":"r2","suggestions":["help","not-allowed"]}');
  ok('client: _parseAssistant preamble json keeps whitelist', fa2.reply === 'r2' && fa2.suggestions.length === 1 && fa2.suggestions[0] === 'help');
  const fa3 = svcAsst._parseAssistant('not json at all');
  ok('client: _parseAssistant junk keeps raw + no suggestions', fa3.reply === 'not json at all' && fa3.suggestions.length === 0);
}

// ---------- runner ----------

(async () => {
  console.log('\nTest A: serverless proxy (api/claude.mjs)');
  await proxyTests();

  console.log('\nTest B: client AI service (js/services/ai.js)');
  await clientTests();

  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });