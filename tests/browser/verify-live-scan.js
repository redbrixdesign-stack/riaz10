'use strict';
const { chromium } = require('playwright');
const BASE = 'https://beelo.beelestial.co.uk';
let failures = 0;
const ok = (l, c, x) => { console.log((c ? '  OK   ' : '  FAIL ') + l + (!c && x ? ' — ' + JSON.stringify(x) : '')); if (!c) failures++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('ls_f') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('ls_f', '1');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (/Creating a worker|violates.*Content Security/.test(m.text())) errs.push(m.text().slice(0, 120)); });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 45000 });
  await page.evaluate(() => App.navigate('appointments', { action: 'add' }));
  await page.waitForTimeout(900);
  await page.click('[data-action="App.navigate"][data-args*="ocr"]');
  await page.waitForFunction(() => App.currentHash === 'ocr', null, { timeout: 15000 });
  await page.evaluate(() => { const i = document.getElementById('ocr-input'); window.__c = 0; i.addEventListener('click', () => window.__c++); });
  await page.click('[data-file="ocr-input"]');
  await page.waitForTimeout(400);
  const clicks = await page.evaluate(() => window.__c);
  ok('live: tapping Take Photo fires the file input', clicks >= 1, { clicks });
  ok('live: zero CSP worker errors on the Scan screen', errs.length === 0, errs.slice(0, 2));
  await browser.close();
  console.log(failures === 0 ? '\nLIVE SCAN TAP CHECK PASSED' : '\nLIVE SCAN TAP CHECK FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('LIVE SCAN FAILED:', e.message.slice(0, 200)); process.exit(1); });
