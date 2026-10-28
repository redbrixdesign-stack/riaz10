# Customer-centred follow-ups —28October2026

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
