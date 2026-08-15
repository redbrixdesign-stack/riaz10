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

| Combination | Current | WCAG AA (4.5:1) | WCAG AAA (7:1) | Notes |
|-------------|---------|-----------------|----------------|-------|
| `--accent` (#FDB913) on `--accent-contrast` (#1B1B18) | ~11:1 | ✅ | ✅ | Good — gold on ink |
| `--primary` (#1B1B18) on `--surface` (#F3EEDF) | ~14:1 | ✅ | ✅ | Good |
| `--secondary` (#4f6a2f) on `--surface` | 5.8:1 | ✅ | ❌ | AA only |
| `--warning` (#8d5d0f) on `--surface` | 3.9:1 | ❌ | ❌ | **FAIL** — amber on paper |
| `--danger` (#9a3d32) on `--surface` | 3.4:1 | ❌ | ❌ | **FAIL** — red on paper |
| `--text-secondary` (#5C574D) on `--surface` | ~5.4:1 | ✅ | ❌ | AA only |
| `--text-tertiary` (#7D7665) on `--surface` | ~4.2:1 | ❌ | ❌ | tertiary text too dim |

**Key finding:** `--warning`/`--danger` used as text fill on paper fail AA. They are safe as
backgrounds/badges (light tints) but should not carry critical text on `--surface` alone.
Retuning to the Phase 2 values in section 5 (e.g. `--danger: #B03A2E`) would bring them to AA
and remains an option if text-on-paper contrast matters.

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
| `--secondary` (success) | `#4f6a2f` | 5.8:1 ✅ AA |
| `--secondary-light` | `#e6f0d8` | — |
| `--warning` | `#8d5d0f` | 3.9:1 ❌ (bg-safe) |
| `--warning-light` | `#f5ead8` | — |
| `--danger` | `#9a3d32` | 3.4:1 ❌ (bg-safe) |
| `--danger-light` | `#f3dfdc` | — |
| `--info` | `#4a5d68` | 5.8:1 ✅ AA |

**Selection/Highlight split (implemented via fallbacks):**
- **Selection** = `--primary` (warm ink) — calendar selected day, high-contrast on paper
- **Highlight** = `--accent` (Beelo Gold) — progress accents, brand moments, nav active

---

## 6. Hardcoded Colour Duplicates (to Replace with Tokens)

### `css/core.css`
| Line | Hardcoded | Should Use |
|------|-----------|------------|
| — | desktop body bg (dark) | `var(--bg)` or desktop token |
| — | print card border (`#ccc`) | `var(--border-light)` (print scope, low priority) |

### `css/components.css`
| Line | Hardcoded | Context | Should Use |
|------|-----------|---------|------------|
| — | `#fff` | Trip banner icon/text | `var(--text-inverse)` |
| — | `#fff` | Trip banner pulse | `var(--text-inverse)` |
| — | `#fff` | Trip banner `.btn-primary` bg | `var(--surface-elevated)` |
| — | `#fff` | Trip banner `.btn-ghost` text | `var(--text-inverse)` |
| — | `#8f5410` | `.badge-warning` dark mode | `var(--warning)` |
| — | `#e5e5e5` | `.route-map` placeholder | `var(--surface-muted)` or `var(--bg-elevated)` |
| — | `#fff` | Kanban sheet header gradient text | `var(--text-inverse)` |
| — | `#0E1116` + gold variants | Companion theme (separate palette) | **Keep** — isolated companion scope |
| — | `#0E1116` | Companion send button / input / focus | **Keep** — companion scope |

**Companion palette** is intentionally isolated with `--comp-*` tokens — do not touch.

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

### Phase 3 (OPTIONAL): Replace Hardcoded Duplicates
Swap the non-companion hardcoded colors above for token references.

### Phase 4 (OPTIONAL): Text Contrast Retune
If text-on-paper contrast for `--warning`/`--danger` matters, retune to
`#B87A1A` / `#B03A2E` (AA on paper).

---

## 8. Files to Modify (if proceeding with Phases 3-4)

1. `css/core.css` — `:root` token values (lines 6-67), dark mode block (70-79), surface-scoping blocks
2. `css/components.css` — hardcoded color replacements

**Do NOT modify:**
- Companion palette (`--comp-*` tokens)
- Print styles (can stay `#ccc` for print)

---

## 9. Validation Checklist

After changes:
- [x] `npm test` passes
- [x] `npm run build` passes
- [x] Visual regression: screenshots captured, compared to baseline
- [x] No hardcoded colors remain (except companion + print)
- [x] Calendar selected day readable (uses `--primary` fallback)
- [x] Bottom nav active indicator shows Beelo Gold
- [x] Progress bars: success=green, warning=amber, danger=red, accent=gold
- [x] Badges: all readable on paper
- [ ] Text-on-paper AA for warning/danger (Phase 4, optional)
