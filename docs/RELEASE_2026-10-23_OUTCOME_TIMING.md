# Outcome reminder timing — 23 October 2026

Status: tested locally; deployment pending.

## Decision / scope

Outcome reminders for today's confirmed unresolved visits become due at scheduled start plus planned duration (`durationSlots × CONFIG.workingWeek.slotMinutes`). Existing legacy default is one 15-minute slot. Arrival-window end is not a visit duration. Future/ongoing scheduled visits remain accessible under Not due yet; elapsed visits stay due. A planned finish is a reminder threshold, not proof the adviser left or completed the job. Early explicit outcome logging and snooze remain available. No completion/sent flag is inferred.

Saved source-linked outcome reminders use the later of current scheduled finish and existing due/snooze time, without rewriting persisted task dates. Moving a booking later therefore prevents an expired old snooze resurfacing prematurely. Cancellation/completion/outcome-based resolution remains unchanged. Missing source reads retain existing reminders rather than resolve them. This slice does not expand the same-day derived outcome list into an historical backlog or change post-fit care, service issues, manual tasks or pre-visit communication rules.

## Implementation / tests

- Shared `Utils.visitOutcomeDueAt` uses elapsed time, with invalid date rejection and finite/default slot handling. Follow-ups derives due status from that threshold; task merging applies the same lower boundary to saved outcome reminders.
- Added `tests/outcome-timing.test.js` to default npm test. It reproduced the original future-visit failure before the fix, then passed future/ongoing/exact finish/overdue, cancelled/completed/recorded outcomes, legacy/malformed durations, arrival-window independence, spring/autumn DST, persisted rescheduling and later snooze preservation. Also passes under America/New_York and Pacific/Kiritimati host timezones.
- Full `npm test` passed. Existing task fake Utils was extended for the new helper; real timing semantics are tested separately rather than stubbed in the timing suite.
- Chromium/WebKit journey passed visible due/later grouping, clock advancing to finish, earlier overdue retention, moved persisted reminder after reload, offline explicit outcome and online reload. Completion preserves separate fitting aftercare. Initial harness assertions were corrected to retain that aftercare; unrelated visit-alert modals were disabled only in its disposable frozen-clock profile after they blocked the WebKit interaction. No product alert behaviour was changed.
- Existing Save-button and pre-visit-purpose journeys passed in both engines. No actual calls, messages or provider requests. Physical-iPhone acceptance remains outstanding.
- Build regenerated exactly Utils, TaskService and Follow-ups minified assets. Cache prepared as `advisoros-v6-140-outcome-timing`; URLs Utils 11, tasks 7, Follow-ups 28. No other runtime functionality or marketing changes. Original dirty checkout untouched.

Evidence: `/private/tmp/beelo-outcome-timing-{chromium,webkit}.png`, `/private/tmp/beelo-outcome-full-suite.log`. Attached isolated branch `codex/phone-contact-save`. Baseline production source `e7be956`, deployment `dpl_9JXqqNJJtpL5C5dm2ANh5JSuENbT` (rollback candidate).
