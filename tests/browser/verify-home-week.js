#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME WEEK STRIP NAVIGATION
   Verifies the ‹ › arrows on the Home strip move
   the displayed week ±7 days (range text updates,
   today highlight only in the current week) and
   that tapping a day still opens My Day.
   Run: node tests/browser/verify-home-week.js  (:8000 + Playwright)
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
  await page.goto(BASE + '/index.html?hw=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('.comp-home-week-arrow'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const read = () => page.evaluate(() => ({
    nums: Array.from(document.querySelectorAll('.comp-home-week-day-num')).map(e => e.textContent),
    range: document.querySelector('.comp-home-week-range')?.textContent.trim(),
    arrows: document.querySelectorAll('.comp-home-week-arrow').length,
    today: document.querySelectorAll('.comp-home-week-day.today').length
  }));

  const before = await read();
  ok('two arrows rendered', before.arrows === 2, before);
  ok('current week is Monday-first with today highlighted', before.nums.length === 7 && before.today === 1, before);

  await page.evaluate(() => CompanionFeature.shiftHomeWeek(1));
  await page.waitForTimeout(1500);
  const next = await read();
  ok('next arrow shifts the strip +7 days', Number(next.nums[0]) === Number(before.nums[0]) + 7, { before: before.nums, next: next.nums });
  ok('next week has no "today" highlight', next.today === 0, next.today);
  ok('range text reflects the displayed week', next.range !== before.range, { before: before.range, next: next.range });

  await page.evaluate(() => CompanionFeature.shiftHomeWeek(-1));
  await page.waitForTimeout(1500);
  const back = await read();
  ok('previous arrow returns to the current week', back.nums[0] === before.nums[0] && back.today === 1, back);

  await page.evaluate(() => { const d = document.querySelector('.comp-home-week-day'); if (d) d.click(); });
  await page.waitForSelector('.bottom-sheet .hsc-root', { timeout: 15000 });
  ok('day tap still opens My Day', true);

  await browser.close();
  console.log(failures === 0 ? '\nALL HOME-WEEK CHECKS PASSED' : `\n${failures} HOME-WEEK CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
