/* ============================================================
   AdvisorOS — Claude AI proxy (Vercel function)

   Holds ANTHROPIC_API_KEY and relays the PWA's AI requests to
   api.anthropic.com — the Anthropic API cannot be called from a
   browser (no CORS), so this thin function is the only bridge.

   Environment variables:
     ANTHROPIC_API_KEY  required — the Anthropic API key. Never exposed
                        to the browser; only this function holds it.
     ALLOWED_ORIGIN     REQUIRED in production (NODE_ENV=production, as
                        Vercel sets): the proxy fails closed with a 500
                        config error until it's set. When set, only
                        requests with this exact Origin header are
                        accepted. Optional in dev; when unset the proxy
                        is open ("*") and logs a one-time warning.
     AI_SECRET          REQUIRED in production; optional in dev. When
                        set, requests must send it in the X-AI-Key
                        header. NOTE: the secret lives inside the PWA
                        bundle, so anyone visiting the page can read
                        it — it is a shared gate that stops random
                        scripts burning quota, NOT true authentication.
                        Real protection = ALLOWED_ORIGIN + rate limits.
     RATE_LIMIT_MAX     optional; max requests per window per client
                        address. Default 120.
     RATE_LIMIT_WINDOW_MS  optional; sliding-window length in ms.
                        Default 60000.
     NODE_ENV           Vercel sets 'production'. Dev mode (unset) keeps
                        ALLOWED_ORIGIN/AI_SECRET optional for easy
                        local testing; everything else below is enforced
                        in BOTH modes.

   Hardening (enforced regardless of mode):
     - request body capped at 4 MB; every client-supplied text field
       capped at 100 KB
     - images capped at 2 MB decoded, plus a media-type allowlist
     - model allowlist: unknown models fall back to the type default,
       never pass through
     - upstream calls only ever go to the fixed allowlisted endpoint
     - in-memory sliding-window rate limiting per client address
       (per-function-instance state: multi-instance or high-traffic
       deployments need a shared store, e.g. Redis)

   Logging policy: this function never logs request bodies, customer
   data, prompts or API keys, and provider error details never leave
   it — clients only ever receive generic error messages.
   ============================================================ */

const ALLOWED_MODELS = [
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-haiku-latest'
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 4 * 1024 * 1024; // whole JSON payload (2 MB image base64 + slack)
const MAX_TEXT_CHARS = 100 * 1024; // any single client-supplied text field
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// The ONLY upstream endpoint this function may ever call — client input can
// never influence it.
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

// In-memory sliding-window rate limit keyed by client address. State is per
// function instance: fine for a single serverless instance; add a shared
// store (Redis) before running multiple instances under load.
const RATE_LIMIT_MAX_DEFAULT = 120;
const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
const rateBuckets = new Map();

// Upstream calls that hang (provider outage, dead connection) must not pin
// the proxy open forever: each call gets this budget, then aborts. Env-tunable
// so tests can shorten it.
const ANTHROPIC_TIMEOUT_MS_DEFAULT = 60_000;

// Generic client-facing messages for upstream failures: the provider's own
// error text can contain internal details, so it never crosses the wire.
const UPSTREAM_MESSAGES = {
  auth: 'AI provider rejected the request — check the proxy ANTHROPIC_API_KEY',
  rate_limited: 'AI provider is rate-limiting requests — try again shortly',
  overloaded: 'AI provider is overloaded — try again shortly',
  upstream: 'AI provider returned an error — try again shortly',
  timeout: 'AI provider took too long to respond — try again shortly',
  proxy: 'AI request failed — try again shortly'
};
function upstreamMessage(code) {
  return UPSTREAM_MESSAGES[code] || UPSTREAM_MESSAGES.proxy;
}

// Upstream failures are mapped to the client as generic, non-leaking JSON.
// Timeouts get their own status so callers can distinguish "slow provider"
// from "provider error".
function upstreamErrorResponse(err, origin) {
  const code = err?.code || 'proxy';
  return json(code === 'timeout' ? 504 : 502, { ok: false, error: code, message: upstreamMessage(code) }, corsHeaders(origin));
}

// The OCR prompt is generated per request so the model knows today's real
// date. Without that anchor, a document that doesn't print a year gets one
// guessed from the model's training data — a stale year, and the visit
// silently books in the past and vanishes from Home/Diary.
function ocrSystemPrompt(today) {
  return `You extract structured details from photos of order screenshots and business cards taken by a UK window coverings field sales advisor.
Today's real date is ${today} — use this, not any date you might otherwise assume, whenever you need to resolve a year that isn't printed on the document.
Return ONLY a JSON object with exactly these keys, using empty strings when a field is not present in the image:
{"name","phone","address","town","city","postcode","customerNumber","email","appointmentDate","appointmentTime"}
- name: the customer's full name.
- phone: the full UK phone number as shown (spaces are fine).
- address: house number and street only.
- town, city: as they appear on the document.
- postcode: the UK postcode, uppercase.
- customerNumber: any customer/order reference (e.g. "CUS-2026-0001").
- email: if present.
- appointmentDate / appointmentTime: the REAL booking, delivery or appointment date (ISO, YYYY-MM-DD) and time shown. Screens often also display a phone status-bar clock/date or "previous appointment"/"last visit" history dates — never use those. Prefer the date on the line that mentions appointment/arriving. If a date has no year printed, infer the year using today's real date above (${today}) as the reference point — not any other year. If the text gives a weekday, it must match the date's actual weekday; if not, treat it as a history or noise date.
- appointmentTime may be a RANGE: when the screen shows a slot like "3:00 PM - 6:00 PM" or "09:00-12:00", return the FULL range as 24h "HH:MM-HH:MM" (e.g. "15:00-18:00") — never just the first time. When only a single time is printed, return it as 24h "HH:MM". Never use the phone status-bar clock.
- If the only date in the image looks like history (yesterday, last week, last year), return it anyway — never invent or guess a different date, and never use "today".
The photo may include a Google map with road labels, place names and buttons — only extract text that belongs to the order/customer details, never the map.
Return only the raw JSON object — never wrap it in markdown code fences, never add preamble or any other text.`;
}

// Receipts get their own prompt so a scanned expense photo is turned into
// amount/vendor/date/description plus a category picked from the app's real
// CONFIG.expenseCategories ids — the Money feature drops the result straight
// into its Quick Expense form.
function receiptSystemPrompt(today) {
  const categories = [
    ['fuel', 'Fuel'],
    ['samples', 'Samples'],
    ['tools', 'Tools/Equipment'],
    ['phone', 'Phone/Internet'],
    ['insurance', 'Insurance'],
    ['vehicle', 'Vehicle Costs'],
    ['marketing', 'Marketing'],
    ['training', 'Training'],
    ['other', 'Other']
  ];
  const categoryList = categories.map(([id, name]) => `${id} (${name})`).join(', ');
  return `You extract expense receipt details from a photo taken by a self-employed UK field sales advisor (window coverings).
Today's real date is ${today}.
Return ONLY a JSON object with exactly these keys, using empty strings when a field is not present:
{"amount","vendor","date","description","category"}
- amount: the total paid, as a plain number with no currency symbol (e.g. 24.99). If the receipt shows a total, use that.
- vendor: the business/trade name printed on the receipt.
- date: the receipt's printed date as ISO (YYYY-MM-DD). If the year isn't printed, use today's real date above (${today}) to resolve it. Never invent a date that isn't printed.
- description: a short plain-English summary of what was bought (e.g. "Blinds sample fabric swatches") derived only from the line items. If it's ambiguous, leave it empty.
- category: pick exactly one id from this list — ${categoryList}. Choose the best fit from what was bought; when nothing fits or the items are unclear, use "other".
Return only the raw JSON object — never wrap it in markdown code fences, never add preamble or any other text.`;
}

const SYSTEM_PROMPTS = {
  // Drafted for a UK window coverings (blinds/curtains) sales advisor. The
  // context JSON carries every fact the app knows: quote amount, measured
  // windows, order/deposit figures, days since the visit, prior messages.
  // The number one rule is honesty — never mention money unless the context
  // supplies the figure, never claim the customer said/wants something that
  // isn't in the context, and never mention a live ETA unless "eta"/"delay"
  // are present. Our recorded history is only what WE sent (WhatsApp is
  // opened, not confirmed sent), so refer to "my last message" not "your
  // reply" unless the context says otherwise.
  // Drafted from the Beelo Communication Spec (docs/Communication.md): the
  // context JSON carries the full message_context object the spec defines
  // (stage, first-visit flag, visit count, parking/access notes, window
  // history, outcome, order summary, notes from the last visit). The number
  // one rule is honesty — never mention money unless the context supplies
  // the figure, never claim the customer said/wants something that isn't in
  // the context, and never mention an ETA unless "eta"/"delay" are present.
  // Our recorded history is only what WE sent (WhatsApp is opened, not
  // confirmed sent), so refer to "my last message" not "your reply" unless
  // the context says otherwise.
  draft: `You are Beelo's communication assistant for a self-employed UK window coverings advisor.

Your job:
- Nudge the advisor when a message would be helpful.
- Draft short, professional, personal, context-aware messages for SMS or WhatsApp.
- Respect visit history and stored context.
- Never send messages automatically; your output is a draft only.

You are given a JSON object called message_context:

{message_context_json_here}

Global rules:
1. Use the fields in message_context. Do not ignore stage, previous visit count, parking/access notes, outcome type, or notes from the last visit.
2. If customer_is_first_visit_at_address == true and stage is 'new_booking' or 'pre_intro':
   - Introduce the advisor briefly by name (advisor_name).
   - Explain the appointment type.
   - Ask for parking/access/windows information that is not yet known.
3. If customer_is_first_visit_at_address == false:
   - Do NOT re-introduce the advisor.
   - Do NOT ask generic parking or access questions if parking_notes/access_notes exist.
   - Refer to known parking/access/windows (window_history_summary) and ask only about changes.
4. Adapt the message to the stage:
   - 'new_booking' / 'pre_intro': intro + prep (first visit) or confirmation + change-check (repeat).
   - 'day_before': reminder + check for changes.
   - 'morning_of': short check-in; mention an ETA message will follow.
   - 'on_the_way': on-my-way + ETA (only if "eta" is present).
   - 'late': apology + revised ETA (use delay_reason only if present — never invent one).
   - outcome_*: outcome-specific follow-up (e.g. outcome_ordered → thank-you + confirm order_summary + next steps; outcome_needs_to_think → respectful no-pressure check-in).
   - 'post_fit_followup': thank-you + satisfaction check + review/referral ask.
   - 'service_or_issue_followup': empathetic issue handling + next steps + reassurance.
   - For any stage not listed here (e.g. payment_reminder), follow the intent named by template_key/template_text.
5. Use the customer's first name from customer_name (never the full name/title in the greeting). Keep the message under 60 words unless the context genuinely requires more.
6. Keep it short, polite, human, and personal. No markdown, no emojis, no quotation marks around the message, no "Dear" style greetings.
7. Ask at most 2-3 relevant questions, and only for information not already stored in the context.
8. Always make it easy for the customer to reply ("just reply to this message" style).
9. Do not mention AI, automation, or that the message is a draft.
10. Honesty: never invent facts. Quote amounts/figures only when message_context supplies them. If eta is empty do not claim a time. If recent_messages exists, you may refer to "my last message" — never claim the customer replied or said anything not listed.
11. Return ONLY a single JSON object, no markdown fences, no commentary:
    {
      "nudge": "<short sentence suggesting this message, or empty string>",
      "draft_message": "<the message text>"
    }
    The nudge addresses the advisor, e.g. "You set outcome 'Needs to Think' for Mrs Smith — here's a gentle check-in draft." Use an empty string when no nudge is needed.`,

  // Beelo companion: the advisor talks to the app like a colleague. The
  // snapshot is a compact JSON of REAL database facts (today's visits, week
  // money, month expenses, follow-ups, next visit, weather). The number one
  // rule is honesty — answer only from the snapshot, never invent figures,
  // customers or visits. Output shape mirrors the client's tap-able
  // suggestion chips: exact command keys from the whitelist.
  assistant: `You are Beelo, the personal companion of a self-employed UK window coverings advisor (call them "the advisor"). You are the friendly, knowledgeable voice of their business app — a colleague who always has the numbers ready.

The advisor sent you a question. You receive:
1) business_snapshot — real facts from the app's database (visits, money, follow-ups, next visit, weather).
2) conversation_history — recent turns of this chat session (may be "none").
3) advisor_message — what the advisor just typed.

Rules:
1. Answer ONLY from business_snapshot and conversation_history. Never invent customers, visits, figures or facts. If the advisor asks for something not in the snapshot, say honestly you don't have that detail yet, and tell them what to do (e.g. "log the expense and I'll show it").
2. Reply like a warm, concise colleague. UK English, address the advisor naturally, at most 80 words.
3. No markdown, no emojis, no bullet lists — plain sentences.
4. The advisor is often on the road: keep replies short and scannable.
5. You only inform and suggest. You never send messages, edit data or take actions.
6. Return ONLY a single JSON object, no markdown fences, no commentary:
   {
     "reply": "<your message to the advisor>",
     "suggestions": ["<allowed_command_key>", ...]
   }
7. suggestions: pick 0-3 keys from this exact allowed list ONLY (they become tap-able chips in the app): today, my day, week, money, follow-ups, next visit, log expense, weather, help. Use your judgement for what the advisor would naturally ask next.`,

  ping: `Reply with exactly the word "pong" and nothing else.`,

  route: `You are the intent router for Beelo, the companion of a self-employed UK window coverings advisor.

The advisor typed a question. Your ONLY job is to classify which built-in command answers it — the app then looks up the real data itself; you never see the data and never supply answers.

Valid commands:
- today — "what's on today?", "my day plan"
- week — weekly overview, targets, sales
- money — earnings, expenses, tax, mileage, and ANY money period ("how much in June?", "last week", "this month")
- follow-ups — follow-ups due, quotes, thank-yous, payment reminders
- next visit — the next booked visit
- messages — "what messages are due?", "who to text?", "has the intro been sent?", "send"
- orders — unpaid orders, an order number, "who hasn't paid?"
- log expense — logging or scanning a receipt
- weather — the forecast
- person — a question about a specific CUSTOMER by name ("what about Sarah?", "Mrs Jones booking")
- help — what the companion can do
- greeting — hello/hi/how are you
- default — anything else you genuinely can't map

Rules:
1. Return ONLY a single JSON object, no markdown fences, no commentary:
   {"command": "<one of the commands above>"}
2. When a customer's name appears in the question, choose "person" — never a money command.
3. When money appears with a month or period, choose "money" — the app extracts the period itself.
4. Never invent commands; if unsure, use "default".`
};

const DEFAULT_MODELS = { ocr: 'claude-sonnet-4-5', draft: 'claude-haiku-4-5', receipt: 'claude-sonnet-4-5', assistant: 'claude-haiku-4-5', route: 'claude-haiku-4-5' };

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

// One-time console warning (visible in Vercel's function logs): the proxy
// falls back to "*" when ALLOWED_ORIGIN isn't set, which lets any website
// use the public URL and burn the API quota. Setting ALLOWED_ORIGIN (and/or
// AI_SECRET) is the intended protection — the app never sends the API key,
// only the PWA's own traffic should be able to reach this function.
let warnedAboutDefaults = false;
function warnAboutDefaults() {
  if (warnedAboutDefaults) return;
  warnedAboutDefaults = true;
  console.error('[claude.mjs] ALLOWED_ORIGIN is not set — CORS defaults to "*". Set ALLOWED_ORIGIN to your site\'s origin (and AI_SECRET for a shared-secret guard) so strangers can\'t use this public URL.');
}

function rateLimitKey(headers) {
  const fwd = headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  const rip = headers?.['x-real-ip'];
  if (typeof rip === 'string' && rip.trim()) return rip.trim();
  return 'unknown';
}

function rateLimit(headers) {
  const max = parseInt(process.env.RATE_LIMIT_MAX || String(RATE_LIMIT_MAX_DEFAULT), 10) || RATE_LIMIT_MAX_DEFAULT;
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(RATE_LIMIT_WINDOW_MS_DEFAULT), 10) || RATE_LIMIT_WINDOW_MS_DEFAULT;
  const windowSec = Math.max(1, Math.floor(windowMs / 1000));
  const key = rateLimitKey(headers);
  const now = Math.floor(Date.now() / 1000);
  let bucket = rateBuckets.get(key) || [];
  const cutoff = now - windowSec;
  while (bucket.length && bucket[0] <= cutoff) bucket.shift();
  const limited = bucket.length >= max;
  if (!limited) {
    bucket.push(now);
    rateBuckets.set(key, bucket);
    // Opportunistic sweep so the map can't grow without bound.
    if (rateBuckets.size > 10000) {
      for (const [k, v] of rateBuckets) {
        if (!v.length || v[v.length - 1] <= cutoff) rateBuckets.delete(k);
      }
    }
  }
  return { limited, retryAfter: Math.ceil(windowMs / 1000) };
}

// Production (NODE_ENV=production, as Vercel sets) fails closed until the
// deployment is configured: ALLOWED_ORIGIN and AI_SECRET must both be set.
// Dev mode stays lenient (warnings only) so local testing stays easy.
function productionConfigError() {
  if (process.env.NODE_ENV !== 'production') return null;
  if (!process.env.ALLOWED_ORIGIN) return { error: 'config', message: 'Proxy misconfigured: set ALLOWED_ORIGIN in production' };
  if (!process.env.AI_SECRET) return { error: 'config', message: 'Proxy misconfigured: set AI_SECRET in production' };
  return null;
}

async function callAnthropic(model, system, userContent) {
  const timeoutMs = parseInt(process.env.ANTHROPIC_TIMEOUT_MS || String(ANTHROPIC_TIMEOUT_MS_DEFAULT), 10) || ANTHROPIC_TIMEOUT_MS_DEFAULT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
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
      }),
      signal: controller.signal
    });
  } catch (err) {
    // Aborts map to the client as a distinct "timeout" error; network-level
    // failures stay "proxy". Provider internals are never forwarded either way.
    if (err && err.name === 'AbortError') {
      throw Object.assign(new Error('timeout'), { code: 'timeout' });
    }
    throw Object.assign(new Error('proxy'), { code: 'proxy' });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Only the status code is mapped — the provider's error text may hold
    // internal details and is never forwarded or logged.
    let code = 'proxy';
    if (res.status === 401 || res.status === 403) code = 'auth';
    else if (res.status === 429) code = 'rate_limited';
    else if (res.status === 529) code = 'overloaded';
    else if (res.status >= 500) code = 'upstream';
    throw Object.assign(new Error(code), { code });
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

  // Fail closed on misconfigured production deployments before anything else.
  const configError = productionConfigError();
  if (configError) {
    console.error(`[claude.mjs] ${configError.message}`);
    return json(500, { ok: false, error: configError.error, message: configError.message }, corsHeaders(origin));
  }

  if (!process.env.ALLOWED_ORIGIN || !process.env.AI_SECRET) {
    warnAboutDefaults();
  }

  if (request.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders(origin), body: '' };
  }

  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method', message: 'POST only' }, corsHeaders(origin));
  }

  // Rate limit before the auth/origin checks so abusive clients burn slots,
  // never upstream quota.
  const rl = rateLimit(request.headers);
  if (rl.limited) {
    return json(429, { ok: false, error: 'rate_limited', message: 'Too many requests — try again shortly' },
      { ...corsHeaders(origin), 'retry-after': String(rl.retryAfter) });
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

  // Body size guard: reject oversized payloads before any processing. The
  // Vercel runtime parses JSON bodies; raw-string bodies are also handled.
  let body = request.body ?? {};
  let bodySize;
  if (typeof body === 'string') {
    bodySize = Buffer.byteLength(body, 'utf8');
    try {
      body = JSON.parse(body);
    } catch (e) {
      return json(400, { ok: false, error: 'bad_request', message: 'Request body must be valid JSON' }, corsHeaders(origin));
    }
  } else {
    bodySize = Buffer.byteLength(JSON.stringify(body), 'utf8');
  }
  if (bodySize > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'too_large', message: 'Request body too large' }, corsHeaders(origin));
  }

  const type = body.type;

  if (type === 'ping') {
    try {
      const { text, usage } = await callAnthropic('claude-haiku-4-5', SYSTEM_PROMPTS.ping, [{ type: 'text', text: 'ping' }]);
      return json(200, { ok: true, text, usage: enrichUsage(usage, 'claude-haiku-4-5'), model: 'claude-haiku-4-5', type }, corsHeaders(origin));
    } catch (err) {
      return upstreamErrorResponse(err, origin);
    }
  }

  if (type !== 'ocr' && type !== 'draft' && type !== 'receipt' && type !== 'assistant' && type !== 'route') {
    return json(400, { ok: false, error: 'bad_request', message: 'type must be ocr, receipt, draft, assistant, route or ping' }, corsHeaders(origin));
  }

  // Text-field size guard: a bloated context/snapshot would otherwise burn
  // upstream tokens, so any single client-supplied field over the cap is
  // rejected outright.
  for (const field of ['draftContext', 'snapshot', 'turnText', 'history', 'text']) {
    if (typeof body[field] === 'string' && body[field].length > MAX_TEXT_CHARS) {
      return json(413, { ok: false, error: 'too_large', message: 'Text field too large' }, corsHeaders(origin));
    }
  }

  const model = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODELS[type];

  let userContent;
  if (type === 'ocr' || type === 'receipt') {
    if (typeof body.image !== 'string' || typeof body.mediaType !== 'string') {
      return json(400, { ok: false, error: 'bad_request', message: `${type} requires image (base64) and mediaType` }, corsHeaders(origin));
    }
    // Only image types Anthropic accepts for vision go upstream.
    if (!ALLOWED_MEDIA_TYPES.includes(body.mediaType)) {
      return json(400, { ok: false, error: 'bad_request', message: `Unsupported image type (${body.mediaType})` }, corsHeaders(origin));
    }
    // Exact decoded byte count — the old length*3/4 approximation could be
    // dodged by malformed base64 (whitespace, padding tricks).
    const bytes = Buffer.from(body.image, 'base64').length;
    if (bytes > MAX_IMAGE_BYTES) {
      return json(413, { ok: false, error: 'too_large', message: `Image too large (${Math.round(bytes / 1024)} KB > ${MAX_IMAGE_BYTES / 1024} KB)` }, corsHeaders(origin));
    }
    // NOTE: any client-supplied "instructions" text is deliberately NOT
    // honored — text embedded in a scanned document (or sent by a tampered
    // client) could otherwise override the system prompt. The extraction
    // instruction is fixed, so the model only ever follows the fixed prompt.
    userContent = [
      { type: 'text', text: type === 'ocr' ? 'Extract the details from this photo.' : 'Extract the receipt details from this photo.' },
      { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.image } }
    ];
  } else if (type === 'assistant') {
    // The companion is a single-turn call: history, snapshot and the latest
    // message travel inside one text block (the client caps history length).
    if (typeof body.snapshot !== 'string' || !body.snapshot.trim() || typeof body.turnText !== 'string') {
      return json(400, { ok: false, error: 'bad_request', message: 'assistant requires snapshot and turnText' }, corsHeaders(origin));
    }
    userContent = [{
      type: 'text',
      text: `business_snapshot:\n${body.snapshot}\n\nconversation_history:\n${body.history || 'none'}\n\nadvisor_message:\n${body.turnText}`
    }];
  } else if (type === 'route') {
    // The AI router: classify which rule command answers the question. The
    // model NEVER sees real data here — the app runs the actual handler.
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return json(400, { ok: false, error: 'bad_request', message: 'route requires text' }, corsHeaders(origin));
    }
    userContent = [{ type: 'text', text: `advisor_question:\n${body.text}` }];
  } else {
    if (typeof body.draftContext !== 'string' || !body.draftContext.trim()) {
      return json(400, { ok: false, error: 'bad_request', message: 'draft requires draftContext' }, corsHeaders(origin));
    }
    userContent = [{ type: 'text', text: body.draftContext }];
  }

  try {
    const system = type === 'ocr'
      ? ocrSystemPrompt(new Date().toISOString().slice(0, 10))
      : type === 'receipt'
        ? receiptSystemPrompt(new Date().toISOString().slice(0, 10))
        : SYSTEM_PROMPTS[type];
    const { text, usage } = await callAnthropic(model, system, userContent);
    return json(200, { ok: true, text, usage: enrichUsage(usage, model), model, type }, corsHeaders(origin));
  } catch (err) {
    return upstreamErrorResponse(err, origin);
  }
}

// Vercel entry.
export default async function vercelHandler(req, res) {
  const result = await handle({ method: req.method, headers: req.headers, body: req.body || {} });
  res.status(result.status);
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  res.send(result.body);
}
