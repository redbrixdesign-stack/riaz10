# C20 — encrypted unfinished New Visit recovery

## Decision and boundaries

Muhammad approved a local recovery safeguard after reporting an abrupt form
closure. The original C16 runtime separately reproduced loss of typed details
on route navigation in disposable Chromium/WebKit sessions. The native closure
trigger remains unknown: no crash, successful Save or saved-record deletion was
proven. This change protects unfinished entry; it does not claim to fix that
unknown trigger or the C19 Simulator input failure.

Implemented in the isolated `codex/phone-contact-save` release checkout, not the
dirty original checkout. No provider settings, financial eligibility, external
communications, real records, dependencies or schema version changed.

## Implemented prototype

- One encrypted device-local New Visit draft, using the existing passphrase
  key and settings table. Text, date/time/type/source/arrival choices, access,
  linked entry identity and completed embedded audio are preserved. No plaintext
  fallback and no server upload. Autosave is debounced 300 ms; the UI says saved
  only after the encrypted write succeeds.
- Leaving asks Keep editing / Leave and keep draft / Discard. A failed write
  keeps the form open. Fields are held while leave/update persistence finishes.
  Recording, audio finalization, transcription and booking saves block normal
  leave/update. Browser unload confirmation/background flush is best-effort.
- Reopening New Visit offers Resume or explicit Discard, rather than silently
  combining old customer details with a fresh scan/lead/job. Recovery errors
  block editing and offer retry; an unreadable draft with a readable revision
  can be deliberately discarded after confirmation.
- A draft never books automatically. Validation, scheduling warnings and
  failed booking writes retain it. Successful booking or explicit discard clears
  it. Random entry identity opens an already committed visit after interrupted
  cleanup; atomic appointment insertion also deduplicates that identity.
- Atomic revision comparison rejects stale tabs' writes/discards. Draft writes
  fail closed if the storage engine cannot provide transactions. Recovery data
  is excluded from backups; restore is blocked until an existing unfinished
  visit is saved/discarded, and foreign recovery settings cannot be imported.
- Waiting-worker activation/controller reload first keeps the draft, or pauses
  on failure. Existing first-install service-worker behaviour is retained.

## Evidence

- `tests/visit-draft.test.js`: source and compiled DB; real AES key, missing-key
  rejection, real IndexedDB atomic revision race, stale deletion, unreadable-row
  preservation, transaction-unavailable refusal and concurrent booking dedup.
- `tests/browser/visit-draft.e2e.cjs`: maintained synthetic Chromium/WebKit
  journey with genuine passphrase setup, encrypted raw storage, text/Unicode/
  completed-audio recovery, reload, no auto booking, keep/discard controls,
  storage-failure/update blocking, busy capture, failed validation/booking,
  successful save/readback, stale revisions, interrupted cleanup, linked-entry
  separation and unreadable-draft discard. External networking blocked; no POSTs
  or page errors. Synthetic audio checks retention, not microphone/playback.
- Existing full unit suite, social checks, maintained performance gate and build/
  token/diff checks pass locally. Full local fourteen-script browser gate is
  recorded with release artifacts. Early test fixes corrected existing access-
  note concatenation expectations and the confirmation-sheet selector; no
  product assertion was weakened. A transient early navigation wait did not
  recur in the full local gate. Subsequent review caught an old-session finally
  handler enabling a replacement New Visit before recovery. Session-bound
  cleanup and an explicit direct-new-visit transition assertion address it;
  the first staged build was not promoted.

## Limits / next checks

- Not physical-iPhone or native Simulator acceptance; C19 input reliability and
  C14 intermittent WebKit offline acceptance remain separate open issues.
- iOS/browser termination can prevent the latest keystrokes or active recording
  from finishing persistence. Recover only confirmed snapshots; never promise
  zero loss. Clearing site storage still removes device-local data.
- One draft, one device/profile/origin, not cloud synchronization. Large audio
  can exhaust quota; failure remains visible. Full-audio rewrite cost, real
  microphone interruption and physical-device background/update behaviour need
  pilot evidence. Restore requires dealing with the draft first.
- New Visit only: not a general draft mechanism for every editor. Older
  deployments do not manage this setting; rollback must warn advisers about
  unfinished entries before use. No feature is labelled pilot-approved.

## Released evidence

- Final runtime `d139e78e7b58548acf2a8022da2a817dddc4916d`. Exact-source hosted
  Test [40046216960](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40046216960)
  passed units/server/dependency audits and all fourteen browser scripts.
- First stage `030165f` / `dpl_HuKf2H1rkMd5ZmzAhz75zgDQnEFh` was not promoted.
  Its hosted run 40045922378 was cancelled by the existing newer-push policy,
  not counted as acceptance. A negative control demonstrates its session-exit
  flaw; the new source/compiled regression and two-engine journey reject it.
- Final READY production build `dpl_H9uYcKjemkoKTd8RRNVYaAH8jnTa`, build 8s,
  exact URL https://beelo1-8x3qx8cug-beelomvp.vercel.app, was staged without
  assigning the app domain and promoted unchanged after acceptance. Public
  https://beelo.beelestial.co.uk/ serves cache
  `advisoros-v6-155-visit-draft-recovery`; App/DB v45, appointments v61,
  note-capture v7 and visit-draft v1. All seven changed served assets match.
- Live disposable Chromium/WebKit repeated the full new recovery journey with
  genuine passphrase setup, zero POSTs/page errors and external services blocked.
  Native Simulator recheck stopped at a locked Mac; no new native-input pass.
  Ten-minute production error/fatal scan returned no matching logs, not wider
  client monitoring or security assurance. No drain configuration was changed.
- Screenshots, local/hosted summaries, focused/negative-control checks and live
  journey/asset evidence are under `docs/evidence/2026-10-24-visit-draft/`.
  `summary.json` is the initial local full gate; `hosted-summary.json` records the
  final exact source. No sensitive traces, secrets or real records were retained.
- Rollback: C16 `9995984` / `dpl_BQjYsvQX8syQ9TcHj7Gkiyn8NV98` (cache154).
  Older UI cannot resume these drafts: resolve/copy unfinished entries before
  rollback where possible and preserve device storage. C14 and physical-device
  acceptance remain open. Original divergent runtime changes were not uploaded.
