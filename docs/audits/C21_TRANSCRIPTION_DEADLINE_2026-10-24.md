# C21 — bounded client transcription and released visit controls

Status: fixed and deployed; local/hosted/live browser verification passed.

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
fourteen synthetic browser scripts pass. The hosted exact-source run and live
synthetic verification below passed without paid-provider calls.

## Deployment / acceptance

- Runtime commit: `0a71f4203758ba50ca99c7c462c7b711026dc5ab`.
- Exact-source hosted Test [40072361485](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40072361485)
  passed unit/server/dependency audits and all fourteen browser scripts. The
  current offline check passed there too; C14 is not thereby resolved.
- Target: `beelomvp/beelo1`, production, vanilla static PWA/serverless project.
  Status READY; build 13s; deployment `dpl_Bd9AqYUvbCptxBNSKSkUVgckgwd6`.
  Exact build https://beelo1-fjws6w7gh-beelomvp.vercel.app was staged without
  assigning the app domain, compared byte-for-byte and promoted unchanged to
  https://beelo.beelestial.co.uk/ after acceptance.
- Live cache `advisoros-v6-156-transcription-deadline`, note-capture v8.
  All three changed served assets match. Existing C20 draft logic, App/DB v45,
  appointment v61 and visit-draft v1 are unchanged.
- Live disposable Chromium/WebKit repeated the full new-visit journey including
  the stalled-transcription deadline and late-result isolation. Genuine local
  passphrase setup; synthetic records/audio only; external services blocked;
  no POSTs/page errors. This is not real microphone/provider or native iPhone
  certification. Native input remains blocked as described below.
- Ten-minute scoped production error/fatal scan found no matching logs. Static
  client verification does not establish general client monitoring; drain
  configuration was not changed or certified.
- Evidence: `docs/evidence/2026-10-24-transcription-deadline/`, including original
  failing regression, focused source/compiled checks, local/hosted summaries,
  live journey/assets and synthetic screenshot. Original dirty runtime remains
  untouched; this release contains only the scoped isolated change.
- Rollback: C20 `d139e78` / `dpl_H9uYcKjemkoKTd8RRNVYaAH8jnTa`, cache155.
  No data migration or provider configuration change to reverse. This rollback
  retains drafts but lacks the new deadline safeguard.

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
