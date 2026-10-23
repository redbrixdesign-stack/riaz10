# A03 — Shared pilot transcription safeguards

Status: implemented and tested; release details recorded below after deployment.

## Approved policy / product truth

- Muhammad approved 100 admitted transcription attempts and 100,000,000 decoded audio bytes (decimal 100 MB) per UTC day, shared across all advisers; at most two active transcription request leases. Either daily ceiling blocks further attempts until midnight UTC. No per-device identity or per-adviser entitlement is claimed.
- Auth/origin/payload-invalid and quota/concurrency-denied requests do not consume the allowance. Admitted requests count even if the provider fails, returns no speech, or times out; there are no automatic paid retries or refunds.
- This is a request/volume safeguard, not a guaranteed monetary cap or audio-duration cap. Encoding affects duration/bytes. Provider-side processing after cancellation cannot be certified; the server aborts its fetch/body-read after 60 seconds.
- Existing local recording, playback, notes, the 3 MB per-transcription limit and 4.1 MB transport guard remain unchanged. Nothing is sent autonomously. Existing client error handling displays specific daily/busy/unavailable guidance and preserves local audio/notes.

## Architecture / failure behavior

- `server/transcription-usage.mjs` reuses existing Redis REST credentials (`UPSTASH_REDIS_REST_*` or `KV_REST_API_*`); no new integration, dependency, secret, subscription, schema or feature removal.
- One Redis Lua operation uses Redis TIME, a shared UTC-day counter and a sorted set of UUID leases. Checks and reservations are atomic across instances. Keys use a common Redis hash tag. No customer names, audio, note content, phone numbers, secrets or IP identifiers are stored by this guard.
- Daily counters expire after the following UTC day; active lease keys expire. Individual leases expire after 120 seconds to recover from terminated functions. Normal success, rejection, empty response, parse/network error and timeout release only their own lease in `finally`.
- Missing, unreachable or malformed store responses fail closed with 503 and Retry-After 30; no in-memory production bypass. Busy requests return 429 / 15 seconds; daily denials return 429 / seconds until UTC midnight. Redis requests are bounded to five seconds, without ambiguous automatic retries.
- Client remains manually retryable; server errors do not delete audio or alter notes. No changes to Claude, appointment logic, follow-ups, UI layout, service-worker cache or existing device credentials.

## Evidence

- Full `npm test` passed, including new guard wiring tests, previous raw/envelope limits and recording/editor lifecycle regressions. `npm run build` reported all 51 files already up to date; no unrelated generated asset changed. `git diff --check` passed.
- Real configured Redis Lua integration passed using a random synthetic namespace, removed afterwards: 100th/101st attempt boundary, exact 100 MB / one byte over, 12 simultaneous requests admitting exactly two, busy denial not charged, identity-safe release, expired lease recovery and reset from a prior UTC-day ledger. Actual pilot ledger/customer records were not touched. No model calls or secret values printed.
- Chromium and WebKit customer-profile journeys exercise quota 429, busy 429 and protection-unavailable 503; each preserves notes/local player and clears busy state without automatic retry, then allows mocked success and encrypted save/reload. Provider transport is mocked with service workers blocked for reliable interception; this is not offline acceptance or physical-device playback certification.
- Screenshots: `/private/tmp/beelo-transcription-usage-chromium.png`, `/private/tmp/beelo-transcription-usage-webkit.png`. Headless WebKit audio decoding and real iPhone acceptance remain unverified. No paid provider call was made.

## Release / remaining risks

- Deploy from the isolated managed `codex/phone-contact-save` checkout only; preserve the pre-existing dirty original worktree. Prior production source `34760c1`, deployment `dpl_3oeZbVftywyr7F954UGuG4FHEcTb` is rollback target.
- Post-release authenticated, paid end-to-end transcription still requires a controlled manual check. Shared credentials mean one adviser can exhaust the group allowance; individual accounts/entitlements require a separate product/security decision. This guard is not DDoS protection or comprehensive spend monitoring.
- Next: physical-iPhone acceptance and remaining audit priorities, one separately tested release at a time. No automatic expansion of scope.
