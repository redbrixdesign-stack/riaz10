# Adviser companion foundation — 7 November 2026

## Purpose and implemented behavior

First foundation increment following the [companion-purpose audit](../audits/COMPANION_PURPOSE_AUDIT_2026-11-07.md). Existing records, optional tools and user changes are preserved; this is not the complete proposed overhaul.

- A read-only `AdviserContext` service now selects the working customer consistently for Home, Ask Today and What next. Newer travel/arrival signals outrank an earlier unfinished booking. A completed outcome remains on site only when genuinely tracked; departure/cancellation cannot become an inferred active visit. Historical-day selection does not use today's active state. No outcomes, trip logs, earnings or bookings are changed by selection.
- Every advertised companion command uses an explicit handler map, including multiword/hyphenated commands. General Orders is no longer interpreted as an order-number query. Unrecognized requests receive a safe fallback. “What next?” returns recorded current context and one preferred Review/Open visit action; it does not assume a future visit should start now or launch navigation/messages automatically.
- Optional AI phrasing cannot overwrite the protected current-visit/Today, Money or Orders answers. AI intent routing, communication drafts and other existing AI capabilities remain available. This is local evidence-driven guidance, not an autonomous agent or new model integration.
- Visit next-actions include linked-order fitting-date tasks while excluding unrelated appointments. This preserves the actual Upcoming → Visit entry path.
- Current visit parking/access facts take precedence over customer notes, with provenance and explicit conflict wording. No claim is made that missing product-readiness intelligence is now implemented.
- Adviser collection prompts require explicitly recorded adviser responsibility. Company/external orders no longer create those prompts, show paid from a zero balance, or offer payment recording/reminder actions in Orders. Unknown responsibility is not silently assigned. Existing unknown-order records and manual recording flows remain; this does not migrate their ownership or erase balance evidence.
- Shared mileage eligibility includes only explicitly confirmed business travel, clamps negative distances and excludes private/unreviewed records from companion, Money weekly and tax-data aggregates. The tax disclosure uses a real boolean attribute. These remain estimates; this increment does not certify tax completeness, change rates or implement filing. Period-specific annual mileage-band reconciliation across every summary remains a further review item.

## Verification and preservation

New unit scenarios cover command dispatch and read-only selection: latest activity, ties, completed-but-tracked attendance, departure, cancellation, historical views, unknown/external collections and mileage eligibility. Money storage fixtures explicitly confirm trips through the stored-record update boundary; private and unconfirmed controls remain excluded.

The maintained browser release runner includes a new real encrypted-storage synthetic foundation journey in Chromium/WebKit. It checks actual Ask input, Home/Ask agreement, one preferred action, multiword dispatch, linked fitting-date visibility, note conflicts, external balances, mileage eligibility and tax disclosure. It captures no real customers or outgoing messages/provider requests. Existing release workflows run separately to protect notes/media, scheduling, timing, backups, offline startup and communications.

Live runtime: `00196b4`, cache195, deployment `dpl_A6fMe98VQrDKLg2KUKa8o2Awzteo` (`beelo1-14en9q3m5-beelomvp.vercel.app`). The exact staged deployment was promoted without rebuilding. All 11 selected changed runtime assets match local, protected staged and public hashes. Public foundation journeys passed in Chromium/WebKit (12 screen states each); no real contacts, POST/provider requests or page errors in that journey.

The complete unit suite passed on the integrated foundation; final affected appointment-save/type, fitting, companion, money and documentation checks passed. The complete 42-journey browser baseline passed, followed by six affected checks after the final Visit/payment correction: foundation, automatic customer time, deferred fitting, payment linking, cold offline and service-worker update. Social checks and the maintained Lighthouse-gate contract passed; this is not a new Lighthouse score or physical-device certification.

Visual review caught the Visit's external-order zero-balance “Paid” label and company fitting collection field; both were corrected before promotion. Two harness assertions were aligned with the actual inline outcome host and the broader external-payment wording. Initial direct staged browser access reached Vercel sign-in; authenticated CLI asset verification was used without weakening protection, followed by real public-browser acceptance.

Evidence: [verification receipt](evidence/adviser-foundation-20261107/verification.json), [baseline](evidence/adviser-foundation-20261107/baseline-summary.json), [final affected checks](evidence/adviser-foundation-20261107/final-affected-summary.json), [staged hashes](evidence/adviser-foundation-20261107/staged-hashes.json), [public hashes](evidence/adviser-foundation-20261107/public-hashes.json), [live next-action screen](evidence/adviser-foundation-20261107/chromium-ask-what-next.png), [linked survey action](evidence/adviser-foundation-20261107/chromium-survey-visit.png), [company fitting boundary](evidence/adviser-foundation-20261107/chromium-company-fitting-boundary.png).

Original dirty workspace application changes remain isolated and unchanged (tracked non-documentation diff SHA-256 `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`).

## Next foundation increments

1. Unify the task-priority/next-action model itself across every screen, including active-state-aware outcome reminders and end-of-day priorities. Current shared service centralizes customer selection, not the entire future policy engine.
2. Complete source-linked product/parts/measurement readiness and uncertain/context-conflict handling. Correct remaining Home/chat navigation and redundant controls with end-to-end checks.
3. Keep secondary business tools optional by validated work mode; do not remove user records or useful trade tools. Make pilot onboarding simpler.
4. Physical-iPhone field checks and a native/background strategy. The PWA cannot guarantee location delivery while Maps is foregrounded or the phone is locked. No such capability is newly promised here.
