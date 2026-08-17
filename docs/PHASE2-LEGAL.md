# Beelo — Phase 2 (Legal & Consent) Execution Log

Phase 2 of the release-fix plan (P0 legal). This was the outstanding
gate for a **public** launch — technical readiness was already
launch-grade (Phase 6); the legal layer was not. Every item verified in
browser and committed.

## 2.1 — Privacy Policy + Terms of Service pages ✅

New `js/core/legal.js` — in-app, offline-capable pages (a normal unlisted
feature, `#legal?page=privacy` / `#legal?page=terms`, so they're
hash-addressable and get the same focus/back behaviour as every screen):

- **Privacy Policy** covers, in plain language that matches what the app
  actually does: local-only storage (no account, no servers), AES-256-GCM
  + PBKDF2 encryption at rest, what never leaves the device, what *may*
  leave it (OSM map tiles; optional Claude AI via the user-configured
  proxy; CDN code libraries), cookies & tracking (none), UK GDPR rights
  (access/export, rectification, erasure, portability, withdrawing AI
  consent), retention, children, and changes.
- **Terms of Service** covers the service, the user's role as data
  controller, acceptable use, backups & data loss, no warranty, liability,
  IP, changes, and governing law (England and Wales).
- Both pages use semantic `h1` + `h2` headings (they were `div`s first —
  fixed during the axe pass) and a "last updated" date.

## 2.2 — One-time consent notice ✅

New `ConsentPrompt` (same module): a single bottom sheet shown once, ~5s
after the user settles on Today. It states plainly that data stays on the
device, that the one optional feature that sends anything out (Claude AI)
is off by default, and links the privacy policy. Acknowledging records
`advisoros_consent` `{v:1, at}` locally; it never re-shows; the wipe flow
clears it so a fresh start re-asks. Suppressed in test mode; never during
onboarding; waits for the user to be free (bounded retries).

**Interaction fix**: the consent notice and the install prompt (Phase 5)
competed for the same modal — `InstallPrompt` now waits until consent is
acknowledged before offering the add-to-home-screen hint.

## 2.3 — Company details / footer ✅ (placeholders — action required)

The operator block (name, address, email, company number) renders on both
legal pages, the Privacy & Legal settings section, and uses a single
`Legal.COMPANY` constant. **The values are marked placeholders (`—`) with a
`TODO(launch)` comment — no invented details.** The real operator details
must be filled before any public marketing launch; the launch gate in
`docs/PHASE6-VALIDATION.md` is updated accordingly.

## 2.4 — Data-deletion flow (erasure) ✅

The existing wipe flow (`confirmWipe` → `confirmWipeFinal` →
`DB.deleteAllData`) was already two-tap confirmed and cleared every
`advisoros_*` storage key. Phase 2 added:
- GDPR framing in the confirmation sheet ("this is your right to erasure —
  the data lives only on this device… no copy exists anywhere else unless
  you exported a backup yourself") plus a direct privacy-policy link.
- A new **Privacy & Legal** settings section that bundles: the two legal
  documents, consent status (with re-acknowledge), "Export my data
  (backup)", "Delete all my data", and the operator details.
- Verified that a wipe removes the consent record, so the fresh start
  re-asks for consent.

## Accessibility gate

`tests/browser/axe-sweep.js` extended to **18 screens** (added
`17-privacy`, `18-terms`) — still **0 serious/critical violations**.
Bonus finding from the wider run: the message-preview textarea
(`#talk-message-preview`, opened by the scheduler's catch-up drafts) had
no accessible name — added `aria-label="Message preview (editable)"`.

## Regression

- `npm test` — 0 failures.
- All browser suites green: verify-legal (new, 20 checks), verify-fixes,
  verify-onboarding, verify-lazyocr, verify-install-prompt (updated: the
  consent notice is pre-acknowledged in its contexts, since it tests the
  install hint, and it closes the boot-time scheduler preview modal that
  time-of-day catch-up drafts open), verify-map-csp, verify-offline-banner,
  verify-title, verify-nexttap, verify-myyday, verify-home-week,
  verify-safearea, verify-viewport.pw, verify-next-date,
  verify-next-date-boundary, features.e2e, companion-nav.e2e, ocr-save.e2e.
- Review screenshots regenerated.

## Versioning

New `js/core/legal.min.js?v=1`; `CACHE_NAME` → `advisoros-v6-44`;
`app.min.js?v=14`, `settings.min.js?v=13`, `talk.min.js?v=18` — tokens
matched (build verifies).

## Action required before public launch

1. **Operator details** — fill `Legal.COMPANY` (name, address, email,
   company number) in `js/core/legal.js`; the settings section and both
   legal pages render them automatically.
2. (Optional) Have the policy/terms reviewed by a UK data-protection
   practitioner — the copy is honest and accurate as written, but it is
   not legal advice.
