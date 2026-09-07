# Audit fixes and release checks — 7 September 2026

Branch: `codex/beelo-audit-fixes`, based on fetched `origin/main` at `69bea2e`.
The original checkout and its five uncommitted files were preserved. Equivalent Home scroll safeguards and the private-folder ignore rule were carried into this branch; asset versions were advanced from the newer baseline.

## Implemented

- Trip completion uses a database transaction on Dexie and a persistent operation ID for duplicate-safe retry. The fallback engine repairs partial completion on retry without inserting another trip. Failed completion retains the recovery draft, shows Retry save, and does not report success.
- Active-trip recovery uses the existing encryption functions, migrates legacy JSON, serialises writes, and prevents an outstanding encryption operation from resurrecting a cleared trip. Corrupt location payloads are no longer printed to logs.
- Journey estimates use fresh, sufficiently accurate GPS coordinates and road-routing results. Base-point and guessed-distance estimates are not presented as live arrival information. Customer drafts explicitly distinguish road estimates from live traffic.
- Running-late monitoring starts/resumes with tracking and stops on completion, cancellation or ineligible visits. Duplicate scheduler implementations were removed and guarded by regression checks.
- Concurrent lazy loads share their in-flight Promise and can retry after failure.
- Home has one inner scroller, preserves pinch zoom, removes redundant spacers and route-rendering work, uses the visible Safari viewport, and keeps the composer clear of the bottom navigation. The disabled AI phrasing toolbar no longer reserves space. Scan remains above the appointment feed; the Home Route section remains removed.
- Upcoming uses the requested casing. Customer names no longer have decorative @ prefixes.
- Missed/unavailable visits are excluded from Quoted and linked to Follow-ups. Structured quotes suppress duplicate legacy cards; drafts and converted quotes do not inflate Quoted. Outcome labels use configured display names.
- The Route screen restores map attribution, clarifies the origin label, and explicitly describes map lines and journey totals as schematic/estimated.
- Measure without appointment context has Select visit and Back to Home actions.
- Orders uses the shared surface token; Tools separates business and field tools and removes duplicate primary-navigation shortcuts. My Day navigation/search icons use the foreground colour token.
- Service-worker background asset refreshes are kept alive, cache-write failures do not break successful responses, minified JavaScript was regenerated, and shell/asset versions were advanced.

## Verification

| Check | Result |
| --- | --- |
| Full `npm test` including new audit regressions | Passed |
| Trip failure, encrypted recovery, migration, cleared-write race, script-load concurrency and retry | Passed |
| Real Dexie rollback and fallback-engine retry tests | Passed |
| Scheduler tests and interval lifecycle regressions | Passed |
| Mobile viewport suite, 320–430 px | Passed |
| Chromium touch swipes, composer clearance, Ask Beelo submission, Measure picker | Passed |
| WebKit UI, scroll geometry, composer clearance, Ask Beelo submission, Measure picker | Passed |
| Chromium cold offline shell and uncached-route fallback | Passed |
| WebKit offline event/banner | Passed; cold offline reload remains unverified |
| Two-version update, deliberate activation and cache cleanup | Passed |
| Accessibility sweep | Zero reported violations under the suite's configured rules/exceptions |
| Visual sweep | 40 screenshots captured; existing script skips one diary detail without a selected visit |
| iPhone 17 Pro simulator, iOS 27 Safari | Visually confirmed clipped composer before correction and full composer after correction |
| Simulated phone gesture automation | Native gesture tool returned `noWindowsAvailable`; actual touch swipes were tested in Chromium, not established in the simulator |
| Local Lighthouse, Brotli-compressed preview | Performance 94, Accessibility 100, Best Practices 100, SEO 100; LCP 3.1 s, CLS 0.011 |
| Plain Python static-server Lighthouse | Performance 76; uncompressed delivery makes this unsuitable as a production comparison |

These are lab results, not field Core Web Vitals or a blanket accessibility certification. LCP still merits improvement; field INP was not measured. WebKit's automation runtime reported an internal navigation error on cold offline reload; an event-only check is not a substitute for physical Safari offline testing.

## Production findings and release gates

The production domain was verified to point to Vercel project `beelo1`, deployment `dpl_C92qb5KBgncYx5TVLLjTAAEWuedD`, created 3 September. Its response has HTTPS/HSTS, CSP, anti-framing and nosniff headers. This fix branch has not been deployed there.

Production environment-name inspection found AI_SECRET, ALLOWED_ORIGIN, ANTHROPIC_API_KEY and OPENAI_API_KEY. It did **not** find UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. No secret values were downloaded or printed. The present proxy falls back to per-instance rate limiting, so shared production quota protection is NOT verified or complete. Connecting an existing database or provisioning a new one requires the user's service/cost choice; no service was provisioned and no production variables were changed.

Before production release:

1. Configure and test the shared Redis limiter, including concurrent requests and Redis-outage behaviour; do not equate variable presence with working enforcement.
2. Confirm real-iPhone scrolling with keyboard, browser chrome, rotation and standalone mode, and cold offline reload.
3. Verify install and update flows on the deployed candidate and repeat Lighthouse against that candidate. Workflows never opened online may still need their lazy scripts downloaded; the offline shell does not promise every lazy workflow is preloaded.
4. Use HTTP localhost or an HTTPS deployment for testing. Opening index.html as a `file://` URL is not a valid service-worker/installability test.

## Re-running

- `npm test`
- Start a loopback static server on port 8000, then run `node tests/browser/verify-viewport.pw.js`, `node tests/browser/audit-fixes.e2e.js`, and `node tests/browser/axe-sweep.js`.
- `node tests/browser/sw-update.e2e.js` owns an isolated loopback server and browser profile.
- `node tests/browser/serve-compressed.cjs`, then `npx lhci collect --url=http://127.0.0.1:8874 --numberOfRuns=1`. Do not upload reports containing private test data.

Test seed pages are destructive to their browser origin's fixture database. Use isolated profiles or the dedicated simulator test origin, never a user's production session.
