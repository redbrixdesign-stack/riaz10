#!/usr/bin/env node
/* ============================================
   ADVISOROS — BUG DIAGNOSIS v2 (pixel-level)
   Distinguishes rendered glyphs from raw ligature text by measuring
   icon span widths, and re-measures Home composer clearance after a
   settled scroll. States: online settled, icon-font CSS blocked
   (late-load race), offline.
   Run: node tests/browser/diagnose-bugs2.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?diag2=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const report = async (label) => {
    await page.waitForTimeout(300);
    const d = await page.evaluate(async () => {
      // Settled scroll-to-bottom for the clearance measurement
      const scroll = document.getElementById('comp-scroll');
      if (scroll) { scroll.scrollTop = scroll.scrollHeight; }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          text: (el.textContent || '').trim().slice(0, 24),
          width: Math.round(el.getBoundingClientRect().width),
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          liga: cs.fontFeatureSettings || cs.webkitFontFeatureSettings || ''
        };
      };

      const home = document.querySelector('.comp-home');
      const composer = document.querySelector('.comp-composer');
      const last = home && home.lastElementChild;
      const navIcons = Array.from(document.querySelectorAll('#bottom-nav .material-symbols-rounded'));

      return {
        etaIcon: pick('.comp-home-next-visit-eta .material-symbols-rounded'),
        navIcon: navIcons[0] ? pick('#bottom-nav .nav-item:first-child .material-symbols-rounded') : null,
        chevron: pick('.comp-home-visit-chevron'),
        navLabelFont: (() => { const s = document.querySelector('#bottom-nav .nav-item span:last-child'); return s ? getComputedStyle(s).fontFamily : null; })(),
        // glyph vs raw text: a rendered 24px ligature is ~24px wide; raw text is much wider
        rawTextFlags: {
          etaIcon: pick('.comp-home-next-visit-eta .material-symbols-rounded'),
          navIconsWide: navIcons.filter(s => s.getBoundingClientRect().width > 60).length,
          chevronWide: (() => { const c = document.querySelector('.comp-home-visit-chevron'); return c ? c.getBoundingClientRect().width > 60 : null; })()
        },
        homeClip: home && composer && last ? {
          lastBottom: Math.round(last.getBoundingClientRect().bottom),
          composerTop: Math.round(composer.getBoundingClientRect().top),
          scrollBottom: Math.round(scroll.getBoundingClientRect().bottom),
          clearance: Math.round(composer.getBoundingClientRect().top - last.getBoundingClientRect().bottom)
        } : null
      };
    });
    console.log(`\n=== ${label} ===\n` + JSON.stringify(d, null, 1));
  };

  await report('ONLINE settled');

  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 }).catch(() => {});
  await report('FONT CSS BLOCKED (late-load race)');
  await page.unroute('**/fonts.googleapis.com/**');

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 }).catch(() => {});
  await report('OFFLINE');
  await ctx.setOffline(false);

  // Small screen clearance check (320×568)
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const small = await page.evaluate(async () => {
    const scroll = document.getElementById('comp-scroll');
    scroll.scrollTop = scroll.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const home = document.querySelector('.comp-home');
    const composer = document.querySelector('.comp-composer');
    const last = home.lastElementChild;
    return {
      viewport: [innerWidth, innerHeight],
      clearance: Math.round(composer.getBoundingClientRect().top - last.getBoundingClientRect().bottom),
      composerHeight: Math.round(composer.getBoundingClientRect().height),
      lastBottom: Math.round(last.getBoundingClientRect().bottom),
      composerTop: Math.round(composer.getBoundingClientRect().top)
    };
  });
  console.log(`\n=== HOME CLEARANCE AT 320×568 ===\n` + JSON.stringify(small, null, 1));

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('DIAG2 FAILED:', e); process.exit(1); });
