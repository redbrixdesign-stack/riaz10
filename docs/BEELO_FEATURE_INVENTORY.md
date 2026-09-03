# Beelo Verified Feature Inventory and Positioning Audit

**Evidence date:** 27 August 2026  
**Repository baseline:** `7afc26bdcc0088c7c301cdc639d1cc66547c6a3c`
plus the preserved working tree  
**Scope:** BA-002 and BA-003 documentation audit; this document grants no feature
approval or product-scope change.

## Classification rules

- **Implemented prototype:** current source contains a user-reachable or domain
  implementation. This does not establish production readiness.
- **Tested:** a focused current test exists and/or was run in the 27 August iPhone
  audit. Historic evidence alone is not a current pass.
- **Pilot-approved:** requires an explicit decision from Muhammad. A screen,
  filename, test or landing claim is not approval. No repository approval record
  was found, so no capability is marked approved here.
- **Public claim:** present in current landing source or root public-facing
  metadata. It may still require correction and deployment proof.
- **Future/unbuilt:** described in planning material but absent as a complete
  current capability.

“Pilot candidate” means compatible with the verified positioning, not approved.

## Inventory

| Capability | Implementation and evidence | Pilot/public status | Positioning audit |
|---|---|---|---|
| Home/Companion and My Day | **Implemented; tested.** Local-data summaries and allowlisted navigation in `today`/`companion`; companion and iPhone journey tests. | Not approved; strong candidate. Publicly described as daily context. | Fits operational memory if described as read-only assistance, not an autonomous agent. |
| Enquiries/leads | **Implemented; tested.** Lead Inbox; a lead can exist before customer/visit and converts through domain APIs; lead/storage tests. | Not approved; candidate. Broad enquiry/context claim. | Lightweight pre-visit capture. Avoid CRM or full lead-management-platform claims. |
| Customers/history | **Implemented; tested.** Search, Customer 360 timeline and linked visits/orders/messages/photos; storage and browser journeys. | Not approved; candidate. Customer context is claimed. | Personal working record. “Customer 360” is a UI label, not proof of CRM or external sync. |
| Visits and scheduling | **Implemented; tested.** Diary, arrival windows, outcomes, rescheduling and advisory overlap/capacity checks; appointment/capacity/browser tests. | Not approved; strong candidate. Visits are publicly claimed. | Core fit. Advice is overrideable; Beelo does not silently schedule. |
| Appointment types | **Implemented; tested.** Consultation, Measure, Fitting, Follow Up, Review and Service Call. | Not approved. Home-visit workflow claimed. | No distinct Survey type; use Measure unless Muhammad approves a terminology/scope change. |
| Tasks and follow-ups | **Implemented; tested.** Durable and derived quote, visit, payment, job, supplier and aftercare reminders; task/follow-up suites. | Not approved; candidate. Follow-up memory claimed. | Fits memory/support positioning. Do not imply autonomous action. |
| Communication drafting | **Implemented; tested.** Templates, editable preview, WhatsApp/SMS handoff and lifecycle/provenance; communication/scheduler/AI/browser evidence. | Not approved; strong candidate with disclosure. Public claim: user approves every message. | Aligned. Handoff is not delivery; sent/delivered states require explicit evidence. |
| Routing/navigation | **Implemented; tested.** Map, geocoding providers, estimates/optimization and Google Maps handoff; route/provider/offline tests. | Not approved; candidate with provider risk. Maps/context claimed. | Supporting context, not fleet management. Disclose address/coordinate egress and no-SLA fallback. |
| GPS trips/mileage | **Implemented; tested.** Local trip state, distance, arrival/finish and mileage records; route/money/iPhone tests. | Not approved; candidate. Mileage claimed. | Working record, not a certified tax log or submission. |
| Expenses | **Implemented; tested.** Local expense records/categories and exports; storage/money/document/browser tests. | Not approved; candidate. Expenses/receipts claimed. | Record-keeping aid only; not bookkeeping or accounts. |
| Commission/deductions | **Implemented; tested.** Configurable simple/two-stage calculations, targets and profitability inputs; money/settings/profitability tests. | Not approved; candidate after assumptions review. Commission deductions claimed. | Personal estimate, not payroll or accounting truth. |
| UK tax estimates | **Implemented; tested.** Income/expense/mileage planning calculations and exportable summary; money/date/docs tests. | Not approved; higher-risk candidate. Publicly disclaimed as non-filing. | Keep estimate disclaimer prominent. No tax advice, filing or MTD submission. |
| Measurements | **Implemented; tested.** Dimensions, tolerances and squareness linked to visits; measure/storage/journey tests. | Not approved; window-covering pilot candidate. | Trade-specific context; do not generalize unchanged to every trade. |
| Photos/OCR | **Implemented; tested.** Local photos, Tesseract capture and optional Claude vision; storage/OCR/browser tests. | Not approved; candidate with device-test gap. Scan/capture claimed. | Fits local capture. Camera matrix and optional AI egress require disclosure. |
| Quotes | **Implemented; tested.** Structured drafts/versions, issue/accept/reject, offline documents and one-time order conversion; quote/document tests. | Not approved; scope decision required. Not a clear primary public promise. | Operational record candidate; formal commercial documents increase legal/support expectations. |
| Orders | **Implemented; tested.** Stages, deposit/balance projections and kanban; order/storage/money/browser tests. | Not approved; scope decision required. Broad order context only. | Avoid CRM/order-management-system positioning. |
| Jobs/checklists | **Implemented; tested.** States, linked visits, checklists, issues, completion and sign-off; job/storage/axe tests. | Not approved; scope decision required. Broad job context claimed. | Fits field execution but expands the pilot beyond a light memory layer. |
| Payments/invoices | **Implemented; tested.** Append-only ledger, invoices, receipts, credits, refunds/reversals and offline documents; finance suites. | Not approved; explicit decision required. Not a primary landing claim. | Highest positioning risk: operational records only, never payment processing or accounting. |
| Suppliers/purchase orders | **Implemented; tested.** Supplier/PO lifecycle, shortages, damage, returns and follow-ups; supplier/storage tests. | Not approved; explicit decision required. Not materially claimed publicly. | Do not imply supplier integration or a procurement platform. |
| Profitability/capacity | **Implemented; tested.** Effective-dated modes, explicit costs, margins, availability and advisory scheduling; storage/capacity tests. | Not approved; explicit decision required. Not materially claimed publicly. | Decision support only; not accounting, workforce optimization or automated dispatch. |
| Retention/aftercare | **Implemented; tested.** Aftercare plans, preferences, lifecycle records and reminders; retention/communications/storage tests. | Not approved; explicit decision required. Trust/context claimed generally. | “Retention” can imply marketing automation; prefer aftercare/relationship reminders. |
| Backup/export/import | **Implemented; tested.** Local backups, CSV, validation, migration and atomic primary-engine restore; storage tests. Journey F has one stale count assertion. | Not approved; essential candidate. Local control claimed. | No server recovery. Exported files are user-controlled and may contain readable personal data. |
| Offline PWA | **Implemented; tested.** Manifest, service worker, offline shell/banner and local workflows; offline/iPhone/browser evidence. | Not approved; foundational candidate. “Works offline” is claimed. | “Offline-capable” is accurate; “offline sync” is not because no remote sync exists. |
| Security/privacy controls | **Implemented; partly tested.** Encryption for specified fields, AI proxy controls, CSP and import validation; storage/AI/proxy evidence. | Not approved; release gate. Privacy/control claimed. | Legal placeholders and incomplete network-egress wording block broad assurances. |
| External-tool handoffs | **Prototype boundary; tested locally.** Manual integration registry/outbox plus WhatsApp/SMS/maps handoffs. | Not approved; no complete integration product. Landing says context across existing tools. | No verified live CRM, accounting, calendar or message-history connection. Qualify as captured context plus explicit handoffs. |
| Accounts, sync, remote recovery and teams | **Future/unbuilt.** No complete implementation or tests. | Not approved; not a current claim. | Future concept only. |
| Billing/subscriptions | **Future/unbuilt.** No implementation or tests. | Not approved; not a current claim. | No released commercial capability. |
| CRM/accounting/calendar connectors | **Future/unbuilt.** No production connectors; manual adapter behavior is not a live integration. | Not approved; possibly implied by compatibility wording. | Do not claim until a specific connector is implemented and verified. |
| MTD/tax filing | **Future/unbuilt and out of current position.** No implementation or tests. | Not approved; explicitly disclaimed. | Must remain outside product claims unless separately designed and approved. |

## Positioning audit

### Aligned

- Home, visits, pre-visit context, notes/photos/measurements, follow-ups, message
  previews, explicit handoffs, local trips/mileage, backup and offline continuity
  support a solo adviser's memory and next-action workflow.
- Leads and customer history fit when described as lightweight personal working
  context rather than CRM functionality.
- Financial records can fit when assumptions and non-filing status are visible.

### Claims requiring qualification

- **“Context across existing tools”** must mean context the adviser captures or
  imports into Beelo plus deliberate handoffs—not live CRM, accounting, calendar
  or messaging-history integrations.
- **“Works offline”** should remain “offline-capable”: fresh maps, geocoding,
  routing, weather and optional AI have network/provider boundaries.
- **“Everything stays on this phone”** is too broad. Core records are local, but
  service requests can disclose addresses, postcodes, coordinates, location
  context or selected AI inputs.
- **Customers, leads, pipeline and retention** should be personal context,
  reminders and aftercare—not CRM, marketing automation or management reporting.
- **Invoices, payments, suppliers and profitability** are implemented prototype
  modules, but are not central public promises or approved pilot scope.

### Required non-claims

Beelo does not currently provide formal accounting, bookkeeping, payroll, tax
advice, tax-return submission, MTD filing, payment processing, autonomous
customer communication, inferred delivery, team CRM, cloud sync or verified
production integrations with third-party business systems.

## Recommendations

1. Make visits, context, follow-ups, draft approval, local control and offline
   continuity the default pilot story.
2. Keep financial modules labelled as adviser-entered records and planning
   estimates; show the tax/MTD disclaimer beside relevant outputs.
3. Qualify “across existing tools” until named integrations are implemented and
   verified.
4. Treat quotes, jobs, invoices/payments, suppliers, profitability and aftercare
   as scope decisions. Do not remove them, but do not imply pilot approval.
5. Correct operator identity and provider/data-egress disclosures before public
   pilot onboarding.
6. Use Consultation and Measure as current verified terms; separate Initial/Sales
   or Survey terminology needs product approval.

## Decisions requiring Muhammad's approval

- Which implemented modules form the first pilot promise: core visits/context
  only, or also quotes, jobs, invoices/payments, suppliers, profitability and
  aftercare.
- Whether customer/lead terminology should remain or be softened to reduce CRM
  expectations.
- Whether Measure should be presented externally as “Survey / Measure”.
- Whether financial documents and tax estimates are enabled for the initial
  pilot, marked experimental, or deferred.
- Which providers and data-egress disclosures are acceptable for the pilot.
- The verified operator/legal identity and contact details.
