'use strict';
const { chromium } = require('playwright');
const BASE = 'https://beelo.beelestial.co.uk';
let failures = 0;
const ok = (l, c, x) => { console.log((c ? '  OK   ' : '  FAIL ') + l + (!c && x ? ' — ' + JSON.stringify(x) : '')); if (!c) failures++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('lu_f') !== '1') { localStorage.clear(); sessionStorage.clear(); } sessionStorage.setItem('lu_f', '1'); });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => { const s = document.getElementById('bottom-sheet'); return s && /Set Encryption Passphrase/.test(s.textContent); }, null, { timeout: 45000 });
  await page.fill('#enc-passphrase-new', 'live-unlock-test-123');
  await page.fill('#enc-passphrase-confirm', 'live-unlock-test-123');
  await page.click('[data-action="App._setPassphrase"]'); // TAP, not Enter
  await page.waitForFunction(() => typeof App !== 'undefined' && (App.currentHash === 'onboarding' || App.currentHash === 'today'), null, { timeout: 45000 });
  ok('live: tapping Set Passphrase boots the app', true);
  await page.reload();
  await page.waitForFunction(() => { const s = document.getElementById('bottom-sheet'); return s && /Unlock Beelo/.test(s.textContent); }, null, { timeout: 45000 });
  await page.fill('#enc-passphrase', 'live-unlock-test-123');
  await page.click('[data-action="App._checkPassphrase"]'); // TAP, not Enter
  await page.waitForFunction(() => typeof App !== 'undefined' && (App.currentHash === 'onboarding' || App.currentHash === 'today') && !document.querySelector('.modal-overlay.active'), null, { timeout: 45000 });
  ok('live: tapping Unlock unlocks and boots the app', true);
  ok('live: zero page errors in the passphrase flow', errs.length === 0, errs.slice(0, 2));
  await browser.close();
  console.log(failures === 0 ? '\nLIVE UNLOCK CHECK PASSED' : '\nLIVE UNLOCK CHECK FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('LIVE UNLOCK FAILED:', e.message.slice(0, 200)); process.exit(1); });
