# Beelo

Beelo is a pilot-stage, offline-capable operational-memory tool for solo
self-employed home-visit professionals, developed around a window-coverings
adviser's sales, referred surveys, fittings and service calls.

It is the adviser's private working layer beside existing company software,
maps and messaging—not a replacement CRM, accounting system, tax-filing or
Making Tax Digital (MTD) filing product. It connects context captured in Beelo,
not verified live connections to those other systems.

## Current prototype

- Home/day context, customer history, visits, access details and follow-ups.
- Manual and scan-assisted capture, window measurements/descriptions, photos,
  typed/voice notes and optional online transcription. Audio can be kept or
  deleted separately from the note text.
- Arrival windows, scheduling warnings, visit outcomes and order-linked fitting
  booking; referred surveys can start from a new customer.
- Tomorrow planning, manual reorder, route preview and time proposals. Proposed
  order is not an optimised road route and does not change agreed booking times.
- Editable communication drafts, explicit WhatsApp/SMS handoff and recorded
  contact outcomes. Nothing sends autonomously; opening another app is not proof
  of sending, delivery or customer agreement.
- Navigation handoff, local mileage/trips, expenses and configurable
  earnings/commission estimates. Background mileage/arrival detection is not
  guaranteed when the phone or browser suspends the app.
- Local export/import and password-protected backup, with no hosted recovery.

The source also contains leads, quotes, operational jobs, invoices/payment
records, suppliers, availability, profitability, aftercare and social-draft
modules. Presence in source is not pilot approval or commercial readiness.
The [release feature inventory](docs/BEELO_RELEASE_FEATURE_INVENTORY.md)
separates implementation, tests, approval, claims and unbuilt concepts.
No traction, participation, funding, partnership or endorsement is established.

## Architecture and data boundaries

- Vanilla HTML/CSS/JavaScript PWA. The shell loads generated minified assets;
  the service worker caches shell and secondary workflows. The build regenerates
  assets and checks version tokens.
- Device-local IndexedDB via bundled Dexie-compatible code; localStorage also
  holds configuration/transient state. A local passphrase protects specified
  sensitive fields—not the entire database and not an online account.
- Static frontend plus optional serverless backends: `api/claude.mjs` and
  `api/transcribe.mjs`. `server/index.js` is an alternative Claude-only Express
  wrapper, not a transcription host.
- Fresh maps, geocoding, routing, weather, downloaded OCR resources and AI have
  connectivity/provider boundaries. Core cached records can work offline;
  this is not sync or a guarantee for every offline state.
- Selected AI inputs/audio leave the device on explicit requests. Map/location
  requests can disclose addresses or coordinates to configured providers.
  Local-first does not mean no data egress.

## Run locally

Use Node 24 for maintained release tooling and Python 3 for a simple server:

```bash
npm ci
npm run build
npm run serve
```

Open `http://localhost:8000` and set up a local passphrase. Use synthetic records
for testing. A static server does not execute API routes. Production PWA/device
capabilities require HTTPS.

## Tests and release

```bash
npm test
npm run test:social
npm run verify:release
```

The release gate includes build/unit checks and 13 synthetic Chromium/WebKit
browser scripts. Playwright runtimes must be available; hosted acceptance uses
a pinned version-matched image. This is not physical-iPhone, native-share,
background-GPS or paid-provider certification. See the
[physical-device checklist](docs/BEELO_IPHONE_PILOT_ACCEPTANCE.md).

App: [beelo.beelestial.co.uk](https://beelo.beelestial.co.uk/).
The marketing website is separate. A static-only host does not deploy the APIs.
Preserve unrelated work, start from the verified production baseline, run gates,
stage production, compare assets and promote that same build after acceptance.
Do not deploy a divergent checkout over production.

Latest runtime: [C16 audit](docs/audits/C16_MODAL_FORM_STATE_2026-10-23.md),
`9995984`, final acceptance `ba30894`, cache 154, deployed 24 October 2026.
Documentation edits do not change this runtime. The
[C14 offline investigation](docs/audits/C14_OFFLINE_INVESTIGATION_2026-10-23.md)
remains open despite recent passes; old audits must be read with their later
remediation evidence.

## Optional online AI

Provider keys stay server-side. Allowed origin and shared device credentials
are quota protection, not per-adviser authentication. Production services need
working shared usage protection; there is no independent per-instance production
fallback. See the [proxy guide](README-AI.md).

Transcription's shared pilot allowance is 100 admitted attempts and 100 MB per
UTC day, at most two concurrent requests, with 3 MB per recording. It is not a
monetary cap. Denial does not delete saved audio. Never commit provider keys,
shared credentials or customer exports.

## Limitations and future concepts

- No accounts, automatic cloud sync, remote recovery, subscriptions, team
  workspace or verified live company-system connectors. Device/storage loss
  can lose records without a usable exported backup. Unprotected exports may
  contain readable personal data.
- Public routing/geocoding fallbacks have no commercial SLA. No provider pricing,
  allowance, optimal-route or guaranteed mileage-saving claim is made here.
- Money/tax figures are operational records and estimates—not formal accounts,
  payroll, tax advice, returns, MTD submission or payment processing.
- Attended access/no-show service-call eligibility and the net-versus-gross
  basis for two-stage survey commission require Muhammad's decision.
- Pilot scope, physical-device acceptance, main-branch release enforcement and
  independent security/privacy/legal assurance are not established by tests.

Accounts, sync, billing and business-system integrations are future concepts,
not commitments. No feature removal or scope change is authorised by this text.

## License

Package metadata declares MIT. Licensing does not establish availability, support
or pilot approval. AdvisorOS remains an internal codename in package names,
storage keys and technical history, not the product name.
