# C16 — preserve unsaved edits across stacked dialogs

## Verified defect

On the isolated production baseline, edit a synthetic consultation's customer name and diary time so that Save Changes opens **Check this diary slot**. Choose **Adjust time**. The editor returns, but its typed name and time revert to their original values. The warning itself correctly does not save the draft.

Severity: medium — avoidable re-entry and risk of saving unintended original values. No evidence of deletion of already-saved records.

Negative reproduction: original `898f48b` runtime with the new real-journey test failed with actual `SYNTHETIC Original` / `09:00`, expected `SYNTHETIC Corrected` / `09:30`. An earlier connection-refused attempt was a stopped local test server, not a product failure.

## Scoped fix

Source `9995984c62082e554f275531e247e4ccd8acf65c` snapshots current input, textarea and select properties onto a detached clone before serialising the existing modal stack frame. Previously `innerHTML` retained defaults only. The visible editor is not modified; the existing stack shape, scroll restoration, replacement/close-all semantics and reminder ownership remain.

Typed password, passphrase and file selections are excluded. Text is assigned through DOM attributes/text content, not string interpolation. This is not general preservation of event listeners, caret/focus, canvas, media playback or arbitrary JavaScript state.

No data/schema, booking/commission/payment, communication/provider, configuration or real-customer changes. Original dirty runtime and dependencies in `b833/riaz10` were not staged or deployed. Work occurs in the isolated `codex/phone-contact-save` release checkout.

## Evidence

- Full `npm run verify:release` passed: unit/source and minified parity, build/cache tokens, existing gates and all **13** synthetic browser scripts.
- New Chromium/WebKit real journey: edit → travel warning → adjust → retained unsaved values → adjust time → save → read back corrected customer name. Warning did not save prematurely.
- Nested three-layer regression: Unicode and literal closing-tag/markup text, checkbox/radio/multi-select values, secret/file exclusions, replacement and close-all; no page errors or POSTs. Typed markup stays text.
- Restored-editor screenshots inspected; browser evidence is not physical-iPhone acceptance.
- First hosted run [40026013440](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40026013440) passed the earlier eleven browser checks (including offline) but failed the new Chromium test with the original name and changed time. It did not pass and the staged release was not promoted. The dialog deliberately schedules autofocus on the next animation frame; the first test lacked an opening-focus readiness condition or pre-save draft assertion, so it could not establish where the name changed.
- Test-only `ba30894` now waits for the existing initial focus and asserts the exact intended name/time before Save. Preservation assertions/timeouts remain unchanged. The strengthened test passes locally in both engines, and still fails on the old App asset with both original values after Adjust time (the pre-save assertion passed). This negative control proves the fix is still required; it is not proof of the precise timing of the initial hosted failure.
- Final full local gate passed again with the stronger test. Hosted [40026690452](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40026690452) on `ba30894b5c53c7b7e879f942e8249bb8140b538f` completed successfully, both unit/server and browser jobs; all thirteen journeys passed. The follow-up changes only the test; runtime files are identical to `9995984`.
- Staged index, SW and source/minified App match byte-for-byte. Production remained cache 153 until promotion. Live index/SW/minified App then matched, and genuine-key disposable Chromium/WebKit journeys passed the real edit/warning/adjust/save and nested-form checks, with zero POSTs/page errors. Live screenshots visually inspected. No physical-iPhone claim.

## Release and remaining limits

Candidate deployment `dpl_BQjYsvQX8syQ9TcHj7Gkiyn8NV98`, `https://beelo1-60aqmcln9-beelomvp.vercel.app`; cache `advisoros-v6-154-modal-form-state`, app asset v44. Build reports 6s. Public domain was independently confirmed still on cache 153 during staging. A first comparison received Vercel's temporary preview page while status was Building and therefore did not pass; no promotion on that result.

Rollback target is C13 `5c7cb06` / `dpl_673UciR1ncCLSyRMq2zqghZsA1KK` (cache 153). C14 intermittent offline WebKit failure remains open, with diagnostics retained. Main-branch policy/reconciliation, physical-device/VoiceOver acceptance, independent assurance and held business decisions are unchanged.

## Deploy result — 24 October 2026 (Europe/London)

- **URL:** https://beelo.beelestial.co.uk/ (exact build https://beelo1-60aqmcln9-beelomvp.vercel.app)
- **Target / status:** `beelomvp/beelo1`, production, READY; exact staged build promoted without rebuilding.
- **Runtime commit:** `9995984`; final acceptance commit `ba30894` changes tests only.
- **Framework / build:** static vanilla-JavaScript PWA, Node 24 build, 6s; cache 154 / App v44.
- **Post-deploy scan:** deployment-scoped error/fatal query for the ten minutes ending 00:40:56 BST returned no records. This is not client-error monitoring or independent assurance. Drains and wider monitoring remain unverified.
- **Evidence:** `docs/evidence/2026-10-23-modal-form-state/` (original investigation date retained). Final test artifacts include the first hosted failure and stronger negative control, not only green outcomes.
- **Interruption:** automatic approval review temporarily hit a usage limit before a hosted-watch command ran. No promotion occurred then; resumed after Muhammad's 24 October instruction, read the completed successful result and rechecked target/staged bytes before promotion.

Next: preserve C14 diagnostics for a natural failure; complete physical-device acceptance and separately investigate other confirmed workflow gaps. Do not label the full product audit complete or guess held business rules.
