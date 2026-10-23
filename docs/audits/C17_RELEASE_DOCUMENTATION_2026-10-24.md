# C17 — release documentation and product truth

## Confirmed inconsistency

Release documentation baseline `07847a2` still headed the root README
“AdvisorOS”, claimed “no backend” / “no build step”, omitted transcription and
described unapproved commercial tiers. `README-AI.md` incorrectly described
production shared-store protection as optional with in-memory fallback, despite
the C07 fail-closed implementation. This is a documentation/operational risk,
not evidence that C07 runtime protection failed.

The original divergent `b833/riaz10` workspace already has an earlier Beelo README
and August inventory. They were inspected and left intact; this correction
targets the isolated production release branch, not a blind documentation merge.

## Changes (BA-001/BA-002/BA-003, preserved under BA-004)

- README uses Beelo, describes the actual static frontend/optional API/build
  boundaries and the current prototype, separates limitations/future concepts
  and removes unapproved pricing/team-platform positioning.
- Proxy guide reflects canonical Claude handler, Claude-only alternative server,
  separate same-origin transcription endpoint, shared-store failure behaviour,
  exact implemented pilot limits and shared-credential/privacy limitations.
  No credentials/settings were read or changed; no provider request was made.
- `docs/BEELO_RELEASE_FEATURE_INVENTORY.md` maps source and bounded test evidence
  to implementation, undecided pilot status, repository claims and unbuilt
  concepts. The live marketing site was not re-audited or published. No screen
  label or filename is treated as approval.
- Documentation contracts now check name, build/backend boundaries, non-filing/
  human-control wording, production usage-store guidance and local Markdown links.

## Verification and release boundary

Focused documentation checks, full `npm test` and `npm run build` pass; all 51
generated assets are already up to date and service-worker tokens match. No runtime, schema,
configuration, dependency, financial rule, UI, service worker or app asset version
was changed. Original dirty runtime and dependency files remain untouched.

This is a documentation-only correction: **no new deployment is necessary or
performed**. Live remains C16 runtime `9995984`, acceptance `ba30894`, deployment
`dpl_BQjYsvQX8syQ9TcHj7Gkiyn8NV98`, cache 154. Its existing 13-journey hosted/live
evidence is historical baseline evidence, not a fresh device run for this change.

## Held decisions / next actions

- Choose the narrow pilot surface before treating quotes/jobs/invoices/payments,
  suppliers, profitability or retention as a public promise. No feature removed.
- Clarify attended access/no-show £20 eligibility and two-stage survey commission
  basis before changing calculations/history.
- C14 intermittent offline route risk stays open with diagnostics. Physical
  iPhone/native handoff/background/VoiceOver acceptance, branch reconciliation/
  required-check enforcement and independent assurance remain separate work.
- Next engineering step: continue bounded native/physical acceptance or diagnose
  the next captured failure; do not deploy speculative offline workarounds.
