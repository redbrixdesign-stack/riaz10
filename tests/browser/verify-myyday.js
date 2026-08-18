#!/usr/bin/env node
/* ============================================
   ADVISOROS — MY DAY CALENDAR NAVIGATION
   Verifies the weekly panel's arrows and day cells
   actually move the calendar (they previously
   re-rendered into a non-existent #hsc-today-root
   and silently did nothing), and that the Home week
   strip opens the panel on the tapped day.
   Run: node tests/browser/verify-myyday.js   (:8000 + Playwright)
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
  await page.goto(BASE + '/index.html?md=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const read = () => page.evaluate(() => ({
    title: document.querySelector('.bottom-sheet .hsc-week-title')?.textContent.trim().split('\n')[0],
    selected: document.querySelector('.bottom-sheet .hsc-week-day.active .hsc-week-day-num')?.textContent
  }));
  const click = sel => page.evaluate(s => { const b = document.querySelector(s); if (b) b.click(); }, sel);

  // My Day opens as a full-screen panel (Home's week strip is gone — the
  // single appointment feed is Home now, so My Day is reached via the
  // app's own action).
  await page.evaluate(() => CompanionFeature.openMyDay());
  await page.waitForSelector('.bottom-sheet .hsc-root', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const opened = await read();
  ok('My Day panel opens on the selected day', opened.selected && !!opened.title, opened);

  // Next-day arrow advances; previous-day returns
  await click('.bottom-sheet .hsc-week-nav[aria-label="Next day"]');
  await page.waitForTimeout(1200);
  const afterNext = await read();
  ok('Next-day arrow advances the calendar', afterNext.selected !== opened.selected, { opened, afterNext });
  await click('.bottom-sheet .hsc-week-nav[aria-label="Previous day"]');
  await page.waitForTimeout(1200);
  const afterPrev = await read();
  ok('Previous-day arrow steps back', afterPrev.selected === opened.selected, { opened, afterPrev });

  // Tapping a day cell selects it
  const dayNum = await page.evaluate(() => {
    const days = Array.from(document.querySelectorAll('.bottom-sheet .hsc-week-day'));
    const other = days.find(d => !d.classList.contains('active'));
    return other ? other.querySelector('.hsc-week-day-num').textContent : null;
  });
  await click('.bottom-sheet .hsc-week-day:not(.active) .hsc-week-day-num');
  await page.waitForTimeout(1200);
  const afterCell = await read();
  ok('Tapping a day cell in the panel selects it', afterCell.selected === dayNum, { dayNum, afterCell });

  // Move 8 days forward -> the week strip re-renders to the next week
  for (let i = 0; i < 8; i++) await click('.bottom-sheet .hsc-week-nav[aria-label="Next day"]');
  await page.waitForTimeout(1200);
  const weekEnd = await page.evaluate(() => Array.from(document.querySelectorAll('.bottom-sheet .hsc-week-day .hsc-week-day-num')).map(e => e.textContent));
  ok('Crossing into next week re-renders the strip', weekEnd.length === 7 && Number(weekEnd[0]) >= 17, weekEnd);

  await browser.close();
  console.log(failures === 0 ? '\nALL MY-DAY CHECKS PASSED' : `\n${failures} MY-DAY CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
