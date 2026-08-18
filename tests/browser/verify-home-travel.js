#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME TRAVEL CHAIN VERIFICATION
   The advisor drives the day as a chain: base → first visit, then visit
   → next visit (never "back to base" between stops). The phone report
   asked to check "moving from base to appointment and then from
   appointment to other appointment".

   The Home feed must show:
   1. Visit 1's ETA measured from BASE.
   2. Visit 2's ETA measured from VISIT 1 (not from base).
   3. The first visit of a NEW day measured from BASE again (the chain
      resets each day — you drive home at night).

   Geometry: base [53.415,-2.149]; A1 ≈ 3.4km from base (≈8 min);
   A2 ≈ 0.4km from A1 but ≈ 3.7km from base (≈1 min chained vs ≈8 min
   from base); A3 tomorrow at A1's spot (≈8 min from base, NOT 0 min).
   Run: node tests/browser/verify-home-travel.js  (:8000 + Playwright)
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('tr') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true, businessAddress: '12 Willow Works, Stockport Road, Manchester M16 0AA', businessLatLng: [53.415, -2.149] }));
    sessionStorage.setItem('tr', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?tr=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1500);

  await page.evaluate(async () => {
    await DB.db.appointments.clear();
    const custs = await DB.db.customers.toArray();
    const today = Utils.getToday();
    const at = h => { const d = new Date(today); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1); tmr.setHours(10, 0, 0, 0);
    await DB.addAppointment({ customerId: custs[0].id, clientName: 'Chain A1', type: 'consultation', date: at(10), status: 'confirmed', latLng: [53.445, -2.160], address: '11 Far Lane, Manchester M22 5AA' });
    await DB.addAppointment({ customerId: custs[1].id, clientName: 'Chain A2', type: 'consultation', date: at(12), status: 'confirmed', latLng: [53.447, -2.162], address: '12 Near Lane, Manchester M22 5AB' });
    await DB.addAppointment({ customerId: custs[2].id, clientName: 'Chain A3', type: 'consultation', date: tmr.toISOString(), status: 'confirmed', latLng: [53.445, -2.160], address: '13 Reset Lane, Manchester M22 5AC' });
  });
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForSelector('.comp-home-next-visit', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const rows = await page.evaluate(() => {
    const out = {};
    const featured = document.querySelector('.comp-home-next-visit');
    if (featured) out[featured.querySelector('.comp-home-next-visit-name')?.textContent.trim()] = (featured.querySelector('.comp-home-next-visit-journey') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
    Array.from(document.querySelectorAll('.comp-home-visit')).forEach(r => {
      const name = r.querySelector('.comp-home-visit-name')?.textContent.trim();
      out[name] = (r.querySelector('.comp-home-visit-area') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
    });
    return out;
  });
  const etaOf = name => {
    const m = (rows[name] || '').match(/(\d+)\s*min/);
    return m ? parseInt(m[1], 10) : null;
  };
  console.log('\n  chain rows:', JSON.stringify(rows));

  const a1 = etaOf('Chain A1');
  const a2 = etaOf('Chain A2');
  const a3 = etaOf('Chain A3');
  ok('A1 (first stop): ETA measured from base (~8 min)', a1 !== null && a1 >= 6 && a1 <= 11, rows['Chain A1']);
  ok('A2: ETA measured from A1 (~1 min), not from base (~8 min)', a2 !== null && a2 <= 3, rows['Chain A2']);
  ok('A2 is genuinely closer to A1 than to base', a2 < a1, { a1, a2 });
  ok('A3 (tomorrow): chain resets to base (~8 min), not 0 min from A2', a3 !== null && a3 >= 6 && a3 <= 11, rows['Chain A3']);
  ok('area labels use the postcode convention (not the street)', /M22/.test(rows['Chain A1'] || ''), rows['Chain A1']);

  ok('no console errors', errs.length === 0, errs);

  await browser.close();
  console.log(failures === 0 ? '\n✓ verify-home-travel PASS' : `\n✗ verify-home-travel FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
