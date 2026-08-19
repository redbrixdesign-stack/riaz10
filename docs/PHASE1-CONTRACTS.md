# Phase 1 lead and task contracts

Status: implemented release contract. `Architect.md` remains the system-level
architecture authority.

## Leads

- An enquiry may exist without a customer or appointment.
- Lead personal data is encrypted at rest and never placed in the URL; booking
  passes only a numeric `leadId` and hydrates the form locally.
- Conversion to a customer or visit is one domain operation. Repeating the
  operation returns the existing link rather than creating duplicates.
- Booking through a lead retains the existing visit checks, including arrival
  windows, working-day defaults, conflicts, and the appointment single-flight
  guard.
- A lost lead requires a reason and can be reopened. Customer deletion removes
  linked lead/task personal data according to the customer graph policy.

## Durable tasks and derived follow-ups

- Existing quote, payment, visit, message, post-fit, and service follow-ups
  remain derived from their authoritative records.
- Manual tasks persist locally and can be completed, reopened, or snoozed.
  Every transition accepts an operation identifier and records at most one
  task event for a retry or double activation.
- Snoozing a derived suggestion creates or reuses a durable overlay identified
  by its stable source key. The UI shows one item, not both records.
- Completing an overlay does not claim that an unpaid order, unsent message, or
  unresolved visit is resolved. If the authoritative source remains due, its
  derived suggestion may return.
- Home reports overdue durable work without replacing the appointment agenda
  or double-counting the same message follow-up.

## Storage, backup, and offline behaviour

- Database name remains `advisoros_v6`; schema 3 additively introduces
  `leads`, `tasks`, and `taskEvents`.
- Backup format remains 1 and now contains thirteen tables. Schema-2 and older
  supported backups may omit the new tables; they restore as empty.
- Lead identity/contact fields and task title/notes are encrypted at rest,
  exported readably inside the existing backup boundary, and re-encrypted on
  import.
- Invalid status, date, relationship, source key, or event data is rejected
  before replacement. Real Dexie uses transactions; the mini-Dexie fallback
  uses the documented snapshot-and-restore boundary.
- All lead and task CRUD works without a network connection. No operating-
  system notification or cloud-backup guarantee is implied.

## Release evidence

The phase gate requires:

1. real Dexie and mini-Dexie migration, encryption, idempotency, relationship,
   backup/restore, rollback, and customer-cascade tests;
2. lead capture and conversion tests proving exactly one customer/visit;
3. durable-task merge, snooze, completion, and Home-count tests;
4. the full project, timezone, build-token, offline, accessibility, viewport,
   and browser journey gates used by the current release process.
