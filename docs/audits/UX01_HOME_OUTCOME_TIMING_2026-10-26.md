# UX01 — Home outcome reminder timing

26 October 2026. First independently tested/released slice of the approved UX simplification sequence; other recommendations are not included in this change.

## Verified cause and implementation

Home and the evening-review answer counted every unlogged visit today, including future or still-in-progress bookings. Follow-ups already used `Utils.visitOutcomeDueAt`: scheduled start plus configured slot duration, not arrival-window end. `CompanionFeature.outcomesAwaitingResult` now shares that boundary and requires a confirmed, unresolved visit on the current UK day. Both Home and evening review use it.

This is a reminder, not proof of attendance or automatic completion. No bookings, outcomes, earnings, media, message state or schema are changed by the new helper. Existing duration defaults remain; this slice does not add automatic arrival detection or live overrun inference. After-visit “still to do” guidance remains distinct from overdue-result warnings.

## Verification

- Source and generated/minified unit tests: future, ongoing, exact finish, completed/cancelled/draft, invalid or other-day booking, legacy duration, arrival-window independence, DST and no booking/earnings writes.
- Existing outcome-timing and companion suites pass. New unit test is in `npm test`.
- New maintained Chromium/WebKit journey verifies Home/evening/Follow-ups agree before/during/exact planned finish; excluded states; a foreign device timezone; no booking/status/earnings mutations; explicit offline reschedule clears the alert and survives acknowledged-write/reload. Synthetic data only, no provider calls or messages.
- Initial browser assertion was reading before asynchronous Home rendering finished. The harness now waits for the expected rendered attention state, retaining both the direct data and UI assertions. No product rule was weakened.
- The maintained browser release suite now includes24 journeys. Full local release gate passed; exact hosted run40414378273 at309270b82faf4e6f30f145ee106a011456fe60ec completed successfully, downloaded summary verifies all24 passed.

## Released27 October2026

- Production READY: https://beelo.beelestial.co.uk/, staged production build
  https://beelo1-hnlg9teb7-beelomvp.vercel.app,
  dpl_H6BaKi37T5PbvKdefWJaMv64S6oZ; Other/static PWA; build15.668s.
  Intended teambeelomvp/projectbeelo1 verified before promotion. No rebuild.
- Source309270b. Index, service worker and Companion bundle byte-match both the
  tested stage and public custom domain. Cache169-home-outcome-timing; DB49 unchanged.
- Public maintained Chromium/WebKit journey passed: scheduled finish boundary,
  excluded completed/cancelled states, explicit offline reschedule and reload,
  no automatic booking/earnings writes and no sends/provider requests. WebKit
  screenshots inspected. Physical iPhone/VoiceOver remain unverified here.
- Bounded function error/fatal scan05:17:14–05:27:14UTC27 October found no logs.
  This is not client-error or long-term monitoring certification; no drains or
  monitoring configuration changed. Rollback: prior cache168 production
  dpl_C9vBuonBtMaRtTPiQtFbiUutX82Q / beelo1-qcu3u848l-beelomvp.vercel.app.
- Evidence: docs/evidence/2026-10-27-home-outcome-timing/.
  Original non-doc dirty hash unchanged:
  8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.

## Scope and next

Only Companion source/bundle, version/cache references and tests changed; package scripts add coverage but dependencies are unchanged. Companion33/cache169-home-outcome-timing, DB49 unchanged. The dirty original runtime remains untouched. The second-pass audit reprioritised the next separate slice: U2-01 End of Day totals, then UX02 selected planning day, UX03 return context and UX04 canonical attention before visual simplification. Physical iPhone/VoiceOver remain field checks; browser WebKit is not device certification.
