# Beelo — Phase 5 (Performance & PWA Readiness) Execution Log

Phase 5 of the release-fix plan (P1/P2). Each item verified in browser
(Playwright) and committed with the rest of Phase 5.

## 5.1 — Self-hosted fonts (drop Google Fonts entirely) ✅

**Before:** Hanken Grotesk + JetBrains Mono loaded from Google Fonts via a
non-render-blocking preload-as-style + `<noscript>` fallback, with two
`preconnect` hints. That meant 2–5 cross-origin requests, third-party
dependencies for the primary UI font, and a font CSS file that the service
worker had to special-case (stale-while-revalidate against
fonts.gstatic.com) to work offline.

**After:**

- Downloaded the **variable** WOFF2s (one file per unicode-range subset
  covers every weight — verified via fontTools: Hanken Grotesk wght
  100–900, JetBrains Mono wght 400–800) into `assets/fonts/`:
  `hankengrotesk-latin.woff2` (34KB), `hankengrotesk-latinext.woff2`
  (19KB), `jetbrainsmono-latin.woff2` (31KB).
- `css/core.css` declares the three `@font-face` blocks with
  `font-display: swap` and the full variable weight ranges; the latin-ext
  face covers European name accents. Family names unchanged, so no CSS
  call-site edits were needed.
- `index.html`: removed both preconnects, the Google Fonts preload-as-style
  and the noscript fallback; added preloads for the two UI fonts (icon font
  was already preloaded).
- **CSP tightened** (meta tag + `vercel.json` header): `font-src 'self'`
  and `style-src` no longer lists fonts.googleapis.com — zero Google Fonts
  origins remain in the policy.
- `sw.js`: the fonts are now plain same-origin precache assets; the entire
  `FONT_ORIGINS` / `advisoros-fonts-1` stale-while-revalidate block was
  deleted (dead code), and `activate` now deletes every cache except the
  current one.

**Verified (`tests/browser/verify-fixes.js`, strengthened):** blocking
fonts.googleapis.com + fonts.gstatic.com changes nothing — zero Google
Fonts requests reach the page, icon and body fonts render from local
assets, and the true-offline (SW precache) reload renders everything.

### Latent build bug found & fixed (pre-existing, shipped in v41)

`npm run build` failed on `js/features/onboarding/onboarding.js` — a nested
`${...}` inside `${JSON.stringify([...])}` (line 59, `data-args` for the
weekly-target presets) left by the Phase 4.6 migration. Consequences:

- The shipped `onboarding.min.js` was **stale** (built from pre-4.6 source
  with inline handlers) while the v41 CSP removed `'unsafe-inline'` — so
  onboarding buttons were dead in production.
- Fixed the template artifact, regenerated the bundle, bumped
  `onboarding.min.js?v=6→7`.
- Added `tests/browser/verify-onboarding.js` (previously zero browser
  coverage for onboarding): fresh profile lands on onboarding, all four
  £-presets carry valid `data-args` JSON with zero inline handlers, clicking
  £600 updates the target, no CSP/runtime errors.

## 5.2 — Lazy-load Tesseract (OCR engine) ✅

**Before:** `OCRFeature.init()` injected the ~1MB Tesseract script from
unpkg at **app boot**, for every user, whether or not they ever open Scan
(and most scans use Claude AI, not Tesseract).

**After:** Tesseract now loads in `activate()` — the first time the user
opens the Scan screen — and `processImage` waits up to 30s (with a
"Preparing OCR engine…" status line) instead of 3s, so a cold CDN fetch
during first use doesn't time out into manual entry.

**Verified (`tests/browser/verify-lazyocr.js`):** zero Tesseract fetches
during boot + 2.5s settle; opening Tools → Scan triggers the unpkg fetch;
the Scan screen renders.

## 5.3 — Compression headers (Vercel) ✅ verification-only

Vercel already serves **Brotli** for HTML/JS/CSS (confirmed against
beelo.beelestial.co.uk: `content-encoding: br` on both the document and
`app.min.js`), and WOFF2 is already compressed so it must not be
re-compressed. No config change needed — recorded as verified.

## 5.4 — Install prompt (custom "Add to Home Screen" hint) ✅

New `js/core/install-prompt.js` (+ whitelisted in the delegated router's
`ACTION_OBJECTS` so its buttons work under the strict CSP):

- Captures `beforeinstallprompt` (Chrome/Android), suppresses the native
  prompt, and shows a single **companion-style bottom sheet** ~12s after the
  user settles on Today.
- **iOS Safari** (majority of the target users) has no such event: the same
  sheet shows the three-step Share → Add to Home Screen instructions.
- Never shown: while onboarding, when installed/standalone, when another
  sheet is open, or when the user is anywhere but Today (bounded retries).
- "Not now" suppresses for 30 days; a real install (`appinstalled`) hides it
  permanently; the sheet is focus-trapped with the standard modal path, so
  accessibility behavior is identical to other sheets.

**Verified (`tests/browser/verify-install-prompt.js`):** Android capture →
sheet → native prompt invoked → hides on accept; iOS instruction sheet;
30-day dismissal survives reload; onboarding is never interrupted; no CSP
violations.

## 5.5 — Leaflet marker CSP + offline strip hardening ✅

### Marker icons self-hosted

Leaflet's default marker icons resolve against its own script path on
unpkg (`dist/images/marker-icon.png`), which `img-src` blocked — markers
failed with CSP violations in the console. Fixed by shipping
`assets/img/marker-icon{,-2x}.png` + `marker-shadow.png` and pointing
`L.Icon.Default.imagePath = ''` with absolute same-origin URLs (a relative
URL alone still resolves against unpkg — caught by the verification).

**Verified (`tests/browser/verify-map-csp.js`):** zero marker-image
requests to unpkg, icons fetched same-origin, zero CSP image violations.

### Offline strip now triggers on real network failure

`navigator.onLine` can report **true** while the network is actually dead
(flaky WiFi, captive portals — and it stays true across an offline reload
served by the SW). The persistent offline banner only answered
`navigator.onLine`, so it could stay hidden in exactly the case it exists
for. Now:

- When the service worker falls back to cache because the network failed or
  stalled (the 6s timeout), it posts `{ type: 'beelo-offline' }` to its
  window clients (delayed 1s so the freshly-navigated client exists).
- `app.js` flips the banner on that message (and shows a toast when
  `navigator.onLine` still says online), and clears on the `online` event.

**Verified (`tests/browser/verify-offline-banner.js`):** hidden online,
appears on `offline`, clears on `online`, and appears at boot for a fresh
offline launch served by the SW.

## Regression

- Unit suites: `npm test` — **0 failures** (incl. the fixed pre-existing
  stub drift in `tests/ocr.test.js`: three `findExistingVisit` assertions
  were asserting against an outdated stub shape and always failed).
- Browser suites: verify-fixes, verify-onboarding, verify-lazyocr,
  verify-install-prompt, verify-map-csp, verify-offline-banner, verify-title,
  verify-nexttap, verify-myyday, verify-home-week, verify-safearea,
  verify-viewport.pw, verify-next-date, verify-next-date-boundary,
  companion-nav.e2e, ocr-save.e2e, features.e2e, run.js (legacy migration)
  — **all pass**.
- Review screenshots + canvas regenerated with the new typefaces
  (`screenshots/review/`).
- **Pre-existing, out of scope:** `verify-seed.pw.js` "Next" state flake —
  reproduces identically on the pre-change commit (documented in Phase 4.6).
  The install-prompt hint was made test-mode-inert (`advisoros_enc_test=1`)
  so it can't trip "no modal layers" assertions in the long journey suites.

## Cache versioning

`CACHE_NAME` → `advisoros-v6-42`; `core.css?v=26`; `app.min.js?v=12`;
`ocr.min.js?v=20`; `route.min.js?v=11`; `onboarding.min.js?v=7`;
`install-prompt.min.js?v=1` — tokens matched between `index.html` and
`sw.js` (build verifies).
