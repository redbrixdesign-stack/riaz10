# Visual Baseline — AdvisorOS v5.0.0

**Git Commit:** `e89db55` Phase 1-3: CI, CSP, Upstash Redis rate-limiting, PII encryption, Mapbox geocoding, storage quota warning, encrypted exports
**Date:** 2026-08-15
**Viewport:** 390×844 (iPhone 12/13/14 Pro logical pixels, 2× device scale)
**Device/Emulator:** Playwright Chromium headless, iPhone user agent
**Data State:** Seeded with 1 customer (Sarah Jones), 2 appointments (measure + quote), 2 expenses, 1 order, settings (advisorName: "Riaz Ahmed", weeklyTarget: 600, commissionRate: 10)
**Screenshots Location:** `screenshots-seeded/*-mobile-seeded.png`

---

## Screen Inventory (12 Core Screens)

| # | Screen | Route | Screenshot | Height (px) |
|---|--------|-------|------------|-------------|
| 1 | Today / Home | `#today` | `today-mobile-seeded.png` | ~841 KB |
| 2 | Companion | `#companion` | `companion-mobile-seeded.png` | ~125 KB |
| 3 | Visits (Appointments) | `#appointments` | `appointments-mobile-seeded.png` | ~113 KB |
| 4 | Follow-ups | `#followups` | `followups-mobile-seeded.png` | ~55 KB |
| 5 | Route | `#route` | `route-mobile-seeded.png` | ~272 KB |
| 6 | Money | `#money` | `money-mobile-seeded.png` | ~273 KB |
| 7 | Orders | `#orders` | `orders-mobile-seeded.png` | ~49 KB |
| 8 | Customer 360 | `#customer` | `customer-mobile-seeded.png` | ~25 KB |
| 9 | Measure | `#measure` | `measure-mobile-seeded.png` | ~26 KB |
| 10 | Scan (OCR) | `#ocr` | `ocr-mobile-seeded.png` | ~52 KB |
| 11 | Tools (Control) | `#control` | `control-mobile-seeded.png` | ~125 KB |
| 12 | Settings | `#settings` | `settings-mobile-seeded.png` | ~607 KB |

---

## UX Issues Catalog (Per Screen)

### 1. Today / Home (`#today`)
**Viewport:** 390×844 | **Scroll:** Full-page (long)
**Issues:**
- **Excessive scrolling** — Page height far exceeds viewport; user must scroll to see all content
- **Equal-weight buttons** — Primary actions (New Visit, Quick Expense, etc.) have same visual weight as secondary
- **Bottom-nav overlap risk** — Floating action content may sit behind bottom nav on short viewports
- **Card nesting** — Multiple card layers (companion card inside today card inside main) create visual depth confusion
- **Inconsistent spacing** — Gaps between sections vary (12px, 16px, 20px, 24px)
- **Unclear primary action** — No single prominent CTA; "New Visit" and "Quick Expense" compete
- **Loading states** — Companion widget shows spinner briefly on mount
- **Text wrapping** — Long customer names wrap awkwardly in appointment chips

### 2. Companion (`#companion`)
**Viewport:** 390×844 | **Scroll:** Minimal
**Issues:**
- **Excessive card nesting** — Chat bubbles inside sheet inside modal overlay inside main
- **Small touch targets** — Suggestion chips at 32px height (below 44px minimum)
- **Confusing labels** — "Talk" vs "Companion" vs "AI Assistant" used interchangeably in UI
- **Empty state** — Fresh session shows generic placeholder, no onboarding hint
- **Bottom-nav overlap** — Sheet handle sits very close to bottom nav bar

### 3. Visits / Appointments (`#appointments`)
**Viewport:** 390×844 | **Scroll:** Full-page
**Issues:**
- **Excessive scrolling** — List grows indefinitely; no virtualization
- **Equal-weight buttons** — "Add Visit" FAB and filter chips same visual prominence
- **Clipped content** — Appointment cards truncate address/notes with no "show more"
- **Inconsistent spacing** — Date headers use 16px margin, cards use 12px gap
- **Unclear primary action** — FAB says "Add Visit" but most common action is "View/Edit"
- **Empty state** — No visits shows generic illustration, no guided next step
- **Text wrapping** — Long customer names + address wrap to 3+ lines

### 4. Follow-ups (`#followups`)
**Viewport:** 390×844 | **Scroll:** Moderate
**Issues:**
- **Excessive card nesting** — Task cards inside section cards inside list
- **Inconsistent spacing** — Section headers 20px, task cards 12px, actions 8px
- **Confusing labels** — "Chase Quote" vs "Quote Follow-up" vs "Follow Up" mixed
- **Unnecessary data** — Shows internal template keys (pre_intro, quote_followup) in UI
- **Small touch targets** — Action buttons at 36px height
- **Empty state** — "No follow-ups due" with no context on when they'll appear

### 5. Route (`#route`)
**Viewport:** 390×844 | **Scroll:** Full-page (map + list)
**Issues:**
- **Excessive scrolling** — Map takes ~50% viewport, list below requires scroll
- **Bottom-nav overlap** — Map controls and bottom sheet compete with bottom nav
- **Clipped content** — Route summary card truncates distance/time on narrow screens
- **Equal-weight buttons** — "Navigate", "Optimize", "Clear" all same style
- **Loading states** — Map tiles load progressively, spinner covers map center
- **Unnecessary data** — Shows raw coordinates in debug overlay (dev leak)

### 6. Money (`#money`)
**Viewport:** 390×844 | **Scroll:** Full-page
**Issues:**
- **Excessive scrolling** — 4+ stat cards + 3 sections + charts = very long page
- **Card nesting** — Stat cards inside section cards inside scroll container
- **Inconsistent spacing** — Stat grid 12px gap, section margins 24px, inner 16px
- **Confusing labels** — "Earnings" vs "Commission" vs "Take-home" used inconsistently
- **Unnecessary data** — Shows raw tax calculation breakdown by default
- **Text wrapping** — Currency values wrap on narrow viewports (£1,234.56)
- **Small touch targets** — Period selector chips at 32px

### 7. Orders (`#orders`)
**Viewport:** 390×844 | **Scroll:** Moderate
**Issues:**
- **Equal-weight buttons** — "New Order", filter tabs, and row actions same weight
- **Clipped content** — Order summary truncates customer name + items
- **Inconsistent spacing** — Filter tabs 8px gap, order cards 16px, actions 12px
- **Unclear primary action** — No clear "Create Order from Quote" flow
- **Empty state** — Generic "No orders" with no path to create first order
- **Loading states** — Skeleton loaders flash on tab switch

### 8. Customer 360 (`#customer`)
**Viewport:** 390×844 | **Scroll:** Full-page
**Issues:**
- **Excessive scrolling** — Profile + quotes + orders + measurements + comms = very long
- **Card nesting** — Each section is a card inside a card inside the page
- **Inconsistent spacing** — Section headers 20px, internal gaps 12px, row gaps 8px
- **Confusing labels** — "360" in nav but "Profile" in header
- **Unnecessary data** — Shows raw database IDs in debug mode
- **Text wrapping** — Address lines wrap to 3 lines, pushing content down
- **Bottom-nav overlap** — Action sheet for "New Visit" sits behind bottom nav

### 9. Measure (`#measure`)
**Viewport:** 390×844 | **Scroll:** Full-page (form)
**Issues:**
- **Excessive scrolling** — Form fields exceed viewport; must scroll to save
- **Equal-weight buttons** — "Save", "Cancel", "Add Window" same visual weight
- **Clipped content** — Diagonal fields push other fields off-screen
- **Inconsistent spacing** — Field groups 16px, fields 12px, labels 4px
- **Unclear primary action** — "Save Measurements" not visually distinct from "Add Window"
- **Small touch targets** — Unit toggle buttons at 32×32px
- **Text wrapping** — Field labels wrap on narrow screens ("Width (Top/Middle/Bottom)")

### 10. Scan / OCR (`#ocr`)
**Viewport:** 390×844 | **Scroll:** Moderate
**Issues:**
- **Excessive card nesting** — Camera preview inside card inside sheet inside modal
- **Bottom-nav overlap** — Camera controls sit at bottom, conflict with bottom nav
- **Equal-weight buttons** — "Scan Receipt", "Scan Quote", "Manual Entry" same style
- **Loading states** — Tesseract WASM load shows full-screen spinner (2-3s)
- **Confusing labels** — "OCR" in code, "Scan" in nav, "Extract" in buttons
- **Small touch targets** — Retake/Confirm buttons at 40px

### 11. Tools / Control (`#control`)
**Viewport:** 390×844 | **Scroll:** Full-page
**Issues:**
- **Excessive scrolling** — 8+ tool cards, each with description + action
- **Card nesting** — Tool cards inside category cards inside scroll view
- **Equal-weight buttons** — All tool actions use same secondary button style
- **Inconsistent spacing** — Category gaps 24px, tool gaps 12px, internal 16px
- **Confusing labels** — "Control Panel" in header, "Tools" in nav
- **Unnecessary data** — Shows version/build info prominently
- **Empty states** — Some tools (Backup, Export) show no status until clicked

### 12. Settings (`#settings`)
**Viewport:** 390×844 | **Scroll:** Full-page (very long)
**Issues:**
- **Excessive scrolling** — 12+ sections, each with multiple fields
- **Card nesting** — Setting groups inside cards inside section cards
- **Equal-weight buttons** — "Save", "Reset", "Export", "Delete All" same style
- **Clipped content** — Long setting descriptions wrap and push fields
- **Inconsistent spacing** — Section gaps 24px, field gaps 16px, toggle gaps 8px
- **Unclear primary action** — No visual hierarchy for destructive vs constructive actions
- **Confusing labels** — "AI Proxy" vs "AI Settings" vs "Claude Proxy" mixed
- **Small touch targets** — Toggle switches at 36px track width
- **Text wrapping** — Setting labels wrap to 2-3 lines on narrow screens
- **Bottom-nav overlap** — Danger zone actions at bottom sit behind nav

---

## Cross-Cutting Issues

| Issue | Screens Affected | Severity |
|-------|------------------|----------|
| Bottom-nav overlap on action sheets/modals | Today, Companion, Route, Customer, Measure, Scan, Settings | High |
| No consistent primary action pattern | All screens | High |
| Inconsistent spacing scale (8/12/16/20/24px mixed) | All screens | Medium |
| Card-over-card nesting (3+ levels) | Today, Companion, Customer, Measure, Tools, Settings | Medium |
| Touch targets < 44×44px | Companion, Follow-ups, Money, Measure, Scan, Settings | Medium |
| Label/terminology inconsistency | Companion, Follow-ups, Money, Orders, Customer, Scan, Tools, Settings | Medium |
| Excessive vertical scrolling (>2× viewport) | Today, Visits, Route, Money, Customer, Measure, Tools, Settings | High |
| Loading states block interaction | Today, Route, Scan, Money | Low |
| Empty states lack guided next steps | Visits, Follow-ups, Orders, Customer, Tools | Medium |

---

## Screenshot Reference

All screenshots captured at **390×844 @ 2×** (780×1688 physical pixels), full-page.

| File | Screen | Size |
|------|--------|------|
| `today-mobile-seeded.png` | Today / Home | 84 KB |
| `companion-mobile-seeded.png` | Companion | 125 KB |
| `appointments-mobile-seeded.png` | Visits | 113 KB |
| `followups-mobile-seeded.png` | Follow-ups | 55 KB |
| `route-mobile-seeded.png` | Route | 272 KB |
| `money-mobile-seeded.png` | Money | 273 KB |
| `orders-mobile-seeded.png` | Orders | 49 KB |
| `customer-mobile-seeded.png` | Customer 360 | 25 KB |
| `measure-mobile-seeded.png` | Measure | 26 KB |
| `ocr-mobile-seeded.png` | Scan | 52 KB |
| `control-mobile-seeded.png` | Tools | 125 KB |
| `settings-mobile-seeded.png` | Settings | 607 KB |

---

## Next Steps

This baseline documents the **current state** before any UX/CSS/layout/copy changes. Each phase of UX work should:
1. Reference this document for before/after comparison
2. Address specific issues from the catalog above
3. Re-capture affected screens after changes
4. Verify no regressions on unchanged screens