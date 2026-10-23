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
   localStorage.setItem('advisoros_enc_test','1');localStorage.setItem('advisoros_visit_reminders_enabled','false');
   localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));
  });
  const page=await context.newPage(),errors=[],posts=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.goto(base);
  if(new URL(base).protocol==='https:'){
   await page.locator('#enc-passphrase-new').fill('SYNTHETIC-reminder-lifecycle');await page.locator('#enc-passphrase-confirm').fill('SYNTHETIC-reminder-lifecycle');
   await page.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  }
  await page.waitForFunction(()=>App.currentHash==='today');
  const record=await page.evaluate(async()=>{
   const customer=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Lifecycle',notes:'SYNTHETIC retained context'});
   const visit=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Lifecycle',type:'measure',introSent:true,dayBeforeSent:true,date:new Date(Date.now()+10*60000).toISOString()});
   window._syntheticReminderNow=Date.now;
   localStorage.setItem('advisoros_visit_reminders_enabled','true');
   await NotificationService._fireVisitReminder(visit.id,NotificationService._visitReminderKey(visit));
   return {id:visit.id,customer:customer.id,at:new Date(visit.date).getTime(),before:JSON.stringify(await DB.db.appointments.get(visit.id))};
  });
  await page.getByRole('heading',{name:/Next appointment/}).waitFor();
  await page.evaluate(at=>{Date.now=()=>at+16*60000;document.dispatchEvent(new Event('visibilitychange'));},record.at);
  await page.getByRole('heading',{name:/Next appointment/}).waitFor({state:'hidden'});
  assert.equal(await page.getByRole('heading',{name:/Next appointment/}).count(),0,'Expired owned reminder must retire on resume refresh');
  assert.equal(await page.evaluate(async id=>JSON.stringify(await DB.db.appointments.get(id)),record.id),record.before);
  const reopen=async()=>page.evaluate(async id=>{
   Date.now=window._syntheticReminderNow;App.closeModal({all:true});await NotificationService._refreshOpenVisitReminder();
   localStorage.removeItem('advisoros_visit_reminders_delivered');localStorage.setItem('advisoros_visit_reminders_enabled','true');
   const visit=await DB.getAppointment(id);await NotificationService._fireVisitReminder(id,NotificationService._visitReminderKey(visit));
  },record.id);
  const editor='<h3>SYNTHETIC editor</h3><label for="c12-draft">Unsaved note</label><textarea id="c12-draft"></textarea><label for="c12-value">Unsaved value</label><input id="c12-value"><label><input id="c12-check" type="checkbox">Synthetic choice</label>';
  await page.evaluate(html=>App.openModal(html),editor);
  await page.locator('#c12-draft').fill('UNSAVED synthetic measurements');await page.locator('#c12-value').fill('731');await page.locator('#c12-check').check();
  await page.evaluate(async id=>{
   window._syntheticKeptField=document.getElementById('c12-draft');Date.now=window._syntheticReminderNow;
   localStorage.removeItem('advisoros_visit_reminders_delivered');const visit=await DB.getAppointment(id);
   await NotificationService._fireVisitReminder(id,NotificationService._visitReminderKey(visit));
  },record.id);
  assert.equal(await page.getByRole('heading',{name:/Next appointment/}).count(),0,'Reminder never overlays an active editor');
  assert(await page.evaluate(()=>window._syntheticKeptField===document.getElementById('c12-draft')),'Editor DOM retained');
  assert.equal(await page.locator('#c12-draft').inputValue(),'UNSAVED synthetic measurements');assert.equal(await page.locator('#c12-value').inputValue(),'731');assert(await page.locator('#c12-check').isChecked());
  await reopen();
  const previous=await page.evaluate(html=>{
   App.openModal('<h3>SYNTHETIC previous panel</h3>');App.openModal(html);
   return App.modalStack.at(-1).content;
  },editor);
  await page.locator('#c12-draft').fill('UNSAVED retained while reminder expires');await page.locator('#c12-check').check();
  await page.evaluate(async at=>{window._syntheticKeptField=document.getElementById('c12-draft');Date.now=()=>at+16*60000;await NotificationService.refreshVisitReminders();},record.at);
  assert(await page.evaluate(()=>window._syntheticKeptField===document.getElementById('c12-draft')));
  assert.equal(await page.locator('#c12-draft').inputValue(),'UNSAVED retained while reminder expires');assert(await page.locator('#c12-check').isChecked());
  assert.deepEqual(await page.evaluate(()=>App.modalStack.map(frame=>frame.content)),[previous],'Only expired reminder snapshot removed');
  await page.waitForFunction(()=>document.querySelectorAll('.toast').length===0);
  await page.screenshot({path:artifactPath(`beelo-reminder-form-preserved-${engine.name()}.png`),animations:'disabled'});
  await page.evaluate(()=>App.closeModal());await page.getByRole('heading',{name:'SYNTHETIC previous panel',exact:true}).waitFor();
  await page.evaluate(()=>App.closeModal());assert.equal(await page.getByRole('heading',{name:/Next appointment/}).count(),0,'Expired snapshot cannot return after editor closes');
  await reopen();await page.evaluate(()=>App.openFullModal('<h3>SYNTHETIC full editor</h3><label for="c12-full">Unsaved full-screen note</label><textarea id="c12-full"></textarea>'));
  await page.locator('#c12-full').fill('UNSAVED full-screen context');
  const fullState=await page.evaluate(async at=>{
   const field=document.getElementById('c12-full'),trap=App._focusTrapEl,overflow=document.body.style.overflow;
   Date.now=()=>at+16*60000;await NotificationService.refreshVisitReminders();
   return {sameField:field===document.getElementById('c12-full'),sameTrap:trap===App._focusTrapEl,sameOverflow:overflow===document.body.style.overflow,focused:document.activeElement===field};
  },record.at);
  assert.deepEqual(fullState,{sameField:true,sameTrap:true,sameOverflow:true,focused:true});
  assert.equal(await page.locator('#c12-full').inputValue(),'UNSAVED full-screen context');
  await page.evaluate(()=>App.closeFullModal());assert.equal(await page.getByRole('heading',{name:/Next appointment/}).count(),0,'Expired covered sheet cannot return after full-screen editor closes');
  await reopen();await page.evaluate(()=>NotificationService.setVisitReminderEnabled(false));
  assert.equal(await page.getByRole('heading',{name:/Next appointment/}).count(),0,'Disabling retires visible reminder');
  await reopen();await page.evaluate(id=>DB.updateAppointment(id,{status:'cancelled'}),record.id);
  await page.getByRole('heading',{name:/Next appointment/}).waitFor({state:'hidden'});
  assert.equal(await page.evaluate(async id=>(await DB.getAppointment(id)).status,record.id),'cancelled','Only the explicit test cancellation changes booking state');
  assert.equal(await page.evaluate(async id=>(await DB.getCustomer(id)).notes,record.customer),'SYNTHETIC retained context');
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: resume expiry, active editor protection, hidden reminder-only stack removal, no resurrection, disabling and booking cancellation; unsaved values/DOM/context retained; no uploads`);
 }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
