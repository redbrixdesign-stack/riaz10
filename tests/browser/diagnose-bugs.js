#!/usr/bin/env node
/* ============================================
   ADVISOROS — BUG REPRODUCTION / DIAGNOSIS
   Boots the seeded app and dumps the evidence for the three reported
   bugs: (1) raw icon ligatures when the icon font is missing/late,
   (2) garbled bottom-nav text, (3) Home list clipping at the composer.
   Run: node tests/browser/diagnose-bugs.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?diag=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  const report = async (label) => {
    const d = await page.evaluate(() => {
      const nav = document.getElementById('bottom-nav');
      const iconSpans = Array.from(document.querySelectorAll('.material-symbols-rounded'));
      const rawIcons = iconSpans.filter(s => /^[a-z0-9_]+$/.test(s.textContent || '').valueOf && /^[a-z0-9_]+$/.test(s.textContent || ''));
      // A rendered glyph has no text content; a raw ligature name is visible text.
      const raw = iconSpans.filter(s => (s.textContent || '').trim().length > 0).map(s => s.textContent.trim());
      const fonts = (document.fonts && document.fonts.status) || 'n/a';
      const iconFontLoaded = document.fonts && document.fonts.check ? document.fonts.check('24px "Material Symbols Rounded"') : 'n/a';
      const googleFontsCssLoaded = Array.from(document.styleSheets).some(s => (s.href || '').includes('fonts.googleapis'));
      const localFontFiles = performance.getEntriesByType('resource').filter(e => e.name.includes('assets/fonts/')).map(e => e.name.split('/').pop());
      const home = document.querySelector('.comp-home');
      const composer = document.querySelector('.comp-composer');
      const scroll = document.getElementById('comp-scroll');
      let clip = null;
      if (home && composer && scroll) {
        scroll.scrollTop = scroll.scrollHeight;
        const last = home.lastElementChild;
        const lr = last.getBoundingClientRect();
        const cr = composer.getBoundingClientRect();
        const sr = scroll.getBoundingClientRect();
        clip = { lastBottom: Math.round(lr.bottom), composerTop: Math.round(cr.top), scrollBottom: Math.round(sr.bottom), clearance: Math.round(cr.top - lr.bottom) };
      }
      return {
        navText: nav ? nav.textContent.replace(/\s+/g, ' ') : null,
        navItems: nav ? Array.from(nav.querySelectorAll('.nav-item')).map(b => ({ icon: b.querySelector('.material-symbols-rounded')?.textContent, label: b.querySelector('span:last-child')?.textContent })) : null,
        iconFontLoaded, fonts, googleFontsCssLoaded, localFontFiles,
        rawLigatureCount: raw.length,
        rawLigatures: raw.slice(0, 12),
        homeClip: clip
      };
    });
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(d, null, 1));
  };

  await report('ONLINE (settled)');

  // Font-still-loading state: block the Google Fonts CSS, reload, capture early
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  await report('FONT CSS BLOCKED (early paint)');

  // Offline state (bug 1's screenshot conditions)
  await page.unroute('**/fonts.googleapis.com/**');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await report('OFFLINE (settled)');
  await ctx.setOffline(false);

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('DIAG FAILED:', e); process.exit(1); });
