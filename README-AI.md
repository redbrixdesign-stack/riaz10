# AI proxy — deployment guide

AdvisorOS is a static, no-backend app, so the Anthropic API key can
never live in the client. All AI traffic goes through ONE hardened
handler with a single contract:

- **`api/claude.mjs`** — the canonical implementation. Deploys as a
  Vercel function (`/api/claude`); also exports the underlying `handle()`
  the standalone server uses, so both deployments can never drift.
- **`server/`** — a thin Express wrapper around that same `handle()` for
  any other host (Render, Fly.io, a VPS, a Raspberry Pi on the network).

The app talks to whichever of these you deploy through
`CONFIG.ai.proxyUrl` (set in Settings → AI or directly in
`js/core/config.js`). On a same-origin Vercel deployment the relative
URL `/api/claude` works with zero configuration.

## 1. Vercel (recommended — one project, one deploy)

The repo is already set up: `vercel.json` serves the static app from
`.` and `api/claude.mjs` is picked up automatically as a serverless
function.

```bash
npm install
npx vercel --prod
```

Then set the environment variables in the Vercel dashboard
(Project → Settings → Environment Variables):

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | server-side only, never shipped |
| `AI_SECRET` | production | shared secret the app sends as `X-AI-Key` (must equal `CONFIG.ai.secret` in the app); missing → 403 |
| `ALLOWED_ORIGIN` | production | the exact app origin (e.g. `https://your-site.vercel.app`); every other origin → 403 |
| `UPSTASH_REDIS_REST_URL` | no | enables shared rate limiting across serverless instances via Upstash Redis (falls back to in-memory per-instance if unset) |
| `UPSTASH_REDIS_REST_TOKEN` | no | paired with `UPSTASH_REDIS_REST_URL`; required together to activate Redis-backed rate limiting |
| `RATE_LIMIT_MAX` | no (120) | requests per address per window |
| `RATE_LIMIT_WINDOW_MS` | no (60000) | rate-limit window |
| `ANTHROPIC_TIMEOUT_MS` | no (60000) | upstream call budget before the proxy aborts with 504 |

With `NODE_ENV=production` the proxy refuses ALL requests until
`AI_SECRET` and `ALLOWED_ORIGIN` are both set (fail-closed).

Set `CONFIG.ai.secret` to the same value as `AI_SECRET` in the app
(Settings → AI), set `CONFIG.ai.proxyUrl`, enable AI drafting, done.

## 2. Standalone server (any host)

```bash
cd server
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY + production vars
npm start              # listens on PORT (default 8787), /health -> {"ok":true}
```

The server enforces the exact same guards as the Vercel function
(secret, origin, rate limits, body caps, model allowlist, timeout,
non-leaking errors) — it imports the shared `handle()` from
`api/claude.mjs` at runtime.

## 3. What the app sends

The client (`js/services/ai.js`) sends only the minimised message
context (see docs/FEATURES.md §7): no customer addresses, areas or
lead sources. Payload size is capped on the proxy (100 KB text /
2 MB images). AI responses are parsed through whitelists, so the
model cannot inject app behavior.

## 4. Security reminders

- Never commit `.env`; `server/.env.example` contains placeholders only.
- `ALLOWED_ORIGIN` is the real origin protection; `AI_SECRET` is a
  shared gate (still required in production — fail-closed).
- If you ever paste a real key into a tracked file, rotate it in the
  Anthropic console and scrub git history.