#!/usr/bin/env node
/* ============================================
   ADVISOROS — MODAL TYPING REGRESSION (P0 fix)
   The delegated router's closest('[data-action]') could match the modal
   overlay (data-action="App.closeModal" + data-close-backdrop) for
   non-click events, so typing in ANY bottom-sheet form input ran
   App.closeModal() twice per keystroke and the modal closed mid-entry.
   Fixed: data-close-backdrop elements now act only on backdrop clicks.

   Verifies:
   1. Typing in the expense modal keeps it open and the value persists.
   2. Saving the expense persists it in the DB.
   3. Typing in the order-sheet supplier-number input keeps it open.
   4. Editing the Talk preview textarea keeps it open.
   5. Backdrop click still closes the modal; sheet click does not.
   Run: node tests/browser/verify-modal-typing.js  (needs :8000 + Playwright)
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('mt') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('mt', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 120)); });
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 120)));

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?mt=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await sleep(1200);
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---- 1+2. Expense modal: type, stay open, save ---- */
  await page.evaluate(() => App.navigate('money'));
  await sleep(900);
  await page.evaluate(() => { const b = document.querySelector('[data-action="MoneyFeature.openExpenseModal"]'); if (b) b.click(); });
  await sleep(600);
  ok('expense modal opens', await page.evaluate(() => !!document.querySelector('.modal-overlay.active')));

  await page.locator('#expense-amount').click();
  await page.keyboard.type('12.50');
  await sleep(300);
  const amountState = await page.evaluate(() => ({
    open: !!document.querySelector('.modal-overlay.active'),
    value: document.getElementById('expense-amount') ? document.getElementById('expense-amount').value : 'GONE'
  }));
  ok('typing in the amount field keeps the modal open', amountState.open && amountState.value === '12.50', amountState);

  await page.locator('#expense-description').click();
  await page.keyboard.type('Audit modal typing');
  await sleep(300);
  const descState = await page.evaluate(() => ({
    open: !!document.querySelector('.modal-overlay.active'),
    value: document.getElementById('expense-description') ? document.getElementById('expense-description').value : 'GONE'
  }));
  ok('typing in the description field keeps the modal open', descState.open && /Audit modal typing/.test(descState.value || ''), descState);

  const c0 = await page.evaluate(async () => (await DB.db.expenses.toArray()).length);
  await page.evaluate(() => { const b = document.querySelector('[data-action="MoneyFeature.saveExpense"]'); if (b) b.click(); });
  await sleep(900);
  const c1 = await page.evaluate(async () => (await DB.db.expenses.toArray()).length);
  ok('expense saves (count ' + c0 + ' -> ' + c1 + ')', c1 === c0 + 1, { c0, c1 });
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});

  /* ---- 3. Order sheet supplier-number input ---- */
  await page.evaluate(() => App.navigate('orders'));
  await sleep(900);
  await page.locator('.kanban-card[data-action="OrdersFeature.openOrderSheet"]').first().click();
  await sleep(700);
  await page.locator('#order-supplier-number').click().catch(() => {});
  if (await page.locator('#order-supplier-number').count()) {
    await page.keyboard.type('SUP-4711');
    await sleep(300);
    const st = await page.evaluate(() => ({
      open: !!document.querySelector('.modal-overlay.active'),
      value: document.getElementById('order-supplier-number') ? document.getElementById('order-supplier-number').value : 'GONE'
    }));
    ok('typing the supplier number keeps the order sheet open', st.open && st.value === 'SUP-4711', st);
  } else {
    console.log('  (first order has no supplier-number field — skipped)');
  }
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});

  /* ---- 4. Talk preview textarea ---- */
  await page.evaluate(() => App.navigate('talk'));
  await sleep(900);
  await page.locator('[data-action="TalkFeature.sendMessage"]').first().click().catch(() => {});
  await sleep(700);
  if (await page.locator('#talk-message-preview').count()) {
    await page.locator('#talk-message-preview').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' — edited in preview');
    await sleep(300);
    const st = await page.evaluate(() => ({
      open: !!document.querySelector('.modal-overlay.active'),
      value: document.getElementById('talk-message-preview') ? document.getElementById('talk-message-preview').value.slice(-30) : 'GONE'
    }));
    ok('editing the message preview keeps it open', st.open && /edited in preview/.test(st.value || ''), st);
  } else {
    console.log('  (no talk template with a preview — skipped)');
  }
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});

  /* ---- 5. Backdrop click closes; sheet click does not ---- */
  await page.evaluate(() => App.navigate('money'));
  await sleep(800);
  await page.evaluate(() => { const b = document.querySelector('[data-action="MoneyFeature.openExpenseModal"]'); if (b) b.click(); });
  await sleep(500);
  await page.locator('#expense-amount').click();
  await sleep(200);
  const afterSheetClick = await page.evaluate(() => !!document.querySelector('.modal-overlay.active'));
  ok('clicking inside the sheet does not close it', afterSheetClick);
  await page.mouse.click(5, 120); // backdrop top-left
  await sleep(300);
  const afterBackdrop = await page.evaluate(() => !!document.querySelector('.modal-overlay.active'));
  ok('clicking the backdrop closes the modal', !afterBackdrop);

  const runtime = errs.filter(e => !/bad data-args/.test(e));
  ok('no console/page errors during modal typing (P0 fix clean)', runtime.length === 0, runtime);

  await browser.close();
  console.log(failures === 0 ? '\nMODAL TYPING REGRESSION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('MODAL TYPING FAILED:', e.message.slice(0, 200)); process.exit(1); });
