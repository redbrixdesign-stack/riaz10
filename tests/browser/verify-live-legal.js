'use strict';
const { chromium } = require('playwright');
const BASE = process.env.BEELO_BASE_URL || 'https://beelo.beelestial.co.uk';
let failures = 0;
const ok = (l, c, x) => { console.log((c ? '  OK   ' : '  FAIL ') + l + (!c && x ? ' — ' + JSON.stringify(x) : '')); if (!c) failures++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('advisoros_enc_test', '1'); });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => typeof App !== 'undefined', null, { timeout: 45000 });
  // Fresh live profile boots into first-run onboarding — complete it to
  // reach Today (where the consent notice is scheduled).
  if (await page.evaluate(() => App.currentHash === 'onboarding')) {
    await page.fill('#ob-name', 'Live Test');
    await page.click('[data-action="OnboardingFeature.finish"]');
    await page.waitForFunction(() => App.currentHash === 'today', null, { timeout: 30000 });
  }
  await page.waitForFunction(() => App.currentHash === 'today', null, { timeout: 45000 });
  await page.evaluate(() => {
    localStorage.removeItem('advisoros_enc_test');
    ConsentPrompt._show();
  });
  await page.waitForFunction(() => {
    const s = document.getElementById('bottom-sheet');
    return s && /records stay on this phone/i.test(s.textContent);
  }, null, { timeout: 25000 });
  ok('live: one-time consent sheet shows', true);
  // Element-level click: page.click() on a fixed bottom sheet can land on
  // the backdrop (closing it without acting) — a real tap hits the button.
  await page.evaluate(() => document.querySelector('[data-action="ConsentPrompt.openPrivacy"]').click());
  await page.waitForFunction(() => App.currentHash === 'legal?page=privacy', null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const p = await page.evaluate(() => ({
    h1: document.querySelector('#main h1')?.textContent,
    hasEncryption: /Encryption at rest/.test(document.getElementById('main').textContent),
    hasCookies: /Cookies and tracking/.test(document.getElementById('main').textContent)
  }));
  ok('live: privacy page opens with full content', p.h1 === 'Privacy Policy' && p.hasEncryption && p.hasCookies, p);
  ok('live: zero page errors on legal flow', errs.length === 0, errs.slice(0, 2));
  await browser.close();
  console.log(failures === 0 ? '\nLIVE LEGAL CHECK PASSED' : '\nLIVE LEGAL CHECK FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('LIVE LEGAL FAILED:', e.message.slice(0, 200)); process.exit(1); });
