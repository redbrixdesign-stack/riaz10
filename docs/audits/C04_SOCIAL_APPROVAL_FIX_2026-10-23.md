# C04 — Social sharing approval tied to the current fitting and media

## Story and change

The adviser selects a local finished photo/video, confirms permission/privacy, saves draft options, then explicitly requests the OS share sheet. No upload or publication is automatic.

- Share rechecks both live checkboxes and a saved approval bound to the current fitting, exact File object and generation revision. Replaced/invalid media, navigation, reload and withdrawal invalidate that approval. Selecting media clears both checks; fresh options must be saved before sharing it.
- Draft generation checks context before and after asynchronous work; a stale AI result cannot attach approval to different media/visit. Save failure blocks approval and does not claim success. A read-back confirms permission/drafts were retained against an existing fitting, including zero-row/deleted-visit cases.
- Withdrawal is immediately available after a successful generation. It blocks sharing locally before its write; a failed write explains the need to retry rather than claiming withdrawal was persisted.
- Native sharing receives the approved File plus adviser-editable caption. Abort remains cancellation, never an automatic clipboard fallback. Unsupported native file sharing offers caption copying with an explicit instruction to attach media manually. Nothing bypasses the receiving social app's own review/publish controls.

## Evidence and boundaries

- Source/minified unit tests: unchecked consent/privacy, exact image/video identity, replacement, invalid media, stale AI, storage failure/missing fitting, withdrawal failure, cancellation and manual fallback.
- Full npm suite and separate social test; Chromium/WebKit real file-chooser selection and exact mocked share payload bytes, permission/privacy blocks, changed-file reapproval, cancellation and persisted withdrawal. Canonical nine-route/draft reload regressions are checked separately.
- All data synthetic/local, no POSTs/provider calls/publication. The video fixture tests attachment bytes/MIME, not real video decoding. The OS share sheet/receiving apps and physical iPhone remain unverified. Privacy is the adviser's explicit review, not automatic detection or a legal certification. A fresh session cannot reuse ephemeral file approval; drafts survive but media must be selected/reapproved. Cross-tab/external changes after a local approval are not a centrally coordinated revocation service.

Deployed source `8ae172f`, READY deployment `dpl_99xTBTaQh8qv521TvFSid4RV4mBs` (`https://beelo1-bv1lttcfc-beelomvp.vercel.app`), build 7s, cache `advisoros-v6-147-social-approval`. Four staged assets matched the tested commit before exact-build promotion; all four live assets matched afterwards. Live Chromium/WebKit sharing journeys passed with exact synthetic image/video payloads through mocked sharing and no uploads/publication. Rollback is C05 `f11c587` / `dpl_9PUP9c7zrD8UMAxthSSxxMQUHTP4`, preserving the C03-compatible encryption readers (but restoring the prior C04 weakness).
