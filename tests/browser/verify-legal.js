#!/usr/bin/env node
/* ============================================
   ADVISOROS — LEGAL & CONSENT VERIFICATION (Phase 2)
   1. One-time consent sheet shows after settling on Today, records
      advisoros_consent, and never re-shows.
   2. Privacy + Terms pages open from Settings and render real content
      (headings, operator block, last-updated) with zero page errors.
   3. Wipe confirmation carries the GDPR erasure framing + privacy link.
   4. Consent record is cleared by "Delete all data" (fresh start re-asks).
   Run: node tests/browser/verify-legal.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};
const consentVisible = page => page.evaluate(() => {
  const sheet = document.getElementById('bottom-sheet');
  return !!sheet && /data stays on this phone/.test(sheet.textContent);
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('legal_fresh') !== '1') {
      localStorage.clear();
      sessionStorage.clear();
    }
    localStorage.setItem('advisoros_enc_test', '1');
    sessionStorage.setItem('legal_fresh', '1');
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (/Refused to/.test(m.text())) pageErrors.push(m.text()); });

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?legal=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  // Boot is done (enc_test bypassed the passphrase modal) — drop the flag so
  // ConsentPrompt (suppressed in test mode) can trigger.
  await page.evaluate(() => localStorage.removeItem('advisoros_enc_test'));
  // The seeded data makes MessageScheduler fire catch-up morning-of drafts
  // at boot (delay 0), which opens a message-preview sheet — real behaviour,
  // but it blocks ConsentPrompt's "no modal open" guard. Close it; the
  // consent sheet then appears on its next retry (5s cadence).
  await page.evaluate(() => { try { App.closeModal({ all: true, silent: true }); } catch (e) {} });
  await page.waitForFunction(() => {
    const sheet = document.getElementById('bottom-sheet');
    return sheet && /data stays on this phone/.test(sheet.textContent);
  }, null, { timeout: 25000 });

  ok('one-time consent sheet appears after settling on Today', await consentVisible(page));
  const sheetText = await page.evaluate(() => document.getElementById('bottom-sheet').textContent);
  ok('consent sheet explains local-only storage', /this device/.test(sheetText) && /no account/.test(sheetText), sheetText.slice(0, 200));
  ok('consent sheet mentions Claude AI is off by default', /Claude AI/.test(sheetText) && /off by default/.test(sheetText), sheetText.slice(0, 200));

  await page.click('[data-action="ConsentPrompt.acknowledge"]');
  await page.waitForTimeout(400);
  const recorded = await page.evaluate(() => {
    const raw = localStorage.getItem('advisoros_consent');
    if (!raw) return null;
    try { const p = JSON.parse(raw); return { v: p.v, at: !!p.at }; } catch { return null; }
  });
  ok('acknowledging records advisoros_consent {v, at}', recorded && recorded.v === 1 && recorded.at, recorded);
  ok('sheet closes after acknowledge', !(await consentVisible(page)));

  // Reload — consent must NOT re-show (record exists).
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForTimeout(6500);
  ok('consent sheet does not re-appear after acknowledging', !(await consentVisible(page)));

  // Settings → Privacy & Legal
  await page.evaluate(() => App.navigate('settings'));
  await page.waitForTimeout(900);
  await page.click('[data-action="App.navigate"][data-args*="settings?section=privacy"]');
  await page.waitForFunction(() => App.currentHash.includes('section=privacy'), null, { timeout: 10000 });
  await page.waitForTimeout(600);
  const privacySection = await page.evaluate(() => document.getElementById('main').textContent.replace(/\s+/g, ' '));
  ok('Privacy & Legal section lists the documents', /Privacy Policy/.test(privacySection) && /Terms of Service/.test(privacySection), privacySection.slice(0, 120));
  ok('section shows consent status', /Acknowledged/.test(privacySection), privacySection.slice(0, 120));

  // Open the privacy page
  await page.click('[data-action="Legal.openPrivacy"]');
  await page.waitForFunction(() => App.currentHash === 'legal?page=privacy', null, { timeout: 10000 });
  await page.waitForTimeout(600);
  const privacy = await page.evaluate(() => ({
    text: document.getElementById('main').textContent.replace(/\s+/g, ' '),
    h1: document.querySelector('#main h1')?.textContent,
    h2count: document.querySelectorAll('#main h2').length
  }));
  ok('privacy page opens with an h1', privacy.h1 === 'Privacy Policy', privacy.h1);
  ok('privacy page has structured sections', privacy.h2count >= 8, privacy.h2count);
  ok('privacy page states local-only storage', /only on your own device/.test(privacy.text), privacy.text.slice(0, 120));
  ok('privacy page covers encryption + AI + cookies + rights', ['Encryption at rest', 'Claude AI', 'Cookies and tracking', 'Your rights'].every(t => privacy.text.includes(t)), privacy.text.slice(0, 200));
  ok('privacy page shows operator + last-updated blocks', /Operator/.test(privacy.text) && /Last updated/.test(privacy.text), privacy.text.slice(0, 120));

  // Back → terms page
  await page.evaluate(() => App.navigate('legal', { page: 'terms' }));
  await page.waitForTimeout(600);
  const terms = await page.evaluate(() => ({
    h1: document.querySelector('#main h1')?.textContent,
    text: document.getElementById('main').textContent.replace(/\s+/g, ' ')
  }));
  ok('terms page opens with an h1', terms.h1 === 'Terms of Service', terms.h1);
  ok('terms cover warranty + liability + governing law', ['No warranty', 'Liability', 'Governing law', 'England and Wales'].every(t => terms.text.includes(t)), terms.text.slice(0, 200));

  // Wipe confirmation carries the erasure framing + privacy link
  await page.evaluate(() => App.navigate('settings', { section: 'privacy' }));
  await page.waitForTimeout(800);
  await page.click('[data-action="SettingsFeature.confirmWipe"]');
  await page.waitForTimeout(500);
  const wipe = await page.evaluate(() => document.getElementById('bottom-sheet').textContent.replace(/\s+/g, ' '));
  ok('wipe confirm explains permanent local erasure', /erases it permanently/.test(wipe) && /right to erasure/.test(wipe), wipe.slice(0, 200));
  ok('wipe confirm links the privacy policy', /privacy policy/.test(wipe), wipe.slice(0, 160));
  await page.click('[data-action="App.closeModal"]');
  await page.waitForTimeout(300);

  // Fresh start clears consent: the real wipe flow (confirmWipeFinal) calls
  // DB.deleteAllData, which drops every advisoros_* localStorage key.
  const cleared = await page.evaluate(async () => {
    await App.closeModal({ all: true, silent: true });
    await SettingsFeature.confirmWipeFinal();
    await new Promise(r => setTimeout(r, 150));
    return localStorage.getItem('advisoros_consent');
  });
  ok('delete-all-data clears the consent record (fresh start re-asks)', cleared === null, cleared);

  const csp = pageErrors.filter(e => /Refused to/.test(e));
  ok('no CSP violations during legal flows', csp.length === 0, csp);
  const runtime = pageErrors.filter(e => !/Refused to/.test(e) && !/frame-ancestors/.test(e));
  ok('no page errors during legal flows', runtime.length === 0, runtime);

  await browser.close();
  console.log(failures === 0 ? '\nLEGAL & CONSENT VERIFICATION PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('LEGAL FAILED:', e); process.exit(1); });
