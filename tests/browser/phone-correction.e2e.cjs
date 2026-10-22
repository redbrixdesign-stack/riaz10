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
      const seeded = await page.evaluate(async () => {
        const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Correction', phone: '07700900123' });
        const visit = await DB.addAppointment({ customerId: customer.id, clientName: 'SYNTHETIC Correction', phone: customer.phone, type: 'fitting', date: new Date(Utils.getTomorrow().getTime() + 10 * 3600000).toISOString(), status: 'confirmed' });
        await DB.recordVisitContact(visit.id, 'introduced_and_agreed', DB.visitContactSnapshot(visit), 'synthetic-original');
        const original = JSON.stringify((await DB.getAppointment(visit.id)).contactOutcomes[0]);
        App.navigate('appointments', { id: visit.id }); return { id: visit.id, original };
      });
      await page.getByRole('button', { name: 'Phone contact / history', exact: true }).click();
      await page.getByText('Recorded phone contact', { exact: true }).click();
      await page.getByRole('button', { name: 'Correct record: Introduced myself and agreed the visit', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel phone correction', exact: true }).click();
      assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).contactOutcomes.length, seeded.id), 1);
      await page.getByRole('button', { name: 'Correct record: Introduced myself and agreed the visit', exact: true }).click();
      await page.getByRole('button', { name: 'Retract incorrect record', exact: true }).click();
      await page.getByText('Due now (1)', { exact: true }).waitFor();
      let state = await page.evaluate(async id => ({ visit: await DB.getAppointment(id), tasks: await App.features.get('followups').loadTasks() }), seeded.id);
      assert.equal(state.visit.contactOutcomes.length, 2);
      assert.equal(JSON.stringify(state.visit.contactOutcomes[0]), seeded.original);
      assert.equal(state.tasks.find(t => t.appointment?.id === seeded.id)?.kind, 'intro_confirmation');
      assert(!state.visit.introSent && !state.visit.dayBeforeSent);
      await page.reload(); await page.waitForFunction(() => !!App.currentHash);
      await page.evaluate(id => App.navigate('appointments', { id }), seeded.id);
      await page.getByRole('button', { name: 'Phone contact / history', exact: true }).click();
      await page.getByText('Recorded phone contact', { exact: true }).click();
      await page.getByText('Retracted (history retained)', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: /Correct record:/ }).count(), 0);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/private/tmp/beelo-phone-correction-${engine.name()}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Close phone contact', exact: true }).click();
      await page.evaluate(async id => {
        const visit = await DB.getAppointment(id);
        await DB.recordVisitContact(id, 'introduced_and_agreed', DB.visitContactSnapshot(visit), 'synthetic-replacement');
        await DB.updateAppointment(id, { introSent: true, dayBeforeSent: true }); // Mock independent sent evidence, no handoff.
        await App.features.get('followups').openContactCorrection(id, 'synthetic-replacement');
      }, seeded.id);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await context.setOffline(true);
      await page.evaluate(() => {
        globalThis.__originalPhoneRetraction = DB.retractVisitContact;
        DB.retractVisitContact = async () => { throw new Error('SYNTHETIC storage failure'); };
      });
      await page.getByRole('button', { name: 'Retract incorrect record', exact: true }).click();
      await page.getByRole('alert').getByText('SYNTHETIC storage failure', { exact: true }).waitFor();
      assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).contactOutcomes.length, seeded.id), 3);
      assert.equal(await page.getByRole('button', { name: 'Retract incorrect record', exact: true }).evaluate(button => {
        const r = button.getBoundingClientRect(), x = r.left + r.width / 2;
        return [r.top + 4, r.top + r.height / 2, r.bottom - 4].every(y => document.elementFromPoint(x, y)?.closest('button') === button);
      }), true, 'Offline banners and toasts do not cover any tested part of the confirmation button');
      await page.screenshot({ path: `/private/tmp/beelo-phone-correction-offline-${engine.name()}.png`, fullPage: true });
      await page.evaluate(() => { DB.retractVisitContact = globalThis.__originalPhoneRetraction; });
      await page.getByRole('button', { name: 'Retract incorrect record', exact: true }).click();
      await page.getByText('All caught up.', { exact: true }).waitFor();
      if (engine === chromium) { await page.reload(); await page.waitForFunction(() => !!App.currentHash); }
      state = await page.evaluate(async id => ({ visit: await DB.getAppointment(id), tasks: await App.features.get('followups').loadTasks() }), seeded.id);
      assert.equal(state.visit.contactOutcomes.length, 4);
      assert(state.visit.introSent && state.visit.dayBeforeSent);
      assert(!state.tasks.some(t => ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind)));
      console.log(`PASS ${engine.name()}: cancel unchanged, explicit retraction, original preserved, reminder returns, reload/history, offline correction, sent evidence preserved${engine === chromium ? ', offline reload' : '; WebKit offline reload remains unverified'}`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
