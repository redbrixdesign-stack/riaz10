#!/usr/bin/env node
/* Per-screen current-state probe: JS errors, horizontal overflow,
   content height, structural facts. Basis for VISUAL_BASELINE-v2.md. */
'use strict';
const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 90)));
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?audit2=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const probe = async (label, route) => {
    await page.evaluate(([id, p]) => App.navigate(id, p || {}), route);
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => {
      const main = document.getElementById('main');
      const h = () => {
        const el = main.querySelector('.top-header');
        return el ? el.getBoundingClientRect().height : 0;
      };
      let contentBottom = 0;
      for (const el of main.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 40 && r.bottom < innerHeight + 1 && r.top < innerHeight && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)') {
          if (r.bottom > contentBottom) contentBottom = r.bottom;
        }
      }
      return {
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        contentBottom: Math.round(contentBottom),
        cards: main.querySelectorAll('.card').length,
        emptyStates: main.querySelectorAll('.empty-state').length,
        kanbanCols: main.querySelectorAll('.kanban-col, [class*="kanban-col"]').length,
        map: !!main.querySelector('.leaflet-container'),
        textSample: main.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)
      };
    });
    console.log(label.padEnd(22), JSON.stringify({ ...m, errs: errors.splice(0).length }));
  };

  await probe('home', ['today']);
  await probe('followups', ['followups']);
  await probe('orders', ['orders']);
  await probe('money', ['money']);
  await probe('tools', ['control']);
  await probe('visits-diary', ['appointments', { tab: 'diary' }]);
  await probe('visits-upcoming', ['appointments', { tab: 'upcoming' }]);
  await probe('visits-pipeline', ['appointments', { tab: 'pipeline' }]);
  await probe('visits-area', ['appointments', { tab: 'area' }]);
  await probe('visits-past', ['appointments', { tab: 'past' }]);
  await probe('route', ['route']);
  await probe('talk', ['talk']);
  await probe('measure', ['measure']);
  await probe('scan-ocr', ['ocr']);
  await probe('settings', ['settings']);
  await probe('customer-360', ['customer', { id: 1 }]);
  await browser.close();
  console.log('\nDONE');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
