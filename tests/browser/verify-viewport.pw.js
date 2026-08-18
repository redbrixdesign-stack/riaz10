#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME VIEWPORT VERIFICATION (Playwright)
   Playwright port of home-viewport.check.js (CDP version is fragile in
   sandboxed environments). Asserts the Home feed at 320/375/390/430px:
   no horizontal overflow, correct section order, real visit times,
   textual state labels, and the calm empty state with no data.
   Run: node tests/browser/verify-viewport.pw.js   (:8000 + Playwright)
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));

  for (const w of [320, 375, 390, 430]) {
    await page.setViewportSize({ width: w, height: w === 320 ? 568 : 844 });
    await page.goto(BASE + '/index.html?vp=' + w);
    await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => {
      const now = new Date();
      const nowT = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const labels = Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim());
      const times = Array.from(document.querySelectorAll('.comp-home-visit-time')).map(e => e.textContent.trim());
      return {
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        labels,
        hasGreeting: !!document.querySelector('.comp-home-greeting'),
        hasWeekStrip: !!document.querySelector('.comp-home-week-strip'),
        visitCount: document.querySelectorAll('.comp-home-visit').length,
        nextName: document.querySelector('.comp-home-next-visit-name')?.textContent.trim() || null,
        anyTimeIsNow: times.some(t => t === nowT)
      };
    });
    const p = w + 'px';
    ok(`${p}: no horizontal overflow`, r.overflowX <= 0, r.overflowX);
    ok(`${p}: no greeting banner; weekly calendar strip present`, !r.hasGreeting && r.hasWeekStrip, r.labels);
    // THIS WEEK strip → NEXT (featured card + upcoming rows) → ATTENTION → ASK BEELO
    const iWeek = r.labels.indexOf('THIS WEEK');
    const iNext = r.labels.indexOf('NEXT');
    const iAtt = r.labels.indexOf('NEEDS YOUR ATTENTION');
    const iAsk = r.labels.indexOf('ASK BEELO');
    ok(`${p}: labelled sections present in order (strip first)`, iWeek === 0 && iNext > iWeek && iAtt > iNext && iAsk > iAtt, r.labels);
    ok(`${p}: featured card + visit rows show real times (not the live clock)`, !!r.nextName && r.visitCount > 0 && !r.anyTimeIsNow, { times: r.times });
  }

  // Empty state: fresh profile, no records.
  const ctxE = await browser.newContext({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 2, isMobile: true });
  const e = await ctxE.newPage();
  await e.goto(BASE + '/tests/browser/seed-review.html');
  await e.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await e.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  // Boot the app first so the real DB global exists, then wipe everything.
  await e.goto(BASE + '/index.html?wipe=1');
  await e.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await e.evaluate(async () => {
    await DB.deleteAllData();
    localStorage.clear();
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    localStorage.setItem('advisoros_enc_test', '1');
  });
  await e.goto(BASE + '/index.html?empty=1');
  await e.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await e.waitForTimeout(2200);
  const empty = await e.evaluate(() => ({
    labels: Array.from(document.querySelectorAll('.comp-home-section-label')).map(x => x.textContent.trim()),
    hasNoVisits: /No (upcoming )?visits (booked|today)/.test(document.getElementById('comp-scroll').textContent),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  ok('empty state: calm "No visits" + Ask Beelo chips', empty.labels.includes('NEXT') && empty.labels.includes('ASK BEELO') && empty.hasNoVisits, empty.labels);
  ok('empty state: no horizontal overflow', empty.overflowX <= 0, empty.overflowX);

  await browser.close();
  console.log(failures === 0 ? '\nALL VIEWPORT CHECKS PASSED' : `\n${failures} VIEWPORT CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('VIEWPORT PW FAILED:', e); process.exit(1); });
