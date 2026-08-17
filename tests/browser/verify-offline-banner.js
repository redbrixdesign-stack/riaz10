#!/usr/bin/env node
/* ============================================
   ADVISOROS — OFFLINE BANNER VERIFICATION (perf 5.5)
   The persistent offline strip must appear when the connection drops and
   clear when it returns — including a fresh OFFLINE launch (navigator.onLine
   is already false at boot, before any 'offline' event can fire).
   Run: node tests/browser/verify-offline-banner.js  (needs :8000 + Playwright)
   ============================================ */
'use strict';
const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';
let failures = 0;
const ok = (label, cond, extra) => { console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const bannerVisible = page => page.evaluate(() => {
  const b = document.getElementById('offline-banner');
  return !!b && b.style.display === 'flex' && b.textContent.includes('Offline');
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  // Seed first (needs network), then load the app online.
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?off=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  ok('online: banner is hidden', !(await bannerVisible(page)));

  // Drop the connection → banner must appear immediately (offline event).
  await ctx.setOffline(true);
  await page.waitForTimeout(800);
  ok('going offline: banner appears', await bannerVisible(page));

  // Restore → banner clears + Back online toast.
  await ctx.setOffline(false);
  await page.waitForTimeout(800);
  ok('back online: banner clears', !(await bannerVisible(page)));

  // Fresh OFFLINE launch: reload while offline — boot must still show the strip.
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  ok('fresh offline launch: banner appears at boot (SW serves the shell)', await bannerVisible(page));
  const shell = await page.evaluate(() => ({
    hasNav: !!document.querySelector('#bottom-nav .nav-item'),
    hasMain: document.getElementById('main').innerHTML.length > 100
  }));
  ok('offline launch still boots the full app shell', shell.hasNav && shell.hasMain, shell);
  await ctx.setOffline(false);

  await browser.close();
  console.log(failures === 0 ? '\nOFFLINE BANNER VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('OFFLINE BANNER FAILED:', e); process.exit(1); });
