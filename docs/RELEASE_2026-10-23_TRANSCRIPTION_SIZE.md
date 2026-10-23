# Audit A02: transcription transport safeguard

Status: implemented, not deployed. Production remains source `4da1b1a` / deployment `dpl_FFuk9Sd4nsmAdn2aT8XLtwV2ZBUG`.

## Decision / change

[Vercel's documented request limit](https://vercel.com/docs/functions/limitations#request-body-size) is 4.5 MB; base64 audio expands by approximately one third. Limit transcription to 3,000,000 decoded audio bytes and 4,100,000 complete UTF-8 JSON bytes, providing headroom. These are application safety limits, not a claim to upload arbitrary audio up to the platform maximum.

- Client checks actual encoded payload before fetch/auth retry, rather than trusting recording metadata. Oversize shows a clear message and retains notes/audio. Even a non-JSON upstream/platform 413 maps to actionable size guidance.
- Proxy enforces decoded audio and JSON-envelope limits, including pre-parsed objects, declared content length and streamed chunks, before calling the provider. Streaming counts bytes rather than characters; parsed objects count serialized UTF-8 bytes.
- Local recording remains capped at its existing 10 MiB/3-minute limit; recording, persistence, playback and deletion implementation unchanged. Transcription remains explicit. No compression, chunk upload, automatic deletion, provider/key/configuration changes or new storage service.
- Only NoteCapture minified output regenerated; prepared asset URL 6 and cache `advisoros-v6-141-transcription-size`. Other user changes remain untouched in the original dirty checkout.

## Confirmed tests / limits

- New client and server tests reproduced the original oversize-allowed failure, then passed. Covers raw bytes below/at/above 3 MB, exact/over 4.1 MB parsed and streamed envelopes, Unicode UTF-8 accounting, rejected declared length, zero provider calls on rejected payloads, no notes/audio loss, non-JSON 413 and successful retry. Added client test to default npm suite.
- Full `npm test` passed. Lifecycle mock now supplies the real standard Blob API used for size accounting; duplicate-tap and stale-editor checks pass against source/minified assets.
- Chromium browser journey passed: oversize no-upload warning, original context preserved, exact large synthetic WAV saved/encrypted/reloaded, local Blob player source/metadata, and smaller mocked transcription with both recordings retained. No real provider was contacted.
- WebKit observed the warning and saved-audio UI; an earlier run verified byte retention across reload but stalled waiting for headless WAV metadata. That decoder check is explicitly excluded for WebKit (audible/physical-device playback not certified).
- Latest WebKit run hit `Navigation canceled by policy check` during reload after Save. Customer Save starts a route change after hiding its sheet. A narrow harness wait for the customer route has now been added, but has NOT yet been rerun. Do not claim the final WebKit journey passes. Initial harness also needed a required synthetic address and hide-in-place modal assertions; no runtime customer validation was changed.
- Verification guidance stops at the failed browser boundary. No deployment/production tests performed for this slice. Client/handler logic is tested with mocks; production maximum-size transport and real transcription are not certified.

Evidence: `/private/tmp/beelo-transcription-size-{chromium,webkit}.png`, `/private/tmp/beelo-transcription-size-suite.log`. Copied into original workspace `docs/evidence/2026-10-23-transcription-size/`.

## Next

Run the corrected WebKit route-stable reload journey, then recheck release gates and stage/promote the exact tested commit. Keep physical iPhone audio acceptance open. Audit A03 per-device usage/concurrency/budget controls remain a separate unresolved risk; this size guard does not solve them. Marketing website untouched.
