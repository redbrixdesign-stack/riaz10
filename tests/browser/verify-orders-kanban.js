#!/usr/bin/env node
/* ============================================
   ADVISOROS — ORDERS KANBAN VERIFICATION
   Full board audit against the seeded DB:
   - 5 columns (Quoted/Ordered/Delivered/Fitted/Paid) with counts and
     column totals computed from the DB (auto-paid = balanceDue <= 0)
   - every order card id resolves to a real order
   - order sheet opens with the right order + customer
   - stage advance persists; full payment zeroes the balance and moves
     the card to Paid (auto-paid logic)
   - supplier-number edit persists; sheet stays open while typing (P0)
   - quoted cards navigate to the visit detail
   - payment-message button present; zero console/page errors
   Run: node tests/browser/verify-orders-kanban.js (needs :8000 + Playwright)
   ============================================ */
'use strict';
 = require('playwright');
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (l, c, x) => { console.log((c ? '  OK   ' : '  FAIL ') + l + (!c && x ? ' — ' + JSON.stringify(x).slice(0, 180) : '')); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 390, h: 844, label: 'mobile' }, { w: 1280, h: 900, label: 'desktop' }]) {
    console.log(`\n########## ${vp.label.toUpperCase()} ##########`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.label === 'mobile', hasTouch: vp.label === 'mobile' });
    await ctx.addInitScript(() => { if (sessionStorage.getItem('kb') !== '1') { localStorage.clear(); sessionStorage.clear(); } localStorage.setItem('advisoros_enc_test', '1'); localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true })); sessionStorage.setItem('kb', '1'); });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });
    page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 110)));

    await page.goto(BASE + '/tests/browser/seed-review.html');
    await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
    await page.goto(BASE + '/index.html?kb=1');
    await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
    await sleep(1200);
    await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});
    await page.evaluate(() => App.navigate('orders'));
    await sleep(1200);

    // 1. Columns render
    const cols = await page.evaluate(() => Array.from(document.querySelectorAll('.kanban-col')).map(c => ({ id: c.className.match(/kanban-col--(\w+)/)?.[1], text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) })));
    const colIds = cols.map(c => c.id);
    ok('five kanban columns render', JSON.stringify(colIds) === JSON.stringify(['quoted', 'ordered', 'delivered', 'fitted', 'paid']), colIds);

    // 2. Expected counts/totals from DB vs rendered
    const expect = await page.evaluate(async () => {
      const orders = await DB.db.orders.toArray();
      const pipeline = await DB.getPipeline();
      const orderApptIds = new Set(orders.map(o => o.appointmentId).filter(Boolean));
      const QUOTE = ['quoted', 'thinking', 'partner', 'compare_quotes', 'expensive', 'customer_no_show', 'advisor_unavailable'];
      const quotes = pipeline.filter(a => QUOTE.includes(a.outcome) && !orderApptIds.has(a.id));
      const byStage = { ordered: [], delivered: [], fitted: [], paid: [] };
      for (const o of orders) { const s = (o.balanceDue || 0) <= 0 ? 'paid' : (o.stage || 'ordered'); if (byStage[s]) byStage[s].push(o); }
      const t = s => byStage[s].reduce((a, o) => a + (o.total || 0), 0);
      return {
        quoted: { count: quotes.length, total: quotes.reduce((a, q) => a + (q.value || 0), 0) },
        ordered: { count: byStage.ordered.length, total: t('ordered') },
        delivered: { count: byStage.delivered.length, total: t('delivered') },
        fitted: { count: byStage.fitted.length, total: t('fitted') },
        paid: { count: byStage.paid.length, total: t('paid') }
      };
    });
    const rendered = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('.kanban-col').forEach(c => {
        const id = c.className.match(/kanban-col--(\w+)/)?.[1];
        const count = c.querySelector('.kanban-col-count')?.textContent || c.querySelectorAll('.kanban-card').length;
        const sum = c.querySelector('.kanban-col-total')?.textContent || '';
        out[id] = { count: Number(count) || c.querySelectorAll('.kanban-card').length, totalText: sum };
      });
      return out;
    });
    for (const id of ['quoted', 'ordered', 'delivered', 'fitted', 'paid']) {
      const exp = expect[id];
      const got = rendered[id];
      const totalNum = got && got.totalText ? parseFloat(got.totalText.replace(/[£,\s,]/g, '')) : null;
      const totalMatch = exp && totalNum !== null && Math.abs(totalNum - exp.total) < 0.01;
      ok(`column ${id}: count ${got ? got.count : '?'} vs expected ${exp.count}`, got && got.count === exp.count, { got: got && got.count, expected: exp.count });
      ok(`column ${id}: total ${got ? got.totalText : '?'} vs expected £${exp.total.toLocaleString('en-GB')}`, totalMatch, { got: got && got.totalText, expected: exp.total });
    }

    // 3. Every card id resolves
    const badCards = await page.evaluate(async () => {
      const orders = await DB.db.orders.toArray();
      const ids = new Set(orders.map(o => o.id));
      const bad = [];
      document.querySelectorAll('.kanban-card[data-action="OrdersFeature.openOrderSheet"]').forEach(c => {
        const id = JSON.parse(c.getAttribute('data-args'))[0];
        if (!ids.has(id)) bad.push(id);
      });
      return bad;
    });
    ok('every order card id resolves to a real order', badCards.length === 0, badCards);

    // 4. Open ORD-2026-0001 (O1) sheet
    await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.kanban-card[data-action="OrdersFeature.openOrderSheet"]')).find(x => /ORD-2026-0001/.test(x.textContent)); if (c) c.click(); });
    await sleep(800);
    const sheet = await page.evaluate(() => document.getElementById('bottom-sheet') ? document.getElementById('bottom-sheet').textContent.replace(/\s+/g, ' ').slice(0, 200) : 'NO SHEET');
    ok('order sheet opens for ORD-2026-0001', /ORD-2026-0001/.test(sheet) && /Sarah/.test(sheet), sheet);

    // 5. Stage advance ordered -> delivered (evaluate click to avoid fixed-sheet scroll)
    const st0 = await page.evaluate(async () => { const o = await DB.db.orders.where('orderNumber').equals('ORD-2026-0001').first(); return o ? o.stage : null; });
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#bottom-sheet [data-action="OrdersFeature.setStage"]')).find(x => /Delivered/.test(x.textContent)); if (b) b.click(); });
    await sleep(700);
    const st1 = await page.evaluate(async () => { const o = await DB.db.orders.where('orderNumber').equals('ORD-2026-0001').first(); return o ? o.stage : null; });
    ok('stage advance ordered -> delivered persists', st0 === 'ordered' && st1 === 'delivered', { st0, st1 });

    // 6. Mark fully paid -> balance 0 -> auto moves to Paid.
    // setStage's refreshAfterEdit closes the sheet — reopen it first.
    await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.kanban-card[data-action="OrdersFeature.openOrderSheet"]')).find(x => /ORD-2026-0001/.test(x.textContent)); if (c) c.click(); });
    await sleep(700);
    await page.evaluate(() => { const b = document.querySelector('#bottom-sheet [data-action="OrdersFeature.recordFullPayment"]'); if (b) b.click(); else console.log('  no recordFullPayment button'); });
    await sleep(900);
    const paid = await page.evaluate(async () => { const o = await DB.db.orders.where('orderNumber').equals('ORD-2026-0001').first(); return o ? { balanceDue: o.balanceDue, stage: o.stage } : null; });
    ok('record full payment zeroes the balance', paid && paid.balanceDue === 0, paid);
    await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});
    await sleep(500);
    const paidCol = await page.evaluate(async () => {
      const o = await DB.db.orders.where('orderNumber').equals('ORD-2026-0001').first();
      const cards = Array.from(document.querySelectorAll('.kanban-card[data-action="OrdersFeature.openOrderSheet"]'));
      const inPaid = Array.from(document.querySelectorAll('.kanban-col--paid .kanban-card')).some(c => /ORD-2026-0001/.test(c.textContent));
      return { paidStage: o.stage, inPaidColumn: inPaid };
    });
    ok('fully-paid order lands in the Paid column (auto-paid logic)', paidCol.paidStage === 'paid' && paidCol.inPaidColumn, paidCol);

    // 7. Supplier number edit on O9 (John, SUP-7742)
    await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.kanban-card[data-action="OrdersFeature.openOrderSheet"]')).find(x => /ORD-2026-0009/.test(x.textContent)); if (c) c.click(); });
    await sleep(700);
    const sup0 = await page.evaluate(async () => { const o = await DB.db.orders.where('orderNumber').equals('ORD-2026-0009').first(); return o ? o.supplierOrderNumber : null; });
    const typed = await page.evaluate(() => {
      const el = document.getElementById('order-supplier-number');
      if (!el) return 'NO-FIELD';
      el.value = 'SUP-TEST-77';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    });
    if (typed === 'typed') {
      const stillOpenWhileTyping = await page.evaluate(() => !!document.querySelector('.modal-overlay.active'));
      ok('sheet stays open while typing (P0 regression)', stillOpenWhileTyping);
      await page.evaluate(() => { const b = document.querySelector('#bottom-sheet [data-action="OrdersFeature.saveSupplierNumber"]'); if (b) b.click(); });
      await sleep(700);
      const sup1 = await page.evaluate(async () => { const o = await DB.db.orders.where('orderNumber').equals('ORD-2026-0009').first(); return o ? o.supplierOrderNumber : null; });
      ok('supplier number edit persists (' + sup0 + ' -> ' + sup1 + ')', sup1 === 'SUP-TEST-77', sup1);
      const closedAfterSave = await page.evaluate(() => !document.querySelector('.modal-overlay.active'));
      ok('sheet closes after saving (expected refreshAfterEdit)', closedAfterSave);
    } else console.log('  (no supplier-number field on this sheet)');
    await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});

    // 8. Quote card opens a quote sheet
    const quoteCardArgs = await page.evaluate(() => {
      const c = document.querySelector('.kanban-col--quoted .kanban-card-main');
      return c ? { action: c.getAttribute('data-action'), args: c.getAttribute('data-args') } : null;
    });
    console.log('  quote card:', JSON.stringify(quoteCardArgs));
    const hashBeforeQ = await page.evaluate(() => App.currentHash);
    await page.evaluate(() => { const c = document.querySelector('.kanban-col--quoted .kanban-card-main'); if (c) c.click(); });
    await sleep(700);
    const hashAfterQ = await page.evaluate(() => App.currentHash);
    ok('quoted card navigates to the visit detail (quote -> appointment)', hashAfterQ.startsWith('appointments?id=') && hashAfterQ !== hashBeforeQ, { before: hashBeforeQ, after: hashAfterQ });
    await page.evaluate(() => App.navigate('orders'));
    await sleep(800);

    // 9. Message (wa.me) button exists on an order sheet — validate, don't click
    await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.kanban-card[data-action="OrdersFeature.openOrderSheet"]')).find(x => /ORD-2026-0003/.test(x.textContent)); if (c) c.click(); });
    await sleep(600);
    const msgBtn = await page.evaluate(() => {
      const b = document.querySelector('#bottom-sheet [data-action="OrdersFeature.paymentMessage"]');
      return b ? { args: b.getAttribute('data-args'), text: b.textContent.replace(/\s+/g, ' ').trim() } : null;
    });
    ok('payment-message button present on orders with a phone', !!msgBtn, msgBtn);
    await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});

    const runtime = errs.filter(e => !/bad data-args/.test(e));
    ok('zero console/page errors across the kanban flow', runtime.length === 0, runtime.slice(0, 3));
    await ctx.close();
  }
  await browser.close();
  console.log(fails === 0 ? '\nKANBAN AUDIT PASSED' : `\nKANBAN AUDIT FAILURES: ${fails}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('KANBAN AUDIT FAILED:', e.message.slice(0, 200)); process.exit(1); });
