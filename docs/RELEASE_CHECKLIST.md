# Beelo Release Checklist

## Build and automated checks

- [ ] `npm test` passes in an environment that permits the proxy test's local port.
- [ ] `npm run build` reports matching `index.html` and `sw.js` asset versions.
- [ ] Minified bundles contain every source change.
- [ ] Markdown links and referenced scripts exist.

## Critical regression journeys

- [ ] Unlock → Home succeeds on a returning profile.
- [ ] Every registered route renders without an uncaught console error.
- [ ] Unknown hashes are replaced by `#today`.
- [ ] Route → Home → Route produces no Leaflet initialization error.
- [ ] Commission example and Settings summary agree (`0.122` → `12.2%`).
- [ ] Mileage calculations cover below, across and above 10,000 miles.
- [ ] Backup export/import restores all supported tables and numbering sequences.

## Responsive and accessibility

- [ ] No horizontal overflow at 320, 390, 430, 768 and 1280 CSS pixels.
- [ ] Primary journeys work with keyboard alone.
- [ ] Icon-only buttons have meaningful accessible names.
- [ ] Focus enters and returns from every dialog.
- [ ] VoiceOver and TalkBack smoke tests pass on physical devices.

## PWA and device capabilities

- [ ] New service worker installs and removes the previous cache.
- [ ] Cold start, reload and supported offline journeys pass.
- [ ] Camera/OCR permission denial, retry and unsupported-device states pass.
- [ ] Notification permission denial and morning-brief delivery are verified.

## Evidence

Record the commit, build date, browser/device versions, fixture, viewport and
accepted visual differences. A stale screenshot catalog is not release evidence.
