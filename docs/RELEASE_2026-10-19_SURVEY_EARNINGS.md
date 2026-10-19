# Referred surveys and service-call earnings

- Surveys are referrals for orders sold by another adviser. The normal Add Visit flow creates a new customer when needed; no prior Beelo customer/order is required.
- Survey Confirmed asks for the already-sold order value, records survey commission at the configured sales rate minus two percentage points (floor zero), preserving the existing two-stage basis when configured, then offers fitting date/arrival-slot booking. Existing fitting links are reused.
- A retry-safe referral order is created for fitting context. It is not an adviser sale, and no customer deposit or outstanding balance is invented.
- Resolved, parts-needed, revisit-needed and not-a-fault completed service calls record £20. No-shows, access failures, cancellation and uncompleted visits do not earn the fee. Historical visits are not backfilled automatically.
- Earnings feed weekly dashboard/Money and income calculations; original-sale totals and counts stay unchanged. Re-saving replaces the visit earnings instead of adding another payment. This records earnings, not cash received.
- Full npm regression suite passed; storage tests cover real Dexie and shim, new-customer referral order creation/retry/linkage, zero invented balances, earnings totals, cancellation. Synthetic mobile-size Chromium journey covers simple/two-stage/floor calculations, survey completion/fitting prompt, service fee, reload persistence and no-show reversal. Physical iPhone acceptance remains required.
- Source baseline: social-media fix e3e5773. No unrelated dirty-worktree files included.
