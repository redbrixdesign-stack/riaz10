# Beelo v6-116 integration record

Date: 15 September 2026

## Baseline

- Production v6-115 was recovered at commit `299b523`.
- All 64 live PWA assets matched that commit byte-for-byte.
- Tag: `beelo-live-v6-115-2026-09-15`.

## Integration boundary

The divergent `codex/ios-map-app-handoff` history was merged into a new branch
created from the verified production baseline. The live and source branches were
not rewritten.

Conflict resolution preserved:

- the v6-115 communication, route/trip and release-hardening work;
- first-name customer greetings and appointment-type-aware drafts;
- combined introduction/day-before confirmation for first visits;
- customer context on the featured visit;
- voice notes, unified note capture and OpenAI transcription;
- legal/operator disclosures and landing-page privacy/cookie changes;
- scan/OCR, measurements, quotes, jobs, invoices, suppliers, retention and
  operational money workflows;
- eager precaching of secondary workflows for fresh-install offline access;
- the five-item primary navigation. The social-post assistant remains a
  contextual fitting workflow, not a sixth navigation tab.

No production deployment was performed.

## Verification

- production build: pass; 49 generated files current;
- service-worker/index asset versions: pass;
- complete automated suite: pass;
- complete adviser journey suite A–F: pass;
- appointment-type communication templates: pass;
- Home/upcoming regression suite: pass;
- offline/reconnect and fresh offline launch: pass;
- accessibility sweep: pass under the existing documented map-pin essential
  exception;
- feature/browser navigation and data rendering: pass;
- no browser JavaScript exceptions or resource 404s in the feature suite.

The former four journey failures were test-fixture mismatches, not product
changes: first-visit reminders now correctly expect the combined
`intro_day_before` stage, and the backup fixture now stores its device secret
through the same private setting path used by the application.

## Release status

The candidate is integrated and regression-clean, but not deployed. Before any
production release it should receive a physical-iPhone rehearsal and a final
review of the staged diff against v6-115.
