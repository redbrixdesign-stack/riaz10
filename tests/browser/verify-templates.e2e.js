#!/usr/bin/env node
/* ============================================
   ADVISOROS — PER-TYPE MESSAGE TEMPLATES (AI OFF)
   Evening-before / morning-of / pre-intro reminders must be type-aware:
   a fitting customer gets asked to clear the area and remove existing
   blinds; a measure customer is asked to have windows clear (never
   "which blinds"); a service call references the reported issue. The
   old flat strings sent consultation questions to every visit type.

   Drives the REAL app's sendMessage (the same path the scheduler and
   follow-ups use) and reads the actual drafted preview text.
   Run: node tests/browser/verify-templates.e2e.js  (:8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra).slice(0, 220) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('tpl') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    localStorage.setItem('advisoros_companion_ai', '0'); // AI off — static templates
    sessionStorage.setItem('tpl', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?tpl=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1500);

  // Create one appointment per type, then draft each reminder via the real
  // sendMessage and read the preview sheet text.
  const ids = await page.evaluate(async () => {
    const custs = await DB.getCustomersByIds((await DB.db.customers.toArray()).map(c => c.id));
    const byName = n => custs.find(c => `${c.firstName} ${c.lastName}` === n);
    const today = Utils.getToday();
    const at = (h, type) => { const d = new Date(today); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const out = {};
    out.fitting = (await DB.addAppointment({ customerId: byName('Tom Hardcastle').id, clientName: 'Tom Hardcastle', type: 'fitting', date: at(10), status: 'confirmed', phone: '07900 555666', address: '3 Cypress Close, Stockport SK7 5AA', notes: 'Parking: visitors bay only. Access: key safe on the right of the main door.' })).id;
    out.measure = (await DB.addAppointment({ customerId: byName('Sarah Johnson').id, clientName: 'Sarah Johnson', type: 'measure', date: at(11), status: 'confirmed', phone: '07700 900123', address: '14 Beechwood Avenue, Stockport SK1 4AA' })).id;
    out.service = (await DB.addAppointment({ customerId: byName("David O'Leary").id, clientName: "David O'Leary", type: 'service_call', date: at(12), status: 'confirmed', phone: '07900 333444', address: "St Mary's Court, Altrincham M22 2AA", notes: 'Access: key safe on the right of the main door. Blinds jammed after install — bracket bolt sheared.' })).id;
    out.consultation = (await DB.addAppointment({ customerId: byName('Amelia Green').id, clientName: 'Amelia Green', type: 'consultation', date: at(13), status: 'confirmed', phone: '07711 223344', address: '9 Birch Lane, Wilmslow SK9 5AA' })).id;
    return out;
  });

  const draft = async (apptId, templateKey) => {
    await page.evaluate(({ id, key }) => TalkFeature.sendMessage(id, key), { id: apptId, key: templateKey });
    await sleep(900);
    return page.evaluate(() => {
      const el = document.getElementById('talk-message-preview');
      const text = el ? el.value : '';
      // Close the preview sheet so the next draft starts clean.
      try { App.closeModal({ all: true }); } catch (e) {}
      return text;
    });
  };

  console.log('\n=== fitting appointment ===');
  const fitEb = await draft(ids.fitting, 'evening_before');
  const fitMo = await draft(ids.fitting, 'morning_of');
  console.log('  evening_before: ' + fitEb);
  ok('fitting evening-before asks to clear the area around the window(s)', /clear the area around the window/.test(fitEb), fitEb);
  ok('fitting evening-before asks to remove existing blinds/curtains', /remove any existing blinds or curtains/.test(fitEb), fitEb);
  ok('fitting morning-of asks to take down existing blinds', /take down any existing blinds/.test(fitMo), fitMo);
  ok('fitting reminders never ask "how many windows"', !/how many windows/.test(fitEb + fitMo), fitEb);

  console.log('\n=== measure appointment ===');
  const mEb = await draft(ids.measure, 'evening_before');
  console.log('  evening_before: ' + mEb);
  ok('measure evening-before is about measuring up / clear windows', /measure up|windows we're measuring are clear/.test(mEb), mEb);
  ok('measure never asks which blinds (consultation question)', !/which blinds/.test(mEb), mEb);

  console.log('\n=== service call appointment ===');
  const sEb = await draft(ids.service, 'evening_before');
  console.log('  evening_before: ' + sEb);
  ok('service_call references the reported issue', /sort out the issue/.test(sEb), sEb);

  console.log('\n=== consultation appointment ===');
  const cEb = await draft(ids.consultation, 'evening_before');
  ok('consultation still asks how many windows + blinds', /how many windows/.test(cEb) && /blinds in mind/.test(cEb), cEb);

  console.log('\n=== pre_intro (first-visit intro) per-type + profile-aware ===');
  const pFit = await draft(ids.fitting, 'pre_intro');
  console.log('  pre_intro fitting: ' + pFit);
  ok('pre_intro introduces the advisor with their title (Independent Hillarys Window Coverings Expert)', /an Independent Hillarys Window Coverings Expert/.test(pFit), pFit);
  ok('pre_intro fitting asks to clear the area + take down blinds', /clear the area around the window/.test(pFit) && /take down any existing blinds/.test(pFit), pFit);
  ok('pre_intro is profile-aware: acknowledges the parking note (visitors bay)', /visitors bay/.test(pFit), pFit);
  ok('pre_intro is profile-aware: acknowledges the access note (key safe)', /key safe/.test(pFit), pFit);
  ok('pre_intro does not re-ask parking/access already in the profile', !/Any parking or access \(gates, stairs, pets\)/.test(pFit), pFit);
  ok('pre_intro uses a real date/time (no literal {{day}} braces)', !/\{\{day\}\}/.test(pFit) && /\d{1,2} [A-Z][a-z]{2}/.test(pFit), pFit);

  ok('no console errors', errs.length === 0, errs);

  await browser.close();
  console.log(failures === 0 ? '\n✓ verify-templates.e2e PASS' : `\n✗ verify-templates.e2e FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
