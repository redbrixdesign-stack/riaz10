/* ============================================
   ADVISOROS — AI BACKEND PROXY
   Holds the Anthropic API key server-side and exposes two endpoints
   for the frontend to call:

     POST /api/ai/parse-document   { imageBase64, mimeType }  -> structured fields
     POST /api/ai/draft-message    { context }                -> drafted message text
     POST /api/ai/assistant-turn   { snapshot, turnText, history } -> { reply, suggestions }

   Why this file exists at all: AdvisorOS is a static, no-backend PWA.
   That's fine for local data, but an Anthropic API key can NEVER live in
   client-side JS — anyone could open devtools and steal it, then run up
   your bill. This proxy is the minimum backend needed to use Claude safely.
   Run it anywhere (a laptop, a $5 VPS, Render, Fly.io, etc.) and point the
   app at its URL.
   ============================================ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in environment (.env). Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.use(cors()); // lock this down to your app's origin before deploying anywhere public
app.use(express.json({ limit: '15mb' })); // photos as base64 need headroom

async function callClaude(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }
  return res.json();
}

function firstText(data) {
  const block = (data.content || []).find(b => b.type === 'text');
  return block ? block.text : '';
}

// Strips ```json fences etc. and parses. Throws if it still isn't valid JSON.
function parseJsonLoose(text) {
  const cleaned = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

/* --------------------------------------------------------------
   1) DOCUMENT PARSING
   Replaces/augments the regex-based Tesseract parsing in ocr.js.
   Send Claude the photo directly (vision) and ask for the same
   field shape OCRFeature.parseText() already produces, so the
   frontend can drop the result straight into the existing form.
-------------------------------------------------------------- */
app.post('/api/ai/parse-document', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'imageBase64 and mimeType are required' });
    }

    const system = `You extract customer/appointment details from a photo of a job screen, order
confirmation, or business card for a UK field sales advisor's app. Respond with ONLY a JSON
object, no markdown fences, no commentary, matching exactly this shape (use "" for anything
not present, never invent data, never guess a value you cannot actually read):
{
  "name": "", "phone": "", "address": "", "town": "", "city": "", "postcode": "",
  "customerNumber": "", "email": "", "appointmentDate": "", "appointmentTime": ""
}
appointmentDate must be ISO (YYYY-MM-DD) if present, and must be the REAL appointment date - never a phone status-bar clock/date or a "previous appointment"/"last visit" history date (screens often show several dates; prefer the line that mentions appointment/arriving). If a weekday is printed, it must match the date's actual weekday. appointmentTime must be 24h HH:MM if present.
Ignore map imagery, UI chrome, logos, and navigation labels - only read the actual customer/order card.`;

    const data = await callClaude({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: 'Extract the fields from this image as JSON.' }
          ]
        }
      ]
    });

    const fields = parseJsonLoose(firstText(data));
    res.json({ fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse document', detail: String(err.message || err) });
  }
});

/* --------------------------------------------------------------
   1b) RECEIPT PARSING
   Same vision approach as parse-document, but for expense receipts:
   returns { amount, vendor, date, description, category } where
   category is one of CONFIG.expenseCategories ids, so money.js can
   drop it straight into the Quick Expense form.
-------------------------------------------------------------- */
app.post('/api/ai/parse-receipt', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'imageBase64 and mimeType are required' });
    }

    const system = `You extract expense receipt details from a photo taken by a self-employed UK field sales
advisor (window coverings). Today's real date is ${new Date().toISOString().slice(0, 10)}.
Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly this shape
(use "" for anything not present, never invent data, never guess a value you cannot actually read):
{
  "amount": "", "vendor": "", "date": "", "description": "", "category": ""
}
amount is the total paid as a plain number with no currency symbol (e.g. 24.99). vendor is the
business/trade name on the receipt. date is the receipt's printed date as ISO (YYYY-MM-DD); if the
year isn't printed, resolve it using today's real date, never invent a date that isn't printed.
description is a short plain-English summary of what was bought derived only from the line items.
category must be exactly one of: fuel (Fuel), samples (Samples), tools (Tools/Equipment), phone
(Phone/Internet), insurance (Insurance), vehicle (Vehicle Costs), marketing (Marketing),
training (Training), other (Other). Choose the best fit from what was bought; when nothing fits,
use "other".`;

    const data = await callClaude({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: 'Extract the receipt details from this image as JSON.' }
          ]
        }
      ]
    });

    const fields = parseJsonLoose(firstText(data));
    res.json({ fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse receipt', detail: String(err.message || err) });
  }
});

/* --------------------------------------------------------------
   2) MESSAGE DRAFTING
   Used by talk.js as an alternative to the static CONFIG.templates
   strings - gives a one-off, context-aware draft the advisor can
   still edit before it goes to WhatsApp (nothing is auto-sent).
-------------------------------------------------------------- */
app.post('/api/ai/draft-message', async (req, res) => {
  try {
    const {
      firstName = 'there',
      advisorName = 'Your Advisor',
      outcome = '',          // e.g. 'quoted', 'thinking', 'customer_no_show'
      productType = 'window coverings',
      appointmentDate = '',
      notes = '',             // any free-text context the advisor wants to include
      tone = 'friendly, professional'
    } = req.body?.context || {};

    const system = `You draft short WhatsApp follow-up messages for a self-employed UK
window coverings advisor (blinds/curtains home-visit trade) using a real customer/visit
context. Keep the message under 60 words, personal and honest: never invent figures the
context doesn't give, never claim the customer replied. No markdown, no emojis, no "Dear"
style greeting. Return ONLY a single JSON object with no surrounding text, fences or
commentary:
{"nudge": "<short suggestion for the advisor, or empty string>",
 "draft_message": "<the message text>"}`;

    const userPrompt = `Advisor name: ${advisorName}
Customer first name: ${firstName}
Situation/outcome: ${outcome || 'general follow-up'}
Product: ${productType}
Appointment date: ${appointmentDate || 'n/a'}
Extra context from advisor: ${notes || 'none'}
Tone: ${tone}

Draft the follow-up message.`;

    const data = await callClaude({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userPrompt }]
    });

    // Same {nudge, draft_message} JSON the deployed proxy speaks — with a
    // plain-text fallback so older callers never get a blank message.
    const rawText = firstText(data).trim();
    let nudge = '';
    let message = rawText;
    try {
      const parsed = JSON.parse(rawText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim());
      if (parsed && typeof parsed.draft_message === 'string') {
        message = parsed.draft_message.trim();
        nudge = typeof parsed.nudge === 'string' ? parsed.nudge.trim() : '';
      }
    } catch (e) { /* keep the raw text as the message */ }

    res.json({ message, nudge });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to draft message', detail: String(err.message || err) });
  }
});

/* --------------------------------------------------------------
   3) COMPANION (assistant turn)
   Same contract as the deployed proxy's "assistant" type: the app
   sends { snapshot, turnText, history } and gets back
   { reply, suggestions } — the companion only informs and suggests,
   it never sends messages or edits data.
-------------------------------------------------------------- */
app.post('/api/ai/assistant-turn', async (req, res) => {
  try {
    const { snapshot = '{}', turnText = '', history = 'none' } = req.body || {};
    if (!snapshot.trim() || !turnText.trim()) {
      return res.status(400).json({ error: 'assistant requires snapshot and turnText' });
    }

    const system = `You are Beelo, the personal companion of a self-employed UK window coverings advisor (call them "the advisor"). You are the friendly, knowledgeable voice of their business app — a colleague who always has the numbers ready.

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
7. suggestions: pick 0-3 keys from this exact allowed list ONLY (they become tap-able chips in the app): today, my day, week, money, follow-ups, next visit, log expense, weather, help. Use your judgement for what the advisor would naturally ask next.`;

    const data = await callClaude({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{
        role: 'user',
        content: `business_snapshot:\n${snapshot}\n\nconversation_history:\n${history}\n\nadvisor_message:\n${turnText}`
      }]
    });

    const rawText = firstText(data).trim();
    let reply = rawText;
    let suggestions = [];
    try {
      const parsed = parseJsonLoose(rawText);
      if (parsed && typeof parsed.reply === 'string') {
        reply = parsed.reply.trim();
        suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(s => String(s).trim()).filter(Boolean).slice(0, 3) : [];
      }
    } catch (e) { /* plain-text fallback stays */ }

    res.json({ reply, suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to draft assistant turn', detail: String(err.message || err) });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`AdvisorOS AI proxy listening on http://localhost:${PORT}`));
