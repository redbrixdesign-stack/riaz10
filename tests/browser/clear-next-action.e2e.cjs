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
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(process.env.BEELO_TEST_URL || 'http://localhost:8022');
      await page.waitForFunction(() => App.currentHash === 'today');
      await page.evaluate(async () => {
        const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Next Action', phone: '07700900123' });
        const date = new Date(Utils.getTomorrow().getTime() + 10 * 3600000).toISOString();
        await DB.addAppointment({ customerId: customer.id, clientName: 'SYNTHETIC Next Action', phone: customer.phone, type: 'measure', date, status: 'confirmed' });
        await TaskService.create({ title: 'SYNTHETIC manual due', dueAt: new Date(Date.now() - 10000).toISOString() });
        await TaskService.create({ title: 'SYNTHETIC manual later', dueAt: date });
        App.navigate('followups');
      });
      await page.getByText('Due now (2)', { exact: true }).waitFor();
      assert.equal(await page.locator('.fup-card:visible .fup-primary > button').count(), 2);
      assert.equal(await page.locator('.fup-card:visible .fup-primary > button.btn-primary').count(), 2);
      assert.equal(await page.locator('.fup-options[open]').count(), 0);
      assert.equal(await page.getByText('SYNTHETIC manual later', { exact: true }).isVisible(), false);
      await page.getByRole('button', { name: 'Review introduction & confirmation', exact: true }).click();
      await page.locator('#talk-message-preview').fill('SYNTHETIC adviser-reviewed text');
      await page.getByRole('button', { name: 'Close message preview' }).click();
      await page.getByRole('button', { name: 'Resume saved messages', exact: true }).click();
      await page.getByRole('button', { name: /Resume draft/ }).click();
      assert.equal(await page.locator('#talk-message-preview').inputValue(), 'SYNTHETIC adviser-reviewed text');
      await page.getByRole('button', { name: 'Close message preview' }).click();
      await page.getByRole('button', { name: 'Close', exact: true }).click(); // Return from the saved-drafts list.
      const manual = page.getByRole('article', { name: 'Follow-up: SYNTHETIC manual due', exact: true });
      await manual.getByRole('button', { name: 'Complete SYNTHETIC manual due', exact: true }).click();
      await page.getByText('Due now (1)', { exact: true }).waitFor();
      const visit = page.getByRole('article', { name: 'Follow-up: SYNTHETIC Next Action', exact: true }).first();
      await visit.locator('summary').click();
      await visit.getByRole('button', { name: 'Snooze SYNTHETIC Next Action', exact: true }).click();
      await page.locator('#task-snooze-until').fill('2099-01-01T12:00');
      await page.getByRole('button', { name: 'Snooze', exact: true }).click();
      await page.getByText('Snoozed (1)', { exact: true }).waitFor();
      await page.reload();
      await page.waitForFunction(() => !!App.currentHash);
      await page.evaluate(() => App.navigate('followups'));
      const snoozed = page.getByText('Snoozed (1)', { exact: true });
      await snoozed.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Review introduction & confirmation', exact: true }).waitFor();
      await page.getByText('Not due yet (1)', { exact: true }).click();
      await page.getByText('SYNTHETIC manual later', { exact: true }).waitFor();
      await page.setViewportSize({ width: 320, height: 740 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `/private/tmp/beelo-clear-next-action-${engine.name()}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine.name()}: single action, draft review/resume, manual completion, snooze/reload, keyboard expansion, 320px layout, no page errors`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
