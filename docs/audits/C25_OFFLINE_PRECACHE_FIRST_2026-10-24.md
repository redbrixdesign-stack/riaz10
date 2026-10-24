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

## Primary references

The implementation follows the documented cache-first sequence: check the cache
before using the network, and retain the existing controlled worker-update flow.
References inform the design, not a claim that a browser issue is conclusively
the same as Beelo's failure:

- [MDN service-worker cache-first example](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN fetch-event response contract](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event)
- [MDN event-lifetime contract](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil)
