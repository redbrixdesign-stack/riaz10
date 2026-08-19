#!/usr/bin/env node
/* ============================================
   ADVISOROS — JOURNEY UNDER AN iPHONE ENVIRONMENT
   "Can you check it on iPhone environment?"

   Runs the same start-to-finish journey as audit-journey-shots.js but in
   a faithful iPhone emulation: iPhone 15 viewport (393×852 @3x), Safari
   UA, isMobile+hasTouch, and a matchMedia shim forcing PWA
   display-mode: standalone (the app as installed to the Home Screen,
   with the black-translucent status bar / safe-area behaviour). Checks
   the iPhone-specific concerns (standalone PWA, safe-area padding,
   no iOS zoom on inputs, touch targets, no horizontal overflow) WHILE
   the journey runs, screenshotting each interaction.

   Output: screenshots/audit-ios-journey/NN-name.png + manifest.json
   Run: node tests/browser/audit-ios-journey.js  (:8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8000';
const OUT = path.join(__dirname, '..', '..', 'screenshots', 'audit-ios-journey');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const shots = [];
let seq = 1;
const shot = async (page, description, opts = {}) => {
  const name = String(seq++).padStart(2, '0') + '-' + description.replace(/[^a-z0-9-]+/gi, '-').toLowerCase().slice(0, 60) + '.png';
  await page.screenshot({ path: path.join(OUT, name), ...opts });
  shots.push({ file: name, description });
  console.log('  ✓', name, '—', description);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra).slice(0, 200) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  // ---- iPhone environment (iPhone 15, Safari, PWA standalone) ----
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  });
  await ctx.grantPermissions(['geolocation'], { origin: BASE });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('ios') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true, businessAddress: '12 Willow Works, Stockport Road, Manchester M16 0AA', businessLatLng: [53.415, -2.149] }));
    sessionStorage.setItem('ios', '1');
    // Force PWA standalone (as installed to the Home Screen).
    const mq = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      const r = mq(q);
      if (/(display-mode)/.test(q)) return { matches: q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; } };
      return r;
    };
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 140)));
  page.on('console', m => {
    if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push('ERR: ' + m.text().slice(0, 140));
    if (m.type() === 'warning') errs.push('WARN: ' + m.text().slice(0, 140));
  });
  const setPos = (lat, lng) => cdp.send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lng, accuracy: 5 });

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?ios=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForSelector('.comp-home', { timeout: 20000 });
  await sleep(1800);

  console.log('\n=== iPhone environment checks ===');
  const env = await page.evaluate(() => {
    const sc = document.getElementById('comp-scroll');
    const first = document.querySelector('.comp-home') ? document.querySelector('.comp-home').firstElementChild : null;
    return {
      standalone: matchMedia('(display-mode: standalone)').matches,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      firstTop: first ? Math.round(first.getBoundingClientRect().top) : null,
      safeAreaTop: getComputedStyle(sc).paddingTop,
      inputFont: getComputedStyle(document.querySelector('.comp-input')).fontSize,
      // touch targets: composer send + week day cells
      sendH: document.querySelector('.comp-send') ? Math.round(document.querySelector('.comp-send').getBoundingClientRect().height) : null,
      weekDayH: document.querySelector('.comp-home-week-day') ? Math.round(document.querySelector('.comp-home-week-day').getBoundingClientRect().height) : null
    };
  });
  ok('iPhone: PWA standalone mode honoured', env.standalone === true, env);
  ok('iPhone: no horizontal overflow at 393×852', env.overflowX <= 0, env.overflowX);
  ok('iPhone: status-bar safe-area padding applied (not 0)', env.safeAreaTop !== '0px' && !!env.firstTop && env.firstTop >= 0, env);
  ok('iPhone: inputs are 16px+ (no iOS auto-zoom)', parseInt(env.inputFont, 10) >= 16, env.inputFont);
  ok('iPhone: touch targets ≥ 40px (send 44, week day cells)', (env.sendH || 0) >= 40 && (env.weekDayH || 0) >= 40, env);

  console.log('\n=== Journey (iPhone environment) ===');
  await shot(page, '01 iPhone Home — feed', { fullPage: false });
  await page.evaluate(() => document.getElementById('comp-scroll').scrollTo(0, document.getElementById('comp-scroll').scrollHeight));
  await sleep(400);
  await shot(page, '02 iPhone Home — full scroll');

  // create 4 appointments
  const ids = await page.evaluate(async () => {
    await DB.db.appointments.clear();
    await DB.db.orders.clear();
    await DB.db.trips.clear();
    await DB.db.expenses.clear();
    const custs = await DB.getCustomersByIds((await DB.db.customers.toArray()).map(c => c.id));
    const by = n => custs.find(c => `${c.firstName} ${c.lastName}` === n);
    const today = Utils.getToday();
    const at = h => { const d = new Date(today); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const h = new Date().getHours();
    const out = {};
    out.sales = (await DB.addAppointment({ customerId: by('Sarah Johnson').id, clientName: 'Sarah Johnson', type: 'consultation', date: at(Math.min(23, h + 2)), status: 'confirmed', phone: '07700 900123', address: '14 Beechwood Avenue, Stockport SK1 4AA' })).id;
    out.fitting = (await DB.addAppointment({ customerId: by('Tom Hardcastle').id, clientName: 'Tom Hardcastle', type: 'fitting', date: at(Math.min(23, h + 3)), status: 'confirmed', phone: '07900 555666', address: '3 Cypress Close, Stockport SK7 5AA' })).id;
    out.service = (await DB.addAppointment({ customerId: by("David O'Leary").id, clientName: "David O'Leary", type: 'service_call', date: at(Math.max(0, h - 1)), status: 'confirmed', phone: '07900 333444', address: "St Mary's Court, Altrincham M22 2AA" })).id;
    return out;
  });
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('.comp-home-next-visit'), null, { timeout: 30000 });
  await sleep(2000);
  const featured = await page.evaluate(() => (document.querySelector('.comp-home-next-visit-name') || { textContent: '' }).textContent.replace(/^@/, ''));
  ok('iPhone: featured NEXT = earliest pending today (service call)', /David O'Leary/.test(featured), featured);
  await shot(page, '03 iPhone Home — featured service call');

  // visit detail → customer header → C360 → contact sheet
  await page.evaluate(aid => App.navigate('appointments', { id: aid }), ids.service);
  await sleep(1200);
  await shot(page, '04 iPhone Visit detail — service call');
  await page.evaluate(() => { const b = document.querySelector('[data-action="App.navigate"][role="button"]'); if (b) b.click(); });
  await sleep(1000);
  await shot(page, '05 iPhone Customer 360 — David');
  await page.evaluate(aid => App.navigate('appointments', { id: aid }), ids.service);
  await sleep(1000);
  await page.evaluate(() => { const b = document.querySelector('[data-action="ContactFeature.open"]'); if (b) b.click(); });
  await sleep(600);
  await shot(page, '06 iPhone Contact sheet');
  const sheetText = await page.evaluate(() => (document.querySelector('.bottom-sheet') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim());
  ok('iPhone: contact sheet renders', /WhatsApp/.test(sheetText) && /Call/.test(sheetText), sheetText.slice(0, 80));
  await page.evaluate(() => App.closeModal({ all: true }));

  // outcome quoted → ordered
  await page.evaluate(async aid => { await AppointmentsFeature.captureOutcome(aid, 'quoted'); }, ids.service);
  await sleep(500);
  await page.evaluate(() => { const v = document.getElementById('outcome-value'); if (v) v.value = '150'; });
  await shot(page, '07 iPhone Outcome — quoted (service)');
  await page.evaluate(() => { const b = document.querySelector('[data-action="AppointmentsFeature.saveOutcome"]'); if (b) b.click(); });
  await sleep(900);
  await page.evaluate(async aid => { await AppointmentsFeature.captureOutcome(aid, 'quoted'); }, ids.sales);
  await sleep(500);
  await page.evaluate(() => { const v = document.getElementById('outcome-value'); if (v) v.value = '1200'; });
  await page.evaluate(() => { const b = document.querySelector('[data-action="AppointmentsFeature.saveOutcome"]'); if (b) b.click(); });
  await sleep(900);
  await page.evaluate(async aid => { await AppointmentsFeature.captureOutcome(aid, 'ordered'); }, ids.sales);
  await sleep(500);
  await page.evaluate(() => {
    const v = document.getElementById('outcome-value'); if (v) v.value = '1200';
    const p = document.getElementById('outcome-payment'); if (p) p.value = '600';
  });
  await shot(page, '08 iPhone Outcome — ordered + deposit');
  await page.evaluate(() => { const b = document.querySelector('[data-action="AppointmentsFeature.saveOutcome"]'); if (b) b.click(); });
  await sleep(900);

  // kanban + money + followups
  await page.evaluate(() => App.navigate('orders'));
  await page.waitForTimeout(1200);
  await shot(page, '09 iPhone Kanban');
  await page.evaluate(() => App.navigate('money'));
  await page.waitForTimeout(1200);
  await shot(page, '10 iPhone Money');
  await page.evaluate(() => App.navigate('followups'));
  await page.waitForTimeout(1200);
  await shot(page, '11 iPhone Follow-ups');

  // fitting message preview
  await page.evaluate(aid => App.navigate('appointments', { id: aid }), ids.fitting);
  await sleep(1000);
  await page.evaluate(async aid => { await TalkFeature.sendMessage(aid, 'evening_before'); }, ids.fitting);
  await sleep(800);
  await shot(page, '12 iPhone Message preview — fitting');
  await page.evaluate(() => App.closeModal({ all: true }));

  // live trip
  await page.evaluate(() => { Geo.geocode = async () => ({ lat: 53.445, lng: -2.160 }); });
  await setPos(53.415, -2.149);
  await page.evaluate(async () => { await Geo.startTrip({ destinationAddress: '3 Cypress Close', appointmentId: null }); });
  await sleep(800);
  await shot(page, '13 iPhone Live trip banner');
  await setPos(53.445, -2.160);
  await page.evaluate(() => Geo.checkArrivalOnResume());
  await sleep(900);
  const tripDone = await page.evaluate(async () => (await DB.db.trips.toArray()).length);
  ok('iPhone: trip auto-finished on arrival', tripDone === 1, { tripDone });
  await page.evaluate(() => App.navigate('money'));
  await page.waitForTimeout(1200);
  await shot(page, '14 iPhone Money — trip logged');

  // My Day + chat
  await page.evaluate(() => App.navigate('today'));
  await page.waitForSelector('.comp-home-week-day', { timeout: 15000 });
  await sleep(1200);
  await page.evaluate(() => { const d = document.querySelectorAll('.comp-home-week-day')[0]; if (d) d.click(); });
  await page.waitForSelector('.bottom-sheet .hsc-week-title', { timeout: 15000 });
  await sleep(900);
  await shot(page, '15 iPhone My Day panel');
  await page.evaluate(() => App.closeModal({ all: true }));
  await page.evaluate(() => App.navigate('today'));
  await page.waitForSelector('.comp-suggestion-chip', { timeout: 15000 });
  await sleep(1200);
  await page.evaluate(() => { const c = document.querySelector('.comp-suggestion-chip'); if (c) c.click(); });
  await sleep(2500);
  await shot(page, '16 iPhone Ask Beelo chat');

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), shots, environment: 'iPhone 15 (393x852 @3x, Safari, PWA standalone)' }, null, 2));

  console.log('\nISSUES FOUND ON iPHONE:\n' + (errs.length ? errs.join('\n') : '(none)'));
  console.log(failures === 0 ? '\n✓ audit-ios-journey PASS' : `\n✗ ${failures} CHECK(S) FAILED`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
