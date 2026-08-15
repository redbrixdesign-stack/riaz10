/* ============================================
   ADVISOROS — AI BACKEND PROXY (self-hosted)

   This server is a thin Express wrapper around the SAME hardened
   handler as the serverless deployment (api/claude.mjs) — one
   contract, one set of guards, zero drift between deployments.

   The client (js/services/ai.js) posts straight to the proxy URL
   (CONFIG.ai.proxyUrl) with these request types: ping, ocr, draft,
   receipt, assistant, route. Every response is JSON:
   { ok:true, text, usage, model, type } or { ok:false, error, message }.

   Security (enforced inside the shared handler, covered by
   tests/ai.test.js and tests/proxy-server.test.js):
     - AI_SECRET: shared-secret guard (client sends X-AI-Key).
     - ALLOWED_ORIGIN: CORS allow-list; everything else gets 403.
     - NODE_ENV=production fails CLOSED until BOTH are set.
     - per-client-address sliding-window rate limiting (RATE_LIMIT_MAX
       / RATE_LIMIT_WINDOW_MS), upstream-quota protection.
     - body capped at 4 MB, any single text field at 100 KB, images at
       2 MB decoded, media-type and model allow-lists, fixed upstream
       endpoint.
     - upstream failures map to generic messages; provider internals
       and API keys never leave the proxy; a hung upstream call aborts
       after ANTHROPIC_TIMEOUT_MS (default 60 s).

   Environment (.env):
     ANTHROPIC_API_KEY      required
     AI_SECRET              optional in dev; REQUIRED in production
     ALLOWED_ORIGIN         optional in dev; REQUIRED in production
     RATE_LIMIT_MAX         optional (default 120)
     RATE_LIMIT_WINDOW_MS   optional (default 60000)
     ANTHROPIC_TIMEOUT_MS   optional (default 60000)
     PORT                   optional (default 8787)

   Run anywhere (a laptop, a $5 VPS, Render, Fly.io) and point
   CONFIG.ai.proxyUrl at this server's URL.
   ============================================ */

require('dotenv').config();
const express = require('express');

const PORT = process.env.PORT || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in environment (.env). Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
// Transport-level headroom above the handler's own 4 MB JSON cap, so
// oversized bodies are rejected with the JSON contract's 413, not
// Express's HTML error page.
app.use(express.json({ limit: '6mb' }));

let sharedHandle = null;
async function proxyHandler(req, res) {
  if (!sharedHandle) {
    sharedHandle = (await import('../api/claude.mjs')).handle;
  }
  const result = await sharedHandle({ method: req.method, headers: req.headers, body: req.body || {} });
  res.status(result.status);
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  res.send(result.body);
}

app.all('/', proxyHandler);
app.all('/api/ai', proxyHandler);

app.get('/health', (req, res) => res.json({ ok: true }));

// Express-level body parsing errors (malformed JSON, over-limit bodies)
// are answered in the same JSON contract instead of a bare HTML page.
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'too_large', message: 'Request body too large' });
  }
  return res.status(400).json({ ok: false, error: 'bad_request', message: 'Request body must be valid JSON' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`AdvisorOS AI proxy listening on http://localhost:${PORT}`));
}

module.exports = { app };