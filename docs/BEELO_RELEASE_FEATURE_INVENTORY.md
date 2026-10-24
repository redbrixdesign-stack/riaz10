# Beelo release feature inventory and positioning audit

Evidence reviewed 24 October 2026: release branch `codex/phone-contact-save`,
runtime `9995984`, final acceptance `ba30894`, documentation baseline `07847a2`.
This is a source/test inventory, not a new feature approval or certification.
The older August inventory in the divergent workspace remains historical.

C20 addendum (24 October): runtime `d139e78` / cache155 adds the New Visit
recovery row below. Exact-source hosted 40046216960 and live synthetic
Chromium/WebKit checks pass; not physical-device acceptance or pilot approval.

C21 reliability addendum: runtime `0a71f42` / cache156 bounds unified note
transcription to a 75-second client operation, retains audio/text on timeout and
releases busy visit controls. Source/compiled stall/late-response regressions,
hosted 40072361485 and live synthetic checks pass; no real provider certification.

## Evidence rules

- **Implemented:** readable source and a reachable route/action or domain API
  exist. This does not establish an end-to-end production-ready workflow.
- **Tests:** named tests provide bounded evidence. Unit/mock tests are not
  physical-device or live-provider acceptance. The C16 final local gate and
  hosted run 40026690452 passed; this document does not invent a new device run.
- **Pilot approval:** no explicit feature-by-feature approval record was found.
  All rows remain undecided for pilot scope. Authorising a bug fix is not
  approval to market every prototype module.
- **Claim status:** “prototype” below means described as existing code in the
  corrected repository README, not a commercial promise. The live marketing
  website was not re-audited here; no current landing-copy status is inferred.
- **Future:** absent complete verified implementation; do not advertise as live.

## Inventory

Paths are relative to this release checkout. Feature-folder shorthand (for
example `appointments/`) refers to `js/features/`; adjacent service filenames
refer to `js/services/`. Test names refer to `tests/`.

| Capability / source | Test evidence and boundary | Pilot status | Claim / positioning |
| --- | --- | --- | --- |
| Home/context: `js/features/today/`, `companion/`, `customer/` | `companion.test.js`, `visit-review.test.mjs`; context rendering is not outside-tool history sync. | Candidate, undecided | Prototype. Core operational memory; no area/sports intelligence guarantee. |
| Enquiries/customers: `leads/`, `appointments/`, `js/core/db.js` | `leads.test.js`, `storage.test.js`; stored relationships and capture. | Candidate, undecided | Prototype, not CRM replacement, acquired leads or company data integration. |
| Visits/types: `appointments/`, `js/core/config.js` | `appointments-type.test.js`, `appointments-save.test.js`, `fitting-booking.test.js`; consultation, Measure/referral, fitting, follow-up, review, service. | Candidate, undecided | Prototype. Referred survey is handled with Measure/referral semantics, not a live Hillarys link. |
| Scheduling/planning: `appointments/`, `route/`, `js/services/capacity.js` | `capacity.test.js`, `route.test.js`; planning code records proposed order/times, not customer agreement. | Candidate, undecided | Prototype. Distinguish manual reorder/geographical estimates from live road-route optimisation. |
| Form/scheduling warnings: `js/core/app.js`, `appointments/` | `modal-form-state.test.js`, `browser/modal-form-state.e2e.cjs`; real warning/adjust/save and nested values, source/minified. | Candidate, undecided | Prototype. No arbitrary DOM/media/focus preservation guarantee. |
| Unfinished New Visit recovery: `js/services/visit-draft.js`, `js/core/db.js`, `appointments/` | `visit-draft.test.js`, `browser/visit-draft.e2e.cjs`; encrypted text/completed audio, leave/resume/discard, failed saves, atomic revision/booking guards and live synthetic reload. | Candidate, undecided | Prototype device-local recovery, not a booking, cloud sync or guaranteed OS-kill/active-recording recovery. See C20 audit. |
| Follow-ups/contact: `followups/`, `talk/`, `js/services/message-scheduler.js`, `tasks.js` | `followups.test.js`, `followup-deadlines.test.js`, `scheduler.test.js`, `outcome-timing.test.js`; quiet saves, time-sensitive tasks and explicit outcomes. | Candidate, undecided | Prototype. Clear only fulfilled/expired work; never infer sending, delivery or agreement from a handoff. |
| Visit alerts: `js/services/notification.js` | `visit-reminder-expiry.test.js`, `visit-reminder-lifecycle.test.js` and browser journeys. | Candidate, undecided | Prototype. Active/resume timing is not guaranteed suspended-phone OS delivery. |
| Notes/audio/transcription: `js/services/note-capture.js`, `voice-notes.js`, `api/transcribe.mjs` | `note-capture.test.js`, `note-capture-lifecycle.test.js`, `voice-notes.test.js`, `transcribe-proxy.test.js`, `transcription-usage.test.mjs`; providers mocked. | Candidate, undecided | Prototype. Supported note fields have typed/voice capture; not proof every arbitrary field supports audio. Cloud transcription is online and explicit; audio/text deletion are independent. |
| Windows/measurements/photos: `measure/`, `ocr/`, `js/core/db.js` | `measure.test.js`, `ocr.test.js`, `storage.test.js`; dimensions/rows/description context, local media. | Trade-specific candidate, undecided | Prototype. Validate extracted values; no guaranteed OCR accuracy or physical camera/HEIC compatibility. |
| Routes/maps/mileage: `route/`, `js/core/geo.js`, `geoprovider.js` | `route.test.js`, `geoprovider.test.js`, `money.test.js`; provider mocks/local records. | Candidate, undecided | Prototype. No guaranteed route saving, carbon outcome or locked-screen mileage/arrival reliability. |
| Expenses/commission/tax: `money/`, `js/core/tax.js`, `config.js` | `money.test.js`, `settings.test.js`, `audit-fixes.test.js`; configured calculations, not filing. | Scope/assumptions decision | Prototype operational estimates only. Not accounts, tax advice, payroll, HMRC/MTD filing or guaranteed earnings. |
| Quotes/orders: `quotes/`, `orders/`, `js/services/quote-document.js` | `quotes.test.js`, `quote-document.test.js`, `fitting-booking.test.js`, `audit-fixes.test.js`; records/documents/linkage, not supplier acceptance. | Scope decision | Prototype breadth, not an approved sales/CRM platform or company-system integration. |
| Jobs/checklists/issues: `jobs/`, `js/services/job-field-service.js` | `jobs.test.js`, `job-field-service.test.js`, `job-followups.test.js`. | Scope decision | Prototype operational records, not a released business-management platform. |
| Invoices/payments: `invoices/`, `js/services/finance-document.js`, `js/core/db.js` | `invoices.test.js`, `finance-document.test.js`, `browser/payment-link.e2e.cjs`; intended-order ledger linkage. | Explicit scope decision | Prototype records/documents, not money movement, banking, payment processing or formal accounting. |
| Suppliers/POs: `suppliers/`, `js/core/db.js` | `suppliers.test.js`, `supplier-followups.test.js`. | Scope decision | Prototype records, not live supplier/procurement integration. |
| Profitability/availability/aftercare: `profitability/`, `capacity/`, `retention/` | `capacity.test.js`, `retention.test.js`, `retention-followups.test.js`, `storage.test.js`. | Scope decision | Prototype estimates/checklists/reminders, not management accounting, dispatch or autonomous marketing. |
| Social drafts/media: `social/` | `social.test.js`, `browser/social-share.e2e.cjs`; real picker, exact photo/video bytes and mocked native sharing. | Scope/permission decision | Prototype drafting/share handoff only; no automatic publication or receiving-app/device attachment certification. |
| Encryption/backup: `js/core/db.js`, `js/services/export.js` | `context-encryption.test.js`, `protected-backup.test.js`, paired browser tests; migration and different-key restoration. | Essential candidate, undecided | Specified sensitive fields and optional protected exports, not whole-database encryption, cloud backup or independent security assurance. |
| PWA/offline: `sw.js`, `manifest.json`, `js/core/lazy-features.js` | `sw-lifecycle.test.js`, `browser/cold-offline.e2e.cjs`, `browser/sw-update.e2e.js`; desktop Chromium and qualified WebKit evidence. | Essential candidate, undecided | Offline-capable; C14 intermittent route risk remains open. Not sync or universal offline/device acceptance. |
| Claude assistance: `js/services/ai.js`, `api/claude.mjs` | `ai.test.js`, `proxy-server.test.js`, `claude-usage.test.mjs`, browser guard/recovery; mocked provider. | Provider/privacy decision | Prototype optional online assistance; shared quota gate is not adviser identity or provider availability assurance. |
| Accounts, teams, sync, hosted recovery, subscriptions and billing | No complete verified implementation found. | Future/unapproved | Unbuilt; not current capabilities. |
| Live CRM/accounting/calendar/message-history connectors; Azure processing | No complete verified production connector/Azure processing flow found. Handoff/manual capture is not a connector. | Future/unapproved | Do not describe as live integrations. |
| Tax/MTD filing | No implemented submission flow found. | Outside verified position | Not a product capability or approved future promise. |

## Positioning recommendations — no feature removal

24 October C22 evidence addendum: `visit-draft-status.test.js` checks truthful
no-op/empty status, ordered clearing behind pending persistence and conflict
preservation against source/compiled code. Full local/hosted fourteen-script
gates pass. Native Simulator verifies draft leave/resume/reload, but not final
booking Save; physical-device acceptance remains open. This is prototype
evidence, not pilot approval or a new capability claim. See the C22 audit.

Lead with the personal day around the job: capture → context → next action →
adviser review → deliberate handoff → working history. Company systems serve
the company; Beelo's intended role is the worker's private layer beside them.

Customers/leads can support that memory without promising a CRM. Route previews,
notes, measurements, follow-ups and local continuity are aligned pilot candidates.
Keep provider/offline limitations visible instead of claiming “everything stays
on the phone”, automatic coordination or guaranteed travel savings.

Quotes, jobs, invoices/payments, suppliers, profitability and retention broaden
expectations towards a second business-management platform. Preserve the code;
Muhammad must decide which surfaces belong in the narrow pilot. Keep expenses,
mileage and commission as personal working records, tax as estimates only.

## Decisions still required

1. Pilot feature surface and acceptable provider/data-egress boundaries; no
   module is labelled pilot-approved by this audit.
2. Attended access/no-show service-call eligibility; two-stage survey commission
   deduction basis (net rate versus effective gross rate). Do not rewrite history.
3. Physical-iPhone acceptance and independent assurance; main-branch reconciliation
   and required-check policy. Do not treat desktop green runs as these approvals.

Correction scope is README/proxy documentation, this inventory and documentation
contracts only. No UI, feature removal, data migration, configuration change,
marketing publication or new deployment is authorised or performed by it.
