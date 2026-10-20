# Next-morning planning handover

Home now offers Today's plan alongside Plan tomorrow. The planning view switches
between Today and Tomorrow and loads the same date-keyed saved order as the day
changes. Reorder/reset and route preview use the selected day. Pending proposals
are also accessible from active visit details, including today or later dates.
Discarding a proposal returns to its originating plan or visit.

Today's view deliberately omits the day-before message button; visit details
provide today's communication options. Booked times and navigation remain
separate from proposed ordering. No migrations, automatic messages or midnight
booking changes are introduced. A long-open screen does not auto-switch dates;
use the day selector to refresh the chosen day.

Evidence: root regression suite, build and browser journeys. Extended planning
test simulates next morning using UK-day helper overrides and checks retention
of a saved non-chronological order, selected-day reorder/preview, no tomorrow
reminder on Today and pending proposal access from detail. Prior proposal and
saved-message journeys retained. Physical iPhone/Safari offline acceptance still
open; stale-message protection is the next separate change, not fixed here.

Cache: advisoros-v6-128-planning-handover.
Rollback: ba54d5a, dpl_GxqPBsSDFLogwbZNgoetKoYaAAXM.
