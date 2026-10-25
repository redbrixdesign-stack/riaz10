# C25 — remove network work from installed script delivery

## Defect and bounded diagnosis

User asks to fix the offline Quotes blocker, preserving other functionality.
Existing isolated runtime is C24 8297267; evidence checkpoint7a2c439. Original
dirty worktree runtime remains untouched. No real records or messages are used.

Hosted40129176205 (before C24) and40132428013 (C24) fail first-offline WebKit
Quotes despite the required versioned files being present in Cache Storage.
They show bounded load-error recovery, not a successful Quotes screen. The
latter reports WebKit Internal error. Earlier green runs do not erase either.

Verified source defect: every cached script starts `fetch()` before checking
the cached response, and attaches that refresh to the fetch event lifetime.
Installed, explicitly versioned script delivery therefore starts failing or
potentially hanging network work despite needing no changed bytes. The original
worker fails the new deterministic regression: cache hit starts1 network request
instead of0. This is a demonstrated unnecessary network coupling; browser-engine
internals and the exact cause of every historical stalled response are not proven.

Story: first offline navigation → lazy script request → installed cached bytes →
actual Quotes render, with no network refresh for that exact installed version.

## Narrow implementation

- Cache162 `offline-precache-first`. Only exact JS/CSS URLs with `v` entries in
  the existing install manifest get the no-refresh cache-first path. The current
  version URL still changes whenever its code changes.
- Cache hits return installed bytes without `fetch` or a refresh lifetime.
  Genuine misses still fetch and cache a successful response; offline misses
  return504, never HTML or an empty200 pretending that a script loaded.
- Unknown versions and other static assets retain their existing refresh policy.
  Navigation, private API GET, non-GET, install/activation/adviser-controlled
  update, encryption/database/schema, provider and financial rules are unchanged.
- Existing15-second explicit screen recovery stays; it is not widened or used
  to pass a failure. No automatic retry or clearing browser/customer data.
- The normal first-offline browser journey keeps all existing render/reload/data
  assertions and additionally rejects any offline network request for installed
  versioned scripts. No harness transport, timeout or assertion is relaxed.

## Verification and release contract

- New in-memory worker regression: old source fails zero-network contract; new
  source passes cached/hung-network independence, miss/504, changed-version,
  private-API and POST boundaries. Added to maintained pretest.
- Focused unchanged first-offline Chromium/WebKit journey passes all nine
  secondary screens, protected-backup dialog, return-online reload and retained
  synthetic customer. This is automated browser evidence, not physical Safari.
- Full local/hosted, diagnostic transport and staged/live evidence follow when
  complete. Do not infer release permission from one green intermittent rerun.
- C24 communication behavior must still pass as part of the18 maintained browser
  journeys. Never send customer messages or mark real messages sent in testing.

## Verified release decision — 25 October

Runtime `bde332019df0224e7ccd2cff1b618e25a78bd96d` passes the full local
18-script gate and exact-source hosted **40133427558**, including unit/server,
root/server dependency audits and all18 browser journeys. This is the first
hosted run of the repaired worker, not a rerun of the old failing source.
The strengthened normal offline test also rejects offline script-network work.
Hosted WebKit Quotes contains the actual Quotes/empty-state UI and records no
page/console errors. C24 communication and held M2a expense-context journeys pass.

Local test-only instrumented socket-drop and stopped-origin cells pass; both
Quotes dependency traces show cached200/response200 and **zero network starts**.
Deliberately deleting the dependency still yields the expected cache miss/504 and
failed journey; the diagnostic detects it. No diagnostic worker is deployed.
These are materially new causal-contract and transport observations, not a waiver
based on a repeated green run. The automated C14 release boundary is satisfied;
physical Safari/iPhone return/offline acceptance and wider product assurance
remain limited, not silently certified. Earlier failed artifacts remain retained.

READY production-configured stage `dpl_9tSQdQzyzAP3MEDU7PHtHR82gKXQ`,
https://beelo1-bba07u0vg-beelomvp.vercel.app, framework Other,
build-to-ready9.366s, cache162. All11 changed runtime assets byte-match the tested
source, including previously held C23/M2a/C24 assets. Existing team/project
beelomvp/beelo1 explicitly verified. No secret, protection or DNS change.
Promotion/live checks are recorded below after completion. M1/cache158 deployment
`dpl_5yN4v2iF2gAwA24K9yAnspNPNvmT` is the known previous public rollback target;
rolling back must preserve storage and does not undo adviser-confirmed records.

## Live verification — 25 October

Promoted that exact stage (no rebuild) to **https://beelo.beelestial.co.uk/**.
All11 public runtime assets match bde3320, including cache162. No marketing-site,
credential, protection or customer-record change. C23 recovery, M2a optional
customer-linked expenses and C24 communication repair are now included live.

Disposable public-origin browser sessions verify C24's full handoff/confirmation/
already-sent/reload/failure/isolation flow in Chromium and WebKit, and M2a's
customer search/link/profile/reassign/unlink/error/reload flow in both. The opener
is mocked and external origins blocked in those tests: no WhatsApp/provider send
or real customer data. Public Chromium passes the complete first-offline nine-route
journey and online reload with retained synthetic customer. Public WebKit verifies
cached assets but does not claim first-offline execution, because its network
emulation blocks that delivery; the local/hosted socket-drop journey covers the
automated execution separately. Physical iPhone remains a stated separate limit.

Ten-minute production error/fatal scan01:53–02:03UTC25 October returned no logs.
This is short server-log evidence, not full client monitoring/security assurance.
Original dirty non-doc diff remains SHA256
`8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`.
No real records were used or marked sent by validation. Users apply the existing
Update and reload prompt when ready; never clear site data to obtain an update.
Evidence: `../evidence/2026-10-25-offline-precache-first/`.

## Primary references

The implementation follows the documented cache-first sequence: check the cache
before using the network, and retain the existing controlled worker-update flow.
References inform the design, not a claim that a browser issue is conclusively
the same as Beelo's failure:

- [MDN service-worker cache-first example](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN fetch-event response contract](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event)
- [MDN event-lifetime contract](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil)
