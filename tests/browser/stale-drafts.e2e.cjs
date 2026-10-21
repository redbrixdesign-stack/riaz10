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
    const id = await page.evaluate(async () => {
      const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Draft Review', phone: '07700900111' });
      window.mockHandoffs = 0;
      NotificationService.sendWhatsApp = () => { window.mockHandoffs++; return false; };
      return (await DB.addAppointment({ customerId: customer.id, clientName: 'SYNTHETIC Draft Review', phone: '07700900111', type: 'consultation', date: new Date(Date.now() + 172800000).toISOString() })).id;
    });
    await page.evaluate(id => TalkFeature.sendMessage(id, 'pre_intro'), id);
    await page.locator('#talk-message-preview').fill('My handwritten wording — old appointment time.');
    await page.getByRole('button', { name: 'Close message preview' }).click();
    await page.evaluate(async id => {
      const a = await DB.getAppointment(id);
      await DB.updateAppointment(id, { date: new Date(Date.parse(a.date) + 3600000).toISOString() });
      await TalkFeature.sendMessage(id, 'pre_intro');
    }, id);
    await page.locator('#draft-booking-review').waitFor();
    assert.equal(await page.locator('#talk-message-preview').inputValue(), 'My handwritten wording — old appointment time.');
    await page.evaluate(() => TalkFeature.confirmSend());
    assert.equal(await page.evaluate(() => window.mockHandoffs), 0);
    await page.locator('#talk-message-preview').fill('My checked updated wording.');
    await page.locator('#draft-booking-checked').check();
    await page.evaluate(() => TalkFeature.confirmSend());
    assert.equal(await page.evaluate(() => window.mockHandoffs), 1);
    // A second booking change invalidates even a checked review while open.
    await page.evaluate(async id => { await DB.updateAppointment(id, { address: 'SYNTHETIC changed address' }); await TalkFeature.confirmSend(); }, id);
    assert.equal(await page.evaluate(() => window.mockHandoffs), 1);
    assert.equal(await page.locator('#draft-booking-checked').isChecked(), false);
    // A changed recipient cannot use a stale pending phone even after checking.
    await page.evaluate(async id => { const a = await DB.getAppointment(id); await DB.updateCustomer(a.customerId, { phone: '07700900222' }); await TalkFeature.confirmSend(); }, id);
    await page.locator('#draft-booking-checked').check();
    await page.evaluate(() => TalkFeature.confirmSend());
    assert.equal(await page.evaluate(() => window.mockHandoffs), 1);
    await page.getByRole('button', { name: 'Close message preview' }).click();
    await page.evaluate(id => TalkFeature.sendMessage(id, 'pre_intro'), id);
    await page.locator('#draft-booking-checked').check();
    await page.evaluate(() => TalkFeature.confirmSend());
    assert.equal(await page.evaluate(() => window.mockHandoffs), 2);
    await page.getByRole('button', { name: 'Close message preview' }).click();
    await page.evaluate(async id => {
      await DB.setPrivateSetting(`communication-draft:${id}:pre_intro`, JSON.stringify({ text: 'Legacy synthetic draft' }));
      await TalkFeature.sendMessage(id, 'pre_intro');
    }, id);
    await page.locator('#draft-booking-review').waitFor();
    await page.evaluate(() => TalkFeature.confirmSend());
    assert.equal(await page.evaluate(() => window.mockHandoffs), 2);
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
    await page.screenshot({ path: '/private/tmp/beelo-stale-draft-review.png', fullPage: true, animations: 'disabled' });
    console.log('PASS preserved text; stale and legacy gates; explicit review; concurrent booking changes; recipient refresh; no real handoff');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
