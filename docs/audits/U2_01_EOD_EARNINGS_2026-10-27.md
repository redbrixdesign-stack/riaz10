# U2-01 — End of Day earnings

27 October2026. Sequential correctness slice; no other UX redesign included.

## Cause and change

The live audit reproduced a completed £20 service call in canonical earnings while
Tools → End of Day showed £0. Its separate sales-only reducer omitted service and
survey earnings and did not share the cancelled-sale filtering used by Money.

End of Day now reads `DB.getWeekStats(start,end)` for the current UK calendar day,
using exact UK-midnight bounds (including23/25-hour DST days). This is the same
existing read-only earnings calculation as Money, not a change in commission or
attendance rules. Completed survey earnings and attended service fees count;
no-show/incomplete/cancelled records do not earn service fees through this summary.
Outside-day entries are excluded. “Visits Done” is now “Results Logged”: a recorded
no-show result does not claim an attended/completed job. Read failure shows an
error and does not present a false zero or a misleading new summary.

The summary never writes earnings, booking status or outcome. The existing end-of-
day note/Done action is unchanged; turning notes into reminders remains U2-14.
No server/API/environment/provider change, schema change or migration. Today20,
cache170-eod-earnings, DB49 unchanged. Original dirty runtime is not used or edited.

## Verification

- Source/minified unit coverage uses the real canonical DB reducer with synthetic
  rows: sales122 + survey106 + attended service20 = £248; no-show, incomplete,
  cancelled and adjacent-day rows excluded; empty £0, no writes, read error;
  spring/autumn DST and year rollover bounds. Initial unit harness needed the app's
  currency setting; fixed without weakening assertions.
- Existing Money tests57 pass. Maintained Chromium/WebKit journey passes empty,
  mixed earnings, no writes, explicit offline cancellation correction/reload and
  read-failure display, foreign device timezone, no POST/provider calls. Screenshots
  saved. Unit and browser journeys are added to normal/release gates (25 journeys).
- Local units/social/performance gates passed. The local browser run stopped on
  communication-continuity's reply form: it opened the next form before the
  contact-attempt save/profile refresh was acknowledged. Failure screenshot/log
  retained. The test now awaits detached attempt form and the saved attempt text
  in the freshly rendered communication record, retaining all reply/offline/reload
  assertions. Corrected focused Chromium/WebKit journey passed; no communication
  production code changed. Do not describe the initial local full run as passed.
- Exact hosted run40456073621/sourcee8767f25e56e7662498a9d1eaef293129262ae0e
  passed units/server/dependency checks and all25 browser journeys. Downloaded
  summary verified exact commit/count/status before release.

## Deploy result

- URL: https://beelo.beelestial.co.uk/; production READY.
- Commit: e8767f2; staged production dpl_8h4n9T9eg4evN2vZHfV7vjx3X71m,
  https://beelo1-glojsiat0-beelomvp.vercel.app. Framework: Other/static PWA;
  build15.500s. Same tested stage promoted without rebuilding.
- Index, service worker and Today bundle match source on stage and public domain.
  Cache170/Today20; DB49 unchanged. Public Chromium/WebKit EOD checks passed.
- Function error/fatal scan05:34:43–05:44:43UTC found no logs. Client/native-device
  monitoring remains a gap; no drains or monitoring configuration changed.
  Rollbackcache169/dpl_H6BaKi37T5PbvKdefWJaMv64S6oZ.
- Synthetic evidence: docs/evidence/2026-10-27-eod-earnings/. Original non-doc dirty
  work remains preserved. No records/financial rules migrated.

## Next

UX02 selected-day capture, then UX03 return context and UX04 canonical attention.
Do not remove functions, merge records or infer customer agreement/sending as part
of these fixes. Native device acceptance remains distinct from browser WebKit.
