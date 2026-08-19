# Phase 2 structured quote contracts

Status: implemented release contract. `Architect.md` remains the system-level
architecture authority.

## Quote identity and lifecycle

- Structured quotes are additive. Historic appointment outcomes and values are
  never converted into invented line items.
- A quote has a stable quote number and explicit version. The supported states
  are `draft`, `issued`, `accepted`, `rejected`, `superseded`, and `expired`.
- Only drafts are editable. Issued versions are immutable; a change creates a
  new draft version and marks the previous version superseded.
- Acceptance and rejection are explicit advisor-recorded actions. Rejection
  requires a reason. Expiry never implies rejection or order cancellation.

## Totals and documents

- Subtotal, discount, tax, total, and cost are derived from validated line
  items using currency rounding at the domain boundary. UI previews are not
  authoritative.
- Customer-ready previews derive locally from the selected stored version and
  work offline. Draft previews are visibly watermarked.
- Print/save-PDF and WhatsApp are review-first actions. Nothing is sent
  automatically; WhatsApp handoff is recorded as attempted, not delivered.
- A separate documents table is not introduced in Phase 2 because the preview
  is deterministic from an immutable issued quote version.

## Quote-to-order conversion

- Only an accepted quote can convert to an order.
- `order.quoteId` is the persistent uniqueness boundary. Repeated activation,
  retries, or a different operation token return the existing order.
- Real Dexie performs conversion, order numbering, quote linkage, and customer
  aggregate refresh in one transaction. The mini-Dexie path serializes an
  in-session conversion and retains the documented best-effort fallback limit.
- The legacy appointment-to-order path remains available for advisors who do
  not create structured quotes.

## Storage and backup

- Database name remains `advisoros_v6`; schema 4 additively introduces
  `quotes`, `quoteItems`, and the indexed nullable `order.quoteId` field.
- Backup format remains 1 and now carries fifteen tables. Earlier supported
  backups may omit Phase 2 tables and restore them as empty.
- Quote notes, terms, acceptance/rejection text, and item descriptions are
  encrypted at rest, exported within the existing readable backup boundary,
  and re-encrypted on import.
- Import validates statuses, dates, totals, versions, identifiers, foreign
  keys, quote-number continuity, and order linkage before replacement.

## Release evidence

The phase gate requires real Dexie and mini-Dexie migration, rounding,
encryption, immutability, versioning, concurrent conversion, backup/restore,
legacy compatibility, offline document, Follow-ups de-duplication, browser,
accessibility, timezone, and narrow-iPhone viewport tests.
