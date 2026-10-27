# UX03a — return from a planned visit

## Scope and product boundary

Planner customer-name and Review visit actions now carry a validated internal
return destination: actual UK planning date, selected visit and scroll position.
The visit header Back returns to that plan. Its browser-history entry also keeps
the destination for browser Back. No generic router rewrite or booking writes.
Private order is still read from the existing encrypted setting, not changed by
navigation. Date labels and Today/Tomorrow selection reflect the actual retained
day after midnight. Existing reorder/reset/route-accept refreshes retain that day.
The pre-visit shortcut is shown only for a future actual date, not a stale
“tomorrow” route action after midnight; communication rules themselves unchanged.

Return position is restored after the shared iOS keyboard-scroll reset and is
guarded against navigation away/detached screens. Both document and app-panel
scrolling are supported. Visit-name focus returns with position. Missing/stale
rows do not trap navigation. Invalid return metadata and direct visit links use
the existing diary Back; there is no arbitrary external return URL.

This is deliberately partial UX03: nested customer pages, modal/edit Save
refreshes and new-visit Save return destinations remain separate work. It does
not claim every journey retains context. No messages sent, arrival promises
changed, financial rules changed, new providers, schema or credentials.

## Evidence / release status

- Source/minified units: strict valid date roundtrip including BST/rollover,
  internal action allowlist, bounded numeric position, invalid metadata fallback.
  Repeated with America/Los_Angeles and Pacific/Kiritimati process timezones;
  retained UK calendar day remained correct (not a save-time certification).
- Focused browser test passed in Chromium/WebKit:7 synthetic visits in private reversed order,
  App Back and browser Back, midnight change, detail reload, offline Back,
  responsive320/390/768, unchanged bookings/order and no external POSTs.
- Initial test assumed scroll belonged to #main; the unbounded layout actually
  scrolled the document. Test and implementation now explicitly support both.
  A later assertion sampled an in-progress scroll before the click; setup now
  uses a deterministic instant scroll and restoration is also instant. Failed
  screenshots retained in temporary focused/focused2/focused3 directories.
- Midnight simulation correctly expired the60-minute unlock grace on reload;
  the test now enters its synthetic passphrase through the real unlock UI,
  without weakening or bypassing app lock.
- Appointments68/cache173, DB49 unchanged. Released in checkpoint below.
- Candidate runtime source02ec6253115971cadaaeb53c94bfff98a9d251f9. Production stageREADY
  dpl_AkHKHzddnyyNa8JdhM156eLvMPA2 / https://beelo1-q6ia3wjzn-beelomvp.vercel.app,
  beelomvp/beelo1, Other/static PWA, build8.873s. Protected stage index/SW/visit
  bundle SHA256 matches source. Earlier stage dpl_9uEBA7tqcrtkEeCFuqsNhLjcjcYe
  and superseded source796a227 were held, not promoted; its local gate was
  intentionally interrupted and hosted40491622798 superseded/cancelled after
  the actual-day shortcut correction. Not a successful final release gate.
- Local full gate at02ec625 stopped at the old compact-plan test's exact
  `appointments?id=…` hash assertion: the visit now deliberately includes return
  metadata. Updated that test to parse and assert the original visit ID plus
  matching return visit, planning action and date. All compact/order/proposal
  assertions retained. This test-only correction does not change staged runtime.
- Hosted40491823273 also failed at exactly compact-plan line58's obsolete hash
  assertion (log/summary retained). Test-only825061afae3a9af0cbf1f244df0ae5782719f8cf
  differs only in that browser assertion; exact hosted40492772614 and fresh local
  full28-journey run subsequently passed. Focused corrected compact and proposed-route
  journeys pass in Chromium/WebKit; staged runtime remains02ec625 unchanged.

## Release checkpoint — LIVE27October2026

- URL: https://beelo.beelestial.co.uk/ (exact tested stage
  https://beelo1-q6ia3wjzn-beelomvp.vercel.app).
- Target: production, beelomvp/beelo1; statusREADY;
  deployment dpl_AkHKHzddnyyNa8JdhM156eLvMPA2.
- Runtime commit02ec6253115971cadaaeb53c94bfff98a9d251f9; test-only follow-up
  825061afae3a9af0cbf1f244df0ae5782719f8cf. FrameworkOther/static PWA;
  build8.873s. Promoted the existing stage, no rebuild/env change.
- Local build/unit/social/performance gates and all28 browser journeys passed.
  Exact hosted40492772614 passed root/server/dependency gates and all28 browser
  journeys; downloaded summary verifies825061a. Earlier failures remain retained.
- Public index/SW/appointments SHA256 matches source. Initial public browser
  `goto` timed out waiting for the full load event, before any journey actions.
  Root/core-script probes returned200 in150/99/30ms. A separate retained public
  probe changes only initial navigation to DOMContentLoaded with45s bound; all
  existing explicit app-ready, UI, record and no-send assertions retained. Both
  Chromium/WebKit public journeys passed. No production code changed for this
  probe. The cause of the initial full-load timeout is not established.
- Post-deploy error/fatal function-log scan27Oct22:31:29–22:41:29UTC found no
  matching records. Monitoring gap: not client/native/error-tracker coverage;
  no drains/monitoring configuration inspected or changed in this slice.
- Rollback: cache172 / dpl_Dc5WEgkX2FUpQXToSdPrkWrvkM4k.
- Evidence: docs/evidence/2026-10-27-planning-return/: successful local/hosted
  summaries, public probe/source/log/PNGs, initial public timeout log, held local
  and hosted failures, compact failure and synthetic unlock-screen captures.

Native iPhone gestures, VoiceOver and physical keyboard are not certified by
these synthetic Chromium/WebKit checks. Next: customer/edit return continuity,
then canonical Home attention simplification.

## Next slice acceptance (planned, not implemented here)

- Visit → linked customer → Back returns to the originating visit, then its
  plan. Validate the customer/visit relationship; never carry a previous
  customer's origin into a direct profile link.
- Saving visit notes must retain that visit's return destination, without
  changing text/audio persistence rules. Contact-attempt/reply Save must retain
  profile origin while preserving the explicit factual communication record.
- Browser Back/reload/offline and stale/removed rows need separate checks;
  completed/cancelled visits must not be reinserted into an active plan merely
  to restore focus. Preserve ordinary direct-link fallback.
- Other edit/outcome/photo flows need individual review before claiming global
  return continuity. Do not broaden this slice into a router rewrite.
