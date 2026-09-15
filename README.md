# Beelo

Beelo is a pilot-stage, offline-capable personal operational-memory tool for
solo self-employed home-visit professionals. The current prototype helps one
adviser keep visit, customer, job, follow-up and working-money context together
on one device.

Beelo is not a CRM, accounting system, tax-filing product or Making Tax Digital
(MTD) filing product. It does not send customer communications autonomously.

## Current prototype

The repository contains working prototype code for:

- a daily Home/Companion view and visit diary;
- enquiries/leads, customer records and customer history;
- consultation, measure, fitting, follow-up, review and service-call visits;
- scheduling advice, overlap/capacity warnings and visit outcomes;
- follow-up tasks and editable WhatsApp/SMS message drafts;
- route planning, navigation handoff and local mileage/trip records;
- expenses, configurable commission and UK tax-planning estimates;
- measurements, photos and OCR-assisted capture;
- structured quotes, orders, operational jobs, invoices, payments, suppliers,
  purchase orders, profitability and aftercare/retention records;
- local backup export/import; and
- an installable progressive web app shell with offline support.

These capabilities are prototype modules, not evidence of commercial release,
pilot approval, regulatory approval, customer adoption or integration with an
external business system. See
[`docs/BEELO_FEATURE_INVENTORY.md`](docs/BEELO_FEATURE_INVENTORY.md) for the
evidence and positioning status of each capability.

## Product boundaries

- **Single user and single device:** there are no Beelo accounts, cloud sync,
  multi-device recovery, team workspace or manager dashboard.
- **Local-first records:** the operational database is stored in the browser on
  the device. Clearing browser data or losing the device can destroy records
  unless the adviser exported a backup.
- **Offline-capable, not network-free:** core records and cached app assets work
  offline. Maps, geocoding, routing, weather and optional AI require connectivity
  for fresh results and may send service requests to their configured providers.
- **Human-controlled communications:** Beelo prepares an editable preview and
  requires an explicit handoff to WhatsApp or SMS. Opening another app is not
  treated as proof that a message was delivered.
- **Working context, not a CRM integration:** the prototype connects context
  entered, captured or imported into Beelo. It does not currently provide a
  verified live connection to a company CRM, accounting platform, calendar or
  messaging-history service.
- **Financial planning only:** expenses, mileage, commission, profitability and
  UK tax figures are working-record and planning aids. Beelo does not keep formal
  accounts, submit returns, file tax, provide tax advice or support MTD filing.
- **Pilot status:** the separate landing page invites applications to a
  controlled UK pilot. An application is not acceptance, and this repository
  does not establish pilot participation, traction, partnerships or funding.

## Architecture

- Vanilla HTML, CSS and JavaScript static single-page application.
- IndexedDB is the primary operational store, using bundled Dexie-compatible
  code; `localStorage` also holds small configuration and transient state.
- `manifest.json` and `sw.js` provide installability and offline asset caching.
- Optional network providers include Mapbox or public Nominatim/OSRM for
  geocoding/routing, Open-Meteo for weather, and an operator-configured Claude
  proxy for AI-assisted OCR or draft rewriting.
- The optional AI proxy is implemented by `api/claude.mjs` and the standalone
  `server/` wrapper. Provider credentials must stay server-side.
- `landing/` is a separate React/TypeScript/Vite marketing and pilot-application
  project with its own deployment and personal-data boundary.

## Run locally

The source app can be served directly:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. HTTPS is required in production for service-worker
and geolocation behavior.

The minified production assets are generated with:

```bash
npm install
npm run build
```

## Tests

```bash
npm test
npm run test:browser
```

The repository also contains focused browser journeys, accessibility checks,
offline checks and timezone tests. A test file or historic result is not current
release evidence; use [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md)
and record the exact commit, environment and results.

## Optional AI proxy

AI is optional and off by default. The browser never contains the Anthropic API
key. Production proxy configuration requires an exact allowed origin and shared
gate in addition to the provider key; request limits, payload limits, allowlists
and generic error mapping are enforced by the proxy.

See [`README-AI.md`](README-AI.md) for configuration. The shared browser-side
gate is quota protection, not user authentication, because a visitor can inspect
browser configuration.

## Known operational risks

- Public Nominatim/OSRM fallbacks have no commercial service-level agreement and
  may throttle requests.
- Device-local data has no server recovery path.
- Optional AI, current maps, geocoding, routing and weather depend on external
  providers and connectivity.
- Tax and profitability results depend on configured assumptions and must be
  independently checked before business or filing decisions.
- Legal operator details, pilot privacy operations and the intended device matrix
  must be verified before public pilot onboarding.

## Future concepts — not implemented

Accounts, cloud sync, remote backup/recovery, subscriptions, billing,
multi-adviser teams, manager dashboards and production integrations with CRM,
accounting, calendar or messaging platforms are future concepts only. Their
scope, priority and positioning require explicit product approval.

## Project records

- [`docs/BEELO_DEVELOPMENT_RECORD.md`](docs/BEELO_DEVELOPMENT_RECORD.md) — living
  product truth, decisions, evidence, risks and next actions.
- [`docs/BEELO_FEATURE_INVENTORY.md`](docs/BEELO_FEATURE_INVENTORY.md) — verified
  feature and positioning classification.
- [`docs/BEELO_IPHONE_JOURNEY_AUDIT_2026-08-27.md`](docs/BEELO_IPHONE_JOURNEY_AUDIT_2026-08-27.md)
  — latest iPhone journey evidence and defects.

## License

MIT. Repository licensing does not imply product availability or support.
