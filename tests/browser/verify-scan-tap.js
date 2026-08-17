#!/usr/bin/env node
/* ============================================
   ADVISOROS — SCAN TAP + OCR FLOW VERIFICATION
   Regression for the "scan button is dead" report:
   1. Add Visit → "Scan customer details" opens the Scan screen.
   2. Tapping "Take Photo" (a data-file button with NO data-action) must
      actually fire the hidden file input — the delegated router used to
      only match [data-action], silently swallowing every data-file tap
      since the 4.6 migration (file picker never opened).
   3. After picking a file, the OCR pipeline must run without the CSP
      blob-worker block (worker-src 'self' blob:) and land on a result
      or manual-entry state — never hang.
   Run: node tests/browser/verify-scan-tap.js   (needs :8000 + Playwright)
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
    if (sessionStorage.getItem('scan_fresh') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('scan_fresh', '1');
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => {
    if (/Creating a worker|violates the following Content Security/.test(m.text())) pageErrors.push(m.text().slice(0, 140));
    if (m.type() === 'error' && /Uncaught|ReferenceError|TypeError/.test(m.text())) pageErrors.push(m.text().slice(0, 140));
  });

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?scan=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });

  // Add Visit → Scan customer details
  await page.evaluate(() => App.navigate('appointments', { action: 'add' }));
  await page.waitForTimeout(900);
  await page.click('[data-action="App.navigate"][data-args*="ocr"]');
  await page.waitForFunction(() => App.currentHash === 'ocr', null, { timeout: 10000 });
  await page.waitForTimeout(800);
  ok('Scan screen opens from Add Visit', true);

  // Instrument the hidden input so we can prove the button's tap reaches it.
  await page.evaluate(() => {
    const input = document.getElementById('ocr-input');
    window.__ocrClicks = 0;
    input.addEventListener('click', () => { window.__ocrClicks++; });
  });

  // Tap the Take Photo button (data-file, NO data-action) — the reported dead tap.
  await page.click('[data-file="ocr-input"]');
  await page.waitForTimeout(400);
  const clicked = await page.evaluate(() => window.__ocrClicks);
  ok('tapping Take Photo fires the hidden file input (router data-file path)', clicked >= 1, { clicks: clicked });

  // Drive the real change event with a tiny PNG (no text → empty extraction
  // is fine; the point is the pipeline runs and doesn't hang or CSP-crash).
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#ocr-input', { name: 'shot.png', mimeType: 'image/png', buffer: tinyPng });

  // The Tesseract fallback loads from the CDN and runs in a blob worker —
  // wait for either a result, manual entry, or the 30s engine-wait to give
  // up, then assert we LANDED somewhere sane.
  await page.waitForFunction(() => {
    const result = document.getElementById('ocr-result');
    const manual = document.getElementById('ocr-manual');
    return (result && result.style.display === 'block') || (manual && manual.style.display === 'block');
  }, null, { timeout: 60000 });
  const state = await page.evaluate(() => ({
    result: document.getElementById('ocr-result')?.style.display,
    manual: document.getElementById('ocr-manual')?.style.display,
    loading: document.getElementById('ocr-loading')?.style.display,
    tesseract: typeof Tesseract !== 'undefined' ? 'loaded' : 'not-loaded'
  }));
  ok('OCR pipeline lands on a result or manual-entry state (no hang)', state.result === 'block' || state.manual === 'block', state);

  const cspBlocks = pageErrors.filter(e => /Creating a worker|violates the following Content Security/.test(e));
  ok('no CSP blob-worker blocks (worker-src allows Tesseract)', cspBlocks.length === 0, cspBlocks.slice(0, 2));
  const runtime = pageErrors.filter(e => !/Creating a worker|violates the following Content Security/.test(e));
  ok('no runtime errors in the scan flow', runtime.length === 0, runtime);

  await browser.close();
  console.log(failures === 0 ? '\nSCAN TAP VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('SCAN TAP FAILED:', e); process.exit(1); });
