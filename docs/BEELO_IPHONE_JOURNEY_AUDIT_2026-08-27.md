# Beelo iPhone Journey Audit — 27 August 2026

## Verdict

**Controlled-pilot demonstration: conditionally credible.** The current product
supports a substantial solo home-visit adviser journey as an offline-first,
human-controlled operational-memory tool. It should not yet be presented as a
fully validated iPhone pilot release because the legal/privacy disclosures are
not production-complete, the exact “survey” terminology is absent, and several
requested branches were proved by automation/source rather than completed by
hand in the Simulator.

No real person or external service was contacted. No customer message was sent.
No product code or test harness was changed.

## Evidence boundary

- **Real Simulator observed:** iPhone 17 Pro, iOS 27.0, Safari against the local
  app at `127.0.0.1:8001`. Visually inspected Home, empty Lead Inbox, New Enquiry
  form, Visits diary, and New Visit form. Screenshots are in
  `screenshots/audit-iphone-simulator-2026-08-27/`.
- **Automated iPhone visual journey:** Playwright at 393 × 852, 3× DPR, touch,
  Safari user-agent and standalone-PWA display mode. Sixteen current screenshots
  are in `screenshots/audit-ios-journey/`; the run passed all scripted checks.
- **Domain/browser evidence:** targeted lead, appointment, capacity,
  communications and money tests passed. Offline boot/transition checks passed.
  The current axe sweep passed with no serious/critical or moderate/minor
  violations; one overlapping Leaflet map-pin target-size result is explicitly
  treated by the suite as the WCAG 2.5.8 essential exception with a textual stop
  list alternative.
- **Limitation:** Simulator keyboard automation did not reliably enter text into
  the web form. Therefore no new record is claimed as manually saved in the real
  Simulator. Data mutation, conversion, persistence, outcomes and finance were
  validated using isolated synthetic browser fixtures and domain tests. This is
  a validation gap, not a product failure.

## Journey results

| Journey step | Result | Evidence / boundary |
|---|---|---|
| Empty lead state and new-lead entry point | Pass | Real Simulator shows “No enquiries yet”, two Add Enquiry entry points, and a focused New Enquiry form. |
| Save a lead before customer/visit exists | Pass (automated) | `tests/leads.test.js`: lead saves as `new` without customer or appointment; PII is not serialized into navigation. |
| Convert lead to a booked visit | Pass (automated) | Lead routes to Add Visit by ID; appointment save uses the atomic DB conversion API and locally hydrates lead details. |
| Initial/sales appointment | Pass | Implemented as **Consultation**, not “Initial/Sales”. Appointment-type and save tests passed. |
| Survey appointment | Partial / terminology gap | There is no `survey` type. **Measure** is the supported operational equivalent and has measurement-specific outcomes and tooling. Do not claim a distinct Survey workflow. |
| Service call | Pass | Service Call has distinct UI, context, outcomes and follow-up behavior; visually evidenced in the iPhone journey. |
| Customer/job context and history | Pass | Customer 360, visit history, order/job links, notes, photos and measurement records are implemented; service-call detail visually showed customer, address, timer and photo context. |
| Supported media/context | Pass with boundary | Customer/visit photos and OCR capture exist. Camera permission and a new physical capture were not exercised in the real Simulator during this run. |
| Reschedule and conflicts | Pass (automated) | Duration-aware overlap, leave/capacity warnings and advisory alternative slots passed. Existing type remains editable; advice does not silently reschedule. |
| Pre-appointment context | Pass | Home/My Day, featured next visit, visit detail, address/access context and message-stage context were visually exercised. |
| Follow-ups | Pass | Outcome, intro, quote, post-fit, service and payment work appears in one due/not-due view; snooze and explicit actions are visible. |
| Communication drafts remain human-controlled | Pass | Preview is editable and the final CTA is **Open WhatsApp**. Domain test records `handed_off`, never `delivered`; advisor-confirmed sent is a separate event. No external handoff was activated in this audit. |
| Mileage/travel | Pass | Synthetic GPS route accumulated distance, survived intermediate state and auto-finished at arrival; Money reflected the logged trip. |
| Expenses, earnings, commission and deductions | Pass with positioning boundary | Expense, mileage claim, configurable commission, profit and tax-planning calculations passed targeted tests. UI says earnings/commission and tax estimate; this is not accounting, tax filing or MTD filing. |
| Offline, reload and return online | Pass (browser automation) | Online banner hidden; offline transition shown; fresh offline service-worker launch booted the full shell; banner cleared on return online. A real-Simulator network cut was not performed. |
| Completion/cancellation/history | Pass (automated/source) | Completed outcomes create durable history; cancelled visits are excluded from daily/financial totals; job completion/sign-off/payment are distinct explicit states. |
| Persistence and backup/recovery | Pass with test defect | Storage tests passed both Dexie and fallback engines, including reload-style persistence and atomic import. Journey F restored all business records but its table-count assertion failed because the intentionally preserved device AI-secret setting adds one settings row. |
| Navigation/responsive behavior | Pass for tested states | Real Simulator rendered without horizontal clipping in observed states. Automated iPhone checks passed standalone mode, safe area, ≥16 px inputs, ≥40 px sampled targets and zero horizontal overflow. |
| Accessibility | Pass for automated scope | Current axe sweep covered 24 screens/states with no unaccepted violations or page errors. Physical VoiceOver/TalkBack remains unverified. |

## Prioritised defects and gaps

### P0 — operator/legal details are placeholders

**Reproduction:** open Settings → Privacy Policy or Terms of Service and inspect
the Operator block.
**Observed:** name, address, email and company number are `—` in
`js/core/legal.js`.
**Impact:** not suitable for a public or external pilot onboarding claim; users
cannot identify/contact the operator from the legal pages.
**Evidence:** source plus the existing legal-phase note.
**Action:** populate verified operator identity/contact details and obtain an
appropriate UK privacy/legal review before pilot onboarding.

### P0 — privacy promise omits material network egress

**Reproduction:** read the one-time consent sheet and Privacy Policy, then compare
with Route/weather/geoprovider behavior.
**Observed:** consent says “everything” stays on the phone and frames Claude as
the one optional feature sending anything out. The policy mentions map-tile IP
requests and AI, but not that geocoding can transmit customer addresses/postcodes,
routing transmits coordinates, and weather uses location context.
**Impact:** undermines the strongest pilot trust claim and may produce an
incomplete privacy disclosure.
**Action:** distinguish local business-record storage from necessary service
requests; name data categories, providers/purposes, controls and offline behavior.

### P1 — “offline sync” is an unimplemented claim

**Reproduction:** inspect the landing hero image alt text in
`landing/src/components/Hero.tsx`.
**Observed:** it describes “offline sync”; the current product has no account,
remote sync or multi-device sync.
**Impact:** assistive-technology and metadata users receive a false product claim.

**Action:** replace with “offline access” or another verified description.

### P1 — “context across existing tools” needs qualification

**Reproduction:** compare landing compatibility copy with Settings/integration
behavior and `tests/communications.test.js`.
**Observed:** Beelo consolidates context entered/imported into Beelo and hands off
to external apps. It does not currently connect to a company CRM, diary, accounting
platform or messaging history by default; the manual integration adapter is
disabled until explicitly connected.
**Impact:** adviser/support conversations could imply interoperability that is not
shipped.
**Action:** say Beelo provides a personal layer for context the adviser captures
from those tools; name only proven imports/handoffs.

### P1 — end-to-end backup journey has a stale assertion

**Reproduction:** run `node tests/browser/run-journeys.js`; Journey F fails its
“every table restored to exported size” check.
**Observed:** all exported business data restores, but settings changes from one
row to two because the device AI secret is intentionally preserved; the same
journey then positively asserts that preservation.
**Impact:** release suite reports a failure despite intended behavior, weakening
signal and encouraging teams to ignore red builds.
**Action:** compare portable settings separately from device-local secrets.

### P2 — requested “Survey” language does not match the product

**Reproduction:** open New Visit and inspect appointment types.
**Observed:** Consultation, Measure, Fitting, Follow Up, Review and Service Call;
no Survey type.
**Impact:** adviser demonstrations may create expectation of a distinct survey
workflow.
**Action:** decide whether Measure is the deliberate customer-facing term; if so,
document the mapping consistently.

### P2 — real-device evidence remains incomplete

The following were not proved manually in the installed Simulator: typed/saved
lead conversion, camera/photo permission and capture, a full reschedule gesture,
true network interruption, VoiceOver, notification permission/delivery, and app
kill/relaunch recovery. Automated/source evidence exists for most underlying
behavior, but it is not a substitute for the pilot device matrix.

## Positioning conclusion

Safe, evidence-backed wording:

> Beelo is a pilot-stage, offline-first personal operational-memory PWA for a
> solo home-visit adviser. It keeps the core working record on the device, helps
> assemble visit/customer/job context, and prepares messages for review before an
> explicit handoff. It is not a CRM replacement, accounting system, tax-filing or
> MTD-filing product.

Avoid saying “everything stays on the phone” without explaining service-request
egress, “offline sync”, automatic communication, live CRM/accounting integration,
or a distinct Survey workflow.
