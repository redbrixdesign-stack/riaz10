# Beelo MVP readiness — 7 November 2026

## Verdict

**Not ready for an unrestricted, self-service or paid launch.** The current app is suitable for continued founder evaluation and synthetic demonstrations. A supervised external pilot is the next sensible milestone, **after the finance and onboarding defects below are repaired and the physical-device/recovery gates are evidenced**. This assessment does not approve a pilot or certify compliance.

The gap is now trustworthy operation and onboarding, rather than adding more modules. Accounts, subscriptions, cloud sync, team dispatch, more social features and global expansion are not prerequisites for a small assisted pilot. The absence of automatic cloud recovery must, however, be clearly understood and mitigated with a proven backup process.

## Assessed build and method

- Live `https://beelo.beelestial.co.uk/`, cache `advisoros-v6-198-workspace-cleanup`; runtime `cd2008b`, documentation/test HEAD `ac370d4` at assessment start. [Exact release and acceptance evidence](../releases/WORKSPACE_CLEANUP_2026-11-07.md).
- Reused the just-completed final unit suite, 45 maintained browser journeys with recorded corrections/resumes, 34 screen-state sweep, 12 matching public asset hashes, and public Chromium/WebKit cleanup, document-import and cold-offline checks. These were not rerun or relabelled as new evidence for this assessment.
- Fresh isolated Chromium and WebKit first-run sessions: genuine new passphrase, missing-name validation, non-window-coverings trade, target zero, first Home, AI settings and reload. No pre-completed onboarding/test-key flag was injected. A second diagnostic deliberately held setup open beyond the five-second disclosure timer. Synthetic information only; no real calls/messages/media/provider requests. [Chromium observations](evidence/mvp-readiness-20261107/chromium-first-run.json), [WebKit observations](evidence/mvp-readiness-20261107/webkit-first-run.json).
- A local calculation fixture reproduced the expense/mileage conflict, without database writes. [Fixture](evidence/mvp-readiness-20261107/financial-probe.cjs), [result](evidence/mvp-readiness-20261107/financial-probe.json).
- Live Claude and transcription endpoints both rejected deliberately invalid synthetic credentials with 403; no audio/customer content was submitted. This establishes rejection, not successful provider service or correct budget enforcement under load. [Results](evidence/mvp-readiness-20261107/negative-api-probes.json).
- Connected production error query over 24 hours returned no runtime error clusters. That is a bounded server-side observation, not browser-error coverage, an uptime SLA or evidence of actual adviser adoption.
- No physical iPhone, native share/Maps/WhatsApp acceptance, background GPS trial, current positive paid-provider test, independent security review or observed external-adviser study was performed.

## Readiness gates

| Area | Evidence-supported state | Decision |
| --- | --- | --- |
| Capture, visit types, customer context and retrieval | Implemented; current automated journeys cover the core workflows and persistence | Browser-supported foundation; complete native acceptance |
| Planning and next action | Shared current-customer evidence, inline diary, tomorrow planning and proposed route exist | Useful prototype; prove usefulness in a real working day; no guaranteed optimal-route claim |
| Human-controlled communication | Purpose/visit evidence, persistent drafts/handoffs and explicit confirmation covered by tests | Retain; prove actual iPhone return/suspension and no duplicate obligation after confirmation |
| Typed/audio notes, photos, measurements and imported documents | Implemented and browser-tested, including import review and seven-window workflows in existing evidence | Native recording/playback/media selection and current provider service remain unverified |
| Offline capture and updates | Browser cold-relaunch, encryption, recovery and intentional update checks passed | Native airplane-mode/relaunch/update gate still open |
| Backup and device loss | Protected export/restore implemented and browser-tested; no hosted recovery | Actual Files export and restore into a separate empty installation must pass before real-data pilot reliance |
| Money and tax estimates | Supported commission/service earnings plus estimates; new deductible-cost defect reproduced | **Hold reliance on tax/take-home figures until corrected and reconciled** |
| New adviser onboarding | Name validation/reload pass; incorrect trade identity, target handling and missed disclosure reproduced | **Fix before external onboarding; use assisted setup** |
| AI access and operating costs | Off by default; invalid credentials rejected; shared budgets exist in source/tests | Manual technical provisioning remains; no individual account/revocation or successful current provider acceptance proved |
| Pilot support and useful outcomes | Draft materials and historical plans exist; no executed current pilot sign-off found | Assign support/recovery owner, participants and measurable acceptance before inviting users |
| Commercial/self-service release | No accounts, billing, cloud recovery or self-service AI provisioning | Not the present MVP milestone; not release-ready |

## Prioritised defects and missing acceptance

**P1** blocks the relevant real-data pilot promise. **P2** is a material usability/documentation issue, not evidence of data loss.

| ID / priority | Reproduction or missing evidence | Required result |
| --- | --- | --- |
| MVP-01 / P1 — conflicting vehicle deductions | `TaxCalculator.calculateFromData` adds all expenses to mileage. Synthetic £1,000 commission + £50 fuel + 10 confirmed business miles yields £55.50 deductible: fuel £50 plus mileage £5.50. Home already follows a different vehicle-cost exclusion approach. | One explicit, consistent expense/mileage policy and truthful cash-versus-tax presentation across Home, Money and exports. Reconcile vehicle and nonvehicle insurance, prior-year rates, expenses and commission fixtures. Do not simply remove genuine cash expenses from records. |
| MVP-02 / P1 — first-run disclosure can be missed | Start with empty storage, create passphrase, leave onboarding open beyond five seconds, complete it, remain on Home beyond five seconds. Neither engine showed “Your records stay on this phone”; acknowledgement remained absent. `ConsentPrompt._schedule` returns on onboarding/empty route without rescheduling. | Present the storage/recovery/provider explanation reliably at a suitable onboarding boundary, while preserving unfinished forms. Test slow unlock/setup and navigation transitions. This is a UX/disclosure failure, not a legal determination of GDPR/cookie compliance. |
| MVP-03 / P1 for broad-trade pilot — wrong adviser identity/default economics | Fresh setup selecting Plumbing retains `Independent Hillarys Window Coverings Expert`; onboarding does not review title or commission scheme. The default two-stage scheme is 20% reduction then 15.25% net commission. | Initial pilot limited to an explicitly selected adviser profile, or correct per-adviser identity and commission setup before first draft/earnings. No assumed Hillarys affiliation for another company/trade. Shared secret must not be mistaken for an individual adviser account. |
| MVP-04 / P1 — physical reliability and recovery unaccepted | Existing physical-iPhone checklist explicitly marks P01–P12 Not run. Browser evidence does not prove native Files restore, camera/audio/media, keyboard, WhatsApp return, native Maps, VoiceOver, suspension or background location. | Execute applicable cases against this exact release with synthetic records. Protected backup must be restored and read back in an empty disposable installation. Never clear the founder’s working app to test it. Scope/background limits must be explicit. |
| MVP-05 / P1 for advertised AI capability — provisioning and current provider proof | Fresh app AI is off and proxy unset. Settings asks a novice to configure a function URL/shared secret and deploy serverless code. It labels the secret optional although production authentication requires it. Current successful provider behavior is mocked in release tests; rejection alone is proved live. | Owner-assisted provisioning for each pilot device, clear registered/online/limited/error states, documented budget/support process and one consented synthetic positive test for each included AI capability. No provider key in the browser; do not send customer media to obtain test evidence. |
| MVP-06 / P2 — zero weekly target silently changed | Enter 0 in the field whose minimum is 0, finish setup: both engines persist/display target 600 because `parseFloat(value) || 600` replaces zero. | Preserve zero if valid, or reject/explain a positive minimum consistently. Also clarify whether target is recorded earnings or net take-home; current onboarding says net goal. |
| MVP-07 / P2 — contextual presentation | Cleanup audit observed missing profile address despite an available visit address; Home can retain a previous chat on return. | Distinguish visit/profile addresses and establish predictable Home navigation without silently copying stale context. |
| MVP-08 / P2 — pilot execution/release discipline | No executed current-device sign-off, participant outcome evidence or verified branch-protection enforcement found. The physical checklist references a missing `BEELO_RELEASE_BASELINE.md` in this checkout. | Point acceptance at the actual release receipt; name support/rollback/recovery ownership; verify release gate enforcement; record pilot approval separately from test passes. |

### Financial boundary and official-source check

The mileage-rate text itself is not the defect identified here: the current government page lists 55p for the first 10,000 car/van business miles in 2026/27 and 25p thereafter. It explains that simplified mileage replaces relevant vehicle purchase/running costs, including fuel, servicing and insurance. The reproduced addition of fuel to the mileage deduction conflicts with that method. This is a scoped implementation finding, not a full tax/compliance review. [HMRC vehicle simplified-expenses guidance, checked 7 November 2026](https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles).

The app is not a full personal tax calculation: other income, Scottish treatment, individual reliefs and vehicle-method eligibility require appropriate handling/boundaries. Founder-confirmed commission/fee examples need reconciliation before any “actual take-home” claim. Existing held survey-basis and attended-access/no-show eligibility decisions are not resolved by this audit.

## Smallest route to an external MVP pilot

1. **Trust first:** fix MVP-01 and MVP-02, plus MVP-06 while onboarding is being corrected. Add regression cases for the exact reproductions, retain raw records and approvals, then stage/test/promote the accepted build.
2. **Configure the intended adviser:** correct identity/title, trade, commission scheme, weekly-target meaning, business base and contact preferences. Keep the pilot within that approved profile; avoid marketing unsupported trades/countries.
3. **Prove the phone and recovery:** complete the current-device matrix for sales → context/seven windows → outcome; separate referred survey → fitting; completed attended service call; receipt/trip retrieval; pending/sent communication; offline close/reopen; protected backup/restore; update with a draft. Define manual fallbacks for native/background restrictions. Any lost record or false sent/payment/save claim stops acceptance.
4. **Prove optional services:** a synthetic successful scan/transcription, denial/failure with retained data, and an understood shared usage cap. AI must remain optional for local capture/readback.
5. **Run a supported pilot:** begin with a small founder-assisted subset within the proposed 5–10-person cohort, rather than opening self-service registration. Suggested observation period: two working weeks. These are recommendations, not recruited participants or existing outcomes. Define success before starting: no lost records/unapproved contacts, successful recovery, reliable next-customer choice, ability to retrieve notes/receipts without help, and adviser-reported admin burden. Record failures as well as successes.

Recommended pilot surface: Home/next action; reviewed visit capture; Customer workspace with communication, measurements, notes/audio and photos/documents; tomorrow plan and native-map handoff; receipt/expense and confirmed mileage records; clearly bounded earnings; protected backup. Keep existing secondary modules available as already implemented, but do not expand them to reach MVP. Any removal or material claim/scope change remains a separate decision for Muhammad.

## Preservation and status

Assessment/documentation only. No runtime fix, credential/permission change, deployment, real customer contact or database migration was made. Fresh browser records are isolated synthetic records. Original tracked non-documentation diff remains `8b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1`. Findings are open; prior browser passes do not override these new reproductions. There is no pilot-approved feature designation or claimed traction.


## Implementation update — finance and onboarding corrections

The original findings above describe cache198. [Cache199's verified corrections](../releases/FINANCE_ONBOARDING_2026-11-07.md), runtime `dff299f`, are now live: shared cash/deduction/mileage policy and category review, truthful planning export/no fake savings acknowledgement, reliable first-run disclosure and setup guard, generic editable new-adviser identity/blank social links/explicit commission choice, zero targets, and profile preservation through backup restore. Existing founder settings were preserved. All 46 maintained browser journeys passed, with final committed setup/restore checks and public smoke evidence recorded separately.

This resolves the reproduced MVP-01/MVP-02/MVP-03 identity/default-scheme/MVP-06 defects within the documented prototype assumptions. MVP-04 physical acceptance, MVP-05 assisted access and positive-provider proof, business-rule decisions and broader pilot/support gates remain open. The earlier no-go for an unrestricted/self-service launch remains; no pilot approval or financial/legal certification is inferred.
