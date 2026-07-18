# AdvisorOS

A daily-use tool for self-employed field sales/fitting advisors (built around
window covering sales, but adaptable). Runs as an offline-capable PWA — no
backend, no login, all data stored locally on the device.

## Features

- **Today** — daily dashboard: today's visits, weather, weekly sales/earnings progress
- **Visits** — diary with time-blocked slots, follow-ups, access notes, outcomes
- **Route** — map view, area grouping, route efficiency scoring
- **Money** — running UK tax estimate, expense logging, mileage tracking
- **Talk** — WhatsApp/message template queue, follow-up prompts
- **Measure** — window measurement tool with squareness check
- **Scan** — OCR for order screenshots and business cards
- **Settings** — company/independent mode, targets, data export/import

## Stack

- Vanilla HTML/CSS/JS, no build step, no framework
- IndexedDB (via bundled mini-Dexie) is the primary store for all app records
  (customers, appointments, orders, expenses, trips, measurements). If
  IndexedDB isn't available, mini-Dexie falls back to `localStorage`
  automatically. `localStorage` is also used directly for small config/flags
  (settings, weather cache, morning-brief toggle, in-progress trip state) —
  it isn't just a fallback path, it's part of the normal storage design.
- Service worker for offline caching, `manifest.json` for install-as-app
- Leaflet for maps, Tesseract for OCR (both loaded from CDN with fallback)
- OSRM + Nominatim for routing/geocoding (free public instances — see Limitations)

## Project structure

```
index.html              App shell
manifest.json           PWA manifest
sw.js                    Service worker (offline cache)
css/
  core.css               Variables, typography, layout
  components.css         Buttons, cards, modals, nav
js/
  core/                   Router, state, DB, config, utils, geo, search, tax
  services/               Notifications, export
  features/               One folder per screen (today, appointments, route,
                            money, talk, measure, ocr, onboarding, settings)
assets/icons/            PWA icons
```

## Running locally

```bash
python -m http.server 8000
# or
npx serve .
```
Open `http://localhost:8000`. No install, no environment variables, no build.

## Deploying

Any static host works (GitHub Pages, Netlify, S3 + CloudFront, etc.) — push
the folder as-is. HTTPS is required for the service worker and geolocation
to work.

## First use

1. Open the app — first run goes to onboarding.
2. Set name, trade, weekly target, distance unit (miles/km).
3. Add a visit from Today or the Visits diary.
4. Log expenses/mileage as you go; check Money for the running tax estimate.

## Known limitations

- **Routing/geocoding** (`js/core/geo.js`) uses public OSRM and Nominatim
  instances. No SLA, rate-limited, not licensed for commercial traffic.
  Swap in a paid provider (Google Maps, Mapbox, HERE) with an API key before
  any real deployment.
- **Tax calculations** are estimates based on current UK rates and are not a
  substitute for an accountant.
- All data is local to the device/browser — there is no sync, no backup
  server, and no account recovery if local storage is cleared.

## Monetization plan

Current state: single-user, offline, no accounts, no billing. To turn this
into a paid product, the likely path is:

1. **Add accounts + sync** — a lightweight backend (e.g. Postgres + a thin
   API) so data isn't trapped on one device and advisors can move between
   phone/tablet.
2. **Subscription tiers**
   - *Free* — single device, core features (Today, Visits, Money, Talk),
     capped history (e.g. last 90 days).
   - *Pro* (~£8–15/month) — multi-device sync, unlimited history, PDF/CSV
     export, priority OCR, paid-tier routing/geocoding included.
   - *Team/Company* (~£25–40/user/month) — multiple advisors under one
     account, shared pipeline visibility, manager dashboard, route
     assignment across a team.
3. **Usage-based costs to pass through or absorb** — routing/geocoding API
   calls and OCR are the main variable costs; price Pro to cover them with
   margin, or meter heavy usage past a fair-use cap.
4. **Add-on revenue**
   - Commission/discount calculator tied to actual supplier price lists
     (partner integrations with blind/curtain suppliers).
   - Referral or lead-gen fee if the app ever surfaces new customer leads.
5. **Distribution** — sell direct to independent advisors (self-serve
   subscription) and separately to companies who want it as a fleet tool for
   their advisors (seat-based licensing).

None of this is built yet — the current codebase is a single-tenant,
local-only prototype. Steps 1–2 are the prerequisite for any of the rest.

## License

MIT — free for personal use.
