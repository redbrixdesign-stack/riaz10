'use strict';
const { chromium } = require('playwright');
const BASE = 'https://beelo.beelestial.co.uk';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (l, c, x) => { console.log((c ? '  OK   ' : '  FAIL ') + l + (!c && x ? ' — ' + JSON.stringify(x) : '')); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  // 1. Cold-launch deep link on the LIVE site
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { if (sessionStorage.getItem('lp1') !== '1') { localStorage.clear(); sessionStorage.clear(); } localStorage.setItem('advisoros_enc_test', '1'); localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true })); sessionStorage.setItem('lp1', '1'); });
  const page = await ctx.newPage();
  const badArgs = [];
  page.on('console', m => { if (/bad data-args/.test(m.text())) badArgs.push(m.text().slice(0, 60)); });
  await page.goto(BASE + '/index.html#appointments?action=add');
  await page.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 45000 });
  await sleep(1500);
  const h = await page.evaluate(() => App.currentHash);
  ok('live: cold launch #appointments?action=add -> ' + h, h === 'appointments?action=add', h);
  // 2. Log outcomes card on live (needs seed — live has no seed; check the card only if present)
  await page.goto(BASE + '/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 45000 });
  await sleep(1200);
  const hasCard = await page.locator('[data-action="App.navigate"]').filter({ hasText: 'Log outcomes' }).count();
  console.log('  live Log outcomes card present:', hasCard > 0 ? 'yes' : 'no (no seed data on live)');
  ok('live: zero bad-data-args errors during boot + nav', badArgs.length === 0, badArgs);
  await browser.close();
  console.log(fails === 0 ? '\nLIVE P1 CHECK PASSED' : '\nLIVE P1 CHECK FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('LIVE P1 FAILED:', e.message.slice(0, 160)); process.exit(1); });
