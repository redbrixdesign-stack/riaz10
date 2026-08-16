#!/usr/bin/env node
/* ============================================
   ADVISOROS — MOCK APPOINTMENT STATES CHECK
   Verifies how the 6 seeded appointments render on the
   Home screen (calendar strip counts + feed per day),
   and captures a screenshot for each representative
   state: 3-visit day (Fri), single-visit days (Mon, Sun),
   empty day (Wed).
   Run: node tests/browser/check-mock-days.js   (:8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8000/reference/home-screen-mock-v2.html';
const OUT = path.join(__dirname, '..', '..', 'screenshots', 'review');

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  await page.goto(BASE);
  await page.waitForTimeout(700);

  // Calendar strip: expected counts per day of the seed week.
  const strip = await page.evaluate(() => {
    const days = Array.from(document.querySelectorAll('.day-item'));
    return days.map(d => ({
      label: d.querySelector('.day-label').textContent,
      num: d.querySelector('.day-number').textContent,
      count: d.querySelector('.day-count').textContent,
      weekend: d.classList.contains('weekend')
    }));
  });
  console.log('\n=== Calendar strip (seed week) ===');
  console.log(JSON.stringify(strip));
  const counts = Object.fromEntries(strip.map(d => [d.label, d.count]));
  ok('Mon=1, Tue=1, Fri=3, Sun=1 visits on the strip', counts.Mon === '1' && counts.Tue === '1' && counts.Fri === '3' && counts.Sun === '1', counts);
  ok('empty days show —', counts.Wed === '—' && counts.Thu === '—' && counts.Sat === '—', counts);
  ok('weekend tint on Sat + Sun only', strip.filter(d => d.weekend).length === 2 && strip[5].label === 'Sat' && strip[6].label === 'Sun');

  const selectDay = async num => {
    await page.evaluate(n => {
      const btn = Array.from(document.querySelectorAll('.day-item')).find(b => b.querySelector('.day-number').textContent === String(n));
      btn.click();
    }, num);
    await page.waitForTimeout(400);
  };
  const feedState = () => page.evaluate(() => ({
    title: document.getElementById('daySummaryTitle').textContent,
    count: document.getElementById('daySummaryCount').textContent,
    rows: document.querySelectorAll('.appointment, .appointment--featured').length,
    featured: !!document.querySelector('.appointment--featured'),
    names: Array.from(document.querySelectorAll('.appointment__customer, .appt-name')).map(e => e.textContent),
    times: Array.from(document.querySelectorAll('.appointment__time, .appt-top-row')).map(e => e.textContent.trim()),
    empty: !!document.querySelector('.feed-empty')
  }));

  console.log('\n=== Feed per day ===');
  // Friday 16 — 3 visits incl. featured NEXT
  await selectDay(16);
  const fri = await feedState();
  console.log('Fri 16:', JSON.stringify(fri));
  ok('Fri 16: Today, 3 visits', fri.title === 'Today' && fri.count === '3 visits', fri);
  ok('Fri 16: featured Mrs Smith card present', fri.featured && fri.names.includes('@Mrs Smith'), fri);
  ok('Fri 16: 3 rows total (featured + 2)', fri.rows === 3, fri);
  await page.screenshot({ path: path.join(OUT, 'mock-fri-3-visits.png') });

  // Monday 12 — single visit
  await selectDay(12);
  const mon = await feedState();
  console.log('Mon 12:', JSON.stringify(mon));
  ok('Mon 12: Completed, 1 visit row', mon.title === 'Completed' && mon.rows === 1 && mon.names.includes('@Mr James.'), mon);
  await page.screenshot({ path: path.join(OUT, 'mock-mon-1-visit.png') });

  // Wednesday 14 — empty day
  await selectDay(14);
  const wed = await feedState();
  console.log('Wed 14:', JSON.stringify(wed));
  ok('Wed 14: No visits + empty state with Add visit', wed.title === 'No visits' && wed.empty, wed);
  await page.screenshot({ path: path.join(OUT, 'mock-wed-empty.png') });

  // Sunday 18 — weekend single visit
  await selectDay(18);
  const sun = await feedState();
  console.log('Sun 18:', JSON.stringify(sun));
  ok('Sun 18: Scheduled, 1 visit row on a weekend day', sun.title === 'Scheduled' && sun.rows === 1 && sun.names.includes('@Mr Patel.'), sun);
  await page.screenshot({ path: path.join(OUT, 'mock-sun-weekend-visit.png') });

  // Back to Friday 16 (featured) — default state
  await selectDay(16);
  await page.screenshot({ path: path.join(OUT, 'mock-default-fri.png') });

  ok('zero page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures === 0 ? '\nALL APPOINTMENT-STATE CHECKS PASSED' : `\n${failures} APPOINTMENT-STATE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CHECK FAILED:', e); process.exit(1); });
