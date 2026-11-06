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

## 2. Home/evening message counts use a parallel legacy model — P2, completed and live

CompanionFeature.buildHomeData independently adds “Messages unsent” for today's
confirmed visits when advisoros_auto_morning_of_ID is absent. It does not consult
purpose-specific send evidence. The same screen also uses FollowupsFeature.loadTasks
for canonical due actions; the legacy alert links to an overview whose tasks do
not include that separate morning-of count. answerEveningReview has another
intro/day-before/morning-of loop, with device-local date comparisons and a
past-visit presence check instead of the canonical introduction-evidence rules.

Reproduction: same-day confirmed synthetic fitting; record an intro_day_before handoff, explicit sent confirmation and customer agreement through real services. Canonical due tasks are empty, but Home and evening both claim one message unsent. Evidence: evidence/navigation-2026-11-06/message-counter-before.json. Next: align summary/query logic with shared tasks, retaining adviser-controlled drafting and no autonomous sends. Candidate removes the parallel counters and outcome-template suggestions from Home/evening/post-visit summaries; the Messages query now reads due template/send-status tasks from the same canonical service. Unknown handoff stays unknown; read failure is explicit. No template, deadline, booking-write or sending rule changed. Focused browser regression passes Chromium/WebKit in London and Kiritimati; 34/34 local and hosted journey checks passed (run42172498605, commit cce588b76c4c83bea6c4e2300a9d631699799c33). Cache183-message-summaries is live at dpl_93xXWsHJZ6Np3QKM4a4MDhxH8ZVK. Three runtime hashes match source/stage/public; the public message-summary journey passed both engines in London/Kiritimati.

## 3. Visits “Follow-ups” tab is a different sales pipeline — P2, source finding

AppointmentsFeature tab pipeline is labelled Follow-ups but uses DB.getPipeline
for quoted/thinking/partner/compare_quotes/expensive/no-show/unavailable outcomes.
Its Hot/Warm/Cool bands use CONFIG.probabilityDecay rather than customer response
or the canonical communication task state. This label duplicates the all-customer
communication overview and may imply measured sales probabilities.

Next: inspect/reproduce its actual customer journey and choose a plain, accurate
label/context. Preserve existing records and functionality; no silent deletion
of the pipeline or unsupported predictive claim.

## 4. Repeated icon names in Tools accessible labels — P3, reproduced in both browser accessibility trees

Existing decorative material-symbol spans in Tools mostly lack aria-hidden. The
new Follow-ups tile has a clean accessible name. Audit the remaining tiles before
changing them; retain visible labels, keyboard operation and minimum touch areas.

## 5. Shared header default includes a hash in a route name — P3, not reproduced in the planning journey

App.renderTopHeader defaults backHref to #today, while App.navigate expects today.
Explicit current secondary-screen back routes generally omit the hash. Actual Plan tomorrow → Back returned to #today correctly in both engines. No user-visible defect reproduced; no change justified by that check.

## Preservation

Runtime work is isolated on codex/followups-tools-20261106. Original b833 non-doc
diff SHA256 remains8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
No unrelated original runtime work is included in this release.

## Release notes

Rollback: cache181 deployment https://beelo1-1dclbmeee-beelomvp.vercel.app. Isolated Python-server trials had transient missing-script startup failures (root cause unproven); final Node-server release gates and public journeys passed. These failed trials are not claimed as passes.

## 6. Reschedule legacy reminder flag — P2, completed and live

Standard saveReschedule writes a new date/window but only resets dayBeforeSent in the agreed-proposal branch. A snapshot-bound reply becomes stale correctly; a prior true legacy reminder flag may still suppress the new reminder. Reproduced through actual standard Move in Chromium/WebKit: prior reminder stayed true, agreement became stale, and no new reminder was due. Cache183's summary fixture explicitly reset dayBeforeSent; it did not prove Move correctness. Cache184 invalidates only the previous reminder on date/window/type changes, keeps introduction/history/earnings, and uses UK time for Move display and save. Source/minified regression passes; real Move journey now passes both engines in London/Kiritimati. Build/unit/social/performance gates and 34/34 local + hosted browser journeys passed (run42174670415, runtime dea0700d6b13c2e2398cafa8f7c4a06045a68bbb). Live deployment dpl_24k7g9v59N3oQ1GUYEqqxNbHmtKN; four runtime files match source/stage/public. Public Move/summary journey passes both engines in London/Kiritimati.

## Scope of this audit pass

Navigation, communication-summary duplication and reschedule reminder continuity and capacity clock consistency are separate release slices. Remaining source findings are a prioritised investigation queue, not claims that every app screen or production configuration has been exhaustively audited. Existing release journeys provide wider regression coverage.

## 7. Capacity warning outside UK device timezone — P2, reproduced; correction candidate implemented

During the actual Move regression, a 10:00 UK appointment triggers “outside your configured working hours” in a Kiritimati device context. The test explicitly reviews/accepts Save anyway and verifies the saved UK time. This is not a pass for capacity-warning accuracy. Browser evidence also shows suggested slots on the previous UTC date with 00:00 UK labels. Candidate cache185 uses a shared Utils.ukDateTimeISO conversion for capacity envelopes/suggestions and the existing Move/proposal API, removing duplicate conversion code. Source/minified tests pass in London, UTC, New York and Kiritimati across GMT/BST/DST/boundaries, overlaps/leave/exclusion and UK-vs-UTC day boundaries; missing/ambiguous times are rejected. Browser Move passes both engines without warning bypass, with 09:00 UK suggestions on the selected day. Full release gates pending; not live yet.

## Verified navigation/a11y diagnostic

Tools has exactly one Follow-ups tile and four bottom destinations. Existing tiles expose icon tokens in accessible names (e.g. receipt_long Log Expense); new Follow-ups tile does not. Plan tomorrow Back correctly returns Home in both engines despite the suspicious default route string. Evidence: tools-accessibility-before.json.
