# C21 — bounded client transcription and released visit controls

Status: confirmed P2 reliability defect; fix in isolated release verification.

## Reproduction and cause

The remaining-work review found that `NoteCapture.transcribe` awaited upload,
response JSON and device-credential recovery without a client deadline. A
synthetic never-settling fetch leaves its recording in `transcribing`; C20's
busy gate then blocks New Visit save/navigation/update. The proxy already has
a 60-second upstream deadline, but cannot guarantee delivery of that error over
a broken/stalled client connection. This is not a provider outage diagnosis.

The new regression fails on C20's original source: no client timer is
scheduled. No real audio, provider, customer, secret or outbound message was used.
Negative evidence is retained with this audit.

## Scoped fix

- One 75-second client deadline covers upload, response body and the existing
  one-time 403 device-credential recovery. This allows 15 seconds beyond the
  proxy's upstream limit. The original endpoint, model, quotas, shared-store
  enforcement, payload bounds and credentials are unchanged.
- Abort the client transport and settle the editor operation even if a mock or
  transport ignores abort. Always release the recording's busy flag and clear
  the timer. Preserve audio and existing text, with a useful timeout message;
  the adviser may deliberately retry or keep typing/save/leave.
- Late fetch/body/key recovery must not append a transcript, mutate saved
  credentials or start another authentication retry after timeout. Existing
  stale-editor protections and valid transcription flow remain intact.
- No automatic timeout retry, automatic booking, automatic sending, new provider
  call or new storage schema. No changes to unrelated dirty work.

## Verification

`tests/note-capture-timeout.test.js` exercises real source/compiled code with
controlled timers: hanging fetch, response body, credential lookup and retry;
abort-ignoring late resolution; retained text/audio; released `VisitDraft.busy`;
explicit adviser retry; successful response and timer cleanup.
The existing lifecycle/size VM fixtures now supply normal browser timer and
abort globals; their original size, stale-editor and retry assertions remain.

The maintained two-engine `browser/visit-draft.e2e.cjs` now stalls only an
explicit synthetic transcription using a local fetch stub. Browser clock advances
75 seconds; controls unlock, text/audio remain, a late response cannot append,
and the rest of resume/reload/failed-save/discard/recovery checks still run.
No real network transcription request or provider call is made.

Full local unit/social/maintained-performance/build/token/diff checks and all
fourteen synthetic browser scripts pass. Hosted acceptance and production status
will be recorded after verification; this pending entry is not a deployment claim.

## Remaining limits

- Background/suspended browsers may delay timers; no hard real-time or physical
  iPhone certification. Client abort does not guarantee cancellation/refund of
  work already accepted by a provider.
- C14's original offline failure artifact has no failing WebKit route/network
  evidence. The bounded current-build local check and natural hosted bff10be run
  40046763772 pass; this does not identify/fix the intermittent cause.
- Native access was rechecked: Simulator is visible/unlocked, but a tap returns
  `noWindowsAvailable` and a keyboard fallback leaves Search unchanged. Native
  acceptance remains incomplete; no restart, passphrase bypass or false pass.
