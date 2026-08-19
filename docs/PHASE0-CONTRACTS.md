# Phase 0 compatibility and release contracts

Status: Phase 0 safety contract. This document does not change current product
behaviour. `Architect.md` remains the system-level architecture contract.

## 1. Schema and backup versions

Database schema version and backup file-format version are independent:

- Increment the IndexedDB schema version when stores or indexes change.
- Increment the backup format only when the envelope or interpretation of its
  contents changes. Adding a backed-up table requires an explicit format
  compatibility decision; it must never be silently omitted on restore.
- Keep one authoritative current value for each version in application code.
  Tests and documentation must read or assert against that authority rather
  than inventing another current version.
- Schema upgrades are additive and idempotent. Do not rename a store, remove a
  field, reinterpret a value, or manufacture commercial facts in an upgrade.
- A new store must be added to schema declaration, backup export/import,
  validation, deletion/reset, relationship validation, sequence guards where
  relevant, real-Dexie tests, and the mini-Dexie path while that fallback is
  supported.
- Backups from a newer unsupported file format are rejected before writes.
  Unknown tables must not be reported as restored successfully: reject them or
  preserve them under a deliberately versioned forward-compatibility design.
- A backup format remains supported only while a committed fixture proves that
  it imports into the current schema without loss of supported records.

### Migration matrix

| Input | Current expected path | Required proof |
|---|---|---|
| Legacy `advisoros_v5` shim/IndexedDB installation | One-time copy into `advisoros_v6`, outcome normalization, order backfill, sequence guarding, then encryption | Legacy browser fixture; first and second boot are idempotent |
| `advisoros_v6` schema 1 | Dexie additive upgrade creates `photos` | Existing records unchanged; empty photo store available |
| `advisoros_v6` schema 2 | Additively upgrade to schema 3 by creating leads, tasks, and taskEvents; existing stores and records remain intact | Current-install fixture plus both-engine storage suite; repeated boot is stable |
| `advisoros_v6` schema 3 | Open without structural migration; idempotent PII repair/encryption may run | Phase 1 storage tests; repeated boot is stable |
| `advisoros_v6` schema 4 | Add structured quotes and quote items, add the nullable order quote link, and preserve every prior table | Both-engine Phase 2 storage tests; repeated boot is stable |
| Legacy backup envelope `version: 4.0` or `5.0` | Treat as backup format 1 with absent newer tables empty | Seven-table immutable fixture restores; sequence floors advance |
| Backup format 1 / database schema 2 | Treat absent Phase 1 tables as empty, validate supplied data, re-encrypt PII, and guard sequences | Pre-Phase-0 immutable fixture restores on real Dexie and mini-Dexie |
| Backup format 1 / database schema 3 | Validate and restore all thirteen tables, including lead/task links and task-event history | Both-engine Phase 1 roundtrip and rollback tests |
| Backup format 1 / database schema 4 | Validate and restore all fifteen tables, quote versions/items, order links, and quote sequence floors | Both-engine Phase 2 roundtrip, conversion, and compatibility tests |
| Future backup format | Reject before confirmation or writes | Database and device config remain unchanged |

Before every future schema change, extend this matrix and commit an immutable
pre-migration fixture where the existing compatibility fixtures do not already
prove the upgrade path.

## 2. Feature flags

Do not confuse these four mechanisms:

| Kind | Purpose | Persistence |
|---|---|---|
| Product preference | User-controlled behaviour such as AI or message drafts | Sanitized config/settings; secrets remain device-local |
| Release flag | Temporary default-off exposure of an additive roadmap capability | `settings` using `feature.<capability>.enabled`, unless a documented bootstrap constraint requires local storage |
| Migration marker | Idempotency marker for a completed data repair/copy | `settings` using `migration.<schema-or-operation>.complete` |
| Test/runtime flag | Test harness or ephemeral runtime state | `sessionStorage` or a clearly test-only local key; excluded from backup |

Rules:

1. Release flags use lower-case dotted names: `feature.<capability>.enabled`.
2. New roadmap capabilities default off until their phase gate passes. Missing,
   corrupt, or wrong-typed flags are treated as off.
3. A disabled flag must leave existing routes, navigation, records, backup
   output, derived totals, and boot behaviour unchanged.
4. Core local work must remain usable offline. A flag cannot require a network
   lookup to decide whether local data or a route is available.
5. Enabling a flag may expose additive behaviour; disabling it hides that
   behaviour but never deletes or rewrites its records.
6. Flags do not authorize external communication, payment, navigation,
   destructive import, deletion, or AI use. Those remain explicitly initiated
   by the user.
7. Remove a release flag only after one full accepted release with the feature
   enabled by default, migration/backup compatibility proven, and rollback to
   the prior release no longer promised. Record the removal in release notes.
8. Product preferences remain preferences and are not removed with rollout
   flags. Migration markers are never reused for a different migration.

## 3. Transaction and fallback boundaries

- Validate and prepare all inputs before opening a transaction.
- A mutation spanning authoritative records is one domain operation and one
  real-Dexie read/write transaction. Visit completion plus order reconciliation
  is one boundary; payment recording plus compatibility balance refresh is one
  boundary; customer aggregate refresh belongs to the mutation that invalidates
  it or must be safely recomputable.
- Domain operations are idempotent. Retry after interruption must not create a
  second order, payment, task, document, or sequence number.
- Asynchronous encryption is completed before entering a Dexie transaction so
  the transaction cannot become inactive while awaiting Web Crypto.
- The mini-Dexie fallback has no equivalent multi-store transaction. It uses a
  complete pre-write snapshot and best-effort restore. If rollback itself
  fails, report the affected stores honestly; never claim atomicity.
- Configuration outside IndexedDB is part of the restore boundary. Stage and
  validate it before replacement, and either roll it back with the data or
  report a specific recoverable partial-configuration failure.
- Direct `DB.db.*` writes are permitted only in storage infrastructure,
  migrations, diagnostics, and tests. Feature code uses domain methods that
  own validation, encryption, reconciliation, and transactions.

## 4. Rollback policy

Application rollback means deploying the last accepted production build. It
does not mean down-migrating or deleting data.

1. Before release, prove the previous build ignores additive stores and nullable
   fields safely, or state that code rollback is unsupported after migration.
2. Keep new capabilities behind default-off release flags until their data,
   backup, offline, and browser gates pass.
3. Never remove an IndexedDB store or lower its version during a phase rollback.
4. Preserve unknown additive fields on ordinary updates wherever the storage
   API performs whole-record replacement.
5. Before a destructive recovery, export an encrypted backup when possible.
6. A release record must identify the deploy/commit to restore, flag changes,
   schema/backup versions, cache identity, and user-data implications.

## 5. Baseline evidence procedure

Run from a clean checkout with dependencies installed. Record OS, Node version,
browser version, timezone, commit, and any approved exception.

```bash
npm test
npm run build
```

`npm run build` is a verification gate but changes generated minified files when
source and production bundles differ. Review its diff and verify that
`index.html` and `sw.js` asset tokens match. A release also requires a deliberate
service-worker cache identity change when the shipped precache changes.

Browser tests currently require two explicit lanes. Start the static server in
one terminal:

```bash
npm run serve
```

Then run, in another terminal:

```bash
npm run test:browser
node tests/browser/run-journeys.js
npm run test:browser:features
npm run test:browser:ocr
node tests/browser/axe-sweep.js
node tests/browser/verify-viewport.pw.js
node tests/browser/verify-offline-banner.js
npm run test:tz:browser
```

Constraints: the current runners assume port 8000; some use a macOS Google
Chrome path while Playwright scripts use installed Playwright Chromium. Until a
self-hosting aggregate runner replaces these assumptions, record server startup
and every command separately rather than calling `test:browser` the complete
browser suite.

For each release attach:

- unit and browser command exit codes;
- legacy first/second boot results;
- current-install and pre-Phase-0 backup fixture results;
- A-F journey results, including full backup/reset/restore;
- foreign-timezone results;
- offline cold-start and service-worker upgrade evidence;
- axe/keyboard/viewport evidence and physical-device exceptions;
- console/network error summary, performance snapshot, known failures, and the
  rollback procedure.

Immutable compatibility fixtures are catalogued in
`tests/fixtures/phase0-manifest.json`. Do not edit a released fixture in place;
add a new fixture and update the manifest.
