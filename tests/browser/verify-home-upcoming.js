#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME VISIT-COUNT VERIFICATION
   The phone report: "I have added four appointments for today, but it is
   showing only three on the Home Screen, but all four on visit. my day
   etc." Root cause: DB.getUpcomingAppointments() opened its window at the
   CURRENT INSTANT, so any visit earlier today dropped out of the Home
   feed's NEXT section the moment its time passed — while the diary, My
   Day, the week strip and the greeting (all day-window based) kept
   counting it.

   Fix: the upcoming window now starts at today's UK midnight.

   Phase 1 (query regression): with the seed + 4 extra today visits, the
     upcoming query must include every day-window visit, including the
     earlier-today one, and the weekly strip's today cell must match the
     diary.
   Phase 2 (feed visibility, the user's exact shape): a day with exactly
     four visits — three later, one an hour ago — must show ALL FOUR in
     the Home NEXT feed (featured card + rows), with the first FUTURE
     visit featured and the earlier-today one listed below it.
   Run: node tests/browser/verify-home-upcoming.js (needs :8000 + PW)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra).slice(0, 220) : ''));
  if (!cond) failures++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('hu') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('hu', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });

  // Boot once with the seed (so customers + base state exist).
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?hu=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1200);

  const addFourToday = () => page.evaluate(async () => {
    const custs = await DB.db.customers.toArray();
    const today = Utils.getToday();
    const at = (h, m) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const nowH = new Date().getHours();
    const names = [];
    for (let i = 0; i < 3; i++) {
      const name = 'Home Upcoming ' + i;
      await DB.addAppointment({ customerId: custs[i].id, clientName: name, type: 'consultation', date: at((nowH + 2 + i) % 24, 0), status: 'confirmed' });
      names.push(name);
    }
    names.push('Home Upcoming PAST');
    const pastHour = Math.max(0, nowH - 1);
    const pad = n => String(n).padStart(2, '0') + ':00';
    await DB.addAppointment({
      customerId: custs[3].id,
      clientName: 'Home Upcoming PAST',
      type: 'consultation',
      date: at(pastHour, 0),
      status: 'confirmed',
      arrivalStart: pad(pastHour),
      arrivalEnd: pad(Math.min(23, pastHour + 3))
    });
    return names;
  });

  const waitForHome = async () => {
    await page.waitForSelector('.comp-home-next-visit, .comp-home-section-label', { timeout: 20000 });
    await page.waitForFunction(() => !!document.querySelector('.comp-home-next-visit-time') || !!document.querySelector('.comp-home-empty'), null, { timeout: 20000 });
    await sleep(800);
  };

  /* ---------- Phase 1: query regression (seed + 4 extra today) ---------- */
  const added = await addFourToday();
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await waitForHome();

  const p1 = await page.evaluate(async () => {
    const today = Utils.getToday();
    const dayAppts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
    const upcoming = await DB.getUpcomingAppointments(14);
    const todayUpcoming = upcoming.filter(a => Utils.isSameDay(new Date(a.date), today));
    const labels = Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim());
    const todayCell = Array.from(document.querySelectorAll('.comp-home-week-day.today .comp-home-week-day-count')).map(e => e.textContent.trim())[0];
    return {
      dayCount: dayAppts.length,
      todayUpcomingCount: todayUpcoming.length,
      pastInUpcoming: todayUpcoming.some(a => /PAST/.test(a.clientName)),
      labels,
      todayCell,
      hasGreeting: !!document.querySelector('.comp-home-greeting'),
      hasWeekStrip: !!document.querySelector('.comp-home-week-strip'),
      schedulePanels: document.querySelectorAll('.comp-home-schedule').length,
      scanBeforeSchedule: document.querySelector('.comp-home-quick-add')?.compareDocumentPosition(document.querySelector('.comp-home-schedule')) & Node.DOCUMENT_POSITION_FOLLOWING,
      scheduleBeforeWeek: document.querySelector('.comp-home-schedule')?.compareDocumentPosition(document.querySelector('.comp-home-week-strip')) & Node.DOCUMENT_POSITION_FOLLOWING,
      overallRouteMap: !!document.querySelector('.comp-home-route-map'),
      individualRouteLegs: document.querySelectorAll('.comp-home-route-leg').length
    };
  });

  console.log(`\n  Phase 1 — seed + ${added.length} extra today visits (diary day-window count = ${p1.dayCount})`);
  ok('query: upcoming includes ALL of today\'s visits (day window)', p1.todayUpcomingCount === p1.dayCount, { todayUpcomingCount: p1.todayUpcomingCount, dayCount: p1.dayCount });
  ok('query: the earlier-today visit is included', p1.pastInUpcoming === true, p1);
  ok('Home: appointment feed sits directly after Scan and before the weekly strip', !!p1.scanBeforeSchedule && !!p1.scheduleBeforeWeek && p1.hasWeekStrip, p1);
  ok('Home: one overall route map replaces individual route legs', p1.overallRouteMap && p1.individualRouteLegs === 0, p1);
  ok(`weekly strip today cell shows ${p1.dayCount} (matches the diary)`, p1.todayCell === String(p1.dayCount), { todayCell: p1.todayCell });
  ok('advisor greeting remains above the weekly strip', p1.hasGreeting, p1);
  ok('appointments share one schedule panel', p1.schedulePanels === 1, p1);

  /* ---------- Phase 2: feed visibility — exactly the user's day ---------- */
  // A clean day with exactly 4 visits (3 later, 1 an hour ago). The NEXT
  // feed must show all four, with the EARLIEST pending visit today featured
  // (a service call whose slot has passed is the "attend now" card) and the
  // rest listed in the rows below it.
  await page.evaluate(async () => {
    await DB.db.appointments.clear();
    const custs = await DB.db.customers.toArray();
    const today = Utils.getToday();
    const at = (h, m) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const nowH = new Date().getHours();
    for (let i = 0; i < 3; i++) {
      await DB.addAppointment({
        customerId: custs[i].id,
        clientName: 'Home Upcoming ' + i,
        type: 'consultation',
        date: at((nowH + 2 + i) % 24, 0),
        status: 'confirmed',
        ...(i === 0 ? { arrivalStart: '09:00', arrivalEnd: '12:00' } : {})
      });
    }
    const pastHour = Math.max(0, nowH - 1);
    const pad = n => String(n).padStart(2, '0') + ':00';
    await DB.addAppointment({
      customerId: custs[3].id,
      clientName: 'Home Upcoming PAST',
      type: 'consultation',
      date: at(pastHour, 0),
      status: 'confirmed',
      arrivalStart: pad(pastHour),
      arrivalEnd: pad(Math.min(23, pastHour + 3))
    });
  });
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await waitForHome();

  const p2 = await page.evaluate(async () => {
    const today = Utils.getToday();
    const dayAppts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
    const feed = document.querySelector('.comp-home');
    const feedText = feed ? feed.textContent.replace(/\s+/g, ' ') : '';
    // Rows in the NEXT feed (featured card + compact rows).
    const rows = Array.from(document.querySelectorAll('.comp-home-next-visit, .comp-home-visit'));
    const featured = (document.querySelector('.comp-home-next-visit-main') || { textContent: '' }).textContent || '';
    const nextCount = (document.querySelector('.comp-home-section-count') || { textContent: '' }).textContent || '';
    const names = ['Home Upcoming 0', 'Home Upcoming 1', 'Home Upcoming 2', 'Home Upcoming PAST'];
    // The featured card must be the EARLIEST pending visit today (the one to
    // attend/log now) — independent of the run hour (near midnight the
    // "PAST" slot can wrap to late evening while the future slots wrap to
    // early morning, so "earliest today" is the correct expectation).
    const pendingToday = [...dayAppts]
      .filter(a => !a.outcome && a.status !== 'completed')
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const expectedFeatured = pendingToday[0] ? (pendingToday[0].clientName || '').replace(/^@/, '') : null;
    const expectedWindow = pendingToday[0]?.arrivalStart && pendingToday[0]?.arrivalEnd
      ? `${pendingToday[0].arrivalStart}–${pendingToday[0].arrivalEnd}`
      : null;
    return {
      dayCount: dayAppts.length,
      namesOnHome: names.filter(n => feedText.includes(n)).length,
      pastOnHome: feedText.includes('Home Upcoming PAST'),
      featuredIsEarliestToday: !!(expectedFeatured && new RegExp(expectedFeatured.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(featured)),
      featuredShowsWindow: !!expectedWindow && featured.includes(expectedWindow) && !/Arrival window/.test(featured),
      featured: featured.replace(/\s+/g, ' ').slice(0, 120),
      expectedFeatured,
      expectedWindow,
      nextCount,
      rowCount: rows.length,
      rowsInsideSchedule: document.querySelectorAll('.comp-home-schedule .comp-home-next-visit, .comp-home-schedule .comp-home-visit').length
    };
  });

  console.log(`\n  Phase 2 — clean day, exactly 4 visits (diary count = ${p2.dayCount})`);
  ok('feed: all 4 visits appear on Home (was 3 before the fix)', p2.namesOnHome === 4 && p2.pastOnHome, { namesOnHome: p2.namesOnHome });
  ok('feed: the earlier-today visit is listed', p2.pastOnHome, p2);
  ok('feed: the featured NEXT card is the earliest pending visit TODAY', p2.featuredIsEarliestToday, { featured: p2.featured, expected: p2.expectedFeatured });
  ok('feed: promised time range replaces the exact time without a redundant label', p2.featuredShowsWindow, { featured: p2.featured });
  ok(`NEXT section counts ${p2.dayCount} visits`, p2.nextCount.includes(`${p2.dayCount} visit`), { nextCount: p2.nextCount });
  ok('feed rows rendered (featured + compact)', p2.rowCount >= 4, { rowCount: p2.rowCount });
  ok('featured visit and compact rows stay inside one schedule', p2.rowsInsideSchedule === p2.rowCount, p2);

  ok('no console errors', errs.length === 0, errs);

  await browser.close();
  console.log(failures === 0 ? '\n✓ verify-home-upcoming PASS' : `\n✗ verify-home-upcoming FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
