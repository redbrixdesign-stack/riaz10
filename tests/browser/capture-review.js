#!/usr/bin/env node
/* ============================================
   ADVISOROS — FULL VISUAL REVIEW CAPTURE
   Seeds the demo dataset (seed-review.html) and captures every screen,
   tab, modal and state to screenshots/review/ with numbered names.

   Run: node tests/browser/capture-review.js   (needs :8000 + Playwright chromium)
   Output: screenshots/review/NN-name.png + manifest.json
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8000';
const OUT = path.join(__dirname, '..', '..', 'screenshots', 'review');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const shots = [];
const shot = async (page, name, description) => {
  await page.screenshot({ path: path.join(OUT, name) });
  shots.push({ file: name, description });
  console.log('  ✓', name, '—', description);
};
const full = async (page, name, description) => {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  shots.push({ file: name, description: description + ' (full page)' });
  console.log('  ✓', name, '—', description + ' (full page)');
};

const app = (page, id, params) => page.evaluate(([i, p]) => App.navigate(i, p || {}), [id, params]);
const bootWait = (page) => page.waitForFunction(
  () => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'),
  null, { timeout: 30000 }
);
const settle = (page, ms = 2200) => page.waitForTimeout(ms);

(async () => {
  const browser = await chromium.launch();

  /* ================= Profile A — full demo data ================= */
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const A = await ctxA.newPage();
  A.on('pageerror', e => console.log('  [pageerror]', e.message));

  await A.goto(BASE + '/tests/browser/seed-review.html');
  await A.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await A.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await A.goto(BASE + '/index.html?review=1');
  await bootWait(A);
  await settle(A);
  await A.evaluate(() => document.fonts.ready);

  // 01 Home — companion feed
  await shot(A, '01-home.png', 'Home: single appointment feed — NEXT featured card + rows, Attention, Ask Beelo');
  await full(A, '01-home-full.png', 'Home full page');

  // 27 Chat answer (rule-built, AI off) — drive the same handler the chip
  // onclick uses, without pointer-event fragility inside the nested scroller.
  await A.evaluate(() => CompanionFeature.send('follow-ups'));
  await A.waitForSelector('.comp-msg-ai', { timeout: 15000 });
  await settle(A, 1200);
  await shot(A, '27-chat-answer.png', 'Home chat after “Who should I chase?” — facts + actions + chips');

  // 19 My Day panel
  await A.evaluate(() => CompanionFeature.openMyDay());
  await A.waitForSelector('.bottom-sheet .hsc-root', { timeout: 15000 });
  await settle(A, 1500);
  await shot(A, '19-modal-my-day.png', 'My Day weekly calendar panel (bottom sheet)');
  await A.evaluate(() => { HomeScreenController.stopDynamicHomeScreen(); App.closeModal({ all: true }); });

  // 18 End of Day
  await A.evaluate(() => TodayFeature.openEODModal());
  await settle(A, 600);
  await shot(A, '18-modal-end-of-day.png', 'End of Day sheet');
  await A.evaluate(() => App.closeModal({ all: true }));

  // 02 Follow-ups
  await app(A, 'followups');
  await settle(A, 1800);
  await shot(A, '02-followups.png', 'Follow-ups inbox — due + later tasks');
  await full(A, '02-followups-full.png', 'Follow-ups full page');

  // 22 Message preview sheet — drive the same handler the inbox buttons use,
  // but pick a due task whose customer actually has a phone (sendMessage
  // bails with a toast when there's no number, so no sheet opens).
  await A.evaluate(async () => {
    const tasks = await App.features.get('followups').loadTasks();
    const t = tasks.find(x => x.due && x.template && (x.customer?.phone || x.appointment?.phone));
    if (t) await TalkFeature.sendMessage(t.appointment.id, t.template);
  });
  await A.waitForSelector('.modal-overlay.active', { timeout: 15000 });
  await settle(A, 1000);
  await shot(A, '22-modal-message-preview.png', 'Message preview sheet (composed draft + send)');
  await A.evaluate(() => App.closeModal({ all: true }));

  // 03 Orders kanban
  await app(A, 'orders');
  await settle(A, 1800);
  await shot(A, '03-orders.png', 'Orders kanban — Quoted/Ordered/Delivered/Fitted/Paid');

  // 20 Order sheet (order cards only — quoted cards navigate to the visit).
  // Drive the first order card's own delegated action via the DOM so a
  // lingering modal overlay can never intercept the pointer.
  await A.evaluate(() => {
    const card = document.querySelector('.kanban-card[data-action*="openOrderSheet"]');
    if (card) card.click();
  });
  await A.waitForSelector('.modal-overlay.active', { timeout: 15000 });
  await settle(A, 800);
  await shot(A, '20-modal-order-sheet.png', 'Order detail sheet (stage tracker + payment)');
  await A.evaluate(() => App.closeModal({ all: true }));

  // 04 Money
  await app(A, 'money');
  await settle(A, 1800);
  await shot(A, '04-money.png', 'Money — week/month earnings, expenses, mileage, tax');

  // 21 Expense modal
  await A.evaluate(() => MoneyFeature.openExpenseModal());
  await settle(A, 800);
  await shot(A, '21-modal-expense.png', 'Log expense sheet');
  await A.evaluate(() => App.closeModal({ all: true }));

  // 05 Tools
  await app(A, 'control');
  await settle(A, 1200);
  await shot(A, '05-tools.png', 'Tools hub tiles');

  // 24 Add visit — full-screen form (not a modal)
  await A.evaluate(() => App.navigate('appointments', { action: 'add' }));
  await A.waitForSelector('h1:has-text("New Visit")', { timeout: 15000 }).catch(() => {});
  await settle(A, 1000);
  await shot(A, '24-modal-add-visit.png', 'Add visit screen (full form)');

  // 06–10 Visits tabs
  await app(A, 'appointments', { tab: 'diary' });
  await settle(A, 1800);
  await shot(A, '06-visits-diary.png', 'Visits — Diary (month calendar + day list)');
  await full(A, '06-visits-diary-full.png', 'Visits Diary full page');

  // 23 Visit detail screen (outcome logging) — open the first diary visit
  await app(A, 'appointments', { tab: 'diary' });
  await settle(A, 1500);
  const visitId = await A.evaluate(() => {
    const m = document.body.innerHTML.match(/App\.navigate\('appointments', \{id: '(\d+)'\}\)/);
    return m ? m[1] : null;
  });
  if (visitId) {
    await app(A, 'appointments', { id: visitId });
    await settle(A, 1800);
    await shot(A, '23-modal-visit-outcome.png', 'Visit detail screen (outcome logging)');
    await app(A, 'appointments', { tab: 'diary' });
    await settle(A, 1200);
  } else {
    console.log('  ! no diary visit id found, skipping 23');
  }

  await app(A, 'appointments', { tab: 'upcoming' });
  await settle(A, 1200);
  await shot(A, '07-visits-upcoming.png', 'Visits — Upcoming tab');

  await app(A, 'appointments', { tab: 'pipeline' });
  await settle(A, 1200);
  await shot(A, '08-visits-pipeline.png', 'Visits — Follow-ups/pipeline tab (Hot/Warm/Cool)');

  await app(A, 'appointments', { tab: 'area' });
  await settle(A, 1200);
  await shot(A, '09-visits-area.png', 'Visits — Area search tab');

  await app(A, 'appointments', { tab: 'past' });
  await settle(A, 1200);
  await shot(A, '10-visits-past.png', 'Visits — Past tab');

  // 11 Route
  await app(A, 'route');
  await settle(A, 5000);
  await shot(A, '11-route.png', 'Route — map + day plan with legs');
  await full(A, '11-route-full.png', 'Route full page');

  // 12 Talk
  await app(A, 'talk');
  await settle(A, 1800);
  await shot(A, '12-talk.png', 'Talk — message queue/next messages');

  // 13 Measure
  await app(A, 'measure');
  await settle(A, 1200);
  await shot(A, '13-measure.png', 'Measure tool');

  // 14 Scan (OCR)
  await app(A, 'ocr');
  await settle(A, 1200);
  await shot(A, '14-scan.png', 'Scan/OCR screen');

  // 15 Settings
  await app(A, 'settings');
  await settle(A, 1200);
  await shot(A, '15-settings.png', 'Settings — profile/target/business');
  await full(A, '15-settings-full.png', 'Settings full page');

  // 16 Customer 360
  await app(A, 'customer', { id: 1 });
  await settle(A, 1800);
  await shot(A, '16-customer-360.png', 'Customer 360 — Sarah Johnson (quotes, order, measurements)');
  await full(A, '16-customer-360-full.png', 'Customer 360 full page');

  // 25 Edit customer modal
  const editBtn = A.locator('button[data-action*="openEditCustomerModal"]').first();
  await editBtn.click();
  await A.waitForSelector('.modal-overlay.active', { timeout: 10000 }).catch(() => {});
  await settle(A, 800);
  await shot(A, '25-modal-customer-edit.png', 'Edit customer sheet');
  await A.evaluate(() => App.closeModal({ all: true }));

  // 26 Photo viewer
  const photo = A.locator('[data-action*="openPhotoViewer"], .photo-tile').first();
  if (await photo.count()) {
    await photo.click();
    await A.waitForSelector('.modal-overlay.active', { timeout: 10000 }).catch(() => {});
    await settle(A, 800);
    await shot(A, '26-modal-photo-viewer.png', 'Photo viewer (bottom sheet)');
    await A.evaluate(() => App.closeModal({ all: true }));
  } else {
    console.log('  ! photo not found, skipping 26');
  }

  // 32 Offline banner
  await ctxA.setOffline(true);
  await A.reload();
  await bootWait(A).catch(() => {});
  await settle(A, 2000);
  await shot(A, '32-offline-banner.png', 'Home with offline banner');
  await ctxA.setOffline(false);

  // 36 Loading skeleton (CPU-throttled navigate)
  const cdp = await ctxA.newCDPSession(A);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await app(A, 'appointments', { tab: 'upcoming' });
  await A.waitForSelector('.skeleton-screen', { timeout: 8000 }).catch(() => {});
  await A.waitForTimeout(400);
  await shot(A, '36-loading-skeleton.png', 'Loading skeleton (CPU throttled)');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // 33/34 responsive widths (same profile, resize + reload)
  await A.setViewportSize({ width: 320, height: 568 });
  await A.reload();
  await bootWait(A).catch(() => {});
  await settle(A, 2200);
  await shot(A, '33-home-320px.png', 'Home at 320×568 (small phone)');

  await A.setViewportSize({ width: 430, height: 932 });
  await A.reload();
  await bootWait(A).catch(() => {});
  await settle(A, 2200);
  await shot(A, '34-home-430px.png', 'Home at 430×932 (large phone)');

  /* ================= Profile B — empty states + onboarding ================= */
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const B = await ctxB.newPage();
  B.on('pageerror', e => console.log('  [pageerror B]', e.message));

  // 17 Onboarding — completely fresh (no config, encryption test bypass)
  await B.addInitScript(() => localStorage.setItem('advisoros_enc_test', '1'));
  await B.goto(BASE + '/index.html?onboarding=1');
  await B.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'onboarding' && !!document.querySelector('#ob-name'), null, { timeout: 30000 });
  await settle(B, 1000);
  await shot(B, '17-onboarding.png', 'Onboarding — fresh profile first run');

  // Empty states — config only, no records
  await B.evaluate(() => {
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true, advisorName: 'Riaz Ahmed', weeklyTarget: 1800 }));
  });
  await B.goto(BASE + '/index.html?empty=1');
  await B.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await settle(B, 2200);
  await shot(B, '28-home-empty.png', 'Home — no visits, calm empty state');
  await app(B, 'followups');
  await settle(B, 1500);
  await shot(B, '29-followups-empty.png', 'Follow-ups — “All caught up” empty state');
  await app(B, 'orders');
  await settle(B, 1500);
  await shot(B, '30-orders-empty.png', 'Orders — empty kanban');
  await app(B, 'appointments', { tab: 'diary' });
  await settle(B, 1500);
  await shot(B, '31-visits-empty.png', 'Visits — empty diary');

  await browser.close();

  // ---- manifest ----
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(shots, null, 2));
  console.log(`\nDONE — ${shots.length} screenshots → ${path.relative(process.cwd(), OUT)}/`);
})().catch(e => { console.error('CAPTURE FAILED:', e); process.exit(1); });
