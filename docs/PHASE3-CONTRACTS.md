# Phase 3 job execution contracts

Status: implemented release contract. `Architect.md` remains the system-level
architecture authority.

## Jobs and visits

- Jobs are additive operational records linked to an order and customer. One
  order may own multiple intentional jobs.
- Repeating the same creation or scheduling operation is idempotent; a fresh
  operation identifier deliberately creates another job or visit.
- Canonical job states are `materials_ordered`, `materials_received`,
  `fitting_scheduled`, `on_site`, `blocked`, `return_visit_required`,
  `completed`, and `signed_off`.
- Appointments retain their existing identity and gain an optional `jobId`.
  Multiple visits may link to one job; no join table is required.
- Job scheduling reuses the diary's arrival windows, working-day rules,
  conflicts, travel warnings, messaging, and customer hydration. URLs contain
  only identifiers, never customer personal data.

## Checklists, issues, completion, and sign-off

- Active templates select required and optional checklist items by visit/job
  type. Responses persist offline and may link to a particular appointment.
- Issues are explicit records. Resolution requires confirmation; a return-visit
  flag does not silently fabricate an appointment.
- Job completion requires explicit confirmation. Any required unchecked item
  or unresolved issue blocks ordinary completion and requires a non-empty,
  stored override reason.
- Customer sign-off is a separate confirmed action after completion. It records
  the stated customer name and method; it does not create a cryptographic or
  handwritten signature artifact.
- Completion and sign-off never alter order stage, payments, deposit, balance,
  invoice state, or customer totals.

## Storage, backup, and privacy

- Database name remains `advisoros_v6`; schema 5 additively introduces `jobs`,
  `checklistTemplates`, `checklistItems`, `checklistResponses`, and `jobIssues`.
- Appointments gain nullable indexed `jobId`; photos may optionally link to a
  job and appointment. Existing rows remain valid with those fields absent.
- Backup format remains 1 and now carries twenty tables. Earlier supported
  backups restore Phase 3 tables as empty.
- Job notes/sign-off/override data, checklist response values/notes, and issue
  content are encrypted at rest, exported inside the existing readable backup
  boundary, and re-encrypted on restore.
- Customer deletion removes the linked job graph. Import validates job states,
  dates, links, checklist relationships, issue state, and photo relationships
  before replacement.

## Release evidence

The phase gate requires real Dexie and mini-Dexie migration, multiple-job and
retry semantics, atomic scheduling rollback, checklist blockers, confirmed
issue resolution, completion override, separate sign-off/payment behavior,
encryption, backup/restore, legacy compatibility, field-workflow browser,
accessibility, timezone, offline, and iPhone viewport tests.
