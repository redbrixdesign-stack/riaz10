# Beelo internal truth audit

**Purpose:** provide a defensible, evidence-linked account of what Beelo is,
what works now, what has only been designed, and what remains unknown before
partner meetings or a controlled pilot.

**Audit started:** 25 August 2026<br>
**Repository reviewed:** `/Users/muhammadasifriaz/riaz10` on `main`<br>
**Product name:** Beelo<br>
**Legacy/internal runtime name:** AdvisorOS

This is an internal control document, not marketing copy. Where documentation,
source, tests, the deployed product, and real-world evidence disagree, the
least-assured interpretation is used until the conflict is resolved.

## 1. Status language

Every product statement must use one of these statuses.

| Status | Meaning |
|---|---|
| Verified now | Present in current source and supported by a relevant passing test or direct observation. |
| Partially verified | Some of the claim is supported, but an important environment, flow, or production condition remains unchecked. |
| Prototype evidence | Used by the founder in practice, but not yet validated with an independent pilot cohort. |
| Designed | A documented design or contract exists, but implementation or end-to-end evidence is incomplete. |
| Planned | Intended future work with no claim of current availability. |
| Unknown | Evidence has not yet been collected. |
| Not built | Explicitly outside the current implementation. |

Avoid the words **proven**, **validated**, **secure**, **compliant**, **fully
offline**, or **production-ready** unless the relevant evidence level below is
also stated.

## 2. Evidence levels

| Level | Evidence |
|---|---|
| E0 | Founder statement, idea, or marketing assertion only. |
| E1 | Current readable source or canonical architecture supports the claim. |
| E2 | A relevant automated test passes against the current source. |
| E3 | The current built or deployed product is directly observed completing the flow. |
| E4 | A non-founder target user completes the flow during real work and the result is recorded. |
| E5 | Independent specialist, research partner, or formal evaluation supports the result. |

“Implemented” normally requires E1 plus E2 or E3. “Validated with users”
requires E4. “Independently validated” requires E5.

## 3. Product surfaces that must remain separate

### 3.1 Beelo PWA

The root application is a single-user, device-local progressive web app for a
solo field advisor. It contains the operational product and stores working
records locally.

### 3.2 Optional AI proxy

`api/claude.mjs` and the optional Express wrapper are network services for
Claude-assisted OCR, drafting, receipt parsing, companion phrasing, and
restricted intent routing. They are not required for the core local app.

### 3.3 Public landing page

`landing/` is the public Beelo pilot-recruitment and partner-information site.
It is not the PWA and does not demonstrate that every depicted product flow is
deployed to pilot users.

### 3.4 Pilot application handler

`landing/public/api/pilot.php` validates pilot applications, applies basic
anti-abuse controls, emails Beelo, and sends an acknowledgement. Application
data therefore leaves the applicant's browser and is processed through the
IONOS hosting and mail environment.

## 4. Initial capability truth table

| Claim or capability | Current status | Evidence | Honest boundary for meetings |
|---|---|---|---|
| Beelo is a single-user operational companion for solo field advisors. | Verified now | E1: `Architect.md`, root source; E2: current unit suite | It is not yet a multi-user service or a general team platform. |
| The core app is an installable, offline-capable PWA. | Partially verified | E1: `manifest.json`, `sw.js`; E3: installed and launched from the iOS 27.0 Simulator home screen on 25 August 2026; current unit suite does not re-prove cold offline behaviour | Say “offline-capable” or “core local workflows are designed to remain available offline.” Installation is now reverified in Simulator, but production HTTPS, cold-offline launch and real-device evidence remain outstanding. Do not say every feature works offline. |
| Working records are stored locally on the device. | Verified now | E1: IndexedDB/Dexie and local-storage implementation; E2: storage tests | There is no cloud sync, server backup, account recovery, or automatic device migration. |
| Sensitive local fields are encrypted at rest. | Verified now in the tested browser model | E1: AES-256-GCM/PBKDF2 field encryption in `js/core/db.js`; E2: storage tests | A forgotten passphrase cannot be recovered. This is not an independent security certification. |
| The user can export and restore operational data. | Verified now | E1: export/import services; E2: 38-table round-trip, corruption, rollback, and legacy tests | Exported operational backups contain readable customer data before optional file encryption. Backup handling must be explained clearly. |
| Beelo prepares messages for review rather than silently sending them. | Verified now | E1: editable preview and WhatsApp hand-off; E2: communications and scheduler tests | Opening WhatsApp is only a hand-off. Delivery is not known; the advisor explicitly confirms whether they sent it. |
| Contact preference and communication lifecycle records exist. | Verified now | E1: retention/communications services; E2: Phase 6 tests | These records depend on what the advisor enters. Beelo does not infer consent, delivery, or a reply from opening another app. |
| AI is human-controlled and optional. | Verified in source and tests | E1: AI disabled until configured; preview/edit flows; E2: AI/proxy tests | Production AI configuration and live Anthropic processing have not been reverified in this audit. AI requires connectivity and may be wrong. |
| Core AI-related data flows are minimised and restricted. | Partially verified | E1: request contracts, allowlists, caps, timeouts, origin checks; E2: proxy and parser tests | This is an implementation control, not a DPIA, penetration test, or external responsible-AI assessment. Some prompts necessarily transmit selected working context to the configured proxy and Anthropic. |
| Visits, customers, notes, follow-ups, orders, jobs, measurements, expenses, mileage, commission and planning estimates are implemented. | Verified now at domain-test level | E1: feature and service modules; E2: current test suite | A fresh full browser journey and real-device check are still required before pilot onboarding. Tax figures are planning estimates, not filing or accounting advice. |
| Beelo can surface schedule and travel risk. | Verified now at rules/domain level | E1: capacity, route and appointment modules; E2: capacity, route and geo-provider tests | Advice is deterministic and overrideable; Beelo does not silently reschedule. Online route services can fail or return estimates. |
| Local OCR and optional AI-assisted image reading exist. | Partially verified | E1: OCR and AI services; E2: parsing and save tests | Local OCR quality varies. AI image reading requires connectivity and transmits the selected image to the configured proxy/provider. |
| Voice capture is available. | Not built / not claimed publicly | Current landing copy removed voice; no current meeting claim should include it | Do not show or promise voice capture. |
| The product has been field-tested by the founder. | Prototype evidence | Founder history and prototype use | Say “founder-tested” or “built from lived field experience.” Do not present this as an independent user pilot. |
| Beelo reduces admin time, missed follow-ups, travel, or errors. | Unknown as a measured outcome | No baseline and post-use pilot data yet | Present these as pilot hypotheses, not achieved impact. |
| There is proven demand beyond the founder. | Unknown / early signal only | One new application and partner replies are signals, not validation | Applications, interviews, activation, continued use, and outcome data must be measured separately. |
| Beelo is commercially scalable. | Not validated | No accounts, sync, billing, support model, unit economics, or scaled cohort | Commercialisation is a research question for the pilot and partners. |
| The current product is suitable for a 5–10 person controlled pilot. | Designed, not yet cleared | Product and tests exist; pilot protocol and onboarding controls are incomplete | Pilot start requires the readiness gates in section 8. |

## 5. Verification completed in this audit

On 25 August 2026, `npm test` completed successfully with exit code 0 after
being rerun with local loopback access for the proxy-server tests. The command
executes 36 Node test files covering, among other areas:

- UK date/time and DST behaviour;
- IndexedDB and fallback storage;
- encryption, migration, deletion, backup and restore;
- AI client and proxy contracts, limits, origin/secret checks and timeouts;
- companion, communications, scheduler and follow-up logic;
- leads, quotes, jobs, invoices, suppliers and retention;
- expenses, mileage, commission/tax planning and profitability;
- routing, geocoding fallbacks, measurements and appointment rules;
- documentation/product-language contracts.

This is strong E2 implementation evidence. It is not a substitute for current
browser, production, mobile-device, field-user, privacy, or security evidence.

### 5.1 iPhone Simulator screen audit

On 25 August 2026, the root PWA was exercised in Safari and as an installed
home-screen web app on an iPhone 17 Pro Simulator running iOS 27.0. This is E3
Simulator evidence, not a real-device or field-user test.

Verified observations:

- Safari loaded the local PWA and completed encryption setup, onboarding and
  navigation to Home, Follow-ups, Orders, Money and Tools.
- Add to Home Screen used the Beelo name and branded icon.
- The installed web app loaded its assets from the local server and rendered
  the encryption gate in standalone mode.
- A transient white screen coincided with the beta CoreSimulator service
  becoming unavailable. After the Simulator service recovered, the same
  installed web app rendered correctly without an application change. It is
  therefore recorded as test-environment instability, not a confirmed Beelo
  PWA defect.
- Installed mode has its own fresh storage context in this test and correctly
  asked for a new encryption passphrase.
- After the web app process was terminated and relaunched, Beelo retained the
  encryption setup, displayed **Unlock Beelo**, and accepted the correct
  passphrase to return to onboarding.
- The onboarding Home screen, current tax-year screen and core bottom
  navigation rendered at iPhone dimensions.

Resolved and reverified on 25 August 2026:

1. The local encryption passphrase now uses a masked, single-line text control
   classified as a one-time code rather than a website-account password. Two
   input-based approaches were rejected during testing because iOS still
   offered **Use Strong Password?** or **New Strong Password**. The final
   control produced neither password-generation nor save-password prompts,
   remained visually masked, and passed both first-launch and unlock flows.
2. A cold launch no longer requests or watches location. Permission is now
   requested only when the user starts a location-dependent workflow, or when
   Beelo resumes an already-active trip. Clean encryption setup and onboarding
   completed without a location prompt.
3. Navigation now dismisses the focused form control and resets the app,
   document and window scroll positions immediately and after the iOS
   keyboard-close window. After scrolling the long onboarding form to its end,
   Home, Follow-ups, Orders, Money and Tools all opened at the top. A compact
   mobile action treatment also removed the Follow-ups title/action collision.
4. Automated regression coverage now verifies the passphrase control,
   cold-launch location behaviour and post-form navigation reset. The complete
   project suite, P0 browser checks and iOS configuration checks all pass.

Remaining presentation risk:

1. In Safari, the AI control, floating action button, toast, app bottom
   navigation and browser toolbar can crowd the lower viewport. This should be
   checked in both standalone and Safari modes against the supported-device
   matrix.

The onboarding statement that the 2026/27 UK simplified mileage rate is 55p
per mile for the first 10,000 business miles was checked against current HMRC
guidance and is accurate. The post-10,000-mile rate remains 25p. This remains a
planning aid, not filing or accounting advice, and the product must preserve
the eligibility caveats in HMRC's simplified-expenses guidance.

The working tree already contained uncommitted landing-page changes when this
audit started. Those changes are user work and have not been modified by the
audit except for adding this document.

### 5.2 Seeded operational journey audit

On 25 August 2026, a repeatable local-only dataset was loaded in the iPhone 17
Pro Simulator. It includes a busy current week, 25 upcoming visits, multiple
visit and outcome types, customer history, orders, follow-ups, mileage,
expenses, photos and message history. The seed now starts a deterministic test
encryption session and remains excluded from production deployment.

The iPhone-sized operational journey passed across Home, Visit detail,
Customer 360, Contact, outcome capture, Orders, Money, Follow-ups, message
preview, live-trip arrival, My Day and Ask Beelo. Focused regressions also
passed for four-visit Home completeness, promised arrival windows, chained
travel estimates, modal typing, order/payment state, scan handoff, settings,
message templates, onboarding, privacy/consent, deep links, offline shell and
passphrase reload/unlock. The accessibility sweep covered 25 screens and
modals with no WCAG A/AA serious or critical violations; the route map-pin
target remains the documented essential map-marker exception.

Three failed checks were traced to stale test infrastructure rather than
product defects and were corrected: Home travel selectors now follow the
current component markup, the four-visit arrival-window fixture assigns its
window to the featured visit, and unlock tests expect the current **Unlock
Beelo** brand text. All three corrected regressions pass locally; the unlock
flow also passes against production.

## 6. Critical truth gaps found

### 6.1 Operator details in the PWA are placeholders

`js/core/legal.js` still displays em dashes for operator name, address, email,
and company number. The app must not be presented as legally ready for an
external pilot until correct operator details are inserted and reviewed.

### 6.2 Pilot privacy arrangements are not yet complete

The landing page explains purpose and control in plain language, but a
controlled pilot still needs a specific privacy notice covering at least:

- Beelestial Ltd's identity and contact details;
- applicant and participant data categories;
- purposes and lawful bases;
- IONOS/email and any other processors;
- retention and deletion periods;
- international transfers, if any;
- participant rights and complaint route;
- the distinction between applicant data, participant research data, and
  customer data entered by participants.

### 6.3 Backup confidentiality needs an explicit rule

The storage tests confirm that exported backups carry readable customer PII so
they can be restored on another installation; the export layer can optionally
encrypt the file. Pilot onboarding must either require encrypted exports or
clearly prohibit insecure sharing/storage of unencrypted backups.

### 6.4 Production state is partially evidenced

On 25 August 2026, release `dpl_FBGZgdUU1qJmJ3CzU444sFZ6Hn1R` was deployed
to the existing Vercel project `beelo1` and aliased to
`https://beelo.beelestial.co.uk`. Direct production checks confirmed:

- HTTP 200 over HTTPS with CSP, HSTS, nosniff, Referrer-Policy,
  X-Frame-Options and Permissions-Policy headers;
- service-worker cache `advisoros-v6-82` and the expected release asset tokens;
- the masked non-credential passphrase control in `app.min.js?v=31`;
- consent-safe location initialisation in `geo.min.js?v=8`;
- service-worker control and a successful offline shell reload;
- the live iOS configuration and full live smoke suites pass.

Production evidence is still required for the AI proxy configuration, a cache
upgrade on a previously installed physical device, the complete pilot
form/autoresponse path after the latest landing changes, and current behaviour
on supported physical iPhone and Android devices.

### 6.5 Public-domain consistency remains an operational risk

Search/crawl evidence can still surface an older WordPress template for the
root domain. The live site, DNS, caching, canonical metadata, indexing and
retired WordPress content need a separate production verification record.

### 6.6 Outcome claims have no independent baseline

No current evidence quantifies time saved, follow-ups recovered, schedule
mistakes avoided, mileage-record completeness, commission discrepancies found,
or continued weekly use. These must become pilot measures rather than pitch
claims.

### 6.7 Simulator evidence exists; real-device evidence does not

Xcode 27 beta and the iOS 27.0 Simulator runtime were installed on 25 August
2026, and the PWA was exercised on an iPhone 17 Pro Simulator as described in
section 5.1. The beta CoreSimulator service became unavailable once during the
installed-app test and later recovered, so environment failures must be kept
separate from reproducible product defects. A supported physical iPhone and at
least one supported Android device are still required before pilot clearance.

## 7. Claims currently safe for a partner meeting

Subject to a concise “current prototype” qualifier, the following statements
are supported:

- Beelo is a founder-built, single-user PWA for solo field advisors.
- Its core records are device-local and its architecture is offline-capable.
- It connects visits, customer context, follow-ups, work records, mileage,
  expenses, commission and planning information in one operational view.
- Messages are editable drafts and are never silently sent by Beelo.
- Optional AI is off until configured, requires connectivity, and remains
  subject to user review.
- The current code has substantial automated domain, storage, privacy-control,
  AI-boundary and failure-handling coverage.
- Beelo is seeking a controlled pilot to test usability, real-world outcomes,
  responsible-AI safeguards, and commercial assumptions.

Statements that are not yet safe:

- “Beelo is fully offline.”
- “Beelo is GDPR compliant” or “fully secure.”
- “Beelo saves a specific amount of time or money.”
- “Users want this” based only on founder experience or an application.
- “The AI understands everything” or is reliable without review.
- “The product is ready to scale.”
- “The pilot is research-ready” before the protocol and notices are complete.

## 8. Pilot readiness gates

Do not onboard external pilot participants until all P0 gates are complete.

### P0 — required before onboarding

- [ ] Confirm the exact pilot scope: features enabled, cohort, duration, and
  supported devices.
- [ ] Replace the PWA legal operator placeholders with verified details.
- [ ] Produce the pilot privacy notice, participant information sheet, and
  consent/agreement record.
- [ ] Define customer-data responsibilities and safe test-data rules.
- [ ] Decide the AI configuration used in the pilot and document every data
  flow and processor.
- [ ] Define retention, deletion, withdrawal, incident, and support processes.
- [ ] Require a safe backup approach and explain passphrase recovery limits.
- [ ] Pass the current unit, build, browser, offline, cache-upgrade, and mobile
  smoke-test matrix against the release candidate.
- [x] Stop iOS treating the local encryption passphrase and advisor name as a
  website account credential, then rerun first-launch and unlock flows.
- [x] Resolve the iOS post-onboarding heading/viewport clipping and add a
  regression check for navigation after focused form input.
- [ ] Verify production headers, endpoints, monitoring and rate limits.
- [ ] Prepare an issue-reporting and pilot-stop procedure.

### P1 — required for meaningful evaluation

- [ ] Record participant eligibility and screening evidence.
- [ ] Capture a pre-pilot baseline.
- [ ] Define a small set of outcome and safety measures.
- [ ] Separate product analytics from interview/diary research and obtain the
  appropriate agreement for each.
- [ ] Define weekly check-ins, support response expectations, and exit
  interviews.
- [ ] Predefine how adverse events, data issues, misleading AI output, and
  participant withdrawal will be recorded.

## 9. Proposed pilot hypotheses

These are questions to test, not current claims.

1. Does Beelo reduce the number of places an advisor must check to prepare for
   the next visit?
2. Does it improve completion and timeliness of customer follow-ups without
   increasing inappropriate contact?
3. Does it improve the completeness of mileage, expense, and commission
   records?
4. Does it reduce end-of-day reconstruction work and perceived cognitive load?
5. Can target users operate the core flows during unreliable connectivity?
6. Do users understand when AI is involved and retain meaningful control over
   every customer-facing draft?
7. Which product components are genuinely valuable enough to support continued
   use and eventual payment?

## 10. Next audit actions

| Priority | Action | Evidence produced |
|---|---|---|
| P0 | Reconcile `Architect.md`, `README.md`, landing copy, PWA legal copy, and current source for contradictions. | Claim-to-source register |
| P0 | Run the build plus full browser and offline release suite on a clean release candidate. | E2/E3 release report |
| P0 | Inspect the live PWA, AI proxy, landing page, form and production headers. | Production-state record |
| P0 | Complete pilot privacy, consent, retention and customer-data responsibility decisions. | Pilot governance pack |
| P1 | Define the supported device/browser matrix and verify real phones. | Device compatibility matrix |
| P1 | Create the pilot baseline, weekly measures and exit interview. | Evaluation protocol |
| P1 | Create a short partner-meeting answer bank based only on approved claims. | Meeting truth sheet |
| P2 | Obtain an independent privacy/security/responsible-AI review. | E5 review evidence |

## 11. Decision log

| Date | Decision | Reason |
|---|---|---|
| 25 Aug 2026 | Treat the PWA, AI proxy, landing page, and pilot handler as separate auditable surfaces. | Prevents a working recruitment site or prototype screen being mistaken for an end-to-end validated product. |
| 25 Aug 2026 | Use “offline-capable,” not “fully offline.” | Maps, geocoding, weather and AI are network-dependent; current production offline behaviour still needs revalidation. |
| 25 Aug 2026 | Treat benefits as pilot hypotheses. | Founder experience and early interest are not independent outcome evidence. |
| 25 Aug 2026 | Block external onboarding on legal/operator, pilot-governance and release-verification gates. | The current product handles customer and participant information and must be piloted deliberately. |
