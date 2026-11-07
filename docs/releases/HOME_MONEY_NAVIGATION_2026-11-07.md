# Home-led money access — 7 November 2026

## Approved experience

Home is the primary entry point to the adviser's weekly money: earnings/target, expenses and the existing estimated net summary remain compact and tappable. The detailed Money screen remains available; this change does not alter calculations, records, tax assumptions, commissions or payments.

Bottom navigation is now **Home · Tools**. Orders and Money remain registered secondary routes, preserving direct links and customer workflows. Tools contains **Orders overview** and **Money** as fallback entry points; customer-specific finance sections remain inside the customer workspace. Money has a Back control to Home; Orders has a Back control to Tools. If the Home weekly figures fail to load, an explicit Open money details action remains available. No new customer directory or duplicate data entry was added.

## Scope and preservation

Isolated runtime edits affect Money/Orders navigation metadata and headers, Tools entry points, the existing Home summary's accessible name/error fallback, generated assets and cache196. No database schema, provider settings, AI, media, travel, income calculation or marketing-site changes. Original dirty working tree is preserved.

## Verification

New synthetic Chromium/WebKit journey covers the actual Home money-summary button, two-item navigation, detail/back paths, expense-sheet access, Tools fallback/Orders overview, Money reload/deep links, offline navigation, retained customer finance sections and 320–768px fit. Records remain unchanged and no external contact/provider requests are sent.

Existing navigation assertions were updated to the approved two-item navigation. Full unit suite and affected browser workflows run before release. One new harness lookup was corrected to target the existing expense action's rendered control (currently a clickable tile, rather than a native button). Improving that existing tile's keyboard semantics remains separate work; no accessibility certification is claimed.

## Live release evidence

Runtime `40d6baa`, cache196, exact deployment `dpl_AzvNkpyzC8eYTLnRh2CpNc9JUcqD` (`beelo1-ro6ktt6ay-beelomvp.vercel.app`) was staged, authenticated asset-verified and promoted without rebuilding. Six local/staged/public changed assets match. Public navigation flows passed in Chromium/WebKit, including an injected Home-summary failure with a working Open money details fallback. Screenshots were reviewed; no real contact or provider requests were made by the new journey.

Full unit suite passed. Seven affected browser journeys passed: home-money navigation, Home workspace, navigation review, customer worklist, customer workspace, cold offline startup and service-worker update. Existing calculation/records behavior is retained. No physical-iPhone acceptance or full accessibility certification is claimed. Continuous background tracking and financial-estimate limitations remain as documented in the preceding foundation release.

[Verification](evidence/home-money-navigation-20261107/verification.json) · [Browser checks](evidence/home-money-navigation-20261107/browser-summary.json) · [Public journey](evidence/home-money-navigation-20261107/public-journey.json) · [Staged hashes](evidence/home-money-navigation-20261107/staged-hashes.json) · [Public hashes](evidence/home-money-navigation-20261107/public-hashes.json) · [Home](evidence/home-money-navigation-20261107/home-money-entry-chromium.png) · [Tools](evidence/home-money-navigation-20261107/home-money-tools-chromium.png)

Original tracked non-documentation working-tree diff remains SHA-256 `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`. Runtime changes remain isolated on `codex/adviser-workflow-20261107`; no existing user work was overwritten.
