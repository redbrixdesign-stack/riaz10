# C23 — bounded screen-load recovery

Status: implemented in isolated release checkout; focused/full local and exact-
source hosted checks pass. Commit49315d25929067c8b7c64f5b376bf02957199b86.
NOT deployed. Public remains M1/cache158; M2a stage remains held by C14.

## Confirmed defect / scope

C14 hosted40079956457 captured a pending quote-document script with no load/error
completion. The offline cache key exists, but that does not establish delivery or
the transport failure's cause. Existing App.loadScripts has no timeout: a missing
event leaves its shared promise and the router's skeleton pending indefinitely.
Separately, existing error-screen Try again retains the route but drops its
parameters, losing the visit context for Social opened from a fitting.

Negative regression logs demonstrate both conditions before correction. This is
containment of an observed failure mode, NOT a claim to have fixed C14's underlying
WebKit/service-worker/socket-drop interaction. No speculative cache-policy change.

Severity: P1 for an indefinitely unreachable requested workflow; P2 for an explicit
retry losing context (no wrong-customer write demonstrated). Reproduction with
disposable data: hold the quote-document HTTP response without load/error, open
Quotes and wait; old code never settles. Separately open Social with appointmentId,
force load rejection and inspect/click Try again; old control carries only social,
not the intended appointmentId. The negative assertions and browser fixture make
these failures deterministic without contacting anyone.

## Implementation

- Per-script15-second foreground timer settles the shared request once. On
  failure, remove the script node, clear handlers/timer, evict only the owned
  pending entry, and reject into the existing error/retry/Today screen.
- Successful loads stay deduplicated; dependency ordering is unchanged. No
  autonomous retry, route change, upload or data mutation. Late old callbacks
  cannot settle or evict a newer retry. Synchronous append failure also settles.
- Try again preserves the sanitized requested route parameters in both async and
  synchronous render failure paths. Existing navigation-revision guards keep a
  late failure from replacing a newer screen.
- App v46 / candidate cache160-screen-load-deadline. No schema, financial,
  communication, provider, secret or dependency change. Original dirty runtime
  untouched. This checkout also contains held M2a, not an independent C23-only
  production artifact; do not promote it while M2/C14 release conditions fail.

## Verification contract

Source/compiled tests: stalled concurrent request rejection,15-second timer,
cleanup, explicit retry, successful reuse, old callback isolation, retained route
parameters and navigated-away failure isolation. Browser test deliberately stalls
real HTTP script requests with service workers blocked, uses the actual timer,
and checks visible recovery, explicit retry of the actual Quotes screen, a fitting's
Social context, no interruption after navigating away, and retained synthetic data.
No real customer/provider/message/share is used. This controlled transport case
does not reproduce or certify C14 offline caching.

Final source/compiled tests and focused Chromium/WebKit journeys pass. Initial
timeout-only focused run passed but was superseded by the final retained-fitting
context scenario; do not treat it as the final source acceptance. Both engines'
visible recovery controls were inspected and screenshots retained.

Full local npm run verify:release passes build/unit/docs/social/maintained
performance gates and all17 browser scripts, including unchanged cold-offline,
new real deadline recovery, expenses, backups, reminders, drafts and updates.
Evidence: docs/evidence/2026-10-24-screen-load-recovery/. The diagnostic cache probe
also retains pending request URLs after the timeout removes the script node; it
does not change SW behavior or weaken offline assertions/timeouts.

Exact-source hosted Test40125539550 passes units/server/dependency audits and
all17 browser scripts, including unchanged cold-offline and deliberately stalled
request recovery. Summary and focused logs/JSON preserved in hosted/.
Public sw.js rechecked at M1/cache158. No new stage, live or native claim.

Additional controlled VM probe of the actual sw.js asset branch returns the exact
cached response while background fetch stays permanently pending. The code does
not explicitly await that refresh before a cache hit. This is logic evidence only,
not real CacheStorage/browser delivery or a C14 reproduction; preserved separately
as sw-cached-hit-probe.txt. It does not justify a cache-policy rewrite.

## Limitations / next

A timer cannot guarantee wall-clock expiry while iOS suspends the page, cancel
already-executing JavaScript, repair missing cache bytes or certify native iPhone
behaviour. Removing a node is not an absolute cancellation guarantee. Loaded code
may still register after timeout, but the old completion cannot paint a stale route
or reset the retry promise. Do not call a successful recovery test offline success.
Keep C14 diagnostics and the release hold until the underlying delivery/completion
boundary is understood. No new unchanged rerun-to-green closes that issue.
