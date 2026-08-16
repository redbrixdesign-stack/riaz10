#!/usr/bin/env node
/* ============================================
   ADVISOROS — NEXT-CARD DATE LOGIC VERIFICATION
   Scenarios: next visit today (time only), tomorrow, +6 days (next
   week), nothing in the 14-day window (empty state), and the dated
   label fitting at 320px.
   Run: node tests/browser/verify-next-date.js   (needs :8000 + Playwright)
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
  await page.goto(BASE + '/index.html?nd=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Wipe + seed one scenario (real DB API, page globals), remount Home,
  // return the visit's ISO date so the expected label can be recomputed.
  const runScenario = async (label, seedFn) => {
    const dateIso = await page.evaluate(seedFn);
    await page.waitForSelector('.comp-home-section-label', { timeout: 15000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim());
      const nextHeader = document.querySelector('.comp-home-next-visit-time');
      return {
        labels,
        nextText: nextHeader ? nextHeader.textContent.trim() : null,
        hasCard: !!document.querySelector('.comp-home-next-visit'),
        todayEmpty: labels.includes('TODAY')
      };
    });
    console.log(`\n=== ${label} ===\n` + JSON.stringify({ ...r, dateIso }));
    return { ...r, dateIso };
  };

  // Expected label — mirrors the renderer via the app's own Utils
  const expected = (dateIso) => page.evaluate((d) => {
    const date = new Date(d);
    return Utils.isSameDay(date, Utils.getToday())
      ? Utils.formatTimeUK(date)
      : `${Utils.formatDateUK(date, 'weekday-short')} ${Utils.formatDateUK(date, 'short')}, ${Utils.formatTimeUK(date)}`;
  }, dateIso);

  // S1 — next visit TODAY → time only
  const s1 = await runScenario('S1: next visit today', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Test', lastName: 'One' });
    const d = new Date(Date.now() + 60 * 60000).toISOString();
    await DB.addAppointment({ customerId: c.id, clientName: 'Test One', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    App.navigate('today');
    return d;
  });
  const e1 = await expected(s1.dateIso);
  ok('S1: today → time only', s1.nextText === e1 && /^\d{2}:\d{2}$/.test(s1.nextText), { got: s1.nextText, expected: e1 });

  // S2 — next visit TOMORROW → "Thu 20 Aug, 11:15"
  const s2 = await runScenario('S2: next visit tomorrow', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Test', lastName: 'Two' });
    const d = new Date(Utils.getTomorrow().getTime() + (11 * 3600 + 15 * 60) * 1000).toISOString();
    await DB.addAppointment({ customerId: c.id, clientName: 'Test Two', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    App.navigate('today');
    return d;
  });
  const e2 = await expected(s2.dateIso);
  ok('S2: tomorrow → weekday + date + time', s2.nextText === e2 && /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/.test(s2.nextText), { got: s2.nextText, expected: e2 });

  // S3 — next visit +6 days (next week) → correct weekday + date
  const s3 = await runScenario('S3: next visit six days out', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Test', lastName: 'Three' });
    const d = new Date(Utils.addDays(Utils.getToday(), 6).getTime() + 10 * 3600000).toISOString();
    await DB.addAppointment({ customerId: c.id, clientName: 'Test Three', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    App.navigate('today');
    return d;
  });
  const e3 = await expected(s3.dateIso);
  ok('S3: +6 days → correct weekday + date', s3.nextText === e3 && /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/.test(s3.nextText), { got: s3.nextText, expected: e3 });

  // S4 — nothing in the 14-day window → no card, empty state intact
  const s4 = await runScenario('S4: only a +20-day visit (outside window)', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Test', lastName: 'Four' });
    await DB.addAppointment({ customerId: c.id, clientName: 'Test Four', type: 'consultation', date: new Date(Utils.addDays(Utils.getToday(), 20).getTime() + 10 * 3600000).toISOString(), latLng: [53.4, -2.2] });
    App.navigate('today');
    return null;
  });
  ok('S4: no NEXT card when the window is empty', !s4.hasCard && !s4.labels.includes('NEXT'), s4.labels);
  ok('S4: TODAY empty state still renders', s4.todayEmpty, s4.labels);

  // S5 — dated label fits at 320px without wrapping/overflow
  await page.setViewportSize({ width: 320, height: 568 });
  await runScenario('S5: dated label at 320px', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Test', lastName: 'Five' });
    const d = new Date(Utils.getTomorrow().getTime() + (11 * 3600 + 15 * 60) * 1000).toISOString();
    await DB.addAppointment({ customerId: c.id, clientName: 'A Very Long Customer Name To Stress The Card Layout', type: 'consultation', date: d, latLng: [53.4, -2.2], address: '27 Extremely Long Street Name That Would Normally Ellipsize, Manchester M33 4AA' });
    App.navigate('today');
    return null;
  });
  const s5m = await page.evaluate(() => {
    const header = document.querySelector('.comp-home-section-header');
    const time = document.querySelector('.comp-home-next-visit-time');
    return {
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headerOverflow: header ? header.scrollWidth - header.clientWidth : null,
      timeWraps: time ? time.getBoundingClientRect().height > 22 : null,
      text: time ? time.textContent.trim() : null
    };
  });
  ok('S5: no horizontal overflow at 320px', s5m.docOverflow <= 0 && (s5m.headerOverflow === null || s5m.headerOverflow <= 0), s5m);
  ok('S5: dated label stays on one line', s5m.timeWraps === false, s5m);

  await browser.close();
  console.log(failures === 0 ? '\nALL NEXT-DATE CHECKS PASSED' : `\n${failures} NEXT-DATE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('VERIFY FAILED:', e); process.exit(1); });
