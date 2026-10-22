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
      const id = await page.evaluate(async () => {
        const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Purpose', phone: '07700900123' });
        const visit = await DB.addAppointment({ customerId: customer.id, clientName: 'SYNTHETIC Purpose', phone: customer.phone, type: 'fitting', date: new Date(Date.now() + 10 * 86400000).toISOString(), status: 'confirmed' });
        App.navigate('followups');
        return visit.id;
      });
      await page.getByRole('button', { name: 'Review introduction', exact: true }).waitFor();
      // Simulate another screen changing the booking while this inbox is open.
      await page.evaluate(id => DB.updateAppointment(id, { date: new Date(Utils.getTomorrow().getTime() + 10 * 3600000).toISOString() }), id);
      await page.getByRole('button', { name: 'Review introduction', exact: true }).click();
      await page.locator('#talk-message-preview').waitFor();
      assert.equal(await page.evaluate(() => TalkFeature.pendingMessage.templateKey), 'intro_day_before');
      await page.locator('#talk-message-preview').fill('SYNTHETIC saved combined fitting draft');
      await page.getByRole('button', { name: 'Close message preview' }).click();
      const taskIds = await page.evaluate(async id => {
        const appointment = await DB.getAppointment(id);
        const intro = await TaskService.createFromSuggestion({ kind: 'intro', appointment, action: 'SYNTHETIC old intro' }, { snoozedUntil: new Date(Date.now() + 3600000).toISOString() });
        const reminder = await TaskService.createFromSuggestion({ kind: 'visit_tomorrow', appointment, action: 'SYNTHETIC old reminder' }, { snoozedUntil: new Date(Date.now() + 1800000).toISOString() });
        App.navigate('followups');
        return [intro.id, reminder.id];
      }, id);
      await page.getByText('Snoozed (1)', { exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Review introduction & confirmation', exact: true }).count(), 1);
      await page.reload();
      await page.waitForFunction(() => !!App.currentHash);
      const state = await page.evaluate(async ids => ({ tasks: await App.features.get('followups').loadTasks(), old: await DB.getTask(ids[1]) }), taskIds);
      assert.equal(state.tasks.filter(t => ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind)).length, 1);
      assert.equal(state.tasks.find(t => t.kind === 'intro_confirmation').id, taskIds[0]);
      assert.equal(state.tasks.find(t => t.kind === 'intro_confirmation').action, 'Introduce yourself and confirm this visit');
      assert.equal(state.old.resolutionReason, 'previsit_purpose_consolidated');
      await page.evaluate(() => App.navigate('followups'));
      await page.getByText('Snoozed (1)', { exact: true }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/private/tmp/beelo-previsit-purpose-${engine.name()}.png`, fullPage: true });
      const expired = await page.evaluate(async ({ id, taskIds }) => {
        await DB.updateAppointment(id, { date: new Date(Date.now() - 3600000).toISOString() });
        const tasks = await App.features.get('followups').loadTasks();
        return { tasks, task: await DB.getTask(taskIds[0]), visit: await DB.getAppointment(id), settings: await DB.db.settings.toArray() };
      }, { id, taskIds });
      assert(!expired.tasks.some(t => ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind)));
      assert.equal(expired.task.resolutionReason, 'previsit_window_closed');
      assert.equal(!!expired.visit.dayBeforeSent, false);
      assert(expired.settings.some(s => s.key.startsWith('communication-draft:')));
      assert(expired.visit.communicationArchive?.length > 0);
      console.log(`PASS ${engine.name()}: stale button rechecks timing, single combined purpose, snooze/history/reload, expiry archive, saved draft retained, no sent evidence`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
