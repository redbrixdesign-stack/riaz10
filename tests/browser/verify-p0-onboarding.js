#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';
let failures = 0;

function ok(label, condition, detail) {
  console.log(`${condition ? '  OK  ' : '  FAIL'} ${label}${!condition && detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!condition) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true
  });

  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
    window.__beeloGeoCalls = { current: 0, watch: 0 };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition() { window.__beeloGeoCalls.current++; },
        watchPosition() { window.__beeloGeoCalls.watch++; return 1; },
        clearWatch() {}
      }
    });
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/?p0-browser-check=1`);
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentFeature);
  await page.waitForTimeout(350);

  const passphrase = await page.evaluate(() => {
    const holder = document.createElement('div');
    holder.innerHTML = App.passphraseControl('p0-passphrase', 'Enter passphrase');
    document.body.appendChild(holder);
    const input = holder.querySelector('input, textarea');
    const result = {
      tagName: input.tagName,
      type: input.type || '',
      autocomplete: input.autocomplete,
      className: input.className,
      textSecurity: getComputedStyle(input).webkitTextSecurity
    };
    holder.remove();
    return result;
  });
  ok('passphrase is a masked non-credential control on WebKit-compatible engines',
    passphrase.tagName === 'TEXTAREA' && passphrase.className.includes('passphrase-input') && passphrase.textSecurity === 'disc',
    passphrase);
  ok('passphrase uses the non-account one-time-code autocomplete category', passphrase.autocomplete === 'one-time-code', passphrase);

  const geoCalls = await page.evaluate(() => window.__beeloGeoCalls);
  ok('cold launch does not request or watch location', geoCalls.current === 0 && geoCalls.watch === 0, geoCalls);

  const navigation = await page.evaluate(async () => {
    App.navigate('onboarding');
    const main = document.getElementById('main');
    const input = document.getElementById('ob-address');
    main.scrollTop = 500;
    document.documentElement.scrollTop = 120;
    document.body.scrollTop = 120;
    input.focus();
    App.navigate('money');
    await new Promise(resolve => setTimeout(resolve, 260));
    return {
      main: main.scrollTop,
      documentElement: document.documentElement.scrollTop,
      body: document.body.scrollTop,
      oldInputStillFocused: document.activeElement === input,
      feature: App.currentFeature?.id
    };
  });
  ok('navigation dismisses the old field and lands on the requested screen',
    !navigation.oldInputStillFocused && navigation.feature === 'money', navigation);
  ok('navigation clears app and document scroll after the keyboard-close window',
    navigation.main === 0 && navigation.documentElement === 0 && navigation.body === 0, navigation);

  await browser.close();
  console.log(failures ? `\n${failures} P0 ONBOARDING CHECK(S) FAILED` : '\nP0 ONBOARDING VERIFICATION PASSED');
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('P0 ONBOARDING VERIFICATION FAILED:', error);
  process.exit(1);
});
