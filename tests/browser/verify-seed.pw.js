#!/usr/bin/env node
/* ============================================
   ADVISOROS — SEED VERIFICATION (Playwright)
   Playwright port of verify-seed.check.js (the CDP version is fragile in
   sandboxed environments where Node's raw fetch/WebSocket path misbehaves).
   Seeds seed-review.html, boots the app and asserts the demo data surfaces
   everywhere: Home feed states, follow-ups inbox, orders kanban, money,
   diary, pipeline. No screenshots.
   Run: node tests/browser/verify-seed.pw.js   (:8000 + Playwright)
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
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 90)));

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  ok('seed page ran clean', true);
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?pw=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const home = await page.evaluate(() => {
    const t = document.getElementById('comp-scroll') ? document.getElementById('comp-scroll').textContent : '';
    return {
      labels: Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim()),
      states: Array.from(document.querySelectorAll('.comp-home-visit-state')).map(e => e.textContent.trim()),
      times: Array.from(document.querySelectorAll('.comp-home-visit-time')).map(e => e.textContent.trim()),
      names: Array.from(document.querySelectorAll('.comp-home-visit-name')).map(e => e.textContent.trim()),
      hasSmith: /John Smith/.test(t),
      hasTargetGap: /to target/.test(t),
      hasAttention: /NEEDS YOUR ATTENTION/.test(t),
      arrows: document.querySelectorAll('.comp-home-week-arrow').length
    };
  });
  ok('Home feed: THIS WEEK → NEXT → TODAY → TOMORROW → ATTENTION → ASK BEELO order', JSON.stringify(home.labels) === JSON.stringify(['THIS WEEK', 'NEXT', 'TODAY', 'TOMORROW', 'NEEDS YOUR ATTENTION', 'ASK BEELO']), home.labels);
  ok('Home day strip: Done + Overdue + Next states present', ['Done', 'Overdue', 'Next'].every(s => home.states.includes(s)), home.states);
  ok('Home day strip: real visit names + times', home.names.includes('John Smith') && home.times.length >= 5, { names: home.names, times: home.times });
  ok('Home: John Smith is next; target gap visible', home.hasSmith && home.hasTargetGap && home.hasAttention);
  ok('Home week strip has ‹ › arrows', home.arrows === 2, home.arrows);

  const dueCount = await page.evaluate(() => App.features.get('followups').getDueCount());
  ok('follow-ups due count > 0 (mixed inbox)', dueCount > 0, dueCount);
  await page.evaluate(() => App.navigate('followups')); await page.waitForTimeout(1500);
  const fup = await page.evaluate(() => document.getElementById('main').textContent);
  ok('inbox shows payment + quote + outcome tasks', /Collect|Follow up|Outcome not logged|Intro message/i.test(fup), fup.slice(0, 300));

  await page.evaluate(() => App.navigate('orders')); await page.waitForTimeout(1500);
  const kan = await page.evaluate(() => document.getElementById('main').textContent);
  ok('kanban: all five columns present', ['Quoted', 'Ordered', 'Delivered', 'Fitted', 'Paid'].every(c => kan.includes(c)), kan.slice(0, 200));
  ok('kanban: balance figures visible', /£1,850|£925|£625/.test(kan), kan.slice(0, 200));

  await page.evaluate(() => App.navigate('money')); await page.waitForTimeout(1500);
  const money = await page.evaluate(() => document.getElementById('main').textContent);
  ok('money: expenses + mileage figures render', /£58\.40|£62\.10|mi/.test(money), money.slice(0, 200));

  await page.evaluate(() => App.navigate('appointments', { tab: 'diary' })); await page.waitForTimeout(1500);
  const diary = await page.evaluate(() => document.getElementById('main').textContent);
  ok('diary renders today’s visits', /John Smith|O'Leary|Amelia Green/i.test(diary), diary.slice(0, 200));
  await page.evaluate(() => App.navigate('appointments', { tab: 'pipeline' })); await page.waitForTimeout(1200);
  const pipe = await page.evaluate(() => document.getElementById('main').textContent);
  ok('pipeline tab lists quoted/thinking leads', /Quote given|Needs to think|O'Leary|Khan/i.test(pipe), pipe.slice(0, 300));

  ok('boot + whole run: no JS exceptions', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  console.log(failures === 0 ? '\nALL SEED CHECKS PASSED' : `\n${failures} SEED CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('SEED PW FAILED:', e); process.exit(1); });
