# Workspace cleanup — 7 November 2026

Status: LIVE and public synthetic checks passed at https://beelo.beelestial.co.uk/.

## Changes and retained scope

Removed superseded Home and Customer renderers, the second diary controller/polling loop, old-only helper/query code, 99 unused CSS rule blocks, an unreachable fitting-booking branch and the automatic social-post completion popup. Kept the current inline diary, all active customer records/features, manual social posting after successful fitting, note/audio capture, photos, imported documents, quotes/invoices, commission/service-fee calculations, backup and offline behavior. Optional business tools now sit under one disclosure; customer money is compact; tax details start collapsed. Added navigation-ownership guards after the payment regression exposed a late outcome refresh race.

No database migration, user-data deletion, provider/credential change, feature-scope retirement or marketing-site deployment is included. Source/minified pairs, storage fallbacks and historical evidence remain intentional. See [audit, rationale, screen inventory and open risks](../audits/APP_CLEANUP_AUDIT_2026-11-07.md).

## Verification

- Final runtime source: `cd2008b798990c103e1047affddbf66f5079b056`; main cleanup commit `38cdff2`. Work was isolated from the original dirty working tree.
- Full `npm test` passed on final runtime; social, documentation and maintained performance-gate checks passed. The gate validates the performance-check contract; no new Lighthouse score or speed benchmark is claimed.
- All 45 maintained browser journeys have a final passing result across bounded runs, with failure-stop/resume recorded. The original payment/navigation race failure and stale four-item navigation expectation are preserved, alongside fixes and reruns. This was not a single uninterrupted green run. [Results and execution history](../audits/evidence/workspace-cleanup-20261107/browser-acceptance-summary.json).
- Fresh local screen sweep: 22 Chromium and 12 WebKit states, synthetic data, zero page errors/POSTs/off-origin requests. Optional empty-state modules received smoke review, not exhaustive lifecycle testing. Current Home/Customer journeys exercise responsive widths and accessibility checks.
- Affected runtime files are 57,809 uncompressed bytes smaller (about 11% of those files); this excludes documentation/evidence and is not a network-speed measurement. All 58 remaining minified runtime files have a literal asset reference; this is an inventory check, not complete code reachability proof.
- Production artifact: 12 files exactly match local SHA-256 values; removed controller URL returns HTTP 404. [Staged hashes](../audits/evidence/workspace-cleanup-20261107/staged-asset-hashes.json), [public hashes](../audits/evidence/workspace-cleanup-20261107/public-asset-hashes.json).

## Deployment receipt

- Target/team/project: production · `beelomvp` · `beelo1` (`prj_CAmB2Q25P5G1oMCCIxMhs2FWzAwE`).
- Deployment: `dpl_CGvtrU28XYwDm7oRrPKirMSQZFys`, READY; https://beelo1-7a7kvxf9m-beelomvp.vercel.app/.
- Framework: static PWA plus existing serverless endpoints. Remote build completed in approximately 12 seconds, from deployment metadata.
- Cache: `advisoros-v6-198-workspace-cleanup`. Staged production artifact was verified before promotion; live cache197 was confirmed unchanged before switching.
- A previous staged cleanup build was superseded before promotion after the navigation-race finding; it was not the public release.

## Public acceptance and observability

- Live Chromium and WebKit: cleanup/navigation, retained document import (synthetic provider response) and cold offline relaunch all passed. These isolated encrypted browser sessions used synthetic records only; no real customer contact or paid AI upload occurred. [Public acceptance summary](../audits/evidence/workspace-cleanup-20261107/live-summary.json).
- Runtime error/fatal query for this deployment over the last 30 minutes returned no groups. This is a bounded observation; static browser checks do not exercise live provider endpoints. Drain configuration could not be verified because the connected API returned 404; it is not reported as absent or configured.
- App users can take the existing **Update and reload** prompt when it appears. No cache/database clearing is required.

## Limits and next actions

No physical-iPhone, Simulator, locked-screen/background GPS, VoiceOver or live paid-provider acceptance was performed in this cleanup. Browser engines and synthetic provider responses cannot establish those behaviors. Follow-on items are profile-versus-visit address presentation, predictable Home/chat return behavior, physical-device acceptance and evidence-led decisions about optional module breadth. Beelo remains a pilot-stage operational-memory tool, not a CRM, accounting or tax/MTD filing product.

Original tracked non-documentation diff remained `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`. Only new cleanup documentation/evidence and a concise living-record append are copied back to the original worktree. Continue runtime work on the isolated release branch rather than mixing the original uncommitted application edits into a deployment.
