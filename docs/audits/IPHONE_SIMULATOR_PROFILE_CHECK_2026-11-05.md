# Native iPhone profile check — 5 November 2026

Status: **updated Visit layout and expandable history visually verified in native iPhone Simulator on6November2026; full native communication-action journey remains outside this checkpoint**.

The user reports the profile still appears unchanged and requests a real iPhone
Simulator check of Upcoming visit → Customer. Desktop Chromium/WebKit acceptance
is not substituted for this native check.

## Evidence before runtime repair

- Existing iPhone 17 Pro device: D139C65F-161D-4509-AA7C-D3CD53333880.
  Initially shut down; no erase/reset performed.
- The selected developer directory was Xcode-27-Beta.app, while the installed
  device interface runs from Xcode.app. Simulator logged service-version mismatch
  1171.6 versus1174.21. Per-process DEVELOPER_DIR was used; system-wide
  xcode-select was not changed.
- Booted the existing device and observed the production Beelo unlock screen,
  then unlocked Home with no upcoming visits. A synthetic New Visit draft was
  entered through native UI: SYNTHETIC Profile Check 05NOV, reserved phone
  07700900111. The UI reported encrypted draft saving; Save Visit was not reached.
  No call/message/navigation/provider action was invoked.
- Device Hub showed DeviceKit4002: live view connection timed out, framebuffer
  provider none. The device later shut down unexpectedly during the draft flow.
- Matching Xcode reported NSError401: iOS27.0 runtime unavailable, runtime path
  not found; recommended downloading the runtime in Xcode Settings.
- Existing runtime image89C9FDAC-E0FC-4BA6-99BA-0B522CC8A2FD: iOS27.0,
  build24A5423a, 8,014,997,345bytes. Its bundle exists, but Apple's
  `simctl runtime verify` fails: **-67054, a sealed resource is missing or invalid**.
  Signature validation was not bypassed; the image/device/data were not deleted.

## Approved repair and remaining validation

User explicitly approved installing a clean runtime and continuing in a separate
test device. Supported Apple command (matching Xcode):
`xcodebuild -downloadPlatform iOS -buildVersion 27.2 -architectureVariant arm64`.
Apple selected iOS27.2 build24B114, arm64, 8.32GB. Download and installation completed. The separate iPhone 17 Pro test device is SYNTHETIC Beelo Visit Check, UUID76D66EC7-8D12-48CF-9551-799627EE36F5. Normal Device Hub startup opened Beelo onboarding.
Disk availability was749GiB before download.

Qualification: the freshly downloaded runtime also returns -67054 on signature verification. That result alone does not prove the original image was damaged. No verification bypass was used. Native coordinate taps now return noWindowsAvailable although read-only screenshots and host AX controls work. User completed setup and Home was visually observed. Native taps then opened New Visit, but automated text entry lost most characters; no synthetic visit save has yet been verified. Requested that the user save the named synthetic test visit. Native Visit acceptance remains pending.

Next: open production Beelo; complete local unlock/setup privately if needed;
create synthetic appointment; follow actual Upcoming → Visit → Customer taps;
visually inspect money summary, grouped communication and section navigation,
retaining screenshots and any reproduction. Do not call this native acceptance
passed until those screens/actions have been observed.

## Additional source findings to exercise natively

- Some Home/Visit `ContactFeature.open` controls omit customerId. The contact
  service then chooses its legacy URL-only branch rather than the customer-linked
  handoff recorder. The profile cannot infer those missing records afterwards.
  This is source evidence; it is not yet a native reproduction or established
  cause of the user's report.
- The profile brief reads customer.notes; the New Visit form writes its notes
  to the appointment. Include appointment-level context in the native scenario
  rather than seeding all context directly into a customer in a browser fixture.
- Check the actual heading/section controls of the installed phone build.
  User clarified the actual target is the Visit screen opened from Upcoming. Implemented candidate adds its communication section directly there; do not assume caching explains the report.

## Latest native checkpoint

- User completed setup. The separate device opened production Home.
- After further input attempts, waiting for focus between click and typing allowed
  correct synthetic entry: SYNTHETIC Test Visit, reserved07700900951,
  SYNTHETIC Test Address, Friday6November2026, fitting, one-hour duration,
  09:00–12:00 arrival window, notes “SYNTHETIC: side gate access. Test record only.”
- Save was attempted. The native screen subsequently showed Visits diary with a
  booking marker on6November; the saved detail has not yet been inspected, so no
  complete native save/reopen or new-section pass is claimed.
- Input intermittently fails with noWindowsAvailable even while AX/screenshot
  reads work. Device Hub also showed a blank/spinning host display, but simctl
  reported the test device Booted and a direct screenshot still showed Beelo's
  intact New Visit form. That is evidence of a host display/input problem, not an
  established Beelo crash. No device restart/erase or signature bypass used.
- Keyboard Capture was temporarily tried and restored to its original off state;
  temporary View menu dismissed. Native data preserved. No calls, messages,
  navigation/address lookup, media permission or AI provider actions invoked.
- cache181 is now live and its public Visit journey passed in Chromium/WebKit.
  Asked user to open Home → Upcoming → SYNTHETIC Test Visit, accept the app's
  update/reload if shown, and unlock privately if needed. Final native section
  verification remains pending; do not substitute the browser screenshots.

## Subsequent native save/reopen proof (23:43 UTC)

Direct native Safari navigation to #appointments?id=1 reopened the first saved
record. Visually confirmed SYNTHETIC Test Visit, CUS-2026-0001, Friday6November,
fitting, planned09:00–10:00 (1hr), arrival09:00–12:00, and SYNTHETIC Test Address.
This supersedes the earlier diary-marker-only save checkpoint. It proves native
save/reopen of the synthetic record, but bypasses the unreliable Home tap path.

That installed screen still displayed the old Resume saved message and Phone
contact/history buttons. Native Safari's refresh control was invoked; Beelo now
shows its legitimate Unlock screen. User asked to unlock privately. No passphrase
was read, entered, reset or requested in chat. The deployed Visit-section visual
check remains pending that unlock/update; public Chromium/WebKit passes stand
separately. No native pass for the new section is claimed.

## 6 November2026 — updated native Visit visual checkpoint passed

After the user reported saving/updating/unlocking, Device Hub initially showed the
Customer workspace's money/product area. No claimed financial values were seeded:
recorded earnings/linked expenses £0, no linked trips, commission received not
tracked separately. The app's offline notice was visible.

Opened the already verified synthetic record through native Safari's supported
open-URL route #appointments?id=1. Visually confirmed SYNTHETIC Test Visit,
CUS-2026-0001,6November fitting, planned09:00–10:00 (1hr),09:00–12:00 arrival window,
and SYNTHETIC Test Address. The new **Communication & follow-ups** section is now
present immediately after Visit Details; the old loose top buttons are absent.
Introduction/reminder/window status and Call / Message / Log reply are visible.

Native Safari Find on Page was used to reach the lower section because ordinary
scroll automation remained unreliable; the Find UI was closed afterwards. The
canonical Next actions panel shows one due combined introduction and confirmation
for6November09:00–12:00, with Review introduction & confirmation, Already sent,
and More options. Opened Customer messages & contact history successfully: zero
records, honest empty state, Saved message drafts and Phone contact history
buttons together, and explicit adviser-controlled send/recording explanation.

Evidence: ../audits/evidence/native-visit-2026-11-06/visit-communication.png and
visit-history.png (actual native simulator captures, not desktop WebKit).

Scope: native layout, saved-record reopen and history-disclosure interaction are
verified. The app displayed its offline notice while the record was readable;
this checkpoint does not independently establish offline save/reconnect or
full native send/call/reply workflows. Home → Upcoming was user-assisted; agent
inspection used the direct verified Visit URL. No real call/message, provider
request, agreement/status mutation, credential entry, reset or deletion occurred.
Existing Chromium/WebKit functional release evidence remains separate. No runtime
changes or deployment were needed for this follow-up.
