# Beelo — Data Protection & Security Audit

> **Audit date:** August 2025  
> **App version:** 5.0  
> **Scope:** Customer data, backup/restore, AI, external requests, device loss recovery

---

## Executive Summary

Beelo is a **local-first** application: all customer data lives in IndexedDB (via Dexie) on the device. The only external calls are **opt-in AI requests** (via a serverless proxy holding the Anthropic API key) and **third-party services** for geocoding, routing, and weather. No analytics, tracking, or telemetry.

**No encryption at rest.** IndexedDB and localStorage are unencrypted. A backup file is a plain JSON file.

---

## 1. BACKUP & RESTORE

### What the backup contains (`js/services/export.js`, `js/core/db.js`)

| Table | Included | Notes |
|-------|----------|-------|
| `customers` | ✅ | All fields incl. `firstName`, `lastName`, `phone`, `email`, `address`, `customerNumber` |
| `appointments` | ✅ | Incl. `date`, `type`, `status`, `outcome`, `value`, `commission`, `notes`, `latLng` |
| `orders` | ✅ | Incl. `orderNumber`, `total`, `depositRequired`, `depositPaid`, `balanceDue`, `stage` |
| `expenses` | ✅ | Incl. `amount`, `category`, `description`, `photo` (base64), `tripId` |
| `trips` | ✅ | Incl. `distanceKm`, `startLocation`, `endLocation`, `purpose`, `autoTracked` |
| `measurements` | ✅ | Incl. `windowName`, all width/drop/diagonal values, `fittingType`, `tolerance`, `photos` |
| `communications` | ✅ | Incl. `type`, `template`, `content`, `sentAt` |
| `photos` | ✅ | Base64 data URLs (downscaled JPEG) — **included in backup** |
| `settings` | ✅ | All CONFIG keys **except** runtime flags (`__v6_legacy_migrated__`, `__storage_probe__`, `pitchDemoSeeded`) |
| `sequences` | ✅ | Customer/order numbering counters |

### Backup envelope (`exportBackup()`)

```json
{
  "backupFormatVersion": 1,
  "databaseSchemaVersion": 2,
  "appVersion": "5.0",
  "version": "5.0",                    // legacy field
  "exportedAt": "2025-08-15T...",
  "config": { ...sanitized CONFIG... }, // AI secret REMOVED
  "data": { ...all tables... }
}
```

### Secrets handling

- **AI proxy secret** (`CONFIG.ai.secret`) is **stripped** from backup (`_sanitizeConfig()`).
- Import **never overwrites** the device's AI secret — it merges backup config but preserves `CONFIG.ai.secret`.
- No other secrets (API keys, tokens) exist in CONFIG.

### Restore atomicity (`DB.importAll()`)

| Engine | Mechanism | Rollback on failure |
|--------|-----------|---------------------|
| Real Dexie | Single `db.transaction('rw', ...)` across all 10 tables | Automatic — transaction aborts, old data intact |
| Mini-Dexie shim | Snapshot → clear → bulkAdd → rollback on error | Best-effort snapshot restore (not truly atomic) |

**Failed restore leaves existing data intact** — validated by tests (`storage.test.js`).

### Versioning & compatibility

| Field | Purpose |
|-------|---------|
| `backupFormatVersion` | File layout version (currently 1) |
| `databaseSchemaVersion` | DB schema at export time (currently 2) |
| `version` / `appVersion` | Legacy/app version |

**Compatibility rules:**
- Format 1 = current exports
- Legacy `version` "4.0" or "5.0" accepted (old exports without photos/settings/sequences)
- Future format > 1 **rejected** with clear error
- Old format < 1 **rejected** with clear error

### Validation (`_validateBackup()`)

Every import is fully validated **before any write**:

1. All tables present and arrays
2. Record shapes, primary key types, no duplicate PKs
3. Cross-table FK integrity: `appointment.customerId → customers`, `order.customerId → customers`, `order.appointmentId → appointments`, `measurement/trip/communication/photo → appointments/customers`
2. Date parsing on all date fields
3. Photo records must have non-empty base64 `data`
4. Sequence counters guarded: never lowered below imported max

**Invalid backup → rejected wholesale, no partial import.**

### Photos in backup

- Stored as **base64 JPEG** (downscaled to ≤1400px, quality 0.85)
- Included in `exportAll()` → part of backup
- Restored on import → reconstructs customer gallery

### Duplicate sequence protection

- `_guardSequences()` raises sequence counters to cover highest imported `customerNumber` / `orderNumber`
- Uses same `CUS-YYYY-####` / `ORD-YYYY-####` pattern as live numbering
- Never lowers existing counter

### P0/P1 Issues Found

| Issue | Severity | Evidence |
|-------|----------|----------|
| **No encryption at rest** | P1 | IndexedDB + localStorage unencrypted; backup file is plain JSON |
| **Photos in backup = large files** | P2 | Base64 photos inflate backup size; no option to exclude |
| **Mini-Dexie restore not truly atomic** | P2 | Snapshot rollback can theoretically fail (e.g. storage full mid-rollback) |
| **No backup encryption option** | P2 | Exported JSON readable by anyone with file access |

---

## 2. PRIVACY — DATA FLOWS

### LOCAL ONLY (never leaves device)

| Data | Storage | Notes |
|------|---------|-------|
| Customer records (name, phone, email, address, postcode, notes) | IndexedDB `customers` | |
| Appointments (dates, types, outcomes, values, notes, coords) | IndexedDB `appointments` | |
| Measurements (window dimensions, photos) | IndexedDB `measurements`, `photos` | Photos = base64 in IndexedDB |
| Orders (totals, deposits, balances, stages) | IndexedDB `orders` | |
| Communications (WhatsApp/SMS drafts, timestamps) | IndexedDB `communications` | Content stored; **never sent** by app |
| Expenses & trips (mileage) | IndexedDB `expenses`, `trips` | |
| Settings / CONFIG | localStorage + IndexedDB `settings` | AI secret in localStorage only |
| Error log | localStorage `advisoros_error_log` (ring buffer, 50 entries) | No customer data — only error name/message/stack |
| Active trip (GPS path) | localStorage `advisoros_active_trip` | Cleared on trip finish |
| Geocode cache | localStorage `advisoros_geocode_v1` (250 entries, 30-day TTL) | Postcode → lat/lng only |

---

### REMOTE REQUESTS

| Service | Endpoint | Data Transmitted | Customer Identity | Minimisation |
|---------|----------|------------------|-------------------|--------------|
| **AI Proxy** | `https://<project>.vercel.app/api/claude` → `api.anthropic.com` | **OCR:** base64 image + fixed prompt<br>**Receipt:** base64 image + fixed prompt<br>**Draft:** `draftContext` JSON (customer name, appt date/time, quote value, measured windows, order summary, recent messages, ETA, parking/access notes)<br>**Assistant:** `snapshot` (today's visits, week money, month expenses, follow-ups, next visit, weather) + `turnText` + `history`<br>**Route:** advisor question text only | **OCR/Receipt:** Image may contain customer name/address/phone — **sent**<br>**Draft:** `customer_name` (first name only), `address` (line1 only), `phone` **NOT sent**, `email` NOT sent<br>**Assistant:** Snapshot includes customer first names, visit details, order summaries — **no phone/email/postcode** | **OCR:** Image required — cannot minimise further<br>**Draft:** Explicitly excludes street address, postcode, lead source, email, full phone<br>**Assistant:** Snapshot built by `buildAiContext()` — deliberately omits street address, postcode, lead source |
| **Geocoding** | `nominatim.openstreetmap.org` | Free-text address or postcode | Full address sent to OSM | Postcode-only fallback tried first; no customer name sent |
| **Routing** | `router.project-osrm.org` | Lat/lng pairs only | No customer data | No identity data |
| **Weather** | `api.open-meteo.com` | Lat/lng only | No customer data | Uses business base coords (not live GPS) |
| **WhatsApp/SMS** | `wa.me` / `sms:` URLs | Message text + phone number | Phone number in URL | Opens native app — app never sees message content |
| **Map tiles** | `tile.openstreetmap.org` | Tile requests (x/y/z) | No customer data | Standard OSM tiles |

### AI Data Minimisation Details

**Draft context (`buildAiContext` + `buildMessageContext`):**

| Field | Sent? | Notes |
|-------|-------|-------|
| `customer_name` | ✅ | First name only |
| `address` | ✅ | Line 1 only (street) |
| `postcode` | ❌ | Explicitly excluded |
| `phone` / `email` | ❌ | Explicitly excluded |
| `lead_source` | ❌ | Explicitly excluded |
| `quote_value` / `outcome` | ✅ | Required for draft |
| `window_scope` / `blind_count` | ✅ | Measured windows only |
| `order_summary` / `balance_due` | ✅ | For payment reminders |
| `recent_messages` | ✅ | Last 4 sent by advisor only |
| `eta` / `delay` | ✅ | Only for `on_my_way` / `running_late` |
| `parking_notes` / `access_notes` | ✅ | From visit notes |
| `days_since_last_visit` | ✅ | |
| `supplierOrderNumber` | ✅ | Only for payment reminders |

**OCR/Receipt:** Image base64 sent (required). Fixed system prompt — no client-supplied instructions honoured.

**Companion (assistant):** `snapshot` includes today's visits, week money, month expenses, follow-ups, next visit, weather. **No phone/email/postcode/lead source.**

**Route classification:** Only the advisor's question text sent — no data.

---

## 3. AI SECURITY

### Architecture

```
Browser (PWA) → [HTTPS] → Vercel Function (api/claude.mjs) → [HTTPS] → api.anthropic.com
                    ↑
              Holds ANTHROPIC_API_KEY
              Enforces: ALLOWED_ORIGIN, AI_SECRET, rate limits
```

### Guarantees

| Property | Implementation |
|----------|----------------|
| **API key never in client** | Only in Vercel env var `ANTHROPIC_API_KEY` |
| **Proxy secret** | `AI_SECRET` in `X-AI-Key` header (shared secret; not true auth) |
| **Origin allowlist** | `ALLOWED_ORIGIN` required in production; fails closed if unset |
| **Rate limiting** | 120 req/min per client IP (in-memory, per-instance) |
| **Body limits** | 4 MB total, 100 KB per text field, 2 MB image |
| **Model allowlist** | Only 5 approved models; unknown → default |
| **Upstream endpoint fixed** | `https://api.anthropic.com/v1/messages` — client cannot influence |
| **Error sanitisation** | Provider error details never forwarded; generic messages only |
| **No request logging** | Proxy never logs bodies, prompts, API keys, customer data |
| **Timeout** | 60s upstream; abort → client gets `timeout` error |

### AI Trust Boundaries

| Boundary | Enforcement |
|----------|-------------|
| **AI cannot trigger actions** | All AI responses are `{nudge, draft_message}` or `{reply, suggestions}` — advisor must tap to send/open |
| **AI cannot write data** | No write paths from AI; all mutations via explicit advisor tap |
| **AI responses untrusted** | Parsers walk "ladder": direct JSON → fence-stripped → first `{...}` slice → raw text fallback |
| **Model output validated** | `suggestions` filtered against whitelist; `command` checked against allowlist |
| **No customer data in route/assistant prompts** | Verified in proxy: `route` gets only question text; `assistant` gets snapshot (no phone/email/postcode) |

---

## 4. PHOTOS

| Aspect | Implementation |
|--------|----------------|
| **Storage** | IndexedDB `photos` table: base64 JPEG (downscaled ≤1400px, quality 0.85) |
| **Local only** | Never uploaded unless advisor uses AI OCR/Receipt (explicit tap) |
| **In backup** | ✅ Included in `exportAll()` → `exportBackup()` |
| **In AI** | Only when advisor taps "Scan Document" (OCR) or "Scan Receipt" — explicit opt-in per photo |
| **Retention** | Tied to customer/appointment; deleted when customer deleted (`deleteCustomer()` cascades) |
| **Downscaling** | Client-side canvas → max 1400px long edge, JPEG 0.85 quality |
| **Raw fallback** | If downscaling fails, raw file sent (proxy rejects >2MB) |

**No silent uploads.** Every photo sent to AI requires explicit advisor action (Scan Document / Scan Receipt buttons).

---

## 5. DEVICE LOSS / DATA LOSS SCENARIOS

| Scenario | What Survives | Recovery Story |
|----------|---------------|----------------|
| **Phone lost/stolen** | **Only last manual backup file** (if advisor exported) | Advisor must have manually exported backup (Settings → Export Backup). No cloud sync. |
| **Browser data cleared** | **Only last manual backup file** | Same as above — manual backup required |
| **App uninstalled (PWA)** | **Only last manual backup file** | PWA uninstall clears IndexedDB + localStorage |
| **Device replaced** | **Only last manual backup file** | Advisor must manually transfer backup file (AirDrop, email, cable) and import (Settings → Import Backup) |
| **Backup file lost/corrupt** | **Nothing** | No cloud fallback; data gone |

**There is no automatic cloud backup.** The advisor **must** manually export (`Settings → Export Backup`) and store the `.json` file externally. This is by design (local-first, no cloud dependency).

### Recovery test checklist (for advisor)

- [ ] Export backup weekly (Settings → Export Backup)
- [ ] Store backup file off-device (iCloud Drive, Google Drive, email to self, USB)
- [ ] Test import on another device quarterly

---

## 6. STORAGE ARCHITECTURE SUMMARY

| Layer | Technology | Encryption | Scope |
|-------|------------|------------|-------|
| Primary DB | IndexedDB (Dexie v4) / mini-Dexie shim | ❌ None | All operational data |
| Config / flags | localStorage | ❌ None | CONFIG, flags, caches, error log |
| Service Worker cache | Cache API | ❌ None | Static assets (JS/CSS/HTML/fonts) |
| Backup export | JSON file (downloaded) | ❌ None | Full operational memory |
| Error log | localStorage (ring buffer, 50 entries) | ❌ None | Error name, message, stack (no customer data) |

---

## 7. P0/P1 ISSUES REQUIRING FIXES

| # | Issue | Severity | Recommended Fix |
|---|-------|----------|-----------------|
| 1 | **No encryption at rest** | P1 | Add optional AES-GCM encryption for IndexedDB (via `crypto.subtle`) + encrypted backup option |
| 2 | **No automatic/off-device backup** | P1 | Document clearly: "No cloud sync — you must manually export backup" |
| 3 | **Photos inflate backup, no exclude option** | P2 | Add "Include photos" toggle in export |
| 4 | **Mini-Dexie restore not atomic** | P2 | Document limitation; warn on import with shim |
| 5 | **Error log in localStorage unencrypted** | P2 | Low risk (no customer data), but consider encryption |
| 6 | **Geocode cache unencrypted** | P2 | Low risk (lat/lng only) |
| 7 | **AI proxy secret in localStorage** | P1 | Consider `sessionStorage` or prompt on each session |

---

## 8. WHAT THIS AUDIT DOES NOT CLAIM

- ❌ **GDPR compliance** — local storage helps, but no DPA, no DPIA, no breach notification process
- ❌ **Encryption at rest** — explicitly not implemented
- ❌ **End-to-end encryption** — AI proxy decrypts to call Anthropic
- ❌ **Automatic backup / cloud sync** — explicitly not implemented
- ❌ **Security audit / penetration test** — not performed
- ❌ **Incident response plan** — not documented

---

## 9. VERIFICATION CHECKLIST (for maintainers)

Run before each release:

```bash
npm test                    # All tests green (1 pre-existing unrelated failure)
npm run build               # 30/30 files built, sw.js versions match
```

Manual:
- [ ] Export backup → verify `.json` opens, contains all 10 tables + photos
- [ ] Import backup on clean device → all data restores, sequences guarded
- [ ] Corrupt backup (truncated JSON) → rejected with clear error
- [ ] Old backup (v4.0) → imports, missing tables treated as empty
- [ ] Future backup (format 2) → rejected with "update app" message
- [ ] AI disabled → no network requests to proxy
- [ ] AI enabled, no proxy URL → graceful degradation
- [ ] OCR scan → image sent, result parsed, no other data sent
- [ ] Draft message → context sent matches minimisation table above
- [ ] Companion chat → snapshot sent, no phone/email/postcode
- [ ] WhatsApp send → opens native app, message logged as `whatsapp_attempted`
- [ ] Device clear → only manual backup restores data

---

## 10. CHANGE LOG

| Date | Change |
|------|--------|
| 2025-08-15 | Initial audit document created |

---

**Document owner:** Product Owner (daily user)  
**Review cadence:** Before each release / quarterly