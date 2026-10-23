# C01 — Explicit visit-payment linkage

Status: implemented and locally verified; deployment evidence appended after release.

## Decision / scope

- Fix C01 from the 23 October comprehensive audit only: fitting payments use the fitting's explicit order; sales deposits use the order belonging to that sales visit. Never select the customer's newest open order as a proxy.
- Legacy fittings without an explicit link can still save their visit outcome, but cannot silently collect against another order. The form directs the adviser to record payment against the correct order in Orders. No new order is inferred.
- Externally managed survey-referral orders do not offer inline collection. Missing/cross-customer links, changed displayed-order snapshots and invalid payment requests are rejected before mutation. No migration or automatic historical payment reassignment.
- Outcome Save is single-flight. A payment operation ID is created with the form and reused on retry; existing ledger idempotency/clamping remains. Specific link errors appear inline without losing the form.
- Browser verification exposed an independent offline banner/toast hit-target obstruction on the outcome sheet. The same existing narrowly scoped z-index pattern used for phone contact was applied only to `.visit-outcome-recording`; no global modal/banner defaults changed.

## Implementation boundaries

- `DB.getOutcomePaymentOrder` is shared by preview and save. Save rechecks the current link/customer and the displayed order ID inside the existing write boundary, before writes, including on the fallback engine.
- No changes to provider functions/credentials, fees/commission policy, follow-ups, notes, storage schema, social workflow or backup encoding. Those audit findings remain open. Existing data is not retrospectively rewritten; suspect historical allocations need deliberate review.
- Changed browser assets: DB and appointments source/minified files, one scoped CSS selector, synchronized index/SW tokens. Cache `advisoros-v6-142-payment-link`, DB v42, appointments v58, components v57.

## Evidence

- Full npm suite passed. New real-Dexie and bundled-shim cases cover an older explicit fitting order versus a newer same-customer order, partial payment/retry, stale expected order, unlinked/missing/foreign links, externally managed referral and new-sale deposit allocation. Existing clamps, duplicate reconciliation, migration and rollback tests remain.
- New Chromium/WebKit journey passed: £500 fitting balance versus unrelated £900; £100 records on the £500 order only; double tap/reload; stale link leaves balances/outcome unchanged with an inline error; safe retry offline; unlinked outcome completion; external referral without collection; sale deposit on its own order; no POSTs/messages/provider calls.
- Adjacent survey/service earnings, outcome-timing, shared-message entry and deliberate service-worker update checks passed. Existing phone-contact offline Save is separately checked for unchanged hit targets.
- Initial harness attempts were interrupted by unrelated synthetic visit-alert sheets. The test now disables only those alerts, following the existing timing-test convention. The offline Save obstruction was a real subsequent boundary, fixed with the scoped selector above rather than forced clicks or hiding the banner.
- Screenshots: `/private/tmp/beelo-payment-link-{chromium,webkit}.png`, plus stale/offline variants. No physical-iPhone or audible-media certification inferred.

## Release

- Prior live source `c33240f`, deployment `dpl_3v9xeCrnHxPhnT6JmaqTUBSnkdA3` is rollback target. Deploy only from isolated managed `codex/phone-contact-save` checkout; preserve unrelated original dirty-tree work.
- Next approved sequence remains one fix/test/deploy at a time; C02 protected backup is next, not implemented in this release.
