# Visual Baseline — Beelo v2

**Version:** 2 (replaces the v1 catalog — v1 was a templated checklist, not
per-screen-verified, and predates the current app state)
**Date:** 2026-08-16
**Method:** live per-screen probe (`tests/browser/audit-current.js` +
`tests/browser/audit-theme.js` + fresh screenshots in `screenshots/review/`)
**Viewport:** 390×844 (mobile-first; 320/430 variants captured too)
**Data state:** `tests/browser/seed-review.html` demo dataset

## What changed since v1 (claims dropped, with reasons)

The v1 issue lists were near-identical per screen ("excessive scrolling",
"equal-weight buttons", "card nesting", "inconsistent spacing") and were not
re-verified. Re-audited against the current app, **none of those generic
claims hold**, so they were dropped rather than carried forward:

| v1 claim | Status now | Why |
|---|---|---|
| Excessive scrolling / page longer than viewport | Resolved/expected | Screens are mobile scroll views; no horizontal overflow anywhere (probe: overflowX = 0 on all 16 screens) |
| Equal-weight primary/secondary buttons | Not observed | Verified per screen; no competing full-width primaries found |
| Card nesting / visual depth confusion | Not observed | One card system (see `docs/DESIGN_SYSTEM.md`); Tools converted from a full-screen `.notebook-page` block to `.card` blocks (this version) |
| Inconsistent spacing | Not observed | Shared tokens/utilities throughout |
| Icon font rendering as literal text | **Fixed** | Self-hosted Material Symbols font + `font-display: block` (previous change) |
| Home footer clipping | **Fixed/verified** | Clearance measured positive at all breakpoints (99px+, hardened to 140px padding) |
| "RIGHT NOW" clock conflict | **Fixed** | Renamed to "NEXT"; date-aware for non-today visits (month/year boundaries tested) |
| Light-theme screens | Fixed | Converted the whole app to dark-on-dark: all 16 screens now measure 90–100% dark canvas, 0–4% light (gold accents only) |
| Unexplained empty black space | Partially resolved | Page-level empty states now fill the visible area (e.g. Visits Past void 66% → 14%); short boards/forms end tidily on the canvas by design |

## Screen inventory — current findings (verified, screen-specific)

| Screen | Route | Screenshot | Findings (genuinely observable now) |
|---|---|---|---|
| Home | `#today` | `01-home.png` | No outstanding issues. Greeting, NEXT card (date-aware), day strip (Done/Overdue/Next), attention, week, Ask Beelo. |
| Follow-ups | `#followups` | `02-followups.png` | No outstanding issues. Mixed due/later inbox fills the viewport. |
| Orders | `#orders` | `03-orders.png` | Board ends at ~57% of the viewport with the seeded dataset — a tidy end on the ink canvas, not an error; acceptable per design doc (no filler below boards). |
| Money | `#money` | `04-money.png` | No outstanding issues. |
| Tools | `#control` | `05-tools.png` | **Fixed this version**: now 4 `.card` blocks (Today / Customer / Money & Route / Data & Settings), matching Settings/Money. Previously a single full-screen cream `.notebook-page` block. |
| Visits — Diary | `#appointments` (tab diary) | `06-visits-diary.png` | No outstanding issues. |
| Visits — Upcoming | tab upcoming | `07-visits-upcoming.png` | No outstanding issues. |
| Visits — Pipeline | tab pipeline | `08-visits-pipeline.png` | Short lead board ends tidily mid-screen (same acceptable pattern as Orders). |
| Visits — Area | tab area | `09-visits-area.png` | Before a search, only the input form is shown (~47% height) — acceptable form layout; the "No local history yet" empty state fills properly once a search returns nothing. |
| Visits — Past | tab past | `10-visits-past.png` | Empty state now fills the visible area (void 66% → 14% measured). |
| Route | `#route` | `11-route.png` | **Known limitation (not a regression):** the map tiles come from OpenStreetMap, so a fully-offline load shows a grey map; the stop list and plan still work. Consider caching tiles or a static fallback. |
| Talk | `#talk` | `12-talk.png` | No outstanding issues. |
| Measure | `#measure` | `13-measure.png` | Sparse: the "select a visit to measure" state occupies only the top ~19% of the viewport. Candidate polish: vertically centre the picker state. |
| Scan | `#ocr` | `14-scan.png` | Sparse tool screen (~43% height content). Acceptable for a camera/tool UI; could be centred for polish. |
| Settings | `#settings` | `15-settings.png` | No outstanding issues. 11 section cards, fills viewport. |
| Customer 360 | `#customer` | `16-customer-360.png` | No outstanding issues. |
| Onboarding | `#onboarding` | `17-onboarding.png` | No outstanding issues. |

## Cross-cutting status

- **Theme:** one dark theme everywhere (ink canvas + elevated dark surfaces
  + gold accent) — see `docs/DESIGN_SYSTEM.md`. The cream-paper card system
  was removed; every surface is a dark layer on the ink canvas (audit:
  90–100% dark, 0–4% light = gold accents only).
- **Icons:** self-hosted, offline-safe, no raw ligature text.
- **Errors/overflow:** zero JS errors and zero horizontal overflow across
  all 16 screens at 390px (probe run).
- **Empty states:** page-level empties fill the visible area.

## Regeneration

`node tests/browser/capture-review.js && node tests/browser/capture-extra.js`
then `python3 scripts/compose-review-canvas.py` — needs `npm run serve` on :8000.
