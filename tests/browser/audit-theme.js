#!/usr/bin/env node
/* ============================================
   ADVISOROS — THEME CONSISTENCY AUDIT
   For every screen, measures in the live app:
   - lightShare: % of viewport pixels on a light (cream/white) background
     (a genuinely "light screen" would be >50%)
   - voidShare: % of viewport below the lowest real content (unexplained
     flat background after content ends)
   - creamShare: % of viewport covered by card surfaces (var(--surface))
   Run: node tests/browser/audit-theme.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?audit=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const audit = async (label, route) => {
    await page.evaluate(([id, p]) => App.navigate(id, p || {}), route);
    await page.waitForTimeout(1600);
    const m = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const light = (c) => {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return false;
        return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 > 0.65;
      };
      const dark = (c) => {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return false;
        return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 < 0.22;
      };
      // sample grid: light/cream/dark shares
      let lightN = 0, darkN = 0, total = 0;
      for (let x = 8; x < vw; x += 14) {
        for (let y = 8; y < vh; y += 14) {
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          const bg = getComputedStyle(el).backgroundColor;
          total++;
          if (light(bg)) lightN++;
          else if (dark(bg)) darkN++;
        }
      }
      // lowest real content (exclude shell/nav/offline banner)
      let contentMax = 0;
      const main = document.getElementById('main');
      if (main) {
        for (const el of main.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.width > 40 && r.height > 20 && r.top < vh && r.bottom <= vh + 1) {
            if (getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && r.bottom > contentMax) contentMax = r.bottom;
            const txt = getComputedStyle(el).color;
            if (txt && !/rgba\(0, 0, 0, 0\)/.test(txt) && r.bottom > contentMax) contentMax = r.bottom;
          }
        }
      }
      return {
        lightShare: +(lightN / total).toFixed(2),
        darkShare: +(darkN / total).toFixed(2),
        contentBottom: Math.round(contentMax),
        voidShare: +Math.max(0, (vh - contentMax) / vh).toFixed(2),
        vh
      };
    });
    console.log(`${label.padEnd(30)} light=${(m.lightShare * 100).toFixed(0).padStart(3)}%  dark=${(m.darkShare * 100).toFixed(0).padStart(3)}%  contentBottom=${String(m.contentBottom).padStart(4)}/${m.vh}  void=${(m.voidShare * 100).toFixed(0).padStart(3)}%`);
  };

  console.log('screen                        light  dark   content    void');
  await audit('home', ['today']);
  await audit('followups', ['followups']);
  await audit('orders', ['orders']);
  await audit('money', ['money']);
  await audit('tools (control)', ['control']);
  await audit('visits-diary', ['appointments', { tab: 'diary' }]);
  await audit('visits-upcoming', ['appointments', { tab: 'upcoming' }]);
  await audit('visits-pipeline', ['appointments', { tab: 'pipeline' }]);
  await audit('visits-area', ['appointments', { tab: 'area' }]);
  await audit('visits-past', ['appointments', { tab: 'past' }]);
  await audit('route', ['route']);
  await audit('talk', ['talk']);
  await audit('measure', ['measure']);
  await audit('scan (ocr)', ['ocr']);
  await audit('settings', ['settings']);
  await audit('customer-360', ['customer', { id: 1 }]);

  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('AUDIT FAILED:', e); process.exit(1); });
