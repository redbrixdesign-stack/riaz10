# Customer call and message handoffs — 28 October 2026

## Story and scope

Customer profile Call/Message → existing local communications and events →
external phone/WhatsApp/Messages handoff → one optional return panel → explicit
outcome saved in the same profile. Existing Talk WhatsApp drafts use the same
return trigger and existing purpose-specific sent/not-sent resolver.

No new provider, API, credentials, schema migration, autonomous contact, call
recording, attendance inference, commission/financial or visit-cancellation rules.
Legacy contact sheets without a stable customer ID retain their existing behaviour;
they are not silently matched by name/number or claimed tracked by this release.

## Implemented candidate — release gate pending

- Profile Call logs the action timestamp before handing off a normalized phone
  number. Message offers WhatsApp and text message with an optional draft and
  explicit Copy message fallback. SMS body prefill varies by native handler;
  record is a requested handoff, not proof that the destination loaded or sent.
- Only the most recent explicit handoff can trigger a return panel, once, after
  a hidden→visible transition on the original route within15minutes. No scan of
  older customers, focus-event loop or restoration popup after reload. Another
  customer, changed route or active modal suppresses the popup; durable records
  remain available in that customer's profile.
- Call panel: Answered / No answer or voicemail / Cancelled or did not call,
  notes and existing unified voice capture. No actual connection, end timestamp
  or call duration is available to this web app or inferred from time away.
  Outcome-recorded time is distinct from call-action time. Save is explicit;
  unsaved editor notes are not a durable call outcome.
- Call detail (notes/audio) is encrypted in the existing communication-event
  detail field before an atomic communication/event/customer write. Invalid or
  missing customer/call, repeated outcomes and failure do not partially resolve
  the call. Call outcomes cannot be confirmed as sent or silently clear visit
  introduction/agreement obligations. Those remain separate explicit controls.
- Audio playback is read-only in history. Explicit confirmed Delete audio removes
  that event's saved audio while retaining notes/outcome. Existing backups may
  retain earlier copies; app deletion does not edit exported backups.
- WhatsApp/SMS return uses the existing sent/not-sent resolver plus Later. A
  generic message has no inferred appointment purpose. Channel-isolated grouping
  and supersession prevent SMS confirmation from dismissing a WhatsApp handoff.
  No sending, delivery, response, consent or attendance is inferred.
- Pending message decisions use existing profile Next actions, not an extra
  duplicate list. Calls have collapsed history with unresolved-outcome controls.
  App48 / Contact5 / DB50 / Communications5 / Customer21 / Talk36 / cache178.
  DB50 is a script version, not a new database schema.

## Verification so far

- Source and minified tests: real encrypted DB, channel isolation, call/send
  boundary, wrong-customer/invalid/duplicate rejection, one-shot route/modal and
  expiry guards. Focused synthetic Chromium/WebKit journey passes call, SMS,
  WhatsApp, Later, other-customer/editor safety, encrypted note/audio persistence,
  actual synthetic WAV playback, explicit audio deletion, atomic failure/retry,
  offline navigation and reload. No real calls/messages/provider POSTs.
- Initial test waits for an empty container and icon-inflated accessible names
  failed. Fixed attached-state wait and added explicit Call/Message accessible
  labels. An existing optional ContactFeature test fixture lacked the new method;
  retained a function-availability fallback. Later locator uses the existing
  Close confirmation accessible label. Failures were investigated, not promoted.
- Full31 maintained browser journeys, root/server/dependency checks and staged
  source parity still required before promotion. No release claimed at this
  checkpoint. Rollback remains verified cache176/e6d07dc production deployment
  dpl_2xwq5GjkdnpgDaw1oDDTtfn9GfDg / beelo1-9vyqgyoxt-beelomvp.vercel.app.

## Open risks and next acceptance

- First stage a41f9ed/cache177 (dpl_HZoFZFzqEMMtuGNUwqPssZDfKDAi,
  beelo1-7y5owmrzm-beelomvp.vercel.app, productionREADY, Other/static,
  14.637s build) matched eight source assets but was NOT promoted. Review caught
  generic Not sent copy falsely promising a reminder. Corrected label/toast for
  messages without appointment purpose; appointment behaviour remains unchanged.
  Interrupted the old local gate rather than mixing source versions; hosted
  root/server/dependency job passed, browser result is historical only. Fresh
  exact-source full gates are required. Public cache176 remained unchanged.

- Native iPhone dial confirmation/cancel, installed WhatsApp/SMS return, keyboard,
  microphone permission and VoiceOver require hands-on acceptance. Browser tests
  mock external launch and simulate visibility; they are not native certification.
- If the OS does not produce a return visibility event, or Beelo is closed/locked,
  no popup is promised. Unresolved records remain available on reopening profile.
- SMS link support: Apple documents number-only links; RFC5724 defines optional
  body. This implementation uses the standard body parameter plus explicit copy
  fallback, not a guarantee of native iOS prefill.
- New call detail is encrypted; this task does not certify all older communication
  content at rest. Existing outgoing draft/history storage should receive a
  separate privacy review before wider pilot expansion.
- No runtime monitoring/credentials/drains changed. Later full regression and
  bounded production error-log results must be recorded below.

References checked: [Apple phone links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/PhoneLinks/PhoneLinks.html),
[Apple SMS links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html),
[SMS URI standard](https://www.rfc-editor.org/rfc/rfc5724.html),
[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
