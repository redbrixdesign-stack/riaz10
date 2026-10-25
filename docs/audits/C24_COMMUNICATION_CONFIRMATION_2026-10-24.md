# C24 — persistent, adviser-controlled WhatsApp completion

Status update25 October: now included in the C25 production release, runtime
bde3320/cache162. C25 repairs the cache-hit network coupling and passes exact
hosted40133427558/all18 browser journeys; staged/public assets match. Earlier
hold observations below remain historical evidence, not current release status.
See `C25_OFFLINE_PRECACHE_FIRST_2026-10-24.md` for release/live checks and limits.

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
- Final full local `verify:release` passes units/server integration, social,
  maintained performance assertions and all18 browser scripts on runtime
  `8297267988b0073433418ced947657c69b4ad17a`. Root/server advisory scans each
  report zero known vulnerabilities. An earlier partial run was stopped to add
  the mixed-version fail-closed guard; it is not counted as acceptance.
- Exact-commit hosted **40132428013 fails** `cold-offline.e2e.cjs`: first-offline
  WebKit Quotes did not render. Units/server/audits pass; the runner stops before
  the new communication journey, so this is not a hosted C24 pass. No rerun,
  timeout relaxation, assertion removal or deployment-policy change.
- The preceding docs checkpoint `a3e155c` also failed in **40129176205** at the
  same first-offline Quotes boundary, before C24. Preserved its synthetic JSON,
  screenshot and failed log in `../evidence/2026-10-24-offline-checkpoint-recurrence/`.
  Both screenshots show the bounded Failed to load / Try again / Go to Today
  recovery rather than an endless skeleton: C23 containment works, but first
  offline loading is still not accepted. The newer trace also reports WebKit
  Internal error; this is a symptom, not proof of an engine-only root cause.

## Isolated stage — NOT public release

READY `dpl_6oVgiJhwrk874LBigTMVWSM3h4Yb`,
https://beelo1-husjtaxkr-beelomvp.vercel.app, source8297267,
cache161/DB47/Communications4/Companion32/Followups29/Talk31; App46 remains.
Framework Other, build-to-ready16.882s. Explicit `--prod --skip-domain` on
beelomvp/beelo1 creates only a test candidate; no custom-domain promotion.
This bundle includes held M2a/C23. Seven C24 runtime assets byte-match source;
public custom app independently rechecked M1/cache158. Default Vercel alias
points at this candidate, not the custom public app. No secret/protection change.
Stage error/fatal10-minute scan20:56–21:06UTC returned no logs; not wider
monitoring, client-error or security assurance. Staged flow evidence follows.

Fresh headless staged-flow attempt could not reach Beelo setup: a bounded
diagnostic confirms redirect to `vercel.com/login`. This is deployment protection,
not a C24 app assertion failure or a staged-flow pass. Existing authenticated IAB
reaches Beelo's fresh Set Encryption Passphrase screen; viewed read-only, no setup
submitted or live records copied. CLI authenticated asset verification succeeds.
No protection was disabled, bypass secret created, credentials pulled or new
permission granted. The local complete flow remains the behavioral evidence;
authenticated staged interaction and physical WhatsApp return remain open.

Previous cache160 staged URL remains available for test rollback; no rollback
may clear site data or pretend an adviser-confirmed send did not happen. No
schema/data migration is needed. Public M1 is untouched.

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
