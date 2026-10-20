const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
    await context.addInitScript(() => {
      localStorage.setItem('advisoros_enc_test', '1');
      localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
      localStorage.setItem('advisoros_consent', JSON.stringify({ v: 2 }));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto('http://localhost:8022');
    await page.waitForFunction(() => App.currentHash === 'today');
    const fixture = await page.evaluate(async () => {
      const day = Utils.formatDate(Utils.getTomorrow(), 'iso');
      const date = AppointmentsFeature.proposalInstant(day, '09:00');
      const c = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Proposal', phone: '07700900111' });
      const visit = await DB.addAppointment({ customerId: c.id, clientName: 'SYNTHETIC Proposal', type: 'consultation', date, durationSlots: 1, dayBeforeSent: true });
      const other = await DB.addAppointment({ clientName: 'SYNTHETIC Clash', type: 'consultation', date: AppointmentsFeature.proposalInstant(day, '10:00'), durationSlots: 1 });
      return { id: visit.id, date, other: other.id };
    });
    const open = () => page.evaluate(id => AppointmentsFeature.openTimeProposal(id), fixture.id);
    await open();
    await page.locator('#proposal-time').fill('10:00');
    await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
    await page.locator('#proposal-agreed').waitFor();
    assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).date, fixture.id), fixture.date);
    await page.getByRole('button', { name: 'Review agreed booking change', exact: true }).click();
    assert.equal(await page.locator('#move-time').count(), 0);
    await page.locator('#proposal-agreed').check();
    await page.getByRole('button', { name: 'Review agreed booking change', exact: true }).click();
    await page.getByRole('button', { name: 'Save New Time', exact: true }).click();
    await page.getByText('That time clashes with another visit.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).date, fixture.id), fixture.date);
    await page.evaluate(() => App.closeModal());
    await open();
    await page.locator('#proposal-time').fill('11:00');
    await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
    await page.locator('#proposal-agreed').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
    await page.screenshot({ path: '/private/tmp/beelo-time-proposal.png', fullPage: true, animations: 'disabled' });
    await page.reload();
    await page.waitForFunction(() => !!App.currentHash);
    await open();
    assert.equal(await page.locator('#proposal-time').inputValue(), '11:00');
    await page.locator('#proposal-agreed').check();
    await page.getByRole('button', { name: 'Review agreed booking change', exact: true }).click();
    await page.getByRole('button', { name: 'Save New Time', exact: true }).click();
    await page.getByText('Visit moved', { exact: true }).or(page.getByRole('button', { name: 'Save anyway', exact: true })).first().waitFor().catch(async error => { console.log(await page.locator('body').innerText()); throw error; });
    if (await page.getByRole('button', { name: 'Save anyway', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Save anyway', exact: true }).click();
    }
    await page.getByText('Visit moved', { exact: true }).waitFor();
    const result = await page.evaluate(async id => {
      const a = await DB.getAppointment(id);
      return { time: Utils.formatTime(a.date), sent: a.dayBeforeSent, notes: a.notes, date: a.date, proposal: a.timeProposal };
    }, fixture.id);
    assert.equal(result.time, '11:00', JSON.stringify(result)); // Correct UK instant despite New York device timezone.
    assert.equal(result.sent, false);
    assert.match(result.notes, /Customer explicitly agreed/);
    // A later external booking edit makes a pending proposal stale, never agreed.
    await open();
    await page.locator('#proposal-time').fill('12:00');
    await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
    await page.locator('#proposal-agreed').waitFor();
    await page.evaluate(async id => {
      const a = await DB.getAppointment(id);
      await DB.updateAppointment(id, { date: new Date(Date.parse(a.date) + 900000).toISOString() });
    }, fixture.id);
    await open();
    assert(await page.locator('#proposal-agreed').isDisabled());
    await page.getByRole('button', { name: 'Discard proposal — keep booking', exact: true }).click();
    await page.locator('#tomorrow-plan').waitFor();
    assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).timeProposal, fixture.id), null);
    console.log('PASS proposal persists without booking mutation; explicit agreement; overlap block; UK time on US device; agreed history; stale guard; discard');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
