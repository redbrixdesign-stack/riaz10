# Beelo / AdvisorOS — Canonical Architecture and Product Behaviour

**Status:** Canonical source of truth for the current repository  
**Release target:** The AdvisorOS v5.0 codebase in this repository  
**User-facing product name:** Beelo  
**Internal/runtime name:** AdvisorOS  
**Last verified against source:** 18 August 2026

This document describes only the product implemented in this repository. It does not define an unimplemented rewrite, multi-user service, or cloud-synchronised product. If another document conflicts with this one, this document and the working source code in this repository take precedence until both are deliberately updated together.

---

## 1. Product definition

Beelo is a daily operational companion for a self-employed field sales and fitting advisor. It is designed primarily around window-coverings work, while retaining configurable trade labels for adjacent field-service professions.

The product combines:

- a day and visit diary;
- customer records and history;
- sales outcomes and follow-ups;
- an order pipeline;
- mileage, expenses, commission, and tax planning;
- route planning and live trip logging;
- window measurement checks;
- document and screenshot scanning;
- reviewable customer-message drafts;
- an offline, data-aware companion on the Home screen.

The product is intentionally a **single-user, device-local PWA**. It has no user accounts, remote database, team workspace, server-side customer store, or automatic cloud sync.

### 1.1 Primary user

The primary user is a solo advisor who:

- visits customers at their homes or premises;
- consults, measures, sells, fits, reviews, or services physical products;
- earns commission or directly retains business income;
- travels between appointments;
- needs information while mobile and sometimes offline;
- is responsible for remembering follow-ups, collecting balances, and tracking costs;
- wants operational guidance without adopting a full CRM or accounting platform.

### 1.2 Product promise

Beelo should help the advisor answer five questions quickly:

1. What do I need to do next?
2. Which customers or quotes need attention?
3. What is happening with each order?
4. What have I earned, spent, travelled, and set aside?
5. What information do I need before or during the next visit?

### 1.3 Product boundaries

Beelo is not:

- a multi-user CRM;
- a dispatch or workforce-management system;
- a cloud backup or device-sync service;
- a payment processor;
- an automatic messaging service;
- a tax filing or accounting product;
- a replacement for professional tax advice;
- a guaranteed routing, weather, geocoding, or AI service.

---

## 2. Non-negotiable product principles

### 2.1 Local-first operation

Core records are stored on the device and remain usable without an internet connection. A network connection may improve maps, geocoding, weather, road routing, AI drafting, and AI OCR, but it must not be required to open the diary, review local data, record work, calculate measurements, or use rule-based companion answers.

### 2.2 One advisor, one device profile

The current application represents one advisor configuration. There is no tenancy model or authenticated identity. The advisor's name, targets, units, commission rules, trade, and preferences apply to the whole local installation.

### 2.3 The user approves external actions

Beelo may prepare a message, navigation link, reminder, or suggested action, but it must not silently:

- send WhatsApp or SMS messages;
- email a customer;
- charge or collect money;
- navigate away to a third-party app;
- delete customer data;
- replace an imported dataset;
- invoke AI on customer context when AI is disabled.

Messages always open in a review/preview flow before hand-off to WhatsApp or SMS.

### 2.4 Derived figures have one source of truth

- Weekly earnings and sales statistics come from `DB.getWeekStats()`.
- Customer financial totals are recomputed from order records rather than incrementally accumulated.
- The advisor directly sets a weekly **earnings** target. Required weekly sales are derived from the effective commission rate.
- Paid order status is derived when the balance due reaches zero.
- Cancelled visits do not count toward operational or earnings totals.

### 2.5 Honest degradation

When a non-core service is unavailable, the UI must show a fallback or a clear failure state. It must not claim that OCR, geocoding, route calculation, AI phrasing, or notification delivery succeeded when it did not.

---

## 3. Technology and runtime architecture

### 3.1 Client

- Vanilla HTML, CSS, and JavaScript.
- No client framework.
- Hash-routed single-page application.
- Feature modules register themselves with the central `App` object.
- Production loads minified source files from `index.html`.
- Source files remain the readable implementation and are minified by `npm run build`.

### 3.2 Persistence

- Primary database: IndexedDB through bundled Dexie.
- Database name: `advisoros_v6`.
- Current database schema version: 2.
- Fallback compatibility layer: bundled mini-Dexie.
- Small runtime/configuration flags also use `localStorage` and `sessionStorage`.
- Active trip state survives route/screen changes and reloads through local storage.

### 3.3 Optional server component

The PWA is static. The only optional server component is the Claude AI proxy:

- Vercel handler: `api/claude.mjs`;
- optional Express wrapper: `server/index.js`;
- Anthropic API keys remain on the server;
- production proxy use requires configured origin and shared-secret protection;
- AI is optional and disabled until configured by the advisor.

### 3.4 PWA

- Manifest: `manifest.json`.
- Service worker: `sw.js`.
- Display mode: standalone.
- Orientation: portrait.
- App shortcuts: Add Visit and Log Expense.
- Same-origin application assets use a network-first strategy with a six-second timeout and cached fallback.
- The application shell is returned for offline navigation.
- Old named caches are removed during service-worker activation.

### 3.5 High-level component flow

```text
User interaction
    ↓
index.html application shell
    ↓
App router and delegated action dispatcher
    ↓
Feature module (Today, Visits, Orders, Money, etc.)
    ↓
DB service / calculation service / optional network service
    ↓
IndexedDB + local runtime state

Optional egress:
Feature → geocoding/routing/weather provider
Feature → local Tesseract OCR
Feature → configured Claude proxy → Anthropic
Feature → reviewed WhatsApp/SMS/maps hand-off
```

---

## 4. Naming and terminology

- **Beelo:** the name displayed to users in the manifest, onboarding, headings, and brand language.
- **AdvisorOS:** the internal application/runtime name retained in database names, storage keys, console output, source headers, and compatibility code.
- **Visit:** the principal scheduled customer interaction. The implementation calls these `appointments` in storage and code.
- **Follow-up:** an item derived from visit, order, communication, or timing state. It is not a separate persisted task table.
- **Order:** a persisted commercial record normally created when a visit outcome becomes `ordered`.
- **Communication:** a record of a prepared/sent message stage or an operational note.
- **Customer 360:** the aggregated customer profile built from customer, visit, order, measurement, photo, and communication records.

Do not rename database keys or internal storage identifiers solely for branding consistency; they are compatibility contracts for installed users.

---

## 5. Application shell and routing

### 5.1 Router

The application uses URL hashes. `App.navigate(featureId, params)` renders a registered feature and serialises parameters into the hash.

The five persistent primary navigation controls are:

| Label | Hash | Purpose |
|---|---|---|
| Home | `#today` | Companion, weekly strip, next visit, and operational questions |
| Follow-ups | `#followups` | Due and upcoming customer/action inbox |
| Orders | `#orders` | Quotes and order Kanban |
| Money | `#money` | Earnings, tax estimate, expenses, mileage, and records |
| Tools | `#control` | Secondary navigation and quick actions |

### 5.2 Registered routes

| Feature ID | User-facing screen | Primary-nav item | Entry conditions |
|---|---|---:|---|
| `today` | Home | Yes | Default after completed onboarding |
| `followups` | Follow-ups | Yes | Direct or primary navigation |
| `orders` | Orders | Yes | Direct or primary navigation |
| `money` | Money | Yes | Direct or primary navigation |
| `control` | Tools | Yes | Direct or primary navigation |
| `appointments` | Visits/New Visit/Visit detail | No | Home, Tools, customer, order, follow-up, or deep link |
| `customer` | Customer 360 | No | Search, visit, or area results; requires customer ID |
| `route` | Route | No | Tools or visit navigation |
| `talk` | Message workspace | No | Follow-up/customer/visit actions |
| `measure` | Measure | No | Requires or selects a visit |
| `ocr` | Scan Document | No | Tools or New Visit |
| `settings` | Settings | No | Tools |
| `legal` | Privacy and legal content | No | Settings |
| `onboarding` | First-run setup | No | Incomplete onboarding |
| `companion` | Home companion engine | No | Mounted inside `today`; not an independent user destination |

### 5.3 Navigation behavior

- A fresh normal launch after onboarding lands on Home.
- A valid explicit deep link is preserved after boot/unlock.
- An incomplete installation lands on Onboarding.
- Async screens render a skeleton while loading.
- Render failures show retry and Home actions rather than a blank screen.
- Route changes close open sheets/full-screen modals and scroll the new main view to the top.
- Browser Back and Forward are expected to follow hash history.
- Unknown hashes must resolve to a deterministic fallback rather than leave the URL and visible screen inconsistent.

---

## 6. First launch, encryption, and unlocking

### 6.1 First launch

Before database use, the application asks the user to create an encryption passphrase. The passphrase must be at least eight characters and must match its confirmation.

After encryption setup, onboarding captures:

- advisor name (required);
- trade;
- weekly net earnings target;
- optional business/home base;
- distance unit;
- measurement unit.

All onboarding values remain editable in Settings.

### 6.2 Encryption model

- Key derivation: PBKDF2 with SHA-256.
- Data encryption: AES-GCM, 256-bit key.
- A random per-installation salt is stored locally.
- The derived key exists in memory only for the current session.
- Customer PII fields are encrypted at rest.
- Appointment name, phone, address, and notes fields are encrypted at rest.
- Existing plaintext records are migrated to encrypted form after unlock.
- Forgetting the passphrase means encrypted customer data cannot be recovered by the application.

### 6.3 Unlock

On subsequent cold launches, the passphrase is required before the database-backed UI is opened. A verification ciphertext distinguishes a correct passphrase from an incorrect one.

Web Crypto requires a secure context. Production must be served over HTTPS. Loopback localhost may be used for development.

---

## 7. Data model

The database contains ten tables.

### 7.1 `customers`

Purpose: durable customer identity and contact record.

Important fields include:

- `id`;
- `customerNumber` (`CUS-YYYY-NNNN` by default);
- first, last, and full name representations;
- phone and email;
- structured address and normalized postcode;
- lead source and status;
- aggregate order totals;
- created/updated timestamps.

PII is accessed through decrypting DB helper methods, not raw table reads.

### 7.2 `appointments`

Purpose: visits, diary entries, outcomes, pipeline state, and customer-facing workflow flags.

Important fields include:

- `id`, `customerId`;
- client name, phone, and address snapshots;
- date/time and duration;
- optional arrival window;
- type, status, source, notes, and parking/access notes;
- outcome, quoted/ordered value, discount, deposit/payment figures, and commission;
- communication flags such as intro/day-before/post-fit/service sent;
- cancellation and rescheduling state;
- timestamps.

Supported visit types:

- consultation;
- measure;
- fitting;
- follow-up;
- review;
- service call.

### 7.3 `orders`

Purpose: commercial pipeline after an order is created.

Important fields include:

- `id`, `customerId`, `appointmentId`;
- generated `orderNumber` (`ORD-YYYY-NNNN`);
- optional supplier order number;
- total, deposit required, deposit paid, and balance due;
- stage/status;
- created/updated timestamps.

Stages are Ordered, Delivered, Fitted, and Paid. A zero or negative balance is treated as Paid.

### 7.4 `expenses`

Purpose: deductible operating expense records.

Fields include date, amount, category, description, optional receipt image/reference, trip relation, and timestamps.

Configured categories include fuel, samples, tools/equipment, phone/internet, insurance, vehicle costs, marketing, training, and other.

### 7.5 `trips`

Purpose: manual or GPS-derived business mileage.

Fields include date, appointment relation, purpose, origin/destination, distance, duration/path data, confirmation state, and timestamps.

### 7.6 `measurements`

Purpose: window measurements associated with a visit.

Fields include appointment ID, window name, fitting type, width/drop readings, diagonals, tolerance, calculated values, notes, and timestamp.

### 7.7 `communications`

Purpose: customer communication history and operational notes.

Fields include customer/appointment relation, type, template, content, channel/stage information, and `sentAt`.

### 7.8 `photos`

Purpose: locally stored customer/visit image gallery.

Fields include customer ID, base64/binary-compatible image data, media type, caption, and timestamp.

### 7.9 `settings`

Purpose: persisted structured application configuration by key.

### 7.10 `sequences`

Purpose: collision-resistant customer and order numbering.

The sequence floor is recalculated after legacy migration and restore so newly generated identifiers cannot collide with imported records.

### 7.11 Relationships

```text
Customer
 ├─ Visits
 │   ├─ Measurements
 │   ├─ Trips
 │   └─ Order (normally one commercial order per ordered visit)
 ├─ Orders
 ├─ Communications
 └─ Photos
```

Deleting a customer is a destructive, confirmed operation and cascades through related local records.

---

## 8. Core journeys

### 8.1 First use

1. Create encryption passphrase.
2. Enter advisor name and preferences.
3. Choose weekly earnings target and units.
4. Land on Home.
5. Add the first visit manually, or restore a backup.

### 8.2 Create a visit

1. Open Tools → Add Visit, a day in the diary, a customer profile, or the PWA shortcut.
2. Enter required customer name and address.
3. Set date, time, duration, type, source, and optional arrival window/access notes.
4. The system validates required values.
5. The system checks duplicate risk using phone, address, similar name, and time overlap.
6. The visit is saved and linked to an existing or newly created customer.
7. If contact details are available, the application may offer a reviewable booking confirmation.

### 8.3 Visit lifecycle

1. Review the visit on Home, Visits, Route, Follow-ups, or Customer 360.
2. Optionally navigate, start mileage tracking, send a reviewed message, add photos, or measure windows.
3. Record an outcome.
4. Outcome-specific next actions feed Follow-ups and Talk.
5. An `ordered` outcome creates or links an order and records sale/commission data.
6. A quote-like outcome remains in the sales pipeline and decays in close probability over time.

### 8.4 Order lifecycle

```text
Quote visit outcome
    ↓ ordered
Order created with generated number and deposit calculation
    ↓
Ordered → Delivered → Fitted → Paid
                         ↑
                balance due reaches zero
```

Legacy ordered visits without order rows are backfilled idempotently on database initialization.

### 8.5 Follow-up lifecycle

Follow-ups are derived, not manually maintained as a separate task database. The inbox combines:

- quote chases based on outcome and elapsed days;
- unpaid order reminders after the configured threshold;
- today's confirmed visits without outcomes;
- tomorrow's visits missing a day-before message;
- intro messages for first-time customers;
- recent post-fit thank-you/review requests;
- recent service or issue acknowledgements.

Completing a message action updates the relevant visit/order communication flag so the same stage is not repeatedly presented as unsent.

### 8.6 Customer 360

Customer 360 combines:

- contact and address details;
- call, message, navigation, and new-visit actions;
- total visits, ordered value, open quotes, and amount owed;
- outstanding quotes;
- linked orders;
- linked measurements;
- product/buying-interest summaries;
- chronological visit/order/communication history;
- local photo gallery.

### 8.7 End of day

The advisor can review completed versus total visits, see earnings recorded for the day, add a note for tomorrow, and mark the day review complete. The EOD action is an operational checkpoint, not a server-side close or accounting lock.

### 8.8 Backup and restore

1. Export a full JSON backup.
2. The backup contains all ten tables, sanitized configuration, schema/app metadata, and photos.
3. Runtime-only AI secrets are excluded.
4. An optional backup password encrypts the file with PBKDF2/AES-GCM.
5. Import validates version, shape, IDs, references, types, and configuration before replacing data.
6. Real Dexie imports are transactional; failures roll back.
7. Imported readable PII is re-encrypted with the receiving installation's active key.

---

## 9. Screen behavior

### 9.1 Home

Home mounts the Companion feature and shows:

- an advisor greeting;
- a seven-day strip and weekly target progress;
- selected/today visit context;
- next-visit or empty-day guidance;
- rule-based operational questions;
- optional Claude phrasing.

The rule engine reads a bounded snapshot of local records. Suggestions may navigate to real screens but must not execute destructive or external actions.

### 9.2 Visits

Visits contains five views:

- Diary;
- Upcoming;
- Follow-ups/pipeline;
- Area intelligence;
- Past.

It also renders New Visit, visit detail, customer search, outcome, reschedule, cancellation, notes, photo, floor-check, and customer-edit flows.

### 9.3 Route

Route shows relevant visits, geocodes addresses, places markers, estimates travel, and can optimize order using a nearest-neighbour approach. It supports:

- configured Mapbox routing/geocoding when a token exists;
- public OSRM/Nominatim fallback;
- straight-line/Haversine estimates when routing is unavailable;
- live GPS trip recording;
- arrival detection near the destination;
- external maps navigation hand-off.

Repeated entry and exit must cleanly create and dispose the Leaflet map and ignore late async work from an inactive screen.

### 9.4 Money

Money displays:

- weekly earnings against the advisor's target;
- derived sales required to reach target;
- current-period income, expenses, mileage claim, and profit;
- estimated UK Income Tax and Class 4 NIC;
- estimated 31 January and 31 July liabilities;
- weekly saving guidance;
- expense, mileage, and record-entry actions;
- downloadable tax summary and backup actions.

All tax figures are planning estimates and must be labelled accordingly.

### 9.5 Orders

Orders presents Quoted, Ordered, Delivered, Fitted, and Paid columns. Quote cards are derived from quote-like visit outcomes that do not already have linked orders. Order cards come from the orders table.

Unexpected legacy stage values must remain visible, defaulting to Ordered with a diagnostic warning rather than disappearing.

### 9.6 Measure

For a selected visit, Measure records:

- width at top, middle, and bottom;
- drop at left, centre, and right;
- two diagonals;
- recess or exact fitting;
- tolerance;
- notes/window label.

Measurements are normalized internally to millimetres. Display/input units may be mm, cm, or inches.

Rules:

- the least valid width is used as the basis;
- recess width subtracts the configured tolerance;
- drop uses the least reading without subtracting width tolerance;
- diagonal variance determines squareness;
- the default squareness threshold is 5 mm;
- incomplete/invalid numbers must not silently produce a successful check.

### 9.7 Scan Document

Scan accepts a user-selected image.

Processing order:

1. If configured and enabled, try Claude Vision through the proxy.
2. If AI is unavailable or fails, try local Tesseract OCR.
3. If OCR cannot load, times out, or fails, show manual entry.
4. Always present extracted fields for user review/editing.
5. Saving requires sufficient customer data and then creates/links customer and visit records.

AI and OCR extraction are proposals, not trusted facts.

### 9.8 Settings

Settings sections are:

- Your Details;
- Company Branding;
- Business Base;
- Morning Brief;
- Automated Messages;
- Commission Rate;
- Advisor Mode;
- Trade;
- Units;
- Claude AI;
- Data & Backup;
- Privacy & Legal.

Setting changes apply to the current local advisor profile and persist locally unless explicitly documented as session-only.

### 9.9 Tools

Tools is the secondary navigation hub for:

- Add Visit;
- Log Mileage;
- Log Expense;
- End of Day;
- Find Customer;
- Orders Board;
- Follow-ups;
- Route Planner;
- Measure;
- Scan Document;
- Settings;
- Export Backup.

---

## 10. Business rules

### 10.1 Commission

Two modes are supported:

1. **Simple:** `commission = sale value × simple rate`.
2. **Two-stage:** `net value = sale value × (1 − reduction rate)` and `commission = net value × net commission rate`.

The configured default is two-stage: a 20% sale reduction followed by 15.25% commission on the reduced value. This produces an effective rate of 12.2%, not 0.122%.

### 10.2 Weekly target

The advisor sets a weekly earnings target. Required weekly sales are:

```text
required sales = earnings target ÷ effective commission rate
```

The legacy `weeklySalesTarget` configuration value is a compatibility fallback, not the normal source of truth.

### 10.3 Deposits

Configured defaults:

- below the minimum threshold: full payment;
- at or below the full-payment threshold: full payment;
- above the threshold: configured percentage deposit.

Current defaults are £750 minimum, £1,500 full-payment threshold, and 50% above the threshold.

### 10.4 Pipeline probability

Quote close probability decays by age using configured points:

| Days since quote | Probability |
|---:|---:|
| 0 | 80% |
| 3 | 60% |
| 7 | 40% |
| 14 | 20% |
| 21+ | 5% |

### 10.5 Mileage

UK planning defaults:

- 55p per business mile for the first 10,000 miles;
- 25p per mile thereafter.

These rates apply to cars and goods vehicles for the 2026–27 tax year from 6 April 2026. The first-band increase from 45p to 55p applies retrospectively from that date. These are configuration values and must be reviewed for later tax years rather than presented as timeless statutory truth.

### 10.6 Tax estimate

The calculator estimates:

- taxable profit after expenses and mileage;
- personal allowance impact;
- progressive UK income-tax bands;
- Class 4 NIC;
- payments on account;
- January/July planning dates and weekly saving.

It is explicitly not tax filing advice.

### 10.7 Visit floor

The visit-floor calculator combines travel cost, visit time, drive time, and the advisor's minimum hourly value, then converts the required earnings into a minimum sale value using the effective commission rate.

---

## 11. Communications architecture

### 11.1 Stages

Implemented message stages include:

- booking confirmation;
- pre-introduction;
- evening before;
- morning of;
- on my way;
- running late;
- quote follow-up variants;
- discount/value follow-up;
- rebooking/apology;
- order confirmation;
- payment reminder;
- post-fit thank-you/review/referral;
- service/issue acknowledgement.

### 11.2 Rules

- Templates are personalized with known local data.
- AI may rewrite wording but must not invent facts, prices, dates, products, or promises.
- Customer addresses and unrelated business context are excluded from AI payloads where not needed.
- Each automated cadence stage fires at most once per visit.
- Scheduled drafts only run while the application is available to schedule them; this is not a background server.
- “Sent” flags represent completion of the application's reviewed hand-off flow; Beelo cannot guarantee third-party delivery.

### 11.3 UK timing

Day-before and morning-of logic uses UK wall-clock dates rather than the device timezone so a travelling advisor does not misclassify UK appointments.

---

## 12. External services and permissions

| Capability | Primary path | Fallback | Core app dependency |
|---|---|---|---:|
| Geocoding | Mapbox when configured | Nominatim/public provider | No |
| Road routing | Mapbox when configured | OSRM, then estimates | No |
| Map display | Leaflet loaded from CDN | Route list/text state | No |
| Weather | Open-Meteo | Cached/unavailable state | No |
| OCR | Claude Vision when enabled | Tesseract, then manual entry | No |
| Message/assistant AI | Claude proxy | Templates/rule engine | No |
| Customer messaging | WhatsApp/SMS hand-off | Copy/review flow where available | No |
| Navigation | External maps link | Address remains visible | No |

Permissions:

- Geolocation is requested only for location-aware route/trip features.
- Notifications are requested only for enabled reminder/brief features.
- Camera/file selection is initiated by the user for photos or OCR.

---

## 13. Security and privacy

### 13.1 Local data

- Customer and visit PII is encrypted at rest.
- The encryption key is not persisted.
- Raw encrypted customer/appointment tables must be accessed through the DB abstraction.
- Rendered user content must be HTML-escaped.
- Route/hash record IDs are coerced to safe positive identifiers before DB access.

### 13.2 AI proxy

Production proxy requirements:

- `ANTHROPIC_API_KEY` server-side only;
- exact `ALLOWED_ORIGIN`;
- `AI_SECRET` shared gate;
- model and media-type allowlists;
- body/image size limits;
- rate limiting;
- bounded upstream timeouts;
- generic client-facing provider errors.

The AI secret is session-only in the browser and is excluded from backup files.

### 13.3 Backup security

- Backups contain readable customer data so they can be restored on another installation.
- Users should password-protect backup files when they may leave the device.
- Imported files are untrusted and must pass full validation before database replacement.

### 13.4 Destructive actions

Factory reset, customer deletion, photo deletion, cancellation, and import replacement require explicit confirmation. No destructive operation should be triggered by navigation alone.

---

## 14. Offline and failure behavior

### 14.1 Must work offline

- unlock after cached app load;
- Home rule-based answers from local data;
- Visits and customer records;
- order, expense, mileage, and measurement records;
- calculations;
- local photos;
- backup creation;
- cached application navigation.

### 14.2 May degrade offline

- fresh maps and map tiles;
- new geocoding and road routing;
- fresh weather;
- Claude OCR/drafting/phrasing;
- first-time Tesseract download if not previously cached by the browser;
- external messaging/maps hand-off.

### 14.3 Required error behavior

- No blank screens.
- Async render failures show retry/navigation actions.
- Failed network enhancements retain local data and manual paths.
- OCR failure offers editable manual entry.
- Storage fallback is disclosed through diagnostics/warnings.
- Corrupt stored configuration is removed with diagnostic logging rather than repeatedly breaking boot.

---

## 15. Design and interaction rules

- Mobile-first, portrait-oriented layout.
- Persistent five-item bottom navigation.
- One dark visual theme: Manchester Ink surfaces with Beelo Gold primary emphasis.
- Touch targets and essential controls must remain keyboard accessible.
- Icon-only buttons require meaningful accessible names.
- Forms require programmatic label associations and visible validation feedback.
- Modals/sheets close with their close control and Escape where a keyboard exists.
- Empty screens show intentional empty states rather than appearing unfinished.
- Loading screens use skeletons rather than white/blank flashes.
- Gold is brand/current/primary action; amber is warning; green is success; red is destructive; slate is neutral information.

The detailed visual contract remains in `docs/DESIGN_SYSTEM.md`.

---

## 16. Build, test, and deployment contract

### 16.1 Development

```bash
npm install
npm run serve
```

The repository's actual static-server script is `python3 -m http.server 8000`; `npm run serve` delegates to the configured script where available.

### 16.2 Build

```bash
npm run build
```

The build minifies readable JavaScript sources and maintains production `.min.js` artifacts. When a source file changes, its minified artifact and cache-busting references must remain consistent.

### 16.3 Automated validation

Required before release:

```bash
npm test
npm run test:browser
```

High-value browser coverage must include:

- first launch, passphrase, unlock, and onboarding;
- every declared route and important deep link;
- browser Back/Forward and invalid hashes;
- primary navigation at desktop and mobile sizes;
- create/edit/view/reload for core records;
- order and follow-up derivation;
- measurement calculations in mm/cm/inches;
- backup/export/import round trip;
- offline shell and reconnect behavior;
- console errors and failed requests;
- keyboard operation and axe scans;
- repeated entry/exit for stateful screens such as Route.

### 16.4 Deployment

- Static hosting is sufficient for the core PWA.
- HTTPS is required for production Web Crypto, service workers, and geolocation.
- Vercel can host both the static application and optional `api/claude.mjs`.
- Service-worker cache names and asset version tokens must be advanced when deployed assets change.

---

## 17. Known limitations and accepted risks

- Data is tied to the browser/device unless the user exports a backup.
- There is no automatic recovery when local storage is cleared and no backup exists.
- A forgotten encryption passphrase cannot be recovered.
- Public OSRM/Nominatim services have no commercial SLA and may rate-limit or change behavior.
- Map tiles and local Tesseract's initial CDN load may be unavailable offline.
- Browser/OS restrictions may prevent scheduled reminders when the PWA is closed.
- WhatsApp/SMS hand-off does not provide delivery confirmation back to Beelo.
- Tax and mileage figures are configurable planning estimates.
- AI output may be incorrect and always requires user review.
- The app is optimized for a solo advisor; team permissions, remote management, and multi-device consistency are outside current scope.

---

## 18. Change-control rules for this document

Update `Architect.md` in the same change whenever work alters:

- product scope or boundaries;
- route names or navigation structure;
- persisted data schema or migration behavior;
- business calculations;
- encryption, backup, or privacy behavior;
- offline guarantees;
- external services or permission usage;
- message automation or user-approval boundaries;
- canonical terminology.

Implementation should not silently diverge from this document. When deliberate divergence is necessary, update the document, source, tests, and user-facing copy together.

---

## 19. Canonical source map

| Concern | Primary source |
|---|---|
| App shell and script order | `index.html` |
| Router and global interaction dispatch | `js/core/app.js` |
| Product configuration and outcome taxonomy | `js/core/config.js` |
| Database, encryption, migrations, and import validation | `js/core/db.js` |
| Tax, commission, mileage, and visit-floor calculations | `js/core/tax.js` |
| Geolocation and trips | `js/core/geo.js` |
| Routing/geocoding provider abstraction | `js/core/geoprovider.js` |
| Home companion | `js/features/companion/companion.js` |
| Visits and customer workflow | `js/features/appointments/appointments.js` |
| Customer 360 | `js/features/customer/customer.js` |
| Orders | `js/features/orders/orders.js` |
| Follow-ups | `js/features/followups/followups.js` |
| Money | `js/features/money/money.js` |
| Route | `js/features/route/route.js` |
| Measurement | `js/features/measure/measure.js` |
| OCR | `js/features/ocr/ocr.js` |
| Messaging | `js/features/talk/talk.js` |
| Settings | `js/features/settings/settings.js` |
| Backup/export | `js/services/export.js` |
| AI client contract | `js/services/ai.js` |
| Notifications and booking confirmations | `js/services/notification.js` |
| Message cadence | `js/services/message-scheduler.js` |
| PWA caching/offline shell | `sw.js`, `manifest.json` |
| Visual design contract | `docs/DESIGN_SYSTEM.md` |
| Communication wording contract | `docs/Communication.md` |
| Feature overview | `docs/FEATURES.md` |

---

## 20. Capability and implementation status

This register distinguishes implemented behavior from partial behavior and future ideas. A capability is not release-ready merely because it appears in the UI or is described elsewhere.

Status meanings:

- **Implemented:** present in the current release and covered by working source and tests or direct verification.
- **Partial:** usable in the current release, but has a documented dependency, coverage gap, or known defect.
- **Planned:** approved direction with no complete current implementation.
- **Deprecated:** retained only for compatibility and not a pattern for new work.
- **Out of scope:** deliberately excluded from the current product.

| Capability | Status | Implementation evidence | Qualification or gap |
|---|---|---|---|
| Passphrase creation and unlock | Implemented | `js/core/app.js`, `js/core/db.js` | No passphrase recovery mechanism by design |
| Field-level customer and visit encryption | Implemented | `js/core/db.js`, storage tests | Requires Web Crypto and HTTPS/localhost |
| First-run onboarding | Implemented | `js/features/onboarding/onboarding.js` | Restore-instead path depends on a valid backup |
| Home companion using local data | Implemented | `js/features/companion/companion.js` | AI phrasing is optional; rule engine is authoritative offline path |
| Visit diary and creation | Implemented | `js/features/appointments/appointments.js` | Destructive and external actions require separate confirmation/handoff |
| Duplicate visit warning | Implemented | `js/features/appointments/appointments.js` | Warning, not a hard scheduling prohibition |
| Visit outcome and pipeline tracking | Implemented | `js/features/appointments/appointments.js`, `js/core/config.js` | Outcome taxonomy is configuration-controlled |
| Customer 360 | Implemented | `js/features/customer/customer.js` | Requires linked local records |
| Order creation and Kanban | Implemented | `js/features/orders/orders.js`, `js/core/db.js` | Payment model stores aggregate values rather than a payment ledger |
| Derived follow-up inbox | Implemented | `js/features/followups/followups.js` | Tasks are derived and are not independent persisted records |
| Expense and manual mileage logging | Implemented | `js/features/money/money.js`, `js/core/db.js` | Tax treatment remains a planning estimate |
| UK tax/commission planning | Partial | `js/core/tax.js`, `js/core/config.js` | Rates require tax-year review; not filing advice |
| Effective-dated mileage policy | Planned | Current config contains one active first/second-band pair | Historical calculations currently depend on the loaded global rate |
| Window measurements and squareness check | Implemented | `js/features/measure/measure.js` | Product-specific tolerances must remain user-reviewable |
| Local backup and restore | Implemented | `js/services/export.js`, `js/core/db.js` | User must store backups safely; no remote recovery |
| Offline application shell and local records | Implemented | `sw.js`, IndexedDB | First-time third-party assets may not be available offline |
| Route map and live trip tracking | Ready | `js/features/route/route.js`, `js/core/geo.js` | Repeated activation is generation-guarded; external services still have no guaranteed SLA |
| Route optimization | Partial | `js/features/route/route.js`, provider abstraction | Heuristic ordering and provider availability limit accuracy |
| Weather | Partial | `js/services/weather.js` | Network-dependent with cached/unavailable fallback |
| Local Tesseract OCR | Partial | `js/features/ocr/ocr.js` | First engine download may require connectivity; manual fallback is required |
| Claude OCR, drafting, and phrasing | Partial | `js/services/ai.js`, `api/claude.mjs` | Optional configuration and connectivity required; output must be reviewed |
| WhatsApp/SMS customer communication | Partial | `js/features/talk/talk.js`, `js/core/contact.js` | Beelo hands off a reviewed draft and cannot prove delivery |
| Automated background sending | Out of scope | Product safety boundary | Drafts must never be silently sent |
| Multi-user accounts and permissions | Out of scope | Product boundary | Current installation represents one advisor |
| Cross-device or cloud synchronization | Out of scope | Product boundary | Backup/export is the supported portability mechanism |
| Payment processing | Out of scope | Product boundary | The application records payment figures only |
| Tax filing and accounting submission | Out of scope | Product boundary | Calculations are estimates for planning |

---

## 21. Domain and data invariants

These invariants apply regardless of which screen or service changes the data. A change that violates an invariant is an architecture defect even when its immediate UI appears to work.

### 21.1 Identity and references

1. Customer and order sequence values must never move below the highest identifier already present.
2. A generated customer or order number must be unique within the local database.
3. Persisted numeric IDs accepted from route parameters or imported data must be positive integers where the table uses numeric IDs.
4. A foreign-key-like reference in an imported backup must point to an existing compatible record unless the schema explicitly permits an unlinked record.
5. An ordered visit must not generate more than one automatically linked order for the same `appointmentId`.
6. Legacy migration and backfill operations must be idempotent.

### 21.2 Customer and visit privacy

1. Customer PII must not be written in plaintext to encrypted customer fields.
2. Appointment client name, phone, address, and notes must not be written in plaintext to their encrypted persisted fields.
3. Features must obtain customers and appointments through decrypting DB helpers rather than raw table reads when encrypted fields are required.
4. The derived encryption key must not be persisted.
5. AI secrets must not enter IndexedDB backups, normal configuration exports, logs, or rendered HTML.
6. User-controlled content must be escaped before insertion into HTML.

### 21.3 Visit and schedule state

1. A visit requires a customer name, address, valid date, and valid time before it can be saved through the normal workflow.
2. Visit duration must be positive.
3. An arrival window supplements the exact diary time; it does not replace the scheduling instant used for ordering and conflict checks.
4. Cancelled visits must not count toward earnings, active pipeline totals, or operational completion totals.
5. Duplicate detection warns about likely conflicts but does not silently discard or merge a visit.
6. Rescheduling must preserve record identity and linked customer/order relationships.

### 21.4 Orders, payments, and earnings

1. An order created from a visit must retain its `appointmentId` and `customerId` relationship where those records exist.
2. Customer order totals must be recomputed from order rows rather than incremented/decremented opportunistically.
3. `balanceDue` must not be displayed or used as a negative collectible balance.
4. A balance of zero implies the Paid board state.
5. Unexpected legacy order stages must remain visible and fall back to Ordered with a diagnostic warning.
6. Weekly earnings and sales views must use the same authoritative week-statistics calculation.
7. Required weekly sales must be derived from the weekly earnings target and effective commission rate.
8. A zero or invalid commission rate must not produce infinity, a negative sales requirement, or a silently plausible result.

### 21.5 Expenses, mileage, and tax

1. Expense amounts and business mileage must not be negative.
2. Mileage bands must be applied to cumulative business miles for the relevant tax year.
3. For 2026–27, cars and goods vehicles use 55p for the first 10,000 business miles and 25p thereafter, effective from 6 April 2026.
4. Historical calculations must not be silently recomputed with a later tax year's policy once effective-dated rates are introduced.
5. Tax, NIC, mileage, and payment-on-account results must be labelled as estimates.
6. Invalid or missing financial input must fail validation or produce an explicit unavailable state, not `NaN`, infinity, or an invented zero.

### 21.6 Measurements

1. Stored measurement values are normalized to millimetres regardless of display unit.
2. Recess width uses the least valid width minus tolerance.
3. Drop uses the least valid drop without subtracting the width tolerance.
4. Two missing/zero diagonals must not be treated as a successful square-window check.
5. Diagonal variance at or below 5 mm is square under the current default rule.
6. A calculated used measurement must not be negative.

### 21.7 Follow-ups and communications

1. Follow-up tasks are derived from authoritative visit, order, communication, flag, and date state.
2. A communication stage intended to occur once must be idempotent.
3. AI and templates may draft wording but may not invent customer facts, prices, products, dates, discounts, or guarantees.
4. No message is automatically sent to a third party.
5. A hand-off to WhatsApp or SMS is not proof of delivery.
6. UK appointment-day classification must use UK wall-clock dates rather than the device timezone.

### 21.8 Backup and deletion

1. Backup validation must complete before destructive replacement of existing data begins.
2. A failed transactional import must leave the previous database intact.
3. Restore must raise sequence floors to prevent identifier collisions.
4. Restored readable PII must be re-encrypted with the receiving installation's active key.
5. Backup files must never restore runtime-only AI credentials over the receiving installation.
6. Customer deletion must remove or deliberately preserve every related record according to the documented cascade; it must not leave accidental orphans.

### 21.9 Runtime lifecycle

1. An async render or activation result must not overwrite a different feature after navigation.
2. Feature deactivation must dispose owned map instances, geolocation watchers, timers, subscriptions, and event listeners.
3. Repeated feature activation must be idempotent.
4. Only one active live-trip location watcher may exist for the current trip.
5. Unknown hashes must produce a deterministic fallback and a URL consistent with the visible screen.

---

## 22. Known defects, verification gaps, and accepted limitations

This register prevents defects from being normalised as product behavior. It is not a substitute for the issue tracker; it records architecture-significant items that affect release confidence or a stated product guarantee.

### 22.1 Known defects

| ID | Severity | Area | Current behavior | Required behavior | Likely owner |
|---|---|---|---|---|---|
| ARCH-DEF-003 | Medium | Financial policy model | One global mileage-rate pair is used for calculations | Rate selection should be effective-dated by journey/tax year so historical records retain the correct policy | `js/core/config.js`, `js/core/tax.js` |

### 22.1.1 Resolved architecture defects

| ID | Resolved | Resolution evidence |
|---|---|---|
| ARCH-DEF-001 | 18 August 2026 | Route activation generations invalidate late async work; Route → Home → Route completed without a new console error in browser verification |
| ARCH-DEF-002 | 18 August 2026 | Unknown hashes replace the invalid history entry with `#today`; browser verification confirmed URL and visible Home state agree |

### 22.2 Verification gaps

These items are not confirmed defects and must not be represented as failures without reproduction:

| Area | Gap | Required verification |
|---|---|---|
| Keyboard navigation | Automated Enter/Space activation produced inconsistent results during the interaction audit | Confirm with physical Chrome/Safari keyboards and Playwright before changing native button handling |
| Mobile navigation | Full small-viewport navigation audit was interrupted | Test supported mobile widths, safe areas, scrolling, and modal reachability |
| Browser history | Complete Back/Forward journey matrix was not finished | Test primary, secondary, modal, query-parameter, and deep-link history |
| Offline/PWA | Cached shell behavior is implemented but not fully signed off across installed-device scenarios | Test first online install, offline cold launch, update, reconnect, and stale-cache replacement |
| External services | Mapbox, OSRM, Nominatim, Open-Meteo, Claude, WhatsApp/SMS, and notifications are environment-dependent | Test success, timeout, rate-limit, permission-denial, and offline fallbacks with controlled stubs |
| Large local datasets | Functional behavior is covered more strongly than scale behavior | Establish and test supported customer, photo, visit, and backup volumes |

### 22.3 Accepted limitations

The following are deliberate current boundaries, not defects:

- one local advisor profile per installation;
- no automatic cloud backup or cross-device sync;
- no passphrase recovery;
- no guaranteed background execution while the PWA is closed;
- no delivery receipts from WhatsApp or SMS;
- no payment processing;
- no tax filing or accountant-grade liability guarantee;
- no commercial SLA for public routing/geocoding services;
- no guarantee that optional AI or first-time third-party assets are available offline;
- no team roles, manager dashboard, or shared customer ownership.

### 22.4 Register maintenance

- Remove a defect only when its fix and regression test are both merged.
- Promote a verification gap to a defect only after reproducible evidence exists.
- Moving an item from defect to accepted limitation requires an explicit product decision and corresponding user-facing expectation change.
- Newly discovered architecture-significant defects must be added here or linked from here before release sign-off.

---

## 23. Release acceptance criteria

A release candidate is acceptable only when every mandatory criterion below passes or has a recorded, explicitly approved exception. Passing unit tests alone is not release sign-off.

### 23.1 Mandatory automated gates

- [ ] `npm run build` succeeds and generated minified assets match readable source.
- [ ] Service-worker asset/version validation succeeds.
- [ ] `npm test` completes successfully in an environment permitted to bind its test server.
- [ ] `npm run test:browser` completes successfully.
- [ ] No committed secret, API key, production credential, or personal test data is detected.
- [ ] Backup schema/import fixtures for supported versions pass.
- [ ] Tax-year and mileage policy tests pass for applicable boundary dates.

### 23.2 Routing and interaction

- [ ] Every registered route renders its expected screen or documented conditional state.
- [ ] Every primary navigation control reaches the correct canonical hash.
- [ ] Tools entry points reach the correct screen, modal, or safe conditional flow.
- [ ] Important deep links survive cold launch and unlock.
- [ ] Browser Back and Forward keep URL and visible screen consistent.
- [ ] Unknown hashes resolve to the documented fallback.
- [ ] Repeated entry/exit does not leak maps, watchers, timers, listeners, or stale renders.
- [ ] No tested interaction produces an uncaught exception, unhandled rejection, hydration-equivalent render failure, or unexplained console error.

### 23.3 Core journeys

- [ ] First launch → passphrase → onboarding → Home works with synthetic data.
- [ ] Subsequent cold launch unlocks with the correct passphrase and rejects an incorrect passphrase clearly.
- [ ] Create → view → edit → reload a customer and visit preserves correct values and encrypted persistence.
- [ ] Required-field, invalid-number, duplicate, and overlapping-visit feedback is visible and actionable.
- [ ] Recording an Ordered outcome creates exactly one linked order.
- [ ] Order stage, deposit, payment, balance, and Paid derivation are consistent across Orders, Money, Home, and Customer 360.
- [ ] Follow-up tasks appear and disappear according to authoritative flags and UK dates.
- [ ] Expense and mileage records persist and affect the correct planning period.
- [ ] Measurements calculate correctly in mm, cm, and inches and reject incomplete invalid checks.
- [ ] Backup → destructive reset in an isolated test profile → restore recreates equivalent records, photos, relationships, and sequence floors.

### 23.4 Offline and resilience

- [ ] After a successful online installation, the cached application opens offline.
- [ ] Local core records remain readable and writable offline.
- [ ] Offline navigation does not produce blank screens or missing same-origin assets.
- [ ] Maps, routing, weather, OCR, and AI failures show honest fallbacks.
- [ ] Reconnection allows retry without requiring data recreation.
- [ ] A deployed asset update replaces the previous cache without stranding installed clients on incompatible source versions.

### 23.5 Security, privacy, and recovery

- [ ] Customer and appointment PII is encrypted in raw persisted rows.
- [ ] The passphrase-derived key and AI secret are absent from persistent backups and logs.
- [ ] Import rejects malformed, future, duplicate-ID, dangling-reference, and type-invalid data without damaging existing records.
- [ ] Destructive actions require explicit confirmation and identify their scope.
- [ ] External messaging, navigation, AI, upload, and permission actions remain user initiated.
- [ ] Customer-controlled content renders without executable HTML/script injection.

### 23.6 Accessibility and responsive behavior

- [ ] Primary navigation and essential form actions work by click/tap, Enter, and Space where semantically appropriate.
- [ ] Every form control has a programmatic accessible name.
- [ ] Icon-only controls have meaningful contextual labels.
- [ ] Modal focus enters the modal, remains contained where required, and returns to the trigger on close.
- [ ] Visible focus is preserved throughout keyboard journeys.
- [ ] Core screens have no blocker or critical axe violations.
- [ ] Supported mobile viewports have no unreachable controls, clipped dialogs, unsafe-area collisions, or horizontal page overflow.

### 23.7 Financial-policy review

Before a release intended for a new UK tax year:

- [ ] Mileage rates and effective dates are checked against current HMRC guidance.
- [ ] Income Tax bands, personal allowance, Class 4 NIC, and payment-on-account assumptions are reviewed.
- [ ] The application and documentation show the same rates.
- [ ] Historical-period calculations retain the policy applicable to their dates.
- [ ] Planning-estimate disclaimers remain visible.

### 23.8 Release evidence

The release record must contain:

- commit or build identifier;
- test environment and supported browser/device matrix;
- automated command results;
- manual journey results;
- console/network error summary;
- backup/restore evidence;
- offline/PWA evidence;
- accessibility summary;
- current known defects and approved exceptions;
- rollback procedure.
