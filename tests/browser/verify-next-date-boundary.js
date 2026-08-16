#!/usr/bin/env node
/* ============================================
   ADVISOROS — NEXT-CARD MONTH/YEAR BOUNDARY VERIFICATION
   The five earlier scenarios never crossed a month boundary. This test
   mocks the system clock (Playwright clock API) so "today" is Jan 30
   and the next visit lands on Feb 3 — the classic weekday off-by-one
   trap — plus month-last-day and year-boundary controls.
   Expected labels are computed INDEPENDENTLY here in Node via en-GB
   Intl with Europe/London (not from the app's own formatters), so a
   wrong weekday/date in the app can't hide behind a self-consistent
   expectation.
   Run: node tests/browser/verify-next-date-boundary.js   (:8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

// Independent UK calendar formatting (Node-side, en-GB/Europe/London)
const ukWeekday = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(new Date(iso));
const ukDayMonth = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(iso));
const ukTime = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  // Freeze "now" at Fri 30 Jan 2026, 10:00 UK (UTC+0 in winter)
  await page.clock.install({ time: new Date('2026-01-30T10:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true, advisorName: 'Riaz Ahmed' }));
  });
  await page.goto(BASE + '/index.html?boundary=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const runScenario = async (label, seedFn) => {
    const dateIso = await page.evaluate(seedFn);
    await page.waitForSelector('.comp-home-section-label', { timeout: 15000 });
    await page.waitForTimeout(1200);
    const nextText = await page.evaluate(() => document.querySelector('.comp-home-next-visit-time')?.textContent.trim() || null);
    console.log(`\n=== ${label} ===\n  rendered: "${nextText}" (visit ${dateIso})`);
    return { dateIso, nextText };
  };

  // T1 — month boundary: today Fri 30 Jan, next visit Tue 3 Feb
  const t1 = await runScenario('T1: Jan 30 → Feb 3 (month boundary)', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Boundary', lastName: 'One' });
    const d = new Date(Utils.addDays(Utils.getToday(), 4).getTime() + (11 * 3600 + 15 * 60) * 1000).toISOString(); // +4d = Feb 3
    await DB.addAppointment({ customerId: c.id, clientName: 'Boundary One', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    App.navigate('today');
    return d;
  });
  const e1 = `${ukWeekday(t1.dateIso)} ${ukDayMonth(t1.dateIso)}, ${ukTime(t1.dateIso)}`;
  ok('T1: cross-month label matches the real calendar', t1.nextText === e1, { got: t1.nextText, expected: e1 });
  ok('T1: weekday is a dated one (not bare time)', /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/.test(t1.nextText), t1.nextText);

  // T2 — last day of the month: Jan 30 → Jan 31
  const t2 = await runScenario('T2: Jan 30 → Jan 31 (month\'s last day)', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Boundary', lastName: 'Two' });
    const d = new Date(Utils.addDays(Utils.getToday(), 1).getTime() + 9 * 3600000).toISOString(); // +1d = Jan 31
    await DB.addAppointment({ customerId: c.id, clientName: 'Boundary Two', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    App.navigate('today');
    return d;
  });
  const e2 = `${ukWeekday(t2.dateIso)} ${ukDayMonth(t2.dateIso)}, ${ukTime(t2.dateIso)}`;
  ok('T2: last-day-of-month label matches', t2.nextText === e2, { got: t2.nextText, expected: e2 });

  // T3 — control: later today → bare time only
  const t3 = await runScenario('T3: control — later today → time only', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Boundary', lastName: 'Three' });
    const d = new Date(Date.now() + 60 * 60000).toISOString();
    await DB.addAppointment({ customerId: c.id, clientName: 'Boundary Three', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    App.navigate('today');
    return d;
  });
  const e3 = ukTime(t3.dateIso);
  ok('T3: today → bare time', t3.nextText === e3 && /^\d{2}:\d{2}$/.test(t3.nextText), { got: t3.nextText, expected: e3 });

  // T4 — year boundary: today Wed 30 Dec 2026 → Sat 2 Jan 2027
  await page.clock.install({ time: new Date('2026-12-30T10:00:00Z') });
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const t4 = await runScenario('T4: Dec 30 → Jan 2 (year boundary)', async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Boundary', lastName: 'Four' });
    const d = new Date(Utils.addDays(Utils.getToday(), 3).getTime() + 10 * 3600000).toISOString(); // +3d = Jan 2 2027
    await DB.addAppointment({ customerId: c.id, clientName: 'Boundary Four', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    App.navigate('today');
    return d;
  });
  const e4 = `${ukWeekday(t4.dateIso)} ${ukDayMonth(t4.dateIso)}, ${ukTime(t4.dateIso)}`;
  ok('T4: year-boundary label matches (Dec→Jan)', t4.nextText === e4, { got: t4.nextText, expected: e4 });

  await browser.close();
  console.log(failures === 0 ? '\nALL BOUNDARY CHECKS PASSED' : `\n${failures} BOUNDARY CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('VERIFY FAILED:', e); process.exit(1); });
