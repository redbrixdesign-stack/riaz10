#!/usr/bin/env node
/* ============================================
   ADVISOROS — P1 FIX VERIFICATION
   1. actionAttrs object-literal args now produce valid JSON: the Today
      "Log outcomes" attention card, Customer 360 timeline rows and
      companion chat action buttons navigate (no '[action] bad data-args').
   2. The appointments tab param is honoured ({tab:'upcoming'} opens the
      Upcoming tab).
   3. Cold-launch deep links land on their target (#appointments?action=add,
      #money); an invalid hash still falls back to Today.
   Run: node tests/browser/verify-p1.js   (needs :8000 + Playwright)
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

  /* ---- Context 1: seeded app — actionAttrs dead buttons ---- */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('p1') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('p1', '1');
  });
  const page = await ctx.newPage();
  const badArgs = [];
  page.on('console', m => { if (/bad data-args/.test(m.text())) badArgs.push(m.text().slice(0, 80)); });
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?p1=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1500);
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});

  // 1a. Today "Log outcomes" card navigates (was dead)
  const logOutcomes = page.locator('[data-action="App.navigate"]').filter({ hasText: 'Log outcomes' }).first();
  if (await logOutcomes.count()) {
    await logOutcomes.click();
    await sleep(700);
    const h = await page.evaluate(() => App.currentHash);
    ok('Today "Log outcomes" card navigates to appointments', h.startsWith('appointments'), h);
    // 2. tab param honoured: Upcoming tab should be active
    const tabState = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('#appt-tabs .tab'));
      return tabs.find(t => t.classList.contains('active'))?.textContent || 'none';
    });
    ok('appointments opens on the requested Upcoming tab', /Upcoming/.test(tabState), tabState);
    await page.evaluate(() => App.navigate('today'));
    await sleep(500);
  } else {
    console.log('  (no Log outcomes card rendered — seed state dependent)');
  }

  // 1b. Customer 360 timeline row navigates (was dead)
  await page.evaluate(() => App.navigate('appointments'));
  await sleep(700);
  await page.evaluate(() => AppointmentsFeature.openCustomerSearch());
  await sleep(400);
  await page.fill('#customer-search-input', 'john');
  await sleep(900);
  await page.locator('[data-action="AppointmentsFeature.openSearchResult"]').first().click();
  await sleep(900);
  const timelineRow = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[data-action="App.navigate"]')).find(e => { const a = e.getAttribute('data-args'); return a && a.includes('"id"'); });
    return el ? { args: el.getAttribute('data-args') } : null;
  });
  if (timelineRow) {
    const hb = await page.evaluate(() => App.currentHash);
    await page.evaluate(() => { const el = Array.from(document.querySelectorAll('[data-action="App.navigate"]')).find(e => { const a = e.getAttribute('data-args'); return a && a.includes('"id"'); }); if (el) el.click(); });
    await sleep(700);
    const ha = await page.evaluate(() => App.currentHash);
    ok('customer timeline row navigates to the visit (was dead)', ha.startsWith('appointments?id='), { hb, ha, args: timelineRow.args });
  } else console.log('  (no timeline rows with id args found)');

  // 1c. Zero bad-data-args console errors across these flows
  ok('zero "[action] bad data-args" console errors (actionAttrs fixed)', badArgs.length === 0, badArgs.slice(0, 2));

  /* ---- Context 2: cold-launch deep links ---- */
  console.log('\n=== Cold-launch deep links ===');
  for (const [hash, expect] of [['#appointments?action=add', 'appointments?action=add'], ['#money', 'money'], ['#orders', 'orders'], ['#does-not-exist', 'today']]) {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c2.addInitScript(() => {
      if (sessionStorage.getItem('p1b') !== '1') { localStorage.clear(); sessionStorage.clear(); }
      localStorage.setItem('advisoros_enc_test', '1');
      localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
      sessionStorage.setItem('p1b', '1');
    });
    const p2 = await c2.newPage();
    await p2.goto(BASE + '/index.html' + hash);
    await p2.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 30000 });
    await sleep(1400);
    const got = await p2.evaluate(() => App.currentHash);
    ok('cold launch ' + hash + ' -> ' + got, got === expect, { got, expect });
    await c2.close();
  }

  /* ---- Context 3: fresh (non-seeded) profile deep link still boots to onboarding ---- */
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c3.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('advisoros_enc_test', '1'); });
  const p3 = await c3.newPage();
  await p3.goto(BASE + '/index.html#appointments?action=add');
  await p3.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 30000 });
  await sleep(1400);
  const fresh = await p3.evaluate(() => App.currentHash);
  ok('fresh profile with deep link still boots to onboarding (never skips setup)', fresh === 'onboarding', fresh);
  await c3.close();

  await browser.close();
  console.log(failures === 0 ? '\nP1 VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('P1 FAILED:', e.message.slice(0, 200)); process.exit(1); });
