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
    await page.screenshot({ path: '/private/tmp/beelo-tomorrow-plan.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Prepare reminder', exact: true }).first().click();
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
    console.log('PASS tomorrow entry, empty state, date/status filtering, order, context, reminder preview, mobile width, offline reload, unsent flags and detail navigation');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
