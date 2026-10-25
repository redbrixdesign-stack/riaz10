# Beelo working-memory MVP — sequential delivery plan

24 October 2026. Strategy and acceptance contract, not a claim that planned
features exist or that the product is pilot-approved. Muhammad asked to turn
the day-to-day working-memory purpose into an MVP, one verified slice at a time.
This authorises scoped development, not automatic feature removal, new paid
services, public claims, or guessed financial rules.

## Product outcome

A solo home-visit professional can capture something once, connect it to the
right work, and retrieve it when needed without searching scattered apps,
photo albums or paper receipts. Start with window-coverings sales, referred
surveys, fittings and service calls. Beelo is a private working layer beside
company software, maps, communications and accounting tools, not their replacement.

Questions the MVP must answer:

- What am I doing next, where, and what do I need to remember?
- What did this customer choose, measure, say or agree, and when?
- What remains for me to do or confirm? What is waiting on someone else?
- Where is this note, photo, recording, measurement or receipt?
- What work have I completed, what earnings are estimated, and what payments
  have I actually recorded as received? Never treat those as interchangeable.
- Can I still use saved information without connectivity and recover my records
  from a verified protected backup if this device is lost?

No claim to automatically read other apps, calendar/company diaries, WhatsApp
history, the photo library or a bank account. Import/capture and handoff are
not integrations. Location, camera, microphone and provider access remain explicit.

## Verified starting point

Source baseline: isolated release branch `codex/phone-contact-save`, runtime
`ded6891`, cache157, with documentation through `e966bea`. Original dirty
checkout is not a release source; preserve its unrelated work.

- Existing code: manual/scan visit capture and four work types, customer history,
  measurements/descriptions, typed/audio notes, optional online transcription,
  local photos, expenses/receipt images, trips, operational earnings estimates,
  editable communication drafts, tomorrow planning and protected backup.
- Evidence: current full fourteen-script local/hosted browser gates and live
  draft journeys. Human-assisted Simulator consultation capture/draft recovery/
  Save/reload/complete-note readback passed; this is not whole-app or physical
  iPhone certification. Exact native runtime version was not inspected.
- Customer page reads visits, communications, orders, measurements, voice notes
  and other records (`js/features/customer/customer.js`). It is not a verified
  global finder spanning notes, media and receipts. No dedicated global-search
  feature was found in `js/features/` during this review.
- Expense capture attaches a receipt and amount/category/description, but saves
  `new Date().toISOString()`; extracted receipt date is ignored. Edit Expense
  does not expose transaction date. Thus an older receipt cannot be accurately
  backdated through this flow (`js/features/money/money.js`).
- Tax estimates derive some earnings from visit/order timing, not independently
  reconciled cash receipts (`js/core/tax.js`). Raw CSV/HTML export is not an
  accountant-approved interchange or an MTD-compatible workflow.
- C14 intermittent WebKit offline failure remains unexplained. Native input
  delivery is intermittent; full physical checklist is unexecuted. No broad
  reliability, background mileage, provider or privacy assurance follows from
  the current browser passes.

See the [feature inventory](BEELO_RELEASE_FEATURE_INVENTORY.md),
[native acceptance checklist](BEELO_IPHONE_PILOT_ACCEPTANCE.md) and
[C22 evidence](audits/C22_DRAFT_STATUS_ORDER_2026-10-24.md).

## Delivery order — one releasable slice at a time

| ID | Scope and boundary | Acceptance before moving on | State |
| --- | --- | --- | --- |
| M0 | Define narrow MVP, inspect baseline and record gates | This plan distinguishes source/evidence, planned slices, safety limits and readiness | Complete as planning only |
| M1 | Trustworthy receipt capture: actual transaction date in new/edit expense, review extracted dates, retain receipt and entered values on failure | Synthetic historical receipt saves/reopens in correct date period; invalid dates rejected; no duplicate/dropped receipt; existing expense records preserved | Live `e8a1b52`, cache158; local/hosted/live browser verified. Native date-picker check blocked; not full MVP acceptance |
| M2 | Connect context: explicit customer/visit associations where appropriate, plus business-wide/unassigned items; review/correct links | Seven different window records/notes/photos reopen under intended customer; a general fuel/tool receipt need not belong to a customer; wrong link can be corrected without copying/deleting evidence | M2a expense/customer links live via C25; broader associations require inventory/acceptance |
| M3 | Find working memory: one deterministic local search entry, relevant type/date/customer filters and direct open of source record | Find synthetic customer by name/address, window description, typed/transcribed note and receipt description/date; clear empty/error states; no cloud indexing; audio is searchable by existing text/metadata, not untranscribed sound | M3a customer/visit/window text search live2c0ac31/cache164; M2b expense finder live separately. Unified expense/media entry and wider date/type filters remain planned |
| M4 | Prepare and close the day: next-visit brief and tomorrow plan reuse linked facts; one coherent pending-action view | Scan/manual entry → inspect context → plan/reorder without changing agreed time → review communication → record explicit outcome; resolved/expired work does not keep interrupting | Planned; retain existing lifecycle safeguards |
| M5 | Personal money clarity and accountant handoff | Separate work/order value, expected earnings and manually confirmed receipts with receipt date/reference; reconcile synthetic payment/expense evidence; reviewed export totals match original records, corrections do not double-count | Planned; calculation/payment model requires review, no rewriting historical earnings |
| M6 | End-to-end hardening and controlled pilot acceptance | Four work-type journeys, offline/return-online, updates, backup/download/different-key restore, media, keyboard/accessibility and physical Safari/PWA checklist; all critical failures resolved | Open; existing test evidence reused, gaps not called passed |
| M7 | Narrow pilot evidence and MVP decision | Repeated real-day use with informed participants; documented defects, support/recovery route and observed usefulness; owner accepts known limits before broader rollout | Proposed; no participants/traction/results claimed |

M1 is first because a wrong date makes evidence hard to retrieve and summaries
misleading. It is a contained improvement to an existing path, with no new
service/schema assumption. M2/M3 deliver the central connecting/finding value;
do not let a tax-reporting expansion displace them. Split each row further when
necessary rather than releasing several unrelated changes together.

## M1 implementation contract — next release

1. Default the editable expense date to today using UK date helpers, not a UTC
   date substring. Allow recording an older actual transaction date. Keep the
   date of capture separate if the existing record supports it; do not invent a
   historic transaction date or bulk rewrite existing rows.
2. Use the same explicit date on create/edit, receipt analysis and quick capture.
   A valid extracted date may prefill for review, never silently save; malformed
   or ambiguous dates require correction/confirmation. No paid provider call is
   needed for tests. Do not expand or alter current provider permissions here.
3. Reject missing/impossible dates and non-finite/non-positive amounts. Avoid
   permissive rollover parsing. Preserve historical time values when a date is
   not changed; review the existing UTC/UK period-filter conventions before
   selecting the representation for newly chosen dates.
4. Retain category/description/receipt, failed-save input and existing encryption.
   Guard against repeated Save taps creating duplicates. Any newly discovered
   receipt-session race is a separate diagnosed sub-slice, not a blind rewrite.
5. Test before/after UK midnight, a tax-year boundary and a historical receipt;
   verify persisted date plus which existing period view contains it. Do not
   certify the tax summary or deductibility from this test.
6. Build/regenerate only changed assets, then full regression gates and exact-build
   staged/live checks. Record whether native verification was automated, assisted,
   blocked or not run. No deployment is claimed by this planning document.

## MVP readiness is an evidence gate, not a feature count

Required end-to-end fixture: synthetic consultation → seven windows/context →
agreed next action; separately a referred survey/new customer, fitting linked
to its intended order, and a completed fixed-fee service call. Capture one older
receipt and a business trip; retrieve each without guessing its original screen.
Leave/reload/update through supported boundaries and verify exact values.
No real messages, publications, customers or paid-provider calls in automation.

Release blockers: data loss, false Save/backup success, wrong-customer/order
association, unintended duplication, unapproved upload/send, unlock bypass,
unreachable critical controls, broken offline core path, or misleading monetary
status/claims. Green desktop tests alone cannot close native/provider/background
or independent security/privacy/legal checks. C14 stays open until the failing
boundary is captured/diagnosed, not merely until another run passes.

For every slice: reproduce → minimum scoped change → source/compiled tests →
synthetic browser journey → full maintained gates → stage verified source →
compare served assets → promote same accepted build → live smoke → record
evidence/rollback/open limits. Preserve user data and unrelated dirty work. Do
not weaken assertions or repeat runs until green without diagnosing failure.

## Explicitly outside this MVP expansion

No CRM replacement, full accounting, HMRC/MTD filing, tax-compliance guarantee,
company-system connectors, autonomous messages, bank feeds, cloud sync/accounts,
team dispatch, social publishing expansion or speculative area/sports intelligence.
Existing prototype modules are preserved, not removed or newly pilot-approved.
Cloud transcription stays optional; core capture/search must not require AI.

Held decisions: net/gross survey commission basis, attended access/no-show fee
eligibility, provider/privacy limits, main-branch enforcement and final pilot
surface. Request the specific decision when it blocks a slice; ordinary bug-fix
authority is not permission to guess business or access-control rules.

Pilot measurements are proposals, not current metrics: can a participant retrieve
the requested item, how long/many taps it takes, capture abandonment, missing or
mislinked records, successful backup/recovery and reported evening admin. Start
with consented observation/feedback; no silent customer-content telemetry or
unverified savings/carbon/traction claims. Select targets before pilot testing.

## Current next action

M1 dates, M2a customer links, M2b all-date expenses and M3a customer/visit/window
text retrieval are live. Current runtime2c0ac31/cache164; final local20 and
exact hosted40155911005 pass; public Search and expense-finder journeys pass
both engines. Audit/limits: audits/M3A_WORKING_MEMORY_SEARCH_2026-10-25.md.
C25 resolved the automated C14 boundary through a narrow worker repair plus
negative contract/transport evidence and exact hosted acceptance, not a rerun
waiver; historical failures and physical-device limits remain documented.

Next M3b: connect expense/media discovery coherently to the existing Search,
reusing the all-date expense finder and source records rather than introducing
another separate search. Inventory photo captions and standalone recording
metadata before adding coverage; never imply raw audio/photo content is searched.
Date/type filters across the wider search remain planned. Preserve explicit
links/corrections, general-business receipts and existing capture flows. Then
M4 tomorrow planning/contextual pending work. Review period/payment/tax-summary
conventions separately before any financial-handoff claim. These releases did
not change calculations or add providers. Physical iPhone/VoiceOver/large-library
acceptance remains open; no whole-MVP or pilot approval is inferred.
