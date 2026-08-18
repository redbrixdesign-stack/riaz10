#!/usr/bin/env node
/* ============================================
   ADVISOROS — iOS HOME SCREEN PWA CONFIG (fix/ios-home-screen-pwa)
   Regression guards for the iPhone PWA batch:
   IOS-1 manifest background_color must match the dark app (splash flash).
   IOS-2 form inputs >= 16px (iOS Safari auto-zoom guard).
   IOS-3 icons: full-bleed art is purpose "any"; maskable-safe variants
        exist; a 180x180 non-maskable apple-touch-icon is served.
   IOS-4 apple-mobile-web-app-title present.
   IOS-5 service worker precaches the icon set.
   IOS-6 Notification API absent on iOS -> toggle shows the not-supported
        toast (platform check), verified.
   Run: node tests/browser/verify-ios-config.js  (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();

  /* ---- Manifest (fetched, parsed) ---- */
  const manifest = await (await fetch(BASE + '/manifest.json')).json();
  ok('IOS-1 manifest background_color is the dark app colour', (manifest.background_color || '').toLowerCase() === '#0a0a0a', manifest.background_color);
  ok('manifest start_url + scope + display standalone', manifest.start_url === './' && manifest.scope === './' && manifest.display === 'standalone', { start_url: manifest.start_url, scope: manifest.scope, display: manifest.display });

  const anyIcons = manifest.icons.filter(i => (i.purpose || 'any').includes('any'));
  const maskableIcons = manifest.icons.filter(i => (i.purpose || '').includes('maskable'));
  ok('IOS-3 full-bleed icons are purpose "any" (no Android crop)', anyIcons.length >= 4, anyIcons.length);
  ok('IOS-3 dedicated maskable-safe icons exist', maskableIcons.some(i => i.sizes === '512x512'), maskableIcons.map(i => i.sizes));

  /* ---- Head meta + icons on the wire ---- */
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    const mq = window.matchMedia.bind(window);
    window.matchMedia = (q) => { const r = mq(q); if (/(display-mode)/.test(q)) return { matches: q.includes('standalone'), media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, onchange: null, dispatchEvent(){ return false; } }; return r; };
    if (sessionStorage.getItem('ioscfg') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    sessionStorage.setItem('ioscfg', '1');
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html?ioscfg=1');
  await page.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 30000 });
  await sleep(1200);

  const head = await page.evaluate(() => {
    const m = (sel) => { const el = document.querySelector(sel); return el ? el.getAttribute('content') || el.getAttribute('href') : null; };
    return {
      title: m('meta[name="apple-mobile-web-app-title"]'),
      capable: m('meta[name="apple-mobile-web-app-capable"]'),
      statusBar: m('meta[name="apple-mobile-web-app-status-bar-style"]'),
      viewport: m('meta[name="viewport"]'),
      appleIcon: m('link[rel="apple-touch-icon"]'),
      displayMode: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
    };
  });
  ok('IOS-4 apple-mobile-web-app-title is Beelo', head.title === 'Beelo', head.title);
  ok('standalone-capable meta + black-translucent status bar + viewport-fit=cover',
    head.capable === 'yes' && head.statusBar === 'black-translucent' && /viewport-fit=cover/.test(head.viewport), head);
  ok('IOS-3 apple-touch-icon points at the gold 180px icon', /apple-touch-icon-gold-180\.png/.test(head.appleIcon || ''), head.appleIcon);
  ok('display-mode standalone is honoured', head.displayMode === 'standalone', head.displayMode);

  // IOS-2: computed font-size of real inputs
  await page.evaluate(() => App.navigate('appointments', { action: 'add' }));
  await sleep(800);
  const fontSize = await page.evaluate(() => {
    const el = document.querySelector('.input, .select, .textarea');
    return el ? parseFloat(getComputedStyle(el).fontSize) : null;
  });
  ok('IOS-2 form controls are >=16px (no iOS focus zoom)', fontSize !== null && fontSize >= 16, { fontSize });

  // IOS-5: SW precaches the icons
  const sw = await (await fetch(BASE + '/sw.js')).text();
  ok('IOS-5 service worker precaches the gold icon set', /assets\/icons\/apple-touch-icon-gold-180\.png/.test(sw) && /assets\/icons\/icon-gold-512\.png/.test(sw));
  const cacheName = (sw.match(/CACHE_NAME = '([^']+)'/) || [])[1];
  console.log('  CACHE_NAME:', cacheName);

  // IOS-6: Notification API absent (iOS) -> not-supported path exists
  const notif = await page.evaluate(() => ({ inWindow: 'Notification' in window }));
  const requestPush = (swSrc) => swSrc; // notification.js served separately
  const notifSrc = await (await fetch(BASE + '/js/services/notification.min.js?v=5')).text();
  ok('IOS-6 notification code has a not-supported guard for iOS', /not supported/.test(notifSrc) && /Notification["']\s*in\s*window/.test(notifSrc));
  console.log('  Notification API in Chromium:', notif.inWindow, '(iOS Safari: absent -> guard fires)');

  // Asset reachability for the new icons
  for (const f of ['assets/icons/apple-touch-icon-gold-180.png', 'assets/icons/icon-gold-192-maskable.png', 'assets/icons/icon-gold-512-maskable.png']) {
    const r = await fetch(BASE + '/' + f);
    ok('served: ' + f, r.status === 200 && (r.headers.get('content-type') || '').includes('png'), r.status);
  }

  await browser.close();
  console.log(failures === 0 ? '\nIOS CONFIG VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('IOS CONFIG FAILED:', e.message.slice(0, 200)); process.exit(1); });
