# M2a — customer-linked expense evidence

Status: isolated implementation; full local gate passes. Hosted40079956457 failed
offline; enriched diagnostic40124297358 passed, not a root-cause resolution.
Staged READY but NOT promoted; public app remains M1/cache158.
First M2 slice, not completion of all context linking or MVP.

## Ownership map / scoped gap

Customer profile already aggregates visits, communications, photos/voice notes,
orders and other operational records. Measurements refer to visits and are
retrieved across that customer's visits. Expenses held date/category/amount/
receipt but had no supported explicit customer picker/profile retrieval flow.
Core `js/core/search.js` indexes customers/appointments/orders; this is not a
verified finder for receipt/note/media content. Reuse/extend existing search
later rather than claiming the absence of all search or a new global finder now.

Choose an optional customer on an existing expense, then retrieve that exact
record through the customer profile. General fuel/tools/business costs need
no customer. No visit-level expense link, auto-linking, AI inference, duplicate
financial row or new accounting module is introduced.

## Implementation / invariants

- New/edit expense has local customer search by name, postcode or customer number;
  up to20 matches, escaped labels, explicit selection and General business.
  Searching alone never changes the selected link. Read errors are visible.
- Only numeric customerId is stored; no duplicate plaintext customer name/address.
  New DB add/update methods check an existing customer (or null for general)
  before any financial patch. Real Dexie uses one transaction over customers/
  expenses; fallback retains its pre-existing lack of multi-table transactions.
  Sequential source/compiled parity tests do not certify fallback concurrency.
- Customer profile has Expense evidence with date/amount/description/receipt
  presence and direct edit of the same record. Label distinguishes expense
  evidence from a customer charge or debt. Query failure is not false emptiness.
- Reassign/unlink needs Save; cancellation does not commit. Date/amount/receipt/
  createdAt remain unchanged by a link-only edit. Pending selection blocks Save;
  late selection/search results cannot replace a newer form or deliberate clear.
- Backup validates optional expense customer references before restore and
  preserves valid links/media through export/import. No schema/index migration,
  automatic historical assignment, earnings/tax calculation or provider change.
- Existing customer deletion retains business expenses/photos of receipts and
  removes their links; confirmation discloses retention and asks the adviser to
  review receipts/descriptions separately for personal data. It is not a promise
  that deleting a customer erases all receipt content. Only synthetic in-memory
  deletion is exercised; no user's customer/financial record removed.

## Verification / corrections before release

- Original source fails the new DB context contract. `expense-context.test.js`
  exercises source/compiled DB with real Dexie and fallback, encrypted customers,
  general/link/reassign/unlink, invalid references with unchanged financial data,
  export/import validation/retention and customer deletion retaining expenses.
- Initial vendor-Dexie VM fixture did not settle and is not counted as a pass.
  Reused the established required-Dexie/fake-IDB harness and added a fail-closed
  deadline. Four source/compiled/engine cases visibly execute and pass.
- Initial browser assertion ran before asynchronous selection completed. Added
  a real pending-selection Save guard and explicit committed-selection test
  preconditions. `expense-context-ui.test.js` runs source/compiled busy/stale/
  clear/latest-search/escaped-name/error boundaries. No assertions weakened.
- Superseded full run stopped after this source revision; its partial results
  are not release acceptance. Only final full run counts. M1 date-test fixture
  now delegates its validated-update stub to the existing update recorder;
  all historical/date/media/duplicate/failure assertions retained.
- Focused genuine-key Chromium/WebKit exercise real DB, picker/search/profile,
  reassignment/cancel/unlink/reload, exact media/amount/date/capture preservation,
  invalid link, write/read failure and stale search. No POSTs/page errors or
  real provider/customer/send. Final maintained runner has16 browser scripts.
- First full run reached WebKit reload but issued customer navigation after only
  checking DB.isOpen. Captured screenshot/body/hash show Money, not a lost row:
  app startup was still completing its initial route. Test now waits for rendered
  Money before navigating, retaining exact persistence assertions and15s limit.
  This is online bootstrap readiness, not C14 diagnosis. Failed full evidence
  retained; runtime unchanged by this test correction and no stage promoted.

## Limits / next

M2b must separately design explicit visit context and correction semantics.
Next retrieval priority: Money's View Records currently queries this month
only. Customer-linked evidence can be reached through its profile, but older
general-business receipts remain in storage/backup without an all-date finder.
Do not claim all receipts are now easy to find. Add date-spanning expense
retrieval as a small next slice before extending more associations.
That slice should also replace openRecordsModal's swallowed read errors with a
visible retry state (a failed query must not say no records). Acceptance: retrieve
an older unlinked fuel receipt by date/text, open/edit the original row, cancel
without mutation, retain exact image/date/amount, and distinguish empty/error.
Reuse the existing local expense store; do not add cloud indexing or tax rules.
Global retrieval, all-media lifecycle, physical-device/accessibility/offline
acceptance remain open; C14 not closed by another green run. Local scans are
pilot-scale, not a large-dataset performance claim. No independent privacy,
security or accounting/MTD assurance from these tests.

Keep installations/tabs updated before using the new links. Older UI ignores
them and its customer deletion does not unlink expenses. If reverting to M1,
preserve a verified backup and avoid customer deletions on the older UI until
links are resolved or a link-aware build restored. Orphan links must be explicitly
cleared/reassigned in the new UI; invalid-reference restore fails closed rather
than guessing a customer. No automatic repair is claimed.

## Release hold / captured C14 failure

- Runtime `51bae435b3aef2d571c2abc7bf3ec31176e4d540`, test readiness correction
  `8f6c178a2dcc959de8ff34044bfe6fbf5f565cdb`. Final full local build/unit/social/
  performance and16-script browser gate passed (`final-gate.txt`, `summary.json`).
- Staged READY `dpl_5awdCzfbdexw13sVfJCcxRke2SSU`, exact URL
  https://beelo1-ix9r62jrc-beelomvp.vercel.app, cache159. Not promoted or accepted.
- Exact-source hosted Test40079956457 failed the existing cold-offline WebKit
  journey before the expense-context browser test ran. Unit/server job passed;
  earlier hosted browser scripts passed, not a full release acceptance.
- First useful captured C14 route: Quotes, first offline open after Settings.
  Router currentFeature is quotes but currentHash still settings?section=data;
  screenshot shows a loading skeleton, not an empty data list. The prerequisite
  quote-document.min.js?v=3 has a script node and a cache key, but no recorded
  response/failure. Quotes remains lazy, no page/console errors were recorded.
  A cache key is not proof of delivery/evaluation. No evidence here of expense
  record loss. Full JSON/log/screenshot preserved in hosted-offline-failure/.
- Added diagnostic-only script request times, loopback proxy request/drop log,
  and a bounded cache response/body-size probe on failure. One bounded local
  two-engine check passed; this does not establish the hosted failure's cause.
  A distinct hosted diagnostic is justified by missing request/cache-body evidence,
  not by seeking a green rerun. Timeouts/assertions/offline mechanism unchanged.
- Public sw.js independently rechecked: advisoros-v6-158-expense-dates. No M2
  native/live acceptance claimed. Profile screenshot is partly obscured by
  transient UI; DOM/click assertions are stronger evidence than that capture.
- Enriched exact-source diagnostic Test40124297358 on `9cf6fb0` passed units/
  server/audits and all16 browser scripts, including expense context and offline.
  Both engines rendered all eight offline secondary routes with no page/console
  errors or failed requests, then returned online with the synthetic record.
  Evidence in hosted-enriched-pass/. No failure-only probe fired, so this run
  adds no missing failing-request/cache-body evidence and cannot close C14.
  No additional rerun, speculative fix or promotion. All six staged changed
  assets byte-match source; stage READY/build10.477s recorded in stage-hold.txt.

Production baseline remains M1 until the offline boundary is diagnosed and final
gates, staged asset comparison and exact-build promotion pass. Original dirty
runtime/dependencies remain untouched. No speculative runtime/cache fix applied.
