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
        const c = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Phone', phone: '07700900123' });
        const a = await DB.addAppointment({ customerId: c.id, clientName: 'SYNTHETIC Phone', phone: c.phone, type: 'fitting', date: new Date(Utils.getTomorrow().getTime() + 10 * 3600000).toISOString(), status: 'confirmed' });
        const task = (await App.features.get('followups').loadTasks()).find(t => t.kind === 'intro_confirmation');
        await TaskService.snooze(task, new Date(Date.now() + 3600000).toISOString());
        App.navigate('followups'); return a.id;
      });
      await page.getByText('Snoozed (1)', { exact: true }).click();
      await page.getByRole('article', { name: 'Follow-up: SYNTHETIC Phone', exact: true }).locator('summary').click();
      await page.getByRole('button', { name: 'Record phone contact', exact: true }).click();
      await page.locator('#contact-outcome').selectOption('no_answer');
      await page.getByRole('button', { name: 'Save contact outcome', exact: true }).click();
      await page.getByText('Snoozed (1)', { exact: true }).waitFor();
      const save = async outcome => {
        await page.evaluate(id => App.features.get('followups').openContactOutcome(id), id);
        await page.locator('#contact-outcome').selectOption(outcome);
        await page.getByRole('button', { name: 'Save contact outcome', exact: true }).click();
        await page.locator('#contact-outcome').waitFor({ state: 'hidden' });
      };
      await save('introduced');
      assert.equal(await page.evaluate(async () => (await App.features.get('followups').loadTasks()).find(t => t.appointment?.clientName === 'SYNTHETIC Phone')?.kind), 'visit_tomorrow');
      await save('visit_agreed');
      let state = await page.evaluate(async id => ({ visit: await DB.getAppointment(id), tasks: await App.features.get('followups').loadTasks(), events: await DB.db.taskEvents.toArray() }), id);
      assert(!state.tasks.some(t => ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind)));
      assert.equal(state.visit.contactOutcomes.length, 3);
      assert(!state.visit.introSent && !state.visit.dayBeforeSent);
      assert(state.events.some(e => e.details?.resolutionReason === 'phone_agreement_recorded'));
      await page.reload(); await page.waitForFunction(() => !!App.currentHash);
      await page.evaluate(id => App.navigate('appointments', { id }), id);
      await page.getByRole('button', { name: 'Phone contact / history', exact: true }).click();
      await page.getByText('Recorded phone contact', { exact: true }).click();
      await page.getByText('Visit date/time agreed', { exact: false }).last().waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/private/tmp/beelo-phone-contact-${engine.name()}.png`, fullPage: true });
      // Keep a stale form open while another screen changes the slot.
      await page.evaluate(id => DB.updateAppointment(id, { arrivalStart: '15:00', arrivalEnd: '17:00' }), id);
      await page.locator('#contact-outcome').selectOption('introduced_and_agreed');
      await page.getByRole('button', { name: 'Save contact outcome', exact: true }).click();
      await page.getByText('Visit details changed. Close and reopen this form before recording agreement.', { exact: true }).waitFor();
      state = await page.evaluate(async id => ({ visit: await DB.getAppointment(id), tasks: await App.features.get('followups').loadTasks() }), id);
      assert.equal(state.visit.contactOutcomes.length, 3);
      assert.equal(state.tasks.find(t => t.appointment?.id === id)?.kind, 'visit_tomorrow');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await context.setOffline(true);
      if (engine === chromium) { await page.reload(); await page.waitForFunction(() => !!App.currentHash); }
      else console.log('LIMIT WebKit offline reload: initial attempt hit an internal engine error; offline local-history read only, physical iPhone acceptance pending');
      assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).contactOutcomes.length, id), 3);
      console.log(`PASS ${engine.name()}: no-answer retained, introduction/slot agreement clear only their purpose, snoozed task resolved with provenance, online reload/history, changed-slot reopens reminder, stale save blocked, offline history${engine === chromium ? '/reload' : ' read only'}, no sent flags`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
