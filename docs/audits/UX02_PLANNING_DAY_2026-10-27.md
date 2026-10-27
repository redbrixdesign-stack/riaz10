# UX02a — selected day in manual Add Visit

27 October2026. Separate slice after U2-01 End of Day release.

## Cause and implementation

Today/Tomorrow planner's Add visit button supplied only `action:add`; the form
correctly honoured a supplied date but had none, so defaulted to today. The button
now passes the displayed UK planning date. It never writes or moves bookings.

Focused foreign-timezone/DST checks also exposed `Utils.getTomorrow` using device-
local `setDate` on a UK-midnight instant. It now constructs the next UK calendar
midnight directly, including23/25-hour DST days and month/year rollover. Other
date helpers/rules are unchanged. Utils13/Appointments66/cache171; DB49 unchanged.

Existing encrypted unfinished-visit recovery is preserved: explicitly resuming a
prior draft keeps its own date, rather than overwriting it with the newly opened
plan's date. No implicit draft discard, appointment creation or communications.

## Scope boundary

This fixes manual Add Visit from the planner. OCR's separate no-date fallback and
scan return context are **not included**; scanned documents with an explicit date
still use their existing logic. UX02b will address selected-day scan hand-off as a
separate tested release. UX03 return navigation remains pending.

## Verification in progress

- Source/minified units pass under America/Los_Angeles and Pacific/Kiritimati;
  Today/Tomorrow button arguments, exact UK tomorrow midnight, both DST changes,
  year rollover and late UK evening. Existing date/time suite passes.
- Maintained Chromium/WebKit journey: actual planner Add clicks yield the right
  date; empty forms create no booking; encrypted offline draft/reload works;
  explicit resume from another day's planner retains original date; no sends.
  Screenshot inspected. Added to normal/release gates (26 journeys).
- Local full gate, exact hosted40457388671/d012065c0e07a03f24fb9a8fe7b7601c878ac596
  and production stage verification: local full26 passed. Hosted stopped on the
  unchanged expense-finder journey after editing an exact-amount result; it did
  not capture final route/data, so root cause is not proven. Failure log/artifact
  retained. Release held, not ignored.
- Test-only follow-up now waits for cancelled editor detachment and confirmed
  amount write, asserts finder-return provenance, entered amount and retained
  amount filter, and saves route/filter/data/screenshot diagnostics on failure.
  No filtering assertion removed or production Money code changed. Focused
  Chromium/WebKit passed. The original intermittent failure's exact cause remains
  unproven, not claimed fixed in production Money code.

## Deploy result — LIVE

- URL https://beelo.beelestial.co.uk/; production READY; runtime d012065;
  exact test-only follow-up7201ba1d41b655d05232fcdb3f8f5ea32b0833f3.
- Hosted40458417751 passed all26 journeys plus units/server/dependency gates;
  downloaded summary verified. Only the diagnostic test differs from d012065.
  Full local26 passed; focused stronger finder checks passed both browsers.
- Production stage dpl_5jWs8rC5Fp84cKptKspqbBuQ7Zq3,
  https://beelo1-8e6x15o2o-beelomvp.vercel.app, promoted without rebuilding.
  Framework Other/static PWA, build12.874s; cache171, DB49 unchanged.
- Index/SW/Utils/Appointments bundles byte-match staged and public source. Public
  Chromium/WebKit focused journey also passed explicit Save: stored UK date28Oct
  after tomorrow selection on27Oct, confirmed status; no automatic booking/send.
  Separate full-Save probe retained in evidence alongside maintained recovery test.
- Bounded function error/fatal scan05:59:30–06:09:30UTC empty. Native/client/long-term
  monitoring not certified; no drains/configuration changed. Rollbackcache170,
  dpl_8h4n9T9eg4evN2vZHfV7vjx3X71m.
- Evidence docs/evidence/2026-10-27-planning-day/. Earlier failed hosted evidence
  retained, not overwritten. Next UX02b scan no-date fallback, then UX03.

No operator/API/environment/data migration changes. Original dirty runtime is
preserved. Browser WebKit is not physical-device/VoiceOver certification.
