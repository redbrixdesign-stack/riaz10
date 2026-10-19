const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{localStorage.setItem('advisoros_enc_test','1');localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 await page.goto('http://localhost:8022');await page.waitForFunction(()=>App.currentHash==='today');
 const id=await page.evaluate(async()=>{
 const c=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Referral'});
 const a=await DB.addAppointment({customerId:c.id,type:'measure',date:new Date().toISOString()});
 return (await DB.completeVisitOutcome({appointmentId:a.id,appointmentFields:{status:'completed',outcome:'measured',surveyOrderValue:1000,visitEarnings:80,visitEarningsKind:'survey_commission'}})).order.id;
 });
 await page.evaluate(()=>App.navigate('orders'));await page.waitForFunction(()=>App.currentHash==='orders');await page.waitForTimeout(400);
 assert.match(await page.locator('#main').innerText(),/payment managed externally/);
 assert.equal(await page.evaluate(()=>OrdersFeature.displayStage({source:'survey_referral',balanceDue:0,stage:'ordered'})),'ordered');
 await page.locator('[data-action="OrdersFeature.openOrderSheet"]').click();
 await page.getByText('Payment is managed externally. Beelo has not recorded this order as paid.').waitFor();
 assert.equal(await page.locator('[data-action="OrdersFeature.recordFullPayment"]').count(),0);
 assert.match(await page.locator('#bottom-sheet').innerText(),/Survey earnings\s*£80\.00/i);
 await page.getByRole('button',{name:'Delivered',exact:true}).click();
 await page.waitForFunction(async id=>(await DB.db.orders.get(id)).stage==='delivered',id);
 await page.reload();await page.waitForFunction(()=>App.currentHash==='orders');
 assert.match(await page.locator('#main').innerText(),/payment managed externally/);
 await page.locator('[data-action="OrdersFeature.openOrderSheet"]').click();
 await page.getByRole('button',{name:'Schedule fitting',exact:true}).click();
 await page.locator('#fitting-date').waitFor();
 console.log('PASS referral board/detail, saved survey earnings, no payment action, stage persistence and fitting prompt');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
