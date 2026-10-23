# C15 — Hosted browser provisioning

23 October 2026. Status: provisioning repair verified on the working branch; final hosted acceptance green. No app deployment; C14 intermittent failure remains open.

## Confirmed defect

[Test 40006514477](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40006514477) passed the unit/server job but spent the browser job's full 15-minute allowance installing system libraries from `azure.archive.ubuntu.com`. It was cancelled during package downloads; Beelo's browser acceptance step was skipped. Logs preserved in C14 evidence. Do not confuse this infrastructure failure with C14's original intermittent offline rendering failure.

## Scoped repair

`a5bcf5a` changes only the browser job in `.github/workflows/test.yml`:

- Official Playwright Ubuntu Noble image matching installed/locked Playwright 1.62.1, pinned to registry-verified immutable image-index digest `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
- Runs as user 1001. Existing read-only permissions, pinned checkout/setup/artifact actions, Node 24, 15-minute job limit and all twelve synthetic journeys unchanged.
- Removes the per-run browser/system-package download step. Preflight instead checks package version and both existing executable paths, failing closed on mismatch/missing files. No package upgrade, skipped assertions, automatic retry-until-green or production credentials added.
- Local preflight and whitespace/syntax review pass. Hosted [Test 40009099907](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40009099907) verifies actual Linux/container execution; local macOS checks do not substitute for it.

## Hosted result

Test 40009099907 passed units/server/audits. Browser container initialization completed in 35 seconds (19:09:59–19:10:34 UTC), exact-version/executable preflight passed, and all twelve journeys were invoked through the unchanged fail-closed runner. Payment, backup, encryption, lazy-state and sharing checks passed before cold-offline WebKit timed out waiting for a secondary route; the overall acceptance job correctly failed. This verifies C15 provisioning, not all acceptance or a C14 fix. Failure log preserved in C14 evidence. Timeout-path diagnostics `c401efe` and Test 40009783448 investigate C14 without relaxed assertions or runtime changes.

Final [Test 40009783448](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40009783448) on `c401efe` passed units/server/audits and all twelve journeys in the repaired environment. Browser job completed in 2m23s, including initialization. No assertion, wait, performance threshold or route was removed to obtain this result. This confirms the CI repair; it does not prove the intermittent C14 offline failure resolved. Evidence summary and diagnostic JSON retained with C14 artifacts.

This follows [Playwright's official container CI guidance](https://playwright.dev/docs/ci) and [official Docker guidance](https://github.com/microsoft/playwright/blob/main/docs/src/docker.md). The vendor image bundles browsers and system libraries, not the project's npm dependency; version matching remains an explicit maintenance requirement. Used only for trusted local synthetic app tests, not browsing untrusted sites.

Production remains C13/cache 153. Original dirty workspace/runtime/dependencies preserved. C14 remains open until an actual failing offline boundary is captured and diagnosed. Main-branch required-check/merge policy remains the previously held owner decision; this repair does not claim repository-wide enforcement.
