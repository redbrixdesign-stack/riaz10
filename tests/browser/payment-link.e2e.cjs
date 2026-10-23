const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BEELO_TEST_URL || 'http://127.0.0.1:8023';
(async () => {
 for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
   const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
   // Synthetic "now" visits otherwise trigger the independent visit-alert
   // sheet while this test is deliberately keeping an outcome form open.
   await context.addInitScript(() => { localStorage.setItem('advisoros_enc_test','1'); localStorage.setItem('advisoros_visit_reminders_enabled','false'); localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true})); localStorage.setItem('advisoros_consent',JSON.stringify({v:2})); });
   const page = await context.newPage(); const errors = [], posts = [];
   page.on('pageerror', e => errors.push(e.message));
   page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
   await page.goto(base); await page.waitForFunction(() => App.currentHash === 'today');
   const ids = await page.evaluate(async () => {
    const c = await DB.addCustomer({ firstName:'SYNTHETIC',lastName:'Payment Link' });
    const a = await DB.db.orders.add({ customerId:c.id,orderNumber:'SYNTHETIC-OLDER',total:500,balanceDue:500,depositPaid:0,stage:'ordered',createdAt:'2020-01-01' });
    const b = await DB.db.orders.add({ customerId:c.id,orderNumber:'SYNTHETIC-NEWER',total:900,balanceDue:900,depositPaid:0,stage:'ordered',createdAt:'2099-01-01' });
    const fit = await DB.addAppointment({ customerId:c.id,clientName:'SYNTHETIC Payment Link',type:'fitting',orderId:a,date:new Date().toISOString() });
    return { customer:c.id,a,b,fit:fit.id };
   });
   const open = async (id, outcome = 'completed') => {
    await page.evaluate(id => App.navigate('appointments',{id}),id);
    await page.waitForFunction(id => App.currentHash === `appointments?id=${id}`,id);
    await page.waitForTimeout(400);
    await page.evaluate(([id,outcome]) => AppointmentsFeature.captureOutcome(id,outcome),[id,outcome]);
    await page.locator('#outcome-save').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
    await page.waitForTimeout(500);
   };
   const balances = () => page.evaluate(async ids => [(await DB.db.orders.get(ids.a)).balanceDue,(await DB.db.orders.get(ids.b)).balanceDue],ids);
   await open(ids.fit);
   assert.equal(await page.locator('#outcome-payment').inputValue(),'500');
   assert.equal(await page.locator('#outcome-payment').getAttribute('data-order-id'),String(ids.a));
   await page.getByText(/balance on SYNTHETIC-OLDER/).waitFor();
   await page.screenshot({path:`/private/tmp/beelo-payment-link-${engine.name()}.png`});
   await page.locator('#outcome-payment').fill('100');
   await page.evaluate(id => Promise.all([AppointmentsFeature.saveOutcome(id,'completed'),AppointmentsFeature.saveOutcome(id,'completed')]),ids.fit);
   assert.deepEqual(await balances(),[400,900],'Double tap records one payment on explicit order');
   await page.reload(); await page.waitForFunction(() => !!App.currentHash);
   assert.deepEqual(await balances(),[400,900],'Correct allocation persists after reload');
   const stale = await page.evaluate(async ids => (await DB.addAppointment({customerId:ids.customer,type:'fitting',orderId:ids.a,date:new Date().toISOString()})).id,ids);
   await open(stale); await page.locator('#outcome-payment').fill('100');
   await page.evaluate(async ([id,target]) => DB.updateAppointment(id,{orderId:target}),[stale,ids.b]);
   await page.locator('#outcome-save').click({ timeout: 10000 });
   await page.locator('#outcome-payment-error').getByText('The linked order changed. Reopen the outcome before recording a payment.',{exact:true}).waitFor();
   assert.deepEqual(await balances(),[400,900]);
   assert.equal(await page.evaluate(async id => (await DB.getAppointment(id)).status,stale),'confirmed');
   assert.equal(await page.locator('#outcome-save').isEnabled(),true);
   await page.screenshot({path:`/private/tmp/beelo-payment-link-stale-${engine.name()}.png`});
   await page.evaluate(async ([id,target]) => DB.updateAppointment(id,{orderId:target}),[stale,ids.a]);
   await context.setOffline(true);
   await page.waitForFunction(() => document.getElementById('offline-banner')?.offsetHeight > 0);
   await page.screenshot({path:`/private/tmp/beelo-payment-link-offline-${engine.name()}.png`});
   await page.locator('#outcome-save').click();
   await page.waitForFunction(async id => (await DB.getAppointment(id)).status === 'completed',stale);
   assert.deepEqual(await balances(),[300,900],'Safe retry can save offline');
   await context.setOffline(false);
   const unlinked = await page.evaluate(async id => (await DB.addAppointment({customerId:id,type:'fitting',date:new Date().toISOString()})).id,ids.customer);
   await open(unlinked); assert.equal(await page.locator('#outcome-payment').count(),0);
   await page.getByText(/No order is linked to this fitting/).waitFor();
   await page.locator('#outcome-save').click();
   await page.waitForFunction(async id => (await DB.getAppointment(id)).status === 'completed',unlinked);
   assert.deepEqual(await balances(),[300,900]);
   const referred = await page.evaluate(async id => {
    const orderId=await DB.db.orders.add({customerId:id,total:1000,balanceDue:0,source:'survey_referral',stage:'ordered'});
    return (await DB.addAppointment({customerId:id,type:'fitting',orderId,date:new Date().toISOString()})).id;
   },ids.customer);
   await open(referred); assert.equal(await page.locator('#outcome-payment').count(),0);
   await page.getByText('Payment is managed externally for this referred order. No customer payment is recorded here.',{exact:true}).waitFor();
   await page.locator('#outcome-save').click();
   const sale = await page.evaluate(async id => (await DB.addAppointment({customerId:id,type:'consultation',date:new Date().toISOString()})).id,ids.customer);
   await open(sale,'ordered'); await page.locator('#outcome-value').fill('1000'); await page.locator('#outcome-payment').fill('200');
   await page.locator('#outcome-save').click(); await page.locator('#fitting-date').waitFor();
   const saleBalance=await page.evaluate(async id => (await DB.db.orders.where('appointmentId').equals(id).first()).balanceDue,sale);
   assert.equal(saleBalance,800); assert.deepEqual(await balances(),[300,900]);
   assert.deepEqual(posts,[]); assert.deepEqual(errors,[]);
   console.log(`PASS ${engine.name()}: older fitting link, correct partial payment, double tap/reload, stale-link rejection/retry offline, unlinked completion, external referral, sale deposit on own order; no requests sent`);
  } finally { await browser.close(); }
 }
})().catch(e => {console.error(e);process.exitCode=1;});
