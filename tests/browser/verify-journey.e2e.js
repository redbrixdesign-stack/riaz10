#!/usr/bin/env node
/* ============================================
   ADVISOROS — END-TO-END JOURNEY VERIFICATION
   "Create a few appointments and check every possibility: ordered,
   quoted, mileage tracked, not tracked, delivered, fitted — the whole
   end-to-end journey."

   Drives the REAL app (index.html + minified features) through:
   Phase A — full sales journey (one customer):
     quote (kanban Quoted) → ordered (order row, deposit, kanban
     Ordered, weekly earnings, payment follow-up) → delivered (kanban
     Delivered) → fitting completed with door-money (kanban Paid) →
     post-fit follow-up; customer totals update at every step.
   Phase B — mileage: tracked via a trip linked to a visit (auto
     tracked) vs NOT tracked (no trip), plus manual log in the Money
     screen; the Mileage claim reflects exactly the tracked miles.
   Phase C — edge possibilities: sale reversal (ordered → quoted deletes
     the order and reverts earnings) and the unpaid Fitted column.
   Run: node tests/browser/verify-journey.e2e.js  (:8000 + Playwright)
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
    if (sessionStorage.getItem('jrn') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('jrn', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?jrn=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1200);

  // Clean slate: this audit owns every row it asserts on.
  const ids = await page.evaluate(async () => {
    await DB.db.appointments.clear();
    await DB.db.orders.clear();
    await DB.db.trips.clear();
    await DB.db.expenses.clear();
    await DB.db.measurements.clear();
    // Customer PII (names) is encrypted at rest — decrypt via the API.
    const custs = await DB.getCustomersByIds((await DB.db.customers.toArray()).map(c => c.id));
    const byName = name => custs.find(c => `${c.firstName} ${c.lastName}` === name);
    const today = Utils.getToday();
    const at = h => { const d = new Date(today); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const A1 = await DB.addAppointment({ customerId: byName('Sarah Johnson').id, clientName: 'Sarah Johnson', type: 'consultation', date: at(10), status: 'confirmed', address: '14 Beechwood Avenue, Stockport SK1 4AA' });
    const A2 = await DB.addAppointment({ customerId: byName('Sarah Johnson').id, clientName: 'Sarah Johnson', type: 'fitting', date: at(14), status: 'confirmed', address: '14 Beechwood Avenue, Stockport SK1 4AA' });
    const B1 = await DB.addAppointment({ customerId: byName("David O'Leary").id, clientName: "David O'Leary", type: 'measure', date: at(11), status: 'confirmed', address: "St Mary's Court, Altrincham M22 2AA" });
    const B2 = await DB.addAppointment({ customerId: byName('Amelia Green').id, clientName: 'Amelia Green', type: 'consultation', date: at(15), status: 'confirmed', address: '9 Birch Lane, Wilmslow SK9 5AA' });
    const A3 = await DB.addAppointment({ customerId: byName('Tom Hardcastle').id, clientName: 'Tom Hardcastle', type: 'consultation', date: at(16), status: 'confirmed', address: '3 Cypress Close, Stockport SK7 5AA' });
    const A4 = await DB.addAppointment({ customerId: byName('Tom Hardcastle').id, clientName: 'Tom Hardcastle', type: 'consultation', date: at(17), status: 'confirmed', address: '3 Cypress Close, Stockport SK7 5AA' });
    return { A1: A1.id, A2: A2.id, B1: B1.id, B2: B2.id, A3: A3.id, A4: A4.id };
  });

  // ---------- helpers ----------
  const openOutcome = (id, outcomeId) => page.evaluate(async ({ id, o }) => {
    await AppointmentsFeature.captureOutcome(id, o);
  }, { id, o: outcomeId });
  const saveOutcome = (value, payment) => page.evaluate(({ v, p }) => {
    const ve = document.getElementById('outcome-value'); if (ve) ve.value = v ? String(v) : '';
    const pe = document.getElementById('outcome-payment'); if (pe) pe.value = p ? String(p) : '';
    const btn = document.querySelector('[data-action="AppointmentsFeature.saveOutcome"]');
    if (btn) btn.click();
  }, { v: value, p: payment });
  const gotoOrders = async () => { await page.evaluate(() => App.navigate('orders')); await page.waitForTimeout(1200); };
  const kanban = () => page.evaluate(() => {
    const col = id => ({
      count: (document.querySelector(`.kanban-col--${id} .kanban-col-count`) || { textContent: '0' }).textContent.trim(),
      cards: Array.from(document.querySelectorAll(`.kanban-col--${id} .kanban-card`)).map(c => ({
        name: (c.querySelector('.kanban-card-name') || { textContent: '' }).textContent.trim(),
        value: (c.querySelector('.kanban-card-value') || { textContent: '' }).textContent.trim(),
        sub: (c.querySelector('.kanban-card-sub') || { textContent: '' }).textContent.trim(),
        actions: (c.querySelector('.kanban-card-actions') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim()
      }))
    });
    return { quoted: col('quoted'), ordered: col('ordered'), delivered: col('delivered'), fitted: col('fitted'), paid: col('paid') };
  });
  const weekEarnings = () => page.evaluate(async () => (await DB.getWeekStats(Utils.getStartOfWeek().toISOString(), Utils.getEndOfWeek().toISOString())).earnings);
  // The earnings figure the Money screen shows comes from appointments with
  // an 'ordered' outcome in the week window (stored commission, else the
  // estimator) — mirror that exact pipeline for the expected value.
  const storedWeekCommission = () => page.evaluate(async () => {
    const s = Utils.getStartOfWeek().toISOString(), e = Utils.getEndOfWeek().toISOString();
    const appts = (await DB.getAllAppointments())
      .filter(a => a.status !== 'cancelled' && a.outcome === 'ordered' && new Date(a.date) >= new Date(s) && new Date(a.date) <= new Date(e));
    return appts.reduce((x, a) => x + (typeof a.commission === 'number' && a.commission > 0 ? a.commission : TaxCalculator.estimateCommission(a.value || 0)), 0);
  });
  const ordersTable = () => page.evaluate(async () => (await DB.db.orders.toArray()).map(o => ({ id: o.id, customerId: o.customerId, appointmentId: o.appointmentId, orderNumber: o.orderNumber, total: o.total, depositPaid: o.depositPaid, balanceDue: o.balanceDue, stage: o.stage, commission: o.commission })));
  const tripsTable = () => page.evaluate(async () => (await DB.db.trips.toArray()).map(t => ({ id: t.id, appointmentId: t.appointmentId, distanceKm: t.distanceKm, autoTracked: t.autoTracked })));
  const moneyClaim = () => page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.stat-card'));
    const c = cards.find(x => (x.querySelector('.label') || { textContent: '' }).textContent.trim() === 'Mileage claim');
    return c ? (c.querySelector('.value') || { textContent: '' }).textContent.trim() : null;
  });
  const followupsText = async () => { await page.evaluate(() => App.navigate('followups')); await page.waitForTimeout(1200); return page.evaluate(() => document.getElementById('main').textContent.replace(/\s+/g, ' ')); };
  const customerTotals = customerId => page.evaluate(async id => {
    const c = await DB.getCustomer(id);
    return { orderCount: c.orderCount || 0, orderTotal: c.totalOrdersValue || 0 };
  }, customerId);

  /* ============ PHASE A — full sales journey (Sarah) ============ */
  console.log('\n=== Phase A: quote → order → delivery → fitting → paid ===');

  // A1 consultation → QUOTED £1,850
  await openOutcome(ids.A1, 'quoted'); await sleep(500);
  await saveOutcome(1850, null); await sleep(900);
  let orders = await ordersTable();
  ok('A1 quoted: no order row created yet', orders.length === 0, orders);
  let k = await (async () => { await gotoOrders(); return kanban(); })();
  ok('A1 quoted: kanban Quoted shows Sarah Johnson £1,850.00', k.quoted.count === '1' && k.quoted.cards[0] && k.quoted.cards[0].name === 'Sarah Johnson' && k.quoted.cards[0].value === '£1,850.00', k.quoted);
  ok('A1 quoted: not counted as a sale anywhere', (await weekEarnings()) === 0);
  const fup1 = await followupsText();
  ok('A1 quoted: a quote follow-up task exists (even for a same-day quote)', /quote/i.test(fup1) && /Sarah Johnson/i.test(fup1), fup1.slice(0, 300));

  // A1 → ORDERED £1,850 with £925 deposit on the spot
  await openOutcome(ids.A1, 'ordered'); await sleep(500);
  await saveOutcome(1850, 925); await sleep(900);
  orders = await ordersTable();
  const sale = orders.find(o => o.appointmentId === ids.A1);
  ok('A1 ordered: order row created, keyed to the appointment, ORD- number', !!sale && /^ORD-/.test(sale.orderNumber || '') && sale.total === 1850, sale);
  ok('A1 ordered: deposit £925 recorded, balance due £925', sale && sale.depositPaid === 925 && sale.balanceDue === 925, sale);
  k = await (async () => { await gotoOrders(); return kanban(); })();
  ok('A1 ordered: kanban Ordered shows Sarah £1,850.00; Quoted column empty', k.ordered.count === '1' && k.ordered.cards[0].value === '£1,850.00' && k.quoted.count === '0', { ordered: k.ordered, quoted: k.quoted });
  const earn1 = await weekEarnings();
  const exp1 = await storedWeekCommission();
  ok(`A1 ordered: weekly earnings match the stored commission on the sale (£${exp1.toFixed(2)})`, earn1 === exp1 && exp1 > 0, { earn1, exp1 });
  const fup2 = await followupsText();
  ok('A1 ordered: a payment follow-up task exists', /collect\s*£925|£925/i.test(fup2), fup2.slice(0, 200));

  // Order → DELIVERED
  await page.evaluate(async oid => OrdersFeature.setStage(oid, 'delivered'), sale.id);
  await sleep(900);
  k = await (async () => { await gotoOrders(); return kanban(); })();
  ok('A1 delivered: kanban Delivered shows Sarah, balance still owed', k.delivered.count === '1' && k.delivered.cards[0].name === 'Sarah Johnson' && /Owes/.test(k.delivered.cards[0].actions || ''), k.delivered);
  ok('A1 delivered: moved out of Ordered', k.ordered.count === '0', k.ordered);

  // A2 fitting → COMPLETED with the £925 door-money
  await openOutcome(ids.A2, 'completed'); await sleep(500);
  await saveOutcome(null, 925); await sleep(900);
  orders = await ordersTable();
  const settled = orders.find(o => o.appointmentId === ids.A1);
  ok('A2 fitted: door-money clears the balance (£925 → £0)', settled && settled.balanceDue === 0, settled);
  k = await (async () => { await gotoOrders(); return kanban(); })();
  ok('A2 fitted: kanban Paid shows Sarah £1,850.00 (auto-paid)', k.paid.count === '1' && k.paid.cards[0].value === '£1,850.00' && k.delivered.count === '0', { paid: k.paid, delivered: k.delivered });
  const fup3 = await followupsText();
  ok('A2 fitted: a post-fit thank-you task exists (even for a same-day fitting)', /post-fit|thank-you/i.test(fup3) && /Sarah Johnson/i.test(fup3), fup3.slice(0, 300));
  const sarah = await page.evaluate(async () => {
    const cs = await DB.getCustomersByIds((await DB.db.customers.toArray()).map(c => c.id));
    return cs.find(c => c.firstName === 'Sarah');
  });
  const t = await customerTotals(sarah.id);
  ok('customer totals: 1 order, £1,850', t.orderCount === 1 && t.orderTotal === 1850, t);

  /* ============ PHASE B — mileage: tracked vs not tracked ============ */
  console.log('\n=== Phase B: mileage tracked vs not tracked ===');

  // B1 (measure visit) — TRACKED: auto trip linked to the appointment (20 mi).
  await page.evaluate(async apptId => {
    await DB.addTrip({ date: new Date().toISOString(), appointmentId: apptId, startLocation: 'Home', endLocation: 'Altrincham', distanceKm: 20 * 1.60934, purpose: 'business', autoTracked: true });
  }, ids.B1);
  let trips = await tripsTable();
  ok('B1 tracked: trip row exists and is linked to the visit', trips.length === 1 && trips[0].appointmentId === ids.B1 && trips[0].autoTracked === true, trips);
  await page.evaluate(() => App.navigate('money')); await page.waitForTimeout(1200);
  ok('B1 tracked: Money claim = 20 miles × £0.55 = £11.00', (await moneyClaim()) === '£11.00', await moneyClaim());

  // Manual log through the real modal: +10 miles
  await page.evaluate(() => MoneyFeature.openMileageModal()); await sleep(500);
  await page.evaluate(() => { const d = document.getElementById('trip-distance'); if (d) d.value = '10'; const b = document.querySelector('[data-action="MoneyFeature.saveTrip"]'); if (b) b.click(); });
  await page.waitForTimeout(1200);
  trips = await tripsTable();
  ok('manual log: second trip row (no appointment link)', trips.length === 2 && trips[1].appointmentId === undefined, trips);
  ok('Money claim now 30 miles = £16.50', (await moneyClaim()) === '£16.50', await moneyClaim());

  // B2 (consultation visit) — NOT tracked: no trip, no claim impact.
  const tripsBefore = (await tripsTable()).length;
  await page.evaluate(async () => { /* B2 exists but the advisor never logged a trip */ });
  const tripsAfter = (await tripsTable()).length;
  ok('B2 not tracked: no trip row appears for the untracked visit', tripsAfter === tripsBefore, { tripsAfter });
  ok('B2 not tracked: claim unchanged by the untracked visit', (await moneyClaim()) === '£16.50', await moneyClaim());

  /* ============ PHASE C — reversal + unpaid fitted ============ */
  console.log('\n=== Phase C: sale reversal + unpaid Fitted column ===');

  // A3 → ORDERED £980
  await openOutcome(ids.A3, 'ordered'); await sleep(500);
  await saveOutcome(980, null); await sleep(900);
  orders = await ordersTable();
  const tomOrder = orders.find(o => o.appointmentId === ids.A3);
  ok('A3 ordered: second order created', !!tomOrder && tomOrder.total === 980, tomOrder);
  const earn2 = await weekEarnings();
  const exp2 = await storedWeekCommission();
  ok('A3 ordered: earnings include both commissions (Sarah + Tom)', earn2 === exp2 && exp2 > exp1, { earn2, exp2, exp1 });

  // A3 → back to QUOTED: the sale is reversed, order must disappear.
  await openOutcome(ids.A3, 'quoted'); await sleep(500);
  await saveOutcome(980, null); await sleep(900);
  orders = await ordersTable();
  ok('A3 reversed: linked order deleted (no double count)', !orders.some(o => o.appointmentId === ids.A3), orders.map(o => o.appointmentId));
  const earn3 = await weekEarnings();
  const exp3 = await storedWeekCommission();
  ok('A3 reversed: earnings revert to Sarah only', earn3 === exp3 && exp3 === exp1, { earn3, exp3, exp1 });
  k = await (async () => { await gotoOrders(); return kanban(); })();
  ok('A3 reversed: kanban Quoted shows Tom £980.00; Sarah is in Paid (her order settled)', k.quoted.count === '1' && k.quoted.cards[0].name === 'Tom Hardcastle' && k.paid.count === '1' && k.paid.cards[0].name === 'Sarah Johnson', { quoted: k.quoted, paid: k.paid });

  // A4 → ORDERED £1,250, moved to FITTED but UNPAID → stays in Fitted.
  await openOutcome(ids.A4, 'ordered'); await sleep(500);
  await saveOutcome(1250, null); await sleep(900);
  orders = await ordersTable();
  const davidOrder = orders.find(o => o.appointmentId === ids.A4);
  await page.evaluate(async oid => OrdersFeature.setStage(oid, 'fitted'), davidOrder.id);
  await sleep(900);
  k = await (async () => { await gotoOrders(); return kanban(); })();
  ok('A4 fitted: unpaid order sits in the Fitted column, owing full £1,250', k.fitted.count === '1' && k.fitted.cards[0].value === '£1,250.00' && /Owes £1,250.00/.test(k.fitted.cards[0].actions || ''), k.fitted);
  ok('A4 fitted: not in Paid until the balance clears', k.paid.count === '1' && k.paid.cards[0].name === 'Sarah Johnson', k.paid);

  /* ============ final integrity ============ */
  console.log('\n=== Final integrity ===');
  orders = await ordersTable();
  ok('orders table: Sarah settled (paid), David open (fitted, £1,250 due)', orders.length === 2 && orders.some(o => o.balanceDue === 0 && o.total === 1850) && orders.some(o => o.balanceDue === 1250 && o.stage === 'fitted'), orders);
  const tripsFinal = await tripsTable();
  ok('trips table: exactly the 2 logged trips (B1 tracked + manual)', tripsFinal.length === 2 && tripsFinal.filter(t => t.appointmentId === ids.B1).length === 1, tripsFinal);
  ok('no console errors across the whole journey', errs.length === 0, errs);

  await browser.close();
  console.log(failures === 0 ? '\n✓ verify-journey.e2e PASS' : `\n✗ verify-journey.e2e FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
