# Home visual correction — 7 November 2026

## Reason / approved reference

Muhammad's iPhone screenshot showed that cache 187 implemented functionality without faithfully matching the approved **Next customer** mockup (`beelo-home-overhaul.html`). The large adviser heading, oversized weekly panel before the customer, absent Today/Tomorrow tabs and native date-input overflow were real differences. Functional acceptance alone did not establish visual fidelity.

## Corrected implementation

- Compact `beelo.` / selected date / Search header; Today and Tomorrow tabs.
- Featured customer first; compact weekly strip immediately beneath it on Today. Assumptions remain available on demand rather than occupying the main view. Financial calculations are unchanged.
- Mockup typography, compact spacing, outlined actions and single-row Open visit link; planned time, arrival window, address, context and travel still use real records.
- Remaining visits use time at left and miles/travel duration at right. Scan/Add are the two main capture controls; Add retains visit/expense/day-plan entry points. Search stays before Ask Beelo.
- Inline calendar uses Month/Year, Week/Month/Today controls, arrow navigation, counts under dates and complete selected-day agenda. Native date input was removed from this Home picker. Control bounds verified at 320, 390, 430, 440, 768 and 1280 pixels.
- Date selection updates the selected day's customer/remaining list without rebuilding the header/calendar or losing same-week day-button focus. Prior customer actions are inert during the asynchronous day read. Future days have no Navigate/On my way action.
- Existing upcoming-visit entry retained when Today is empty, with truthful future-visit labelling. Customer profile/media, communication purposes/evidence, earnings calculations, APIs and credentials are unchanged.

## Verification / boundaries

- Full `npm test` passed; route/weekly arithmetic unit tests and documentation/asset guardrails passed.
- Revised Home acceptance passed Chromium and WebKit: layout geometry, customer-before-money hierarchy, weekly height <=120px, compact header, 320–440 iPhone widths and wider layouts, calendar control containment, retained shell/focus/scroll, eight visits, 2035 selection, future-action safety, UK phone/order search, Home/customer/back, encrypted note drafts/recovery/offline save and no serious/critical automated Home accessibility violations.
- Customer-workspace, Home outcome-timing, communication-summary, cold-offline and service-worker update browser regressions passed. Synthetic records only; outside services blocked; no calls/messages/provider requests in those journeys.
- Screenshots: `evidence/home-visual-parity-20261107/`. These are browser-engine iPhone-sized checks, not a claim of testing Muhammad's physical iPhone. Native simulator is available but was showing an older cached app and privacy sheet during inspection; no native acceptance is claimed.
- Original dirty application checkout remains untouched. This correction is isolated on `codex/home-visual-parity-20261107`, cache 188. Live deployment identity is appended after promotion and verification.
