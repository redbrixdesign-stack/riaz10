#!/usr/bin/env node
/* ============================================
   ADVISOROS — ONBOARDING VERIFICATION
   Fresh profile → first-run lands on the onboarding screen; the weekly
   target preset buttons carry delegated data-action attributes (the 4.6
   migration — the shipped min.js once shipped a stale pre-migration
   bundle because a nested ${...} template artifact broke the build), and
   clicking a preset updates the target without CSP violations or errors.
   Run: node tests/browser/verify-onboarding.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Fresh profile: no config, no encryption salt — but test-mode passphrase
  // so boot isn't parked on the passphrase modal (matches the other suites).
  await ctx.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('advisoros_enc_test', '1');
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE + '/index.html?onb=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'onboarding', null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const presets = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[data-action="OnboardingFeature.setTargetPreset"]'));
    const input = document.getElementById('ob-target');
    return {
      count: btns.length,
      labels: btns.map(b => b.textContent),
      args: btns.map(b => b.getAttribute('data-args')),
      onclicks: btns.filter(b => b.hasAttribute('onclick')).length,
      targetValue: input ? input.value : null
    };
  });
  ok('fresh profile lands on the onboarding screen', true);
  ok('4 weekly-target preset buttons render', presets.count === 4, presets.count);
  ok('presets carry valid data-args JSON (no nested-template artifact)', presets.args.length === 4 && presets.args.every(a => { try { JSON.parse(a); return true; } catch { return false; } }), presets.args);
  ok('zero inline onclick handlers on presets (CSP-safe)', presets.onclicks === 0, presets.onclicks);
  ok('preset labels are £400 £600 £800 £1000', JSON.stringify(presets.labels) === JSON.stringify(['£400', '£600', '£800', '£1000']), presets.labels);

  await page.click('[data-action="OnboardingFeature.setTargetPreset"][data-args*="600"]');
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => document.getElementById('ob-target').value);
  ok('clicking £600 preset sets the weekly target input', applied === '600', applied);

  // 'frame-ancestors is ignored when delivered via a <meta> element' is a
  // browser notice about meta-CSP limits, not a violation — exclude it.
  const cspBlocked = consoleErrors.filter(e => /Refused to/.test(e));
  ok('no CSP violations during onboarding', cspBlocked.length === 0, cspBlocked);
  const runtime = consoleErrors.filter(e => !/frame-ancestors.*ignored.*meta/.test(e) && !/React DevTools/.test(e));
  ok('no page/runtime errors at all', runtime.length === 0, runtime);

  await browser.close();
  console.log(failures === 0 ? '\nONBOARDING VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ONB FAILED:', e); process.exit(1); });
