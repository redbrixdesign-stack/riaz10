# Navigation, communication and scheduling audit — 6 November 2026

Status: all five scoped releases completed and live at https://beelo.beelestial.co.uk/.

Focused source/UI audit with synthetic data, followed by the maintained full
regression suite. Findings were reproduced before correction. Each release was
validated and published before the next runtime change began. The landing site,
provider settings, financial formulas and original user working tree were not
changed. No pilot approval or commercial-release status is inferred.

## Verified corrections

| Severity | Finding and reproduction | Result |
| --- | --- | --- |
| P2 | Follow-ups duplicated the primary navigation despite Visit/customer actions. | Bottom bar is Home / Orders / Money / Tools. One Follow-ups tile in Tools → Customer retains the all-customer/personal-task overview and Back to Tools. Visit/customer actions remain available. |
| P2 | Record an introduction/reminder as sent and a customer agreement; canonical tasks are empty, but Home/evening still claim a message unsent. | Home, evening, post-visit and Messages queries use shared task state. Unknown handoff is awaiting sent status; a failed task read does not become an all-clear. Obsolete parallel counters/template suggestions removed. |
| P2 | Send the original reminder, then use standard Move to change the date. Old reminder flag survives and suppresses the new reminder. | Changed date/window/type invalidates only the old reminder flag. Introduction, communication history, encrypted notes and earnings remain. Move displays/saves UK diary time across device time zones. |
| P2 | On a Kiritimati device, 10:00 UK produces an outside-hours warning and suggested slots on the wrong day. | Capacity envelopes and suggestions use the shared UK-time conversion, also used by Move/proposals. Overlap/leave/exclusion checks remain. Missing/ambiguous DST times are rejected. |
| P2/P3 | Visits’ separate Follow-ups tab shows age-derived sales probabilities, opens a duplicate contact modal, and uses non-keyboard DIV cards. Tools labels include icon words. | Retained list is “To revisit”, with neutral recency groups, clear outcomes and unchanged quote amounts. Keyboard-operable cards open the existing Visit workspace. Redundant modal and unsupported displayed probabilities removed. Tools decorative icons are hidden from accessible names. Legacy grouping configuration retained. |

## Releases and evidence

All releases passed build, full unit, social and performance-gate checks. Browser
acceptance counts below are maintained synthetic journeys, with Chromium/WebKit
checks; they are not counts of real users or pilot participants.

| Cache | Runtime commit | Local / hosted journeys | Hosted run | Exact production build |
| --- | --- | --- | --- | --- |
| 182-followups-tools | e0876c8f579cbca4ecb6e4381ffea78461e43cec | 33 / 33 | [42170669286](https://github.com/redbrixdesign-stack/riaz10/actions/runs/42170669286) | [de6mvfvyq](https://beelo1-de6mvfvyq-beelomvp.vercel.app) |
| 183-message-summaries | cce588b76c4c83bea6c4e2300a9d631699799c33 | 34 / 34 | [42172498605](https://github.com/redbrixdesign-stack/riaz10/actions/runs/42172498605) | [1ccarllo5](https://beelo1-1ccarllo5-beelomvp.vercel.app) |
| 184-reschedule-reminder | dea0700d6b13c2e2398cafa8f7c4a06045a68bbb | 34 / 34 | [42174670415](https://github.com/redbrixdesign-stack/riaz10/actions/runs/42174670415) | [akllcarbt](https://beelo1-akllcarbt-beelomvp.vercel.app) |
| 185-capacity-uk-time | 2fbc0ad51d9575b28929a7283ec634a8d07f24bc | 34 / 34 | [42176300133](https://github.com/redbrixdesign-stack/riaz10/actions/runs/42176300133) | [n5tvgo3pr](https://beelo1-n5tvgo3pr-beelomvp.vercel.app) |
| 186-secondary-navigation | 1513bc9d831525c63e6cb2e15c79f9e4d6dbed89 | 35 / 35 | [42178027612](https://github.com/redbrixdesign-stack/riaz10/actions/runs/42178027612) | [5jgmj16cc](https://beelo1-5jgmj16cc-beelomvp.vercel.app) |

Final runtime `1513bc9d831525c63e6cb2e15c79f9e4d6dbed89` is live as
`dpl_7vA4DGusUQWFtbGcrTewRpzBK6bL` (cache186-secondary-navigation).
All nine runtime files changed across this audit match source/stage/public hashes.
Public navigation-review, message-summaries and visit-communication journeys pass
Chromium/WebKit; communication checks include London/Kiritimati. External contact
was mocked/blocked. No error/fatal function logs were returned for the queried
22:07:58–22:17:58 UTC window; this is a limited function-log check, not proof of
all client behaviour.

- `tests/browser/customer-worklist.e2e.cjs`: real Tools entry, keyboard/back,
  customer actions, manual tasks, offline reads/reload and four primary tabs.
- `tests/browser/message-summaries.e2e.cjs`: new/combined introduction, handoff,
  explicit sent/agreed, offline reads and subsequent reload, real Move, cancelled/
  completed records, multiple visits, failed task reads and UK-time suggestions.
  Browser checks run in London and Kiritimati.
- `tests/reminder-reset.test.js`: source/minified database behaviour, unchanged
  edits, date/window/type changes, encryption/history/introduction/earnings retained.
- `tests/capacity-timezone.test.js`: source/minified checks in London, UTC,
  New York and Kiritimati; GMT/BST, DST boundaries, working-hour limits, overlap,
  self-exclusion, leave, UK-vs-UTC day boundary and no booking writes.
- `tests/browser/navigation-review.e2e.cjs`: exact accessible Tools labels,
  keyboard overview/back, empty/populated To revisit, preserved amounts/notes,
  linked and unlinked Visit records, 320/390/768 widths and minimum touch targets.
- Evidence, hashes, before states and settled screenshots:
  [evidence/navigation-2026-11-06/](evidence/navigation-2026-11-06/).
  No real calls, messages or transcription/provider requests were made.

## Investigations and limits

- Suspected shared-header Back-route defect did not reproduce: Plan tomorrow →
  Back returned Home in both engines. No runtime change was made for that lead.
- Initial local Python-server trials had intermittent missing-script startup
  failures; their cause remains unproven. Final Node-server release suites and
  public journeys passed. Capture failed-resource details if this recurs.
- Early harness attempts are not passes: offline reload was attempted with
  service workers blocked, then separated into offline reads and online reload;
  obsolete constant date mocks were replaced by real UK helpers. The earlier
  Move test explicitly accepted the false capacity warning; the final test
  requires it to be absent. Dark transition screenshots were retaken settled.
- This pass adds no new native iPhone end-to-end confirmation. Earlier native
  Visit-layout evidence remains separate. Next: verify the installed PWA's
  update, four-tab bar, Tools entry and Visit communication on an actual iPhone.
- Wider security, financial ownership, background location and native integration
  reviews remain separate work; this is not an exhaustive app certification.

## Preservation and decisions

Runtime work is isolated on `codex/followups-tools-20261106`. Original b833
tracked non-document diff SHA256 stayed:
`8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`.
No original runtime changes were discarded or copied into these releases.

Records and capabilities were retained; duplicate presentation/rules were removed.
No CRM/accounting/tax/MTD product expansion, provider change or external customer
communication was included. No new product-scope approval is inferred.

Rollback for the final release: promote the exact cache185 production build
[n5tvgo3pr](https://beelo1-n5tvgo3pr-beelomvp.vercel.app). Keep the maintained
35-journey gate for subsequent runtime changes.
