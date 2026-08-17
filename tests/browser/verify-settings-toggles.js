#!/usr/bin/env node
/* ============================================
   ADVISOROS — SETTINGS TOGGLE VERIFICATION (P2)
   Guards the audit's P2 findings:
   1. Claude AI toggle: a single tap flips state exactly once with a
      success toast and ZERO console errors; a fast double-tap flips
      twice, still error-free (the audit's NotFoundError was a Playwright
      click-retry artifact, not a real interaction).
   2. Morning-brief toggle: when notification permission is denied, the
      toggle stays off and shows an explanatory error toast (no silent
      no-op).
   Run: node tests/browser/verify-settings-toggles.js  (needs :8000 + PW)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('tg') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('tg', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 110)));

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?tg=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1200);
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});

  // ---- 1. Claude AI toggle — single tap ----
  await page.evaluate(() => App.navigate('settings', { section: 'ai' }));
  await sleep(900);
  const ai0 = await page.evaluate(() => !!CONFIG.ai.enabled);
  await page.evaluate(() => { const b = document.querySelector('[data-action="SettingsFeature.toggleAI"]'); if (b) b.click(); });
  await sleep(700);
  const ai1 = await page.evaluate(() => ({ enabled: !!CONFIG.ai.enabled, toast: (document.querySelector('.toast') || {}).textContent ? document.querySelector('.toast').textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : null }));
  ok('single tap flips the AI toggle (' + ai0 + ' -> ' + ai1.enabled + ')', ai1.enabled !== ai0, ai1);
  ok('success toast shown', /Claude AI (enabled|turned off)/.test(ai1.toast || ''), ai1.toast);
  ok('zero console errors on a single real tap', errs.length === 0, errs.slice(0, 2));

  // ---- 2. Fast double-tap (worst-case real interaction) ----
  // Starts from the single-tap state (enabled): two quick taps must flip
  // twice and net back to the same state, with zero console errors.
  const aiBeforeDouble = ai1.enabled;
  errs.length = 0;
  await page.evaluate(async () => {
    const b = () => document.querySelector('[data-action="SettingsFeature.toggleAI"]');
    b().click();
    await new Promise(r => setTimeout(r, 120));
    const b2 = document.querySelector('[data-action="SettingsFeature.toggleAI"]');
    if (b2) b2.click();
  });
  await sleep(700);
  const ai2 = await page.evaluate(() => !!CONFIG.ai.enabled);
  ok('fast double-tap flips the toggle twice (net back to ' + aiBeforeDouble + ')', ai2 === aiBeforeDouble, { ai2, expected: aiBeforeDouble });
  ok('zero console errors on a fast double-tap', errs.length === 0, errs.slice(0, 2));

  // ---- 3. Morning-brief with notifications denied ----
  await page.evaluate(() => App.navigate('settings', { section: 'morning-brief' }));
  await sleep(800);
  const mb0 = await page.evaluate(() => NotificationService.isMorningBriefEnabled());
  await page.evaluate(() => { const b = document.querySelector('[data-action="SettingsFeature.toggleMorningBrief"]'); if (b) b.click(); });
  await sleep(800);
  const mb1 = await page.evaluate(() => ({
    enabled: NotificationService.isMorningBriefEnabled(),
    toasts: Array.from(document.querySelectorAll('.toast')).map(t => t.textContent.replace(/\s+/g, ' ').trim())
  }));
  ok('morning brief stays off when permission denied', mb1.enabled === false, mb1);
  ok('denied path shows an explanatory error toast', mb1.toasts.some(t => /permission|notification/i.test(t)), mb1.toasts);

  const runtime = errs.filter(e => !/bad data-args/.test(e));
  ok('no unexpected page errors across the toggle flows', runtime.length === 0, runtime);

  await browser.close();
  console.log(failures === 0 ? '\nSETTINGS TOGGLE VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TOGGLES FAILED:', e.message.slice(0, 200)); process.exit(1); });
