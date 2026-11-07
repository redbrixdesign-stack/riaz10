# Adviser workflow audit — in progress

Scope: solo window-coverings adviser/fitter, planning → capture → customer context → human-controlled communication → visit outcomes → earnings/expenses → end-of-day. Use only synthetic data; fix, verify and release each confirmed gap before moving on. Original dirty application checkout is preserved; isolated branch `codex/adviser-workflow-20261107` starts at released cache 188.

## AW-001 — Home selected date lost when opening Day plan — P1

**Confirmed:** Home → Tomorrow → Day plan opened today's plan. On a synthetic Friday 6 November, choosing Saturday 7 November opened 6 November. The same handoff could also give Add Visit the wrong date.

**Cause:** Home passed `date`, while the existing planner's validated selected-day contract is `planDate`. Its `today-plan` action therefore fell back to Today.

**Fix:** Pass the selected day as `planDate`. No planner redesign or stored-record migration.

**Evidence:** Red test reproduced `2026-11-06` instead of `2026-11-07`. New maintained browser journey `adviser-home-plan.e2e.cjs` passed Chromium and WebKit: visible Tomorrow control → correct plan → Add Visit keeps 7 November; calendar → June 2035 → correct future plan. Booking details retained; no external services, provider calls or messages. CommunicationArchive may change through the existing intended missed-message archiving, so that metadata is explicitly separate from booking details.

Full regression suite, existing planning-day/draft/date-boundary and planner-return checks passed. Build, versioned asset manifest and documentation guardrails passed. Cache 189 release identity/status is appended after deployment.

## Next audit steps — planned, not yet passed

1. Continue planning/capture with multiple visits, conflict handling and rescheduling.
2. Prepare each appointment type: sales, survey referral, fitting and fixed-fee service call.
3. Verify customer context, pending actions and communication handoff/sent/agreement evidence.
4. Follow travel/arrival, notes/media, completion/cancellation and next-customer selection.
5. Review adviser earnings, linked expenses/mileage and end-of-day records.

## Evidence limits / observations

A separate Tomorrow-tab timeout occurred once under automated startup load; diagnostic handler tracing subsequently passed both engines. No independent production defect or root cause has been established for that timeout, so no tab fix is claimed. Keep watching it in the remaining journey.

This is a running audit, not a certification that the whole app has been checked.

### AW-001 deployed and live-verified

Runtime `651496f`, cache 189. Exact production deployment `dpl_2pY71bZwRdNg13igtPCfwdFqAZYt` (`beelo1-d9fp67ik8-beelomvp.vercel.app`) was staged, authenticated asset-verified and promoted without rebuild to https://beelo.beelestial.co.uk/. Public changed assets match tested hashes. Public-origin Chromium/WebKit Tomorrow/future-plan/Add-date acceptance passed, with no external contact or provider calls. Evidence saved alongside the reproduction screenshots.

## AW-002 — Home can feature the wrong customer while working — P1

**Confirmed:** With an earlier unfinished booking and a later visit marked on site, Home still featured the earlier customer and its Navigate action. Synthetic browser assertion reproduced `SYNTHETIC Earlier` instead of `SYNTHETIC Active`.

**Fix:** Today's featured visit follows the newest recorded arrival/travel-start signal among unfinished visits; otherwise it uses booked order. A newer journey can supersede an older forgotten on-site timer. Same-instant arrival takes priority; cancelled/completed/result-recorded visits cannot displace the active customer. A fresh in-transit status is not mistaken for a new arrival because of older arrival metadata. Future-day planning remains in booked order. Earlier unfinished visits stay in Remaining today.

**Evidence:** Active-visit browser journey passed Chromium/WebKit: on-site priority, current finish action, newer journey with older timer still open, no inferred arrival from old timestamps, retained earlier visit and booked-order fallback. Booking/timer/outcome/earnings fields compared unchanged across Home rendering (intended communication-archive metadata excluded); trip count stays zero; no outside requests or messages. Home visual/search/calendar/customer/notes regression journey passed both engines. Unit cases cover signal ties, cancelled states, completed outcomes and invalid arrival evidence. Financial formulas and tracking services are unchanged.

Cache 190 deployment identity/status is appended after promotion and live verification.

### AW-002 deployed and live-verified

Full regression suite passed. Runtime `0641529`, cache 190. Exact production deployment `dpl_4KMvYTDSEaYD3rnq3FaMR8nPTEJ8` (`beelo1-g0dgpqxvw-beelomvp.vercel.app`) was staged, asset-verified and promoted without rebuild. Public changed assets match tested hashes. The active-visit journey passed on the public origin in Chromium/WebKit, including the newer-journey/forgotten-timer case and unchanged booking/timer/earnings fields.

## AW-003 — Deferred fitting date disappears after survey — P1

**Confirmed:** Complete a referred survey with an order amount, then choose **Date not agreed yet**. The order is retained, but the customer workspace previously had no actionable reminder to arrange fitting. Red test reproduced zero “Review fitting date” actions.

**Fix:** The explicit deferral saves a pending fitting-date decision on that order. The customer next-action panel offers **Review fitting date**; deferring there stays in the same customer workspace. A linked, non-cancelled fitting clears the action, including a previously snoozed durable reminder. Cancelling that fitting restores the outstanding decision once; a fitted/cancelled/archived order stops it. Historical orders without this explicit decision do not acquire invented fitting obligations. Failed saves keep the prompt open with an error; failed diary reads show a retry action rather than claiming no fitting exists.

**Boundaries:** No customer agreement is inferred, no appointment is created by deferral, no communication sends, no accounting/payment changes. Survey earnings remain £80 on the synthetic £1,000 order at the configured 10% normal / 8% survey rate. The £0 external collection balance is not treated as proof of fitting completion.

**Evidence:** Maintained encrypted-storage Chromium/WebKit journey exercises actual survey outcome and fitting forms, profile deferral/reload, injected failed save/read, offline fitting save, durable snooze reconciliation, cancellation and completed-order suppression. All outside traffic is blocked; the existing startup address-lookup attempt after reload is recorded separately and never delivered. Native/physical iPhone acceptance is not claimed for this step. Deployment evidence follows after release checks.

### AW-003 deployed and live-verified

Runtime `7d6346e`, cache 191; exact deployment `dpl_FwejnUbgTt7KhctidfvLJpvPK3No` (`beelo1-f2zbyl125-beelomvp.vercel.app`) staged, 11 selected assets hash-verified, then promoted without rebuild. All 39 maintained browser journeys and the full unit suite passed. Changed public assets match tested hashes. Public-origin Chromium/WebKit fitting lifecycle passed; stable pending-action screenshots visually inspected. Recent deployment error-log query returned zero rows (bounded observation, not an absence-of-all-errors guarantee). No provider requests or customer communications delivered by the synthetic journey. Physical iPhone/VoiceOver acceptance remains separate.
