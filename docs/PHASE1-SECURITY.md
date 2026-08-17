# Beelo — Phase 1 (Security & Privacy) Execution Log

Phase 1 of the release-fix plan. Each item below is implemented, verified, and
committed with the rest of Phase 1.

## 1.1 — Appointment PII encrypted at rest ✅

**Problem:** Customer PII (name/phone/email/address) was already encrypted at
rest via `encryptCustomer`, but appointment rows carried their own copies of
customer-identifying fields at booking time (`clientName`, `phone`, `address`,
`notes`) in plaintext — a copied IndexedDB file leaked who/where/when even
with a passphrase set.

**Fix (`js/core/db.js`):**
- Added `APPT_PII_FIELDS = ['clientName', 'phone', 'address', 'notes']`.
- Added `encryptAppointment()` / `decryptAppointment()` (string fields only;
  non-string values like `latLng` are untouched) and
  `migratePlaintextAppointments()` (one-time migration, runs after the
  customer migration in `DB.init()`).
- `addAppointment()` encrypts on write; returns the readable record.
- New wrappers used everywhere PII is read/written:
  - `DB.updateAppointment(id, fields)` — encrypts PII fields on update
  - `DB.getAppointment(id)` — single row, decrypted
  - `DB.getAllAppointments()` — full table, decrypted
  - `DB.getAppointmentsByCustomer(customerId)` — per-customer, decrypted
- Central read paths now decrypt before returning: `getAppointmentsForDate`,
  `getAppointmentsForRange`, `getUpcomingAppointments`, `getPipeline`.
- `exportAll()` decrypts appointments for the backup; `importAll()` re-encrypts
  on import (same envelope rule as customers).

**Call-site migration (all PII consumers now use the wrappers):**
- `js/features/appointments/appointments.js` — 15× `DB.getAppointment()`,
  PII writes via `DB.updateAppointment()` (customer-sync, move, edit-details,
  cancel, notes, outcome), area analytics via `DB.getAllAppointments()`,
  customer sync-read via `DB.getAppointmentsByCustomer()`.
- `js/features/talk/talk.js` — detail reads, history read.
- `js/features/companion/companion.js` — briefing, person answers, full-table
  scans via `DB.getAllAppointments()` / `DB.getAppointmentsByCustomer()`.
- `js/features/customer/customer.js`, `js/features/ocr/ocr.js`,
  `js/services/message-scheduler.js` — per-customer / single reads.
- `js/features/followups/followups.js` — full-table scan.
- `js/core/search.js` — the notes-match in appointment search now runs
  against decrypted rows (`DB.getAllAppointments()` + JS filter), because the
  IndexedDB `.filter()` could not see into encrypted `notes`.

**Left raw (no PII read/written):** `tax.js` (commission/value/date only),
`geo.js` + `route.js` + `talk.js` latLng/travel flag writes, `talk.js` timing
stats (date/outcome only), `appointments.js` `.count()`.

**Verified:** 80/80 seeded appointment rows store `clientName` as ciphertext;
UI renders plaintext; zero page errors; unit + browser suites green.

**Bonus fix — backup validator optional-reference bugs (`_validateBackup`):**
The backup validator rejected three record shapes the app legitimately
creates, so a backup containing them could not be re-imported:
- appointments **without** `customerId` (phone conversions typed straight
  onto the visit — seed has Margaret Doyle / Peter Osei)
- trips **without** `appointmentId` (standalone mileage logs on the Money
  screen — seed has 3)
- communications **without** `customerId` (EOD notes from Today's "Complete
  day" — `TodayFeature.completeEOD()`)

All three now validate the reference only when present (mirroring the
existing optional `orders.appointmentId` rule). Regression tests added in
`tests/storage.test.js`; verified end-to-end: 80-appointment seeded backup
exports plaintext, re-imports, and re-encrypts 80/80 rows with the orphan
records intact.

## 1.2 — AI shared secret moved to sessionStorage ✅

**Problem:** `CONFIG.ai.secret` (the `X-AI-Key` shared gate for the Claude
proxy) was persisted in `localStorage.advisoros_config` and the DB `config`
setting — at-rest credential material, and it rode along in the exported
config shape (though `_sanitizeConfig` stripped the value).

**Fix:**
- `js/features/settings/settings.js` — `persist()` now strips `ai.secret`
  (writes `secret: undefined`); `setAISecret()` stores to
  `sessionStorage['advisoros_ai_secret']` and to `CONFIG.ai.secret` for the
  current session only; the settings placeholder reflects session state.
- `js/core/app.js` — on boot, restores `CONFIG.ai.secret` from sessionStorage
  if present.
- `js/services/ai.js` — `AIService.config()` falls back to sessionStorage so
  any early caller sees the secret even before the boot restore runs.

**Trade-off (documented):** the secret is a shared gate against quota-burning,
not true authentication (per `README-AI.md` / `DATA-PROTECTION.md`), so
requiring re-entry per browser session is acceptable — and it removes the
secret from at-rest storage and backups entirely.

**Verified:** after saving a secret, `sessionStorage` + in-memory CONFIG hold
it; `localStorage.advisoros_config` has **no** `ai.secret` key; AIService
reads it; zero page errors.

## 1.3 — Security headers via Vercel ✅

**Problem:** live site served only HSTS; no CSP header (meta-only, so
`frame-ancestors` unenforced), no `X-Content-Type-Options`, no
`Referrer-Policy`, default `access-control-allow-origin: *` on HTML responses.

**Fix (`vercel.json`):** headers block applied to `/(.*)`:
- `Content-Security-Policy` — same policy as the existing meta tag (so the
  two stay in sync), now enforced at the HTTP layer where
  `frame-ancestors 'none'` actually takes effect.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), geolocation=(self), microphone=(), payment=()`

**Deploy note:** takes effect on next Vercel deploy; verify with
`curl -sI https://beelo.beelestial.co.uk | grep -i content-security`.

## 1.4 — CSP report-only (deferred, documented) ⏳

The plan called for a CSP report-only header to observe violations before the
`unsafe-inline` refactor (Phase 4). There is **no CSP violation collector** in
this repo (no `report-uri`/`report-to` endpoint), so a report-only header
would silently discard everything. Decision:

- **Do not** add report-only until a collector exists (e.g. a tiny Vercel
  function or a third-party endpoint).
- **Phase 4 prerequisite (recorded):** the app has ~323 inline
  `onclick/onchange/oninput/onblur` handlers across source features. The
  refactor to a delegated `data-action` router (already used in some places)
  is what allows removing `'unsafe-inline'` from `script-src`. That is
  deliberately deferred to the UX phase where those templates are being
  touched anyway.

## 1.5 — "Include photos in export" toggle (deferred to Phase 5) ⏳

The export flow already supports password-encrypted backups
(`exportEncrypt`/`exportDecrypt` in `js/services/export.js`). The "exclude
photos" toggle changes the export UI + `exportAll` signature and touches the
backup envelope; the plan places it with the Settings/data work. Deferred to
keep this phase's risk surface to encryption + secrets + headers.

---

## Verification summary (Phase 1)

- `npm test` — 15 suites, exit 0
- `npm run build` — `sw.js ?v=` tokens match `index.html`
- Browser checks (Playwright): seeded appointment PII ciphertext at rest;
  AI secret session-only; zero page errors
- Cache bump: `advisoros-v6-38`; changed assets `?v=` incremented
