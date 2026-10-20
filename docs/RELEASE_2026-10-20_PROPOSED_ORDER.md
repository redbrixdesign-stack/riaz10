# Proposed visit order

Plan tomorrow supports pointer-drag handles and move-up/down buttons, with reset
to booked-time order. Changes persist as a date-scoped encrypted device-local
setting. Appointment dates, arrival windows, message flags and navigation routes
are not changed. The screen explicitly calls this a proposed order, not an
optimised route or customer agreement.

New active visits append to an existing saved order; cancelled, completed or
moved-away visits are filtered from the displayed plan. Saved order entries are
excluded from backups because they are device-key encrypted. No cross-device
sync or old-plan pruning is implemented.

Evidence: full root test suite, build, expanded tomorrow browser journey and
saved-message regression passed. Browser checks include move buttons, synthetic
pointer drag, persistence, reset, unchanged dates, offline reload and unsent
flags. Mobile screenshot visually reviewed. Physical iPhone gesture acceptance,
auto-scroll while dragging and proposed-time/customer-agreement workflow remain
outside this slice; move buttons support moving through long lists.

Cache: `advisoros-v6-125-proposed-order`.
Rollback: `8e5f5da`, deployment `dpl_2qtAzkGReiyCg9uAyqyxUksebmxa`.
