#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME FEED STRUCTURE + MY DAY
   The Home screen is ONE appointment feed: the NEXT visit as the top
   featured card, remaining visits as compact rows below, then Attention
   and Ask Beelo chips. No greeting banner, no weekly strip ("there is no
   need for today/tomorrow sessions on Home Screen. just appointment
   feed" — the phone report that shaped this layout).

   Verifies:
   1. Section order is NEXT → NEEDS YOUR ATTENTION → ASK BEELO.
   2. The greeting banner and week strip are GONE from Home.
   3. The featured card is the top of the feed with customer detail
      (area line renders; phone line renders when the visit has one).
   4. My Day still opens (now via the app's My Day action, since the
      strip's day cells were removed with the strip).
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
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('.comp-home-next-visit'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const read = () => page.evaluate(() => {
    const custLine = document.querySelector('.comp-home-next-visit-customer');
    return {
      labels: Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim()),
      hasGreeting: !!document.querySelector('.comp-home-greeting'),
      hasWeekStrip: !!document.querySelector('.comp-home-week-strip'),
      hasWeekDay: !!document.querySelector('.comp-home-week-day'),
      hasFeatured: !!document.querySelector('.comp-home-next-visit'),
      featuredName: document.querySelector('.comp-home-next-visit-name')?.textContent.trim(),
      featuredTime: document.querySelector('.comp-home-next-visit-time')?.textContent.trim(),
      hasCustomerLine: !!custLine,
      hasPhoneInLine: !!(custLine && Array.from(custLine.querySelectorAll('.material-symbols-rounded')).some(i => i.textContent.trim() === 'call')),
      rowCount: document.querySelectorAll('.comp-home-visit').length,
      featuredHasPhone: !!document.querySelector('.comp-home-cta--ghost')
    };
  });

  const s = await read();
  console.log('\n  Home sections:', JSON.stringify(s.labels));
  ok('Home is ONE feed: NEXT first, then Attention, then Ask Beelo', JSON.stringify(s.labels) === JSON.stringify(['NEXT', 'NEEDS YOUR ATTENTION', 'ASK BEELO']), s.labels);
  ok('no greeting banner on Home', !s.hasGreeting, s);
  ok('no weekly strip on Home (no day cells, no strip)', !s.hasWeekStrip && !s.hasWeekDay, s);
  ok('featured NEXT card is the top of the feed', s.hasFeatured, s);
  ok('featured card carries name + time', !!s.featuredName && !!s.featuredTime, s);
  ok('featured card shows the customer detail line (area + phone)', s.hasCustomerLine, s);
  // The phone part only renders when the visit actually has a number.
  ok('phone appears in the detail line exactly when the visit has one', s.hasPhoneInLine === s.featuredHasPhone, { hasPhoneInLine: s.hasPhoneInLine, featuredHasPhone: s.featuredHasPhone });
  ok('compact rows render below the featured card', s.rowCount >= 1, { rowCount: s.rowCount });

  // My Day still opens (the action, formerly the strip's day cells).
  await page.evaluate(() => CompanionFeature.openMyDay());
  await page.waitForSelector('.bottom-sheet .hsc-root', { timeout: 15000 });
  ok('My Day panel still opens from the app', true);

  ok('no console errors', errs.length === 0, errs);

  await browser.close();
  console.log(failures === 0 ? '\nALL HOME-WEEK CHECKS PASSED' : `\n${failures} HOME-WEEK CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
