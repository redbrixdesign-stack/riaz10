# Beelo Design System

Single source of truth for the visual language. **Every screen uses these
tokens and components** — if a screen looks different, that's a bug, not a
new variant. The canonical token definitions live in `css/core.css`; this
document explains *how* to use them.

## 1. The theme rule (one theme, everywhere)

Beelo has **one** dark theme — there is no light theme and no
`prefers-color-scheme` override:

> **Dark Manchester Ink canvas + elevated dark surfaces + Beelo Gold accent.**

- The page background is ALWAYS the ink canvas (`--bg: #0A0A0A`).
- Cards, headers, the bottom nav, sheets, inputs, toasts and list rows are
  ALL **dark elevated surfaces** (`--surface: #121212`,
  `--surface-elevated: #171717`, `--surface-muted: #202020`) separated by
  thin warm hairlines (`--border-light`).
- Text is light cream throughout — there is **no cream/white surface** and
  no dark-on-light text re-scoping. A screen with a cream background is a
  regression.
- Gold (`--accent`) is the only saturated brand colour and appears
  sparingly, only where it carries meaning.

If you're tempted to add a cream/white surface: **don't**. Field advisors
use this in vehicles and outdoors; the dark layered system is the
deliberate readability choice.

## 2. Core tokens (from `css/core.css`)

| Token | Value | Meaning |
|---|---|---|
| `--bg` | `#0A0A0A` | Page canvas (Manchester Ink) |
| `--bg-elevated` | `#101010` | Slightly raised canvas region |
| `--surface` | `#121212` | Elevated dark surface (cards, nav, sheets) |
| `--surface-elevated` | `#171717` | Inputs, kanban cards and toasts |
| `--surface-muted` | `#202020` | Hover/pressed and muted chips |
| `--border` / `--border-light` | `#4A4A44` / 50% | Hairline borders on dark |
| `--text-primary` | `#F5F0E8` | Primary text (light everywhere) |
| `--text-secondary` / `--text-tertiary` | warm greys | Secondary / faint text |
| `--accent` | `#FDB913` | Beelo Gold — see colour meanings |

## 2.1 Responsive shell

- Below 900px the application shell is capped at 480px and remains phone-first.
- At 900px and above `--max-width` becomes 720px for data-heavy tablet and
  desktop use. The bottom navigation, sheets and live banners consume the same
  token and must remain aligned with the shell.
- Screen content must not depend on a hard-coded 480px width. Test at 320, 390,
  430, 768, 900 and 1280 CSS pixels before release.

## 3. Colour meanings (one meaning per colour)

| Colour | Token | Use it ONLY for |
|---|---|---|
| **Gold** | `--accent` | **Brand + primary action + current/important state.** Avatar, active nav, primary CTA (send), the "NEXT" tag, week progress, the gold briefing/ETA lines on Home, highlighted fact values in companion answers. **Never** for warnings or overdue. |
| **Amber** | `--warning` (`#C08A2D`) | **Overdue / urgent-but-not-broken.** The "Overdue" tag, overdue day-strip state, payment reminders. Deliberately a different hue from gold — gold is brand, amber is a warning. |
| **Green** | `--secondary` (`#4f6a2f`) | **Success / done / positive.** "Done" states, success badges/toasts, paid order text. |
| **Red** | `--danger` (`#C0563F`) | **Destructive / needs action now.** Delete, service issues, high-priority follow-up badges. Use `--danger-text` (`#E0876F`) for small text on dark surfaces. |
| **Slate** | `--info` (`#8299A8`) | **Neutral info / delivered.** Info toasts, "delivered" states; light enough for accessible small text on dark surfaces. |

Rules that follow from this:
- Warnings and brand accents are never the same colour (gold ≠ amber).
- Money figures render in neutral light text on dark surfaces. Gold
  emphasis inside a companion answer is the one place a figure may be
  highlighted, as a brand emphasis — never as "this is money" styling.
- Decorative brand elements (avatar, brand dot) may use gold freely; that's
  the brand mark, separate from the semantic system above.

## 4. Card system (one card, limited variants)

Every card is a dark elevated surface on the ink canvas: `background:
var(--surface)` (or `--surface-elevated`), `border: 1px solid
var(--border-light)`, `border-radius: var(--radius-md/lg)`. Do not
invent new card backgrounds — and never a cream one.

Variants:

| Variant | Class | Use |
|---|---|---|
| Default card | `.card` | Neutral content blocks |
| Interactive card | `.card.card-interactive` | Tappable cards (visit cards, dashboard tiles) |
| List row | `.list-item` | Flat full-width rows (settings, menus) |
| Priority card | `.fup-card` | Follow-up inbox items — the **left accent bar** carries urgency: |
| | | `--warning` amber = payment/urgent money |
| | | `--danger` red = service issue / high priority |
| | | `--primary` ink = today's visits / first-visit intros |
| | | no accent / neutral = routine tasks |
| Kanban card | `.kanban-card` | Orders board (uses `--surface-elevated`) |
| Calendar card | `.calendar-card` | Diary calendar |
| Control tile | `.control-tile` | Tools hub — flat row, not a boxed card |
| Chat card | `.comp-*` | Home companion only — dark elevated surface on the chat canvas |

The accent-bar colour map above is the ONLY place a coloured left border is
used. If a screen needs "this item is urgent", use the same map — don't add
a new accent colour.

## 5. Content ending / empty space

- Short lists end tidily at their last item — the ink canvas below is the
  page, not a bug. Never fill it with decorative filler.
- A screen with **no content** shows the page-level empty state
  (`.empty-state.empty-state-lg`), which fills the available space so the
  screen reads as intentionally empty, not broken. The base `.empty-state`
  (small, 160px) is only for inline/embedded empties inside a larger page.

## 6. Offline & fonts

- The icon font (Material Symbols Rounded) is self-hosted and precached by
  the service worker — icons must never depend on the network. Never move
  it back to a remote `@font-face` with `font-display: swap`.
