# M3a — retrieve customer, visit and window context
25 October 2026. Scoped working-memory improvement; not whole-MVP or pilot approval.

## Baseline and decisions

Baseline runtime4d9f7d6 (M2b). Existing Search is in the Visits header and
is reused as a customer-only picker and by Companion's person lookup.
Source: js/core/search.js; appointments.js openCustomerSearch/runCustomerSearch;
companion.js answerPerson. No new search screen or cloud/provider is needed.

Verified source gaps:
- Customers matched separate fields, not combined multi-term context; saved customer
  notes were not considered.
- Visits matched customer results or a literal notes substring. A customer match
  was lost for appointment-only queries. Type/status/date matching in unused
  buildIndex was not the live search path.
- Window name/product/description/notes/transcript text was not included.
- Individual source failures were logged then silently omitted, potentially
  producing a misleading empty/partial result.
- The search modal had no latest-request ownership guard and its result row
  omitted the third grid cell, squeezing text into the wrong column.

Keep established routes, encryption, financial calculations, communication
lifecycle and capture forms unchanged. Retrieve one original visit per matching
visit, not duplicate every window as a new business record. Multi-term matching
may combine customer identity/context with one visit or one window, never pieces
of two unrelated windows or customers. Results are capped at20 and UI says so.

## Implemented prototype slice

- Same Visits Search: names/address/postcode/phone/email/customer number/customer
  notes; customer-only picker remains customer-only.
- Visits: own name/address/type/status/outcome/date, access/typed notes and
  saved embedded transcript text; newest visit first, missing date explicit.
- Windows: saved name/room/product/description/notes and existing embedded
  transcripts; result identifies matching window and opens its original visit,
  where the existing window table is displayed.
- Existing order-number search retained, with associated customer matching.
- Metadata projection decrypts measurement text/transcripts only, never audio
  or image payloads; raw encrypted rows are read locally. No schema migration,
  stored plaintext search index, network upload or transcription request.
- Empty, failed-read and short-input states; input label/live result region,
  escaped content, corrected grid; queued and in-flight older results cannot
  replace newer input or a replacement/closed modal. Prior results clear while
  typing to avoid opening a stale customer.

## Verification

Maintained unit tests: tests/working-memory-search.test.js source+min, including
cross-customer/window isolation, text/transcript retrieval, multi-term,
customer-only/appointment-only queries, compact postcode, missing date, failures
and no source mutation. Historical4d9f7d6 negative test must fail the
Cedar-bedroom retrieval assertion.

tests/context-encryption.test.js additionally proves projection decrypts text
and transcript while deliberately invalid audio/photo ciphertext is never
decrypted or returned.

New maintained two-engine390px journey:
tests/browser/working-memory-search.e2e.cjs. Synthetic encrypted customer/window
records only; searches→direct original visit→saved table; notes/transcript,
offline query, empty/error/retry, late-response ownership, reload persistence,
no record mutation, no POST/provider calls. Screenshots visually reviewed.
Release acceptance expands from19 to20 browser scripts; thresholds unchanged.

Release evidence below distinguishes preliminary and final acceptance.

Local acceptance: npm run verify:release completed successfully, including
all20 maintained browser scripts, unit/server/social checks and unchanged
maintained performance assertions. Chromium and WebKit screenshots inspected.
The historical negative test failed the intended Cedar-bedroom assertion.
Additional standalone visual runs on the long-lived8023 server failed at
setup/search-input readiness; retained as failures, not passed evidence and
not independently root-caused. The release runner's isolated-server search
journey passed both engines. One earlier focused assertion read the previous
query before debounce settled; the harness now waits for the actual matching
window text. No production timeout or acceptance threshold was relaxed.

Pre-promotion review found that a name-only query could label a visit with
an arbitrary first window. Added a failing negative assertion and repaired
specificity: a window label appears only when the shared customer/visit fields
alone do not satisfy the query. Candidate84fd10e/stage
dpl_Fog4SuN5WchahpMkBQqn4qJDREvM is superseded, not promoted.
Its passing local20 suite is preliminary evidence, not final release acceptance.

## Final release — LIVE

Runtime2c0ac31bc558d3d1e15b1cd8fed9a804b7c2351d. Final local
npm run verify:release passes all20 browser scripts plus unit/server/social
and maintained performance assertions. Exact-source hosted run40155911005
SUCCESS: unit/server/dependency scans and all20 browser scripts; downloaded
summary records the same SHA. Preliminary40155787434 was cancelled by the
newer commit, not accepted as final evidence.

READY production stage dpl_AmJp1XqwpFF9rmZQgoHrxw68yxJ3,
https://beelo1-cc3z1u179-beelomvp.vercel.app, Other/build10.256s,
was promoted without rebuilding to https://beelo.beelestial.co.uk/.
DB49/Search5/Appointments63/cache164-working-memory-search. Five staged and
public assets byte-match source. Prior M2b/cache163 deployment
dpl_HQSDVuWhomcjSPTKxUfe7yygYaqH remains rollback; never clear site storage.

Public synthetic Search and expense-finder journeys pass in Chromium/WebKit,
including encrypted source retrieval, in-session offline search, reload,
retained receipt/editor behavior, no record mutation and no POST/provider
contacts. Final local/hosted screenshots visually inspected. A10-minute server
error/fatal scan02:48–02:58UTC returned no logs, not complete monitoring or
security assurance. Evidence: docs/evidence/2026-10-25-working-memory-search/.

Original checkout's pre-existing non-doc diff stays byte-identical:
8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
Runtime was built/deployed only from the isolated clean release checkout.

## Remaining scope

- M3a is not a universal media finder. No raw audio listening, photo-content OCR,
  captions/library browsing, standalone voice-note title index, or document/job/
  lead/task global indexing added. Existing transcript text must be saved.
- Expenses remain available through Money→Find receipts & expenses; general
  date/amount/category/receipt filters remain there. No claim that this modal
  searches all expense records or implements date/type filters.
- Up to20 results, customer results first; refine broad queries. Full local
  customer/visit scans plus measurement text projection, not a scalable indexed
  or server search; large-library performance not certified.
- No physical iPhone/VoiceOver or cold-offline-relaunch certification follows
  from these in-session offline browser tests.
- Customer-only picker is independently usable if measurement reads fail.
  Full search fails visibly rather than promising complete results on partial read.
- Next: decide a single coherent expense/media discovery entry using existing
  finder routes; retain explicit links and source-open semantics. Then M4
  tomorrow planning and contextual pending work.
