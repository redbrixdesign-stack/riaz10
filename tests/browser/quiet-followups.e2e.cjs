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
    await page.goto('http://localhost:8022');
    await page.waitForFunction(() => App.currentHash === 'today');
    const ids = await page.evaluate(async () => {
      const ids = [];
      CONFIG.autoMessages.enabled = true;
      for (let n = 0; n < 7; n++) {
        const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: `Quiet ${n}`, phone: `0770090010${n}` });
        const date = new Date(Utils.getTomorrow().getTime() + (9 + n) * 3600000);
        ids.push((await DB.addAppointment({ customerId: customer.id, clientName: `SYNTHETIC Quiet ${n}`, phone: customer.phone, address: 'MOCK Lane', type: 'measure', date: date.toISOString(), status: 'confirmed' })).id);
        await MessageScheduler.reschedule();
      }
      // Simulate all catch-up callbacks becoming due together.
      await Promise.all(ids.map(async id => MessageScheduler._fire(await DB.getAppointment(id), 'intro_day_before')));
      return ids;
    });
    assert.equal(await page.locator('#talk-message-preview').count(), 0);
    await page.evaluate(() => App.navigate('followups'));
    await page.getByText('Due now (7)', { exact: true }).waitFor();
    await page.evaluate(id => TalkFeature.sendMessage(id, 'intro_day_before'), ids[0]);
    await page.locator('#talk-message-preview').fill('SYNTHETIC saved for later');
    await page.evaluate(id => localStorage.setItem(MessageScheduler._flag('intro_day_before', id), '1'), ids[0]);
    await page.getByRole('button', { name: 'Close message preview' }).click();
    assert.equal(await page.evaluate(id => localStorage.getItem(MessageScheduler._flag('intro_day_before', id)), ids[0]), '1');
    await page.reload();
    await page.waitForFunction(() => !!App.currentHash);
    await page.evaluate(() => TalkFeature.openSavedDrafts());
    await page.getByRole('button', { name: /Resume draft/ }).click();
    assert.equal(await page.locator('#talk-message-preview').inputValue(), 'SYNTHETIC saved for later');
    assert.equal(await page.evaluate(async id => !!(await DB.getAppointment(id)).dayBeforeSent, ids[0]), false);
    console.log('PASS seven quiet due visits, pending inbox, explicit review, dismissal protection, reload/resume and unsent status');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
