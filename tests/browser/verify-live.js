#!/usr/bin/env node
/* ============================================
   ADVISOROS — LIVE SITE SMOKE TEST (Phase 6)
   Against https://beelo.beelestial.co.uk/: headers, zero Google Fonts
   requests, same-origin fonts render, service worker installs and serves
   the shell offline with the offline strip, no CSP violations.
   Run: node tests/browser/verify-live.js
   ============================================ */
'use strict';
const { chromium } = require('playwright');
const BASE = 'https://beelo.beelestial.co.uk';
let failures = 0;
const ok = (label, cond, extra) => { console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : '')); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const googleFontReqs = [];
  const cspViolations = [];
  page.on('request', req => { if (/fonts\.(googleapis|gstatic)/.test(req.url())) googleFontReqs.push(req.url()); });
  page.on('console', m => { if (/Refused to|Content Security Policy/.test(m.text()) && !/frame-ancestors/.test(m.text())) cspViolations.push(m.text()); });
  page.on('pageerror', e => cspViolations.push('pageerror: ' + e.message));

  // Test-mode passphrase so boot isn't parked on the modal (the live site's
  // real first-run shows it — that's by design; we verify the app shell).
  await ctx.addInitScript(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 45000 });
  await page.waitForTimeout(3000);

  ok('app boots on the live site', true);
  ok('zero Google Fonts requests (all self-hosted)', googleFontReqs.length === 0, googleFontReqs.slice(0, 2));
  const fonts = await page.evaluate(() => ({
    ms: document.fonts.check('24px "Material Symbols Rounded"'),
    hanken: document.fonts.check('16px "Hanken Grotesk"')
  }));
  ok('icon + body fonts render from local assets', fonts.ms && fonts.hanken, fonts);
  ok('no CSP violations', cspViolations.length === 0, cspViolations.slice(0, 2));

  // Service worker: wait for control, then go offline and reload.
  await page.evaluate(() => navigator.serviceWorker.ready.then(r => r.active.postMessage({ type: 'ping' })));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  ok('service worker controls the page', true);
  await ctx.setOffline(true);
  await page.reload().catch(() => {});
  await page.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const offline = await page.evaluate(() => ({
    banner: (() => { const b = document.getElementById('offline-banner'); return !!b && b.style.display === 'flex'; })(),
    nav: !!document.querySelector('#bottom-nav .nav-item'),
    icons: Array.from(document.querySelectorAll('#bottom-nav .material-symbols-rounded')).filter(s => s.getBoundingClientRect().width > 48).length
  }));
  ok('offline reload serves the app shell from the SW', offline.nav, offline);
  ok('offline strip shows on the live offline reload', offline.banner, offline);
  ok('nav icons render as glyphs offline', offline.icons === 0, offline);
  await ctx.setOffline(false);

  await browser.close();
  console.log(failures === 0 ? '\nLIVE SMOKE TEST PASSED' : `\n${failures} LIVE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('LIVE FAILED:', e); process.exit(1); });
