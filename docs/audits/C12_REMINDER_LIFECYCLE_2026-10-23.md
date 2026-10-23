# C12 — Retire only an owned stale reminder

Story: a reminder displayed in Beelo must stop showing stale context on expiry/resume or a changed booking, without closing, rebuilding or losing another open editor. This is local IndexedDB/DOM/timer work; no API, provider, credential, financial or communication-rule changes.

## Reproduction and design

The new real-browser test opens a valid synthetic reminder, advances the clock beyond the existing 15-minute grace and refreshes reminders. C11 leaves the old sheet visible (`Expired owned reminder must retire on resume refresh: 1 !== 0`). No appointment is automatically completed or marked sent.

Each reminder now has an internal per-session ownership token. A bounded minute/deadline timer and the visibility/booking-refresh hooks revalidate only that owner. Countdown text refreshes while owned. Expired, disabled, moved, cancelled, completed, outcome-recorded or deleted bookings retire their own reminder. A failed read retains a still-in-window reminder and retries; it cannot keep a known-expired one alive. A deadline backstop remains scheduled during a stalled read, without issuing duplicate reads. Late async results cannot retire a newer owner.

Retirement removes only matching reminder snapshots from the generic modal stack. It never closes the currently edited non-reminder sheet. A covering full-screen editor retains its DOM, focus trap and scroll lock while the reminder underneath is retired. Dismissed/navigated-away reminders are not recreated. New reminder modals are suppressed while any bottom-sheet/full-screen dialog is active: the generic stack snapshots HTML, not all unsaved live values, so stacking over an editor would risk losing those values. The existing permission-dependent OS notification request/delivery-marker behaviour remains; no new popup queue or promise of later modal delivery is introduced. Other forms' stacking implementation is unchanged.

## Evidence

- Source/minified tests: countdown/deadline timer; cancelled/completed/outcome/moved/invalid/deleted booking; editor suppression; selective snapshot removal and preserved snapshot identity; dismissal; read failure/retry; async editor/new-owner races; disabling.
- Chromium/WebKit real-IndexedDB tests: visibility-resume expiry, exact unchanged booking at expiry, input/textarea/checkbox values and DOM identity retained, hidden reminder removal while preserving an unrelated saved panel, no stale resurrection, full-screen focus/trap/scroll preservation, disabling and explicit test cancellation. Synthetic already-contacted bookings isolate the independent missed-message archiver; no real messages/uploads/provider calls or OS permission grants. Screenshots wait for transient toasts to clear.
- Full local eleven-script release gate, hosted checks, exact-build promotion and live checks: pending final evidence.

Runtime changes are confined to `js/services/notification.js` and its generated minified asset. Shell/SW token updated to notification v12, cache `advisoros-v6-151-reminder-lifecycle`; no generic App, CSS, database schema or user records changed. Original dirty workspace preserved. Rollback C11 source `af16a5b`, deployment `dpl_3gkBQ2svYGMZ1HwCfwnDWrFyC1Sd`, retains callback/security/data protections but restores the already-open sheet weakness.

## Limits and next actions

This is in-app lifecycle handling, not withdrawal of already-delivered operating-system notifications, guaranteed iOS background execution, actual VoiceOver/native-app/physical-iPhone certification or cross-tab coordination. Physical pilot acceptance remains explicitly not run; see `docs/BEELO_IPHONE_PILOT_ACCEPTANCE.md`. Main enforcement/reconciliation and held survey/service-payment/pilot-scope decisions remain owner decisions. Broader generic modal-stack form restoration is a separate risk; C12 avoids introducing reminder-driven stacking over an editor rather than redesigning every modal.
