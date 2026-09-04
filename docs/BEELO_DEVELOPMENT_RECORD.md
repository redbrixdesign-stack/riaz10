# Beelo Development Record

Living record for product-development work. Update this file when product truth,
architecture, evidence, risks, or priorities change. Do not describe planned work
as shipped.

**Record initialized:** 2026-08-25
**Repository baseline:** `7afc26bdcc0088c7c301cdc639d1cc66547c6a3c`
(detached working tree)
**Status vocabulary:** **Verified** means supported by the current repository or
named test evidence. **Historical evidence** means recorded by an earlier project
log but not rerun for this update. **Planned** means not implemented or not yet
proved.

## Current product truth

- **Verified — core product:** Beelo (the repository/package still uses the
  `AdvisorOS` name in places) is a single-user, offline-first progressive web app
  for self-employed field-service and home-visit professionals.
- **Verified — data model:** operational data is device-local. The core PWA has no
  user account, cloud sync, server backup, or account recovery. IndexedDB is the
  primary store; small configuration and active-trip state also use
  `localStorage`.
- **Verified — network boundary:** the core workflow is designed to continue
  offline. Maps, routing, geocoding, weather, and optional Claude drafting need
  network access or cached/fallback behavior.
- **Verified — human control:** customer messages are drafts/handoffs for review;
  the app does not claim provider delivery merely because WhatsApp or SMS opens.
  AI suggestions are constrained to read-only answers and allowlisted navigation.
- **Verified — pilot stage:** the landing-page copy invites applications to a
  small UK pilot. Applying is not acceptance and the repository contains no
  implemented subscriptions, billing, multi-user team product, or production
  account system.
- **Verified — separate personal-data path:** unlike the local-only core PWA, the
  landing pilot form posts personal data to a PHP handler. The handler validates a
  UK declaration/postcode, rate-limits, writes a CSV backup, emails the operator,
  and attempts an acknowledgement email. This distinction must remain clear in
  privacy and product copy.

## Architecture

### Core PWA — verified in repository

- Vanilla HTML, CSS, and JavaScript, served as a static hash-routed SPA.
- Service worker plus `manifest.json` provide installation and offline asset
  caching. HTTPS remains required for production service-worker and geolocation
  behavior.
- IndexedDB through bundled Dexie/compatibility code stores the operational
  domain. The schema includes customers, appointments, leads, tasks, quotes,
  orders, jobs, payments, invoices, credit notes, suppliers, purchase orders,
  availability, communications, measurements, trips, expenses, photos, settings,
  sequences, and related event/detail records.
- Sensitive fields across leads, tasks, quotes, jobs, payments, invoices, and
  related records have repository-documented encryption-at-rest handling.
- Routing providers are pluggable: configured Mapbox is preferred; public
  Nominatim/OSRM with throttling and estimates are the fallback. Open-Meteo serves
  weather.
- Optional Claude features call `api/claude.mjs` or the standalone `server/`
  proxy. Production configuration fails closed without an allowed origin and
  shared gate; upstream secrets are not placed in the browser bundle.
- Root build: `node build/minify.js`. Root automated checks are orchestrated by
  `npm test`; browser suites use Playwright.

### Landing and pilot intake — verified in working tree

- Separate React 18 + TypeScript + Vite + Tailwind application under `landing/`.
- Editable marketing copy is centralized in `landing/src/data/content.ts`.
- The pilot form defaults to same-origin `/api/pilot.php`; previews can override
  it with `VITE_FORM_ENDPOINT`.
- The PHP handler accepts small JSON requests, restricts browser origins when an
  `Origin` header exists, uses a honeypot and elapsed-time check, validates and
  truncates fields, enforces UK eligibility, applies file-backed IP/email rate
  limits, appends `applications.csv`, and attempts operator and applicant email.
- The landing and core PWA have independent build/deployment concerns. A static
  core-PWA deployment does not by itself provide PHP execution for pilot intake.

## Implemented capabilities

All items below are **verified in current source and project documentation**;
release readiness still depends on the evidence section.

- Daily companion/home view, diary/visits, customer profiles, lead inbox,
  durable tasks, follow-up generation, and end-of-day review.
- Quotes with versioned issue/accept/reject flow; orders and payment ledger;
  invoices, receipts, credit notes, refunds, and reversal records.
- Operational jobs, visits, checklists, issues, completion/sign-off controls,
  suppliers, purchase orders, availability, capacity, and profitability logic.
- Mileage, expenses, commission, sales/earnings progress, and UK tax-planning
  estimates. These are planning aids, not filing or accounting advice.
- Route planning, travel estimates, navigation handoff, GPS trip tracking,
  mileage capture, weather, measurement/squareness capture, and OCR import.
- Review-first message templates and optional AI-assisted OCR/drafting.
- Local export/import backup, migration/compatibility handling, installable PWA
  shell, offline banner, and degraded offline behavior for cloud dependencies.
- Pilot landing page with founder/product narrative, product imagery, FAQ,
  privacy explanation, UK eligibility validation, and pilot application form.

## Decisions

| Date | Status | Decision | Reason / consequence |
|---|---|---|---|
| 2026-08-25 | Verified | Keep the core PWA local-first and describe cloud/account features only as planned. | Prevents false product claims and preserves the current trust model. |
| 2026-08-25 | Verified | Treat the landing page and core PWA as separate deployment/data boundaries. | Pilot applications leave the device; core operational records normally do not. |
| 2026-08-25 | Verified | Use `/api/pilot.php` as the landing form default, with `VITE_FORM_ENDPOINT` for previews. | Production hosting must execute PHP or explicitly supply a compatible endpoint. |
| 2026-08-25 | Verified | Limit the current pilot to people who live and work in the UK and require a valid UK postcode. | Enforced in both client validation and the PHP handler. |
| 2026-08-25 | Verified | Preserve all pre-existing working-tree changes during this initialization. | The landing redesign and pilot reliability work are user-owned and remain unmodified. |
| 2026-08-27 | Verified | Describe Measure as the implemented survey-equivalent unless a distinct Survey workflow is built. | Current appointment types contain `measure`, not `survey`. |
| 2026-08-27 | Verified | Keep external communications positioned as editable drafts and explicit app handoffs. | Current lifecycle evidence records handoff separately and never infers delivery. |
| 2026-08-27 | Verified | Separate local record storage from network-service egress in future product/privacy wording. | Geocoding, routing, weather, maps and optional AI have different data/network boundaries. |
| 2026-08-27 | Verified | Do not infer pilot approval from code, tests, routes or public copy. | BA-002/BA-003 found no explicit repository record approving individual features for pilot release. |
| 2026-08-27 | Verified | Keep financial and operations modules documented as prototype capability pending scope approval. | BA-001 authorizes documentation correction, not feature removal or pilot-scope expansion. |
| 2026-08-27 | Verified | Position Beelo as the personal continuity layer connecting a mobile worker's existing tools, not as a replacement CRM, calendar, maps or accounting product. | Reflects the founder's company-affiliated field-work experience and provides a clearer boundary from job-management platforms. |
| 2026-08-27 | Verified | Present whole-day route recommendations and mileage reduction as pilot validation, not released or generalised outcomes. | Route-planning code exists, but the founder's approximate five-mile daily observation is not yet cross-user evidence. |

## Deployments

- **Verified unified Notes presentation — 2026-09-03:** deployed
  `dpl_C92qb5KBgncYx5TVLLjTAAEWuedD` to
  `https://beelo.beelestial.co.uk`. Removed the duplicate legacy Voice Notes
  cards from Customer 360 and Visit detail: text plus embedded and historical
  recordings now appear together under Customer context/Notes, while the edit
  sheet remains the single place to type, record, transcribe and manage audio.
  No historical audio was deleted or migrated. Note-capture, feature and
  companion suites pass; production serves note-capture v4, appointments v44,
  customer v13 and cache `advisoros-v6-110`.
- **Verified first-name communication greetings — 2026-09-01:** deployed
  `dpl_D4NwZhkWXorFnUo8MtJVx9ht7FgY` to
  `https://beelo.beelestial.co.uk`. Customer-facing appointment, reminder,
  travel-status, AI-context, quote and finance-document drafts now resolve a
  usable given name from profile/full scanned data instead of greeting the
  customer as Mr/Mrs/Ms/Miss. Scheduler, follow-up and feature suites pass;
  production serves utils v8, appointments v43, talk v23 and cache
  `advisoros-v6-109`.
- **Verified Home customer-context correction — 2026-09-01:** deployed
  `dpl_GTDu3ZX9zsjdmraqTb1L42kFrskz` to
  `https://beelo.beelestial.co.uk`. The featured Upcoming appointment now falls
  back from order/history status to an offline brief assembled from saved
  customer-profile and visit notes. Production serves companion v26 and cache
  `advisoros-v6-108`; the focused companion regression suite passes.
- **Verified consolidated regression-recovery deployment — 2026-09-01:**
  deployed release `dpl_AHDsdwVbHpXwD9cfrNup9cGHuhhs` to
  `https://beelo.beelestial.co.uk`. Live-origin evidence confirms companion v25,
  database v32, app v38, note-capture v3 and cache `advisoros-v6-107`; the served
  companion bundle contains Scan to add, Today's Route, customer briefing logic,
  Navigate, Call and On my way.
- **Verified registered-device/voice-context deployment — 2026-08-28:**
  deployed encrypted device-only AI credential retention plus unified voice
  notes for Customer Context and Appointment/Visit Notes as
  `dpl_FVzQkSysPHWeXJhA2DvEZQWi7akQ`. Production serves db v27, app v30,
  appointments v38, customer v12, settings v18 and offline cache
  `advisoros-v6-85`. Automated storage/security/UI contracts pass; physical
  iPhone verification of the two new note surfaces remains open.
- **Verified shared-secret rotation — 2026-08-28:** rotated the forgotten
  Production `AI_SECRET`, redeployed as
  `dpl_DAyFP71TEMM7V2cPSm6Gs36tJssN`, and confirmed the replacement passed
  production authentication (a deliberately unsupported synthetic media type
  reached the expected HTTP 415 validation boundary rather than HTTP 403).
  The app still requires one session-only paste on each fresh PWA session.
- **Verified audio CSP correction — 2026-08-28:** the first iPhone playback
  hotfix still showed `Error`; investigation found production CSP omitted
  `media-src`, so both data and Blob audio sources were blocked locally before
  transcription. Added the narrow policy `media-src 'self' data: blob:` to the
  document and Vercel header, advanced cache to `advisoros-v6-84`, and deployed
  `dpl_CDSNM11fnwLwghU53GRpT4jd6o1P`. Live headers confirm the policy. The
  founder subsequently verified recording, stopping, saving, playback and
  transcription on a physical iPhone PWA using mock content.
- **Verified iPhone audio-playback hotfix — 2026-08-28:** after a physical
  iPhone recorded successfully but displayed `Error` in the audio player,
  replaced embedded data-URL playback with temporary Blob URLs and stopped
  concatenating timed MP4 fragments. Focused note-capture, transcription-proxy
  and measurement tests passed. Deployed as
  `dpl_5JwFSnXEFooTAG5Wxg4JwQjxzaVu`; production serves note-capture v2 and
  service-worker cache `advisoros-v6-83`. The later CSP correction and physical
  iPhone retest closed this playback issue.
- **Verified transcription production activation — 2026-08-28:** created the
  restricted OpenAI project key `Beelo transcription` with request-only model
  capability, stored it as the sensitive Vercel Production variable
  `OPENAI_API_KEY`, and deployed Vercel release
  `dpl_SyQCafEmXujMeTzidkymhkqhrbeA` to
  `https://beelo.beelestial.co.uk`. The live document references database v26,
  app v29, note-capture v1 and measure v10; `/api/transcribe` is reachable and
  rejects GET with the designed HTTP 405. No customer audio was transmitted.
- **Verified core-PWA production deployment — 2026-08-28:** deployed the tested
  measurement schedule/specification update to Vercel project `beelo1` as
  deployment `dpl_3ZhurdGNE3T41Mbhuh9XAf8VZRFq`, aliased to
  `https://beelo.beelestial.co.uk`. Live evidence confirmed HTTP 200, cache
  `advisoros-v6-81`, versioned appointment/customer/measure bundles, the new
  table headings and specification field, plus CSP, HSTS and nosniff headers.
- **Verified production landing deployment — 2026-08-27:** built the current
  `landing/` source and uploaded/extracted `beelo-landing-20260827.zip` into the
  IONOS web root serving `https://beelestial.co.uk/`. The prior
  `beelo-landing-20260822.zip` archive remains available on the host as rollback
  evidence. Existing `clickandbuilds/` and `logs/` directories were preserved.
- **Verified post-deploy landing evidence — 2026-08-27:** the public document and
  new hashed JavaScript asset returned HTTP 200; the rendered page contained the
  connecting-thread, whole-day routing and product-truth sections; a 393 × 852
  live check found no horizontal overflow or browser console warnings/errors.
  A non-submitting request to `/api/pilot.php` returned the expected HTTP 405
  JSON response, proving PHP execution without creating an application.
- **Historical evidence:** `docs/history/PHASE6-VALIDATION.md` records a successful
  Vercel production deployment of the core PWA to the `beelo1` project at
  `beelo.beelestial.co.uk`, followed by live security-header, service-worker, and
  offline-shell verification. This was not rerun on 2026-08-25.
- **Verified configuration:** root `vercel.json` supplies CSP, nosniff,
  referrer-policy, frame-denial, and permissions-policy headers for a static
  deployment.
- **Verified hosting boundary:** the landing and PHP pilot handler are deployed
  on IONOS/Apache for `beelestial.co.uk`; the core PWA remains a separate Vercel
  deployment at `beelo.beelestial.co.uk` according to historical evidence.
- **Still unverified:** no real or synthetic application was submitted during
  this deployment, so mail delivery, CSV persistence, acknowledgement delivery,
  throttling and operator receipt remain open production evidence gaps.
- **Verified pilot-privacy deployment — 2026-09-04:** built commit `1f2adee`,
  retained the earlier production ZIPs, uploaded and extracted
  `beelo-landing-20260904-privacy.zip` into the IONOS web root. The live document
  loads hashed asset `index-LVAAdRIT.js` and visibly contains the versioned Pilot
  Applicant Privacy Notice, outward-postcode form, sensitive-data warning,
  optional research consent and BEELESTIAL LTD footer disclosures. A live GET to
  `/api/pilot.php` returned the expected health JSON. No application was
  submitted. A repeat check of the denied CSV URL was inconclusive because the
  command encountered transient DNS resolution failure; the deployed API
  `.htaccess` still contains the explicit deny rule.

## Tests and evidence

### Privacy and operator-identity correction (2026-09-03)

- **Verified identity supplied by Muhammad:** BEELESTIAL LTD, company 15297106,
  Apartment 6, 2 Copper Place, Manchester M14 7FZ. The existing published
  privacy contact is `hello@beelestial.co.uk`.
- **Corrected product truth:** app privacy and consent now distinguish device-
  local records from maps, address search/routing, weather, OpenAI transcription,
  optional Anthropic/Claude and runtime code-provider requests. Claims that
  Beelo has no servers or that Claude is the only egress path were removed.
- **Consent migration:** material disclosures advance the local acknowledgement
  to version 2, so previously acknowledged devices see the updated notice.
- **Landing disclosure:** pilot page now names the responsible company, service
  address, contact, application purpose and access/correction/deletion route.
- **Passed:** legal identity/data-flow contract, root build/minification and
  service-worker token check, landing build, complete root suite, `diff --check`,
  and the 25-state accessibility sweep including Privacy and Terms.
- **Not legal advice / not deployed:** obtain proportionate UK privacy review and
  approve a concrete pilot-application retention schedule before onboarding.

### Pilot applicant transparency and minimisation (2026-09-04)

- **Implemented in source:** the landing page now provides a versioned Pilot
  Applicant Privacy Notice at the point of collection. It identifies the
  controller, purpose, legitimate-interests basis, optional research-contact
  consent, IONOS recipient category, possible transfer safeguards, six-month
  retention period, applicant rights, ICO complaint route, required fields and
  the absence of automated decision-making.
- **Data minimisation:** the form now requests only the outward postcode area,
  tells applicants not to enter customer or sensitive information, and makes the
  separate partnership/research purpose explicit and optional.
- **Retention control:** each accepted form submission records the privacy-notice
  version. The protected CSV is pruned to the declared 180-day period whenever a
  new application is stored. Related mailbox records still require an operator
  process to review and delete them within the same period.
- **Company disclosure:** the footer now displays BEELESTIAL LTD, company number
  15297106, registered office and registration in England and Wales.
- **Boundary:** these changes materially improve the recruitment surface but are
  not legal certification. Confirm the registered-office wording, complete the
  ICO fee assessment, verify the IONOS processor/transfer terms and document the
  mailbox deletion routine before independent pilot onboarding.

### Preserved baseline and safe cleanup (2026-09-03)

- **Preserved:** committed the exact accumulated working product as `2b410f4`
  before cleanup; the earlier recovery stash remains untouched.
- **Removed as proven generated/duplicate:** tracked
  `landing/tsconfig.tsbuildinfo` and the stale `lazy-features` registry. Readable
  and minified application files were retained because both are intentional
  source/deployment artefacts for the static PWA.
- **Corrected:** declared the standalone proxy's root test dependencies and fixed
  the asynchronous OCR appointment-type race. No product module was removed.
- **Passed after cleanup:** root build and asset-token check; complete `npm test`;
  landing production build; browser migration/AI integration journey; 25-state
  axe sweep; fresh offline boot and online/offline recovery; production-only npm
  audit with zero known vulnerabilities.
- **Not deployed:** this checkpoint is local and awaits review/commit/push before
  any production promotion.

### Comprehensive product audit (2026-09-03)

- **Verdict:** conditionally suitable for founder-controlled internal testing;
  not ready for independent external-pilot onboarding.
- **Passed:** broad domain/storage/encryption suites, 25-state axe sweep,
  automated iPhone journey, offline launch/recovery, live security-header checks,
  landing production build, and production-only dependency audit (zero known
  vulnerabilities). App Lighthouse scored 85/100/100/100; landing scored
  96/96/100/100 for performance/accessibility/best-practices/SEO.
- **Failed:** root `npm test` stops at an undeclared `dotenv` dependency;
  `tests/ocr.test.js` exposes a non-duplicate scan/create regression; and
  `tests/docs.test.js` exposes eager/lazy loading architecture drift.
- **Release gates:** correct privacy/consent data-flow statements, supply real
  operator/controller details, reconcile the dirty/unpushed release tree, fix
  OCR creation, restore a deterministic full-suite gate, and add durable AI
  endpoint quotas/rate limiting.
- **Detailed evidence:** `docs/BEELO_COMPREHENSIVE_AUDIT_2026-09-03.md`.
- **Next priorities:** privacy/legal truth → clean reproducible release → scan
  reliability → AI/KDF/CDN/backup hardening → physical-iPhone pilot matrix.

### Current initialization (2026-08-25)

- **Verified:** repository structure, package scripts, current source, deployment
  configuration, form client/server contract, and git baseline were inspected.
- **Not run:** the root unit/browser suites. This documentation-only
  initialization did not alter product code.
- **Blocked locally:** `landing/npm run build` could not start because landing
  dependencies are not installed (`tsc: command not found`). This is an
  environment/evidence gap, not proof of a source failure.
- **Not available:** PHP CLI was not found, so `landing/public/api/pilot.php`
  could not be syntax-checked or integration-tested locally.

### iPhone journey audit (2026-08-27)

- **Real Simulator observed:** iPhone 17 Pro / iOS 27.0 Safari rendered Home,
  Lead Inbox empty state, New Enquiry form, Visits diary and New Visit form.
- **Passed:** automated 393 × 852 touch/standalone iPhone visual journey (16
  screenshots), targeted lead/appointment/capacity/communications/money tests,
  offline boot and online/offline transition test, and the 24-state axe sweep.
- **Partial:** the full root command reached the AI proxy suite and stopped because
  this detached worktree has no local `@upstash/redis` dependency. Earlier storage
  tests completed successfully; this is not a full-suite pass.
- **Failed test signal:** browser Journeys A–E2 passed. Journey F restored all
  business records but failed a table-count assertion because the expected
  device-local AI-secret setting is preserved as an additional settings row.
- **Detailed evidence:** `docs/BEELO_IPHONE_JOURNEY_AUDIT_2026-08-27.md` and
  `screenshots/audit-iphone-simulator-2026-08-27/` plus
  `screenshots/audit-ios-journey/`.

### BA-001 to BA-004 documentation maintenance (2026-08-27)

- **BA-004:** captured the dirty tree before editing. Existing landing, outreach,
  imagery/video and audit changes were preserved; this task changed only the root
  README and Beelo product documentation.
- **BA-003:** created `docs/BEELO_FEATURE_INVENTORY.md` from current source,
  routes/configuration and tests. No feature was inferred to be pilot-approved.
- **BA-002:** audited implemented modules and public wording against the verified
  pilot-stage, offline-capable, human-controlled operational-memory position.
- **BA-001:** replaced the legacy AdvisorOS README with a Beelo README that
  separates prototype capability, product boundaries, risks and future concepts.

### Landing positioning revision (2026-08-27)

- **Verified source change:** revised the hero and audience definition around
  people working alone between customer appointments, including company-affiliated
  workers who cannot replace the company system.
- **Verified source change:** added a connecting-thread explanation, an explicit
  whole-day routing/evidence section, and a product-truth section separating
  verified prototype capability, pilot validation and future possibilities.
- **Verified boundaries:** qualified offline wording as core capture, mileage as a
  user-started trip, screenshots as founder prototype evidence, and the five-mile
  observation/1.1-million-mile extrapolation as unverified beyond the founder.
- **Passed:** clean landing TypeScript/Vite production build on 2026-08-27.
- **Passed:** local rendered-page semantic inspection, 393 × 852 horizontal-
  overflow check, Vite-overlay check and browser console warning/error check.
- **Not run:** full accessibility automation, keyboard sweep, form submission or
  live deployment verification.

### Window measurement schedule (2026-08-28)

- **Verified implementation:** saved visit measurements now render as a persistent
  table on both the visit and Customer 360 profile, with window/location, optional
  product/covering, free-text specification, least width and least drop. The
  specification can retain blind type, colour, range, chain length, control side
  and similar details. Existing rows remain editable.
- **Verified storage boundary:** records still live in the device-local
  `advisoros_v6.measurements` IndexedDB table and remain linked through
  `appointmentId`; no cloud sync or product/order linkage was added.
- **Evidence:** production minification passed; service-worker asset versions were
  advanced; measurement, feature-smoke and documentation tests passed. The wider
  suite progressed through storage and AI tests but stopped at the pre-existing
  undeclared `dotenv` dependency in `tests/proxy-server.test.js`.

### Unified voice-to-text notes foundation (2026-08-28)

- **Implemented in source, not deployed:** measurement Notes now use the first
  reusable unified-note control: type normally, record/play encrypted local
  audio, explicitly request transcription into the same editable text field,
  and deliberately delete the retained recording later.
- **Verified control boundary:** recording does not contact a provider. Audio is
  transmitted only after the adviser taps Transcribe; returned text is inserted
  for review and is not treated as final until the measurement is saved.
- **Verified storage/security:** measurement audio and its transcript metadata
  are encrypted with the existing device passphrase at rest and are decrypted/
  re-encrypted through backup export and restore. Recordings are limited to
  three minutes and 10 MB in this first slice.
- **Implemented proxy boundary:** `api/transcribe.mjs` accepts allowlisted audio
  formats, enforces origin/shared-secret/body limits, keeps the provider key on
  the server, and forwards only to OpenAI's fixed transcription endpoint.
- **Evidence:** minification/cache-contract, storage, transcription-proxy,
  note-capture, measurement, action-router and documentation tests pass.
- **Verified activation boundary:** production now has the sensitive
  `OPENAI_API_KEY` alongside `AI_SECRET`, `ALLOWED_ORIGIN` and
  `ANTHROPIC_API_KEY`; the server endpoint and published assets are live.
  **Verified physical-device evidence (2026-08-28):** the founder completed the
  microphone/MediaRecorder-to-saved-audio-to-playback-to-transcript journey on
  the installed iPhone PWA using mock content. Transcription remains a
  pilot-stage candidate rather than a pilot-approved or generally released
  capability.
- **Implemented after this foundation:** rollout to the durable operational-note
  surfaces listed in the registered-device entry below.
- **Planned, not implemented:** pen/handwriting capture and offline transcription.

### Registered-device AI access and broader voice context (2026-08-28)

- **Implemented and deployed:** the shared proxy credential
  is encrypted with the existing Beelo unlock key, retained only in a
  device-local runtime setting, restored after unlock, and excluded from
  backups. A prior session-only value migrates automatically on first launch.
- **Implemented prototype scope:** the combined text/record/play/transcribe/
  delete control now appears in Measurement Notes; Customer Context; new and
  existing Visit Notes; visit reschedule, cancellation and outcome context;
  Lead Notes; Follow-up Task Notes; Quote and Invoice Notes; job issue details
  and resolutions; aftercare actions and outcomes; and contact-preference
  evidence. Retained audio/transcript metadata uses the same AES-GCM at-rest
  boundary as each record's other sensitive data.
- **Verified automated evidence:** real Dexie and fallback-shim tests confirm
  customer/appointment audio encryption and decryption, encrypted device-secret
  round-trip, backup exclusion, and the wider record graph remains valid.
  Static integration checks cover every note surface named above. Note-capture,
  settings, appointment-save and action-router regressions pass.
- **Boundary:** this is device registration, not user accounts, cloud sync or
  multi-device identity. Losing/clearing the device still requires entering the
  shared secret again. Voice capture is intentionally absent from editable
  outbound-message drafts, financial/legal terms, addresses, and simple
  confirmation-only fields: those are either not contextual notes or could make
  sending/financial workflows less predictable. Supplier timeline events also
  remain excluded until their nested event storage has an equivalent encrypted
  audio boundary. Pilot approval and physical-iPhone verification of the wider
  note-surface set remain open.
- **Production evidence (2026-08-28):** deployed as Vercel release
  `dpl_3qAWecTgWCasjPkZR7HyB8Mf5VZP` and aliased to
  `https://beelo.beelestial.co.uk`. A direct production fetch confirmed database
  asset v28, appointment asset v39, lead asset v2, follow-up asset v17 and
  service-worker cache `advisoros-v6-86`.
- **Transcription credential recovery (2026-08-28):** production logs showed two
  failed customer-context attempts reached `/api/transcribe` but returned 403
  before OpenAI was called. The shared note control now reloads the encrypted
  device credential and retries once; persistent rejection gives an actionable
  re-registration message. Safe server logs distinguish origin from credential
  rejection without logging either value. Note-capture, proxy-security and both
  storage-engine suites passed. Deployed as
  `dpl_BiTU2Khx2yeokTYnX17guxoyDhe5`; production serves note-capture v3 and cache
  `advisoros-v6-87`.
- **First-contact communication decision (2026-08-28):** a first-time customer
  whose visit is tomorrow now receives one adviser-led introduction +
  confirmation draft instead of duplicate intro and reminder tasks. Earlier
  bookings retain an immediate introduction and a separate day-before reminder.
  Only adviser-confirmed WhatsApp sending clears both obligations. Follow-up,
  scheduler, durable-task and communication lifecycle tests pass. Deployed as
  `dpl_9Z5KzFmB4jjPGNoPLXrv11ic6ZQN`; production cache is `advisoros-v6-88`.

### Next-appointment customer context restoration (2026-09-01)

- **Verified implementation:** the Home screen's featured next-appointment card
  again loads the linked, decrypted customer record and displays concise customer
  notes. Appointment notes are used only when customer notes are absent; saved
  customer/visit voice-note counts are also surfaced.
- **Verified test evidence:** syntax checks passed and three focused assertions
  confirm the context label, saved context text, and voice-note indicator.
- **Open unrelated test risk:** the wider `features.test.js` run reaches and
  passes these assertions but remains red because an older four-task-kind
  expectation conflicts with unfinished follow-up logic already present in the
  working tree. This restoration did not change that logic.
- **Deployment status:** deployed to production on 2026-09-01 as Vercel
  deployment `dpl_B31FLciPecwnkKAGGBhg8rakAkZp`, aliased to
  `https://beelo.beelestial.co.uk`. Live asset checks verified CSS v40, Home
  controller v12, service-worker cache v89, customer loading, context copy, and
  the saved-voice-note indicator.

### Existing evidence retained for reference

- **Historical evidence:** `docs/history/PHASE6-VALIDATION.md` records zero root
  unit failures, 18 green browser suites, an axe-core sweep with zero
  serious/critical findings across 16 screens, passing Lighthouse thresholds,
  and a live offline/service-worker smoke test at that phase's release.
- **Verified test inventory:** the current root `npm test` script names a broader
  set of Node suites for storage, AI/proxy security, companion behavior, tasks,
  leads, quotes, jobs, invoices, suppliers, capacity, retention, communications,
  scheduling, OCR, money, routing, settings, weather, features, action routing,
  appointments, and documentation. Presence is not the same as a current pass.
- **Verified release gate:** `docs/RELEASE_CHECKLIST.md` requires fresh build,
  regression, responsive/accessibility, PWA/device, and traceable evidence before
  release. Its checkboxes are not current pass evidence.

## Open risks

1. **P0 — pilot-form production proof:** no current end-to-end evidence shows that
   the live host executes the PHP handler, can create/lock its rate and CSV files,
   sends mail reliably, and returns success to the browser.
2. **P0 — pilot personal-data governance:** CSV applications sit beside the PHP
   handler unless host rules deny direct download. Retention period, access
   control, deletion handling, backup handling, breach response, and a verified
   privacy notice/process need explicit operational evidence.
3. **P1 — landing regression gap:** the revised landing now has a clean type-check,
   production build and basic desktop/393px browser evidence, but still lacks a
   fresh automated accessibility/keyboard pass and form contract test.
4. **P1 — uncommitted/detached state:** the working tree is detached with many
   modified and untracked landing assets. Deployment provenance and rollback are
   weak until the owner reviews and records a commit/release point.
5. **P1 — local-only loss model:** clearing browser storage or losing the device
   can erase core records unless the user has exported a backup; there is no sync
   or remote recovery.
6. **P1 — public service dependencies:** fallback Nominatim/OSRM endpoints have no
   commercial SLA. AI, weather, and uncached map services also depend on network
   and provider availability.
7. **P1 — security assurance:** encryption/proxy controls have automated evidence,
   but no independent penetration test is recorded. Project history also flags a
   former real-looking Anthropic key; revoke it if it was ever valid and scrub git
   history before publication.
8. **P2 — documentation drift:** `landing/README.md` still describes a mock form
   and generic deployment although the working tree defaults to a real PHP
   endpoint. Root/package naming also still mixes AdvisorOS and Beelo.
9. **P2 — physical-device evidence:** current release records do not establish a
   fresh VoiceOver/TalkBack, camera/OCR, notification, install, geolocation, and
   offline pass on the intended pilot device/browser matrix.
10. **P0 — privacy/product-truth mismatch:** in-app consent implies Claude is the
    only egress, while geocoding/routing/weather can transmit addresses, postcodes,
    coordinates or location context. The disclosure must match actual providers.
11. **P0 — legal operator placeholders:** the core Privacy and Terms pages still
    show `—` for operator identity/contact fields.
12. **P1 — integration interpretation:** landing copy now states that Beelo works
    around existing tools and labels deeper connections as future work, but future
    edits must continue avoiding implications of live CRM/accounting integrations.
13. **P1 — release-test drift:** Journey F's table-count assertion conflicts with
    the intended preservation of a device-local AI-secret setting.

## Backlog

### Planned — release and reliability

- Add deterministic tests for client validation and the PHP form contract,
  including malformed JSON, payload size, origin, bot timing, UK validation,
  throttling, storage failure, mail failure, and safe success semantics.
- Move pilot rate/application data outside the public web root or explicitly deny
  HTTP access; define retention/deletion and operational monitoring.
- Install pinned landing dependencies, build, preview, and run responsive,
  accessibility, metadata, link, and keyboard checks.
- Run the root release checklist against a recorded commit and supported device
  matrix; attach dated evidence rather than inheriting historical results.
- Align product/landing documentation, naming, endpoints, privacy copy, and actual
  hosting topology after deployment is confirmed.

### Planned — product (not implemented)

- Account-based sync, remote backup/recovery, multi-device access, subscriptions,
  billing, and team/company administration.
- Production-grade paid routing/geocoding if pilot load or reliability requires
  it.
- Error reporting/operational telemetry designed to preserve the local-first
  privacy promise.

## Next actions

1. Run a fresh automated accessibility, keyboard and pilot-form contract pass on
   the revised landing page, then resolve any findings.
2. Add isolated pilot-form handler tests, then close the public-file and
   retention risks before accepting real applicant data.
3. Deploy the landing build and PHP endpoint to a documented target; run a live
   application using a controlled test address and verify operator receipt,
   acknowledgement, storage, throttling, and failure messaging.
4. Run landing accessibility/responsive checks and the core release checklist on
   the exact candidate commit; record date, environment, devices, and results in
   this file.
5. Only after those gates pass, mark a controlled pilot release and publish the
   exact verified feature/device boundaries to applicants.
6. Correct the P0 legal/privacy truth gaps and the “offline sync” claim before
   using the product in external adviser or innovation-support demonstrations.
7. Repair Journey F's portable-versus-device-local settings assertion, then run a
   complete dependency-resolved regression from the exact release candidate.

## Consolidation record — 2026-09-01

- **Verified root cause:** a production deployment was made from a stale feature
  branch. Its older companion bundle replaced newer Home functionality even
  though the features remained present on `origin/main`.
- **Verified recovery:** merged current `origin/main` into the deployment branch
  and reconciled the pre-existing working tree without discarding it. Restored
  together: Home **Scan to add**, manual capture fallbacks, Today's Route,
  featured customer context, compact Navigate/Call/On my way actions, automatic
  visit-state handling, unified audio/transcribed notes, measurements, and the
  time-sensitive communication logic.
- **Preservation evidence:** the complete pre-consolidation state remains in
  `stash@{0}` (`beelo-pre-consolidation-2026-09-01`) as a recovery copy. It must
  not be dropped until the consolidated release is accepted.
- **Passed evidence:** production minification/service-worker consistency; quick
  capture, companion, voice-note, note-capture, transcription proxy, storage,
  navigation-provider, follow-up, scheduler, feature, action-router and
  appointment suites; real-app browser E2E for Follow-ups, Orders and Customer
  360. Browser evidence reported no JavaScript exceptions or resource 404s.
- **Open release risk:** the branch still contains accumulated user-owned product,
  landing and documentation changes. Create a reviewed release commit and retire
  the recovery stash only after live iPhone acceptance.
