# Phase 6 contracts — retention and optional integrations

Phase 6 extends the local customer record. It does not infer consent, message delivery, customer satisfaction, or remote-system success.

## Retention and preferences

- `retentionRecords` schedules satisfaction checks, review requests, referrals, warranty/service dates, and repeat-work opportunities. Each record is explicitly completed or cancelled; a due date is not an outcome.
- Satisfaction scores, when recorded, are integers from 1–5.
- `contactPreferences` is an append-only consent history by channel. The current preference is the latest effective event. Opening WhatsApp or email does not create consent.

## Communication lifecycle

- `communications` remains the authored/handoff record.
- `communicationEvents` records explicit lifecycle evidence such as handoff, advisor-confirmed send, provider delivery, reply, failure, or cancellation.
- Delivery and reply states require advisor confirmation or trusted provider provenance; they are never inferred from opening another app.

## Optional integrations

- `integrationLinks` retains local/remote identity and provider provenance.
- `integrationConflicts` keeps both snapshots until an explicit keep-local, accept-remote, or merged decision.
- `integrationOutbox` is the offline-safe boundary. Idempotent operations move through pending, processing, retry/failed, and completed states without deleting local records when disconnected.

## Storage

Schema 8 contains 38 backed-up tables. Phase 6 adds `retentionRecords`, `contactPreferences`, `communicationEvents`, `integrationLinks`, `integrationConflicts`, and `integrationOutbox`. Sensitive notes, snapshots, payloads, and errors are encrypted at rest and exported readably for cross-install restore. Older backups remain valid because missing additive tables restore as empty.
