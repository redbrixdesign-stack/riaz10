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
        const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Offline Save' });
        const visit = await DB.addAppointment({ customerId: customer.id, clientName: 'SYNTHETIC Offline Save', type: 'fitting', date: new Date(Utils.getTomorrow().getTime() + 10 * 3600000).toISOString(), status: 'confirmed' });
        App.navigate('appointments', { id: visit.id });
        return visit.id;
      });
      await page.getByRole('button', { name: 'Phone contact / history', exact: true }).click();
      await context.setOffline(true);
      await page.locator('#offline-banner').waitFor({ state: 'visible' });
      await page.evaluate(() => Toast.show('SYNTHETIC notification', 'info'));
      const button = page.getByRole('button', { name: 'Save contact outcome', exact: true });
      await page.waitForTimeout(400); // Wait for the sheet's entrance transition before hit-testing.
      assert.equal(await button.evaluate(button => {
        const r = button.getBoundingClientRect();
        return [r.left + 4, r.left + r.width / 2, r.right - 4].every(x =>
          [r.top + 4, r.top + r.height / 2, r.bottom - 4].every(y =>
            document.elementFromPoint(x, y)?.closest('button') === button));
      }), true, 'Save must be unobstructed across its full target with offline banner and toast');
      await button.click();
      await page.locator('#phone-contact-error').getByText('Choose what happened', { exact: true }).waitFor();
      await page.locator('#contact-outcome').selectOption('no_answer');
      await page.evaluate(() => {
        globalThis.__originalRecordVisitContact = DB.recordVisitContact;
        DB.recordVisitContact = async () => { throw new Error('SYNTHETIC storage failure'); };
      });
      await button.click();
      await page.locator('#phone-contact-error').getByText('SYNTHETIC storage failure', { exact: true }).waitFor();
      assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).contactOutcomes?.length || 0, id), 0);
      await page.screenshot({ path: `/private/tmp/beelo-phone-save-offline-${engine.name()}.png`, fullPage: true });
      await page.evaluate(() => { DB.recordVisitContact = globalThis.__originalRecordVisitContact; });
      await button.click();
      await page.locator('#contact-outcome').waitFor({ state: 'hidden' });
      let visit = await page.evaluate(id => DB.getAppointment(id), id);
      assert.equal(visit.contactOutcomes.length, 1);
      assert.equal(visit.contactOutcomes[0].outcome, 'no_answer');
      assert(!visit.introSent && !visit.dayBeforeSent);
      assert((await page.evaluate(() => App.features.get('followups').loadTasks())).some(t => t.appointment?.id === id && ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind)));
      await context.setOffline(false);
      await page.reload();
      await page.waitForFunction(() => !!App.currentHash);
      visit = await page.evaluate(id => DB.getAppointment(id), id);
      assert.equal(visit.contactOutcomes.length, 1);
      assert(!visit.introSent && !visit.dayBeforeSent);
      // Ordinary unrelated sheets must retain their existing stack level.
      assert.equal(await page.evaluate(() => {
        App.openModal('<div class="sheet-body">SYNTHETIC unrelated sheet</div>');
        return getComputedStyle(document.querySelector('.modal-overlay.active')).zIndex;
      }), '200');
      console.log(`PASS ${engine.name()}: offline full-target save, inline validation/write failure, retry, unchanged message purposes/flags, return-online reload, unrelated modal stack preserved`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
