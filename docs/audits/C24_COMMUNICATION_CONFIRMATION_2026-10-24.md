# C24 — persistent, adviser-controlled WhatsApp completion

## Story and evidence

The adviser sent introductions in WhatsApp but saw the same introduction drafts
again. They explicitly report no return confirmation popup. Their screenshots
show a generic Home confirmation card alongside the Follow-ups count. Raw
screenshots contain real customer information and are not republished here.

Source findings: the external opener ran before the awaited local handoff write;
iOS suspension/navigation could therefore interrupt recovery. Only one pending
localStorage pointer was retained, so another handoff overwrote that pointer.
Home exposed it separately from derived follow-ups. Confirmation updated the
communication and visit flags separately, swallowed flag-write errors and did
not refresh the underlying inbox. These are verified code defects; the exact
physical-device suspension sequence was not captured, so that causal mechanism
is likely, not independently proven for this user's messages.

## Implemented prototype repair

- Save the local handoff before invoking WhatsApp. Persistence failure retains
  the draft and does not invoke the opener. A handoff is not evidence of sending.
- Derive a multi-customer, purpose-specific pending queue from communication
  records/events, surviving reload and replacement of the old single pointer.
  Show **Record whether sent** instead of another draft for that obligation.
- Confirm only what the adviser actually sent. Combined drafts require choosing
  introduction only, introduction plus reminder, or reminder only. Opening
  WhatsApp, closing a sheet and receiving no error never mark anything sent.
- Add **Already sent…** to supported introduction, reminder, post-fit and service
  cards for messages sent without a recoverable handoff. Explicit confirmation
  sends nothing; the original text is not invented or reconstructed.
- Atomically record the adviser decision, event and matching appointment flags.
  Retry/double-submit is idempotent; failed writes roll back. Repeated matching
  handoffs become superseded history, never fictitious sent records.
- Check customer ownership and re-reviewed booking snapshot. A known changed
  booking's old message cannot clear the current visit reminder. Legacy rows
  without a snapshot require explicit review of the current booking.
- Refresh only the owned Home/Follow-ups view. Late save/error callbacks cannot
  replace another editor/modal. Other customers' records remain independent.
- Home keeps one shared Follow-ups entry, not a second generic confirmation
  alert. History says **unconfirmed by deadline**, not proof a message was never
  sent. Expired/cancelled/concluded pre-visit handoffs leave the active queue but
  remain in communication history for explicit review.

No autonomous messages, provider calls, schema migration, bulk historical sent
inference, accounting changes, key changes or deletion of customer data.

## Verification

- Negative original-source contract rejects the missing durable confirmation API.
- Real Dexie/source and minified tests cover transaction rollback on event-write
  failure, wrong-customer/stale-review rejection, duplicate confirmation,
  superseding attempts, not-sent decisions, partial-purpose confirmation,
  rescheduling guard and already-sent operation idempotence.
- The minimal fallback database has no cross-table transaction support. New
  sent-state mutations fail closed there, before flags/history are changed;
  recording/playback and unrelated app functions are not changed by this repair.
- Chromium and WebKit synthetic 390px browser flow: two handoffs survive reload;
  failed save retains obligations; introduction-only leaves reminder; Not sent
  retains a reminder; Already sent clears only selected obligations; reload
  preserves flags; Home has no duplicate generic alert. Actual handoff code with
  a stub opener verifies storage-before-open and no opener on storage failure.
  A delayed already-sent save preserves an unrelated unsaved editor. No external
  request or real WhatsApp/customer contact. Queue screenshot visually inspected.
- One legacy source-location assertion now checks the moved atomic DB mapping;
  behavioral coverage is added rather than dropping the obligation assertion.
- Maintained browser runner adds this journey (18 normal scripts). Existing C14
  manual diagnostic remains additional, not a substitute for normal acceptance.
- Final full-gate/hosted/staging evidence is recorded below when completed.

## Limits / release decision

WhatsApp supplies no delivery/read/send callback to this local handoff flow.
Adviser-confirmed is not provider-verified or customer agreement. Confirmation
time is recorded now; actual historical send time is unknown. Booking snapshot
binds customer/date/type/arrival window/schedule revision, not every address
field; existing full recipient/booking checks still run before handoff.
Legacy history without sufficient records cannot be reconstructed automatically.

Physical-iPhone return from WhatsApp with the new build remains to be checked.
Existing C14 first-offline Quotes investigation and held M2a/C23 candidate are
not closed by this repair. Do not promote that bundled candidate automatically.
No pilot approval or product-wide offline certification is inferred.
