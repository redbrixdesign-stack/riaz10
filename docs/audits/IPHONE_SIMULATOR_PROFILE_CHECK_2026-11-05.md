# Native iPhone profile check — 5 November 2026

Status: **in progress; customer workspace not yet verified in Simulator**.

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

Qualification: the freshly downloaded runtime also returns -67054 on signature verification. That result alone does not prove the original image was damaged. No verification bypass was used. Native coordinate taps now return noWindowsAvailable although read-only screenshots and host AX controls work. User setup assistance requested; native acceptance remains pending.

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
