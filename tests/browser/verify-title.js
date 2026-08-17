#!/usr/bin/env node
/* ============================================
   ADVISOROS — HEADER TITLE CENTRING VERIFICATION
   Asserts every top-header page title is centred in
   the viewport (|offset| <= 2px) and never overlaps
   the back button or header actions.
   Run: node tests/browser/verify-title.js   (:8000 + Playwright)
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?tt=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const measure = () => page.evaluate(() => {
    const h = document.querySelector('.top-header h1');
    const header = document.querySelector('.top-header');
    if (!h || !header) return null;
    const r = h.getBoundingClientRect();
    const back = header.querySelector('[data-action*="App.navigate"]');
    const actions = header.querySelector('.header-actions');
    const backR = back ? back.getBoundingClientRect() : null;
    const actR = actions ? actions.getBoundingClientRect() : null;
    return {
      offset: Math.round(r.left + r.width / 2 - innerWidth / 2),
      overlapsBack: backR ? r.left < backR.right : false,
      overlapsActions: actR ? r.right > actR.left : false
    };
  });
  const check = (label, m) => ok(label, m && Math.abs(m.offset) <= 2 && !m.overlapsBack && !m.overlapsActions, m);
  const nav = async id => { await page.evaluate(i => App.navigate(i), id); await page.waitForTimeout(1100); };

  await page.evaluate(() => document.querySelector('.comp-home-next-visit-main').click());
  await page.waitForTimeout(1400);
  check('Visit detail (back + title)', await measure());

  for (const [id, label] of [['followups', 'Follow-ups'], ['orders', 'Orders'], ['money', 'Money'], ['control', 'Tools'], ['settings', 'Settings'], ['appointments', 'Visits']]) {
    await nav(id);
    check(`${label}`, await measure());
  }
  await nav('appointments');
  await page.evaluate(() => App.navigate('appointments', { action: 'add' }));
  await page.waitForTimeout(1100);
  check('New Visit (back + title)', await measure());

  await browser.close();
  console.log(failures === 0 ? '\nALL TITLE-CENTRING CHECKS PASSED' : `\n${failures} TITLE-CENTRING CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
