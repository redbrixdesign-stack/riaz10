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

Runtime candidate: cache195. Local full units, affected handler/money/docs checks and initial foundation browser scenarios passed. Final release acceptance and deployment evidence will be appended after completion. Original dirty workspace application changes remain isolated from this release checkout.

## Next foundation increments

1. Unify the task-priority/next-action model itself across every screen, including active-state-aware outcome reminders and end-of-day priorities. Current shared service centralizes customer selection, not the entire future policy engine.
2. Complete source-linked product/parts/measurement readiness and uncertain/context-conflict handling. Correct remaining Home/chat navigation and redundant controls with end-to-end checks.
3. Keep secondary business tools optional by validated work mode; do not remove user records or useful trade tools. Make pilot onboarding simpler.
4. Physical-iPhone field checks and a native/background strategy. The PWA cannot guarantee location delivery while Maps is foregrounded or the phone is locked. No such capability is newly promised here.
