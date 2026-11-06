# Navigation and communication duplication audit — 6 November2026

This is a bounded, evidence-led cleanup queue. Existing customer/visit actions,
records and adviser approvals remain authoritative. Source findings are not
labelled as reproduced until a scenario/test confirms them. No accounting,
booking, earnings, data deletion or provider changes are included.

## 1. Follow-ups primary navigation duplication — P2, completed and live

User request: customer actions now live in Visit/Customer workspace, so remove the
extra bottom-bar destination and keep the all-customer/personal-task overview in
Tools. FollowupsFeature now registers route:false; ControlFeature adds one tile
under Customer. Overview retains derived tasks/history and gains Back to Tools.
Primary navigation becomes Home / Orders / Money / Tools. No new task engine.

Evidence: js/features/followups/followups.js registration/renderAsync;
js/features/control/control.js Customer category; App.registerFeature honors
route:false. Shell/SW versions updated; nav-sensitive tests updated to assert
four destinations. Extended customer-worklist journey exercises real Tools entry,
keyboard activation, overview Back, customer actions and back, manual tasks,
offline/reload and touch-target sizes. 33/33 local browser journeys and hosted run42170669286 passed at runtime commit e0876c8f579cbca4ecb6e4381ffea78461e43cec. Cache182-followups-tools is live at deployment dpl_7i9uT9zvPqipj5bwZyv4r9gPeP4y. All four changed runtime files match source/stage/public; the public Tools/customer worklist journey passed Chromium and WebKit. Native iPhone navigation is not independently verified for this release.

An initial Tools tile with a separate hint caused a crowded flex layout; simplified
it to one label. Decorative icon is hidden from its accessible name. The test
also caught an incorrect #control route in the newly added Back button; corrected
to control before release. Old five-tab test assertions were updated, not removed.

## 2. Home/evening message counts use a parallel legacy model — P2, reproduced; correction candidate implemented

CompanionFeature.buildHomeData independently adds “Messages unsent” for today's
confirmed visits when advisoros_auto_morning_of_ID is absent. It does not consult
purpose-specific send evidence. The same screen also uses FollowupsFeature.loadTasks
for canonical due actions; the legacy alert links to an overview whose tasks do
not include that separate morning-of count. answerEveningReview has another
intro/day-before/morning-of loop, with device-local date comparisons and a
past-visit presence check instead of the canonical introduction-evidence rules.

Reproduction: same-day confirmed synthetic fitting; record an intro_day_before handoff, explicit sent confirmation and customer agreement through real services. Canonical due tasks are empty, but Home and evening both claim one message unsent. Evidence: evidence/navigation-2026-11-06/message-counter-before.json. Next: align summary/query logic with shared tasks, retaining adviser-controlled drafting and no autonomous sends. Candidate removes the parallel counters and outcome-template suggestions from Home/evening/post-visit summaries; the Messages query now reads due template/send-status tasks from the same canonical service. Unknown handoff stays unknown; read failure is explicit. No template, deadline, booking-write or sending rule changed. Focused browser regression passes Chromium/WebKit in London and Kiritimati; full gates pending.

## 3. Visits “Follow-ups” tab is a different sales pipeline — P2, source finding

AppointmentsFeature tab pipeline is labelled Follow-ups but uses DB.getPipeline
for quoted/thinking/partner/compare_quotes/expensive/no-show/unavailable outcomes.
Its Hot/Warm/Cool bands use CONFIG.probabilityDecay rather than customer response
or the canonical communication task state. This label duplicates the all-customer
communication overview and may imply measured sales probabilities.

Next: inspect/reproduce its actual customer journey and choose a plain, accurate
label/context. Preserve existing records and functionality; no silent deletion
of the pipeline or unsupported predictive claim.

## 4. Repeated icon names in Tools accessible labels — P3, source finding

Existing decorative material-symbol spans in Tools mostly lack aria-hidden. The
new Follow-ups tile has a clean accessible name. Audit the remaining tiles before
changing them; retain visible labels, keyboard operation and minimum touch areas.

## 5. Shared header default includes a hash in a route name — P3, source finding

App.renderTopHeader defaults backHref to #today, while App.navigate expects today.
Explicit current secondary-screen back routes generally omit the hash. Inspect
actual default callers and reproduce before a separate narrowly tested correction.

## Preservation

Runtime work is isolated on codex/followups-tools-20261106. Original b833 non-doc
diff SHA256 remains8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
No unrelated original runtime work is included in this release.

## Release notes

Rollback: cache181 deployment https://beelo1-1dclbmeee-beelomvp.vercel.app. Isolated Python-server trials had transient missing-script startup failures (root cause unproven); final Node-server release gates and public journeys passed. These failed trials are not claimed as passes.

## 6. Reschedule legacy reminder flag — P2, source finding

Standard saveReschedule writes a new date/window but only resets dayBeforeSent in the agreed-proposal branch. A snapshot-bound reply becomes stale correctly; a prior true legacy reminder flag may still suppress the new reminder. Reproduce via the actual standard Move UI before correction. The summary regression's rescheduled fixture explicitly resets dayBeforeSent; it is not evidence that the Move UI resets it.

## Scope of this audit pass

Navigation and communication-summary duplication are the two release slices. Remaining source findings are a prioritised investigation queue, not claims that every app screen or production configuration has been exhaustively audited. Existing release journeys provide wider regression coverage.
