# Contact expectations and customer communication record — 26 October 2026

## Decision and scope

Muhammad confirmed Hillarys requires attendance even without a customer response. Silence must not cancel a booking or authorise skipping travel. Describe recorded behaviour, never label customers difficult/unresponsive or invent response scores.

## Implemented

- Initial pre-visit draft explains the call before departure, ETA message and keeping the phone handy.
- Tomorrow's first contact combines that with a gentle acknowledgement/change-of-plans request; no second duplicate message is created.
- Day-before drafts ask whether the customer is expecting the adviser, and explain avoiding unnecessary journeys. Known introductions remain suppressed; social links remain initial-contact-only.
- Manual and scheduled suggestions share the same builder. AI output missing the contact expectations or proposing conditional attendance/cancellation falls back to the safe draft. Adviser edits remain theirs; saved drafts are not overwritten.
- Customer profile shows counts of confirmed outbound sends, manually recorded inbound replies and unconfirmed handoffs. Expandable full saved message/reply text is escaped and customer-filtered.
- Existing Log reply remains manual. New Log contact attempt saves a dated internal note, not a sent message, received reply or booking agreement. Existing encrypted communication storage is reused; no migration or external integration.
- Offline status banner now sits below modal dialogs: browser testing found it physically blocked Save in the contact-attempt form.

## Boundaries and remaining improvements

- No WhatsApp Send/read/reply detection; history is only as complete as adviser records. Imported/previously-sent acknowledgements may lack original message text; UI says so.
- No automated customer risk classification, response percentage, delivery claim, cancellation or autonomous send.
- Contact attempts are customer-level notes, not automatically matched to a booking. Future per-visit acknowledgement/contact linkage should be explicit, with correction/retraction support before adding a response-rate metric.
- Existing saved drafts deliberately remain unchanged. Adviser must review old drafts; new wording applies to newly generated drafts.
- Physical iPhone/WhatsApp switching and screen-reader checks remain supervised field checks; browser WebKit is not physical-device certification.

## Verification

Source/minified continuity tests cover separate and combined wording, social-footer order, no conditional cancellation, existing identity/journey safeguards. Maintained Chromium/WebKit journey covers offline contact-attempt and reply save, reload, escaped full history and factual counts. Release/deployment evidence is recorded in the living development record after verification.
