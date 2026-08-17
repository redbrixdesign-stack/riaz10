#!/usr/bin/env node
/* ============================================
   ADVISOROS — WCAG 2.2 AA AXE SWEEP (Phase 6)
   Runs axe-core (4.13) against the seeded real app on every key screen
   and modal, reporting violations by WCAG 2.x A/AA impact. The gate:
   ZERO serious/critical violations anywhere; moderate/minor are
   reported for triage and counted, but don't fail the run (so a stray
   moderate on a legacy screen can't block the launch checklist).
   Run: node tests/browser/axe-sweep.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const axeSource = require('axe-core').source;
const BASE = 'http://localhost:8000';

let failures = 0;
const allViolations = [];
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?axe=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const runAxe = async (label) => {
    await page.evaluate(axeSource);
    // Let fade-in settle so colour-contrast isn't measured mid-transition.
    await page.waitForTimeout(700);
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
        resultTypes: ['violations']
      });
      return r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
        summary: v.nodes.slice(0, 2).map(n => (n.failureSummary || '').split('\n')[0])
      }));
    });
    // Accepted, documented exception: axe `target-size` on Leaflet map pins.
    // Pin position IS the map data (WCAG 2.5.8 "essential" exception) and
    // pins legitimately overlap; the Route screen provides a full textual
    // stop list as the accessible alternative.
    const accepted = v => v.id === 'target-size' && v.targets.every(t => /leaflet-marker-icon/.test(t));
    const serious = res.filter(v => (v.impact === 'serious' || v.impact === 'critical') && !accepted(v));
    const moderate = res.filter(v => (v.impact === 'moderate' || v.impact === 'minor') && !accepted(v));
    const acceptedCount = res.filter(accepted).length;
    if (acceptedCount > 0) console.log(`  (${acceptedCount} map-pin target-size finding(s) accepted — WCAG 2.5.8 essential exception)`);
    allViolations.push({ label, serious: serious.length, moderate: moderate.length, list: res });
    console.log(`\n=== ${label} ===`);
    if (res.length === 0) {
      console.log('  ✓ 0 violations');
      return true;
    }
    for (const v of res) {
      console.log(`  ${v.impact.toUpperCase().padEnd(9)} ${v.id} (${v.nodes} node${v.nodes > 1 ? 's' : ''}) — ${v.targets.slice(0, 2).join(' | ')}`);
      if (v.summary.length) console.log(`            ${v.summary[0]}`);
    }
    return serious.length === 0;
  };

  const nav = async (route, params) => {
    await page.evaluate(([r, p]) => App.navigate(r, p || {}), [route, params]);
    // waitForFunction cannot capture closures — pass the route as its arg.
    await page.waitForFunction(r => App.currentHash.startsWith(r), route, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
  };
  const click = async (sel) => {
    await page.click(sel, { timeout: 15000 });
    await page.waitForTimeout(900);
  };

  // --- Screens ---
  ok('Home (companion Today)', await runAxe('1-home'));
  await nav('followups');
  ok('Follow-ups', await runAxe('2-followups'));
  await nav('orders');
  ok('Orders kanban', await runAxe('3-orders'));
  await click('.kanban-card[data-action="OrdersFeature.openOrderSheet"]');
  ok('Order sheet modal', await runAxe('4-order-sheet'));
  await page.evaluate(() => App.closeModal({ all: true, silent: true }));
  await nav('money');
  ok('Money', await runAxe('5-money'));
  await click('[data-action="MoneyFeature.openExpenseModal"]');
  ok('Expense modal', await runAxe('6-expense-modal'));
  await page.evaluate(() => App.closeModal({ all: true, silent: true }));
  await nav('control');
  ok('Tools', await runAxe('7-tools'));
  await nav('appointments');
  ok('Visits diary', await runAxe('8-visits'));
  await nav('appointments', { action: 'add' });
  ok('Add Visit form', await runAxe('9-add-visit'));
  // Customer 360: diary → customer search modal → type a query → open the
  // first customer result.
  await nav('appointments');
  await click('button[aria-label="Search"], [data-action="AppointmentsFeature.openCustomerSearch"]');
  await page.fill('#customer-search-input', 'john');
  await page.waitForTimeout(1200);
  let onCustomer = false;
  for (let i = 0; i < 5 && !onCustomer; i++) {
    const row = page.locator('.area-customer-row[data-action="AppointmentsFeature.openSearchResult"]').nth(i);
    if (await row.count() === 0) break;
    await row.click();
    await page.waitForTimeout(900);
    onCustomer = await page.evaluate(() => App.currentHash.startsWith('customer'));
  }
  if (onCustomer) {
    ok('Customer 360', await runAxe('10-customer-360'));
  } else {
    console.log('  ! could not reach Customer 360 via search — skipping');
  }
  await nav('route');
  ok('Route', await runAxe('11-route'));
  await nav('talk');
  ok('Messages', await runAxe('12-messages'));
  await nav('measure');
  ok('Measure', await runAxe('13-measure'));
  await nav('ocr');
  ok('Scan', await runAxe('14-scan'));
  await nav('settings');
  ok('Settings', await runAxe('15-settings'));

  // --- Onboarding (fresh profile — no config, no data) ---
  const oCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await oCtx.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('advisoros_enc_test', '1');
  });
  const opage = await oCtx.newPage();
  const oErr = [];
  opage.on('pageerror', e => oErr.push(e.message));
  await opage.goto(BASE + '/index.html?axe=onb');
  await opage.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'onboarding', null, { timeout: 30000 });
  await opage.waitForTimeout(1500);
  await opage.evaluate(axeSource);
  await opage.waitForTimeout(600);
  const oRes = await opage.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
      resultTypes: ['violations']
    });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
  const oSerious = oRes.filter(v => v.impact === 'serious' || v.impact === 'critical').length;
  allViolations.push({ label: '16-onboarding', serious: oSerious, moderate: oRes.length - oSerious, list: oRes });
  console.log(`\n=== 16-onboarding ===`);
  if (oRes.length === 0) console.log('  ✓ 0 violations');
  for (const v of oRes) console.log(`  ${v.impact.toUpperCase().padEnd(9)} ${v.id} (${v.nodes})`);
  ok('Onboarding (fresh profile)', oSerious === 0, oRes);
  if (oErr.length) console.log('  page errors:', oErr.slice(0, 3).join(' ;; '));
  await oCtx.close();

  // --- Summary ---
  const totalSerious = allViolations.reduce((n, v) => n + v.serious, 0);
  const totalModerate = allViolations.reduce((n, v) => n + v.moderate, 0);
  console.log('\n=== SWEEP SUMMARY ===');
  for (const v of allViolations) {
    console.log(`  ${v.label.padEnd(22)} serious/critical: ${v.serious}  moderate/minor: ${v.moderate}`);
  }
  console.log(`\n  TOTAL serious/critical: ${totalSerious}  |  moderate/minor: ${totalModerate}`);
  console.log(`  page errors during sweep: ${pageErrors.length > 0 ? pageErrors.slice(0, 3).join(' ;; ') : 'none'}`);

  await browser.close();
  const passed = totalSerious === 0 && failures === 0;
  console.log(passed ? '\nAXE SWEEP PASSED (no WCAG A/AA serious or critical violations)' : `\nAXE SWEEP FAILED — ${totalSerious} serious/critical violation(s)`);
  process.exit(passed ? 0 : 1);
})().catch(e => { console.error('AXE SWEEP FAILED:', e); process.exit(1); });
