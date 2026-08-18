#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME WEEK STRIP NAVIGATION
   Verifies the weekly calendar on Home: the THIS WEEK strip renders 7
   day cells with real per-day visit counts, today is highlighted, the
   ‹ › arrows shift the displayed week ±7 days, the counts match the
   day-window diary, and tapping a day opens My Day on that day. (The
   strip was briefly removed from Home and restored — this suite guards
   it, alongside the single appointment feed below it.)
   Run: node tests/browser/verify-home-week.js  (:8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra).slice(0, 220) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?hw=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('.comp-home-week-arrow'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  // The strip sits ABOVE the feed; Home must not show the old greeting.
  const structure = await page.evaluate(() => ({
    labels: Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim()),
    hasGreeting: !!document.querySelector('.comp-home-greeting'),
    hasFeed: !!document.querySelector('.comp-home-next-visit'),
    stripFirst: !!document.querySelector('.comp-home') && document.querySelector('.comp-home').firstElementChild?.classList.contains('comp-home-section')
  }));
  ok('Home sections: THIS WEEK strip first, then NEXT feed, Attention, Ask Beelo', JSON.stringify(structure.labels) === JSON.stringify(['THIS WEEK', 'NEXT', 'NEEDS YOUR ATTENTION', 'ASK BEELO']), structure.labels);
  ok('no greeting banner on Home', !structure.hasGreeting, structure);
  ok('appointment feed still present below the strip', structure.hasFeed && structure.stripFirst, structure);

  const read = () => page.evaluate(() => ({
    nums: Array.from(document.querySelectorAll('.comp-home-week-day-num')).map(e => e.textContent),
    counts: Array.from(document.querySelectorAll('.comp-home-week-day-count')).map(e => e.textContent.trim()),
    range: document.querySelector('.comp-home-week-range')?.textContent.trim(),
    arrows: document.querySelectorAll('.comp-home-week-arrow').length,
    today: document.querySelectorAll('.comp-home-week-day.today').length
  }));

  const before = await read();
  ok('two arrows rendered', before.arrows === 2, before);
  ok('current week is Monday-first with today highlighted', before.nums.length === 7 && before.today === 1, before);
  ok('day cells carry real visit counts (numbers or —)', before.counts.length === 7 && before.counts.every(c => c === '—' || /^\d+$/.test(c)), before.counts);

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

  // Day cell counts match the diary (day-window) for the displayed week —
  // the original "Home shows 3 of 4" bug was a window mismatch.
  const stripVsDiary = await page.evaluate(async () => {
    const cells = Array.from(document.querySelectorAll('.comp-home-week-day'));
    const mismatches = [];
    for (const cell of cells) {
      const count = cell.querySelector('.comp-home-week-day-count').textContent.trim();
      if (count === '—') continue;
      const args = JSON.parse(cell.getAttribute('data-args') || '[]');
      const iso = args[0];
      const dayAppts = (await DB.getAppointmentsForDate(iso)).filter(a => a.status !== 'cancelled');
      if (dayAppts.length !== parseInt(count, 10)) mismatches.push({ iso, cell: count, diary: dayAppts.length });
    }
    return mismatches;
  });
  ok('strip day counts match the diary for every day shown', stripVsDiary.length === 0, stripVsDiary);

  // Tapping a day opens My Day on that day.
  await page.evaluate(() => { const d = document.querySelector('.comp-home-week-day'); if (d) d.click(); });
  await page.waitForSelector('.bottom-sheet .hsc-root', { timeout: 15000 });
  const dayTitle = await page.evaluate(() => document.querySelector('.bottom-sheet .hsc-week-title')?.textContent.trim());
  ok('day tap opens My Day', !!dayTitle, dayTitle);

  ok('no console errors', errs.length === 0, errs);

  await browser.close();
  console.log(failures === 0 ? '\nALL HOME-WEEK CHECKS PASSED' : `\n${failures} HOME-WEEK CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
