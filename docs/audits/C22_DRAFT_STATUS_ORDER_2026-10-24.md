# C22 — truthful draft status and ordered clearing

Status: confirmed; isolated implementation under verification, not yet deployed.

## Native checkpoint / reproduction

Simulator taps recovered on iPhone 17 / iOS27 Safari. The old view lacked a draft
panel; after a data-preserving reload and Muhammad's private unlock, New Visit
showed the new recovery UI. A partly clipped desktop window was fitted on screen
using the Simulator Window menu; this was not an app responsive-layout defect.

Entered `SYNTHETIC Cedar Recovery 24OCT`, blank phone, and invented address
`1 SYNTHETIC Cedar Lane - not a real address`. Native screenshots confirm the
saved-draft status, leave warning, Leave and keep draft → Home with no booking
on 24 October, explicit Resume, and exact values restored. Safari reload again
offered Resume and restored those values. This is native draft persistence,
not proof of appointment Save or whole-journey acceptance.

Scroll/swipe/focus delivery remained inconsistent. Native Safari Find on Page
located Notes, avoiding scroll automation. Replaced partial delivered text only
after confirming focus; final visible note was `SYNTHETIC bedroom roller. Blue
fabric. Left control. No contact.` Type Consultation, source Facebook and arrival
09:00–12:00 were visible. No microphone/provider/communication action was used.
Mac locked before Save; native booking and note readback remain unverified.
Inline screenshots/tool responses are the native evidence, not exported files.

During unchanged picker/input events, an already persisted draft could continue
to say “Saving unfinished visit…”. Source cause: `changed()` set Saving, but
`flush()` returned on an unchanged signature (or an empty initial form) without
settling that status. The maintained regression fails on the original source.

## Scoped change

- Settle unchanged-snapshot status without an unnecessary database rewrite.
  Empty initial input events say there are no unfinished changes, not Saved.
- Determine the empty-draft shortcut inside the serial queue, after older writes
  complete. A clear event cannot skip a pending first write and leave older text
  in recovery storage. Track pending operations in memory so navigation/unload
  still protects an empty-looking form while its prior write is running.
- Preserve failed/conflicting-write feedback. Reverting fields to a previously
  saved signature after a failure rechecks persistence rather than taking the
  unchanged shortcut. Never show a successful status for a failed write.
- Only update status for the current session and snapshot. Existing encrypted
  payload/revision format, schema, financial/provider/message rules and real
  records unchanged. No automatic booking or sending.

## Evidence and limits

`tests/visit-draft-status.test.js` exercises source/compiled no-op/empty states,
delayed first write followed by clear, pending-write leave protection and
conflict preservation. The real Chromium/WebKit recovery journey now checks
both empty/no-op status and unchanged revision; existing scenarios remain.
Full release-gate and deployment results will be added after verification.

Native input partially recovered, but an actual Save/readback and physical
iPhone checklist are still open. C14 requires a captured failing offline route;
no speculative caching change is included. Mac unlock is access, not a routine
go-ahead approval; no credentials were requested or bypassed.
