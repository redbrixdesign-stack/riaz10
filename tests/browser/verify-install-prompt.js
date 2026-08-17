#!/usr/bin/env node
/* ============================================
   ADVISOROS — INSTALL PROMPT VERIFICATION (perf 5.4)
   The one-time "Add Beelo to your home screen" hint:
   - Chrome/Android path: captures beforeinstallprompt, shows a bottom
     sheet with "Add to Home Screen", the button invokes the deferred
     prompt, and "Not now" dismisses for 30 days (no re-show).
   - iOS path: no native prompt → three-step Safari instructions.
   - Never shown while onboarding / before settling on Today.
   Run: node tests/browser/verify-install-prompt.js  (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

// Dispatch a synthetic beforeinstallprompt (headless Chromium never fires
// the real one). The capture handler must preventDefault + stash the event.
const fireBIP = page => page.evaluate(() => {
  const e = new Event('beforeinstallprompt');
  e.prompt = () => { window.__bipPrompted = true; };
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
});

const hintVisible = page => page.evaluate(() => {
  const sheet = document.getElementById('bottom-sheet');
  return !!sheet && sheet.textContent.includes('Add Beelo to your home screen');
});

(async () => {
  const browser = await chromium.launch();

  /* ---- Context 1: Chrome/Android path ---- */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    // Clear storage only on the FIRST load of this context; later reloads
    // must keep flags like beelo_install_dismissed_at so dismissal TTLs
    // can be verified.
    if (sessionStorage.getItem('ip_fresh') !== '1') {
      localStorage.clear();
      sessionStorage.clear();
    }
    localStorage.setItem('advisoros_enc_test', '1');
    sessionStorage.setItem('ip_fresh', '1');
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?ip=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  // Boot is done (passphrase prompt skipped via test flag) — drop the flag
  // so InstallPrompt (which suppresses itself in test mode) can trigger.
  await page.evaluate(() => localStorage.removeItem('advisoros_enc_test'));
  await fireBIP(page);
  await page.waitForTimeout(13000); // hint is scheduled at 12s

  ok('Android: hint sheet appears ~12s after settling on Today', await hintVisible(page));

  const androidBtn = await page.evaluate(() => {
    const sheet = document.getElementById('bottom-sheet');
    const install = Array.from(sheet.querySelectorAll('[data-action]')).map(b => b.getAttribute('data-action'));
    return { hasInstall: install.includes('InstallPrompt.install'), hasDismiss: install.includes('InstallPrompt.dismiss') };
  });
  ok('Android: sheet has Add to Home Screen + Not now actions', androidBtn.hasInstall && androidBtn.hasDismiss, androidBtn);

  await page.click('[data-action="InstallPrompt.install"]');
  await page.waitForTimeout(300);
  const prompted = await page.evaluate(() => window.__bipPrompted === true);
  ok('Android: Install button invokes the captured native prompt', prompted);
  const hiddenAfterAccept = await page.evaluate(() => {
    const sheet = document.getElementById('bottom-sheet');
    return !(sheet && sheet.textContent.includes('Add Beelo'));
  });
  ok('Android: hint hides after accept (appinstalled path)', hiddenAfterAccept);

  /* ---- Context 2: iOS Safari path (no beforeinstallprompt) ---- */
  const iCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  });
  await iCtx.addInitScript(() => {
    if (sessionStorage.getItem('ip_fresh') !== '1') {
      localStorage.clear();
      sessionStorage.clear();
    }
    localStorage.setItem('advisoros_enc_test', '1');
    sessionStorage.setItem('ip_fresh', '1');
  });
  const ipage = await iCtx.newPage();
  await ipage.goto(BASE + '/tests/browser/seed-review.html');
  await ipage.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await ipage.goto(BASE + '/index.html?ip=2');
  await ipage.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await ipage.evaluate(() => localStorage.removeItem('advisoros_enc_test'));
  await ipage.waitForTimeout(13000);

  ok('iOS: instruction sheet appears without beforeinstallprompt', await hintVisible(ipage));
  const iosText = await ipage.evaluate(() => document.getElementById('bottom-sheet').textContent);
  ok('iOS: sheet teaches Share → Add to Home Screen', /Share/.test(iosText) && /Add to Home Screen/.test(iosText), iosText.slice(0, 200));
  await ipage.click('[data-action="InstallPrompt.dismiss"]');
  await ipage.waitForTimeout(300);
  const dismissedAt = await ipage.evaluate(() => localStorage.getItem('beelo_install_dismissed_at'));
  ok('iOS: Not now records the 30-day dismissal', !!dismissedAt && Number(dismissedAt) > 0, dismissedAt);
  // Reload — must NOT reappear within the 30-day window.
  await ipage.reload();
  await ipage.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await ipage.waitForTimeout(13000);
  ok('iOS: hint does not re-appear after Not now (30-day TTL)', !(await hintVisible(ipage)));

  /* ---- Context 3: onboarding is never interrupted ---- */
  const oCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await oCtx.addInitScript(() => {
    if (sessionStorage.getItem('ip_fresh') !== '1') {
      localStorage.clear();
      sessionStorage.clear();
    }
    localStorage.setItem('advisoros_enc_test', '1');
    sessionStorage.setItem('ip_fresh', '1');
  });
  const opage = await oCtx.newPage();
  await opage.goto(BASE + '/index.html?ip=3');
  await opage.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'onboarding', null, { timeout: 30000 });
  await opage.evaluate(() => localStorage.removeItem('advisoros_enc_test'));
  await fireBIP(opage);
  await opage.waitForTimeout(13000);
  ok('onboarding: hint never interrupts first-run setup', !(await hintVisible(opage)));

  const cspBlocked = consoleErrors.filter(e => /Refused to/.test(e));
  ok('no CSP violations across all install-prompt paths', cspBlocked.length === 0, cspBlocked);

  await browser.close();
  console.log(failures === 0 ? '\nINSTALL PROMPT VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('INSTALL PROMPT FAILED:', e); process.exit(1); });
