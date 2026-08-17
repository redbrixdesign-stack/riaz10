#!/usr/bin/env node
/* ============================================
   ADVISOROS — LAZY OCR LOAD VERIFICATION (perf 5.2)
   Tesseract (~1MB from unpkg) must NOT be fetched at app boot; it must
   only start loading when the user opens Scan. Also verifies the control
   tile still navigates and the screen renders.
   Run: node tests/browser/verify-lazyocr.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';
const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';
let failures = 0;
const ok = (label, cond, extra) => { console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : '')); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const tesseractRequests = [];
  page.on('request', req => { if (/tesseract/.test(req.url())) tesseractRequests.push(req.url()); });

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?lazy=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  ok('no Tesseract fetch during boot + 2.5s settle', tesseractRequests.length === 0, tesseractRequests);

  // Open Tools → Scan via the delegated router
  await page.evaluate(() => App.navigate('control'));
  await page.waitForTimeout(400);
  const tileCount = await page.evaluate(() => document.querySelectorAll('[data-action="App.navigate"][data-args*="ocr"]').length);
  ok('Tools screen shows the Scan tile', tileCount >= 1, tileCount);
  await page.click('[data-action="App.navigate"][data-args*="ocr"]');
  await page.waitForFunction(() => App.currentHash === 'ocr', null, { timeout: 10000 });
  await page.waitForTimeout(1500);

  ok('opening Scan triggers the Tesseract fetch', tesseractRequests.length >= 1, tesseractRequests.slice(0, 3));
  ok('Tesseract loads from unpkg.com (CSP allows it)', tesseractRequests[0] ? tesseractRequests[0].includes('unpkg.com') : false, tesseractRequests[0]);
  const screen = await page.evaluate(() => ({
    title: document.querySelector('.top-header-title, .sheet-header h3, h1')?.textContent || '',
    takePhotoBtn: !!document.querySelector('[data-file="ocr-input"]'),
    tesseractGlobal: typeof Tesseract !== 'undefined' ? (typeof Tesseract === 'object' ? 'object' : typeof Tesseract) : 'undefined'
  }));
  ok('Scan screen renders with Take Photo', screen.takePhotoBtn, screen);
  console.log('  info: Tesseract global after open =', screen.tesseractGlobal, '| requests =', tesseractRequests.length);

  await browser.close();
  console.log(failures === 0 ? '\nLAZY OCR VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('LAZY OCR FAILED:', e); process.exit(1); });
