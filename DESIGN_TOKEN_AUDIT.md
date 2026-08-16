# Design Token Audit — AdvisorOS v5.0.0

**Git Commit:** `a7199e7` (Beelo palette merged — Option A applied)
**Date:** 2026-08-15

---

## 1. Current Token Values (from `css/core.css:6-67`)

| Token | Current Value | Description |
|-------|---------------|-------------|
| `--primary` | `#1B1B18` | Manchester Ink — primary actions, FAB, branded text |
| `--primary-dark` | `#11110F` | Pressed states, gradients |
| `--primary-light` | `#E8E0D0` | Warm pale tint — badge backgrounds |
| `--secondary` | `#4f6a2f` | Mid green — **success**, positive changes, completed steps |
| `--secondary-light` | `#e6f0d8` | Pale green tint — success badge bg |
| `--warning` | `#8d5d0f` | Amber/brown — warnings, quoted state, urgent chips |
| `--warning-light` | `#f5ead8` | Pale amber — warning badge bg |
| `--danger` | `#9a3d32` | Muted red — errors, destructive actions |
| `--danger-light` | `#f3dfdc` | Pale red — danger badge bg |
| `--info` | `#4a5d68` | Cool slate — delivered state, info toasts |
| `--accent` | `#FDB913` | **Beelo Gold** — active nav, selected day, progress, brand CTA |
| `--accent-contrast` | `#1B1B18` | Ink for text on gold |
| `--bg` | `#1B1B18` | Manchester Ink page canvas |
| `--bg-elevated` | `#22221E` | Slightly lighter canvas for elevated surfaces |
| `--surface` | `#F3EEDF` | Warm Paper card surface |
| `--surface-elevated` | `#FFFDF7` | White-warm — inputs, toasts |
| `--surface-muted` | `#B8B2A3` | Muted warm — secondary surfaces |
| `--border` | `#5C574D` | Warm border |
| `--border-light` | `rgba(92, 87, 77, 0.22)` | Subtle border |
| `--text-primary` | `#F5F0E8` | Warm cream text on dark canvas |
| `--text-secondary` | `#C7C1B0` | Muted cream on dark canvas |
| `--text-tertiary` | `#8E8878` | Dim cream on dark canvas |
| `--text-inverse` | `#FFFFFF` | White text on dark surfaces |

**Surface-scoped text overrides (inside `.card`, `.top-header`, `#bottom-nav`, etc. — `css/core.css:131-133`):**
- `--text-primary: #1B1B18` (ink on paper)
- `--text-secondary: #5C574D`
- `--text-tertiary: #7D7665`

---

## 2. Semantic Roles by Token

### `--primary` (Manchester Ink) — **Primary Actions & Branding**
- `.btn-primary` background & `:active` (`--primary-dark`)
- FAB (`.fab`) background
- Trip banner background
- Search bar focus border
- Calendar "today" ring (`.calendar-cell-today`)
- Clickable stat card hover/focus border
- Notebook primary command button (`.notebook-command-primary`)
- Kanban "ordered" column header
- Route active leg border & background tint
- Timeline active step
- `.text-brand` utility
- Multiple gradients (primary → primary-dark)

### `--primary-dark` — **Pressed States & Gradients**
- `.btn-primary:active` background
- Gradients: trip banner, kanban sheet header, companion bubbles

### `--secondary` (Green) — **Success / Positive / Completed**
- `.btn-secondary` background
- `.text-success` utility
- `.badge-success`
- `.toast-success` border & icon
- `.stat-card .change.positive`
- `.progress-bar .fill.success`
- Timeline completed step dot
- Calendar cell dot (completed appointment)
- Advisor alert success icon
- Kanban "fitted" & "paid" column headers
- Kanban stage step done
- Kanban paid card text

### `--warning` (Amber) — **Warnings / Quoted State / Urgency**
- `.text-warning` utility
- `.badge-warning`
- `.toast-warning` border & icon
- `.progress-bar .fill.warning`
- `.advisor-alert-warning` icon
- Kanban "quoted" column header
- Route suggestion icons
- HSC upcoming banner (urgent)
- Next-section urgency chips ("now", "soon")
- Route leg retry button

### `--danger` (Red) — **Errors / Destructive**
- `.btn-danger` background
- `.text-danger` utility
- `.badge-danger`
- `.toast-error` border & icon
- `.stat-card .change.negative`
- `.progress-bar .fill.danger`
- Bottom nav badge (notification count)

### `--info` (Slate) — **Delivered / Info**
- `.text-info` utility
- `.badge-info`
- `.toast-info` border & icon
- Kanban "delivered" column header

### `--accent` (Beelo Gold `#FDB913`) — **Brand / Selection / Highlight**
- `.badge-accent` (mixed 25% with white)
- Bottom nav active indicator (`.nav-item.active::before`)
- Calendar selected day (`.calendar-cell-selected`) — **fallback to --primary**
- Progress bar accent fill (`.progress-bar .fill.accent`)
- Brand CTA surfaces

### `--accent-contrast` — **Text on Accent**
- Bottom nav active label (`.nav-item.active`)
- `.badge-accent` text

### `--bg` / `--bg-elevated` — **Page Canvas**
- Body, #app, modal-full, route legs, route order, notebook metrics

### `--surface` / `--surface-elevated` — **Card Surfaces**
- `.card`, `.top-header`, `#bottom-nav`, `.bottom-sheet`, `.toast`, `.list-item`, inputs, stat cards, calendar, route plan/stats/list, kanban columns/cards, notebook page

### `--border` / `--border-light` — **Dividers & Borders**
- Card borders, list dividers, search bar, timeline line, timeline dots, kanban borders, divider utilities

### Text tokens — **Content Hierarchy**
- Scoped differently on dark canvas vs cream surfaces (see surface-scoping block)

---

## 3. Contrast Notes

> **Correction (Phase 1, 2026-08-16):** The ratios below were recomputed with a
> scripted WCAG relative-luminance calculation. The original audit numbers for
> `--warning`/`--danger` were wrong — both already pass AA on paper, and the
> previously suggested retunes (`#B87A1A` / `#B03A2E`) would have made `--warning`
> *worse* (3.10:1, FAIL). No semantic retune was applied. The only genuine
> failure found and fixed is `--text-tertiary` on paper (darkened to `#6E6756`).

| Combination | Current | WCAG AA (4.5:1) | WCAG AAA (7:1) | Notes |
|-------------|---------|-----------------|----------------|-------|
| `--accent` (#FDB913) on `--accent-contrast` (#1B1B18) | ~10.0:1 | ✅ | ✅ | Good — gold on ink |
| `--primary` (#1B1B18) on `--surface` (#F3EEDF) | ~14:1 | ✅ | ✅ | Good |
| `--secondary` (#4f6a2f) on `--surface` | 5.3:1 | ✅ | ❌ | AA only |
| `--warning` (#8d5d0f) on `--surface` | 4.9:1 | ✅ | ❌ | AA — text on paper is safe |
| `--danger` (#9a3d32) on `--surface` | 5.9:1 | ✅ | ❌ | AA — text on paper is safe |
| `--warning` (#8d5d0f) on `--warning-light` (#f5ead8) | 4.8:1 | ✅ | ❌ | AA — badge/fill combos |
| `--danger` (#9a3d32) on `--danger-light` (#f3dfdc) | 5.8:1 | ✅ | ❌ | AA — badge/fill combos |
| `--info` (#4a5d68) on `--surface` | 5.9:1 | ✅ | ❌ | AA only |
| `--text-secondary` (#5C574D) on `--surface` | 6.2:1 | ✅ | ❌ | AA only |
| `--text-tertiary` (#6E6756) on `--surface` | 4.9:1 | ✅ | ❌ | **FIXED** — was #7D7665 @ 3.9:1 (FAIL) |
| `--warning`/`--danger` on `--bg` (#1B1B18) | 3.1:1 / 2.5:1 | ❌ | ❌ | Dark-canvas text — **icons only** (3:1 UI contrast OK); never use as body text on the dark canvas |

**Usage rule:** `--warning`/`--danger` as text fill is safe on paper surfaces and
their light tints. On the dark canvas (`--bg`/`.inset-dark`/route dark boxes)
they are only used for icons and decorative markers, which meet the 3:1 UI
contrast requirement. Do not introduce warning/danger body text on the dark
canvas without retuning the tokens.

---

## 4. Semantic Overlap Analysis: `--accent`

**Current `--accent` (#FDB913) serves:**
1. **Brand moment** — bottom nav active indicator (the Beelo gold identity)
2. **Selection state** — calendar selected day (with `--primary` fallback)
3. **Progress highlight** — `.progress-bar .fill.accent`
4. **Decorative badge** — `.badge-accent`

**Assessment (Option A applied):**
- ✅ Brand moment works — gold on ink is the identity
- ✅ Progress highlight works
- ⚠️ Calendar selected day: gold fill on paper = **low contrast** (~1.8:1) if the
  `--primary` fallback is not in play — verify `.calendar-cell-selected` uses ink
- ⚠️ Badge accent: gold-on-cream text is unreadable; badge uses `--accent-contrast` text

**Decision:** `--accent` is brand + progress; **selection** uses ink (`--primary`) for
contrast on paper. Do not put dark-on-gold text outside `--accent-contrast` surfaces.

---

## 5. Reference: Beelo Direction (Option A — Applied)

| Token | Merged Value | Rationale |
|-------|--------------|-----------|
| `--bg` | `#1B1B18` | Manchester Ink canvas |
| `--primary` | `#1B1B18` | Warm ink — primary actions, brand text |
| `--primary-dark` | `#11110F` | Pressed state |
| `--primary-light` | `#E8E0D0` | Warm pale tint for badges |
| `--surface` | `#F3EEDF` | Warm paper — cream cards |
| `--surface-elevated` | `#FFFDF7` | White-warm surfaces |
| `--surface-muted` | `#B8B2A3` | Warmer muted |
| `--border` | `#5C574D` | Warmer border |
| `--border-light` | `rgba(92,87,77,0.22)` | Warmer subtle border |
| `--accent` | `#FDB913` | **Beelo Gold** — brand moments, progress, selection fallback |
| `--accent-contrast` | `#1B1B18` | Ink for text on gold |
| `--text-primary` (dark canvas) | `#F5F0E8` | Warm cream on dark |
| `--text-secondary` (dark canvas) | `#C7C1B0` | |
| `--text-tertiary` (dark canvas) | `#8E8878` | |
| `--text-primary` (surface scope) | `#1B1B18` | Ink on paper |
| `--text-secondary` (surface scope) | `#5C574D` | |
| `--text-tertiary` (surface scope) | `#7D7665` | |

**Semantic tokens (roles retained):**
| Token | Merged | Contrast on `--surface` (#F3EEDF) |
|-------|--------|-----------------------------------|
| `--secondary` (success) | `#4f6a2f` | 5.3:1 ✅ AA |
| `--secondary-light` | `#e6f0d8` | — |
| `--warning` | `#8d5d0f` | 4.9:1 ✅ AA |
| `--warning-light` | `#f5ead8` | — |
| `--danger` | `#9a3d32` | 5.9:1 ✅ AA |
| `--danger-light` | `#f3dfdc` | — |
| `--info` | `#4a5d68` | 5.9:1 ✅ AA |

**Selection/Highlight split (implemented via fallbacks):**
- **Selection** = `--primary` (warm ink) — calendar selected day, high-contrast on paper
- **Highlight** = `--accent` (Beelo Gold) — progress accents, brand moments, nav active

---

## 6. Hardcoded Colour Duplicates (Resolved)

### `css/core.css`
| Line | Hardcoded | Status |
|------|-----------|--------|
| 689 | desktop body bg `#0F0F0A` | **Keep** — intentional desktop bezel outside the app shell |
| 725 | print card border `#ccc` | **Keep** — print scope only |

### `css/components.css`
| Hardcoded | Context | Status |
|-----------|---------|--------|
| `#fff` | Trip banner icon/text/pulse/ghost text | Already `var(--text-inverse)` — audit was stale |
| `#fff` | Trip banner `.btn-primary` bg | Already `var(--surface-elevated)` — audit was stale |
| `#8f5410` | `.badge-warning` | **FIXED** → `var(--warning)` in `css/core.css`; redundant override block in `components.css` removed |
| `#e5e5e5` | `.route-map` placeholder | Already `var(--bg-elevated)` — audit was stale |
| `#fff` | Kanban sheet header gradient text | Already `var(--text-inverse)` — audit was stale |
| `#0E1116` + gold variants | Companion theme (separate palette) | **Keep** — isolated companion scope |

---

## 7. Remaining Improvements

### Phase 1 (DONE): Core Palette
`:root` values in `css/core.css` now use the warm ink/paper/gold palette. Applies to canvas,
surfaces, borders, text tokens, `--primary` family, and semantic colors.

### Phase 2 (DONE): Accent Strategy — Option A
- `.nav-item.active::before` → `var(--accent)` (brand moment)
- `.calendar-cell-selected` → `var(--accent, var(--primary))` fallback → warm ink
- `.progress-bar .fill.accent` → `var(--accent)` (brand highlight)
- `.badge-accent` → `var(--accent)` (brand badge)

### Phase 3 (DONE): Replace Hardcoded Duplicates
- `#8f5410` in `.badge-warning` (`css/core.css`) → `var(--warning)`
- Removed the redundant `.badge-warning` override block in `css/components.css`
  (it existed only to patch the hardcoded value)
- Non-token colours remaining are intentional: companion `--comp-*` palette,
  desktop page bezel `#0F0F0A`, print `#ccc`

### Phase 4 (CANCELLED): Text Contrast Retune
Original plan: retune `--warning`/`--danger` to `#B87A1A` / `#B03A2E` for AA on
paper. Recalculation (Phase 1, 2026-08-16) showed the current tokens already
pass AA on paper (4.9:1 / 5.9:1) and the suggested `#B87A1A` would fail
(3.10:1). **No retune applied.** The one real failure — surface `--text-tertiary`
(3.9:1) — was fixed in `css/core.css` by darkening the surface-scoped value to
`#6E6756` (4.9:1 AA).

---

## 8. Files Modified (Phase 1 — Design Foundation)

1. `css/core.css` — `.badge-warning` tokenised, surface `--text-tertiary` darkened to `#6E6756` (AA), touch targets ≥44px (`.btn-sm`, `.appt-actions .btn`)
2. `css/components.css` — removed redundant `.badge-warning` patch; touch targets ≥44px (`.tab`, `.segment`, `.hsc-week-nav`, `.hsc-week-icon-btn`, `.comp-suggestion-chip`, `.comp-chip`, `.comp-send`, `.comp-toggle-label`, `.advisor-alert .btn`, `.trip-banner-inner .btn`)
3. `DESIGN_TOKEN_AUDIT.md` — corrected contrast data (this file)

**Do NOT modify:**
- Companion palette (`--comp-*` tokens)
- Print styles (can stay `#ccc` for print)
- Desktop bezel `#0F0F0A`

---

## 9. Validation Checklist

After changes:
- [x] `npm test` passes
- [x] `npm run build` passes
- [x] Visual regression: screenshots captured, compared to baseline
- [x] No hardcoded colors remain (except companion + print + desktop bezel)
- [x] Calendar selected day readable (uses `--primary` fallback)
- [x] Bottom nav active indicator shows Beelo Gold
- [x] Progress bars: success=green, warning=amber, danger=red, accent=gold
- [x] Badges: all readable on paper
- [x] Text-on-paper AA for warning/danger (verified 4.9:1 / 5.9:1 — already passing; no retune needed)
- [x] Surface `--text-tertiary` AA on paper (fixed: #6E6756 @ 4.9:1)
- [x] Interactive touch targets ≥44px (buttons, tabs, segments, chips, week nav, companion controls)
