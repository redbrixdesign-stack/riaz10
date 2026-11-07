# Finance and onboarding corrections — 7 November 2026

Status: implementation complete; release acceptance in progress, not yet promoted.

## Corrected behavior

- Cash spending stays recorded. A shared expense breakdown now drives Home, Money and the exported tax planning estimate. Fuel, vehicle costs and vehicle insurance are covered by simplified mileage and are not deducted again. Business insurance has a distinct category. Old untyped insurance, Other and unknown categories remain visible cash expenses but sit outside the deduction pending review; nothing is silently recategorised or deleted. Parking and public transport have explicit business categories.
- Business categories assume wholly business use. Eligibility, private-use proportions, capital treatment and other personal tax circumstances are not resolved by a category label. The UI/export state these boundaries. This is not an accounting, tax-filing or MTD implementation.
- Only confirmed business miles count. Period calculations use prior mileage in the tax year before applying the lower band, and split at the UK 6 April boundary. Current 2026/27 first-band rate is 55p; the supported pre-6 April 2026 illustration uses 45p, with 25p thereafter. No broader historical/future/other-vehicle tax certification is claimed. [HMRC guidance checked during implementation](https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles).
- Home is explicitly an annualised weekly budget reserve; Money/export use recorded year-to-date profit. Neither is actual take-home, an HMRC bill or reconciled payments. A failed mileage read is unavailable, never a false zero; expense capture stays accessible. The fake “Saved ✓” savings button was removed: it only displayed a toast and persisted nothing. Reserve suggestions appear only for a positive estimated liability.
- New setup uses a generic editable role for the selected trade, blank social links and an explicit commission choice. “Not set” produces zero estimated sales/survey commission until configured; simple and two-stage rates are reviewed and validated. Existing adviser defaults, identity, social links and commission remain intact. Existing £20 service-call pilot rules and held survey/attendance policy decisions were not changed or approved for other trades.
- Weekly target zero remains zero throughout setup, Settings, Home, Money, Ask Beelo and morning-brief text. The target is labelled recorded earnings before expenses/tax, rather than net take-home. Invalid rates/targets and failed setup saving retain the form.
- First-run setup shows local storage, provider and recovery information inline and requires explicit acknowledgement before completion. The returning-user prompt now listens for navigation/resume and avoids interrupting active forms; a timer firing during slow setup/unlock cannot permanently lose the Home opportunity. Acknowledgement persistence failure is reported.
- Settings retains/editably saves the introduction. Protected restore now persists the role and social links into the restored configuration as well as zero targets/manual commission. AI setup copy points advisers to the pilot organiser rather than instructing them to deploy server code. No self-service registration, individual account, provider-key provisioning or credential rotation was added.

## Evidence and acceptance

- New source/compiled unit cases: `tests/mvp-finance.test.js`, `tests/mvp-onboarding.test.js`; included in `npm test`.
- Reproduced audit fixture now yields cash £50, mileage deduction £5.50, and no additional fuel deduction. A mixed fixture retains cash £270, eligible nonvehicle expenses £155, mileage-covered costs £65 and expenses awaiting review £50. An explicit insurance-category correction updates only its classification, retaining cash totals.
- Shared annual-band fixture: after 10,000 prior business miles, the next ten miles contribute £2.50 to the period deduction, with the same result on Home and Money.
- New maintained Chromium/WebKit journey: genuine slow first run, invalid name/rate, mandatory acknowledgement, setup write failure/retry, zero target, generic/custom role, explicit commission, no inherited social links, Settings reload/offline, expense review and exported estimate, failed mileage reads, 320–768px and existing-profile preservation.
- Protected-backup journey strengthened to verify title, social links, zero target and unset commission after a genuine different-key restore and reload, alongside existing >1 MB media, Unicode, wrong-password and cancellation safeguards.
- The first new browser test selected an intentionally collapsed setup field; it was corrected to expand the section. A later error-state selector selected a hidden alternative capture button; it now asserts the visible control. Original failed attempts and interrupted pre-final run are retained in the release evidence, not labelled as passing.
- Offline Settings manifest and version-sensitive precache test now derive the same current asset. Core source/minified assets and the offline manifest are versioned together as cache `advisoros-v6-199-finance-onboarding`.

## Scope and open gates

No database schema migration, real customer contact, automatic communication, paid-provider upload, new integration or marketing-site update. Existing financial/media records are preserved; projections change, not raw amounts. Raw CSV/backup records remain intact.

This closes the reproduced MVP-01, MVP-02, MVP-03 identity/default-scheme and MVP-06 target defects within the stated prototype scope, subject to final deployment checks. It does not close physical-iPhone acceptance, real-phone protected-backup restore, native media/Maps/WhatsApp/background behavior, current positive AI-provider acceptance, per-adviser access isolation, independent legal/security assurance, or the separate business-rule decisions. An external pilot is not approved by these fixes.

Final source, acceptance summaries, production asset hashes and deployment receipt will be appended after release verification.
