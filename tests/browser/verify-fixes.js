#!/usr/bin/env node
/* ============================================
   ADVISOROS — BUG-FIX VERIFICATION
   Proves the three reported bugs are fixed:
   1. Icons render as glyphs (not raw ligature text) even with Google Fonts
      blocked and when offline — measured by rendered span width.
   2. Bottom nav always shows the 5 static labels with glyph icons.
   3. Home's last card clears the fixed composer at full scroll.
   Run: node tests/browser/verify-fixes.js   (needs :8000 + Playwright)
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

  /* ---- Context 1: Google Fonts BLOCKED from cold start (worst case:
     no remote font CSS, no remote font cache; only local assets work) ---- */
  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx1.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx1.route('**://fonts.gstatic.com/**', r => r.abort());
  const p1 = await ctx1.newPage();
  const remoteRequests = [];
  p1.on('request', req => { if (/fonts\.(googleapis|gstatic)/.test(req.url())) remoteRequests.push(req.url()); });

  await p1.goto(BASE + '/tests/browser/seed-review.html');
  await p1.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await p1.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await p1.goto(BASE + '/index.html?fix=1');
  await p1.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await p1.waitForTimeout(2500);

  const s1 = await p1.evaluate(() => {
    const navLabels = Array.from(document.querySelectorAll('#bottom-nav .nav-item span:last-child')).map(s => s.textContent);
    const navIconWidths = Array.from(document.querySelectorAll('#bottom-nav .material-symbols-rounded')).map(s => Math.round(s.getBoundingClientRect().width));
    const wideIcons = Array.from(document.querySelectorAll('.material-symbols-rounded')).filter(s => s.getBoundingClientRect().width > 48).length;
    return {
      navLabels, navIconWidths, wideIcons,
      iconFontLoaded: document.fonts.check('24px "Material Symbols Rounded"'),
      localFontRequested: performance.getEntriesByType('resource').some(e => e.name.includes('material-symbols-rounded.woff2')),
      remoteRequests: Array.from(document.styleSheets).some(s => (s.href || '').includes('fonts.googleapis'))
    };
  });
  console.log('\n=== 1. Google Fonts blocked from cold start ===');
  ok('icon font loads from the local asset', s1.iconFontLoaded && s1.localFontRequested, { loaded: s1.iconFontLoaded, local: s1.localFontRequested });
  // The body font (Hanken Grotesk) still comes from Google by design; only the
  // icon font must be local. Assert no Material Symbols request ever fires.
  const msRemote = remoteRequests.filter(u => /material/i.test(u));
  ok('no Google Fonts requests for the ICON font reach the page', msRemote.length === 0, { iconRequests: msRemote.length });
  ok('nav labels are the 5 static names', JSON.stringify(s1.navLabels) === JSON.stringify(['Home', 'Follow-ups', 'Orders', 'Money', 'Tools']), s1.navLabels);
  ok('nav icons render as glyphs (≤40px)', s1.navIconWidths.every(w => w <= 40), s1.navIconWidths);
  ok('zero raw ligature text anywhere on Home (all icon spans ≤48px)', s1.wideIcons === 0, { wideIcons: s1.wideIcons });

  /* ---- Context 2: true offline reload (SW precache path) ---- */
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/tests/browser/seed-review.html');
  await p2.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await p2.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await p2.goto(BASE + '/index.html?fix=2'); // first load registers + installs the SW
  await p2.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await p2.waitForTimeout(2000);
  await ctx2.setOffline(true);
  await p2.reload();
  await p2.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 }).catch(() => {});
  await p2.waitForTimeout(2500);
  const s2 = await p2.evaluate(() => ({
    navLabels: Array.from(document.querySelectorAll('#bottom-nav .nav-item span:last-child')).map(s => s.textContent),
    navIconWidths: Array.from(document.querySelectorAll('#bottom-nav .material-symbols-rounded')).map(s => Math.round(s.getBoundingClientRect().width)),
    wideIcons: Array.from(document.querySelectorAll('.material-symbols-rounded')).filter(s => s.getBoundingClientRect().width > 48).length,
    etaWidth: (() => { const el = document.querySelector('.comp-home-next-visit-eta .material-symbols-rounded'); return el ? Math.round(el.getBoundingClientRect().width) : null; })(),
    navBtnWidth: (() => { const el = Array.from(document.querySelectorAll('.comp-home-next-visit-actions .btn span')).find(s => s.textContent === 'Navigate'); return el ? Math.round(el.getBoundingClientRect().width) : null; })()
  }));
  console.log('\n=== 2. True offline (service-worker precache) ===');
  ok('offline: icon font still renders as glyphs', s2.navIconWidths.every(w => w <= 40) && s2.wideIcons === 0 && s2.etaWidth !== null && s2.etaWidth <= 48, s2);
  ok('offline: nav labels intact', JSON.stringify(s2.navLabels) === JSON.stringify(['Home', 'Follow-ups', 'Orders', 'Money', 'Tools']), s2.navLabels);
  await ctx2.setOffline(false);

  /* ---- 3. Home clearance at full scroll (390 and 320) ---- */
  const measure = async (page, w, h) => page.evaluate(async () => {
    const scroll = document.getElementById('comp-scroll');
    scroll.scrollTop = scroll.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const composer = document.querySelector('.comp-composer');
    const last = document.querySelector('.comp-home').lastElementChild;
    return Math.round(composer.getBoundingClientRect().top - last.getBoundingClientRect().bottom);
  });
  const c390 = await measure(p1, 390, 844);
  await p1.setViewportSize({ width: 320, height: 568 });
  await p1.reload();
  await p1.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 }).catch(() => {});
  await p1.waitForTimeout(2000);
  const c320 = await measure(p1, 320, 568);
  console.log('\n=== 3. Home composer clearance at full scroll ===');
  ok('390×844: last element clears the composer', c390 >= 0, { clearance: c390 });
  ok('320×568: last element clears the composer', c320 >= 0, { clearance: c320 });

  await browser.close();
  console.log(failures === 0 ? '\nALL FIX VERIFICATIONS PASSED' : `\n${failures} FIX VERIFICATION(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('VERIFY FAILED:', e); process.exit(1); });
