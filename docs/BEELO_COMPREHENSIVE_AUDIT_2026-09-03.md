# Beelo comprehensive product audit

**Evidence date:** 3 September 2026  
**Scope:** current working tree, automated tests, local iPhone-size browser journeys,
production PWA (`beelo.beelestial.co.uk`), public landing page
(`beelestial.co.uk`), serverless AI endpoints, pilot intake, deployment
configuration, product positioning, privacy and release governance.  
**Method:** read-only product audit. No product fixes, live form submissions, real
customer data, destructive tests or penetration testing were performed.

## Executive verdict

**Status: conditionally suitable for a founder-controlled internal pilot; not
ready for onboarding independent external pilot users.**

Beelo has substantial prototype depth and unusually good automated coverage for
a local-first PWA. Core storage, encryption round-trips, backup validation,
offline recovery, human-controlled communication handoffs, mobile layout and
most operational workflows passed. The current release nevertheless has four
pilot gates: inaccurate privacy/consent statements, missing legal operator
identity, an OCR appointment-import regression, and an unreproducible/dirty
release state. AI endpoints also need durable abuse controls before broader use.

This is an engineering and product-readiness assessment, not a legal opinion,
formal accessibility certification or commissioned penetration test.

## Standards and acceptance basis

- WCAG 2.2 AA principles and automated axe/Lighthouse evidence for accessibility.
- OWASP ASVS 5.0 as the web-control reference, OWASP API Security Top 10 (2023)
  for paid AI endpoint resource controls, and OWASP password-storage guidance for
  passphrase derivation.
- UK GDPR data-protection-by-design/default principles for truthful disclosure,
  data minimisation, retention and data-flow governance.
- PWA release expectations: installability, offline shell, recovery, secure
  transport, deterministic builds, tested migrations and safe failure.
- Verified Beelo positioning: pilot-stage, offline-capable, human-controlled
  operational memory for solo home-visit professionals; not CRM, accounting,
  tax filing or MTD filing.

## Scorecard

| Area | Rating | Evidence-based conclusion |
|---|---:|---|
| Product/positioning truth | Amber | Core proposition is coherent; finance/CRM-adjacent modules need explicit pilot boundaries. |
| Core workflow reliability | Amber | Most domain suites pass; OCR create/import currently fails. |
| Offline/PWA resilience | Green | Fresh offline launch, transition banner, cached shell and local workflows passed. |
| Data integrity/storage | Green-Amber | Broad encrypted persistence, migration and restore tests pass; local-only loss/export risks remain. |
| Security | Amber | Strong headers, AES-GCM and input limits; weak KDF work factor, CDN supply chain and AI throttling remain. |
| Privacy/legal readiness | Red | Consent/policy contradict actual OpenAI and location-provider egress; operator fields are blank. |
| Accessibility/mobile UX | Green-Amber | App axe sweep passed; landing has two footer contrast failures. |
| Performance | Amber | App Lighthouse 85 with 4.4 s LCP; landing 96 with 2.3 s LCP. |
| Pilot form | Amber | Validation/rate limits/private CSV are sound; retention, controller disclosure and live delivery evidence are incomplete. |
| Release/operations | Red | Production work is not represented by a clean, pushed, reproducible release commit. |
| Automated quality gates | Amber-Red | Broad focused coverage passes, but `npm test` stops early and two independent suites fail. |

## Release gates

### P0 — correct before any external pilot onboarding

#### BCA-001 — Privacy and consent are materially inaccurate

**Evidence:** `js/core/legal.js` says all records remain only on-device and that
nothing is uploaded/shared, then lists only map tiles, Claude and code libraries.
The implemented app also sends selected audio to OpenAI for transcription and
addresses/postcodes/coordinates to routing, geocoding and weather providers.
The one-time consent wording similarly says Claude is the only optional external
data flow. The policy predates transcription.

**Risk:** participants cannot give informed consent; public claims conflict with
actual behaviour and Beelo's trust-led positioning.

**Required outcome:** make an authoritative data-flow register, update consent,
privacy and settings just-in-time notices, identify purpose/legal basis,
providers, retention and international-transfer position, and re-consent existing
devices when the material policy changes.

#### BCA-002 — Legal operator/controller identity is blank

**Evidence:** operator name, address, email and company number are em-dash
placeholders in `js/core/legal.js`; the file itself labels this a launch blocker.
Landing privacy is an on-page summary rather than a complete controller notice.

**Risk:** no accountable data-controller identity or usable rights contact for
app users/pilot applicants.

**Required outcome:** Muhammad must approve the real legal identity, service
address and privacy contact; publish coordinated app and landing notices before
onboarding.

#### BCA-003 — Production provenance is not release-grade

**Evidence:** branch `codex/ios-map-app-handoff` is 17 commits ahead of its remote;
the tree contains a large mixture of staged, unstaged and untracked app, landing,
test and documentation work. Production has repeatedly been deployed from this
state. A recovery stash exists, but no clean immutable release commit matches the
complete live product.

**Risk:** regressions can reappear, rollback cannot be audited confidently, and
two developers/agents can accidentally omit or overwrite working features.

**Required outcome:** preserve the recovery snapshot, reconcile staged/unstaged
intent, create one reviewed release branch/commit, push it, tag deployments by
commit and require clean-tree build/test gates.

## High-priority defects and risks

#### BCA-004 — OCR appointment creation regression (P1)

**Reproduction:** run `node tests/ocr.test.js`. Non-duplicate scan creation and
navigation tests fail; `js/features/ocr/ocr.js` reads
`this.extractedData.appointmentType` after `extractedData` can be cleared during
the asynchronous save path.

**Impact:** the highly differentiated “scan an appointment and go” workflow can
lose the creation path or fail to open the visit.

#### BCA-005 — Root test command is not reproducible (P1)

**Reproduction:** run `npm test`. Earlier storage, voice-note and AI tests pass,
then `tests/proxy-server.test.js` stops because `server/index.js` imports
`dotenv`, which is absent from declared dependencies. All later suites are
skipped by the chained command.

**Impact:** the nominal release gate can never prove a complete pass in a clean
checkout.

#### BCA-006 — Paid AI endpoints lack production-grade caller/rate control (P1)

**Evidence:** `/api/transcribe` checks origin, shared device secret, payload size
and timeout but has no request-rate limiter. `/api/claude` uses an in-memory
fallback because production lacks `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`. A shared secret embedded on registered clients is a
quota gate, not user authentication, and can be extracted.

**Impact:** leaked access can create OpenAI/Anthropic cost or service exhaustion.
This maps directly to OWASP API4:2023 unrestricted resource consumption.

**Required outcome:** durable per-device/user quotas, server-side spend caps and
alerts, revocable device credentials, monitoring and fail-closed production
configuration.

#### BCA-007 — Passphrase derivation is below current OWASP guidance (P1)

**Evidence:** local encryption uses AES-256-GCM correctly with random 12-byte IVs
and a 16-byte salt, but derives the key with PBKDF2-HMAC-SHA256 at 100,000
iterations. Current OWASP guidance recommends 600,000 where PBKDF2-SHA256 is
used. Minimum passphrase length is eight characters.

**Impact:** an attacker who copies browser storage has a lower-cost offline
guessing target than current guidance. Benchmark a migration-safe work factor on
supported iPhones; prefer a memory-hard KDF if platform/compatibility permits.

#### BCA-008 — External runtime script supply-chain exposure (P1)

**Evidence:** Leaflet and Tesseract are fetched at runtime from `unpkg.com`; CSP
also permits `cdn.jsdelivr.net`, inline styles and any HTTPS `connect-src`. No
subresource-integrity evidence was found.

**Impact:** first use depends on third-party availability/integrity and makes
offline claims less deterministic. Self-host pinned assets, narrow CSP hosts,
remove unused origins and document tile/provider data flows.

#### BCA-009 — Backup confidentiality needs a safer default (P1)

**Evidence:** operational fields are decrypted by export; the backup layer can
encrypt an envelope when supplied a password, but readable exports remain
possible and user-controlled files can contain complete customer/audio context.

**Impact:** backups shared to cloud storage/email may bypass on-device
encryption. Make encrypted backup the default, clearly warn before readable CSV
or JSON export, and test recovery UX on physical devices.

## Medium-priority findings

- **BCA-010 — Route-splitting architecture drift (P2):** `tests/docs.test.js`
  fails two assertions because secondary workflows are eagerly loaded and
  precached while stale lazy-feature mappings remain. This increases startup and
  regression complexity even though current Lighthouse remains usable.
- **BCA-011 — App LCP is slow (P2):** production Lighthouse is Performance 85,
  Accessibility 100, Best Practices 100, SEO 100; FCP 0.9 s, LCP 4.4 s, TBT
  0 ms, CLS 0.004. Prioritise the LCP element and module/precache strategy.
- **BCA-012 — Landing accessibility defects (P2):** Lighthouse accessibility is
  96. Two 12 px footer lines have 4.12:1 contrast against black (below 4.5:1).
  Images also lack explicit dimensions.
- **BCA-013 — Landing cache policy wastes repeat bandwidth (P2):** hashed JS,
  CSS, fonts and large screenshots are served without long-lived immutable
  caching; screenshots are materially larger than display size. Landing scores:
  Performance 96, Best Practices 100, SEO 100, FCP 2.1 s, LCP 2.3 s, TBT 0 ms,
  CLS 0.
- **BCA-014 — Pilot-form records lack an operational retention process (P2):**
  submissions are appended to a CSV in the web application directory and emailed.
  Apache blocks direct access and file-backed throttling fails closed, but no
  documented retention/deletion schedule, access review, backup policy or data-
  subject process was found. Spreadsheet formula-prefix neutralisation should
  also be added before staff open CSV exports.
- **BCA-015 — Live landing trails current source (P2):** the current landing
  source builds successfully, but live asset hashes/last-modified evidence do not
  match the newest working-tree build. Public copy therefore must not be assumed
  to include the latest approved edits.
- **BCA-016 — Brand/version residue (P3):** package, cache and code comments still
  contain AdvisorOS; one service-worker notification fallback also uses the old
  name. This complicates support and evidence but is not a functional blocker.

## What passed

- Broad IndexedDB and shim storage coverage: encrypted round-trips, schema
  migrations, cascaded deletion, backup validation, atomic restore/rollback,
  sequence guarding and device-secret exclusion.
- Focused suites for voice notes/transcription client and proxy validation,
  unified note capture, daily companion, quick capture, reminders, on-site
  workflow, follow-ups, tasks, leads, quotes, jobs, invoices, suppliers,
  capacity, retention, communications, scheduling, measurements, money, routing,
  settings, providers, weather and appointment types/save logic.
- Twenty-five-screen axe sweep: no unaccepted serious, critical, moderate or
  minor violations; documented essential exception for Leaflet's map pin target.
- Automated 393 × 852 iPhone journey across Home, visit, customer, outcomes,
  orders, money, follow-ups, message preview, trip state, My Day and Ask Beelo;
  no horizontal overflow or page errors.
- Fresh offline launch, offline/online banner recovery, secure standalone display,
  16 px inputs and sampled 40 px touch targets.
- Human control: communications remain drafts/handoffs; missing phone numbers fail
  safely and nothing is autonomously sent.
- Live legal-consent route renders; live app has HSTS, CSP, frame denial,
  `nosniff`, referrer and permissions policies.
- Malicious-origin transcription request was rejected with 403. Production npm
  dependency audit reports zero known vulnerabilities. The full dependency audit
  reports 13 issues (7 high, 4 moderate, 2 low) confined to the Lighthouse/LHCI
  development-tool chain; update the tooling without misrepresenting it as a
  shipped runtime exposure.
- Landing TypeScript/Vite production build passed. Pilot API validates small JSON,
  UK eligibility and elapsed time, uses honeypot/IP/email throttles, stores with
  file locking, avoids implied acceptance, and denies direct public access to
  `applications.csv`.

## Evidence gaps

- No formal authenticated penetration test, SAST/secret scan, fuzzing or hostile
  backup corpus was commissioned.
- No physical-device retest was run during this audit; current mobile evidence is
  automated iPhone-size WebKit/Chromium plus prior founder verification.
- No real or synthetic pilot application was submitted, so live mail receipt,
  acknowledgement delivery, CSV persistence and throttling remain unproved.
- GPS background behaviour, long recordings, storage exhaustion, low-power mode,
  Safari eviction, interrupted upgrades and multi-day field reliability still
  need a physical iPhone matrix.
- WCAG automation cannot prove keyboard, screen-reader wording, cognitive load or
  real assistive-technology usability.
- No approved pilot feature flag/scope record exists; implemented modules are not
  automatically pilot-approved.

## Recommended release sequence

1. **Truth and accountability:** close BCA-001/BCA-002; approve pilot scope,
   providers, operator identity, retention and participant notice.
2. **Recoverable release:** close BCA-003/BCA-005; commit, push, tag and require a
   clean full-suite gate.
3. **Core differentiation:** fix and physically retest BCA-004 (scan → review →
   save → visit), then regression-test notes/voice/context and communications.
4. **Cost/security:** close BCA-006/BCA-007/BCA-008/BCA-009; add monitoring,
   quotas, key rotation and tested encrypted export/recovery.
5. **Pilot evidence:** run a five-device/browser acceptance matrix, controlled
   synthetic pilot-form submission, retention drill, offline/storage-stress test
   and one complete field-day rehearsal.
6. **Optimise after correctness:** route splitting, LCP, landing contrast/images,
   caching and remaining AdvisorOS branding.

## Pilot go/no-go criteria

Proceed to a small external pilot only when all P0 items are closed, `npm test`
and independent OCR/docs suites pass from a clean checkout, the deployed commit
is identifiable, AI cost controls are durable, and the scan/voice/offline journey
passes on a physical iPhone. Until then, keep access founder-controlled with mock
or founder-owned data and describe all modules as prototype capability.

## Remediation checkpoint — 3 September 2026

- **BCA-003 partially closed:** the exact accumulated product tree was preserved
  in baseline commit `2b410f4`. Publishing/tagging and reconciling the remote
  branch remain open.
- **BCA-004 closed in source:** OCR now snapshots the extracted appointment type
  before asynchronous customer creation. Both duplicate and non-duplicate scan
  creation/navigation tests pass.
- **BCA-005 closed:** root development dependencies now declare `dotenv` and
  `express`; the complete chained `npm test` command passes.
- Removed the tracked landing TypeScript build cache and ignored future copies.
  Removed the stale duplicate lazy-feature registry; the established eager path
  remains, and its test now requires every secondary workflow in both the page
  and fresh offline shell.
- Verification after cleanup: root build, complete root suite, landing build,
  browser migration/AI journey, 25-state accessibility sweep and fresh offline
  launch/recovery all pass. Production dependency audit remains zero known
  vulnerabilities. No deployment was made.
