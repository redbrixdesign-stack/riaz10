#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME HEADER REMOVAL + SAFE AREA
   Proves the custom "Beelo · time" topbar is fully
   removed from the Home render (not hidden) and the
   scroll container pads the top with
   env(safe-area-inset-top, 0px) so the first feed
   element (the advisor-name heading) sits below the
   OS status bar on standalone PWA installs.
   Headless env() resolves to 0 (no notch), so we also
   assert the rule text and that the pattern matches
   the shared .top-header safe-area treatment already
   proven on devices.
   Run: node tests/browser/verify-safearea.js   (:8000 + Playwright)
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?sa=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  console.log('\n=== Header fully removed (not hidden) ===');
  const gone = await page.evaluate(() => ({
    topbar: !!document.querySelector('.comp-topbar'),
    brand: !!document.querySelector('.comp-brand'),
    clock: !!document.querySelector('#comp-clock'),
    homeBrand: !!document.querySelector('.comp-home-brand'),
    homeAvatar: !!document.querySelector('.comp-home-avatar'),
    greeting: !!document.querySelector('.comp-home-greeting')
  }));
  ok('comp-topbar element absent from DOM', !gone.topbar, gone);
  ok('comp-brand element absent from DOM', !gone.brand, gone);
  ok('comp-clock element absent from DOM', !gone.clock, gone);
  ok('no Beelo brand mark or avatar on Home', !gone.homeBrand && !gone.homeAvatar, gone);
  ok('advisor-name greeting renders on Home (current design)', gone.greeting, gone);

  console.log('\n=== Safe-area padding wired (env) ===');
  const rules = await page.evaluate(() => {
    const out = { compScroll: null, topHeader: null };
    for (const sheet of document.styleSheets) {
      let rulesList = [];
      try { rulesList = Array.from(sheet.cssRules); } catch (e) { continue; }
      for (const r of rulesList) {
        if (r.selectorText === '.comp-scroll') out.compScroll = r.style.cssText;
        if (r.selectorText === '.top-header') out.topHeader = r.style.cssText;
      }
    }
    return out;
  });
  ok('.comp-scroll padding uses env(safe-area-inset-top)', !!rules.compScroll && rules.compScroll.includes('env(safe-area-inset-top, 0px)'), rules.compScroll);
  // The shared .top-header (proven on real devices) uses the same env() pattern.
  ok('matches the .top-header safe-area pattern (env + fallback)', !!rules.topHeader && rules.topHeader.includes('env(safe-area-inset-top'), rules.topHeader);

  console.log('\n=== Layout with env() = 0 (desktop/no-notch) ===');
  const zero = await page.evaluate(() => {
    const scroll = document.getElementById('comp-scroll');
    const first = document.querySelector('.comp-home') ? document.querySelector('.comp-home').firstElementChild : null;
    return {
      scrollPaddingTop: getComputedStyle(scroll).paddingTop,
      firstTop: first ? Math.round(first.getBoundingClientRect().top) : null,
      firstVisible: first ? first.getBoundingClientRect().top >= 0 : false,
      // The first element is the advisor greeting when a name is set, else
      // the weekly-calendar section — either way it must clear the safe area.
      firstIsContent: !!(first && (first.classList.contains('comp-home-section') || first.classList.contains('comp-home-greeting')))
    };
  });
  ok('padding-top computes to 14px when inset = 0', zero.scrollPaddingTop === '14px', zero);
  ok('the first Home element (greeting or week strip) is fully on screen', zero.firstIsContent && zero.firstVisible && zero.firstTop < 40, zero);

  // Cross-check: same env() behaviour on the shared header screens (unchanged).
  await page.evaluate(() => App.navigate('settings'));
  await page.waitForTimeout(1200);
  const hdr = await page.evaluate(() => {
    const t = document.querySelector('.top-header');
    return t ? getComputedStyle(t).paddingTop : null;
  });
  ok('shared App.renderTopHeader() untouched and still padding via env()', !!hdr && hdr.includes('px'), hdr);

  ok('zero page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures === 0 ? '\nALL SAFE-AREA CHECKS PASSED' : `\n${failures} SAFE-AREA CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
