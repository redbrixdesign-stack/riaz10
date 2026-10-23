# C18 — UK-midnight context-test fixture correction

## Story and observed failure

Synthetic customer/visit → encrypted database → profile/gallery/search → tomorrow
plan → local recovery/reload, without uploads or customer communications.

Natural hosted runs [40041135751](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40041135751)
and [40041691620](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40041691620)
failed in `context-encryption.e2e.cjs:45`, waiting for the synthetic access note
in Plan tomorrow. They did not reach the later C14 offline-route test. The latter
failure followed a documentation-only change, not a new runtime deployment.

## Deterministic evidence

At `2026-10-23T23:44:00Z` a disposable UTC browser's existing fixture computes
24 October as tomorrow. UK time is already 00:44 on 24 October, so Beelo's
tomorrow plan correctly selects **25 October**. The original synthetic visit is
stored at `2026-10-24T10:00:00Z`; the rendered 25 October plan has zero visits.
The original journey reproduces the exact timeout at that frozen instant.
This is a test-date mismatch, not evidence of lost/decryption-failed context.

The first negative reproduction captured the timeout but its extra diagnostic
mistakenly called a nonexistent DB convenience method. Correcting only that
diagnostic to read the disposable raw table captured the date/route evidence on
the second and final negative run. Neither run modified checkout/runtime code.

## Scoped correction

`ffe776d69de76588686ec189fed7efec47fbc099` changes only this test:

- explicit `Europe/London` browser timezone, matching its host-local date seed;
- fixed Date at the observed midnight-boundary instant (timers still run);
- precondition asserting the fixture day equals the UK tomorrow-plan day.

All encryption, Unicode/media/context/search/export/migration, offline/online
recovery and no-upload assertions remain. No timeouts, test assertions or gates
were relaxed; no retry-until-green workflow. This journey tests context recovery,
not arbitrary foreign-device calendar conversion. Do not infer wider timezone
or physical-device correctness from it.

## Verification checkpoint

Focused Chromium and WebKit journeys pass at the same frozen instant. WebKit
shows one synthetic fitting with its access and customer context in the 25
October plan; screenshot inspected. Chromium covers offline reload; WebKit
retains its explicit offline in-app-navigation limitation, not strict reload
certification. No POSTs or page errors. Full `npm run verify:release` passes,
including all thirteen browser scripts. Hosted
[40042054789](https://github.com/redbrixdesign-stack/riaz10/actions/runs/40042054789)
on `ffe776d` passed unit/server and browser jobs. No runtime deployment follows
from a test-only repair. Evidence: `docs/evidence/2026-10-24-context-fixture/`.

## Preservation, deployment and native blocker

No app/runtime, API, data/schema, business/message rule, credential, dependency,
configuration or generated asset changes. No deployment required/performed;
live remains C16/cache 154. Original dirty runtime/dependencies and unrelated
documentation are preserved. C14 remains separately open.

Simulator access returned `timeoutReached` on the initial attempt and one bounded
retry. No screen/state or native acceptance was obtained; no assumption about
Mac lock, Beelo unlock or device connectivity is justified. After Muhammad
requested opening Simulator, native control returned an iPhone 17/iOS 27 window;
raising it and screenshots confirmed Apple-logo startup followed by the Home
screen. This restores access, not app acceptance. Physical-iPhone acceptance remains not run. Next:
resume native checks and inspect the next captured C14 failure
before any runtime fix.
