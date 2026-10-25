# Proposed base-to-base route preview — 25 October 2026

## Requested outcome and boundaries

Plan Today / Plan Tomorrow → Preview route → geographically suggested stop order
and map → explicit Use this order → encrypted private visit-plan IDs.
The saved business base is both departure and return. Appointment times and
arrival windows do not constrain this planning suggestion. They remain booked
until the adviser agrees changes with customers and uses the existing proposal/
review/save flow. No communication, navigation or mileage action is triggered.

Implemented in the isolated codex/phone-contact-save checkout, not the original
dirty working tree. No schema, financial calculation, sending or paid-provider
change. Reuses existing Leaflet1.9.4, OpenStreetMap tiles, Geo.geocode and route
ordering code. Leaflet added as an exact test-only dependency for real-library
browser acceptance; runtime still uses the existing on-demand library.

## Verified implementation facts

- Strict finite/range checks for base and every stop. No phone-GPS fallback.
  Missing, invalid or implausible locations block complete map/total/apply;
  all active visits remain in the text list. Cancelled/completed visits excluded.
- Existing exact search up to8 stops, heuristic thereafter; never chooses a
  worse loop than the planned order under the same straight-line metric.
  Lines are a stop-order sketch, not road geometry. ×1.3 distance estimates,
  not fastest-road/traffic/savings promises.
- Numbered markers and escaped popups; H marks departure and return.
  Accessible ordered list survives map-library/tile failure; retry available.
  Map instance is separate from normal Route; closed/replaced previews dispose
  it, and late library loads do not paint another screen.
- Explicit order-only save with stale booking/plan/base snapshot checks.
  Double save guarded. No automatic use of the suggested order.
- Find missing locations runs only after the adviser taps; bounded4s per lookup.
  Postcode-only and invalid results rejected. Raw encrypted-row comparison in a
  transaction prevents a late result attaching to edited/deleted visits.
  Closing the preview stops further lookups/result writes. Already-completed
  valid coordinate saves remain. Existing provider's in-flight request/cache
  cannot be cancelled by this UI; no background bulk lookup or new provider.
- Muhammad explicitly approved OSM tiles (approximate viewport disclosure) and
  the optional existing address lookup (address-text disclosure). No customer
  names/notes are used in map tile or geocoder requests.

## Evidence and release status

Source/minified unit tests cover time-independent base loop, explicit private
order persistence, original bookings unchanged, stale rejection, escaped names,
invalid/missing base/stops, empty state, postcode-only rejection, edited/closed
lookup protection. Browser checks use fresh encryption setup, synthetic records,
real Leaflet with locally mocked tiles and geocoder responses; Chromium/WebKit.
They cover map markers/polyline/base endpoints, offline order save and reload,
missing locations, opt-in lookup failure/retry, stale apply, map failure/retry,
normal Route-map isolation and late-load cleanup. No real customer/provider
request or message is sent during acceptance.

Release gates and deployment: pending; this section is updated with exact
source, acceptance run and deployment evidence before claiming LIVE.

Preliminary checks caught a tile-error status overwrite and raw colour-token
debt; corrected without relaxing thresholds. Test harness now waits for completed
list rerender rather than the list behind the modal. The owned standalone Python
server's captured stdout filled during repeated checks; restarted with logs to
a file. Those failed/incomplete runs are not final acceptance evidence.

## Remaining limits / next actions

- Road-aware optimization, traffic, guaranteed mileage savings, time-aware
  feasible schedules, automatic booking changes and customer agreement are not
  implemented by this preview.
- Online library/tiles/address lookup may fail; offline map backgrounds are not
  promised. Saved coordinates, order/list and local ordering remain usable.
- Geocoder results may be inaccurate even when not postcode-only: adviser must
  inspect markers. Routes with a leg over160km are intentionally blocked using
  the existing plausibility boundary; not a global long-distance product.
- No physical iPhone, native touch, VoiceOver, large-library or field accuracy
  certification. WebKit browser evidence is not native-iPhone certification.
- Broader working-memory MVP, unified expense/media discovery and full planning
  agreement flow remain separate work, not marked complete by this release.

