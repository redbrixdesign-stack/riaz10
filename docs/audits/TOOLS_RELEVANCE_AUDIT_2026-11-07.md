# Tools relevance audit — 7 November 2026

Scope: every Tools entry in the live cache199 baseline, source references, existing domain tests, and synthetic Chromium/WebKit journeys. This is a prototype audit, not pilot approval or complete physical-iPhone acceptance. No usage analytics were available: optional does not mean unused.

## Result and relevance

Before: 21 normal shortcuts (17 initially visible), plus one conditional demo action. After: 17 shortcuts, 10 everyday actions and seven optional workflows. Navigation remains Home / Tools. No customer, visit, financial, measurement, media, backup or legacy integration table was deleted.

| Before entry | Adviser relevance | Decision | Reason / retained capability | Source area |
|---|---|---|---|---|
| Add Visit | Core | Keep | Diary capture for sales, referred surveys, fitting and service calls. | appointments |
| Log Expense | Core | Keep | Capture a receipt/cost at the point of spending; deductions remain estimates. | money |
| Log Mileage | Core fallback | Keep | Manual business-trip capture/review remains necessary when location/background tracking is unavailable. | money |
| End of Day | Core | Keep | Review unfinished work and recorded earnings, without sending messages. | today |
| Import customer document | Core | Keep | Review extracted quote/invoice information against an existing customer; never treat company balances as adviser income. | customer |
| Follow-ups | Core, secondary overview | Keep | Cross-customer backlog; customer and visit communication stay the normal contextual entry. No automatic sending. | followups |
| Jobs | Optional | Move into optional group | Operational order-linked work; useful for independent work/return visits, not compulsory for every company appointment. Empty state now links to orders. | jobs |
| Lead Inbox | Optional | Move into optional group | Independent enquiries before booking; company advisers can ignore it. | leads |
| Find Customer | Duplicate | Remove Tools shortcut | Home search already finds customer name/phone/address/postcode/order; customer records and search remain. | control / today |
| Money | Core | Keep | Adviser earnings, spending, mileage and tax-reserve illustrations; not accounts or tax filing. | money |
| Orders overview | Optional | Move into optional group | Existing commercial/order records and links to jobs/invoices; retain compatibility and customer access. | orders |
| Suppliers | Optional | Keep in optional group | Useful for self-procured orders; Hillarys manages manufacture/delivery for referred surveys. Existing supplier records remain. Empty state now links to orders. | suppliers |
| Availability | Optional | Keep in optional group | Working-time/capacity configuration; scheduling checks use its service. | capacity |
| Profitability | Optional, restricted estimate | Rename Job costing setup; keep optional | Dated per-job policy is separate from Home earnings/tax. Hold revenue estimates when order ownership or dated policy is unclear. | profitability |
| Invoices | Optional | Keep in optional group | Own-business invoice/payment records; imported company documents have a different owner and are not adviser revenue. | invoices |
| Route Planner | Core | Keep | Review geographical day plan/base loop; provider location/routing and native navigation need separate device acceptance. | route |
| Measure | Contextual | Remove Tools shortcut | Retain Visit/Customer measurements, window table and deep-link picker fallback. A measurement needs a specific visit. | measure / control |
| Scan Document | Duplicate/ambiguous | Remove Tools shortcut | Retain Home Quick capture and Add Visit scanning; existing-customer document import has its own explicit action. | ocr / control |
| Integrations | Misleading mock | Remove mock controls; retain history in Settings | The only adapter toggled an in-memory boolean, with no live provider authentication/sync. Preserve saved outbox/conflict data and explicit conflict review. | services/communications |
| Settings | Core | Keep | Profile, navigation, storage, AI configuration, privacy and communication-history access. | settings |
| Export Backup | Recovery core, unsafe shortcut UX | Replace with Backup & restore | Open existing Settings data choices, including protected backup/restore, rather than immediately downloading unprotected JSON. Export capability remains. | settings / control |
| Remove Demo Data (conditional) | Unsafe legacy maintenance | Delete action and matching code | Matched customers by six fixed phone numbers rather than provenance. Never executed during audit; no customers or linked records deleted. | control |

Source areas above refer to `js/features/<area>/<area>.js`, except `services/communications` (`js/services/communications.js`) and combined references. Shared persistence and monetary rules live in `js/core/db.js` and services. Readable/minified files are paired production assets, not redundant copies.

## Nested Settings review

All 16 Settings destinations are retained: each configures an active workflow, personalisation or recovery/privacy control. The focused browser check opens their entry cards without changing settings or invoking destructive/provider actions. Configuration is not proof that a provider is connected or a notification will arrive.

| Setting | Relevance / boundary |
|---|---|
| Your Details | Adviser identity, weekly gross earnings target and minimum hourly value. |
| Company Branding | Optional name used on adviser documents; does not establish a company integration. |
| Business Base | Needed for first/last route legs; home address is sensitive. |
| Navigation | Existing preferred Maps/Waze handoff; device launch behavior still requires phone acceptance. |
| App Lock | Local passphrase timeout; keep recovery guidance. |
| Morning Brief | Relevant day overview when opening the app; not a guaranteed background assistant. |
| Visit Alerts | Useful next-visit reminder; subject to platform permissions/background limits. |
| Automated Messages | Actual purpose is travel **drafts**, not autonomous sending. Rename this remaining legacy heading in a later focused wording pass. |
| Commission Rate | Required to estimate adviser earnings; keep distinct from optional job-costing policy. |
| Advisor Mode | Company/independent workflow choice; not evidence of employment/tax status. |
| Trade | Personalisation; does not certify generic support for every trade. |
| Units | Measurement/distance preference; retain actual recorded measurement values. |
| Claude AI | Optional configured provider/proxy for scanning and drafts. Existing “Connected” summary is configuration-based, not a health check; recommend “Configured” in a focused wording pass. Transcription/media configuration is not removed with the mock integration adapter. |
| Communication history | Recent saved activity and explicit human send confirmation; full customer context remains in Customer/Visit. |
| Data & Backup | Protected/raw export choices, restore and deliberate destructive reset; no factory reset tested against real data. Existing “Persistent” index summary reflects storage availability, not a guarantee against eviction; prefer a precise availability label. |
| Privacy & Legal | Disclosures, choices and erasure access remain necessary. Navigation/source review is not independent legal assurance. |

Other contextual tools (photo gallery, typed/audio notes and transcription, window measurements, quotes, job checklist/aftercare and social drafts) retain their existing Customer/Visit/Job entry points. No source or user data was removed merely because it lacks a top-level Tools tile.

## Findings addressed

- **P1 — unsafe demo removal:** phone-only matching could delete a customer with the same number and linked history. Removed tile/constants/confirmation/delete routine; records retained. Source review and throwing DB stubs verify Tools never reads the demo flag or deletes matching customers. No destructive live reproduction.
- **P1 — misleading costing revenue:** no dated policy, unknown collection responsibility, or a company-managed order with a sole-trader policy could expose gross order value as adviser revenue. Read-only UI now withholds the estimate until responsibility and policy support it. Actual costs remain inspectable/loggable. Explicit company commission policy uses its effective percentage, not a claim of exact adviser pay/tax. No historical values recalculated or written.
- **P2 — cold job-costing action:** lazy costing module was referenced directly from Jobs before loading. Jobs now loads the module before opening the estimate, with retry feedback.
- **P2 — simulated integration controls:** removed in-memory ManualIntegrationAdapter/registry and Enable/Connected controls. Communication history remains in Settings; failures show an alert rather than a false empty state. Existing saved pending/conflict records remain conditional and reviewable. This does not add provider sync.
- **P2 — backup shortcut:** replaced immediate unprotected download with existing Backup & restore choices. Encryption/restore implementation unchanged.
- **P2 — contextless empty states:** unscoped Jobs and Suppliers now provide Open orders, explaining where creation starts.
- **P3 — density/duplication:** consolidated optional tools, removed duplicate global search/measure/scan entries, retired unused date helper, corrected malformed end-of-day close action and gave it an accessible name.

## Evidence and boundaries

Baseline browser evidence: `evidence/TOOLS_2026-11-07/before/`. Both engines opened each of 21 non-destructive entries with synthetic local data; no page errors/POSTs. The conditional delete tile was inspected in source only. Six off-origin resource requests in Chromium were blocked; map/OCR resources are not provider acceptance evidence.

Maintained checks: `tests/tools-safety.test.js` (source + compiled assets), `tests/browser/tools-review.e2e.cjs`, updated navigation/cleanup/money journeys, communications lifecycle tests and the existing release suite. Final run and deployment receipts are in the paired release report.

Synthetic checks exercise all 17 destinations, closed/open menu, keyboard expansion, 320/390/768 widths, safe backup entry, end-of-day close, actionable empty states, cold job costing, held company revenue and explicit commission estimate, and unconfirmed message handoff. They do not send to WhatsApp, call a person, upload customer files to AI, validate native camera/media or establish background GPS accuracy.

## Remaining risks / next priorities

1. Physical iPhone acceptance for camera/photo/video/audio, native Maps/WhatsApp, interrupted recording, location permissions and background travel/site timing. Browser WebKit is not an iPhone acceptance pass.
2. Protected backup + restore on a second physical device and clear adviser recovery guidance; local-only data can still be lost with browser/device storage.
3. Existing job-costing policies remain a separate optional estimate model from commission/Home/Money. Keep explicit labels; a future policy unification needs product review rather than silent migration. Zero/unset configuration is not evidence of no liability.
4. Company advisers should ignore suppliers/invoicing/enquiry workflows unless relevant. Do not delete saved business modules based solely on lack of founder use. Review pilot observations before further removal.
5. No CRM/accounting/MTD/tax-filing, autonomous contact, confirmed provider delivery, broad MVP readiness or pilot-approved claims are made by this audit.
