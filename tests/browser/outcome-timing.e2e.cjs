const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(() => {
        localStorage.setItem('advisoros_enc_test', '1');
        // Keep unrelated appointment-alert modals out of this frozen-clock timing test.
        localStorage.setItem('advisoros_visit_reminders_enabled', 'false');
        localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
        localStorage.setItem('advisoros_consent', JSON.stringify({ v: 2 }));
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-10-23T08:00:00Z'));
      await page.goto(process.env.BEELO_TEST_URL || 'http://localhost:8023');
      await page.waitForFunction(() => App.currentHash === 'today');
      const ids = await page.evaluate(async () => {
        const result = [];
        for (const [name, date, durationSlots] of [
          ['SYNTHETIC Future', '2026-10-23T09:00:00Z', 4],
          ['SYNTHETIC Ongoing', '2026-10-23T07:45:00Z', 4],
          ['SYNTHETIC Overdue', '2026-10-23T07:00:00Z', 1]
        ]) {
          const customer = await DB.addCustomer({ firstName: name });
          result.push((await DB.addAppointment({ customerId: customer.id, clientName: name, date, durationSlots, status: 'confirmed', type: 'fitting', introSent: true, dayBeforeSent: true })).id);
        }
        App.navigate('followups'); return result;
      });
      await page.getByText('Due now (1)', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Log outcome', exact: true }).filter({ visible: true }).count(), 1);
      await page.getByText('Not due yet (2)', { exact: true }).click();
      await page.getByRole('article', { name: 'Follow-up: SYNTHETIC Future', exact: true }).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `/private/tmp/beelo-outcome-timing-${engine.name()}.png` });
      await page.clock.setFixedTime(new Date('2026-10-23T08:45:00Z'));
      await page.evaluate(() => App.navigate('followups'));
      await page.getByText('Due now (2)', { exact: true }).waitFor();
      await page.evaluate(async id => {
        const task = (await App.features.get('followups').loadTasks()).find(t => t.kind === 'visit_today' && t.appointment.id === id);
        await TaskService.snooze(task, '2026-10-23T08:50:00Z');
        await DB.updateAppointment(id, { date: '2026-10-24T09:00:00Z' });
      }, ids[0]);
      await page.clock.setFixedTime(new Date('2026-10-23T09:00:00Z'));
      await page.reload();
      await page.waitForFunction(() => !!App.currentHash);
      await page.evaluate(() => App.navigate('followups'));
      await page.getByText('Due now (2)', { exact: true }).waitFor();
      let state = await page.evaluate(async id => ({ task: (await App.features.get('followups').loadTasks()).find(t => t.appointmentId === id), visit: await DB.getAppointment(id) }), ids[0]);
      assert.equal(state.task.due, false);
      assert.equal(state.task.effectiveDue, '2026-10-24T10:00:00.000Z');
      assert.equal(state.visit.status, 'confirmed');
      assert(!state.visit.outcome);
      await context.setOffline(true);
      await page.evaluate(async id => { await DB.updateAppointment(id, { status: 'completed', outcome: 'completed' }); App.navigate('followups'); }, ids[2]);
      // Completing a fitting still creates its separate aftercare purpose.
      await page.getByText('Post-fit thank-you + review ask — not sent yet', { exact: true }).waitFor();
      assert.equal((await page.evaluate(() => App.features.get('followups').loadTasks())).filter(t => t.kind === 'visit_today' && t.due).length, 1);
      assert.equal(await page.getByRole('button', { name: 'Log outcome', exact: true }).filter({ visible: true }).count(), 1);
      await context.setOffline(false);
      await page.reload(); await page.waitForFunction(() => !!App.currentHash);
      state = await page.evaluate(id => DB.getAppointment(id), ids[2]);
      assert.equal(state.status, 'completed');
      console.log(`PASS ${engine.name()}: future/ongoing not due, planned-end boundary, overdue retained, moved saved snooze/reload, explicit offline outcome clears and persists; no sending`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
