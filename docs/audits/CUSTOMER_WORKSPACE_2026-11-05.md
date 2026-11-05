# Customer workspace: purpose and evidence

## Decision — 5 November 2026

Beelo remains a pilot-stage, offline-capable working memory beside company
tools. The customer profile is the working surface; the global follow-up list
remains a compact index, with personal reminders preserved. No autonomous
communication, new provider, financial formula or attendance rule is introduced.

| Purpose | Sufficient evidence | Insufficient evidence |
| --- | --- | --- |
| Introduction | Explicit introduction-purpose send confirmation, recorded phone introduction, or an attended prior relationship with this customer | Generic message, unanswered call, a reminder-only confirmation |
| Reminder sent | Adviser explicitly confirms that purpose was sent | Opening WhatsApp/SMS, receiving any reply |
| Visit agreement | Adviser records explicit agreement against the selected visit's current booking snapshot | Sent reminder, silence, another visit's agreement, an old window |
| Issue resolution | Existing explicit issue-resolution workflow | Visit completed, acknowledgement sent or expired |
| Review request | Completed fitting with no unresolved linked issue; eligibility checked again at handoff | Saved draft alone; issue read failure |
| Collection | Explicit adviser responsibility | Company/referral balance; unknown responsibility |
| Earnings/payment | Existing recorded commission/visit earnings; payment evidence identified separately | Order value, estimate or customer ledger treated as commission received |

Corrections retain history. Company-booked visits remain scheduled despite
silence. Rebooking invalidates old-window agreement. Closing a pre-visit task
does not close a separate aftercare obligation. Shared introduction evidence is
customer-specific; agreements remain visit-specific.

## Implemented candidate

- Customer header and visit context, call/message/navigation, unified typed or
  voice customer notes, canonical next actions and a recent/expandable timeline.
- Routine notes, replies, agreements, contact outcomes, reminders, collection
  responsibility and linked expenses edit within the customer page. Expanded
  sections and position survive refresh; nested specialist editors remain
  available through existing deliberate links.
- Separate expected estimates, recorded earnings and commission received
  (currently **not tracked separately**). Linked trip distance and expenses;
  order values/customer payments explicitly distinguished from adviser income.
- Measurements use configured-unit formatting; photos and related visit,
  order, quote, invoice, job and aftercare records remain accessible.
- Atomic reply/agreement saves, booking-snapshot validation, customer ownership
  guards, idempotent agreement operations and retractable evidence.
- Saved introduction/collection tasks reconcile with authoritative evidence;
  source read failures retain tasks rather than invent resolution.
- Cache179 candidate. Existing call/SMS handoff work from a858e95 is included;
  that earlier staged candidate was not previously assumed live.

## Verification and observed defects

- New maintained source/minified rules suite covers partial combined purpose,
  generic messages, ordinary replies, atomic rollback/retry, wrong customer,
  two visits, changed window, retraction, external/unknown collection, saved
  task reconciliation, unresolved issues and acknowledgement expiry.
- New Chromium/WebKit workspace journey covers inline actions, offline note
  save/reload, reply/agreement separation, correction, £200 synthetic earnings,
  untracked commission receipts, unchanged £500 order balance, customer-linked
  trip distance, linked expense return, call outcomes and 320/390/768 widths.
- Existing customer follow-up/worklist journeys pass in both engines, including
  purpose-specific send confirmation, no-answer, snooze, retraction and back.
- Found and fixed: late disclosure restoration clashed with a fresh tap;
  page-versus-inner-scroll restoration after edits; an unfinished visit today
  being skipped after its start time; loss of explicitly selected visit context;
  workspace script ordering; raw measurement units; generic sent-message
  evidence being treated as introduction. Date-dependent smoke fixture now
  uses a fixed clock without changing its assertions.
- An overlapping build/browser attempt reached a failed-load state and an
  earlier run reported missing TaskService. These are retained diagnostics,
  not passing evidence. Release acceptance must run on the frozen build.
- Full release result and deployment identity are recorded below when verified.

All records used for acceptance are unmistakably synthetic, in isolated browser
contexts. Native launch/provider helpers are intercepted; no real person was
called or messaged. No user's browser data was cleared.

## Limits and next acceptance

Native iPhone app switching, microphone permissions, WhatsApp/SMS edits,
delivery, reply import, call end/duration and VoiceOver are not established by
desktop WebKit. Calls record launch time and adviser-entered outcome only.
Measurement/job/invoice specialists still have deliberate separate screens;
this is not a claim every editor is inline. No new tax, accounting or filing
capability. Product truth/financial reporting needs continuing pilot validation.

Original dirty runtime checkout b833 remains untouched; work is isolated in
phone-contact-save. Original non-doc diff hash:
`8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`.

## Verified release

- Runtime source: `2a8b9ad206a0b220159715ef6c1a45685ae14639`.
- `npm run verify:release` passed locally: build, source/minified unit suites,
  social safety and performance-gate contract tests, then **32/32 browser
  journeys**. This does not assert a new measured Lighthouse performance score.
- Hosted [run 41941303103](https://github.com/redbrixdesign-stack/riaz10/actions/runs/41941303103)
  passed at that exact source: root/server tests, dependency audits and **32/32
  browser journeys**. Saved local and hosted summaries contain the source SHA.
- Scoped WCAG A/AA axe scans found zero violations in the synthetic workspace
  in Chromium/WebKit (307f689 targeted build, unchanged layout in final source).
  This is not native accessibility certification.
- Production stage `dpl_6yk1WHUdLKaN9nit4pGTMQ2eUnKU`,
  `https://beelo1-qzqyortrr-beelomvp.vercel.app`, Other/static + existing API
  functions, READY. Build interval 15.705 seconds. All 14 changed runtime files
  matched the frozen source through authenticated stage reads.
- Promoted that exact production stage without rebuilding. Public
  `https://beelo.beelestial.co.uk/` serves **cache179-customer-workspace**;
  all 14 runtime hashes match the stage. CLI reports successful promotion;
  deployment API still returned an empty alias list, so public hash checks are
  the evidence of what the custom domain serves.
- Live-domain workspace, customer-follow-up and call/SMS/WhatsApp handoff
  journeys passed in both Chromium and WebKit, using isolated synthetic records
  and intercepted native launch helpers. No real contact or provider call.
- A bounded production function-log query found no matching error/fatal entries
  between 00:27:50 and 00:37:50 UTC on 5 November. It does not establish native
  app/client monitoring or provider health; no monitoring configuration changed.
- Earlier workspace stages (0ce97b4, 88542cc and 307f689) were superseded, never
  promoted. Their interrupted/failed runs are not counted as release acceptance.
- Rollback baseline: cache176 / e6d07dc /
  `dpl_2xwq5GjkdnpgDaw1oDDTtfn9GfDg`.

Evidence and screenshots: [customer-workspace-2026-11-05](evidence/customer-workspace-2026-11-05/).
Full native device acceptance, broader legacy async save/read-failure coverage,
and the existing communications-at-rest privacy review remain separate follow-up
work. Customer notes/call-detail encryption is not a claim every legacy message
field is encrypted. No public positioning, pilot approval or commercial traction
claim was changed.
