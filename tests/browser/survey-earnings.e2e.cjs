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
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.BASE_URL || 'http://localhost:8023');
  await page.waitForFunction(() => typeof DB !== 'undefined' && App.currentHash === 'today');
  const id = await page.evaluate(async () => {
   CONFIG.commission = { mode: 'two_stage', saleReductionRate: 20, netCommissionRate: 15.25 };
   if (TaxCalculator.estimateSurveyCommission(1000) !== 106) throw Error('Two-stage calculation');
   CONFIG.commission = { mode: 'simple', simpleRate: 10 };
   if (TaxCalculator.estimateSurveyCommission(1000) !== 80) throw Error('Simple calculation');
   CONFIG.commission.simpleRate = 1;
   if (TaxCalculator.estimateSurveyCommission(1000) !== 0) throw Error('Rate floor');
   CONFIG.commission.simpleRate = 10;
   const customer = await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'New Referral', fullName: 'SYNTHETIC New Referral' });
   return (await DB.addAppointment({ customerId: customer.id, clientName: 'SYNTHETIC New Referral', type: 'measure', date: new Date().toISOString() })).id;
  });
  await page.evaluate(id => AppointmentsFeature.captureOutcome(id, 'measured'), id);
  await page.locator('#survey-value').fill('1000');
  await page.locator('#survey-value').blur();
  assert.match(await page.locator('#survey-commission').innerText(), /80/);
  await page.getByRole('button', { name: 'Save Outcome', exact: true }).click();
  await page.locator('#fitting-date').waitFor();
  const saved = await page.evaluate(async id => {
   const a = await DB.getAppointment(id);
   return { a, order: await DB.db.orders.get(a.orderId) };
  }, id);
  assert.equal(saved.a.visitEarnings, 80);
  assert.equal(saved.order.source, 'survey_referral');
  assert.equal(saved.order.balanceDue, 0);
  await page.getByRole('button', { name: 'Date not agreed yet', exact: true }).click();
  await page.waitForFunction(() => App.currentHash.startsWith('orders'));
  await page.locator('.toast').waitFor({ state: 'detached' });
  const serviceId = await page.evaluate(async customerId => (await DB.addAppointment({ customerId, type: 'service_call', date: new Date().toISOString() })).id, saved.a.customerId);
  await page.evaluate(id => App.navigate('appointments', { id }), serviceId);
  await page.waitForFunction(id => App.currentHash === `appointments?id=${id}`, serviceId);
  await page.waitForTimeout(400);
  await page.evaluate(id => AppointmentsFeature.captureOutcome(id, 'resolved'), serviceId);
  await page.getByRole('button', { name: 'Save Outcome', exact: true }).click();
  await page.waitForFunction(async id => (await DB.getAppointment(id)).visitEarnings === 20, serviceId);
  await page.evaluate(() => { window.location.hash = 'today'; });
  await page.reload();
  await page.waitForFunction(() => typeof DB !== 'undefined' && App.currentHash === 'today');
  const stats = await page.evaluate(() => DB.getWeekStats(new Date(Date.now() - 86400000).toISOString(), new Date(Date.now() + 86400000).toISOString()));
  assert.equal(stats.earnings, 100);
  assert.equal(stats.sales, 0);
  assert.equal(stats.orderedCount, 0);
  await page.evaluate(async id => { await App.navigate('appointments', { id }); }, serviceId);
  await page.getByRole('button', { name: 'Change outcome', exact: true }).waitFor();
  await page.waitForTimeout(400);
  await page.evaluate(id => AppointmentsFeature.captureOutcome(id, 'customer_no_show'), serviceId);
  await page.getByRole('button', { name: 'Save Outcome', exact: true }).click();
  await page.waitForFunction(async id => (await DB.getAppointment(id)).visitEarnings === 0, serviceId);
  assert.deepEqual(errors, []);
  console.log('PASS survey referral, commission bases, fitting prompt, service fee, reload, no duplicate sales and no-show reversal');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
