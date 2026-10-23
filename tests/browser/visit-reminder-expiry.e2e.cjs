'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{
   localStorage.setItem('advisoros_enc_test','1');
   localStorage.setItem('advisoros_visit_reminders_enabled','false');
   localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true}));
   localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));
  });
  const page=await context.newPage(),errors=[],posts=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
  await page.goto(base);
  if(new URL(base).protocol==='https:'){
   await page.locator('#enc-passphrase-new').fill('SYNTHETIC-reminder-test');
   await page.locator('#enc-passphrase-confirm').fill('SYNTHETIC-reminder-test');
   await page.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  }
  await page.waitForFunction(()=>App.currentHash==='today');
  const result=await page.evaluate(async()=>{
   const customer=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Reminder',notes:'SYNTHETIC context must remain intact'});
   // Already-contacted mock bookings isolate reminder behaviour from the
   // independent missed-message archiver; no actual communication is sent.
   const old=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Expired',type:'fitting',status:'confirmed',introSent:true,dayBeforeSent:true,date:new Date(Date.now()-16*60000).toISOString()});
   const due=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Due',type:'measure',status:'confirmed',introSent:true,dayBeforeSent:true,date:new Date(Date.now()+10*60000).toISOString()});
   const before=JSON.stringify(await DB.db.appointments.toArray());
   const oldKey=NotificationService._visitReminderKey(old),dueKey=NotificationService._visitReminderKey(due);
   localStorage.setItem('advisoros_visit_reminders_enabled','true');
   await NotificationService._fireVisitReminder(old.id,oldKey);
   return {customer:customer.id,old:old.id,due:due.id,oldKey,dueKey,before,oldConsumed:!!NotificationService._readDeliveredVisitReminders()[oldKey]};
  });
  assert.equal(result.oldConsumed,false);
  assert.equal(await page.getByRole('heading',{name:/Next appointment/}).count(),0,'Expired callback stays quiet');
  await page.evaluate(async r=>NotificationService._fireVisitReminder(r.due,r.dueKey),result);
  await page.getByRole('heading',{name:/Next appointment in \d+ minutes/}).waitFor();
  await page.screenshot({path:artifactPath(`beelo-reminder-due-${engine.name()}.png`),animations:'disabled'});
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await page.evaluate(async r=>{
   await Promise.all([NotificationService._fireVisitReminder(r.due,r.dueKey),NotificationService._fireVisitReminder(r.due,r.dueKey)]);
   localStorage.setItem('advisoros_visit_reminders_enabled','false');
   localStorage.removeItem('advisoros_visit_reminders_delivered');
   await NotificationService._fireVisitReminder(r.due,r.dueKey);
  },result);
  assert.equal(await page.getByRole('heading',{name:/Next appointment/}).count(),0,'Dismissed/replayed/disabled callback does not reopen');
  assert.equal(await page.evaluate(async()=>JSON.stringify(await DB.db.appointments.toArray())),result.before,'No appointment/outcome rewrite');
  assert.equal(await page.evaluate(async id=>(await DB.getCustomer(id)).notes,result.customer),'SYNTHETIC context must remain intact');
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: real DB expired reminder stays quiet; valid reminder opens; dismissal/replay/disabled callbacks stay quiet; appointments/context unchanged; no uploads`);
 }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
