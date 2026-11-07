# Beelo app cleanup audit — 7 November 2026

## Scope and evidence boundary

Audit and cleanup of the adviser-facing PWA, starting from release checkout `8059dfd`, following the user's instruction to remove unused, old, duplicate and cluttered elements. The original working tree was preserved; runtime edits were isolated in `codex/adviser-workflow-20261107`. This is prototype evidence, not pilot approval or certification.

Sources inspected: eager shell and service-worker inventory, lazy feature routes, action registry, Home/Companion, Visit, Customer, Tools and Money renderers, customer-document import, shared timing/context, existing unit/browser tests, deployment exclusions and prior purpose/workflow audits. A fresh synthetic browser sweep captured 22 Chromium and 12 WebKit states across core and secondary screens. Optional screens with empty states received a smoke review, not exhaustive workflow acceptance. Provider calls, external launches and real customer contact were blocked.

## Removed or consolidated

| Finding | Change and retained behavior | Verification |
| --- | --- | --- |
| Obsolete full Home layout behind the current renderer | Removed the older renderer and its unused weekly-strip query/state/actions. Missing Home code now shows an explicit reload/recovery message instead of silently switching layouts. | Delegation/recovery unit assertions; current Home/active-customer/calendar journeys. |
| Obsolete full Customer 360 layout | Removed the old renderer, duplicate timeline preparation, unnecessary preference read and old-only helpers. The current Customer workspace retains communication, money, quotes/invoices, imported documents, products, measured windows, notes/audio, photos and related work. | Customer data delegation tests; customer workspace, follow-ups, worklist and document-import browser journeys. |
| Second My Day diary implementation and polling | Removed `home-screen-controller.js` and its generated minified file from source, shell, offline assets and action registry. Ask Beelo's My Day action opens the canonical inline Home diary, including arbitrary future dates. Unmount invalidates late Home renders. | Chromium/WebKit future-date, no old controller/modal, week/month and stale-render checks. |
| Obsolete styles from removed screens | Removed 99 rule blocks whose selectors only belonged to the removed layouts/controller, plus the replaced customer-money grid. No selector was removed merely because it looked old. | [Exact selector manifest](CLEANUP_REMOVED_SELECTORS_2026-11-07.json); current-screen responsive/accessibility checks and screenshots. |
| Repeated four-tile customer money overview | Replaced with a compact recorded/expected summary. The detailed Money section and its shortcut remain. Order value remains distinct from adviser income. | Customer finance and navigation journeys; unchanged saved values. |
| Dense optional business tool list | Kept Money and Orders overview visible. Suppliers, Availability, Profitability and Invoices remain available under **More business tools**. No module, route or stored record was deleted. | Accessible names; collapsed default; expansion and route availability. |
| Promotional interruption on fitting completion | Removed the automatic “Worth sharing?” popup and its handlers. Create Social Post remains at the end of a successfully completed fitting, rather than on unfinished/partial work. | Quiet completion and manual post entry test; existing photo/video sharing tests. |
| Late outcome completion refresh | A saved outcome now checks navigation ownership before closing/refreshing a screen; an asynchronous return lookup cannot overwrite a later navigation. The wider payment regression caught this race before promotion. | Delayed lookup/navigation regression plus existing payment-allocation journey. |
| Duplicated fitting-booking branch | Removed an unreachable second `ordered` branch after the first branch had already returned. Sale/survey fitting scheduling remains in the shared branch. | Fitting-booking, deferred fitting, payment allocation and adviser-order journeys. |
| Tax details expanded automatically | Collapsed supporting estimate detail by default; calculations and access remain unchanged. | Money default-state browser assertion and finance regressions. |
| Stale private package description | Uses Beelo name and accurately mentions optional protected AI. Removed misleading “no backend, no login” description. | Package/lock root names aligned; no dependency or version changes. |
| Historical test duplication | Old weekly-Home investigation delegates to maintained current calendar coverage. Assertions aimed at obsolete Customer HTML now check current data delegation/current workspace source and live browser behavior. | Full regression suite and release checks. |

## Screen/module disposition

| Area | Audit result / disposition |
| --- | --- |
| Home, calendar, Ask Beelo | One current Home renderer and diary; scan/manual capture, customer search, weekly money and next-customer context retained. Operational answers still use shared evidence. |
| Visit, scheduling, timing, route planning | Sales, referred surveys, fittings, service calls, outcome/payment/fitting prompts, contact controls and travel/site evidence retained. No automatic mileage edits or appointment reordering introduced. |
| Customer workspace | Current primary customer surface retained. Communication history and next actions remain scoped to customer/visit; handoff is not treated as proof of sending. Notes/audio, measurements, gallery and documents remain. |
| Follow-ups, messages, leads, jobs, quotes, aftercare | Active capabilities with working routes and stored records; not safe dead-code candidates. Global Follow-ups remains secondary in Tools. No CRM/platform scope expansion implied. |
| Money, expenses, mileage, payments, invoices | Active records retained. Supporting details quieter; no tax formula, commission, service fee, ledger or company-payment ownership change. Beelo does not file taxes/MTD. |
| Suppliers, availability, profitability | Active optional modules retained behind progressive disclosure; actual removal requires a deliberate product decision and migration/export plan. |
| Scan/import, social, photos, voice/transcription | Active capabilities retained; manual approval/consent boundaries unchanged. No real document/audio uploaded during this cleanup audit. |
| Settings, encryption, backup, consent, offline recovery | Retained. No schema migration, database deletion, credential rotation or change to backup/recovery semantics. |
| Build/runtime pairs and storage fallbacks | Source/minified pairs are intentional. Dexie/minidexie fallback is exercised and required; not deleted as “duplicate”. |
| Old release/audit evidence, landing and pilot material | Historical evidence retained; these directories are already excluded from the PWA artifact by `.vercelignore`. No runtime size saving is claimed from deleting documentation. Marketing deployment untouched. |

## Remaining risks and priorities

1. Physical iPhone acceptance remains necessary for WhatsApp return, media selection/playback and location/lock/background behavior. Chromium/WebKit desktop engines are useful evidence, not an actual device test. PWA background location limitations remain explicit.
2. Customer workspace can say “No address recorded” when a visit has an address but its customer profile does not. This was observed in synthetic audit data; safely distinguishing profile versus visit addresses should be a follow-on change, rather than copying potentially stale addresses silently.
3. Home still retains a chat session on some return paths; deciding whether Home navigation should always return to the working-day feed is a separate interaction change. Existing behavior was preserved.
4. Optional secondary modules remain a product breadth decision. They should be piloted against real usage before deletion. No usage analytics or adoption evidence exists in this audit to justify declaring those modules unnecessary.
5. Comprehensive screen coverage does not prove every provider, permission, accessibility assistive technology or device/browser combination. No live AI quality, tax accuracy certification, penetration test or commercial readiness claim is made.

## Evidence and release status

- [Fresh screen sweep harness](evidence/workspace-cleanup-20261107/screen-audit.cjs), browser observations and selected screenshots are saved alongside this report.
- Cleanup-specific browser journey: `tests/browser/workspace-cleanup.e2e.cjs`, included in the maintained release suite. It covers shared future diary, optional-tools disclosure, collapsed tax detail, quiet fitting completion, retained manual social entry and compact customer money, plus persistence/navigation with synthetic records.
- Final tests, exact production deployment, artifact checks and remaining limitations are recorded in [the release record](../releases/WORKSPACE_CLEANUP_2026-11-07.md).
- Original non-documentation diff fingerprint: `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1` before and after work.
