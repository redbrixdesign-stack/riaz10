# C14 — bounded worker-delivery diagnostic

Status: local diagnostic verified; hosted investigation next. NOT a production
change or release acceptance. Public stays M1/cache158; M2a/C23 release held.

## Question / baseline

Captured hosted40079956457 stalled on the first offline quote-document prerequisite:
script node and cache key existed, no response/load/error was captured. Subsequent
passes do not establish why. C23 adds bounded error/retry containment, not a fix
for the missing delivery. No repeated unchanged runs or speculative cache rewrite.

## Primary-source research (not a diagnosis of Beelo)

- [Playwright service-worker documentation](https://playwright.dev/docs/service-workers)
  limits its service-worker inspection API to Chromium. This test uses standard
  worker MessageChannel replies, not an unsupported WebKit inspection API.
- [Playwright issue42775](https://github.com/microsoft/playwright/issues/42775)
  reports offline-emulation failures even for literal worker responses and contrasts
  origin-stop testing. Beelo's WebKit socket-drop harness already avoids that flag;
  the report does not explain this socket-drop stall or certify native Safari.
- [Playwright issue42273](https://github.com/microsoft/playwright/issues/42273)
  reports automation-reload hangs involving cache writes/in-flight fetches. Beelo's
  captured failure occurred before its return-online reload, so it is not a proven
  duplicate. These are hypotheses/test-design context, not an upstream root-cause fix.

## Isolated harness

`tests/browser/offline-delivery-diagnostic.cjs` serves the actual app from a disposable
loopback origin. Only that origin's sw.js response is instrumented in memory:
dispatch → network start/result → cache lookup/result → respondWith resolution.
Original SW bytes are hashed in diagnostic-summary.json and never edited/deployed.
Trace wrappers can alter timing; even a green trace cannot rule out an intermittent
fault. Bound trace size to2000 events; no customer content or credentials logged.

Three bounded cells, no retries:

1. Existing socket-drop disconnect, with unchanged route/data assertions.
2. Stopped-listener disconnect, then restart the same port to test return online.
3. Known negative: delete only quote-document from the synthetic WebKit cache.
   The unchanged journey must fail, and trace must show cache miss plus504 response.
   A timeout/missing diagnostic does not count as detecting this negative control.

Each cell has a45-second process cap, within the unchanged180-second runner cap
for the whole diagnostic. Driver termination also signals its active child.
These are diagnostic limits, not relaxed browser timeouts; timeout is a failure.
Child credentials are stripped. Passphrases,
customers and visits are synthetic. No provider calls/messages/uploads/user-profile
access. Diagnostic output is explicitly releaseAcceptance:false. The expected negative
failure is not hidden or reclassified as production success.

Normal release checks keep the original socket-drop route assertions and timeouts.
Only workflow_dispatch adds this diagnostic before all unchanged17 browser scripts;
it cannot replace or skip them. No CI policy, dependency, runtime or secret change.

## Local evidence

Initial two-cell development probe passed. Final three-cell probe also passed;
the known cache-miss control failed the journey as required and supplied exact
cache-miss/504 trace. In both positive WebKit cells, the quote-document cache hit
and200 response resolution completed before background network failure. This
establishes those runs only, not the earlier hosted failure's internal state.

Evidence under docs/evidence/2026-10-24-offline-delivery-diagnostic/. Original dirty
runtime remains untouched. Run the enriched comparison once on the pinned hosted
browser image, preserve results, and inspect any failing boundary before a fix.

## Release decision

No release hold is waived by these diagnostics. If no original failure is reproduced,
report the remaining evidence gap rather than call C14 fixed or repeatedly rerun.
Physical Safari/PWA acceptance remains separate from Playwright WebKit. No M2/C23
deployment, cache clear on a working installation, or new public claim is authorised
by a passing diagnostic alone.
