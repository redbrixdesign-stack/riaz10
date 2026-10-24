# M1 — reliable expense transaction dates

Status: deployed; full local/hosted/live browser verification passed. Native
receipt-date acceptance blocked by input delivery. This is MVP slice M1, not
a whole-MVP readiness claim.

## Confirmed gap

Quick Expense saved `new Date().toISOString()` rather than the actual expense
date. Receipt analysis returned a date but the form ignored it. Edit Expense
offered no date correction. An older receipt therefore appeared against the
entry day. Original source fails the maintained date regression; no real
customer, receipt, secret or provider request used.

## Scoped implementation

- Explicit labelled Expense date in new/edit form. Today defaults to UK calendar
  day even on a foreign-timezone device. Strict ISO day validation rejects
  missing/impossible/ambiguous dates rather than permissive JavaScript rollover.
- Newly selected dates are stored at UK midnight as existing ISO timestamps;
  no schema change or bulk migration. DB `createdAt` remains the distinct capture
  instant. Editing an unchanged day preserves its original timestamp exactly.
- Existing receipt analysis and quick-capture results can prefill a valid ISO
  date for review. Unreadable/ambiguous extracted date clears the default and
  asks for actual date, not silently today's date. Adviser-edited dates win over
  delayed extraction. No provider/permissions/payload changes.
- Repeated pending Save cannot insert duplicates. Invalid amounts/dates do not
  write. Write failures retain entered date/details/receipt. Edit patches do
  not replace receipt or capture timestamp; missing/deleted rows cannot report
  successful update.
- Selected-file read must finish before Save. Request/owning-field identity
  isolates delayed reads/analysis from replacement forms or later photo choices;
  pending save does not apply new extracted values. An old completion cannot
  close a replacement expense form. These guards are scoped to receipt entry.
- No tax-rate/deductibility/commission/earnings changes, MTD submission, new
  service, bank integration, accounting approval, message or navigation changes.

## Tests / evidence

`tests/expense-date.test.js` runs real source/compiled code: UK midnight/tax-year
cutover, GMT/BST/leap/invalid dates, historical create/edit, unchanged timestamps,
retained photo, validation, pending-save duplicate protection, failed-write
retention, receipt-date review and changed-date/stale-form isolation. Also passes
with host TZ Pacific/Kiritimati and America/Los_Angeles.

`tests/browser/expense-date.e2e.cjs` uses real local passphrase/DB and a synthetic
image file; only extraction/storage-failure phases are mocked. Tests UK default
while device is in Los Angeles, receipt date review, actual historical record
and date-period membership, failed-save preservation, edit/reopen/reload and
320/375/390/430 widths. Both Chromium and WebKit focused journeys pass; no POSTs
or page errors. A small PNG fixture tests storage, not camera/HEIC decoding or
receipt legibility. Screenshots visually reviewed, not physical-iPhone proof.

Initial browser harness failed finding exact accessible name `Log Expense`
because the existing material icon participates in the name. It now clicks the
existing action button; assertions/timeouts unchanged. Original failure retained,
not attributed to product or counted as a passed journey. Failure screenshot/
route/body capture now preserves further diagnostics.

Full local unit/social/maintained-performance/build/token/diff gates pass. Full
maintained runner passes all fifteen browser scripts. No original assertions or
timeouts removed. Exact-source hosted Test40078470204 passed unit/server/
dependency checks and all fifteen scripts on the first run.

## Release / live acceptance

- Runtime `e8a1b52e4cdb4c8ab18ac905c0c93ddab954f745`, isolated release branch
  `codex/phone-contact-save`.
- READY production stage `dpl_5yN4v2iF2gAwA24K9yAnspNPNvmT`, build11s,
  https://beelo1-irtsljskf-beelomvp.vercel.app. Explicit target beelomvp/beelo1
  inspected; no auto-link, secret read/change or protection change.
- Cache `advisoros-v6-158-expense-dates`, Money v12. Other asset versions and
  runtime modules unchanged; no schema/dependency/provider change.
- Three staged assets matched local bytes; public domain remained C22/cache157
  until hosted acceptance. Promoted the same READY build, not a rebuild, to
  https://beelo.beelestial.co.uk/ on 24October2026. Three changed live assets
  match. Live genuine-key Chromium/WebKit repeat the full receipt-date/review/
  historical/save-failure/media/edit/reload journey successfully, no POSTs or
  page errors. Provider extraction is mocked; no paid-provider certification.
- Short ten-minute deployment error/fatal scan returned no records; client
  monitoring/drains and independent assurance not established by that scan.
- Simulator observation succeeded, showing the existing synthetic Cedar notes.
  Money tap returned `noWindowsAvailable`. No native receipt form/date picker
  or installed cache version inspected; no repeated retry or request for routine
  approval. No real data or provider action. Inline observation/error retained.
- Rollback
  is C22 `ded6891` / `dpl_9LRb58Y96VbNCaS41adinNJV8ERE`; records remain, but
  older UI cannot correct the expense date and new capture returns to entry date.
- Evidence: `docs/evidence/2026-10-24-expense-dates/`. Native/device acceptance
  remains distinct from these local/hosted browser results.

## Boundaries / next

No historical dates inferred or automatically repaired. The adviser must correct
older entries where necessary. Existing period/tax calculations are not an
accountant-approved ledger or MTD digital-record chain. This slice does not
certify their completeness or deductibility. Existing inclusive endpoint and
tax-year summary conventions need their own review; this release does not
rewrite them or treat date-only capture as tax-compliance proof.

Native date-picker/physical Safari/PWA, actual microphone/provider and broad
offline acceptance remain separately unverified. C14 remains open. Original
dirty checkout/runtime preserved; use only isolated release source. After M1
release, M2 starts with explicit context-association design, not feature removal
or accounting expansion. Refer to the living MVP plan for readiness gates.
