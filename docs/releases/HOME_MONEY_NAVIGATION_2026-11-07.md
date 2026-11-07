# Home-led money access — 7 November 2026

## Approved experience

Home is the primary entry point to the adviser's weekly money: earnings/target, expenses and the existing estimated net summary remain compact and tappable. The detailed Money screen remains available; this change does not alter calculations, records, tax assumptions, commissions or payments.

Bottom navigation is now **Home · Tools**. Orders and Money remain registered secondary routes, preserving direct links and customer workflows. Tools contains **Orders overview** and **Money** as fallback entry points; customer-specific finance sections remain inside the customer workspace. Money has a Back control to Home; Orders has a Back control to Tools. If the Home weekly figures fail to load, an explicit Open money details action remains available. No new customer directory or duplicate data entry was added.

## Scope and preservation

Isolated runtime edits affect Money/Orders navigation metadata and headers, Tools entry points, the existing Home summary's accessible name/error fallback, generated assets and cache196. No database schema, provider settings, AI, media, travel, income calculation or marketing-site changes. Original dirty working tree is preserved.

## Verification

New synthetic Chromium/WebKit journey covers the actual Home money-summary button, two-item navigation, detail/back paths, expense-sheet access, Tools fallback/Orders overview, Money reload/deep links, offline navigation, retained customer finance sections and 320–768px fit. Records remain unchanged and no external contact/provider requests are sent.

Existing navigation assertions were updated to the approved two-item navigation. Full unit suite and affected browser workflows run before release. One new harness lookup was corrected to target the existing expense action's rendered control (currently a clickable tile, rather than a native button). Improving that existing tile's keyboard semantics remains separate work; no accessibility certification is claimed.

Final test/deployment receipts will be appended after promotion. Continuous background tracking and financial-estimate limitations remain as documented in the preceding foundation release.
