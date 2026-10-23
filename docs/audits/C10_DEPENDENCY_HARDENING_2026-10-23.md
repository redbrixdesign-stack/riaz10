# C10 — Dependency and verification-tool hardening

## Scope and evidence

Isolated `codex/phone-contact-save` checkout only. The original workspace's dependency tree and dirty product files are untouched. The validated symlink to those dependencies was unlinked (target retained), then clean locked root/server packages installed separately. No feature/UI/data/commission/communication changes, provider/key changes, historical rewrites or forced dependency overrides.

Registry audits on 23 October 2026 initially reported 22 affected root entries (1 critical, 14 high, 5 moderate, 2 low), and 4 server entries (1 critical, 3 moderate). Root production-only scan was already clear. Counts include transitive impact, not 26 separately exploitable product defects. Compatible lock refresh clears the server: Express 4.22.3, proxy-addr 2.0.8, body-parser 1.20.9 and qs 6.16.1. See the [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h). The optional Express server is versioned/tested here, not the Vercel serverless runtime; no separate running Express host was deployed or certified.

The remaining root issues belonged to the outdated `@lhci/cli` development dependency tree (including [extract-zip](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)). npm's suggested forced downgrade to LHCI 0.1.0 was rejected. Replaced that wrapper with exact [Lighthouse 13.5.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.5.0), using the existing locked Playwright Chromium and chrome-launcher. Dexie 4.4.4, Playwright 1.62.1, Terser 5.49.2 and production @upstash/redis 1.38.2 are unchanged.

Fresh full root, root production-only and server audits now report **zero known advisories**. This is a point-in-time registry check, not independent security certification. CI now fails on newly reported low-or-higher advisories rather than silently accepting them.

## Performance checks retained

`npm run audit:performance` (also `npm run lhci:audit`) retains one mobile run and the exact floors: performance 0.70; accessibility, best practices and SEO 0.90; viewport 1.00. Lighthouse 13 explicitly declares `viewport-insight` as the replacement for `viewport`; the first run failed on the missing legacy ID before this deliberate mapping. Unit tests require every score and reject missing/null scores, runtime errors and below-floor categories. No lowered floors or silently ignored assertions.

JSON/HTML and assertion results remain in ignored `.lighthouseci/`, excluded from deployment. The weekly/manual workflow retains those as seven-day workflow artifacts; the obsolete public temporary-storage upload and `lhci:upload` command are retired, not replaced with an external publication. Historical audit documents retain their original command evidence. No private profiles, unlock or real customer records are used in this public launch-page audit.

Official checkout 7.0.1, setup-node 7.1.0 and upload-artifact 7.0.2 tags were resolved to exact SHAs and Node 24 runtimes checked against their action manifests. Test/performance runners are pinned to Ubuntu 24.04 instead of the migrating `ubuntu-latest`. Read-only repository permission, nonpersistent checkout credentials and bounded acceptance/evidence retention remain. Main required-check/merge-policy decisions are not changed.

## Verification / release

- Clean root/server installs and optional proxy tests pass. All current registry audits clear.
- Local maintained Lighthouse 13.5.0 public launch-page audit passed: performance 0.85, accessibility/best-practices/SEO 1.00, viewport 1.00. One lab run, not field performance or improvement attributable to this tool change.
- Full local release suite, hosted tests, exact staged production build and post-release checks: pending final evidence. No runtime bundle/cache bump is expected because this is dependency/tooling-only work. Retain C09 production build as rollback; do not revert the genuine-key boundary or earlier encryption readers.
