#!/usr/bin/env node
/* LIVE iOS PWA config verification after deploy (fix/ios-home-screen-pwa).
   Checks the deployed manifest, head metadata, SW precache and new icons,
   then simulates a fresh standalone install + offline relaunch. */
'use strict';
const { chromium } = require('playwright');
const BASE = 'https://beelo.beelestial.co.uk';
let failures = 0;
const ok = (l, c, x) => { console.log((c ? '  OK   ' : '  FAIL ') + l + (!c && x ? ' — ' + JSON.stringify(x) : '')); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const manifest = await (await fetch(BASE + '/manifest.json')).json();
  ok('live: background_color is dark #0A0A0A', (manifest.background_color || '').toLowerCase() === '#0a0a0a', manifest.background_color);
  ok('live: icons include purpose any + maskable', manifest.icons.some(i => (i.purpose || '').includes('any')) && manifest.icons.some(i => (i.purpose || '').includes('maskable')), manifest.icons.map(i => i.purpose).filter((v, i, a) => a.indexOf(v) === i));
  ok('live: display standalone + start_url ./', manifest.display === 'standalone' && manifest.start_url === './', { display: manifest.display, start: manifest.start_url });

  const sw = await (await fetch(BASE + '/sw.js')).text();
  const cacheName = (sw.match(/CACHE_NAME = '([^']+)'/) || [])[1];
  ok('live: SW CACHE_NAME updated (' + cacheName + ')', /advisoros-v6-50/.test(cacheName), cacheName);
  ok('live: SW precaches icons + 180 apple-touch-icon', /apple-touch-icon-180\.png/.test(sw) && /icon-512\.png/.test(sw));

  const html = await (await fetch(BASE + '/')).text();
  ok('live: apple-mobile-web-app-title + 180 icon + core.css?v=29', /apple-mobile-web-app-title/.test(html) && /apple-touch-icon-180\.png/.test(html) && /core\.css\?v=29/.test(html));

  for (const f of ['assets/icons/apple-touch-icon-180.png', 'assets/icons/icon-192-maskable.png', 'assets/icons/icon-512-maskable.png']) {
    const r = await fetch(BASE + '/' + f);
    ok('live: served ' + f, r.status === 200 && (r.headers.get('content-type') || '').includes('png'), r.status);
  }

  // Fresh standalone install simulation + offline relaunch
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    const mq = window.matchMedia.bind(window);
    window.matchMedia = (q) => { const r = mq(q); if (/(display-mode)/.test(q)) return { matches: q.includes('standalone'), media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, onchange: null, dispatchEvent(){ return false; } }; return r; };
    if (sessionStorage.getItem('lif') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('lif', '1');
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 45000 });
  await sleep(1200);
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} }).catch(() => {});
  const dm = await page.evaluate(() => matchMedia('(display-mode: standalone)').matches);
  ok('live: standalone display-mode honoured', dm);
  // offline relaunch (SW precache path)
  await page.evaluate(() => navigator.serviceWorker.ready.then(r => r.active.postMessage({ type: 'ping' })));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  await ctx.setOffline(true);
  await page.reload().catch(() => {});
  await page.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 45000 }).catch(() => {});
  await sleep(2500);
  const off = await page.evaluate(() => ({
    nav: !!document.querySelector('#bottom-nav .nav-item'),
    banner: (() => { const b = document.getElementById('offline-banner'); return !!b && b.style.display === 'flex'; })()
  }));
  ok('live: offline relaunch serves the shell (SW v50 precache)', off.nav && off.banner, off);
  await ctx.setOffline(false);

  await browser.close();
  console.log(failures === 0 ? '\nLIVE IOS CONFIG PASSED' : '\nLIVE IOS CONFIG FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('LIVE IOS FAILED:', e.message.slice(0, 180)); process.exit(1); });
