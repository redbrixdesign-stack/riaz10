# Scheduled prompts after booking changes

Confirmed regression: an existing fired-stage flag suppressed morning prompts
after a visit's date/time changed. The corrected test fails against previous
production scheduler source and passes with this release.

Database appointment time updates now record scheduleChangedAt, clear only that
visit's scheduled-prompt flags and rebuild timers. Status/outcome updates rebuild
the schedule without resetting unchanged-time flags; note/proposal-only changes
do not refresh it. Cancelled/completed visits are excluded. Old timer callbacks
read the current booking and reject stale dates, cancellations and completion.
An additional check after draft generation rejects changes while awaiting AI.
Overlapping schedule rebuilds discard an older fetch result.

For moved bookings, a pre-change message or message about another visit no longer
suppresses the morning prompt. Confirmed communication after the change for the
same visit can still suppress it. Existing non-rescheduled behaviour is retained.
No sent history is erased and no messages are sent autonomously.

Evidence: full root regressions, scheduler cases (reset, same-time preservation,
stale callbacks, cancellation and pre-change communications), browser DB update
integration, proposal and stale-draft journeys. Synthetic contacts, mock handoffs.
Phone background suspension remains a limitation: prompts require the app running.
Physical iPhone and existing WebKit offline acceptance remain outstanding.

Cache: advisoros-v6-130-scheduler-refresh.
Rollback: 1a9b80d, dpl_BmYwEBJdDzDGxCuFnfD7NHEt8xh2.
