# Customer profile visibility correction — 5 November 2026

## Problem and evidence

The user confirmed they were seeing the newer “Before you arrive / Your money”
profile, not an old installed version. The previous release had customer-linked
actions and figures, but money was collapsed and communication actions/history
were separated by the financial section. The experience did not make the agreed
single customer workspace clear. Earlier acceptance entered the customer route
directly instead of testing the user's Upcoming visit → customer path.

The strengthened test reaches Home's Upcoming featured visit, opens Visit, then
uses “View customer profile”. Against public cache179 it reproduces the closed
money panel (expected open, actual closed). This is a visibility/discoverability
failure, not evidence the underlying financial data was absent.

## Implemented correction

- Header explicitly says **Customer workspace**.
- A money summary is visible near the top: recorded earnings, saved expected
  estimate, linked expenses and commission receipts. Receipts remain labelled
  “Not tracked separately”; order value is not represented as adviser income.
- Clear Communication, Money and Products controls move within the same
  customer page. They do not navigate to the global Follow-ups or Money screen.
- **Communication & follow-ups** groups the canonical next actions, inline
  editor, saved history, replies and recorded phone activity together.
- Detailed financial records start expanded. Existing global work-wide indexes
  remain; the customer-specific tasks can be handled from the profile.
- No new data store, migration, financial formula, attendance rule, messaging
  provider, automatic send, credential or environment change.

## Verification

Runtime candidate: `65c10d68e355aed8d52602ebbf096b91a92d673a`, cache180.
Focused Chromium/WebKit journeys pass the actual entry path, visible summary,
grouped communication, no horizontal overflow at 320/390/768, inline notes,
offline/reload, selected-window agreement/retraction, linked expense edits and
return position. Moving to Money while a reply is unfinished retains both its
text and the customer URL. Financial responsibility does not change balances.

The older follow-on CI run 41943002727 failed an expense-profile disclosure
visibility check. The helper previously clicked an already-open restored
disclosure closed. The maintained expense journey now opens it only if closed;
source finance/data assertions remain. This failed run is not release evidence.

Full local/hosted gates and exact staged/public artifact evidence are recorded
below. No real customer was contacted; browser contexts and
records are synthetic, with native/provider launches intercepted.

## Boundaries and next actions

The Visit screen still has its specialist controls; this correction verifies
the requested Upcoming visit → customer entry rather than claiming every app
entry opens a profile directly. Native iPhone switching, VoiceOver and broader
legacy async/privacy review retain their previous acceptance limits. Pilot
positioning remains operational memory beside existing company tools, not
accounting, tax or filing software.

## Verified live release

- Full local `npm run verify:release` passed at source65c10d6, including all
  **32/32 browser journeys**, build, unit, social and performance-gate contract
  tests. No new measured Lighthouse score is claimed.
- Hosted [run 41976735391](https://github.com/redbrixdesign-stack/riaz10/actions/runs/41976735391)
  passed at that exact source: root/server/dependency checks and **32/32 browser
  journeys**. Saved summaries include the source SHA.
- Scoped WCAG A/AA axe scans report zero violations in the revised profile in
  Chromium/WebKit. This does not certify native VoiceOver.
- Staged production build interval: 14.714 seconds. The four changed runtime
  files match source/stage/public hashes. Promoted the exact stage without a
  rebuild; public beelo.beelestial.co.uk serves **cache180-customer-profile-sections**.
- Live-domain workspace (actual Upcoming visit → customer), customer-follow-up
  and expense-context journeys pass in both engines, with synthetic records.
- Bounded error/fatal function-log query for this deployment found no matching
  entries between 05:53:53 and 06:03:53 UTC on 5 November. No claim of complete
  client/native monitoring or external provider health; no monitoring changes.
- Documentation checks pass. Original b833 non-doc dirty hash is unchanged:
  `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`.

Promoted stage:
`dpl_FmCtc6KDKG77dSFiNqkCGH4KFu3b` /
`https://beelo1-jard3xv7p-beelomvp.vercel.app`, production READY, existing project
beelomvp/beelo1. Rollback baseline: cache179 / runtime2a8b9ad /
`dpl_6yk1WHUdLKaN9nit4pGTMQ2eUnKU`.

Screenshots and acceptance summaries:
[customer-profile-visibility-2026-11-05](evidence/customer-profile-visibility-2026-11-05/).
