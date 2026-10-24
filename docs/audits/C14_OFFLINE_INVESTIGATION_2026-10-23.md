# C14 — Intermittent offline acceptance investigation

23 October 2026, updated24 October. C14 remains open, cause not established.
Diagnostics verified; C23 adds tested failure containment, not an underlying
offline-delivery fix. No new production deployment.

## Story and boundaries

Fresh synthetic profile → install/control/cache → disconnect before opening secondary screens → load Settings and eight lazy routes → return online/reload → retain synthetic record. No provider/API call or real customer data is needed. Tests assert no POSTs and no page errors. WebKit uses a loopback proxy that destroys sockets while disconnected; this is not physical-iPhone or public-origin strict-offline certification.

The original hosted failure is Test 40002296334, WebKit secondary-route render assertion. It did not record the failing route or console/network details. A subsequent green run does not resolve its root cause.

## Work and evidence

- Release checkout was clean at `6b54a23` before work. Original dirty workspace/runtime/dependencies preserved; only isolated `tests/browser/cold-offline.e2e.cjs` changed in `c518e25`.
- Added console errors, script response status/service-worker source, failed requests, per-route render summaries and JSON artifacts. Failures also preserve full route/body/cache/network evidence and a screenshot. Existing assertions, network-disconnect method, timeouts and route sequence are unchanged.
- Current local journey passed twice (the second with final diagnostic output). Settings and all eight secondary feature scripts returned HTTP 200 with `fromServiceWorker: true` in both Chromium and WebKit. All eight route render summaries succeeded; page errors, console errors and failed requests were empty. Return-online reload retained the synthetic customer. No POSTs.
- Local logs: `/private/tmp/beelo-c14-first.txt`, `/private/tmp/beelo-c14-diagnostic.txt`; JSON/screenshots: `/private/tmp/beelo-c14-diagnostic/`. These establish this run's cache delivery/render/persistence, not the cause of the earlier failure.
- Hosted diagnostic run: https://github.com/redbrixdesign-stack/riaz10/actions/runs/40006514477 on `c518e259f2123a505908ce0268357e16abb6d7dc`. Unit/server job passed; browser job was cancelled at its 15-minute limit during Playwright system-dependency installation. Logs show slow downloads from `azure.archive.ubuntu.com`; the synthetic browser step was skipped and uploaded no evidence. This is a separate CI provisioning failure, not a reproduced app failure or a passing browser run. See C15 repair.
- After C15 provisioning repair, Test 40009099907 reached the app tests and reproduced a related WebKit first-offline route timeout (20-second route-state wait). Chromium passed. This timeout occurred before the original diagnostic hook, so it did not identify the route. `c401efe` now logs the route before navigation and captures timeout/assertion failures with router state, script nodes, registrations, console/network and screenshot before teardown. Test 40009783448 is the bounded diagnostic follow-up; no runtime fix or relaxed waits.
- Final [Test 40009783448](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40009783448), exact source `c401efe6d8e2a644b8eb440670acf8eae7e96a46`, completed successfully: units/server/audits plus all twelve browser journeys. Browser job completed in 2m23s. Downloaded JSON verifies both engines rendered all eight secondary routes, with no page/console errors or failed requests; cached scripts were delivered through the service worker. Summary, offline JSON/log and screenshots preserved under `docs/evidence/2026-10-23-offline-investigation/hosted/`. This green run does not diagnose either earlier WebKit failure.

## Decisions / next action

### 24 October — worker trace / separate device build

Test-only ab3823e and manual40128386499 add a bounded instrumented comparison of
socket-drop/stopped-origin transports plus an actual missing-cache negative control.
Local/hosted diagnostics and all17 normal hosted checks pass; original stall did
not recur. No root-cause closure, assertion relaxation or cache-policy change.
READY unpromoted dpl_Fvs6TebarywrdJA77i6fP9wSRAWR/cache160 is available for a
mock-only iPhone check, with separate empty storage. Public custom app remains M1.
See C14_DELIVERY_DIAGNOSTIC_2026-10-24.md and
../BEELO_STAGED_DEVICE_CHECK_2026-10-24.md. Preserve any actual failure state;
the next boundary is physical-device evidence, not another unchanged rerun.

### 24 October — C23 failure containment (not C14 closure)

The captured pending script exposes a confirmed indefinite wait in App.loadScripts.
C23 (`49315d2`) adds per-script15-second foreground expiry into the existing explicit
retry screen, retains requested visit parameters and isolates late callbacks.
Negative/source/compiled/focused/full local and hosted40125539550 all17 scripts
pass. Controlled HTTP-stall tests are independent of SW/offline delivery; no
root-cause or physical certification. Cached-hit SW logic probe returns exact
cached body while network stays pending, but does not certify browser CacheStorage.
See C23 audit/evidence. M2a remains held and public M1/cache158 unchanged.

### 24 October — captured hosted failure, release held

M2a hosted Test40079956457 (`8f6c178`) failed first offline Quotes in WebKit.
The captured router has currentFeature quotes, currentHash settings?section=data,
and a quote-document.min.js?v=3 script node but no corresponding response/failure.
Its exact URL exists in the installed cache list; Quotes remains lazy. Screenshot
is the loading skeleton; page/console error arrays empty. This narrows the broken
boundary to dynamic prerequisite delivery/completion, not expense persistence.
It does not yet distinguish WebKit/SW/socket-drop behavior or establish a root cause.
Evidence is in ../evidence/2026-10-24-expense-context/hosted-offline-failure/.

Additional failure-only diagnostics record script request times, proxy socket-drop
requests, and bounded cached response status/body size. One enriched local check
passed both engines; no root-cause claim from that pass. Keep M2a stage unpromoted
and public M1/cache158 unchanged. Next: one hosted run of enriched diagnostics,
inspect any new evidence, no assertion weakening or speculative runtime changes.

Bounded enriched hosted Test40124297358 (`9cf6fb0`) passed units/server/audits and
all16 browser scripts. Offline JSON verifies eight routes rendered in both engines,
no page/console errors or failed requests, retained synthetic record on return
online. No failure hook fired, so the new request/cache-body probes did not capture
the failing state. This is evidence for that run only; C14 remains unresolved and
M2a held. Both failed and passing results preserved in the M2a evidence folder.
Next actionable evidence is the enriched trace of a naturally recurring stall;
do not repeatedly run unchanged tests or change caching without it. A missing
script response is not enough to blame the app, WebKit, SW or socket-drop harness.

Do not change service-worker caching or lazy navigation speculatively. Do not skip/relax the offline assertion, loop reruns until green, or call C14 fixed. Inspect any captured failing route's network response and console error before choosing a runtime fix. If the hosted run is green, keep C14 open and retain diagnostics for the next natural failure. Production at the original investigation checkpoint was C13/cache153; current production is M1/cache158. No new deployment is justified by test-only changes.
