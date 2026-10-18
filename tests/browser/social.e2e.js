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
    localStorage.setItem('advisoros_consent', JSON.stringify({ v: 2 }));
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(BASE + '/index.html?social=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today');
  const fittingId = await page.evaluate(async () => (await DB.addAppointment({ type: 'fitting', clientName: 'SYNTHETIC Social Test', date: new Date().toISOString(), status: 'completed' })).id);
  if (!fittingId) throw new Error('No fitting fixture');
  await page.evaluate(id => App.navigate('social', { appointmentId: id }), fittingId);
  await page.waitForSelector('#social-consent');
  const body = await page.locator('body').innerText();
  if (!body.includes('Permission first') || !body.includes('Choose photo or short video') || !body.includes('Nothing is published automatically')) throw new Error('Social workflow copy missing');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose photo or short video' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'synthetic-finished-room.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64') });
  await page.waitForFunction(() => document.getElementById('social-media-preview').textContent.includes('synthetic-finished-room.png'));
  await page.locator('#social-consent').check();
  await page.locator('#social-privacy').check();
  await page.locator('#social-product').fill('Synthetic test roller blind');
  await page.getByRole('button', { name: 'Create three post options' }).click();
  await page.locator('#social-draft-warm').waitFor();
  if (!(await page.locator('#social-draft-warm').inputValue()).includes('Synthetic test roller blind')) throw new Error('Caption generation action failed');
  if (errors.length) throw new Error(errors.join('\n'));
  await browser.close();
  console.log('SOCIAL E2E PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
