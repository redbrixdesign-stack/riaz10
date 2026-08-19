#!/usr/bin/env node
/* ============================================
   ADVISOROS — FULL JOURNEY SCREENSHOT AUDIT
   "Create a few appointments and check every possibility from start
   to finish, screenshot every interaction."

   Seeds the demo dataset, creates 4 appointments (sales call, measure,
   fitting, service call) and walks the REAL app through the whole
   journey — Home feed, visit detail, customer contact sheet, Customer
   360, outcomes (quoted → ordered with deposit), kanban, money,
   follow-ups + message preview, live mileage trip, My Day, Ask Beelo —
   capturing a numbered screenshot of EVERY interaction.

   Output: screenshots/audit-journey/NN-name.png + manifest.json
   Run: node tests/browser/audit-journey-shots.js (:8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8000';
const OUT = path.join(__dirname, '..', '..', 'screenshots', 'audit-journey');
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(['geolocation'], { origin: BASE });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('ajs') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true, businessAddress: '12 Willow Works, Stockport Road, Manchester M16 0AA', businessLatLng: [53.415, -2.149] }));
    sessionStorage.setItem('ajs', '1');
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
  await page.goto(BASE + '/index.html?ajs=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForSelector('.comp-home', { timeout: 20000 });
  await sleep(1800);

  // ---- Create the demo appointments (a few appointments, every type) ----
  const ids = await page.evaluate(async () => {
    await DB.db.appointments.clear();
    await DB.db.orders.clear();
    await DB.db.trips.clear();
    await DB.db.expenses.clear();
    await DB.db.measurements.clear();
    const custs = await DB.getCustomersByIds((await DB.db.customers.toArray()).map(c => c.id));
    const by = n => custs.find(c => `${c.firstName} ${c.lastName}` === n);
    const today = Utils.getToday();
    const at = (h) => { const d = new Date(today); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1); tmr.setHours(11, 0, 0, 0);
    const h = new Date().getHours();
    const out = {};
    out.sales = (await DB.addAppointment({ customerId: by('Sarah Johnson').id, clientName: 'Sarah Johnson', type: 'consultation', date: at(Math.min(23, h + 2)), status: 'confirmed', phone: '07700 900123', address: '14 Beechwood Avenue, Stockport SK1 4AA' })).id;
    out.measure = (await DB.addAppointment({ customerId: by('Amelia Green').id, clientName: 'Amelia Green', type: 'measure', date: at(Math.min(23, h + 3)), status: 'confirmed', phone: '07711 223344', address: '9 Birch Lane, Wilmslow SK9 5AA' })).id;
    out.fitting = (await DB.addAppointment({ customerId: by('Tom Hardcastle').id, clientName: 'Tom Hardcastle', type: 'fitting', date: tmr.toISOString(), status: 'confirmed', phone: '07900 555666', address: '3 Cypress Close, Stockport SK7 5AA' })).id;
    out.service = (await DB.addAppointment({ customerId: by("David O'Leary").id, clientName: "David O'Leary", type: 'service_call', date: at(Math.max(0, h - 1)), status: 'confirmed', phone: '07900 333444', address: "St Mary's Court, Altrincham M22 2AA", notes: 'Blinds jammed after install — bracket bolt sheared. Access: key safe on the right of the main door.' })).id;
    return out;
  });

  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForSelector('.comp-home-next-visit', { timeout: 20000 });
  await sleep(2000);

  console.log('\n=== 1. HOME — the feed with 4 appointments ===');
  const featured = await page.evaluate(() => ({
    name: (document.querySelector('.comp-home-next-visit-name') || { textContent: '' }).textContent.replace(/^@/, ''),
    time: (document.querySelector('.comp-home-next-visit-time') || { textContent: '' }).textContent.trim()
  }));
  console.log('  featured:', JSON.stringify(featured));
  ok('featured card = the earliest pending today (the service call, attend-now)', /David O'Leary/.test(featured.name), featured);
  await shot(page, '01 Home feed — 4 appointments, featured NEXT');
  await page.evaluate(() => document.getElementById('comp-scroll').scrollTo(0, 0));
  await shot(page, '02 Home — weekly calendar strip');
  await page.evaluate(() => document.getElementById('comp-scroll').scrollTo(0, document.getElementById('comp-scroll').scrollHeight));
  await shot(page, '03 Home — attention + Ask Beelo', { fullPage: true });

  console.log('\n=== 2. VISIT DETAIL — the sales call ===');
  await page.evaluate(aid => App.navigate('appointments', { id: aid }), ids.sales);
  await sleep(1200);
  await shot(page, '04 Visit detail — sales call (Sarah)');
  const profileClickable = await page.evaluate(() => !!document.querySelector('[data-action="App.navigate"][role="button"]'));
  ok('customer header is clickable (fixed data-key bug)', profileClickable);
  await page.evaluate(() => { const b = document.querySelector('[data-action="App.navigate"][role="button"]'); if (b) b.click(); });
  await sleep(1000);
  await shot(page, '05 Customer 360 — Sarah profile');
  await page.evaluate(aid => App.navigate('appointments', { id: aid }), ids.sales);
  await sleep(1000);

  console.log('\n=== 3. CUSTOMER CONTACT SHEET ===');
  await page.evaluate(() => { const b = document.querySelector('[data-action="ContactFeature.open"]'); if (b) b.click(); });
  await sleep(600);
  const sheet = await page.evaluate(() => (document.querySelector('.bottom-sheet') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
  ok('contact sheet shows number + WhatsApp/Call/Copy', /WhatsApp/.test(sheet) && /Call/.test(sheet) && /Copy Number/.test(sheet), sheet);
  await shot(page, '06 Contact sheet — WhatsApp / Call / Copy');
  await page.evaluate(() => { const b = document.querySelector('.bottom-sheet [data-action="ContactFeature.openWhatsApp"]'); if (b) b.click(); });
  await sleep(600);
  await shot(page, '07 After WhatsApp tap (wa.me deep link, sheet closed)');
  await page.evaluate(() => { const b = document.querySelector('[data-action="ContactFeature.open"]'); if (b) b.click(); });
  await sleep(500);
  await page.evaluate(() => { const b = document.querySelector('.bottom-sheet [data-action="ContactFeature.openCall"]'); if (b) b.click(); });
  await sleep(500);
  await shot(page, '08 After Call tap (tel: link)');
  await page.evaluate(() => { const b = document.querySelector('[data-action="ContactFeature.open"]'); if (b) b.click(); });
  await sleep(500);
  await shot(page, '09 Contact sheet reopened');
  await page.evaluate(() => App.closeModal({ all: true }));

  console.log('\n=== 4. OUTCOMES — quoted → ordered with deposit ===');
  await page.evaluate(async aid => { await AppointmentsFeature.captureOutcome(aid, 'quoted'); }, ids.sales);
  await sleep(500);
  await page.evaluate(() => { const v = document.getElementById('outcome-value'); if (v) v.value = '1200'; });
  await shot(page, '10 Outcome modal — Quoted £1,200');
  await page.evaluate(() => { const b = document.querySelector('[data-action="AppointmentsFeature.saveOutcome"]'); if (b) b.click(); });
  await sleep(900);
  await page.evaluate(() => App.navigate('today'));
  await page.waitForSelector('.comp-home-next-visit', { timeout: 15000 });
  await sleep(1200);
  await shot(page, '11 Home after quoting — next visit featured');
  const nextFeatured = await page.evaluate(() => (document.querySelector('.comp-home-next-visit-name') || { textContent: '' }).textContent.replace(/^@/, ''));
  ok('featured moved on after quoting Sarah', !/Sarah/.test(nextFeatured), nextFeatured);

  await page.evaluate(aid => App.navigate('appointments', { id: aid }), ids.sales);
  await sleep(1000);
  await page.evaluate(async aid => { await AppointmentsFeature.captureOutcome(aid, 'ordered'); }, ids.sales);
  await sleep(500);
  await page.evaluate(() => {
    const v = document.getElementById('outcome-value'); if (v) v.value = '1200';
    const p = document.getElementById('outcome-payment'); if (p) p.value = '600';
  });
  await shot(page, '12 Outcome modal — Ordered £1,200 + £600 deposit');
  await page.evaluate(() => { const b = document.querySelector('[data-action="AppointmentsFeature.saveOutcome"]'); if (b) b.click(); });
  await sleep(900);

  console.log('\n=== 5. ORDERS / MONEY / FOLLOW-UPS ===');
  await page.evaluate(() => App.navigate('orders'));
  await page.waitForTimeout(1200);
  const kanban = await page.evaluate(() => {
    const c = id => Array.from(document.querySelectorAll(`.kanban-col--${id} .kanban-card-name`)).map(e => e.textContent.trim());
    return { quoted: c('quoted'), ordered: c('ordered') };
  });
  ok('kanban: Sarah\'s card moved Quoted → Ordered (quote consumed by the sale)', kanban.quoted.length === 0 && kanban.ordered.some(n => /Sarah/.test(n)), kanban);
  await shot(page, '13 Orders kanban — quoted + ordered');

  await page.evaluate(() => App.navigate('money'));
  await page.waitForTimeout(1200);
  await shot(page, '14 Money — earnings + mileage claim');
  await page.evaluate(() => MoneyFeature.openMileageModal());
  await sleep(500);
  await shot(page, '15 Mileage modal — Start Live Trip / manual');
  await page.evaluate(() => App.closeModal({ all: true }));

  await page.evaluate(() => App.navigate('followups'));
  await page.waitForTimeout(1200);
  await shot(page, '16 Follow-ups inbox');
  const fupText = await page.evaluate(() => document.getElementById('main').textContent);
  ok('inbox has quote + payment tasks for Sarah', /Collect|Quote/i.test(fupText), fupText.slice(0, 120));

  console.log('\n=== 6. MESSAGE PREVIEW (Talk) ===');
  await page.evaluate(aid => App.navigate('appointments', { id: aid }), ids.fitting);
  await sleep(1000);
  await page.evaluate(async aid => { await TalkFeature.sendMessage(aid, 'evening_before'); }, ids.fitting);
  await sleep(800);
  const previewText = await page.evaluate(() => document.getElementById('talk-message-preview')?.value || '');
  console.log('  fitting evening_before:', previewText.slice(0, 200));
  await shot(page, '17 Message preview — fitting evening-before (job-aware)');
  ok('fitting reminder is job/type aware (known customer)', /to fit/.test(previewText) && !/which blinds/.test(previewText), previewText.slice(0, 120));
  await page.evaluate(() => App.closeModal({ all: true }));

  console.log('\n=== 7. LIVE MILEAGE TRIP ===');
  await page.evaluate(() => { Geo.geocode = async () => ({ lat: 53.445, lng: -2.160 }); });
  await setPos(53.415, -2.149);
  await page.evaluate(async () => { await Geo.startTrip({ destinationAddress: "St Mary's Court, Altrincham M22 2AA", appointmentId: null }); });
  await sleep(800);
  await shot(page, '18 Live trip banner — in transit');
  await setPos(53.445, -2.160);
  await page.evaluate(() => Geo.checkArrivalOnResume());
  await sleep(900);
  const tripDone = await page.evaluate(async () => (await DB.db.trips.toArray()).length);
  ok('trip logged on arrival', tripDone === 1, { tripDone });
  await shot(page, '19 Trip finished — arrival logged');

  console.log('\n=== 8. MY DAY + ASK BEELO ===');
  await page.evaluate(() => App.navigate('today'));
  await page.waitForSelector('.comp-home-week-day', { timeout: 15000 });
  await sleep(1200);
  await page.evaluate(() => { const d = document.querySelectorAll('.comp-home-week-day')[0]; if (d) d.click(); });
  await page.waitForSelector('.bottom-sheet .hsc-week-title', { timeout: 15000 });
  await sleep(900);
  await shot(page, '20 My Day — weekly calendar panel');
  await page.evaluate(() => App.closeModal({ all: true }));
  await page.evaluate(() => App.navigate('today'));
  await page.waitForSelector('.comp-suggestion-chip', { timeout: 15000 });
  await sleep(1200);
  await page.evaluate(() => { const c = document.querySelector('.comp-suggestion-chip'); if (c) c.click(); });
  await sleep(2500);
  await shot(page, '21 Ask Beelo — chat answer with Back to Home');
  await page.evaluate(() => { const b = document.querySelector('.comp-chat-back'); if (b) b.click(); });
  await sleep(1500);
  await shot(page, '22 Back to Home — feed restored');

  // manifest
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), shots }, null, 2));

  console.log('\nISSUES FOUND:\n' + (errs.length ? errs.join('\n') : '(none)'));
  console.log(failures === 0 ? '\n✓ audit-journey-shots PASS' : `\n✗ ${failures} CHECK(S) FAILED`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
