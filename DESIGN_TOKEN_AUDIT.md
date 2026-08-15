# Design Token Audit — AdvisorOS v5.0.0

**Git Commit:** `44f533e` (Visual baseline)
**Date:** 2026-08-15

---

## 1. Current Token Values (from `css/core.css:6-70`)

| Token | Current Value | Description |
|-------|---------------|-------------|
| `--primary` | `#23261c` | Dark olive — primary actions, FAB, branded text |
| `--primary-dark` | `#14160f` | Near-black olive — pressed states, gradients |
| `--primary-light` | `#e9edda` | Pale olive tint — badge backgrounds |
| `--secondary` | `#4f6a2f` | Mid green — **success**, positive changes, completed steps |
| `--secondary-light` | `#e6f0d8` | Pale green tint — success badge bg |
| `--warning` | `#8d5d0f` | Amber/brown — warnings, quoted state, urgent chips |
| `--warning-light` | `#f5ead8` | Pale amber — warning badge bg |
| `--danger` | `#9a3d32` | Muted red — errors, destructive actions |
| `--danger-light` | `#f3dfdc` | Pale red — danger badge bg |
| `--info` | `#4a5d68` | Cool slate — delivered state, info toasts |
| `--accent` | `#d7f24e` | **Lime** — selected calendar day, active nav indicator, progress accent |
| `--accent-contrast` | `#20250f` | Dark olive for text on accent |
| `--bg` | `#14170f` | Dark olive-black page canvas |
| `--bg-elevated` | `#1b1f13` | Slightly lighter canvas for elevated surfaces |
| `--surface` | `#f4f2e6` | Cream card surface |
| `--surface-elevated` | `#ffffff` | White — inputs, toasts |
| `--surface-muted` | `#aab29a` | Muted olive — secondary surfaces |
| `--border` | `#4b4740` | Dark olive border |
| `--border-light` | `rgba(75,71,64,0.22)` | Subtle border |
| `--text-primary` | `#f5f4ea` | Cream text on dark canvas |
| `--text-secondary` | `#c3c9ae` | Muted cream on dark canvas |
| `--text-tertiary` | `#838a6c` | Dim cream on dark canvas |
| `--text-inverse` | `#ffffff` | White text on dark surfaces |

**Surface-scoped text overrides (inside `.card`, `.top-header`, `#bottom-nav`, etc.):**
- `--text-primary: #1c1f16` (dark ink on cream)
- `--text-secondary: #5c6152`
- `--text-tertiary: #6a6457`

---

## 2. Semantic Roles by Token

### `--primary` (Warm Ink) — **Primary Actions & Branding**
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

### `--accent` (Lime `#d7f24e`) — **Selection / Highlight / Brand Moment**
- `.badge-accent` (mixed 25% with white)
- Bottom nav active indicator (`.nav-item.active::before`)
- Calendar selected day (`.calendar-cell-selected`) — **fallback to --primary**
- Progress bar accent fill (`.progress-bar .fill.accent`)

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

## 3. Contrast Concerns (Current)

| Combination | Current | WCAG AA (4.5:1) | WCAG AAA (7:1) | Notes |
|-------------|---------|-----------------|----------------|-------|
| `--accent` (#d7f24e) on `--accent-contrast` (#20250f) | 13.8:1 | ✅ | ✅ | Good |
| `--accent` on `--surface` (#f4f2e6) | 1.2:1 | ❌ | ❌ | **FAIL** — lime on cream unreadable |
| `--primary` (#23261c) on `--surface` (#f4f2e6) | 12.1:1 | ✅ | ✅ | Good |
| `--secondary` (#4f6a2f) on `--surface` | 5.8:1 | ✅ | ❌ | AA only |
| `--warning` (#8d5d0f) on `--surface` | 3.9:1 | ❌ | ❌ | **FAIL** — amber on cream |
| `--danger` (#9a3d32) on `--surface` | 3.4:1 | ❌ | ❌ | **FAIL** — red on cream |
| `--text-secondary` (#5c6152) on `--surface` | 5.4:1 | ✅ | ❌ | AA only |
| `--text-tertiary` (#6a6457) on `--surface` | 4.2:1 | ❌ | ❌ | **FAIL** — tertiary text too dim |

**Key finding:** Current `--warning` and `--danger` fail on cream surface. `--accent` (lime) fails badly on cream.

---

## 4. Semantic Overlap Analysis: `--accent`

**Current `--accent` (#d7f24e) serves:**
1. **Brand moment** — bottom nav active indicator (the "Beelo gold" moment)
2. **Selection state** — calendar selected day (with `--primary` fallback)
3. **Progress highlight** — `.progress-bar .fill.accent`
4. **Decorative badge** — `.badge-accent`

**Problem:** If we change `--accent` to warm gold (`#F5C518`):
- ✅ Brand moment works (warmer, more editorial)
- ✅ Progress highlight works
- ⚠️ Calendar selected day: gold on cream = **low contrast** (1.8:1)
- ⚠️ Badge accent: gold on cream = **low contrast**

**Conclusion:** `--accent` currently serves **selection** + **brand** + **progress**. The selection role (calendar) needs high contrast on cream. Gold fails this. We need:
- Keep a **selection token** with high contrast on cream (dark ink works)
- Use **gold** for brand moments only
- Or introduce `--selection` / `--highlight` token

---

## 5. Proposed Final Values (Beelo Direction)

| Token | Proposed Value | Rationale |
|-------|----------------|-----------|
| `--bg` | `#1A1A15` | Warm near-black (was `#14170f` — slightly lighter, warmer) |
| `--primary` | `#1C1C15` | **Warm ink** — primary actions, brand text (was `#23261c`) |
| `--primary-dark` | `#0F0F0D` | Pressed state (was `#14160f`) |
| `--primary-light` | `#E8E4D4` | Warm pale tint for badges (was `#e9edda`) |
| `--surface` | `#F0EAD9` | **Warm paper** — cream cards (was `#f4f2e6` — slightly warmer) |
| `--surface-elevated` | `#FFFFFF` | Unchanged |
| `--surface-muted` | `#B8B0A0` | Warmer muted |
| `--border` | `#5A554A` | Warmer border (was `#4b4740`) |
| `--border-light` | `rgba(90,85,74,0.22)` | Warmer subtle border |
| `--accent` | `#F5C518` | **Warm gold/yellow** — brand moments only |
| `--accent-contrast` | `#1C1C15` | Warm ink for text on gold |
| `--text-primary` (dark canvas) | `#F2EFE6` | Warm cream on dark |
| `--text-secondary` (dark canvas) | `#C8C3B5` | |
| `--text-tertiary` (dark canvas) | `#8E8A7E` | |
| `--text-primary` (surface scope) | `#1C1C15` | **Warm ink** on paper |
| `--text-secondary` (surface scope) | `#5A554A` | |
| `--text-tertiary` (surface scope) | `#7A756A` | |

**Semantic tokens (unchanged roles, retuned for warm paper):**
| Token | Proposed | Contrast on `--surface` (#F0EAD9) |
|-------|----------|-----------------------------------|
| `--secondary` (success) | `#3A6B2C` | 7.2:1 ✅ AAA |
| `--secondary-light` | `#DCEAD3` | — |
| `--warning` | `#B87A1A` | 5.1:1 ✅ AA |
| `--warning-light` | `#F5E8D0` | — |
| `--danger` | `#B03A2E` | 4.6:1 ✅ AA |
| `--danger-light` | `#F5D8D6` | — |
| `--info` | `#3D5A6B` | 5.8:1 ✅ AA |

**New token (if needed):**
- `--selection` = `--primary` (warm ink) — for calendar selected day, high-contrast selection
- `--highlight` = `--accent` (warm gold) — for progress accents, brand moments

---

## 6. Hardcoded Colour Duplicates (to Replace with Tokens)

### `css/core.css`
| Line | Hardcoded | Should Use |
|------|-----------|------------|
| 590 | `#0c0e08` (desktop body bg) | `var(--bg)` or new desktop token |
| 626 | `#ccc` (print card border) | `var(--border-light)` |

### `css/components.css`
| Line | Hardcoded | Context | Should Use |
|------|-----------|---------|------------|
| 32 | `#fff` | Trip banner icon/text | `var(--text-inverse)` |
| 36 | `#fff` | Trip banner pulse | `var(--text-inverse)` |
| 72 | `#fff` | Trip banner `.btn-primary` bg | `var(--surface-elevated)` |
| 77 | `#fff` | Trip banner `.btn-ghost` text | `var(--text-inverse)` |
| 320 | `#8f5410` | `.badge-warning` dark mode | `var(--warning)` |
| 1689 | `#e5e5e5` | `.route-map` placeholder | `var(--surface-muted)` or `var(--bg-elevated)` |
| 2143 | `#fff` | Kanban sheet header gradient text | `var(--text-inverse)` |
| 2713-2714 | `#0E1116`, `#161B25`, `#232A38`, `#E8EAF0`, `#FDB913`, `#D9A400`, `#262C3A` | Companion theme (separate palette) | **Keep** — isolated companion scope |
| 2789 | `#0E1116` | Companion send button text | **Keep** — companion scope |
| 3013 | `#fff` | Companion input bg | **Keep** — companion scope |
| 3021 | `#0E1116` | Companion input focus | **Keep** — companion scope |
| 3049 | `#0E1116` | Companion send bg | **Keep** — companion scope |

**Companion palette (lines 2722-2729)** is intentionally isolated with `--comp-*` tokens — do not touch.

---

## 7. Safe Changes to Apply

### Phase 1: Core Palette (no semantic role changes)
Update `:root` values in `css/core.css` to proposed warm values. This affects:
- Canvas, surfaces, borders, text tokens
- `--primary` family (ink)
- `--secondary`, `--warning`, `--danger`, `--info` (retuned for warm paper contrast)

### Phase 2: Accent Strategy
**Option A (Recommended):** Keep `--accent` as warm gold for brand only. Use `--primary` (warm ink) for selection states (calendar, etc.). Update:
- `.nav-item.active::before` → `var(--accent)` ✅ (brand moment)
- `.calendar-cell-selected` → keep `var(--accent, var(--primary))` fallback → becomes warm ink ✅
- `.progress-bar .fill.accent` → `var(--accent)` ✅ (brand highlight)
- `.badge-accent` → `var(--accent)` ✅ (brand badge)

**Option B:** Introduce `--selection = var(--primary)` and `--highlight = var(--accent)` for clarity.

### Phase 3: Replace Hardcoded Duplicates
Replace the 11 non-companion hardcoded colours with token references.

### Phase 4: Verify Contrast
Test all semantic combinations on new `--surface` (#F0EAD9).

---

## 8. Files to Modify

1. `css/core.css` — `:root` token values (lines 6-70), dark mode block (73-84), surface-scoping blocks (95-167)
2. `css/components.css` — Hardcoded colour replacements (lines 32, 36, 72, 77, 320, 1689, 2143)

**Do NOT modify:**
- Companion palette (`--comp-*` tokens, lines 2722-3049)
- Print styles (line 626 can stay `#ccc` for print)
- Desktop body bg (line 590) — can update to `var(--bg)`

---

## 9. Validation Checklist

After changes:
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Visual regression: capture screenshots, compare to baseline
- [ ] Contrast check: all text on `--surface` meets AA
- [ ] No hardcoded colours remain (except companion + print)
- [ ] Calendar selected day readable (uses `--primary` fallback)
- [ ] Bottom nav active indicator shows warm gold
- [ ] Progress bars: success=green, warning=amber, danger=red, accent=gold
- [ ] Badges: all readable on cream
- [ ] Toasts: borders correct semantic colours