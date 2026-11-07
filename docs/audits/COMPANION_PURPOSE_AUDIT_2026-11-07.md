# Beelo companion-purpose audit — 7 November 2026

## Conclusion and product boundary

Beelo has useful capture, customer records, visit planning and local recovery foundations. Its guidance remains fragmented: Home, Ask Beelo, Visit, Customer and Money can interpret the same records differently. The priority is a trustworthy shared answer to **“What should I do next, for which customer, and why?”**, rather than more screens or more generated text.

This is a pilot-stage prototype audit, not pilot approval, security certification or evidence of commercial traction. Beelo should sit beside company systems, maps and messaging. It is not a replacement CRM, accounting, tax-filing or MTD-filing product. Recommendations below are proposed work; no functionality was changed or removed during this audit.

## Evidence and limits

- Inspected production `https://beelo.beelestial.co.uk/`, cache194, runtime source `93846a4`; release checkout HEAD `986ebfe` at audit start.
- Fresh isolated Chromium and WebKit sessions, 390 × 844 viewport, synthetic adviser/customers only. Clock fixed to 9 November 2026, 10:30 UK time to reproduce an active working day. Real local encrypted storage was initialized in those disposable sessions.
- Captured 22 Chromium and 12 WebKit screen/state views: Home, Ask, Visit, Customer, survey variants, tomorrow planning, Tools, Money, Orders and Follow-ups; Chromium also inspected Jobs, Quotes, Invoices, Suppliers, Availability, Profitability, Aftercare, Integrations, Settings and Leads. Some optional modules had empty states; this is not completion testing of every workflow.
- No real customers contacted. Off-origin requests and external launches blocked; both runs recorded zero POST requests, zero off-origin requests and zero page errors. AI was disabled. No live Claude quality, transcription or paid-provider test was performed.
- GPS/activity was simulated. This is mobile-browser evidence, not a new physical-iPhone/Simulator GPS, VoiceOver, locked-screen or background-tracking acceptance test.
- Reproduction harness and final machine-readable observations: [harness](evidence/companion-purpose-20261107/probe.cjs), [Chromium](evidence/companion-purpose-20261107/chromium-audit.json), [WebKit](evidence/companion-purpose-20261107/webkit-audit.json). Harness uses an absolute local Playwright dependency path; adjust it when reproducing elsewhere. Browser `visibleButtons` diagnostics are not usability scores or measured taps.

## Prioritized defects — observed, not fixed

Severity: **High** undermines core guidance or financial trust; **Medium** adds material friction or hides relevant context. No critical security issue is asserted by this audit.

| ID | Severity | Reproduction and observed result | Required correction |
| --- | --- | --- | --- |
| CP-01 | High | Home → Ask Beelo → type “what next”. Both engines show “I can't look that up”. Diagnostic dispatch of `next visit`, `follow-ups`, `log expense`, `my day`, `after visit`, `evening review` also reaches the default response. | Explicit command-to-handler map, with tests through the real input/dispatch boundary. |
| CP-02 | High | Leave an earlier 09:00 visit unresolved and record arrival at the 10:00 fitting. Home correctly features the current customer; Ask “today” identifies the earlier 09:00 booking as next. | Share activity-aware selection. Show the old booking as unfinished work, not the current destination. |
| CP-03 | High | An order explicitly marked company-managed/external has a £900 balance. Home flags payments outstanding; companion Orders says the customer owes £900 and offers Record Payment. The ownership classifier correctly returns external. Orders board also displays “Owes”. | Use collection responsibility everywhere. Separate company order balance from adviser earnings, cash received and adviser collection actions. |
| CP-04 | High | Add private 100 km, unconfirmed business 5 km, confirmed business 10 km. Companion Money displays a 71.5-mile/£39.30 “Mileage claim”, aggregating all 115 km; Money weekly aggregation likewise uses all trips. | Consistent business/confirmation rules and explicit review status across summaries. Figures demonstrate a software inconsistency, not tax guidance or validation of rates. |
| CP-05 | Medium | Complete a referred survey with fitting date pending. Customer workspace shows “Review fitting date”; the same Visit next-actions panel says no action due. | Include relevant linked-order tasks in Visit context. Do not imply there is no next step. This finding does not mean fitting cannot be scheduled elsewhere. |
| CP-06 | Medium | Customer note says driveway available; active Visit note says driveway unavailable/use car park. Home brief selects the customer parking line without explaining the conflict. Saved product description mentions a required replacement bracket but is absent from the brief. | Prioritize visit-specific context with source/date; surface conflicts and relevant product/parts readiness. Never silently invent which statement is true. |
| CP-07 | Medium | Open Money with low annual profit. Tax section remains expanded: markup contains `open="false"`, which still opens an HTML boolean attribute. | Correct disclosure behavior; keep ordinary weekly money information ahead of detailed estimates. |
| CP-08 | Medium | Open Ask, then use bottom Home navigation. Chat remains visible; separate “Home” back control is needed to restore the dashboard. That back action clears the in-memory conversation. | Make Home navigation predictable; deliberately decide whether recent chat should survive navigation. Customer records were not shown lost. |

Selected visual evidence: [failed next-action answer](evidence/companion-purpose-20261107/chromium-ask-what-next.png), [conflicting today answer](evidence/companion-purpose-20261107/chromium-ask-today.png), [Home](evidence/companion-purpose-20261107/chromium-home.png), [Visit](evidence/companion-purpose-20261107/chromium-visit.png), [Customer](evidence/companion-purpose-20261107/chromium-customer.png), [survey Visit](evidence/companion-purpose-20261107/chromium-survey-visit.png), [survey Customer](evidence/companion-purpose-20261107/chromium-survey-customer.png), [Money](evidence/companion-purpose-20261107/chromium-money.png), [Orders](evidence/companion-purpose-20261107/chromium-orders.png), [Tools](evidence/companion-purpose-20261107/chromium-tools.png).

## Source diagnosis and design risks

These are source-backed findings, distinct from live acceptance tests:

- **Command integration:** `js/features/companion/companion.js:971` defines multiword/hyphenated aliases; `:1126` constructs handler names by capitalizing only the first character. These do not match methods such as `answerNextVisit` (`:1297`) and `answerAfterVisit` (`:1637`). Existing handler-unit tests do not establish that the input dispatcher works.
- **Several definitions of next:** Home activity selection lives in `js/features/today/home-workspace.js`; companion `answerToday` (`:1134`), next visit, after-visit and evening handlers maintain separate choices. Companion ETA uses base-origin estimation while Home plans chained legs. A coherent action model must own the origin, time, active state and estimate label.
- **AI lacks the full working context:** `companion.js:1819` snapshot includes basic today's visits, weekly money, monthly totals and a short due-task list. It lacks the active travel/timer state, selected customer context, saved product/measurement detail and route/window plan. `:948` sends snapshot, user input and chat history for phrasing, rather than the canonical local answer. No live hallucination was tested; the risk is inconsistent interpretation of incomplete facts.
- **Task scope mismatch:** `js/features/followups/followups.js:458` filters Visit actions by appointment ID, dropping the order-level fitting-date task. A customer-only fix is insufficient because the adviser commonly enters through Upcoming → Visit.
- **Financial ownership is already modeled:** `js/services/communications.js:111` classifies responsibility, but `companion.js:1455` and Home attention use raw balances. Fix reuse before inventing another financial model.
- **A manual handoff is not a live connection:** `communications.js:182` implements a manual adapter; its connect result is not evidence of external OAuth/synchronization. Label integrations by their actual behavior. Native messages, replies and call endings are not automatically imported.
- **Technical setup leaks into adviser onboarding:** `js/features/settings/settings.js:525` exposes proxy URL/shared-secret/provider deployment instructions. The pilot should have provisioned access and a simple readiness check; never ask advisers to administer infrastructure as ordinary onboarding.
- **Completion interruption:** `js/features/appointments/appointments.js:3823` offers a social-post prompt after fitting completion. Useful optional capability, but a poor mandatory transition when the worker needs the next destination.
- **Prototype breadth:** Jobs, Orders, Leads, Quotes, Invoices, Suppliers, Availability and Profitability introduce overlapping concepts. Some are valuable for independent work; their existence does not prove they belong in the default company-referred adviser flow. Legacy Home fallback code also remains; dependency analysis is required before cleanup.

## Recommended companion experience — proposed, unbuilt

Use one shared context/next-action service for Home, Ask, Visit, Customer and end-of-day. Each recommendation should contain: **action, customer/visit, why now, supporting records, deadline, uncertainty and completion evidence**. Distinguish known, adviser-recorded, estimated, proposed and externally confirmed information. Rules should work locally; AI can help interpret notes, explain and draft when online. Nothing sends, moves an agreed appointment or records payment autonomously.

| Working moment | Main action and relevant context | Keep out of the way |
| --- | --- | --- |
| Preparing | Next agreed visit, access/parking, product/parts readiness, missing essential information; clear route origin and buffered travel estimate. | Generic business dashboards and unrelated overdue lists. |
| Travelling | Glanceable destination/arrival window and return-to-visit recovery. Any communication remains user controlled and safely initiated. | Nonurgent prompts, typing requests and marketing. |
| At customer | Current purpose: sales, referred survey, fitting or £20 service call; measurements, notes/voice, photos, customer discussion and outcome. | Asking for an outcome merely because a booking time has passed while the visit is active. |
| Leaving | Confirm end of on-site work, preserve unresolved issues, show the next destination and any urgent contact requirement. | A mandatory social post or duplicate introduction. |
| End of day | A short review of unresolved facts, expenses/mileage needing review, and tomorrow's practical plan. | Another long task board or accounting workflow. |

For referred surveys, record measurements/product discussion and the adviser-recorded status of submission to Hillarys, then the fitting agreement. Do not pretend Beelo submits to company systems. Manufacture and delivery remain company responsibilities unless an actual integration is built and approved.

Customer workspace should remain the working hub: a concise current action, useful context, communication evidence, products/media/documents and adviser money. Use one contact entry point and avoid duplicate reminder controls. During an active visit, “At this visit” is more useful than “Before you arrive”. Show missing customer address distinctly from a known visit address rather than making the adviser re-enter data unnecessarily.

## What to keep, simplify or defer

| Treatment | Capability | Reason / decision boundary |
| --- | --- | --- |
| Keep central | Scan/manual appointment capture; diary/day plan; route/map handoff; customer search/history; notes with voice; measurements/photos/documents; human-controlled communication. | Directly reduces remembering, copying and switching during the working day. |
| Keep concise | Mileage/time/expense evidence, weekly target and estimated net, export/recovery. | User-requested working awareness; use consistent evidence and clearly label estimates. Do not expand into filing or full accounts. |
| Simplify | One shared next-action model; one customer workspace; consistent Visit/customer tasks; secondary global Follow-ups in Tools. | Customer work should be actionable where that customer is already open. Global overview still serves personal/unlinked work. |
| Hide by work mode / defer | Supplier purchasing, advanced profitability, full invoice/receivables workflow, generic CRM pipeline, retention campaigns. | Usually outside a company-referred fitter's responsibilities. May remain useful for own-business users. Do not delete features or existing records without Muhammad's decision. |
| Optional, quiet | Social posting, broad local news/sport/conversation prompts. | Preserve requested media marketing tools; prioritize operational readiness before optional conversation suggestions. |
| Strategic limitation | Continuous automatic background travel/arrival/departure. | Current PWA needs usable location updates; a locked phone or foreground Maps can prevent them. Do not promise an always-observing companion. Native/background investment requires separate design and device evidence. |

## Ordered implementation and acceptance gates

1. **Restore trust:** CP-01 through CP-04 first. Input-level tests must cover every advertised command; Home/Ask/Visit must agree on an active customer with an old unfinished visit. External balances must never create adviser collection instructions. Private/unreviewed mileage must not silently become a claim.
2. **Unify context/tasks:** CP-05/06, active-state-aware reminders, provenance/conflicting notes and linked products. Test a survey without fitting date; missing parts; rescheduling with an agreed window; canceled/completed visits; already-introduced customer; opened-but-unconfirmed WhatsApp; unresponsive customer. No duplicate introduction, silent cancellation or assumed sending.
3. **Simplify one work moment at a time:** preparing, travelling, on site, leaving, evening. Test actual Upcoming → Visit → Customer navigation, not only direct feature methods. Then reduce redundant controls and fix CP-07/08.
4. **Pilot readiness:** easy access setup, offline capture/reload/reconnection, backup recovery, provider-failure states and physical iPhone checks. Validate background limitations explicitly before claims.
5. **Measure usefulness:** proposed metrics include time to choose the correct next action, taps/context switches, irrelevant prompts, duplicate entry, recovery success and unresolved end-of-day work. These are proposed measurements, not demonstrated benefits or traction.

Decisions for Muhammad: company-assigned versus own-business default mode; which secondary modules to hide versus retain prominently; any navigation renaming; financial-estimate boundary; native-background investment; and real external integrations/data permissions. This audit authorizes none of those scope changes.

## Preservation and verification

Audit-only changes: this report, synthetic evidence and a development-record entry. No runtime edit, feature removal, migration, provider setup or deployment. Original working-tree non-documentation changes remained byte-identical under the recorded Git diff hash `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`. Documentation checks and reference verification are recorded with the completed audit entry.
