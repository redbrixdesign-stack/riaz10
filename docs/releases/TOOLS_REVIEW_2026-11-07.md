# Tools review and cleanup — 7–8 November 2026

Runtime commit: `d622bef` on `codex/adviser-workflow-20261107`. Production candidate: `dpl_3R6D6375xKkWoJX1bDzDj5CVB3uP`, https://beelo1-fimo5gb4v-beelomvp.vercel.app/. Cache: `advisoros-v6-200-tools-review`.

## Scope

[Complete relevance audit, including every original Tools entry and 16 Settings destinations](../audits/TOOLS_RELEVANCE_AUDIT_2026-11-07.md).

- Everyday Tools reduced from 17 visible entries to 10; seven existing optional workflows are in one collapsed group.
- Removed duplicate Tools shortcuts for customer search, measurement and generic scanning, keeping Home/Customer/Visit entry points and the measurement deep-link fallback.
- Removed unsafe phone-matched demo deletion, unused date helper, and mock-only integration adapter/controls. Customer and legacy exchange records are preserved.
- Backup & restore now opens the existing explicit data/recovery choices rather than directly exporting raw JSON.
- Fixed Jobs/Suppliers empty-state dead ends, cold job-costing loading, unclear costing labels/company revenue guard and end-of-day close markup. No data migration or automatic record deletion/reclassification.

## Verification

- Full unit suite, communications source/compiled safety checks, social/privacy tests, documentation contracts and maintained performance-gate contracts passed. No fresh Lighthouse performance score is claimed.
- Initial targeted Tools/navigation/cleanup/Home-Money checks passed in Chromium and WebKit. Expanded focused Tools acceptance opens all 17 entries plus 16 Settings destinations in each browser, tests cold costing and explicit commission versus held company order, and leaves a synthetic WhatsApp handoff unconfirmed without sending anything. Screenshots inspected; no page errors or POSTs. External requests blocked.
- First expanded browser run failed on a test locator that omitted the costing button's decorative icon text. The action-based locator and actual confirmation button label were corrected; initial failure is retained in evidence rather than reported as a pass.
- Ten staged runtime assets match local SHA-256 values. Live cache199 was verified unchanged while candidate had no domain aliases. All 47 maintained browser journeys passed on the unchanged runtime; the expanded Tools/Settings navigation test additionally passed separately. The later test-only changes add Settings waits/screenshots and correct an output description; they do not change production assets. Live promotion results follow below.

Evidence: [stage hashes](evidence/tools-review-20261107/staged-asset-hashes.json), [targeted checks](evidence/tools-review-20261107/targeted-summary.json), [focused Tools/Settings checks](evidence/tools-review-20261107/tools-settings-summary.json), [unit output](evidence/tools-review-20261107/unit-tests.txt).

## Boundaries

Tests use fresh encrypted synthetic local profiles only. No customer contacted, autonomous message sent, provider upload performed, secret changed or marketing site deployed. Optional jobs/orders/invoice/supplier/availability records and database schemas remain available. Existing commission/£20 service-call rules, raw expenses/mileage and media were not changed. Physical iPhone/native media, background location, real-phone restore and positive current AI-provider acceptance remain separate open gates. This is not broad MVP/pilot approval or accounting/MTD/tax-filing capability.

## Preservation

Work was made in `/private/tmp/beelo-home-release-20261107`, separate from the user's dirty worktree. Original tracked non-documentation diff SHA-256 before work: `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`. Final comparison and evidence-copy status follow below. Source/minified counterparts remain intentional build outputs.

[Full 47-journey release summary](evidence/tools-review-20261107/release-acceptance-summary.json). Full per-journey output is retained beside the summary.

## Live completion — 8 November 2026

- The same verified production artifact was promoted without rebuilding. Live cache is `advisoros-v6-200-tools-review`; all ten changed/core SHA-256 values match. [Public hashes](evidence/tools-review-20261107/public-asset-hashes.json), [deployment receipt](evidence/tools-review-20261107/deployment.json).
- Fresh public Chromium and WebKit sessions passed all 17 Tools destinations and 16 nested Settings entries, held/explicit-policy costing, human send-confirmation entry and Home/Money/customer navigation with reload/offline in-app navigation. No page errors, POSTs or real customer contact in these journeys.
- The first public backup test stopped at startup because it used the intentionally local-only encryption test flag; production correctly ignored it. The harness now completes normal passphrase setup. A focused recheck passed both locally and publicly in both browsers: >1 MB protected export, password mismatch, cancellation, wrong-password preservation, declined restore, separate-profile encrypted import, exact audio/photo/Unicode and reload. No app/security relaxation or redeployment was needed. [Consolidated public results](evidence/tools-review-20261107/public-acceptance-summary.json), [genuine live backup details](evidence/tools-review-20261107/public-genuine-backup-details.txt). Earlier failed attempts remain visible in evidence.
- No runtime change followed `d622bef`; subsequent edits are test harness, audit and evidence only. Existing users use the normal **Update and reload** prompt; clearing website data, resetting passphrases or migrating records is unnecessary.
- Original tracked non-documentation changes still hash to `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`. Only this new audit/release evidence and an append-only development-record entry are copied back; original app files remain untouched.

Remaining scope: physical-device acceptance and the three precise Settings wording recommendations in the audit. Optional business scope is preserved for evidence-led pilot decisions; no pilot approval is implied.
