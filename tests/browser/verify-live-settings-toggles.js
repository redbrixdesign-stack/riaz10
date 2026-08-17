'use strict';
const { chromium } = require('playwright');
const BASE = 'https://beelo.beelestial.co.uk';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (l, c, x) => { console.log((c ? '  OK   ' : '  FAIL ') + l + (!c && x ? ' — ' + JSON.stringify(x) : '')); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('lp2') !== '1') { localStorage.clear(); sessionStorage.clear(); } localStorage.setItem('advisoros_enc_test', '1'); localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true })); sessionStorage.setItem('lp2', '1'); });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 100)); });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 45000 });
  await sleep(1200);
  await page.evaluate(() => App.navigate('settings', { section: 'ai' }));
  await sleep(900);
  const before = await page.evaluate(() => ({ enabled: !!CONFIG.ai.enabled, len: document.getElementById('main').innerHTML.length }));
  await page.evaluate(() => { const b = document.querySelector('[data-action="SettingsFeature.toggleAI"]'); if (b) b.click(); });
  await sleep(800);
  const after = await page.evaluate(() => ({
    enabled: !!CONFIG.ai.enabled,
    len: document.getElementById('main').innerHTML.length,
    stillDetail: /Claude AI/.test(document.getElementById('main').textContent) && !!document.querySelector('[data-action="SettingsFeature.toggleAI"]'),
    hash: App.currentHash
  }));
  ok('live: AI toggle flips (' + before.enabled + ' -> ' + after.enabled + ')', after.enabled !== before.enabled, after);
  ok('live: stays on the AI detail section after the toggle', after.stillDetail && after.hash === 'settings?section=ai', after);
  ok('live: zero console errors on the toggle', errs.length === 0, errs);
  await browser.close();
  console.log(fails === 0 ? '\nLIVE P2 CHECK PASSED' : '\nLIVE P2 CHECK FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('LIVE P2 FAILED:', e.message.slice(0, 160)); process.exit(1); });
