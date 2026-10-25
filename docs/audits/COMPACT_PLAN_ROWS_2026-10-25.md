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

Final full acceptance, deployment and public verification are recorded below
after they complete. Evidence lives in docs/evidence/2026-10-25-compact-plan/.

## Decisions and remaining limits

Keep four facts glanceable without horizontal scrolling on a phone; address
wraps rather than disappears. Do not auto-fill an agreed time from proposed
order, infer customer consent, send a message or treat a preview as optimisation.
Collapsed controls remain reachable by keyboard; native touch, physical iPhone
and VoiceOver still need device acceptance. The change also applies to Today
because both views intentionally use the same renderer; day-specific actions
and stored planning keys are unchanged. Original dirty checkout is not a build
source and its unrelated changes must remain byte-identical.
