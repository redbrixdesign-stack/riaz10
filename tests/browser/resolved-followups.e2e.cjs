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
      const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Resolution', phone: '07700900123' });
      const date = new Date(Utils.getTomorrow().getTime() + 10 * 3600000).toISOString();
      const visit = await DB.addAppointment({ customerId: customer.id, clientName: 'SYNTHETIC Resolution', type: 'measure', date, status: 'confirmed' });
      const task = await TaskService.createFromSuggestion({ kind: 'intro_confirmation', appointment: visit, action: 'SYNTHETIC reminder' }, { snoozedUntil: date });
      const manual = await TaskService.create({ title: 'SYNTHETIC submit final measurements and agree fitting', appointmentId: visit.id, dueAt: date });
      await DB.updateAppointment(visit.id, { outcome: 'measured' });
      await App.features.get('followups').loadTasks();
      return { task: task.id, visit: visit.id, manual: manual.id };
    });
    await page.reload();
    await page.waitForFunction(() => !!App.currentHash);
    const result = await page.evaluate(async ids => ({
      task: await DB.getTask(ids.task), manual: await DB.getTask(ids.manual),
      visit: await DB.getAppointment(ids.visit),
      events: await DB.db.taskEvents.toArray(), tasks: await App.features.get('followups').loadTasks()
    }), ids);
    assert.equal(result.task.status, 'completed');
    assert.equal(result.task.resolutionReason, 'visit_concluded');
    assert.equal(result.manual.status, 'open');
    assert.equal(!!result.visit.introSent, false);
    assert.equal(!!result.visit.dayBeforeSent, false);
    assert.equal(result.events.filter(e => e.taskId === ids.task && e.type === 'source_resolved').length, 1);
    assert(!result.tasks.some(t => t.appointment?.id === ids.visit && ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind)));
    await page.evaluate(() => App.navigate('followups'));
    await page.getByText('SYNTHETIC submit final measurements and agree fitting', { exact: false }).first().waitFor();
    await page.waitForTimeout(700); // Allow the page-entry opacity transition to finish for evidence.
    await page.screenshot({ path: '/private/tmp/beelo-resolved-followups.png', fullPage: true });
    console.log('PASS real IndexedDB resolution, audit event, reload persistence, manual submission/fitting work retained, no invented sent evidence');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
