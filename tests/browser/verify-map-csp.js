#!/usr/bin/env node
/* ============================================
   ADVISOROS — LEAFLET MAP CSP VERIFICATION (perf 5.5)
   Marker icons must come from same-origin assets/img/ (CSP img-src has no
   unpkg allowance), so the route map renders markers with a clean console.
   Run: node tests/browser/verify-map-csp.js  (needs :8000 + Playwright)
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
  const consoleErrors = [];
  const imageRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('request', req => { if (/marker-icon|marker-shadow/.test(req.url())) imageRequests.push(req.url()); });

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?map=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });

  // Tools → Route (route.js init loads Leaflet lazily)
  await page.evaluate(() => App.navigate('control'));
  await page.waitForTimeout(300);
  await page.click('[data-action="App.navigate"][data-args*="route"]');
  await page.waitForFunction(() => typeof RouteFeature !== 'undefined' && RouteFeature.leafletLoaded === true && window.L, null, { timeout: 30000 });
  await page.waitForTimeout(3000);

  const defaults = await page.evaluate(() => ({
    imagePath: L.Icon.Default.imagePath,
    iconUrl: L.Icon.Default.prototype.options.iconUrl,
    iconRetinaUrl: L.Icon.Default.prototype.options.iconRetinaUrl,
    shadowUrl: L.Icon.Default.prototype.options.shadowUrl
  }));
  ok('marker icon config is same-origin + absolute (imagePath cleared)',
    defaults.imagePath === '' && defaults.iconUrl === '/assets/img/marker-icon.png' &&
    defaults.iconRetinaUrl === '/assets/img/marker-icon-2x.png' && defaults.shadowUrl === '/assets/img/marker-shadow.png', defaults);

  const mapState = await page.evaluate(() => ({ hasMap: !!document.getElementById('route-map') }));
  ok('route map element renders', mapState.hasMap, mapState);

  const remoteMarkerReqs = imageRequests.filter(u => !u.includes('localhost:8000') && /marker-icon|marker-shadow/.test(u));
  ok('zero marker-image requests to unpkg (all same-origin)', remoteMarkerReqs.length === 0, remoteMarkerReqs.slice(0, 3));
  const localMarkerReqs = imageRequests.filter(u => u.includes('localhost:8000') && /marker-icon|marker-shadow/.test(u));
  ok('marker images fetched from same-origin', localMarkerReqs.length >= 1, localMarkerReqs.slice(0, 3));

  // Exclude the benign 'frame-ancestors ignored in meta' notice.
  const cspBlocked = consoleErrors.filter(e => /Refused to load image/.test(e));
  ok('no CSP image violations while rendering the map', cspBlocked.length === 0, cspBlocked.slice(0, 3));

  await browser.close();
  console.log(failures === 0 ? '\nMAP CSP VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('MAP CSP FAILED:', e); process.exit(1); });
