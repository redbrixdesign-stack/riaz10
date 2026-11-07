# Existing-customer company-document import — 7 November 2026

## Behavior and scope

Open Customer → Documents → Scan / upload document, or Tools → Import customer document. Select a PDF or supported photo up to 2 MiB, then explicitly choose Read with AI. The existing protected AI connection reads the document; the adviser reviews one form and confirms the selected existing customer before Save. No new customer is created.

Customer number is matched first against the existing Beelo number, known external-number fields and previously imported company document references; exact normalized name is the fallback. Ambiguous matches are not silently assigned. The company number can be corrected in review. Existing-profile entry retains that customer unless explicitly changed; differing source identities are warned about. Adviser/issuer phone/address cannot be copied into customer records because these are absent from the extraction/import schema.

- Original PDF/photo and reviewed extracted JSON are encrypted in the existing documents table. Metadata projection omits original bytes; Download original decrypts on demand. Backup/restore includes the document. There is no schema upgrade or new provider/dependency.
- Original documents, quoted/order amounts, company balance and source fitting date/window appear in Documents. Imported room/window/product descriptions appear separately under Products; absent quantities remain unknown and no measurements or prices are invented. Older file versions remain available; quotes and order documents retain separate source identity.
- Reviewed company invoices/order receipts with reference and total can create a company-managed order snapshot. Quotes stay quotes; no adviser invoice, payment, income or commission is created. No inferred deposit or payment amount is calculated from total minus balance.
- Existing order figures remain unchanged unless the adviser explicitly chooses replacement, the target is company-managed, and its record still matches the reviewed snapshot. Adviser-managed orders cannot be overwritten this way. Missing balance stays explicitly unknown in the imported order display.
- SHA-256 file deduplication is checked before an AI request and again inside an atomic transaction. Simultaneous repeats create no duplicate records. Failed writes roll back the new document/order together; vanished customers and stale orders fail visibly.
- Import never edits an appointment, changes an agreed window or marks a visit complete. Future source dates create a fitting-date review obligation for a new company order; historical dates do not create an upcoming visit. Review fitting date opens the existing fitting flow with a future date/recognised arrival window prefilled. The adviser still confirms, selects diary time/duration and passes existing scheduling checks. Existing fitting records are opened rather than duplicated.

## AI, privacy and limits

This adds `customer_document` to the existing Claude proxy. Only this request type accepts a PDF; existing image-only contracts remain image-only. Native PDF handling uses a base64 `document` content block, following [Anthropic PDF documentation](https://platform.claude.com/docs/en/build-with-claude/pdf-support). Photo inputs use existing image decoding/downscaling. Encoding, MIME, PDF signature and 2 MiB decoded-size checks precede provider calls. Existing authentication, origin, shared usage and rate protections remain. Extraction uses a fixed prompt; client/document instructions cannot override it. Provider output is parsed and normalized before review.

The optional AI disclosure now includes chosen customer PDFs/signatures, and the import form explains the outgoing data before Read with AI. No credentials/settings were changed. Files remain in the unsaved review until Save; closing/reloading an unsaved review is not a durable import. AI reading requires internet/configured AI; saving the completed review works offline. Long/dense files can exceed extraction output limits and must fail without partial saving. Handwriting, document classification, amounts, source-date qualifications and actual provider accuracy still require adviser review.

The supplied real Hillarys receipt was inspected locally to understand the format. It was not committed, imported into live customer data or sent to a provider. Automated tests use a clearly synthetic two-page PDF and mocked extraction/provider responses. No real contact, provider spend or company-system synchronization is claimed.

## Evidence and verification

New source/minified unit tests cover matching/ambiguity, unknown quantities, encrypted originals and metadata projection, backup/restore, concurrent duplicates, external orders, quote boundaries, controlled replacement, stale snapshots, adviser-order protection and atomic rollback. Proxy tests cover native PDF/image blocks and rejection of bad MIME, encoding, signature, size and client instructions before the mocked provider.

Full integrated unit suite passed, followed by final affected document/proxy/docs checks. Eight affected browser journeys passed: document import, customer workspace, Home/Money navigation, deferred fitting, protected backup, context encryption, cold offline startup and update recovery. A final document/customer-workspace replay follows the last narrow review refinements. The new journey uses actual PDF selection, real encrypted storage, name then remembered-company-number matching, review confirmation, offline saving, download/reload, duplicate-before-AI detection, source versions, unchanged default amounts, explicit correction, escaped products, proposed dates and quotes that do not become orders. Phone-sized layouts are checked at 320/390px.

Deployment receipts and final acceptance will be appended after staged verification/promotion. No physical iPhone camera/provider extraction-quality acceptance or full accessibility/security certification is claimed.
