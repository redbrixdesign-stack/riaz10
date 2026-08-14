# AdvisorOS — Project Overview

A daily-use companion app for **self-employed field sales/fitting advisors**
(built around window-coverings sales, but with other trades built in).
Offline-first PWA: **no backend, no login, no account** — all data lives on
the advisor's own device.

---

## 1. What it is

- **Offline-capable PWA** — installable like a native app, works without a
  signal (field advisors are often in customer homes with no Wi-Fi).
- **Single user, local-only data** — IndexedDB on the device; nothing is
  uploaded anywhere.
- **Vanilla HTML/CSS/JS** — no framework, no build step required for dev,
  no server to run (the only optional server piece is the AI proxy, see §6).
- **White-labelable** — a company can brand it under its own name via
  settings.

## 2. Screen-by-screen features

### Home — Beelo Companion (chat)
The home tab is an AI-style chat assistant, not a static dashboard.

- Answers questions from the advisor's **own live data** (today's visits,
  weekly earnings, money, follow-ups, weather, orders).
- Every suggestion is a button that opens the real screen — read-only, it
  can never trigger actions on its own.
- When Claude AI is enabled, answers are rephrased naturally and it
  suggests the next question ("Phrase with AI").
- A "My Day" panel shows the week calendar + today's visits with live
  travel-status badges.

### Today / My Day
- Weekly earnings & sales progress against target.
- Today's visit list with time slots.
- End-of-day review modal (log outcomes for the day's visits in one pass).

### Visits (diary & pipeline)
- Time-blocked diary: consultations, measures, fittings, follow-ups,
  reviews, service calls.
- Sales pipeline with **chance-of-close probability** per lead (decays the
  older a quote gets: 80% today → 5% after 3 weeks).
- Per-visit outcome capture (15+ outcomes, e.g. Ordered, Quoted, Needs to
  Think, Comparing Quotes, Too Expensive, No Show…), each with a next
  action.
- **Duplicate-booking detection** — flags the same phone, address, similar
  name, or overlapping time when a new visit is added.
- **Buying-interest extraction** — aggregates which products a customer is
  interested in across visits.

### Route
- Today's visits on a **Leaflet map** (lazy-loaded from CDN).
- Suggested visit order and drive-time estimates.
- **Live trip tracking**: GPS journey to a visit, distance accumulation,
  auto-arrival detection, "on my way" / ETA message when you start driving.
- Google Maps deep-link navigation, nearest-neighbour route optimization,
  area grouping.

### Money
- **Running UK Self-Assessment tax estimate**: income from sold visits,
  minus expenses and mileage claim, with tax + Class 4 NIC + payment-on-
  account dates (31 Jan / 31 Jul) and recommended weekly savings.
- **Mileage claim**: HMRC-style bands (£0.55/mile first 10,000, then £0.25).
- Expense logging (fuel, samples, tools, phone, insurance, vehicle,
  marketing, training…), mileage logging, weekly target progress.
- **Visit floor calculator** — after a price objection, works out the
  minimum sale value worth staying for (travel cost + your time ÷
  commission rate).
- Commission engine: simple (%) or two-stage (sale reduced 20% → 15.25% of
  net), fully configurable. The weekly **sales** target is derived from the
  earnings target — one number to set, not two.

### Orders
- **Kanban board**: Ordered → Delivered → Fitted → Paid, plus an open
  quotes column.
- Auto order numbers (`ORD-2026-0001`), deposit rules (minimum, full-payment
  threshold, 50% above), balance due, payment reminders.

### Follow-ups (inbox)
A "what's due today" inbox so nothing slips:

- Quote chases (gated by outcome + days since), payment reminders,
- Today's visits needing an outcome, tomorrow's visits needing a
  day-before message,
- Intro messages for first-time customers, post-fit thank-yous, service
  issue follow-ups.

### Talk (messages)
- Tap-to-send WhatsApp message templates for every stage of the customer
  journey: intro, day-before, morning-of, on-my-way, running-late, quote
  chase, discount offer, rebook, order confirmation, post-fit review &
  referral ask.
- **AI draft button** — Claude rewrites the message with the customer's
  name, visit details, order history, and your last messages as context.
- Nothing is ever auto-sent; every message opens a **preview sheet** for
  review, then hands off to WhatsApp (`wa.me`) or SMS.

### Measure
- Window measurement capture per visit: width/drop (top-middle-bottom),
  diagonals, recess or exact fit.
- Auto-calculation of the **least** measurement, used drop/width with
  tolerance, and a **squareness check** (diagonal variance ≤ 5mm).
- mm/cm/inches units, stored per appointment and shown in Customer 360.

### Scan (OCR)
- Photograph a quote/screenshot/order and have the key numbers extracted to
  pre-fill a visit.
- **Tesseract.js** runs locally (works fully offline); when Claude AI is
  enabled, photos are read by **Claude Sonnet vision** first, which is far
  better with messy screenshots and business cards — Tesseract remains the
  automatic fallback.

### Customers (360 profile)
- Contact details, call / message / navigate shortcuts, photo gallery
  (stored in the local DB).
- Stats: visits, total ordered, open quotes, amount owed.
- Merged chronological timeline of visits, orders, and messages.
- Buying-interest chips, outstanding-quote chases with direct send buttons.

### Tools
A quiet control centre: Add Visit, Log Mileage, Log Expense, End of Day,
Orders, Follow-ups, Find Customer, Route, Measure, Scan, Settings, Backup.

### Settings / Onboarding
- Onboarding (first run): name, trade, weekly target, business address,
  distance & measurement units.
- Settings: targets, commission modes, deposit rules, morning-brief toggle,
  AI configuration, backup export/import, factory reset.

## 3. How it works

### Storage
- **IndexedDB** via bundled Dexie 4 (`advisoros_v6` database) with 10
  tables: customers, appointments, orders, expenses, trips, measurements,
  communications, settings, sequences, photos.
- If Dexie is unavailable, a **bundled mini-Dexie shim** (601 lines) serves
  the same API; if IndexedDB itself is unavailable it degrades to an
  in-memory store with a warning.
- Automatic one-time **migration from the old storage engine**
  (`advisoros_v5` shim-era database + legacy localStorage rows) — old data
  survives upgrades. Sequence counters (CUS-/ORD- numbering) are guarded
  against collisions and never start below migrated data.
- Customer totals are **recomputed from the orders table**, never
  incrementally updated (avoids drift on edit/delete).
- Weekly stats have a **single source of truth** (`getWeekStats`) used by
  Today, Money, and Home — cancelled visits are always excluded.

### App shell & routing
- Hash-based SPA router. Features register themselves and registration
  order defines the bottom-nav order (Home, Follow-ups, Orders, Money,
  Tools).
- Async screens render a skeleton while loading; errors show a retry
  empty-state instead of a white screen.
- Global error net: uncaught errors become throttled toasts + a ring-buffer
  error log kept in localStorage for debugging.

### Geocoding & routing
- Nominatim for geocoding (UK postcode fallback), OSRM for road distances
  — public free instances, rate-limited with exponential backoff.
- GPS trip tracking with Haversine distance, 20m jitter filtering,
  auto-finish within 150m of the destination, and road-distance
  reconciliation at the end.
- Trips survive page reloads (persisted in localStorage).

## 4. Communications engine

- Automated cadence around every visit (when enabled):
  - **Evening before** (18:00 UK), **morning of** (08:00 UK) drafts;
  - **On-my-way** fired automatically when a trip starts, with live ETA;
  - **Day-before reminder** and booking confirmations with time-tiered
    wording (today / tomorrow / this week / later).
- Each stage fires **once** (persisted flags), and none are ever
  auto-sent — they open the review sheet.
- UK-time math runs from wall-clock parts so reminders fire at the right
  time regardless of device timezone.
- Optional **daily 7am morning brief** notification.

## 5. Offline & PWA

- `manifest.json` + service worker: full app precached (network-first with
  a 6s timeout so deployed fixes reach installed apps; fonts use
  stale-while-revalidate so the icon font survives offline).
- Installs to home screen, standalone display, app shortcuts (Add Visit,
  Money), push notifications.
- Works fully offline: OCR, companion answers, and all data entry are
  local. Cloud pieces (maps, geocoding, weather, AI) degrade gracefully.

## 6. Claude AI integration (optional)

The Scan, Talk, and Companion features get an AI boost when enabled in
Settings:

- **Scan** — Claude Sonnet vision reads photos (OCR) instead of Tesseract.
- **Talk** — "AI draft" rewrites template messages with full customer
  context.
- **Companion** — rephrases answers and suggests next questions.
- **Money** — receipt parsing to auto-log expenses.

The app **never holds an API key** — everything goes through your own
serverless proxy (`api/claude.mjs` for Vercel, or `server/` Express proxy
for other hosting), which holds `ANTHROPIC_API_KEY`. Optional hardening:
`AI_SECRET` header check and `ALLOWED_ORIGIN` CORS allow-list.

Prompt design is deliberately safe:

- OCR prompts are anchored to today's real date (never books visits in the
  past).
- Draft prompts follow the Beelo Communication Spec
  (`docs/Communication.md`): staged, context-aware, draft-only, no
  invented figures.
- The companion only answers from a real DB snapshot, with a whitelist of
  allowed suggestions — the model can never inject behavior.
- Costs are tracked and shown (tokens/cost of the last call in Settings).

## 7. Security notes

- No API key in client code; proxy validates origin/secret.
- IDs coerced to positive integers before DB access (hash-link injection
  defense), all rendering HTML-escaped.
- Import of backups validates shape before touching data and is atomic on
  the real engine (rollback on failure).
- AI response parsing whitelists fields/categories/commands so the model
  can't inject app behavior.

## 8. Testing & quality

`npm test` runs headless unit suites (Node + fake-indexeddb):

- **storage** — engine parity between Dexie and the shim, legacy
  migration, sequence guards, export/import rollback, factory reset.
- **ai** — proxy guards (secret/origin/image-size/model allowlist),
  prompt payloads, parsing ladders, graceful degradation.
- **companion** — routing, rule answers, whitelisted suggestions.
- **followups / scheduler / ocr** — task generation, UK-time timer math,
  date parsing and stale-date roll-forward logic.

Plus browser E2E suites (OCR save, features, companion navigation) via
`npm run test:browser`.

## 9. Build & deploy

- `npm run build` minifies all JS with terser (watch/clean modes); vendor
  Dexie copied from node_modules.
- Deploy as any static host; for AI, add the `api/claude.mjs` Vercel
  function with `ANTHROPIC_API_KEY` set. HTTPS is required (service worker
  + geolocation).
- Dev: `python3 -m http.server 8000` or `npx serve .`

## 10. Known limitations

- Routing/geocoding uses free public OSRM/Nominatim instances (no SLA,
  rate-limited) — swap for a paid provider before commercial rollout.
- Tax figures are estimates for planning, not filing advice.
- Data is device-local: no sync, no backup server, no account recovery if
  storage is cleared (use the export/import backup).
