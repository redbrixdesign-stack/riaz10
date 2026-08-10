/* ============================================
   ADVISOROS — AI BACKEND PROXY
   Holds the Anthropic API key server-side and exposes two endpoints
   for the frontend to call:

     POST /api/ai/parse-document   { imageBase64, mimeType }  -> structured fields
     POST /api/ai/draft-message    { context }                -> drafted message text

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
appointmentDate must be ISO (YYYY-MM-DD) if present. appointmentTime must be 24h HH:MM if present.
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

    const system = `You draft short WhatsApp follow-up messages for a self-employed UK field sales
advisor (window coverings / similar home-visit trade). Keep it under 400 characters, one message,
no greetings like "Dear", no sign-off block, no markdown, no emoji unless it fits the tone naturally.
Sound like a real person texting a customer, not a marketing email. Return ONLY the message text,
nothing else.`;

    const userPrompt = `Customer first name: ${firstName}
Advisor name: ${advisorName}
Situation/outcome: ${outcome || 'general follow-up'}
Product: ${productType}
Appointment date: ${appointmentDate || 'n/a'}
Extra context from advisor: ${notes || 'none'}
Tone: ${tone}

Draft the follow-up WhatsApp message.`;

    const data = await callClaude({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: userPrompt }]
    });

    res.json({ message: firstText(data).trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to draft message', detail: String(err.message || err) });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`AdvisorOS AI proxy listening on http://localhost:${PORT}`));
