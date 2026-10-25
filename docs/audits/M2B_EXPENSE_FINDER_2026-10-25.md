# M2b — all-date receipt and expense retrieval

## Scope and verified baseline

Approved next MVP slice: find saved expense evidence across dates instead of
searching separate photo albums or losing older entries behind a monthly view.
Baseline live bde3320/cache162. Original dirty worktree runtime/CSS/dependencies
preserved; runtime work stays in the isolated release checkout.

Source finding: Money's existing View Records queries only the current month
and suppresses read errors as empty arrays. Preserve its existing trip/month
behavior; add a distinct reliable finder, not new accounting, tax or filing rules.
The legacy monthly error treatment remains a separate known limitation.

## Implemented prototype capability

- Money → Find receipts & expenses → all dates by default. Search description,
  customer name/number and category text; optional inclusive UK start/end dates,
  exact pence-normalized amount, category, receipt presence and linked/general
  business filters. No claim of receipt-image OCR/full-text search.
- Read-only expense metadata projection; real Dexie iterates rows without keeping
  every full-size photo in the finder. Linked customers are fetched/decrypted
  through the existing batch API. Full receipt bytes load only on record opening.
- Render50 matches at a time, with explicit Show50 more and newest date first.
  This is render pagination over a local metadata scan, not a scalable server
  index. Minimal database fallback uses its existing toArray surface and can
  temporarily materialize full rows; large-library memory/performance unproven.
- General-business expenses and legacy records with missing dates remain visible.
  Missing amount says Amount unavailable, never invented zero. Deleted/missing
  customer references say Linked customer unavailable, not General business.
- Open the existing expense editor/receipt; cancel keeps filters and list state.
  Successful edits return to the filtered finder; a changed amount may correctly
  remove that record from the current matches. Receipt/creation timestamp and
  unchanged historical expense timestamp remain untouched by editing other fields.
- Read failures show an explicit retry error, never an empty-success list.
  Invalid dates/ranges/amounts retain controls for correction. Late read results
  cannot replace another editor or a navigated-away finder. Labels, keyboard
  Enter action and native buttons are provided; responsive390px layout is tested.
- Searches stay on-device; no new plaintext search index, URL query containing
  customer names, analytics, provider call or upload. Filters stay in memory for
  edit/navigation continuity; reload intentionally resets filters to all dates
  while records remain saved. Clear filters always returns to all-date results.
- DB48/Money14/cache163-expense-finder. No schema migration, new dependencies,
  financial calculations, customer-link semantics, receipt rewriting, exports or
  existing mileage changes. Saved-receipt image attribute escaping/alt text added
  in the reused expense/receipt viewer.

## Evidence / acceptance contract

- Old live-source contract fails because all-date finder API is absent.
- Source/minified unit tests: historical and general records, customer/amount/
  receipt search, inclusive UK/BST days, invalid ranges, unknown values, escaped
  input and explicit read failure. Real Dexie/minimal-engine DB tests verify
  metadata projection omits full photo data and leaves underlying receipt intact.
- Synthetic Chromium/WebKit journey:57 expenses including2020 receipt,55 historical
  general costs and undated legacy record. All-date listing,50-row paging, narrow
  customer/amount/date search, receipt bytes, cancel/edit/filter return, exact
  timestamps, range error, failed-read retry, offline search, online reload and
  late-editor isolation. External origins blocked, no POSTs/real customers.
- Visual QA caught an existing three-column row CSS mismatch; added the missing
  icon column and a regression assertion for actual text width, not just absence
  of page overflow. Final screenshot must show readable record text.
- Maintained normal browser runner adds the finder:19 journeys, not a replacement
  for earlier financial, protected-backup, communications or offline assertions.
  One earlier partial run was stopped for final editor/unknown-value hardening;
  it is not final acceptance. Full local/hosted/stage/live results follow.

## Verified release acceptance

Runtime `4d9f7d66ad46a5292f75fe4d49553a08501ae2d3` passes the final full local
19-journey gate and exact-source hosted **40154291996**, including units/server,
root/server dependency scans and all19 normal browser journeys. No assertion,
financial rule or browser wait relaxed. Finder and prior offline/communications/
expense-date/customer-link/protected-backup journeys all pass. Final screenshots
visually inspected; record text and receipt/customer labels are readable.

READY production-configured stage `dpl_HQSDVuWhomcjSPTKxUfe7yygYaqH`, exact
https://beelo1-npdijc54e-beelomvp.vercel.app, framework Other,
build-to-ready11.902s. Four changed runtime assets (shell, worker, DB and Money)
byte-match the tested source. Project/team beelomvp/beelo1 explicitly verified;
no credentials pulled, protection disabled, DNS or marketing-site change.
Previous public C25 `dpl_9tSQdQzyzAP3MEDU7PHtHR82gKXQ` /cache162 is the rollback
target; rolling back hides the finder, not its underlying expense evidence.
Preserve site storage and backups. Promotion and live checks follow.

## LIVE — 25 October

Promoted that exact stage (no rebuild) to https://beelo.beelestial.co.uk/.
All four public assets match4d9f7d6/cache163. Disposable public Chromium and
WebKit sessions pass the complete finder journey and existing expense-context
journey: historical/customer/date/amount search, paging, receipt byte retention,
cancel/edit return, invalid/read-error states, offline search, online reload and
late-editor isolation. No POSTs, provider contacts or real records used. These
are in-session offline searches; no new physical-iPhone or cold-reload claim.

Ten-minute production error/fatal scan02:23–02:33UTC25 October returned no logs;
not complete client monitoring or security assurance. Original non-doc dirty
diff remains SHA2568b6f2a59c93c01d1e4bee30742536a538f010119e3acf6b99e9b2f63e8e295d1.
No migrations, secrets/protection/marketing changes, record deletion or financial
rule changes. Use existing app Update and reload when ready; never clear site
data. Evidence: `../evidence/2026-10-25-expense-finder/`.

## Boundaries

This finds locally saved expense evidence only. No bank feed, bookkeeping ledger,
tax/MTD filing, automatic customer contact or pilot approval is implied. No bulk
deletion, historical migration, provider credentials or user's data used in tests.
Physical iPhone/VoiceOver/large-library acceptance remains separate from desktop
browser emulation. Existing capture, backup and stable-origin requirements remain.
