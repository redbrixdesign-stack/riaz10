# Beelo physical-iPhone pilot acceptance

Status: **not yet executed on a physical iPhone**. Simulator observations and automated desktop Chromium/WebKit checks are separate evidence, not substitutes. Use the exact production source/deployment in `BEELO_RELEASE_BASELINE.md` and record device, iOS version, Safari versus installed-PWA mode, date and result for each case.

## Safety and preparation

- Use unmistakable `SYNTHETIC` names, invented customer notes and no real contact numbers. Do not send messages, publish posts or upload customer media. Use generated/sample media and cancel native sharing after inspection.
- Preserve working records. Do not clear website data, reset passphrases, rotate keys, uninstall the working app or import over an existing working database. Backup/restore trials require a genuinely disposable, empty test installation/profile. Verify an exported file actually exists before relying on it.
- Keep the passphrase private; enter it on the device, never in an audit/chat. Do not alter company systems or appointment commitments. Test while stationary, not driving. Offline checks should not interrupt a real call, navigation or other work.
- Cloud transcription/AI is optional and online-only; a successful mocked response is not live-provider acceptance. Any deliberate live call must contain synthetic content, stay within configured pilot limits and be recorded separately. No additional paid service or OS permission should be enabled merely to make a test pass.

## Required cases

| ID | Physical-device case and pass evidence | Current status |
| --- | --- | --- |
| P01 | Open the live app in Safari and installed home-screen mode. Genuine unlock, navigation and accessible controls work. Applying an app update does not silently replace an in-progress form. Record version/mode and screenshots. | Not run |
| P02 | Create four synthetic bookings: sales/consultation, referred survey/Measure for a new customer, fitting linked to its intended order, and service call. Confirm visible type/date/slot/access context after save, revisit and relaunch; no fabricated company-system sync. | Not run |
| P03 | Save seven distinct window rows with width/drop and product descriptions, typed notes, a voice recording and a sample photo. Reopen the profile and verify exact values, minimum measurements and audio playback. Count rows before/after. | Not run |
| P04 | Plan tomorrow, move visits, inspect route/slot warnings and reopen the plan. Reordering must not silently change customer-agreed appointment times. No live-traffic optimisation or mileage-saving claim follows from this test. | Not run |
| P05 | Open/close communication drafts and move between visits. Closing a draft never means sent; future/due/missed states remain coherent. Explicit synthetic contact outcomes clear only the fulfilled obligations. No external message is sent. | Not run |
| P06 | While active, test a due reminder once, dismiss it and confirm it does not reappear on replay. Suspend/resume across the reminder's time window and after a booking is cancelled/moved/completed. Record whether an already-open reminder becomes stale separately from newly emitted alerts. Actual OS delivery requires already-authorised notifications and a separate result. | Not run |
| P07 | With the test records saved, disconnect connectivity manually. Read context, save/edit locally, close/reopen the installed app, unlock and verify values/audio. Return online and verify no duplicates/lost records or autonomous communications. Distinguish airplane mode from server outage and desktop offline emulation. | Not run |
| P08 | Export a protected backup with >1 MB of sample audio/media. Verify the actual Files download. In a separate empty disposable installation, reject a wrong password without mutation, then restore correctly and verify exact records/media under a different device key. Never restore over working records. | Not run |
| P09 | Choose sample photo and video, grant the in-app approvals for that exact item, generate/review a draft only if configured, inspect native share attachment then cancel. Replacing media or withdrawing approval must block sharing. Do not count byte/MIME mocks as native decoding or receiving-app attachment evidence. | Not run |
| P10 | With a tester-chosen public landmark as synthetic destination, inspect installed Maps/Google Maps/Waze handoff and cancel navigation. Test UK number normalisation without contacting anybody. Background GPS/mileage, arrival detection and battery behaviour need a separately controlled field trial; app-open foreground readings do not certify them. | Not run |
| P11 | Complete/cancel test visits and review historical records, intended-order linkage and earnings. Supported completed service outcomes use the configured £20 fee; attended access/no-show eligibility and two-stage survey commission basis are held decisions, not assumed expected results. No real financial history is modified. | Not run |
| P12 | Check large text, VoiceOver focus/labels, keyboard/date/time controls, portrait/landscape and smallest supported width. Save controls and errors must remain reachable beneath the keyboard/offline banner; test validation, empty states and storage-denial/error recovery without deleting data. | Not run |

## Evidence and acceptance rule

Record per case: result (`pass`, `fail`, `blocked`, `not run`), exact steps, expected/observed state, synthetic record IDs, screenshot/file evidence, connectivity and app mode. A screenshot alone does not prove persistence, delivery or restore success. Reopen/reload/read back where appropriate.

Data loss, a false successful save/backup, payment allocated to another order, unapproved media sharing, autonomous sending or unlock bypass blocks wider pilot acceptance. Stop at the broken boundary, preserve evidence and address it as one scoped fix before continuing. Less severe friction still needs a reproducible issue and priority; do not label the whole product certified or compliant after these checks.

Next development boundary after C11: review expiry of the *currently owned* reminder sheet on resume/booking changes without closing or losing another form. Keep this separate from timer callback validation, operating-system notification withdrawal and iOS background-execution claims. Repository required-check enforcement, financial-rule clarification and pilot scope remain owner decisions.
