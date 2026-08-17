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

## 4.6 — Inline-handler refactor ✅ (CSP 'unsafe-inline' removed)

**Goal:** every interactive element migrated from inline `onclick/onchange/
oninput/onblur/onkeydown` to a delegated router, so `'unsafe-inline'` can be
dropped from `script-src` — closing the XSS-via-on*-attribute injection
vector.

**Design (`js/core/app.js` `setupEvents`):** a document-level delegated
router with a **whitelist** of known globals (App + every feature object +
Geo/Contact/ExportService). Elements carry:
- `data-action="Object.method"` + `data-args` (JSON array, evaluated at
  render via `JSON.stringify`)
- `data-key="Enter, space"` — keydown gate (was `if(event.key===...)`)
- `data-close="1"` — close modal then run (was `App.closeModal();...`)
- `data-stop="1"` — stopPropagation before run
- `data-file="inputId"` — click a hidden file input
- `data-close-backdrop="1"` / `data-stop-propagation="1"` — modal shell
- `App.actionAttrs(callString)` — converts data-built handler strings
  (companion actions, customer timeline) to router attributes at render.

No `eval` anywhere: the router resolves `ACTION_OBJECTS[name][method]` and
calls with JSON-parsed args, so injected attributes are inert.

**Migration:** ~380 inline handlers across 19 files converted (script-
assisted for the repetitive patterns, then hand-fixed for compound/keydown/
file-trigger cases). Two systematic bugs were caught and fixed during
verification:
1. Nested `${...}` inside `JSON.stringify([...])` (invalid template syntax)
   — inner expressions rewritten to plain references.
2. Quoted `"(expr)"` artifacts — `"${x}"` args must be unquoted so
   JSON.stringify evaluates them; a DOM sweep across every screen found and
   fixed all of them (14 final).

**CSP:** `'unsafe-inline'` removed from `script-src` in both the HTML meta
CSP and the `vercel.json` header. `style-src` keeps `'unsafe-inline'`
(inline styles remain) — the security win is on script execution.

**Verified:**
- 0 inline handlers remain in source (grep across all non-min JS).
- 0 `data-args` paren artifacts across all screens (DOM sweep).
- Full interaction sweep under strict CSP: NEXT card→detail, My Day modal,
  week arrows, companion send, settings section nav, orders sheet, measure
  fitting type, talk template pick — all dispatch correctly, zero errors.
- All 9 browser suites + unit suite green; `verify-nexttap.js` updated to
  assert `data-action`/`data-args` instead of inline `onclick`.
- Cache bump: `advisoros-v6-41`.

## Verification summary (Phase 4 + 4.6)

- `npm test` — 15 suites, exit 0
- `npm run build` — `sw.js ?v=` tokens match `index.html`
- Browser checks: gold primary renders; sheet clears the nav; "Messages"
  rename; **strict-CSP interaction sweep passes with 0 inline handlers**
- All 9 browser suites green
- Cache bumps: Phase 4 `v6-40`; 4.6 `v6-41` (18 JS assets re-tokenised)
