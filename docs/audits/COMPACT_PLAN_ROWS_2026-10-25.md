# Compact planning rows — 25 October 2026

## Story and scope

Muhammad requested a less bulky Plan Tomorrow with client name, arrival window,
proposed time and address in each row. Baseline75b49da (live runtime2c0ac31,
cache164). Existing planning used large cards with reorder controls, notes,
message status and three actions always expanded. Existing storage, reordering,
time-proposal/customer-agreement and scheduling-check logic already exist.

Change only shared Today/Tomorrow plan presentation in appointments.js and
prefixed components.css rules. No database/schema/provider/financial,
communication or route-calculation change; no removals of existing functionality.

## Implemented prototype

- Divider-separated rows, not large cards. Four requested facts remain visible.
  Narrow screens place address below name/times; wider view shows four columns.
  Missing address/arrival window remains explicitly unrecorded, never invented.
- Name opens original visit; proposed-time control reuses existing proposal
  sheet. Pending time says Not agreed, and does not replace the booked time.
- Native collapsed Details & actions retains booked diary time/type, access/
  customer/visit notes, communication status, message-review/saved drafts,
  review visit and keyboard-accessible move-up/down buttons.
- Compact drag handle keeps the existing pointer reordering path. Route preview,
  reset order, Today/Tomorrow selection, add visit and empty/error states retained.
  Shorter toolbar labels keep their existing descriptive accessible names.
- Native details summary, explicit labels/focus styles and wrapped long text.
  No sideways page scrolling is intended; no physical/VoiceOver certification.

## Verification contract

- tests/compact-plan.test.js: source/minified render contract, four fields,
  missing data, escaping, collapsed retained context/actions, active visits only,
  saved plan order, today-specific messaging/empty/error boundaries and no writes.
  Old75b49da renderer fails the expected compact-row assertion.
- New maintained tests/browser/compact-plan.e2e.cjs: seven unmistakably synthetic
  visits, real local encryption setup, Chromium/WebKit320/390/768 layouts;
  closed rows under180px, no page overflow, keyboard disclosure/move actions,
  real mouse-pointer capture reorder, original date preservation, proposal
  without agreement, offline order save, return-online reload, route warning/
  reset and direct original visit. External origins blocked, no POSTs/sends.
- Full maintained browser acceptance expands from20 to21 scripts with no gate
  or timeout relaxation. The existing legacy tomorrow-plan journey is adjusted
  only to expand the now-collapsed actions and accept an explicit fixture URL;
  all its assertions remain, including cold-offline and next-morning behavior.
- Focused screenshots visually inspected at390px and768px. Initial long-lived
 8023-server run did not leave Home and is retained as a failed standalone run,
  not passed evidence or a proven production defect. Fresh isolated8037 server
  reached the full flow; an initial test predicate dereferenced a transient
  missing row during async rerender. Null-safe waiting fixed the test, not app
  timeouts/assertions. Final focused two-engine run passes.

Final acceptance, deployment and public verification are recorded below.
Evidence lives in docs/evidence/2026-10-25-compact-plan/.

The preliminary full gate stopped at context-encryption.e2e.cjs: saved access
notes were correctly present but hidden in the new closed details section.
Updated that journey to expand details before each existing visibility check,
including after reload/offline navigation. All encryption/migration/export/
offline assertions and timeouts are retained; the failure log is preserved.
The older shared-message entry journey also opens the disclosure before its
unchanged message assertions. The adjusted legacy tomorrow-plan journey passes
its full route/cold-offline/next-morning behavior checks on the isolated server.

## Decisions and remaining limits

Keep four facts glanceable without horizontal scrolling on a phone; address
wraps rather than disappears. Do not auto-fill an agreed time from proposed
order, infer customer consent, send a message or treat a preview as optimisation.
Collapsed controls remain reachable by keyboard; native touch, physical iPhone
and VoiceOver still need device acceptance. The change also applies to Today
because both views intentionally use the same renderer; day-specific actions
and stored planning keys are unchanged. Original dirty checkout is not a build
source and its unrelated changes must remain byte-identical.

## Final release — LIVE

Final source51171652acb6a9168d501bca77db0fed7e4b7143 (UI code introduced
in c603f69; subsequent fixes are test disclosure interactions). Final full local
npm run verify:release passes all21 maintained browser scripts, unit/server/
social tests and unchanged performance assertions. Exact-source hosted
40206831224 SUCCESS, all21 plus unit/server/dependency scans; downloaded summary
records the same SHA. Earlier40206672935 was superseded/cancelled, not accepted.

READY dpl_GhGZGiXFD1bkiMZvSyS6gJETzqaj, exact
https://beelo1-51dwzmfjq-beelomvp.vercel.app, Other/build13.519s, was promoted
without rebuilding to https://beelo.beelestial.co.uk/. Appointments64/
components.css60/cache165-compact-plan. Four changed staged and public assets
byte-match source; no DB/schema migration. Previous M3a/cache164,
dpl_AmJp1XqwpFF9rmZQgoHrxw68yxJ3, is rollback; preserve site storage.

Live compact-plan and existing working-memory Search journeys pass Chromium/
WebKit in fresh synthetic stores: no POSTs/provider contacts or real records.
Reordering and saving proposals preserve original booked times; offline saves
and return-online reload retain the plan. Final screenshots inspected. Physical
iPhone/touch/VoiceOver and whole-MVP/pilot acceptance remain open. A10-minute
production error/fatal scan15:26–15:36UTC returned no logs, not monitoring/security
assurance. No credentials, environment, providers or marketing changes.

Original checkout's unrelated non-doc diff remains byte-identical:
8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
Build/deployment used the isolated release checkout only. This is a presentation
slice, not completion of M4 planning logic; M3b expense/media discovery remains
the recorded next MVP priority.
