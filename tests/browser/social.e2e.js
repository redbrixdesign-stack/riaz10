#!/usr/bin/env node
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    localStorage.setItem('advisoros_companion_ai', '0');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'));
  await page.goto(BASE + '/index.html?social=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today');
  const fittingId = await page.evaluate(async () => (await DB.db.appointments.where('type').equals('fitting').first())?.id);
  if (!fittingId) throw new Error('No fitting fixture');
  await page.evaluate(id => App.navigate('social', { appointmentId: id }), fittingId);
  await page.waitForSelector('#social-consent');
  const body = await page.locator('body').innerText();
  if (!body.includes('Permission first') || !body.includes('Choose photo or short video') || !body.includes('Nothing is published automatically')) throw new Error('Social workflow copy missing');
  if (errors.length) throw new Error(errors.join('\n'));
  await browser.close();
  console.log('SOCIAL E2E PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
