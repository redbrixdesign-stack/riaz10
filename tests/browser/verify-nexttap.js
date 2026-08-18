#!/usr/bin/env node
/* ============================================
   ADVISOROS — NEXT CARD TAP VERIFICATION
   Proves the NEXT card body opens the visit-detail/
   outcome screen (id wiring), that Navigate/Call and
   the "More about this visit" disclosure stay
   independent, that no stray input sits in the card
   (keyboard symptom), and that the same-day and
   future-date cards both carry the correct visit id.
   Run: node tests/browser/verify-nexttap.js   (:8000 + Playwright)
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?nt=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('.comp-home-next-visit-main'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  // Defensive: no modal may block taps in this environment.
  await page.evaluate(() => App.closeModal({ all: true }));

  console.log('\n=== Same-day card ===');
  const s = await page.evaluate(() => {
    const main = document.querySelector('.comp-home-next-visit-main');
    return {
      isButton: main.tagName,
      action: main.getAttribute('data-action'),
      args: main.getAttribute('data-args'),
      strayInputs: document.querySelectorAll('.comp-home-next-visit input, .comp-home-next-visit-main input').length
    };
  });
  ok('info area is a <button> wired to the visit detail route (delegated action)', s.isButton === 'BUTTON' && s.action === 'App.navigate' && /\{\"id\":\d+\}/.test(s.args || ''), s);
  ok('no stray <input> in the card (keyboard symptom)', s.strayInputs === 0, s);

  await page.evaluate(() => document.querySelector('.comp-home-next-visit-main').click());
  await page.waitForTimeout(1500);
  const tap = await page.evaluate(() => ({
    hash: location.hash,
    outcomeActions: /Log outcome|Quoted|Ordered|Needs to think|Fact check/.test(document.getElementById('main').textContent),
    compInputFocused: document.activeElement && document.activeElement.id === 'comp-input'
  }));
  ok('card tap navigates to the visit detail (#appointments?id=…)', /#appointments\?id=\d+/.test(tap.hash), tap.hash);
  ok('detail screen renders outcome actions', tap.outcomeActions);
  ok('tapping the card does NOT focus the composer input', !tap.compInputFocused);

  console.log('\n=== Actions stay independent ===');
  await page.evaluate(() => App.navigate('today'));
  await page.waitForTimeout(2200);
  await page.evaluate(() => document.querySelector('.comp-home-cta--primary').click()); // Navigate
  await page.waitForTimeout(800);
  ok('Navigate does not open the visit detail (stays on Home)', await page.evaluate(() => location.hash === '#today'), await page.evaluate(() => location.hash));

  // The Call (ghost) button only exists when the featured visit has a
  // phone — it depends on which visit is featured, which is time-of-day
  // dependent. Guard the tap instead of assuming a phone exists.
  const hasGhost = await page.evaluate(() => !!document.querySelector('.comp-home-cta--ghost'));
  if (hasGhost) {
    await page.evaluate(() => document.querySelector('.comp-home-cta--ghost').click()); // Call
    await page.waitForTimeout(800);
    const call = await page.evaluate(() => ({
      hash: location.hash,
      modal: !!document.querySelector('.modal-overlay.active'),
      contact: /Contact/.test(document.getElementById('bottom-sheet')?.textContent || '')
    }));
    ok('Call opens the contact sheet, not the visit detail', call.hash === '#today' && call.modal && call.contact, call);
  } else {
    console.log('  [skip] featured visit has no phone — Call button not rendered (by design)');
  }
  await page.evaluate(() => App.closeModal({ all: true }));

  // "More about this visit" only exists when the visit carries notes/access
  // (conditional by design). When present it must expand without navigating.
  const hasMore = await page.evaluate(() => !!document.querySelector('.appt-more'));
  if (hasMore) {
    await page.evaluate(() => document.querySelector('.appt-more summary').click());
    await page.waitForTimeout(300);
    const det = await page.evaluate(() => ({ open: document.querySelector('.appt-more').open, hash: location.hash }));
    ok('"More about this visit" expands without navigating', det.open && det.hash === '#today', det);
  } else {
    console.log('  [skip] NEXT visit has no notes — expandable not rendered (by design)');
  }

  console.log('\n=== Future-date card carries the same correct id ===');
  // Wipe and keep only a tomorrow visit -> the NEXT card shows it with a date label.
  await page.evaluate(async () => {
    await DB.deleteAllData();
    const c = await DB.addCustomer({ firstName: 'Test', lastName: 'Tomorrow' });
    const d = new Date(Utils.getTomorrow().getTime() + (11 * 3600 + 15 * 60) * 1000).toISOString();
    const a = await DB.addAppointment({ customerId: c.id, clientName: 'Test Tomorrow', type: 'consultation', date: d, latLng: [53.4, -2.2] });
    window.__tid = a.id;
    App.navigate('today');
  });
  await page.waitForSelector('.comp-home-next-visit-main', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const future = await page.evaluate(() => {
    const main = document.querySelector('.comp-home-next-visit-main');
    return {
      action: main.getAttribute('data-action'),
      args: main.getAttribute('data-args'),
      dateLabel: /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/.test(document.querySelector('.comp-home-next-visit-time').textContent.trim())
    };
  });
  const tid = await page.evaluate(() => window.__tid);
  ok('future-date card shows the dated label and carries the real visit id', future.dateLabel && future.action === 'App.navigate' && future.args && future.args.includes(`"id":${tid}`), { future, tid });
  await page.evaluate(() => document.querySelector('.comp-home-next-visit-main').click());
  await page.waitForTimeout(1500);
  const hashAfter = await page.evaluate(() => location.hash);
  ok('future-date card tap opens the detail for that visit', hashAfter.includes('id=' + tid), hashAfter);

  await browser.close();
  console.log(failures === 0 ? '\nALL NEXT-TAP CHECKS PASSED' : `\n${failures} NEXT-TAP CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
