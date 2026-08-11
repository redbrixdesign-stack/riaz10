/* ============================================================
   AdvisorOS — Claude AI proxy (Vercel function)

   Holds ANTHROPIC_API_KEY and relays the PWA's AI requests to
   api.anthropic.com — the Anthropic API cannot be called from a
   browser (no CORS), so this thin function is the only bridge.

   Environment variables:
     ANTHROPIC_API_KEY  required
     AI_SECRET          optional; if set, the app must send it in
                        the X-AI-Key header (keeps strangers from
                        burning your quota via the public URL)
     ALLOWED_ORIGIN     optional; if set, blocks requests whose
                        Origin header isn't this exact value

   NOTE: netlify/functions/claude.mjs is the same logic for
   Netlify — keep the two files in sync.
   ============================================================ */

const ALLOWED_MODELS = [
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-haiku-latest'
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const SYSTEM_PROMPTS = {
  ocr: `You extract structured details from photos of order screenshots and business cards taken by a UK window coverings field sales advisor.
Return ONLY a JSON object with exactly these keys, using empty strings when a field is not present in the image:
{"name","phone","address","town","city","postcode","customerNumber","email","appointmentDate","appointmentTime"}
- name: the customer's full name.
- phone: the full UK phone number as shown (spaces are fine).
- address: house number and street only.
- town, city: as they appear on the document.
- postcode: the UK postcode, uppercase.
- customerNumber: any customer/order reference (e.g. "CUS-2026-0001").
- email: if present.
- appointmentDate / appointmentTime: any booking, delivery or appointment date (ISO) and time shown.
The photo may include a Google map with road labels, place names and buttons — only extract text that belongs to the order/customer details, never the map.
Return only the raw JSON object — never wrap it in markdown code fences, never add preamble or any other text.`,

  draft: `You write short, friendly, professional SMS/WhatsApp messages for a self-employed UK window coverings (blinds/curtains) field sales advisor.
The user sends the customer and visit context as JSON. Write one warm, natural, personal message that fits the template goal and the sales context.
Use the customer's first name (the "firstName" field) — never their title or surname, and never address them as "Ms"/"Mr". Keep it under 60 words unless the context requires more. Never invent facts that are not in the context.
Do not use markdown, emojis, or quotation marks around the message. Return ONLY the message text.

Booking confirmations (templateKey starts with "confirmation." or is "day_before" or "morning_of"): structure the message in this order —
1. Introduce yourself by name (use advisorIntro, e.g. "Hi Hilary, this is Riaz from RedBrix" or just the name when there's no company).
2. Confirm the visit: the day of week and full date from appointmentDay, and the time slot from appointmentTime.
3. Ask how many windows they're interested in and whether they have any specific blinds in mind.
4. Ask about parking considerations or anything else they should know before you arrive.
End with a friendly sign-off line and the advisor's name.`,

  ping: `Reply with exactly the word "pong" and nothing else.`
};

const DEFAULT_MODELS = { ocr: 'claude-sonnet-4-5', draft: 'claude-haiku-4-5' };

// USD per 1M tokens, { input, output } — used to report an estimated
// cost per call back to the app's Settings screen. Keep in sync with
// current Anthropic pricing when models change.
const RATES = {
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-5': { in: 3.0, out: 15.0 },
  'claude-3-7-sonnet-latest': { in: 3.0, out: 15.0 },
  'claude-3-5-haiku-latest': { in: 0.8, out: 4.0 }
};

function enrichUsage(usage, model) {
  const u = usage || { input_tokens: 0, output_tokens: 0 };
  const rates = RATES[model] || { in: 0, out: 0 };
  const cost = (u.input_tokens / 1e6) * rates.in + (u.output_tokens / 1e6) * rates.out;
  return { ...u, cost: Math.round(cost * 1e6) / 1e6 };
}

function json(status, payload, headers = {}) {
  return { status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) };
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-ai-key',
    'access-control-max-age': '86400'
  };
}

function allowOrigin() {
  return process.env.ALLOWED_ORIGIN || '*';
}

async function callAnthropic(model, system, userContent) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: model.startsWith('claude-sonnet') ? 2000 : 800,
      system,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!res.ok) {
    let detail = 'unknown';
    try { detail = (await res.json()).error?.message || res.statusText; } catch (e) { /* keep statusText */ }
    let code = 'proxy';
    if (res.status === 401 || res.status === 403) code = 'auth';
    else if (res.status === 429) code = 'rate_limited';
    else if (res.status === 529) code = 'overloaded';
    else if (res.status >= 500) code = 'upstream';
    throw Object.assign(new Error(`${code}: ${detail}`), { code });
  }

  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { text, usage: data.usage || null };
}

// Shared entry: request = { method, headers, body } (already-parsed body).
// Returns { status, headers, body }.
export async function handle(request) {
  const origin = typeof request.headers?.origin === 'string' ? request.headers.origin : null;
  const allowed = allowOrigin();

  if (request.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders(origin), body: '' };
  }

  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method', message: 'POST only' }, corsHeaders(origin));
  }

  // Optional shared secret guard.
  const secret = process.env.AI_SECRET;
  if (secret && request.headers?.['x-ai-key'] !== secret) {
    return json(403, { ok: false, error: 'forbidden', message: 'Bad or missing X-AI-Key header' }, corsHeaders(origin));
  }

  // Optional origin allow-list.
  if (allowed !== '*' && (!origin || origin !== allowed)) {
    return json(403, { ok: false, error: 'origin', message: 'Origin not allowed' }, corsHeaders(origin));
  }

  const body = request.body || {};
  const type = body.type;

  if (type === 'ping') {
    try {
      const { text, usage } = await callAnthropic('claude-haiku-4-5', SYSTEM_PROMPTS.ping, [{ type: 'text', text: 'ping' }]);
      return json(200, { ok: true, text, usage: enrichUsage(usage, 'claude-haiku-4-5'), model: 'claude-haiku-4-5', type }, corsHeaders(origin));
    } catch (err) {
      return json(502, { ok: false, error: err.code || 'proxy', message: err.message }, corsHeaders(origin));
    }
  }

  if (type !== 'ocr' && type !== 'draft') {
    return json(400, { ok: false, error: 'bad_request', message: 'type must be ocr, draft or ping' }, corsHeaders(origin));
  }

  const model = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODELS[type];

  let userContent;
  if (type === 'ocr') {
    if (typeof body.image !== 'string' || typeof body.mediaType !== 'string') {
      return json(400, { ok: false, error: 'bad_request', message: 'ocr requires image (base64) and mediaType' }, corsHeaders(origin));
    }
    const bytes = Math.ceil((body.image.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) {
      return json(413, { ok: false, error: 'too_large', message: `Image too large (${Math.round(bytes / 1024)} KB > ${MAX_IMAGE_BYTES / 1024} KB)` }, corsHeaders(origin));
    }
    userContent = [
      { type: 'text', text: body.instructions || 'Extract the details from this photo.' },
      { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.image } }
    ];
  } else {
    if (typeof body.draftContext !== 'string' || !body.draftContext.trim()) {
      return json(400, { ok: false, error: 'bad_request', message: 'draft requires draftContext' }, corsHeaders(origin));
    }
    userContent = [{ type: 'text', text: body.draftContext }];
  }

  try {
    const { text, usage } = await callAnthropic(model, SYSTEM_PROMPTS[type], userContent);
    return json(200, { ok: true, text, usage: enrichUsage(usage, model), model, type }, corsHeaders(origin));
  } catch (err) {
    return json(502, { ok: false, error: err.code || 'proxy', message: err.message }, corsHeaders(origin));
  }
}

// Vercel entry.
export default async function vercelHandler(req, res) {
  const result = await handle({ method: req.method, headers: req.headers, body: req.body || {} });
  res.status(result.status);
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  res.send(result.body);
}
