# Phone-contact offline save fix — 23 October 2026

Status: implemented and locally verified; not deployed.

Baseline: `91e83b0`. Work isolated in the attached `phone-contact-save` worktree, not the dirty original checkout.

## Change

- Add a recording-sheet-specific class and raise only its modal overlay to z-index 310, matching the existing correction sheet. The offline banner and notifications no longer intercept Save. Unrelated sheets retain z-index 200.
- Display validation/write failures in a text-only inline alert inside the sheet; clear it before retry. This is necessary because background toasts are intentionally underneath this sheet.
- Regenerate only the changed Follow-ups minified asset. CSS and Follow-ups asset URLs advance to 56/27; cache prepared as `advisoros-v6-139-phone-contact-save`.
- No changes to contact evidence, reminder timing, visit outcomes, databases, sent flags, communications or provider configuration.

## Verification

- New `tests/browser/phone-contact-offline-save.e2e.cjs` failed against the baseline at the full-target hit-test, reproducing the obstruction.
- After the fix it passed in Chromium and WebKit at 390×844: offline banner plus toast, nine-point Save hit-test, missing-selection validation, simulated write failure without mutation, successful retry, no-answer preserves communication purpose and sent flags, return-online reload retains exactly one record, unrelated modal stacking unchanged.
- Existing phone-contact and correction browser journeys passed in both engines. Their existing WebKit offline-reload exclusion remains: this fix does not certify that mode or physical iPhone behaviour.
- Full `npm test` passed after linking existing installed dependencies. Initial run without the dependency link stopped at ESM dependency resolution; no application failure was inferred from that setup error. No packages were installed/upgraded.
- Build changed only Follow-ups minified output; diff whitespace check passed. Synthetic local data only, no real calls/messages/provider requests.
- Screenshots: `/private/tmp/beelo-phone-save-offline-{chromium,webkit}.png`; full-suite log `/private/tmp/beelo-contact-save-unit.log`. Synthetic storage-error screenshot intentionally demonstrates visible error and reachable Save, not a real unresolved storage failure.

## Next

Deploy this isolated change only after the release step; current production is unchanged by this work. Physical-iPhone acceptance remains open. Fix premature same-day outcome reminders separately, with an explicit outcome-due policy and timing regression tests. Original user changes remain untouched.
