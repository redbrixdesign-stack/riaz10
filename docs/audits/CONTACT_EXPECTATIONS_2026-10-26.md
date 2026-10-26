# Contact expectations and customer communication record — 26 October 2026

## Decision and scope

Muhammad confirmed Hillarys requires attendance even without a customer response. Silence must not cancel a booking or authorise skipping travel. Describe recorded behaviour, never label customers difficult/unresponsive or invent response scores.

## Implemented

- Initial pre-visit draft explains the call before departure, ETA message and keeping the phone handy.
- Tomorrow's first contact combines that with a gentle acknowledgement/change-of-plans request; no second duplicate message is created.
- Day-before drafts ask whether the customer is expecting the adviser, and explain avoiding unnecessary journeys. Known introductions remain suppressed; social links remain initial-contact-only.
- Manual and scheduled suggestions share the same builder. AI rewrites are checked for call/ETA wording and the reminder acknowledgement, with fallback on missing rules or detected conditional-attendance/cancellation wording. This is not universal model-output certification; review remains required. Adviser edits remain theirs; saved drafts are not overwritten.
- Customer profile shows counts of confirmed outbound sends, manually recorded inbound replies and unconfirmed handoffs. Expandable full saved message/reply text is escaped and customer-filtered.
- Existing Log reply remains manual. New Log contact attempt saves a dated internal note, not a sent message, received reply or booking agreement. Existing encrypted communication storage is reused; no migration or external integration.
- Offline status banner now sits below modal dialogs: browser testing found it physically blocked Save in the contact-attempt form.
- Log reply's decorative icon is hidden from accessibility APIs, giving the button the clear accessible name “Log reply”.

## Boundaries and remaining improvements

- No WhatsApp Send/read/reply detection; history is only as complete as adviser records. Imported/previously-sent acknowledgements may lack original message text; UI says so.
- No automated customer risk classification, response percentage, delivery claim, cancellation or autonomous send.
- Contact attempts are customer-level notes, not automatically matched to a booking. Future per-visit acknowledgement/contact linkage should be explicit, with correction/retraction support before adding a response-rate metric.
- Existing saved drafts deliberately remain unchanged. Adviser must review old drafts; new wording applies to newly generated drafts.
- Physical iPhone/WhatsApp switching and screen-reader checks remain supervised field checks; browser WebKit is not physical-device certification.

## Verification

Source/minified continuity tests cover separate and combined wording, social-footer order, no conditional cancellation, existing identity/journey safeguards. Maintained Chromium/WebKit journey covers offline contact-attempt and reply save, reload, escaped full history and factual counts. Release/deployment evidence is recorded in the living development record after verification.

Investigation retained: initial local checks found an offline banner intercepting Save and the reply button's icon polluting its accessible name; both fixed. Hosted run 40406181226 failed because the newly added test reloaded while reply saving was still in progress (the old profile remained behind the dialog). The corrected test waits for the dialog to close and the saved reply count to update before reload, then still requires the reply text/count to survive. No persistence assertion was removed. A final source change also ensures a reminder used as the first contact retains initial identity/social-link policy.

Hosted run 40407469632 then stopped at the previously observed expense-finder refresh race: its edit dialog had closed but the filtered list still showed the old £12.50 record when asserted. Test-only commit 8097b8d waits for the actual expected “No matching expenses” result before retaining the same content assertion and saved £12.75/date/receipt checks. No Money code, financial rules, workflow, dependency or deployed asset changed in that commit. Tests/docs are excluded by `.vercelignore`, so the staged runtime remains byte-identical.

## Deploy result

- Production READY: https://beelo.beelestial.co.uk/; exact https://beelo1-qcu3u848l-beelomvp.vercel.app, deployment dpl_C9vBuonBtMaRtTPiQtFbiUutX82Q. Framework Other; build12.110s. Same production stage promoted without rebuilding.
- Runtime commit5ec3d3844dc8b4689faa91b6198f440dff5cb3ad; final acceptance8097b8db929bc9c163b3a1789958361e26a13353 contains only the test wait change. Hosted40408518270 SUCCESS: artifact source verified, all23 journeys pass plus unit/server checks. Local final units/focused Chromium/WebKit pass; earlier candidate full23/performance pass is retained separately, not labelled the exact final source.
- Talk33/Customer17/MessageScheduler15, components62/cache168-contact-expectations; DB49 unchanged. Six stage/public assets byte-match.
- Observability: no error/fatal function logs21:55:22–22:05:22UTC26 October. Narrow window only, not a claim of client/native correctness; no new monitoring/drains configured. Rollback: prior cache167/deployment dpl_5mK86FQD4Rm9QFsa5f1Mki8zc5pW.
- Public Chromium/WebKit synthetic communication/contact-attempt/reply flows pass after promotion, including offline writes, acknowledged-save reload and readable full escaped history. No real messages/provider calls. Original workspace non-doc dirty diff hash remains8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
