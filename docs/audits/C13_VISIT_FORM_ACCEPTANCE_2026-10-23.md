# C13 — Visit form acceptance checkpoint, 23 October 2026

Status: final refinement deployed; automated save/reload and native Simulator layout/picker checks passed. Separate offline-test instability remains open.

The earlier Simulator audit reported a clipped new-visit date/time row. Runtime `46915fc` did not reproduce it in desktop Chromium or WebKit at 320, 375, 390, 430, 480, 768 and 844 pixel widths. After Muhammad unlocked the Mac and Beelo, native iPhone 17/iOS 27 Safari DID reproduce it: Home → Add visit manually, and the Date and Diary time fields overlap/extend beyond the right edge. Before screenshot preserved. Severity P2: scheduling controls are impaired on the primary mobile workflow. Desktop WebKit is not native-iPhone acceptance.

Fix `394ca12` adds a class only to the new-visit date/time row, scopes minimum-width containment to that row and stacks its controls at widths ≤480px. No generic form styles, booking rules, data schema, financial logic, communication dispatch or provider configuration changed. Components asset v58, appointments v60, cache `advisoros-v6-152-visit-date-layout`. C12/cache 151 is the rollback.

Added `tests/browser/visit-form-layout.e2e.cjs` to the release runner (now twelve scripts). Each engine checks horizontal containment and phone stacking, fills the real form, saves one synthetic visit, reads decrypted data, opens detail and reloads it. Exact selected local date/time, name/address/notes and type are checked; no POSTs or page errors. Service workers are blocked for this focused test; existing offline/update journeys cover worker behaviour. Test waits for the save form to close and visible detail/edit controls after reload. Experimental harness attempts had unreliable asynchronous/hidden-list readback and loading-screen screenshots; those were corrected, not reported as product defects.

Pre-fix browser gate passed all twelve scripts; the tightened visible-detail focused check also passed both engines (`/private/tmp/beelo-visit-layout-verified2.log`). Full fix release gate: `/private/tmp/beelo-c13-release.log`; hosted exact-source Test 40001047598. Final results/deployment/native post-fix check will be appended after completion. No real person, phone number, provider call or external communication used.

Simulator initially required manual Mac and app unlock; neither was bypassed/reset. Native post-fix visual acceptance remains required; physical-iPhone, keyboard/zoom and VoiceOver acceptance are separate. Original dirty runtime/dependencies remain untouched.

## Initial release (partial result, superseded when refinement is promoted)

- URL: https://beelo.beelestial.co.uk/ (production, READY).
- Build: https://beelo1-atrqzxle5-beelomvp.vercel.app / `dpl_E6YX6cwyGG1hJAe4RAZWoS2dNqSd`.
- Commit: `394ca1273e7b801ff9e9bbaf1a5ab760ec6f2945`; static vanilla-JS PWA; build duration 7s.
- Full local `npm run verify:release` passed, including twelve browser scripts. Hosted [Test 40001047598](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40001047598) passed on this exact source.
- Protected staged index/SW/CSS/appointment source+minified matched local bytes. Custom domain remained cache 151 until promotion of that same build. Live index/SW/CSS/minified bytes match; live Chromium/WebKit genuine-passphrase synthetic setup, seven widths, save/context/time readback and visible detail reload passed. No POSTs/page errors.
- Ten-minute deployment-scoped error/fatal scan empty. Drains/client monitoring and independent assurance not established; this scan is not whole-system certification.
- Native Safari received Update ready. Tap/scroll automation failed; Muhammad manually updated and was asked to show the date/time row. Native post-fix acceptance awaits that visible check. Screenshots and release/stage/hosted/live/promotion text are preserved under `docs/evidence/2026-10-23-visit-form/`.
- Rollback C12: `46915fc`, `dpl_8A1hif7zUgWuomo46Q5pM8n5Ygsf` (restores clipped form but retains earlier reminder/security/data fixes).

## Native acceptance caught a remaining defect

After Muhammad updated and positioned the form, the date/time controls were stacked but their right borders still extended beyond the native Safari viewport. `simulator-stacked-still-wide.png` records this; the initial release is not claimed as a complete fix.

Refinement `5c7cb06` explicitly sets border-box, block layout, appearance none and physical/logical width containment on those two existing date/time inputs only. Native input types are retained; picker interaction is not yet certified. Cache 153/components v59; appointment v60 unchanged. Regression checks now also require computed border-box and appearance none. Staged production `dpl_673UciR1ncCLSyRMq2zqghZsA1KK` / https://beelo1-mg8bkuhqq-beelomvp.vercel.app, build 6s. Staged index/SW/CSS match; public remained 152 at comparison. Full local release gate passed. No credentials, business rules or customer data changed.

Hosted Test 40002296334 passed units/server/audits but failed the existing cold-offline WebKit route assertion before reaching the new form test. The old harness did not report which secondary route failed. The same offline journey passed in both engines in the local full gate and focused diagnostic rerun; cause is not established. Release held rather than skipping the gate. Test-only `b76735e` adds failure-only route/cache/body/screenshot evidence without weakening any assertion; no runtime bytes change. Hosted Test 40003020136 covers that source. Treat the original intermittent offline failure as an open reliability/acceptance risk unless reproduced and diagnosed; a later green run is not proof of root-cause resolution.

## Final deploy and acceptance

- Production READY: https://beelo.beelestial.co.uk/ → https://beelo1-mg8bkuhqq-beelomvp.vercel.app / `dpl_673UciR1ncCLSyRMq2zqghZsA1KK`, build 6s. Runtime `5c7cb06`; latest tested source `b76735e` differs only in offline-test diagnostics. Static vanilla-JS PWA, cache `advisoros-v6-153-native-date-sizing`, CSS v59, appointments v60.
- Full local release gate passed; diagnostic-enhanced [Test 40003020136](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40003020136) completed successfully, all twelve browser journeys included. Earlier failed hosted run retained, not suppressed. A combined status-query/promotion command was rejected by safety review because it lacked an enforced result guard; no action occurred. Separate read explicitly confirmed completed/success, then promotion proceeded.
- The exact staged build was promoted, not rebuilt. Staged changed bytes match; public remained 152 until promotion. Final live shell/SW/CSS/appointment bytes match; live Chromium/WebKit genuine synthetic setup, seven widths, real form save/decrypted readback and visible detail reload pass. No POSTs/page errors or actual customer records changed.
- Simulator update activated through the focused Update and reload button using Return after coordinate automation was unreliable. iPhone 17/iOS 27 Safari now visibly shows both borders of both fields aligned with the form. Both native time and date pickers open and were cancelled without selecting a different value. `simulator-after.png`, `simulator-time-picker.png`, `simulator-date-picker.png` preserved. No native save was claimed; save/reload was tested in automated genuine-key browsers. Physical-iPhone/zoom/VoiceOver acceptance remains separate.
- Final ten-minute error/fatal scan empty; drains/client monitoring/independent assurance remain unverified. Next priority: diagnose the intermittent hosted offline WebKit route failure with the added evidence, not assume it fixed. C12 remains rollback; no unrelated user files/dependencies, money rules, message dispatch or schema altered.
