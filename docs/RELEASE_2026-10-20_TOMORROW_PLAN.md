# Tomorrow planning — first slice

Home now offers **Plan tomorrow**. This local-data view lists tomorrow's active
visits in booked-time order, with visit type, address, arrival window when
recorded, access notes, visit notes and customer notes. Long notes are excerpts;
Review visit opens the existing full details. Cancelled and outcome-recorded
visits are omitted. Empty and load-failure states are explicit.

Each visit offers the existing context-aware reminder preview and saved-message
recovery. Introduction/day-before selection remains in TalkFeature. Sent labels
are adviser-recorded states, not delivery or customer-agreement evidence.
No appointment writes, migrations, route optimisation or automatic sending are
introduced. Reordering and proposed/agreed time management are later slices.

Verification: full root regression suite and build passed. The synthetic mobile
browser journey tests Home entry, empty state, date/status filtering, chronology,
customer/access context, reminder preview, unsent flags, offline reload and detail
navigation. Saved-message browser regression also run separately. Screenshot:
`/private/tmp/beelo-tomorrow-plan.png`. No physical iPhone acceptance claimed.

Release cache: `advisoros-v6-124-tomorrow-plan`.
Previous release / rollback: commit `57f692f`,
deployment `dpl_EpBga7Zoh8T2vH8TZJwQCEuLnWze`.
No changes to marketing site, external messaging, provider settings or user data.
