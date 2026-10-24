# C22 — truthful draft status and ordered clearing

Status: fixed and deployed; local/hosted/live browser verification passed.

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
Full local unit/social/maintained-performance/build/token/diff checks and all
fourteen synthetic browser scripts pass. Exact-source hosted Test
40073833932 passed unit/server/dependency gates and all fourteen browser scripts.
No assertions, permissions or timeouts were weakened, and no rerun was needed.

## Release

- Runtime `ded689147addb2b31ca5a536a237ae0b5e2f8677`, isolated branch
  `codex/phone-contact-save`; original dirty runtime/dependencies preserved.
- READY production build `dpl_9LRb58Y96VbNCaS41adinNJV8ERE`, build11s,
  https://beelo1-7pch2bzip-beelomvp.vercel.app, staged without the custom domain.
  Three changed runtime assets matched; public app remained on C21/cache156
  until the hosted gate passed. Promoted this same build, not a rebuild, to
  https://beelo.beelestial.co.uk/ on 24 October 2026.
- Cache `advisoros-v6-157-draft-status-order`, VisitDraft v2. Other runtime
  asset versions unchanged. Live index/SW/compiled service match local bytes.
- Short deployment error/fatal scan returned no records; not independent
  monitoring, client-error coverage or security assurance. No secrets inspected,
  changed or published. Rollback C21 `0a71f42` /
  `dpl_Bd9AqYUvbCptxBNSKSkUVgckgwd6` retains draft recovery and transcription
  timeout but restores C22's status/ordering defects.
- Evidence: `docs/evidence/2026-10-24-draft-status-order/`, including original
  negative regression, full local outputs, hosted result and WebKit screenshot.

Live genuine-key Chromium/WebKit repeat empty/no-op status, durable text/audio,
leave/reload recovery, mocked stalled-transcription/late-response isolation,
storage failure/update protection, validation/save cleanup and stale revisions.
Both pass with no sends or page errors. Real microphone, physical iPhone and
paid providers are not exercised. Live screenshots and outputs retained. The
follow-up documentation-link/product-language check and diff check pass; the
evidence-only commit does not require a second app deployment.

Native input partially recovered, but an actual Save/readback and physical
iPhone checklist are still open. C14 requires a captured failing offline route;
no speculative caching change is included. Mac unlock is access, not a routine
go-ahead approval; no credentials were requested or bypassed.
