# Communication continuity and introductions — 26 October 2026

## Story, authority and product boundary

Muhammad reported an on-my-way message introducing him again after he had
already introduced himself, and requested social links, clear window access and
parking considerations in introduction copy. Scope: communication wording,
evidence-aware drafting and regression protection; existing manual WhatsApp
approval/confirmation remains. No real customer was contacted in testing.

## Confirmed gaps and repair

1. Reproduction: first appointment, introSent already true, AI rewrite or
   scheduler context. buildMessageContext exposed first-visit count but no
   introduction evidence. The model could treat first visit as first contact.
   New separate advisor_already_introduced/introduction_required fields use
   current/prior same-customer introduction flags, confirmed introduction-purpose
   communications, non-retracted recorded phone introductions, and actual
   attended outcomes. Unsent handoffs, inbound replies, reminder-only purpose,
   unlogged past appointments and no-shows are not introduction evidence.
2. Initial deterministic builder omitted social links even though the AI prompt
   requested links for every stage. Initial-contact copy now appends available
   configured HTTPS Facebook/Instagram URLs once, not invented/replacement URLs.
   Includes clear window area, parking restrictions/permits and access details;
   acknowledges known notes rather than re-asking. Survey copy stays survey-
   specific. Already-introduced customers get confirmation/change-check copy,
   not the opening consultation questionnaire again.
3. Journey updates now use local, short on-way/late copy consistently from
   Home/visit, trip scheduler and AI entry points. No repeated advisor identity,
   social footer, preparation questionnaire or model request. Known ETA retained;
   no fabricated15–20-minute fallback when live location/ETA is unavailable.
   The user can still edit. The preview offers Use short journey update instead
   of a misleading AI-rewrite control for these two stages.
4. Saved unsent/manual wording is not overwritten on opening. Restored journey
   drafts explicitly warn that old introduction/ETA may remain; adviser may edit
   or explicitly rebuild the short update. This preserves the device's drafts.
5. Non-journey AI drafting gets stage-aware prompt and local fallback for repeat
   self-introduction or initial copy missing identity/title/window prep/parking.
   Canonical social footer is initial-contact only. Delayed AI results cannot
   overwrite a different editor, a newer request or text edited during generation.
   Existing Anthropic proxy retained: no SDK/model/provider/env migration.
6. Past unlogged/no-show appointments no longer count as attended visits in the
   message context; their real saved measurements can still supply context.
   Missing linked order data says not supplied, not that no order exists.
   No financial calculation, booking agreement or commercial capability added.

## Verification and release

Source/minified scenario tests: confirmed vs handed-off, reminder-only combined
resolution, current/prior intro flags, phone introduction/retraction, no-show and
unlogged attendance, type-aware prep, known parking, invalid/missing socials,
model-response fallback, manual/trip journey policy, no journey provider call,
no invented ETA. Existing feature assertion updated intentionally: an elapsed
unlogged visit is not attendance, not a weakened timeout/assertion.

Fresh Chromium/WebKit browser journey: initial preview/footer, mocked AI response
missing required content, explicit adviser-recorded intro, combined reminder
without repeated identity, journey default, old saved text preserved and explicit
refresh, offline edit/reopen, reload/late-without-ETA, retained booking time and
separate reminder flag. Delayed mocked AI cannot replace user-edited wording.
Only synthetic records and mock AI transport; no WhatsApp handoff, external
provider request, real credential or real customer data.

Release gates/deployment pending. Exact source, hosted acceptance, asset parity,
public checks and rollback are recorded here before claiming LIVE.

## Open limits / next priorities

- Beelo cannot observe a personal WhatsApp Send or read/delivery status. Messages
  sent outside Beelo need explicit Already sent / phone-contact recording.
- Only on-way/late wording is fully local/deterministic. Other AI wording still
  needs human review; heuristic fallback is not general hallucination prevention.
- Existing fitting/service/review first-contact role conventions retained; no
  wholesale communication cadence/task lifecycle or client-data migration.
- Existing saved drafts stay editable; they are not silently rewritten as part
  of deployment. No physical-iPhone/WhatsApp-return/VoiceOver certification.
- Next: supervised field check, then wider communication expiry/late schedule
  transitions and broader working-memory MVP; no pilot-approval claim inferred.

