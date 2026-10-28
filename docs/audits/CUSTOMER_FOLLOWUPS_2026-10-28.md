# Customer-centred follow-ups —28October2026

## Current status — both slices LIVE, cache176

- Runtime e6d07dc3a40a1e0309ab5cb3cab74d4d97532f52: App47/Customer20/
  Followups31/Talk34, cache176-focus-safe-worklist; DB49 unchanged.
- Customer profile owns linked next actions, existing draft/sent/contact controls,
  reminders and collapsed phone-contact history. Global Follow-ups is a compact
  customer work list; personal/unlinked work and legacy routes remain available.
  Counts still reflect canonical actions, not customer-row count. No automatic
  sending, delivery inference, financial, scheduling or attendance-rule changes.
- Final local release and exact hosted40616652175 passed all30 maintained browser
  journeys; hosted root/server/dependency gates also passed. Hosted summary
  identifies exact source e6d07dc; local runner summary has null sourceCommit,
  with invocation/source checkpoint retained here. Earlier failed gates and
  controlled negative reproduction results remain below, not represented as passes.
- Production stage dpl_2xwq5GjkdnpgDaw1oDDTtfn9GfDg, target productionREADY,
  beelomvp/beelo1, Other/static PWA, build13.340s:
  https://beelo1-9vyqgyoxt-beelomvp.vercel.app was promoted unchanged to
  https://beelo.beelestial.co.uk/ after gates passed. Cache175 was never promoted.
- Public customer-worklist AND customer-followups journeys passed Chromium/WebKit:
  customer isolation, canonical grouping, reminder/snooze/complete, explicit
  sent/not-sent, mock external handoff, phone agreement/retraction, reply/back,
  keyboard focus/trap, responsive widths and offline/reload. No real contact or
  provider request. Public five-asset SHA256 parity matches tested/staged source.
  Compact public work-list screenshot visually inspected. These synthetic browser
  checks do not certify native iPhone, installed WhatsApp return or VoiceOver.
- Production function error/fatal scan01:46:26–01:56:26UTC found no matching logs;
  not comprehensive client/native monitoring. No drains/credentials/config changed.
- Rollback: verified slice1/cache174, dpl_4EBQMfKv2NSv1QanoyYwCvdp8qaf /
  https://beelo1-mhanza78z-beelomvp.vercel.app. Save open work before Update and
  reload; do not clear app data. Original runtime dirty diff remains unchanged:
  8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
- Evidence: docs/evidence/2026-10-28-customer-worklist/final-* and public screenshots;
  slice1 evidence remains in docs/evidence/2026-10-28-customer-followups/.
- Next: native phone acceptance, then separately assess Home attention duplication
  and broader return-context/density backlog. This is not a claim all app audit
  issues are fixed or any new feature is pilot-approved.

## Implemented slice1 (live; checkpoint below)

Story: customer profile → existing FollowupsFeature.loadTasks/TaskService and
encrypted local records → customer-linked next actions → existing explicit
review/contact/sent/snooze/complete controls → refreshed same customer profile.
No new API, provider, credentials, database schema or separate reminder engine.

- Next actions placed before communication history: one due action visible,
  other due/later/snoozed actions collapsed; pending hand-off status prioritised.
- Customer association uses stable linked IDs, including customer, appointment,
  order, quote, job, invoice and aftercare records. Conflicting associations and
  unlinked personal reminders are not assigned by name/phone or last profile.
- Add reminder uses existing task storage, validates the customer and modal
  owner, and saves customerId. Complete/snooze, factual phone contact/correction,
  Already sent and hand-off decisions stay in this profile and refresh actions.
- Actual draft hand-off refreshes profile so pending status is available after
  return/reload, with no automatic confirmation popup or send inference. Original
  opt-out, booking-snapshot, atomic-send and advisor-approval guards retained.
- Reopening the current profile from its own action card is hidden. Unsupported
  Snooze on a pending send-status item is replaced with an explanation: record
  sent/not-sent first, then snooze any remaining reminder. No evidence deleted.
- Load failure is displayed rather than a false empty panel when task loading
  rejects. Existing internal task loaders still have some read-error fallbacks;
  this slice does not claim complete observability of all underlying reads.
- Canonical task loading retains existing reconciliation of obsolete tasks;
  opening a profile does not introduce a second completion rule or infer a send.

## Verified so far

- Source/minified units: all supported stable associations, conflict/unlinked
  isolation, priority/collapsed groups, escaped names, dead-end controls,
  empty/rejected-load distinction, preserved same-profile route parameters.
- Focused synthetic Chromium/WebKit journey passed: two customers' pending
  hand-offs isolated; introduction-only confirmation leaves reminder; actual
  review/hand-off uses a mock opener only; not-sent preserves reminder; Already
  sent clears relevant purpose; linked manual reminder creation/completion;
  snooze offline and persistence after reload; third empty customer; rejected
  task load/retry; widths320/390/768; zero external POSTs or contacts.
- Initial browser test queried a native summary as a button; corrected test to
  target the actual summary, preserving the snooze assertion. No source change
  was needed for that locator. Earlier failure capture retained separately.
- Screenshot visually reviewed. Browser-engine checks are not physical-iPhone,
  WhatsApp delivery, provider, microphone or VoiceOver certification.
- Additional retained synthetic phone probe passed Chromium/WebKit: no-answer
  retains the task; explicit introduction/agreement clears the purpose, stays
  in the profile and creates neither sent flags nor cancellation. This is a
  separate probe, not a claim that the maintained29-journey fixture covers it.

## Scope boundaries / next slice

- The cross-customer Follow-ups list is still the existing full list in slice1.
  Planned next: concise customer work list opening the profile's relevant action,
  preserving unlinked/supplier/personal tasks and legacy deep links.
- Planner→customer and notes-save return continuity remain separate audited work.
- Profile task loading currently uses the global canonical loader; measure cost
  at larger data volumes before claiming scalability. No CRM/accounting/filing
  positioning or financial-rule changes.
- Original dirty runtime changes remain untouched; implementation/build/deploy
  only in the isolated phone-contact-save checkout. Non-doc original diff hash:
  8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.

Customer18/Followups30/Talk34/cache174; DB49 unchanged. Release checkpoint follows
only after exact source gates and public verification.

## Staging checkpoint

- Runtime source f4c005991aeda99cf4b75037602c093af45f4820. Focused final units and
  Chromium/WebKit pass. Local full29-journey passed; exact hosted40610652178 running;
  hosted root/server/dependency job passed, browser job pending completion.
- Staged productionREADY dpl_4EBQMfKv2NSv1QanoyYwCvdp8qaf,
  https://beelo1-mhanza78z-beelomvp.vercel.app, target beelomvp/beelo1,
  Other/static PWA, build10.513s. Index/SW/customer/followups/talk bundle SHA256
  matches source. Not promoted at this checkpoint; live remainscache173.

## Slice1 release checkpoint — LIVE

- URL https://beelo.beelestial.co.uk/; tested stage
  https://beelo1-mhanza78z-beelomvp.vercel.app; productionREADY,
  beelomvp/beelo1, dpl_4EBQMfKv2NSv1QanoyYwCvdp8qaf.
- Commit f4c005991aeda99cf4b75037602c093af45f4820; Other/static PWA;
  build10.513s. Promoted the same stage, no rebuild or configuration change.
- All29 local and exact hosted40610652178 browser journeys passed with
  build/unit/social/performance/server/dependency gates. Public Chromium/WebKit
  customer journey passed; five public assets match source. No real contacts.
- Error/fatal function scan28Oct00:45:04–00:55:04UTC found no matching logs.
  Not client/native monitoring; drains and monitoring configuration unchanged
  and not inspected here. Rollbackcache173/dpl_AkHKHzddnyyNa8JdhM156eLvMPA2.
- Evidence docs/evidence/2026-10-28-customer-followups/: focused/public PNGs and
  logs, local/hosted summaries, separate phone probe, held locator screenshot.
- Next: compact customer work list and visit-phone-history visibility in profile.

## Implemented slice2 — staged release gate pending

- Source aa8b94527699fb57fe4bfa3adc199c659d4aaf9d. Follow-ups now renders one compact
  customer row within each due/later/snoozed section, using the same canonical
  task associations/counts. It opens the customer's Next actions and history,
  rather than duplicating review/send controls in both places. Personal,
  unlinked, conflicting or deleted/unreadable-customer tasks stay individually
  actionable; no work is hidden merely because grouping cannot resolve it.
- Customer profile Back returns to Follow-ups when entered from this work list.
  Logging a reply/contact attempt preserves this return context. Other direct
  profile links keep the ordinary diary fallback; arbitrary return URLs are not
  accepted. This is not a general planner/notes/edit return rewrite.
- Communication record now includes collapsed adviser-recorded visit-phone
  outcomes and retractions, matched by customer/provenance/channel. Original
  records remain; dates can be missing and malformed entries are tolerated.
  One review/correction control per visit, not per history row. These are not
  imported call logs, delivery evidence or client-reliability scores.
- Source/minified units and focused Chromium/WebKit pass: grouping/priority,
  escaped names, unresolved-link fallback, phone provenance/retraction/malformed
  history, preserved reply route; real work-list→profile→Back/keyboard flow,
  phone no-answer/agreement/retraction with restored reminder, personal task
  completion, offline navigation/reload, widths320/390/768 and unchanged booking/
  send flags. Existing multi-customer communication-resolution journey updated
  to use customer rows/profile controls; all original send-state guards retained.
- Full30 local and exact hosted40612756452 running. Customer19/Followups31/
  Talk34/cache175; DB49 unchanged. Not live at this checkpoint; live is slice1.
- Staged productionREADY dpl_E6yp3q77hNFouJW7vDJgidbD8XKF /
  https://beelo1-s8zljg2av-beelomvp.vercel.app, beelomvp/beelo1, Other/static,
  build15.071s. Protected index/SW/customer/followups asset SHA256 matches source.

## Slice2 held-gate investigation (no Money runtime change)

- Local full30 passed ataa8b945. Hosted40612756452 failed expense-finder line25:
  immediately after number-input fill, actual12.5 versus expected12.75, before
  Save. Retained JSON shows original stored amount/filter and date-field focus
  screenshot; the original run does not contain a complete focus-event trace.
- Existing App.openModal schedules first-control focus on requestAnimationFrame;
  Playwright number fill can overlap that focus hand-off. A separate controlled
  probe deferring first-control focus until the number fill's microtask boundary
  reproduces unchanged12.5/date focus/no Save in both Chromium/WebKit. An initial
  immediate-focus injection did not reproduce it and is retained as such.
- Maintained test now waits for the real initial date-field focus before filling
  the amount, retaining its exact12.75 assertion, atomic write, receipt/date,
  filter-return and offline checks. Failure diagnostics add editor value/focus/
  modal depth. This is a test-only change; no Money, modal-focus or financial
  calculation runtime changed. It is consistent with the hosted symptom, not
  a claim that a production accounting bug was fixed. Native fast-input/focus
  interactions are not certified by this test-harness adjustment.
- Staged/runtimeaa8b945 remains held until the corrected focused test and fresh
  exact hosted gate pass. No blind rerun or promotion of the failed gate.
- Corrected expense-finder focused journey passed Chromium/WebKit, all original
  Save/date/receipt/filter/offline assertions retained. Test-only follow-up
  0bc65fc1dea23434438849089b4f7b6da186e9e6 differs fromaa8b945 only in that fixture;
  fresh exact hosted40614186192 running. No runtime rebuild needed.
- Additional scoped axe4.13/WebKit check found zero automated violations in
  visible work-list #main, #customer-followups and expanded #customer-phone-history.
  This is limited to these states, not full-app/VoiceOver/WCAG certification.

## Focus-safe final candidate (supersedes cache175; not promoted yet)

- Hosted40614186192 passed expense-finder but failed WebKit customer-worklist
  waiting for the reply form to close. Capture shows an empty reply and focused
  channel selector. Original full focus-event sequence was not captured; retain
  this limitation rather than claiming an exact event trace.
- Review found two unsafe deferred-focus paths: App's next-frame initial focus
  could override an already-selected dialog control; profile's240ms restoration
  could focus its background heading while a modal is active. The latter is
  demonstrated directly against0bc65fc source; old minified App also fails the
  new chosen-control unit assertion. A separate whole-modal microtask attempt
  did not reproduce the blank reply and is retained as a negative result.
- Fixed App.focusFirstControl to respect current in-dialog focus and content
  ownership/detachment. Profile restoration now skips active regular/full-screen
  dialogs and hidden documents. Default first-control focus, keyboard trapping,
  stored values, money rules and send/approval guards remain unchanged.
- New source/minified units cover default/user/onOpen focus, stale/replaced/
  detached content, normal profile restoration, active modal and route revision.
  Maintained browser journey now explicitly checks delayed dialog focus,
  background-profile focus, default first focus and Tab/Shift+Tab trap, plus exact
  typed reply value before Save. Future failure captures add reply/focus/modal/
  route and synthetic communication diagnostics. Focused Chromium/WebKit pass.
- Final sourcee6d07dc3a40a1e0309ab5cb3cab74d4d97532f52:
  App47/Customer20/Followups31/Talk34/cache176, DB49 unchanged. Customer version
  bumped again to avoid immutable staged-cache reuse. Full30 local and exact
  hosted40616652175 running; cache175 candidates were never promoted.
- Stage productionREADY dpl_2xwq5GjkdnpgDaw1oDDTtfn9GfDg /
  https://beelo1-9vyqgyoxt-beelomvp.vercel.app, beelomvp/beelo1, Other/static,
  build13.340s. Index/SW/App/customer/followups SHA256 matches source. Live remains
  verified slice1/cache174 until this final release gate passes.
