#!/usr/bin/env node
/* ============================================
   ADVISOROS — LEGACY ORDER BACKFILL VERIFICATION
   The phone report: "I have 4 orders but the kanban shows zero, only the
   Quoted column fills." Root cause: sales recorded as appointment
   outcomes (v5-era, before the orders table) never became order rows,
   and the Orders kanban is driven purely by the orders table.

   This test simulates that state (sold appointments, empty orders table),
   reboots the app so DB.init() runs the backfill, and asserts:
   1. Order rows are created for every sold appointment (one per sale).
   2. Each backfilled order is valid (ORD- number, total = sale value,
      stage ordered, balance due = total) and linked to the appointment.
   3. The Orders kanban shows them in the Ordered column (not zero).
   4. The migration is idempotent: a second boot creates no duplicates.
   5. Customer totals include the backfilled orders.
   Run: node tests/browser/verify-orders-backfill.js (needs :8000 + PW)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra).slice(0, 180) : ''));
  if (!cond) failures++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('bf') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('bf', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });

  // Boot once with the seed, then convert to the legacy state:
  // 4 sold appointments (outcome 'ordered') with values, empty orders table.
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?bf=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1200);
  await page.evaluate(async () => {
    await DB.db.orders.clear();
    // 4 legacy-style sales: sold appointments, no order rows
    const custs = await DB.db.customers.toArray();
    const mk = async (i, customerId, value, daysAgo) => {
      await DB.db.appointments.add({
        customerId, clientName: 'Legacy Sale ' + i, type: 'consultation',
        date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        status: 'completed', outcome: 'ordered', value
      });
    };
    for (let i = 1; i <= 4; i++) await mk(i, custs[i % custs.length].id, 1000 + i * 100, i * 2);
  });

  // Reboot the app so DB.init() runs the backfill migration.
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1500);

  const state1 = await page.evaluate(async () => {
    const soldAppts = await DB.db.appointments.where('outcome').equals('ordered').toArray();
    const orders = await DB.db.orders.toArray();
    const linked = orders.filter(o => soldAppts.some(a => a.id === o.appointmentId));
    return { soldCount: soldAppts.length, orders: orders.length, linked: linked.length, total: linked.reduce((s, o) => s + (o.total || 0), 0) };
  });
  ok('backfill created exactly one order per sold appointment (all linked)',
    state1.soldCount >= 4 && state1.orders === state1.soldCount && state1.linked === state1.soldCount, state1);
  const SOLD = state1.soldCount;

  const validity = await page.evaluate(async () => {
    const soldAppts = await DB.db.appointments.where('outcome').equals('ordered').toArray();
    const orders = await DB.db.orders.toArray();
    const bad = [];
    for (const o of orders) {
      const appt = soldAppts.find(a => a.id === o.appointmentId);
      if (!appt) { bad.push('no-appt'); continue; }
      if (!/^ORD-\d{4}-\d{4}$/.test(o.orderNumber || '')) bad.push('bad-number');
      if ((o.total || 0) !== (appt.value || 0)) bad.push('total-mismatch');
      if (o.stage !== 'ordered' || (o.balanceDue || 0) !== (appt.value || 0)) bad.push('stage/balance');
    }
    return { bad, orderNumbers: orders.map(o => o.orderNumber) };
  });
  ok('backfilled orders are valid (number, total, stage, balance)', validity.bad.length === 0, validity);

  // Kanban shows them (not zero)
  await page.evaluate(() => App.navigate('orders'));
  await sleep(1200);
  const board = await page.evaluate(() => Array.from(document.querySelectorAll('.kanban-col')).map(c => ({ id: c.className.match(/kanban-col--(\w+)/)?.[1], cards: c.querySelectorAll('.kanban-card').length })));
  const orderedCol = board.find(c => c.id === 'ordered');
  ok('kanban Ordered column shows all ' + SOLD + ' backfilled orders (not zero)', orderedCol && orderedCol.cards === SOLD, board);

  // Idempotent: second boot creates no duplicates
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1500);
  const state2 = await page.evaluate(async () => ({ orders: (await DB.db.orders.toArray()).length }));
  ok('idempotent — a second boot does not duplicate orders', state2.orders === SOLD, state2);

  // Customer totals include the backfilled orders
  const totals = await page.evaluate(async () => {
    const custs = await DB.db.customers.toArray();
    const withOrders = custs.filter(c => c.orderCount > 0);
    return withOrders.map(c => ({ name: c.fullName, orderCount: c.orderCount }));
  });
  ok('customer totals include the backfilled orders', totals.some(t => t.orderCount >= 1), totals);

  const runtime = errs.filter(e => !/unknown stage/.test(e));
  ok('no unexpected console errors across the backfill flow', runtime.length === 0, runtime);

  await browser.close();
  console.log(failures === 0 ? '\nORDER BACKFILL VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('BACKFILL FAILED:', e.message.slice(0, 200)); process.exit(1); });
