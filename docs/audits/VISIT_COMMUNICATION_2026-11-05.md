# Visit communication correction — 5 November 2026

## User-visible problem and decision

The user's actual entry point is Home → Upcoming visit → Visit. Previous customer
workspace changes did not put follow-ups on that screen. The two top buttons
“Resume saved message” and “Phone contact / history” lacked a coherent placement.
This is a screen-target correction, not evidence of an installed-cache defect.

Implemented candidate (cache181-visit-communication): one **Communication &
follow-ups** section after Visit Details. It contains introduction/reminder/window
status, Call / Message / Log reply, the current visit's canonical next action,
and collapsed customer message/contact history. Saved drafts and manually logged
phone history are secondary controls within history. Inline editors return to the
same Visit and preserve scroll/disclosure state.

Current-visit actions exclude other appointments and duplicate outcome prompts.
History remains customer-wide and labels this visit, another visit, or customer
record. The full Customer workspace remains available. No earnings formulas,
booking outcomes, database schema, AI providers, or autonomous sending changed.

Home featured contact and Visit contact now carry verified customer/appointment
ownership into the existing handoff recorder. Old untracked external handoffs
cannot be reconstructed automatically. A generic message never counts as a
purpose-specific introduction/reminder. Opening an app is not proof of sending;
a reminder sent is not proof that a customer agreed a window. Calls record an
initiated action and adviser-reported outcome, not native call-end/duration.

## Verification and release status

- Build: passed, 54-file manifest and service-worker tokens validated.
- Full npm test, social tests and maintained performance-gate tests: passed.
- New maintained synthetic journey: Chromium and WebKit passed Home → Visit,
  scoped task state, explicit introduction/reminder decisions, ordinary reply
  versus selected-window agreement, generic WhatsApp handoff and send decision,
  call/no-answer recording, cross-customer ownership rejection, reload persistence,
  and no horizontal overflow at320/390/768px. External contact was mocked; foreign
  requests blocked; no POSTs or page errors observed.
- The test caught an initially unregistered Visit button action; registered it in
  the existing safe action dispatcher before passing. Immediate WebKit call-return testing exposed an asynchronous render race: the
  outcome form could open as a modal before the Visit action host existed. Visit
  navigation now exposes its render completion, and contact return awaits that
  refresh. The maintained test deliberately returns immediately; a unit check
  also holds/releases refresh completion. These earlier attempts are not counted as passes.
- All33 maintained release journeys: running. No current release claim yet.
- Native Simulator: pending; see IPHONE_SIMULATOR_PROFILE_CHECK_2026-11-05.md.
- Production remains cache180 until the staged candidate passes release checks.

## Preservation and remaining risks

Runtime edits are isolated in codex/phone-contact-save. Original b833 non-doc diff
SHA256 remains8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
No original runtime files were edited, discarded or deployed.

Native interaction remains an independent acceptance gap. Visit-level notes and
customer-level notes remain distinct records; no claim of full automatic context
merging. This slice does not import WhatsApp replies/delivery or add accounting,
tax filing, CRM replacement, or cross-device synchronization.
