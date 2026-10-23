# Beelo optional AI and transcription proxies

Beelo has a static local-first frontend and optional online backend functions.
“No backend” is inaccurate when these services are enabled. Source reviewed
24 October 2026; this guide records configuration contracts, not live-provider
availability or a request to rotate credentials.

## Services and boundaries

| Service | Implementation | Client and provider boundary |
| --- | --- | --- |
| Claude assistance | `api/claude.mjs`, deployed at `/api/claude` | `js/services/ai.js` uses the configured proxy URL for supported OCR, drafting and assistance requests. Selected input/context goes to the server and provider. |
| Transcription | `api/transcribe.mjs`, deployed at `/api/transcribe` | `js/services/note-capture.js` explicitly posts selected recorded audio to the same-origin endpoint, then presents text for adviser review. The function does not persist audio; provider processing is a separate privacy boundary. |
| Alternative Claude host | `server/index.js` | Express imports the canonical Claude handler; routes `/` and `/api/ai`, default port 8787. It does not expose transcription. `/health` alone does not test provider access. |

A local static server executes none of these APIs. HTTPS and separately deployed
functions are needed for a hosted setup. A configured Claude URL does not
redirect the current same-origin transcription request.

## Server-side configuration contract

Configure values privately in the intended host/environment. Never paste keys
into frontend source, Git, screenshots or chat. This correction changes no values.

| Variable | Requirement / behaviour |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude provider key, server-side only. Required for a successful provider request; the Express wrapper also checks presence on startup. |
| `OPENAI_API_KEY` | Transcription provider key, server-side only; required by its production configuration guard. |
| `ALLOWED_ORIGIN` | Required in production. Use the intended app origin, not its marketing site or a URL with a route. Claude checks exact request-origin equality; transcription normalises a trailing slash. |
| `AI_SECRET` | Required in production. Shared device credential sent in `X-AI-Key`, not a provider key or local unlock passphrase. Existing devices must use the matching value. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Complete shared-store pair, or use the supported `KV_REST_API_URL` + `KV_REST_API_TOKEN` alias pair. Configure a coherent pair, not a mixture of providers/environments. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Claude per-address window limits; source defaults 120 requests / 60,000 ms. Not a daily money budget. |
| `ANTHROPIC_TIMEOUT_MS` | Claude upstream timeout; source default 60,000 ms. |
| `OPENAI_TRANSCRIBE_MODEL` | Optional transcription model override; source default `gpt-4o-mini-transcribe`. This is an implementation default, not a model/pricing recommendation. |

Production Claude returns configuration error 500 without origin/credential;
missing, partial or unavailable shared usage protection returns retryable 503
before provider work. Exhausted rate allowance returns 429. In-memory fallback
is development-only. Transcription fails closed when its shared store cannot be
used; it has no per-instance fallback, including in development.

The credential is kept by the client to authorise requests. It is not a private
server API key, individual adviser identity or revocable per-user access.
Origin checks are not authentication: non-browser callers can supply an Origin
header. The shared gate, validation and usage controls do not replace a future
per-adviser security design or independent assessment.

## Transcription allowance and failure behaviour

The implemented pilot guard shares one allowance across advisers:
100 admitted attempts and 100,000,000 decoded audio bytes per UTC day, at most
two concurrent reservations. Admitted failures/retries can consume allowance.
The endpoint accepts at most 3,000,000 decoded audio bytes per request, with
4,100,000-byte JSON-body cap; the upstream timeout is 60 seconds.

A genuine limit/busy response is 429; unavailable protection is 503. These are
not guaranteed pound budgets. Recording/playback and saved audio remain available;
transcription failure does not mean the note was sent or completed. Saving the
parent record is still necessary to persist its edited note/audio state.

## Input, privacy and troubleshooting

Claude validates request/body, image/media and model constraints and maps provider
failures to bounded client errors. Its JSON-body cap is 4 MiB, individual text
field cap 100 KiB and decoded-image cap 2 MiB. Do not confuse these with the
transcription limits.

Do not claim all AI inputs are address-free: selected OCR photos can contain
customer details, and each request type supplies its own context. Inspect
`js/services/ai.js` and `js/services/note-capture.js` for the actual payload,
then disclose the provider boundary. An editable response is not permission to
send customer communication automatically.

For a failing device, inspect the error category before replacing keys:

- 500 configuration: required server configuration is missing.
- 403 origin/device credential: check the configured origin and matching shared
  credential; a provider-key rotation alone will not fix a mismatched device.
- 503 usage protection: check the shared store; do not disable the guard.
- 429: respect retry timing and the applicable quota/concurrency limit.
- Provider rejection/timeout: check provider-side status privately. Never log
  credentials or raw customer payloads to diagnose it.

Changing a server credential can affect every registered device. Do not rotate
it casually or ship a key in the browser. Rebuild/redeploy to apply intended
server changes, stage and verify first; documentation edits require no redeploy.

## Evidence

`tests/ai.test.js`, `tests/proxy-server.test.js`,
`tests/claude-usage.test.mjs`, `tests/transcribe-proxy.test.js` and
`tests/transcription-usage.test.mjs` use controlled/mocked boundaries. They
verify guards and contracts, not a paid live-provider success. See the
[C07 audit](docs/audits/C07_CLAUDE_USAGE_FIX_2026-10-23.md) and
[transcription allowance audit](docs/audits/BEELO_TRANSCRIPTION_USAGE_2026-10-23.md).
