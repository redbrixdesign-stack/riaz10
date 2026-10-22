const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => {
      localStorage.setItem('advisoros_enc_test', '1');
      localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
      localStorage.setItem('advisoros_consent', JSON.stringify({ v: 2 }));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto('http://localhost:8022');
    await page.waitForFunction(() => App.currentHash === 'today');
    await page.getByRole('button', { name: 'Plan tomorrow', exact: true }).click();
    await page.getByText('No active visits booked for tomorrow.').waitFor();
    const ids = await page.evaluate(async () => {
      const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Planner', notes: 'Discuss blue fabric', phone: '07700900111' });
      const day = Utils.getTomorrow();
      const add = async (name, hours, extra = {}) => {
        const date = new Date(day.getTime() + hours * 3600000);
        return (await DB.addAppointment({
          customerId: customer.id, clientName: name, phone: '07700900111',
          address: 'Synthetic address', type: 'survey', date: date.toISOString(),
          access: 'Side gate', ...extra
        })).id;
      };
      return [
        await add('SYNTHETIC Later', 14, { introSent: true }),
        await add('SYNTHETIC Earlier', 9),
        await add('SYNTHETIC Cancelled', 11, { status: 'cancelled' }),
        await add('SYNTHETIC Completed', 12, { outcome: 'survey_complete' }),
        await add('SYNTHETIC Another day', 35)
      ];
    });
    await page.evaluate(() => App.navigate('appointments', { action: 'tomorrow' }));
    await page.getByText('2 planned visits', { exact: false }).waitFor();
    assert.deepEqual(await page.locator('#tomorrow-plan h2').allTextContents(), ['1. SYNTHETIC Earlier', '2. SYNTHETIC Later']);
    assert.equal(await page.getByText('Discuss blue fabric', { exact: false }).count(), 2);
    assert.equal(await page.locator('#tomorrow-plan').getByText('Side gate', { exact: false }).count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'Preview proposed route', exact: true }).click();
    await page.locator('#planning-route-preview').waitFor();
    assert.match(await page.locator('#planning-route-preview').innerText(), /Unavailable — incomplete location data/);
    await page.getByRole('button', { name: 'Close route preview', exact: true }).click();
    const preview = await page.evaluate(() => {
      const visits = [{ clientName: 'SYNTHETIC A', latLng: [53.48, -2.24] }, { clientName: 'SYNTHETIC B', latLng: [53.50, -2.20] }];
      const complete = RouteFeature.planningDistancePreview(visits, [53.46, -2.25]);
      const missing = RouteFeature.planningDistancePreview([...visits, { clientName: 'SYNTHETIC Missing' }]);
      const invalid = RouteFeature.planningDistancePreview([{ latLng: [999, 0] }]);
      return { complete, missing, invalid };
    });
    assert(preview.complete.totalKm > 0);
    assert.equal(preview.complete.legs.length, 3);
    assert.equal(preview.missing.totalKm, null);
    assert.equal(preview.invalid.totalKm, null);
    await page.screenshot({ path: '/private/tmp/beelo-tomorrow-plan.png', fullPage: true, animations: 'disabled' });
    const originalDates = await page.evaluate(async ids => Promise.all(ids.map(async id => (await DB.getAppointment(id)).date)), ids);
    await page.getByRole('button', { name: 'Move visit 1 down', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#tomorrow-plan h2')?.textContent.includes('Later'));
    await page.getByRole('button', { name: 'Preview proposed route', exact: true }).click();
    await page.locator('#planning-route-preview').waitFor();
    assert.match(await page.locator('#planning-route-preview li').first().innerText(), /SYNTHETIC Later/);
    assert.match(await page.locator('#planning-route-preview').innerText(), /goes backwards through booked times/);
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
    await page.screenshot({ path: '/private/tmp/beelo-route-preview.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Close route preview', exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => !!App.currentHash);
    await page.evaluate(() => App.navigate('appointments', { action: 'tomorrow' }));
    await page.waitForFunction(() => document.querySelector('#tomorrow-plan h2')?.textContent.includes('Later'));
    assert.deepEqual(await page.evaluate(async ids => Promise.all(ids.map(async id => (await DB.getAppointment(id)).date)), ids), originalDates);
    await page.getByRole('button', { name: 'Reset to booked-time order', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#tomorrow-plan h2')?.textContent.includes('Earlier'));
    // Pointer events exercise the same touch/mouse handle path without native HTML drag.
    await page.evaluate(() => {
      const handle = document.querySelector('[data-plan-drag="0"]');
      const target = document.querySelector('[data-plan-index="1"]');
      target.scrollIntoView({ block: 'center' });
      const rect = target.getBoundingClientRect();
      const capture = handle.setPointerCapture;
      handle.setPointerCapture = () => {}; // Synthetic pointer has no active OS pointer.
      handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: rect.x + 20, clientY: rect.y + 40 }));
      handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      handle.setPointerCapture = capture;
    });
    await page.waitForFunction(() => document.querySelector('#tomorrow-plan h2')?.textContent.includes('Later'));
    await page.getByRole('button', { name: 'Reset to booked-time order', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#tomorrow-plan h2')?.textContent.includes('Earlier'));
    await page.getByRole('button', { name: 'Review pre-visit message', exact: true }).first().click();
    await page.locator('#talk-message-preview').waitFor();
    assert(await page.locator('#talk-message-preview').inputValue());
    await page.getByRole('button', { name: 'Close message preview' }).click();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => App.currentHash === 'today' || App.currentHash?.startsWith('appointments'));
    await page.evaluate(() => App.navigate('appointments', { action: 'tomorrow' }));
    await page.getByText('2 planned visits', { exact: false }).waitFor();
    const unchanged = await page.evaluate(async ids => Promise.all(ids.map(id => DB.getAppointment(id))), ids);
    assert(!unchanged[1].introSent);
    assert(!unchanged[1].dayBeforeSent);
    assert(unchanged[0].introSent);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Review visit', exact: true }).first().click();
    await page.waitForFunction(() => !document.querySelector('#tomorrow-plan'));
    // Model next morning: the same calendar-date plan must now be accessible as Today.
    await page.evaluate(async ids => {
      const visit = await DB.getAppointment(ids[1]);
      await DB.updateAppointment(ids[1], { timeProposal: { status: 'pending', time: '11:00', originalDate: visit.date, createdAt: new Date().toISOString() } });
      await DB.setPrivateSetting(`visit-plan:${Utils.formatDate(Utils.getTomorrow(), 'iso')}`, JSON.stringify([ids[0], ids[1]]));
      const nextDay = Utils.getTomorrow().getTime();
      Utils.getToday = () => new Date(nextDay);
      Utils.getTomorrow = () => new Date(nextDay + 86400000);
      App.navigate('appointments', { action: 'today-plan' });
    }, ids);
    await page.getByRole('button', { name: 'Today', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Today', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.locator('#tomorrow-plan h2').allTextContents(), ['1. SYNTHETIC Later', '2. SYNTHETIC Earlier']);
    assert.equal(await page.getByRole('button', { name: 'Prepare reminder', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Move visit 1 down', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#tomorrow-plan h2')?.textContent.includes('Earlier'));
    assert.equal(await page.getByRole('button', { name: 'Today', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Preview proposed route', exact: true }).click();
    await page.locator('#planning-route-preview').waitFor();
    assert.match(await page.locator('#planning-route-preview').innerText(), /SYNTHETIC Earlier/);
    await page.getByRole('button', { name: 'Close route preview', exact: true }).click();
    await page.getByRole('button', { name: 'Review visit', exact: true }).first().click();
    await page.getByRole('button', { name: 'Review pending time proposal', exact: true }).click();
    await page.locator('#proposal-time').waitFor();
    assert.equal(await page.locator('#proposal-time').inputValue(), '11:00');
    console.log('PASS planning, route, offline reload, next-morning access, selected-day reorder and pending proposal from visit details');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
