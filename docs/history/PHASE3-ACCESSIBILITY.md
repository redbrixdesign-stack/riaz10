# Beelo — Phase 3 (Accessibility) Execution Log

Phase 3 of the release-fix plan (WCAG 2.2 AA focus). Each item verified in
browser (Playwright) and committed with the rest of Phase 3.

## 3.1 — Colour contrast ✅

Measured every token pair and every opacity-dimmed element numerically
(relative-luminance ratios, WCAG 1.4.3). Results:

- **Text tokens already pass:** primary 16.5:1, secondary 10.4:1, tertiary
  5.3:1 on `--surface`; accent-contrast (black) on gold 11.4:1. (The earlier
  audit's "3.9:1 / 2.1:1 failures" were computed against the retired mock's
  tokens, not the real app tokens — no change needed.)
- **Real failures were opacity-dimmed text** (opacity composes the bg into
  the fg, destroying contrast). Fixed by solid recolour:
  | Element | Before | After |
  |---|---|---|
  | `.calendar-cell-muted` | text-tertiary @ 0.5 → **2.2:1** | solid `#A9A392` → **7.4:1** |
  | `.comp-toggle-label.disabled` | text @ 0.45 → **4.1:1** | solid `#9B968A` → **6.4:1** |
  | `.comp-send:disabled` | gold @ 0.4 → **3.5:1** | muted bg + `--text-secondary` icon → **9.1:1** |
  | `.comp-home-week-day.past` | white @ 0.45 → **4.1:1** | solid muted num/label/count → **10:1** |
  | `.comp-home-visit.completed`, `.hsc-week-row.done` | @0.55 → 5.5:1 | already ≥4.5:1, left as-is |

## 3.2 — Focus visibility ✅

A global `:focus-visible { outline: 2px solid var(--accent) }` already existed.
Found three `outline: none` sites that suppressed it:
- `.search-bar input` → added `:focus-visible` outline
- `.comp-input` (companion composer) → added `:focus-visible` outline
- `.input/.select/.textarea` → kept border accent for pointer users, added
  `:focus-visible` outline for keyboard

## 3.3 — Touch targets ≥ 44px ✅

Measured every interactive element across Home/Visits/Money/Orders/Follow-ups/
Settings. Nearly everything was already ≥44px. One real gap:
- `.calendar-cell` measured 43px → added `min-height: 44px` (aspect-ratio
  keeps cells square; verified 44×44 in browser).

Visually-hidden toggle checkboxes (13px) are the standard accessible pattern —
the wrapping label is the actual target and is ≥44px, so no change needed.

## 3.4 — Semantic structure ✅

- Skip link added to the shell: `<a class="skip-link" href="#main">Skip to
  content</a>`, visually hidden until focused (WCAG 2.4.1).
- `#bottom-nav` gets `aria-label="Primary"` (nav landmark).
- `<main id="main">` landmark already present; single main confirmed.
- Nav items already carried `aria-label` (feature name).

## 3.5 — ARIA on dynamic components ✅

- **Modals**: `role="dialog"` + `aria-modal="true"` already present. Added a
  **focus trap** (`App.trapFocus` — Tab/Shift+Tab stay inside the dialog,
  WCAG 2.1.2/2.4.3) and **focus restore** on close (returns to the opener).
  Verified: Tab on the last focusable wraps to the first; closing returns
  focus to the triggering input.
- **Tabs (Visits screen)**: `role="tablist"/"tab"` + `aria-selected` +
  `aria-controls`; `switchTab` now syncs `aria-selected` and moves focus to
  the panel; arrow-key/Home/End navigation (WAI-ARIA tabs pattern). Verified:
  ArrowRight moves Diary→Upcoming.
- **Toasts**: container gets `role="status"` + `aria-live="polite"` so
  messages are announced without interrupting speech (WCAG 4.1.3).

## 3.6 — Reduced motion ✅

`@media (prefers-reduced-motion: reduce)` uses a universal selector
(`* { animation-duration: 0.01ms !important; transition-duration: 0.01ms
!important }`), which already covers every animation including the trip
banner, bottom-sheet slide, and companion idle pulse. Verified the rule is
present; no additions needed.

## Verification summary (Phase 3)

- `npm test` — 15 suites, exit 0
- `npm run build` — `sw.js ?v=` tokens match `index.html`
- Browser checks (Playwright): skip link, nav label, tab roles + arrow keys,
  modal focus trap + restore, 44×44 calendar cells, muted-cell contrast 7.4:1,
  reduced-motion rule — all pass, zero page errors
- All 9 browser suites green (seed, viewport, home-week, my-day, next-tap,
  next-date + boundary, safearea, fixes)
- Cache bump: `advisoros-v6-39`; `core.css?v=24`, `components.css?v=28`,
  `app.min.js?v=10`, `appointments.min.js?v=25`
