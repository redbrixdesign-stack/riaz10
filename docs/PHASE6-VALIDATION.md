# Beelo — Phase 6 (Validation & Launch) Execution Log

Phase 6 of the release-fix plan: full regression, automated accessibility
audit, Lighthouse CI, production deploy, post-deploy verification, and a
re-scored release verdict. Each item verified and committed.

## 6.1 — Full regression on the final tree ✅

- `npm test` — 0 failures (15 suites).
- 18 browser suites green: verify-fixes, verify-onboarding, verify-lazyocr,
  verify-install-prompt, verify-map-csp, verify-offline-banner, verify-title,
  verify-nexttap, verify-myyday, verify-home-week, verify-safearea,
  verify-viewport.pw, verify-next-date, verify-next-date-boundary,
  features.e2e, companion-nav.e2e, ocr-save.e2e, run.js (legacy migration).
- Known pre-existing flake unchanged: `verify-seed.pw.js` "Next" state
  (reproduces identically on the pre-change commit; documented in 4.6/5).

## 6.2 — axe-core WCAG 2.2 AA sweep (16 screens) ✅

New `tests/browser/axe-sweep.js` runs axe-core 4.13 (wcag2a/2aa/22aa) on
every screen and modal of the seeded real app. Baseline: **16 serious/
critical violations**. All fixed:

1. **CRITICAL — form controls without accessible names** (Add Visit:
   `#appt-date`, `#appt-time`, `#appt-duration`, `#arrival-window`; Expense
   modal: `#expense-category`). Root cause: the app's forms use a loose
   "label next to control" pattern — **101 `<label>`s, zero `for`
   attributes, zero wrapping** (axe `label`/`select-name`).
   Fix: `App._associateLabels(root)` — runs after every render
   (`finalizeNavigation` + `openModal` + `openFullModal`) and links each
   label to the control that immediately follows it. This fixes **every**
   form in the app, including screens the sweep didn't open.
2. **SERIOUS — invisible Settings rows**: plain `<button class="card">`
   kept the UA button colour (black) on the dark card. `button.card` now
   inherits `--text-primary` + font + alignment.
3. **SERIOUS — contrast on `--secondary` (#4f6a2f, ~3:1 on dark)** used as
   *text* (Money figures, visit values, kanban actions). New token
   `--success-text: #9DBF6E` (9:1 on surface) applied to `.text-success`,
   `.visit-value`, `.stat-card .change.positive`, `.kanban-card-action`.
4. **SERIOUS — contrast on `--danger` (#C0563F, 4.1:1 at 18px bold)**.
   New token `--danger-text: #E0876F` (7:1) applied to `.text-danger`,
   `.stat-card .change.negative`.
5. **SERIOUS — `.badge-danger`**: danger-on-danger-tint. Now
   `color: var(--danger-light)` (12.3:1 on the tint).
6. **SERIOUS — follow-ups muted cards used `opacity: 0.65` on the whole
   card**, dimming every token below 4.5:1 (measured 2.96:1). Replaced
   with a solid `fup-card--muted` background — text tokens stay full
   strength. Same latent bug fixed for `.hsc-week-row.done` (opacity
   0.55 → solid dim).
7. **SERIOUS — nested-interactive + target-size on kanban cards**:
   appointment cards were a `<button>` containing `role="button"` spans.
   Restructured to a container with a real main button (card navigation)
   and real action buttons (Follow up / Visit) — no nesting; actions are
   ≥28px targets. Same for the order-sheet customer row (profile button +
   Message button side by side).

**Result: 0 serious/critical, 0 moderate/minor across all 16 screens**
(Home, Follow-ups, Orders, order sheet, Money, expense modal, Tools,
Visits diary, Add Visit, Customer 360, Route, Messages, Measure, Scan,
Settings, Onboarding).

**Accepted, documented exception**: axe `target-size` on Leaflet map pins
when pins overlap — pin position *is* the map data (WCAG 2.5.8 "essential"
exception); pins are 28–30px and the Route screen provides a full textual
stop list as the alternative. Allowlisted in the sweep with this note.

## 6.3 — Lighthouse audit ✅

Baseline vs after-deploy (mobile, live first-run experience — the
passphrase sheet is Beelo's real first paint):

| Category        | v41 (baseline) | v6 (after deploy) |
|-----------------|----------------|-------------------|
| Performance     | 80             | 79  (run noise)   |
| Accessibility   | 95             | 95                |
| Best practices  | 96             | 96                |
| SEO             | 91             | 91                |

`lighthouserc.js` asserts floors (perf ≥ 0.7, a11y/bp/seo ≥ 0.9, viewport
= 1) — **passing against the live site**. Lighthouse 12+ removed the PWA
category/audit IDs; installability is instead gated by the live smoke test
(SW install + offline shell + icons + manifest.json 200). npm scripts
`lhci:audit` / `lhci:upload` added; `.github/workflows/lighthouse.yml`
runs the audit weekly + on demand.

## 6.4 — Production deploy ✅

`vercel --prod` on the **beelo1** project (owns beelo.beelestial.co.uk).
Added `.vercelignore` (node_modules, deepseek-harness, tests, screenshots,
docs) — the first attempt uploaded 7,671 files/25.9MB because
deepseek-harness was included; after ignoring, the static payload is ~2.5MB.

## 6.5 — Post-deploy verification ✅

`tests/browser/verify-live.js` against the live site:
- App boots; **zero Google Fonts requests** (all fonts self-hosted);
  icon + body fonts render from local assets.
- Security headers live: CSP (`font-src 'self'`, no unsafe-inline in
  script-src), HSTS, nosniff, Referrer-Policy, X-Frame-Options DENY,
  Permissions-Policy.
- SW installs, controls the page, and serves the full app shell **offline
  with the offline strip and glyph icons**.

## Re-scored audit & release verdict

Original audit: **6.2/10 — "Conditionally ready – fix P0 first"**.

| Dimension   | Audit | Now | What changed |
|-------------|-------|-----|--------------|
| Product fit | 7.5   | 7.5 | unchanged (companion principle held) |
| UX          | 4.5   | 6.5 | Phase 4: nav overlap, CTA, spacing, Home redesign |
| Visual      | 6.5   | 7.5 | Phase 4 tokens/contrast, Phase 5 typefaces |
| Accessibility | 3.5 | 7.5 | Phases 3+6: axe 0 serious/critical on 16 screens; real-device SR pass still outstanding |
| Performance | 7.0   | 8.0 | self-hosted fonts, lazy OCR, Brotli, 685KiB total |
| Security    | 5.5   | 8.0 | Phase 1: AES-GCM+PBKDF2, strict CSP, headers; no pentest yet |
| PWA         | 8.0   | 9.0 | install prompt, SW offline signal, offline banner verified live |
| Ops         | 4.0   | 6.0 | LHCI + live smoke test + reproducible deploy; no error tracking/analytics yet |
| Legal (UK/EU) | 4.0 | 4.0 | **Phase 2 not done** — privacy policy, terms, consent, company details, data-deletion flow |
| GTM         | 3.5   | 4.5 | install prompt ships; no marketing site/launch plan |

**New verdict: 7.1/10 — "Ready for controlled launch; public launch gated
on Phase 2 (legal)".** Technical readiness is launch-grade (0 axe
serious/critical, PWA verified live, security posture strong). The
remaining blockers before a *public* marketing launch are legal, not
technical: privacy policy / terms pages, consent banner, company details
in the footer, and the data-deletion flow (Phase 2). A private/beta launch
with the current stack is defensible for real-world testing, provided
Phase 2 lands before any public promotion.

## Launch checklist (remaining P2s)

- [x] axe sweep gate (16 screens) — CI-able
- [x] Lighthouse gate + weekly CI
- [x] Live smoke test incl. offline + installability assets
- [x] Deploy pipeline reproducible (vercel CLI, .vercelignore)
- [ ] **Phase 2 legal pages + consent (P0 pre-public-launch)**
- [ ] Real-device screen-reader pass (iOS VoiceOver)
- [ ] Error tracking + support contact (ops P2)
- [ ] Lighthouse/GitHub Actions wiring verified on a real push (run once
      post-merge)

## Versioning

`CACHE_NAME` → `advisoros-v6-43` (STATIC_ASSETS changed); asset
tokens bumped for the a11y fixes: `core.css?v=28`, `components.css?v=31`,
`app.min.js?v=13`, `followups.min.js?v=9`, `orders.min.js?v=8` — tokens
matched (build verifies).
