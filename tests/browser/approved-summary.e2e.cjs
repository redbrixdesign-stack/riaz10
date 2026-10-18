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
    const page = await context.newPage(); const errors = []; const uploads = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (req.method() === 'POST') uploads.push(req.url()); });
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8022');
    await page.waitForFunction(() => typeof DB !== 'undefined' && App.currentHash === 'today');
    console.log('App ready');
    const ids = await page.evaluate(async () => {
      const c = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Summary Test' });
      const a = await DB.addAppointment({ customerId: c.id, type: 'survey', date: '2020-01-01', status: 'completed', notes: 'Keep original', audioNotes: [{ id: 'synthetic-audio', mediaType: 'audio/wav', dataUrl: 'data:audio/wav;base64,UklGRg==', transcript: 'Requirement: Blackout\nObservation: Width 1200 mm\nMissing: Drop' }] });
      App.navigate('appointments', { id: a.id }); return { a: a.id, c: c.id };
    });
    await page.getByRole('button', { name: 'Review visit summary (local pilot)' }).click();
    console.log('Summary opened');
    await context.setOffline(true);
    await page.locator('#summary-audio').selectOption('0');
    await page.getByRole('button', { name: 'Prepare local review', exact: true }).click();
    assert.equal(await page.locator('#summary-observations').inputValue(), 'Width 1200 mm');
    await page.locator('#summary-save').click();
    assert.equal(await page.evaluate(async id => !!(await DB.getAppointment(id)).approvedVisitSummary, ids.a), false);
    await page.locator('#summary-approved').check();
    await page.locator('#summary-next').fill('Confirm control side');
    assert.equal(await page.locator('#summary-approved').isChecked(), false);
    await page.locator('#summary-approved').check();
    await page.locator('#summary-save').click();
    await page.waitForFunction(async id => !!(await DB.getAppointment(id)).approvedVisitSummary, ids.a);
    console.log('Summary saved');
    assert.equal(await page.evaluate(async id => typeof (await DB.db.appointments.get(id)).approvedVisitSummary, ids.a), 'object');
    await page.evaluate(id => App.navigate('customer', { id }), ids.c);
    await page.getByRole('heading', { name: 'Approved visit summary' }).waitFor();
    assert.match(await page.locator('#main').innerText(), /Confirm control side/);
    await page.waitForFunction(() => !document.getElementById('modal-overlay').classList.contains('active') && [...document.querySelectorAll('#main .fade-in')].every(el => Number(getComputedStyle(el).opacity) === 1));
    await context.setOffline(false);
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
    if (process.env.SCREENSHOT) await page.getByRole('heading', { name: 'Approved visit summary' }).locator('..').screenshot({ path: process.env.SCREENSHOT, animations: 'disabled' });
    await page.evaluate(async id => { await DB.updateAppointment(id, { audioNotes: [] }); DB.db.close(); await DB.db.open(); }, ids.a);
    assert.equal(await page.evaluate(async id => { const a = await DB.getAppointment(id); return a.notes === 'Keep original' && !!a.approvedVisitSummary && a.audioNotes.length === 0; }, ids.a), true);
    assert.deepEqual(uploads, []); assert.deepEqual(errors, []);
    console.log('PASS: offline approval, encrypted save, customer visibility, DB reopen, audio deletion independent, no uploads/errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
