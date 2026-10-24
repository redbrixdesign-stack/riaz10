# M2a — customer-linked expense evidence

Status: isolated implementation; focused tests pass, final release gate running.
Not yet deployed. First M2 slice, not completion of all context linking or MVP.

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

## Limits / next

M2b must separately design explicit visit context and correction semantics.
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

Production baseline remains M1 until final gates, staged asset comparison and
exact-build promotion. Original dirty runtime/dependencies remain untouched.
Release IDs, live results, rollback and evidence will be recorded after acceptance.
