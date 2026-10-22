const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(() => {
        localStorage.setItem('advisoros_enc_test', '1');
        localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
        localStorage.setItem('advisoros_consent', JSON.stringify({ v: 2 }));
      });
      const page = await context.newPage();
      await page.goto(process.env.BEELO_TEST_URL || 'http://localhost:8022');
      await page.waitForFunction(() => App.currentHash === 'today');
      const ids = await page.evaluate(async () => {
        const add = async (name, date, extra = {}) => {
          const c = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: name, phone: '07700900123' });
          return DB.addAppointment({ customerId: c.id, clientName: `SYNTHETIC ${name}`, phone: c.phone, type: 'fitting', date, status: 'confirmed', ...extra });
        };
        const far = await add('Far', new Date(Date.now() + 10 * 86400000).toISOString());
        const returning = await add('Returning', new Date(Utils.getTomorrow().getTime() + 10 * 3600000).toISOString());
        await DB.addAppointment({ customerId: returning.customerId, type: 'measure', date: new Date(Date.now() - 10 * 86400000).toISOString(), status: 'completed', outcome: 'measured' });
        const expired = await add('Expired', new Date(Date.now() - 3600000).toISOString());
        App.navigate('talk');
        return { far: far.id, returning: returning.id, expired: expired.id };
      });
      await page.getByText('Before visits (2)', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Review pre-visit message for SYNTHETIC Returning', exact: true }).click();
      await page.locator('#talk-message-preview').waitFor();
      assert.equal(await page.evaluate(() => TalkFeature.pendingMessage.templateKey), 'day_before');
      await page.getByRole('button', { name: 'Close message preview' }).click();
      await page.evaluate(async id => {
        const task = (await App.features.get('followups').loadTasks()).find(t => t.appointment?.id === id && t.kind === 'intro');
        await TaskService.snooze(task, new Date(Date.now() + 3600000).toISOString());
        App.navigate('talk');
      }, ids.far);
      await page.getByText('Before visits (1)', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Review pre-visit message for SYNTHETIC Far', exact: true }).count(), 0);
      await page.evaluate(() => App.navigate('appointments', { action: 'tomorrow' }));
      await page.getByRole('button', { name: 'Review pre-visit message', exact: true }).click();
      await page.locator('#talk-message-preview').waitFor();
      assert.equal(await page.evaluate(() => TalkFeature.pendingMessage.templateKey), 'day_before');
      await page.getByRole('button', { name: 'Close message preview' }).click();
      await page.evaluate(id => AppointmentsFeature.offerBookingConfirmation(id), ids.returning);
      await page.locator('#talk-message-preview').waitFor();
      assert.equal(await page.evaluate(() => TalkFeature.pendingMessage.templateKey), 'day_before');
      await page.getByRole('button', { name: 'Close message preview' }).click();
      await page.evaluate(id => TalkFeature.sendDayBefore(id), ids.expired);
      assert.equal(await page.locator('#talk-message-preview').count(), 0);
      const state = await page.evaluate(async id => {
        await DB.updateAppointment(id, { dayBeforeSent: true });
        await TalkFeature.sendDayBefore(id);
        return { pending: TalkFeature.pendingMessage, visit: await DB.getAppointment(id) };
      }, ids.returning);
      assert.equal(state.pending, null);
      assert.equal(!!state.visit.introSent, false, 'Prior contact context does not invent introSent');
      await page.evaluate(() => App.navigate('talk'));
      await page.getByText('All quiet for now.', { exact: true }).waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/private/tmp/beelo-shared-entry-${engine.name()}.png`, fullPage: true });
      console.log(`PASS ${engine.name()}: Messages/shared due list, snooze respected, returning reminder via Messages/planner/legacy action, expired/sent blocked, no invented intro flag`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
