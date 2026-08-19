# Phase 4 financial ledger and document contracts

Status: implemented release contract. `Architect.md` remains the system-level
architecture authority.

## Payment ledger

- Cleared ledger entries are the payment authority. `order.depositPaid` and
  `order.balanceDue` remain derived compatibility projections for existing
  screens and are reconciled after every ledger mutation.
- Payments are append-only. Corrections create linked refund or reversal
  entries; the original entry is never edited or deleted.
- Only an eligible cleared incoming payment may be refunded or reversed.
  Cumulative linked corrections cannot exceed its original amount.
- Every mutation carries an operation identifier. Repeating an operation is a
  no-op returning the existing result.
- Legacy `depositPaid` becomes one `opening_migrated` ledger entry only when
  `total - depositPaid == balanceDue`; otherwise no financial fact is invented.
- The ledger records money; it does not process card, bank, or cash payments.

## Invoices and credit notes

- Invoice totals are derived from validated items. Drafts may be edited;
  issued invoices and their customer snapshot are immutable.
- An order may have multiple invoices. Optional order/job links must belong to
  the same customer.
- Invoice balance is derived from its total, cleared linked payment net, and
  issued credit notes.
- Credit notes are numbered, immutable, and capped at the invoice's remaining
  creditable value. They reduce amount due but do not represent a cash refund.
- Invoice and credit numbering uses guarded sequences that continue without
  collision after import.

## Formal documents and communications

- Invoice, receipt, refund/reversal confirmation, and credit-note previews are
  generated locally and remain available offline.
- `documents` stores generated metadata—type, source links, filename, hash, and
  date—not binary document content.
- Print/save-PDF and WhatsApp are separate explicit advisor actions. Handoff is
  logged as attempted only; delivery is never inferred.

## Storage, backup, and privacy

- Database name remains `advisoros_v6`; schema 6 additively introduces
  `payments`, `invoices`, `invoiceItems`, `creditNotes`, and `documents`.
- Backup format remains 1 and now carries twenty-five tables. Earlier supported
  backups restore Phase 4 tables empty; compatible order balance fields remain.
- Payment references/notes, invoice customer snapshots/notes/terms, invoice
  item descriptions, and credit content are encrypted at rest, exported inside
  the existing readable backup boundary, and re-encrypted on restore.
- Import validates statuses, directions, amounts, dates, links, numbering,
  derived totals, correction relationships, and credit bounds before writes.

## Release evidence

The phase gate requires both storage engines to prove legacy migration,
idempotency, reconciliation, partial/full correction limits, invoice totals and
immutability, credit bounds, encryption, numbering, backup/restore, cascade,
legacy consumer compatibility, offline documents, de-duplicated Follow-ups,
browser journeys, accessibility, timezone, and narrow-iPhone behavior.
