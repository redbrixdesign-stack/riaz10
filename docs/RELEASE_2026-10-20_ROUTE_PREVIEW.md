# Proposed route preview

Plan tomorrow → Preview proposed route reads the latest active visits and saved
proposed order. It compares booked-order and proposed-order estimated distances,
shows the ordered visits and each leg, and includes departure/return to business
base only when its coordinates and address are saved.

This is a local planning preview, not a road map, navigation handoff, live traffic
calculation or optimisation. It uses saved coordinates and the existing 1.3 ×
straight-line allowance. Missing, invalid or implausible legs suppress the total;
they are not skipped to create a misleading estimate. No geocoding, external
requests, appointment writes, mileage start or messages occur. Booked-time
reversals and pending time proposals are highlighted.

Verification: full regression suite, expanded tomorrow/browser route checks,
time-proposal and message-draft journeys. Tests cover missing/invalid coordinates,
base-return legs, saved proposed ordering, reversed-booking warning and preserved
flows. Synthetic records only. Screenshot: /private/tmp/beelo-route-preview.png.
Physical iPhone acceptance remains pending. Saved coordinate accuracy is not
independently verified; no claimed traffic or actual mileage savings.

Cache: advisoros-v6-127-route-preview.
Rollback: be2084d, dpl_HEKskuGBHQpquFTv8r5Qk7gtQ5vL.
