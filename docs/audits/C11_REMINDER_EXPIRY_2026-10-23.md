# C11 — Revalidate delayed visit reminders

## Finding and scope

During the next acceptance checkpoint, iPhone 17 / iOS 27 Simulator Safari displayed an already-open “Next appointment now — 09:00” sheet at 17:47 for MOCK Alice. This observation alone cannot distinguish a newly delayed callback from an older sheet left open. The sheet was subsequently dismissed through native Simulator control; no records were changed. Screenshot retained in the original workspace's `docs/evidence/2026-10-23-reminder-expiry/`.

Source inspection identified a separately reproducible callback defect: scheduling excludes visits more than 15 minutes past, but `_fireVisitReminder` did not recheck time, enabled state or prior delivery after its asynchronous lookup. A suspended/late callback therefore emitted both notification and modal outside the scheduler's own window. The new test fails on the old source with `Suspended timer expired notification: 1 !== 0`.

Isolated fix: recheck current enabled/database state, valid booking timestamp, unchanged booking key/status/outcome, the existing +/-15-minute window and persisted delivery marker immediately before marking delivered/showing anything. Expired/disabled/premature/replayed callbacks do not consume the reminder. No appointment completion, reschedule, communication, income, commission, real message, provider request or historical record rewrite.

## Verification

- Source and minified tests cover early/expired callbacks, final valid grace boundary, invalid dates, disabled/unavailable state, concurrent/replayed callbacks, rescheduling and disable/expiry during an awaited lookup. Existing valid-reminder test now advances its fake clock to the actual scheduled fire time instead of calling it 30 minutes early.
- Real-browser journey uses actual IndexedDB and disposable synthetic, pre-contacted bookings; expired callbacks stay quiet, valid reminder opens/dismisses, replay/disabled callbacks do not reopen, exact appointment rows and customer context remain unchanged. No uploads or actual messages/OS notification-permission grants. An initial WebKit run caught the independent missed-message archiver updating an uncontacted overdue fixture; explicitly pre-contacted fixtures isolate this test without suppressing that product behaviour or weakening row equality.
- Full build/unit/social and initial ten-script browser gate passed. The fixture-adjusted ten-script gate also passed, including Chromium/WebKit reminder checks. [Hosted Test run 39990747277](https://github.com/redbrixdesign-stack/riaz10/actions/runs/39990747277) passed unit/build/server/dependency scans and Browser acceptance for exact source `af16a5bdb9baf66a0e9e5f202b79f72183c54e34`. Both dependency scans remain clear. These are automated browser checks, not a physical-iPhone acceptance pass.
- Production `dpl_3gkBQ2svYGMZ1HwCfwnDWrFyC1Sd`, 5s build, staged at `beelo1-nbajd4oq4-beelomvp.vercel.app`. Four staged assets matched; public app explicitly remained at cache 149 until promotion. Exact-build promotion followed hosted success. Live shell/SW/notification source and minified bytes match; live Chromium/WebKit expired/valid/dismissed/replayed/disabled reminder and unchanged-record/context checks pass with no uploads or actual messages. Ten-minute deployment error/fatal query returned no records, not complete monitoring assurance.

Cache `advisoros-v6-150-reminder-expiry`; notification asset v11. Rollback C10 `a34a7d4`, `dpl_BTGmUaAs3bRqvZMEdc4x1rxRNPmQ` retains all prior security/data fixes but restores the stale callback weakness.

## Limits / next acceptance

This fix prevents *new* invalid callback delivery. It does not automatically dismiss a previously valid sheet left open across suspension, withdraw delivered OS notifications, or guarantee background execution on iOS. Do not infer fresh delivery time from the Simulator image alone. Physical-iPhone installed-PWA suspension, actual native notification delivery, Files backup restore, social attachments, maps and background GPS remain unverified. Main enforcement and held financial/pilot scope decisions are unchanged. Next: test the remaining reminder lifecycle on a physical device; review owned-sheet expiry separately without discarding other open forms.
