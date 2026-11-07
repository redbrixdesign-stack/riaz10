# Home and customer workspace integration — 7 November 2026

## Scope and preservation

Approved interactive Home/customer design integrated into the existing prototype, starting from verified public runtime `1513bc9` / release evidence `339eee1`. Isolated branch `codex/home-workspace-20261107`; original checkout and its unrelated dirty application files remain untouched. Original non-documentation diff SHA-256: `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`.

## Implemented

- One featured customer, clickable customer name, separate Visit entry, context and state-appropriate actions. Contact expands beside the card, Call before Message. Customer profile Message opens WhatsApp; SMS is an explicit fallback. Nothing sends autonomously.
- Inline header calendar with week navigation, native arbitrary future-date selection, appointment counts and complete selected-day agenda. Same-week day buttons retain their DOM identity and focus; the Home page is not rebuilt on date selection.
- Search before optional Ask Beelo: customer name, UK-normalised phone, postcode/address, customer/order reference. Duplicate outward postcode removed from results.
- Weekly earned/target, recorded expenses and a clearly labelled illustrative after-tax budget. Earnings are not commission received. The estimate annualises this week's profit, uses configured tax/Class 4 bands, and uses confirmed business mileage with annual 10,000-mile bands. Mileage reduces taxable profit without being subtracted again as cash. Vehicle-running/ambiguous insurance categories are excluded from the tax expense deduction; actual recorded expenses still reduce the budget. This is not a validated eligibility assessment, accounting ledger, tax forecast or filing feature.
- Planned per-leg travel: base → first visit → subsequent visit, resetting each UK day. Completed stops remain predecessors; cancelled stops are excluded; unknown coordinates break the leg. Existing straight-line × 1.3 distance model and 35 km/h planning speed, plus exactly 10 minutes per leg. No live traffic or new trip/mileage writes.
- Customer shortcuts for Communication, Money, Products, Notes, Photos and Documents; money collapsed initially. Existing gallery, measurement records, quotes/invoices, customer payments, adviser earnings and communication evidence remain distinct.
- Customer note editor keeps existing typed/voice recording/playback/transcription controls, centres Save, saves without dismissing, updates visible context/audio, and recovers encrypted device-local drafts after reload. Concurrent-editor/customer-note checks prevent blind overwrite. Unfinished drafts stay out of exported backups and block restore until saved.

## Evidence

- New `tests/home-workspace.test.js`: route-chain boundaries, unknown locations, cancellations, annual mileage-band crossing, private/unconfirmed trip exclusion, cash-vs-deduction calculation.
- New `tests/browser/home-workspace.e2e.cjs`: Chromium/WebKit, realistic synthetic records, inline contact, retained calendar/focus/scroll, eight visits, 2035 date, UK phone/order search, 320/390/430/768/1280 widths, profile sections, encrypted draft/reload/offline save in place. No external contacts/provider calls.
- Existing customer-workspace and contact-handoff acceptance updated for intentional collapsed-money/save-in-place/WhatsApp-first behaviour; original communication/send-evidence assertions retained.
- Build, full unit/regression suite, maintained hosted browser acceptance, social checks, documentation guardrails and performance-gate tests are release requirements. Final results and deployment identity are recorded below after completion.

## Limits / next priorities

- Native iPhone hardware interactions and actual WhatsApp/Maps handoffs need a user smoke test; WebKit browser acceptance is not a claim of physical-device validation.
- WhatsApp installation, delivery, actual call duration and native-app edits cannot be detected reliably by this PWA. No automatic SMS after an unobservable failure.
- Travel is approximate planning guidance, not a road route/arrival promise or logged business mileage.
- Weekly budget assumes standard configured bands and no other income, adjustments or Scottish-specific tax treatment. Recorded expense eligibility/private use is not verified. Conservative category exclusions can understate deductions; review records with an accountant. It must not be described as actual take-home.
- Audio transcription remains the existing configured OpenAI proxy, not a new Azure integration. No provider keys/settings were changed in this release.
- Real gallery and quote/invoice workflows are reused; synthetic mockup photos/documents are not shipped.

Tax reference evidence checked 7 November 2026: [HMRC vehicle simplified expenses](https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles), [Income Tax bands](https://www.gov.uk/income-tax-rates), [Class 4 National Insurance](https://www.gov.uk/self-employed-national-insurance-rates).

## Completed local verification

- Full `npm test` passed; added Home calculation/route tests and final Companion checks also passed after the targeted Home refresh correction.
- All 36 unique maintained browser journeys passed across the initial run and resumed runs. Two obsolete presentation selectors were updated for the intended layout; behavioural assertions were retained. Final Home acceptance was rerun in Chromium and WebKit after finding and fixing a real stale-read race that could replace an expanded Contact panel.
- Home WCAG A/AA automated check: no serious/critical violations. Fixed the unlabelled scan input found by that check. This is bounded automated coverage, not accessibility certification.
- Social checks, documentation guardrails, performance-gate tests, build/minified asset manifest and `git diff --check` passed. No new Lighthouse performance measurement or physical-device pass is claimed.
- Evidence: `evidence/home-workspace-20261107/validation.json` and four browser screenshots. Existing workflows were tested with synthetic data; no real calls/messages or provider requests were made by those browser journeys.

## Live deployment — complete

- Runtime commit: `2ead71f9de462613f7cf856979892e30c5b3f992`; pushed on `codex/home-workspace-20261107`.
- Cache: `advisoros-v6-187-home-workspace`.
- Verified project/team: `beelo1` / `beelomvp` (`prj_CAmB2Q25P5G1oMCCIxMhs2FWzAwE`).
- Exact staged production deployment: `dpl_AXh6ZdgS3x19yxLMWAmnpNDmx6wF`, `https://beelo1-hczvuvf63-beelomvp.vercel.app`. Promoted that same deployment without rebuilding.
- Public app: https://beelo.beelestial.co.uk/ resolves to that deployment. All eight changed served assets match local/staged SHA-256. Both `/api/claude` and `/api/transcribe` reject GET with 405; no provider request was made by that endpoint-presence check.
- Public-origin Chromium/WebKit Home/customer acceptance passed with isolated synthetic data, blocked outside services, no POSTs, and automated accessibility checks. Test-only axe injection was moved to browser initialization to retain production CSP protection.
- No credentials/environment values changed. No public preview-share link was created; automatic approval review rejected that access grant and verification continued through existing authenticated CLI access.
- Original checkout's non-documentation diff hash remains unchanged. Its living development record receives an append-only evidence entry; no original application edits are staged into this release.
- Existing installations may need **Update and reload** when Beelo displays the update banner. Native iPhone hardware smoke testing remains an open evidence item.
