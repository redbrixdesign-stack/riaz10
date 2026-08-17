# Beelo — Phase 4 (UX & Visual System) Execution Log

Phase 4 of the release-fix plan (P1). Each item verified in browser
(Playwright) and committed with the rest of Phase 4.

## 4.1 — Button hierarchy ✅ (primary CTA strengthened)

The app already had a full variant set (`.btn-primary`, `.btn-secondary`,
`.btn-outline`, `.btn-ghost`, `.btn-danger`, `.btn-sm/.btn-lg/.btn-block`),
all ≥44px min-height. The audit's real issue was that primary and outline
read as equal weight: `.btn-primary` was a dark fill with only a gold
*border*. Per the design system (gold = brand + primary CTA):

- `.btn-primary` is now **gold-filled** (`--accent` background, `--accent-contrast`
  text). Black-on-gold measures 11.4:1, so the label stays WCAG AA at 15px.
  Verified: Visits "Add visit" renders `rgb(253,185,19)` on
  `rgb(10,10,10)`.
- One primary CTA per context confirmed across screens (Visits "Add visit",
  Money actions, Orders sheets, forms in sheets) — multiple primaries remain
  where each is genuinely contextual (forms/sheets), which matches real
  workflows better than a forced single CTA.

## 4.2 — Spacing scale ⚠️ (deliberately minimal)

Audited every margin/padding value. The app's margin utilities
(`.mt-10/.mt-20/.mt-28/.mb-14/...`) are **self-consistent** (every `.mt-20`
is 20px) and live on a near-token scale (2/6/10/12/14/20/28px vs tokens
4/8/12/16/24/32). Blanket-normalising 46 call sites across 15 files would be
visual churn with real regression risk and little user benefit, so it was
**not** done in this pass. The audit's "inconsistent spacing" complaint was
primarily about the pre-redesign screens (deep card nesting, mixed section
gaps), which the Home redesign already flattened. Recorded as a P2 polish
item: normalise the utility classes to the 4/8/12/16/24/32 scale when the
screens are next touched for design work.

## 4.3 — Bottom-nav overlap on sheets ✅

`.sheet-body` previously padded only `var(--safe-bottom)` (iOS home
indicator), so sheet content could scroll behind the fixed bottom nav.
Verified before the fix: My Day sheet body extended past the nav (1722px vs
nav top 780px). Fixed:

- `.sheet-body` bottom padding now `calc(var(--space-md) + var(--safe-bottom)
  + var(--nav-height))` — the sheet overlays the nav, so it needs to clear it.
- Verified after: sheet chrome ends exactly at nav top (717px of an 844px
  viewport), and the **last actionable element** ("Back to Beelo") sits at
  764px — above the nav — when fully scrolled.

## 4.4 — Card nesting ✅ (already flattened)

The audit's 3+-level nesting examples were all pre-redesign (companion-inside-
today, etc.). Current Home is the companion feed directly; Money and Orders
render flat cards. No 3-level nesting remains in the reviewed screens; no
change needed.

## 4.5 — Terminology consistency ✅

- "Talk" → **"Messages"** (screen title, feature name, and the Follow-ups
  "Quick opens" button). The screen drafts WhatsApp/SMS messages; "Talk" was
  ambiguous with the Home companion. Internal id stays `talk` so routing and
  tests are unaffected (no test referenced the old label).
- "Customer 360" is consistent (header + screen title); "Follow up on quote"
  is the action label. No "Chase Quote" remains in the current code.

## 4.6 — Inline-handler refactor (deferred to a dedicated phase) ⏳

**Scope measured:** 337 inline `onclick/onchange/oninput/onblur/...` handlers
across 19 source files (largest: appointments 104, money 38, settings 37).
Removing `'unsafe-inline'` from the CSP `script-src` requires migrating every
one to delegated listeners — there is no partial win: any remaining inline
handler forces `unsafe-inline` to stay.

This is a security refactor with its own test surface (every tap/change/input
path), not a visual-system item, and the plan itself flagged it as "a separate
job". Doing it in the same commit as visual changes would bury regressions.
**Decision:** ship 4.1–4.5 now; run 4.6 as its own phase with per-feature
migration + test runs (start with onboarding/home-screen-controller/today at
~22 handlers, then followups/control, then the large feature files). Until
then the CSP header keeps `'unsafe-inline'` (the HTML meta CSP already
documents this).

## Verification summary (Phase 4)

- `npm test` — 15 suites, exit 0
- `npm run build` — `sw.js ?v=` tokens match `index.html`
- Browser checks: gold primary renders (rgb(253,185,19)); sheet last element
  clears the nav (764 < 780); "Messages" rename present with no stray "Talk"
- All 9 browser suites green (seed, viewport, home-week, my-day, next-tap,
  next-date + boundary, safearea, fixes)
- Cache bump: `advisoros-v6-40`; `core.css?v=25`, `components.css?v=29`,
  `talk.min.js?v=16`, `followups.min.js?v=7`
