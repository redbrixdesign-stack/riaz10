#!/usr/bin/env node
/* ============================================
   ADVISOROS — CAPTURE EXTRAS
   1) Home feed scrolled to the bottom (ASK BEELO chips visible)
   2) Loading skeleton re-captured with tighter timing
   Run: node tests/browser/capture-extra.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8000';
const OUT = path.join(__dirname, '..', '..', 'screenshots', 'review');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
  await page.goto(BASE + '/index.html?extra=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today' && !!document.querySelector('#comp-scroll'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  // 1. Home scrolled to bottom — shows Attention, This Week, Ask Beelo chips
  await page.evaluate(() => {
    const s = document.getElementById('comp-scroll');
    if (s) s.scrollTop = s.scrollHeight;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '01-home-scrolled.png') });
  console.log('  ✓ 01-home-scrolled.png — Home feed scrolled to bottom (Attention + Week + Ask Beelo)');

  // 2. Loading skeleton — heavy async screen, CPU-throttled, capture fast
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await page.evaluate(() => App.navigate('appointments', { tab: 'diary' }));
  const skeletonSeen = await page.waitForSelector('.skeleton-screen', { timeout: 6000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '36-loading-skeleton.png') });
  console.log(skeletonSeen ? '  ✓ 36-loading-skeleton.png — skeleton visible during throttled load' : '  ! 36-loading-skeleton.png — skeleton not caught; captured what rendered');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // 3. NEXT card when the next visit isn't today — dated label evidence.
  // Delete today's remaining future visits so the NEXT slot falls to
  // tomorrow's first visit; the card must show "Mon 17 Aug, 09:30"-style.
  await page.evaluate(async () => {
    const today = Utils.getToday();
    const tomorrow = Utils.getTomorrow();
    const all = await DB.db.appointments.toArray();
    const doomed = all.filter(a => {
      const t = new Date(a.date).getTime();
      return t >= today.getTime() && t < tomorrow.getTime();
    }).map(a => a.id);
    await Promise.all(doomed.map(id => DB.db.appointments.delete(id)));
    App.navigate('today');
  });
  await page.waitForSelector('.comp-home-section-label', { timeout: 15000 });
  await page.waitForTimeout(2000);
  const datedText = await page.evaluate(() => document.querySelector('.comp-home-section-time')?.textContent.trim() || null);
  await page.screenshot({ path: path.join(OUT, '01-home-next-tomorrow.png') });
  console.log('  ✓ 01-home-next-tomorrow.png — NEXT card with dated label: "' + datedText + '"');

  // Update the manifest with the extra shots
  const manifestPath = path.join(OUT, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const extra = [
      { file: '01-home-next-tomorrow.png', description: 'Home NEXT card with a non-today visit — shows weekday + date + time ("' + datedText + '")' }
    ];
    for (const e of extra) if (!manifest.some(m => m.file === e.file)) manifest.push(e);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('EXTRA CAPTURE FAILED:', e); process.exit(1); });
