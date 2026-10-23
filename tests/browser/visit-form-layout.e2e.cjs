'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-GB',serviceWorkers:'block'});
  await context.addInitScript(()=>{
   localStorage.setItem('advisoros_enc_test','1');localStorage.setItem('advisoros_visit_reminders_enabled','false');
   localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));
  });
  const page=await context.newPage(),errors=[],posts=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.goto(base);
  if(new URL(base).protocol==='https:'){
   await page.locator('#enc-passphrase-new').fill('SYNTHETIC-form-layout');await page.locator('#enc-passphrase-confirm').fill('SYNTHETIC-form-layout');
   await page.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  }
  await page.waitForFunction(()=>App.currentHash==='today');
  await page.evaluate(()=>App.navigate('appointments',{action:'add',date:'2026-11-12',time:'14:15',type:'consultation'}));
  await page.locator('#appt-date').waitFor();
  const results=[];
  for(const [width,height] of [[320,740],[375,812],[390,844],[430,932],[480,800],[768,1024],[844,390]]){
   await page.setViewportSize({width,height});
   const result=await page.evaluate(()=>{
    const row=document.getElementById('appt-date').closest('.form-row');
    const controls=['appt-date','appt-time'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),g=e.closest('.form-group').getBoundingClientRect(),style=getComputedStyle(e);return {id,left:r.left,right:r.right,width:r.width,top:r.top,groupLeft:g.left,groupRight:g.right,boxSizing:style.boxSizing,appearance:style.appearance};});
    return {viewport:innerWidth,row:row.getBoundingClientRect().toJSON(),scrollWidth:document.documentElement.scrollWidth,controls};
   });
   results.push(result);console.log(engine.name(),JSON.stringify(result));
   assert(result.scrollWidth<=width+1,`${engine.name()} ${width}px page must not overflow horizontally`);
   for(const control of result.controls){
    assert(control.left>=-1&&control.left>=control.groupLeft-1&&control.right<=width+1&&control.right<=control.groupRight+1,`${engine.name()} ${width}px ${control.id} must fit screen and its field`);
    assert.equal(control.boxSizing,'border-box');assert.equal(control.appearance,'none');
   }
   if(width<=480){
    assert.equal(result.controls[0].left,result.controls[1].left,'Phone date/time controls stack in one column');
    assert(result.controls[1].top>result.controls[0].top,'Time follows date on phones');
    assert(result.controls.every(control=>control.width>=width-34),'Phone controls use the available content width');
   }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#appt-date').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('.toast').length===0);
  await page.screenshot({path:artifactPath(`beelo-visit-layout-${engine.name()}.png`),animations:'disabled'});
  assert.equal(await page.locator('#appt-date').inputValue(),'2026-11-12');assert.equal(await page.locator('#appt-time').inputValue(),'14:15');
  await page.locator('#appt-name').fill('SYNTHETIC Layout Visit');
  await page.locator('#appt-address').fill('7 SYNTHETIC Test Lane');
  await page.locator('#appt-notes').fill('SYNTHETIC bedroom roller; left control; no real customer');
  await page.locator('#appt-save-btn').click();
  let saved;
  try {
   await page.locator('#appt-save-btn').waitFor({state:'hidden'});
   saved=await page.evaluate(async()=>{
    const rows=await DB.db.appointments.toArray();
    return rows.length===1?DB.getAppointment(rows[0].id):null;
   });
   assert(saved,'One complete saved visit must exist');
  }
  catch(error){console.error(await page.locator('body').innerText());throw error;}
  assert.equal(saved.clientName,'SYNTHETIC Layout Visit');
  assert.equal(saved.address,'7 SYNTHETIC Test Lane');
  assert.equal(saved.notes,'SYNTHETIC bedroom roller; left control; no real customer');
  assert.equal(saved.type,'consultation');
  const selected=new Date(2026,10,12,14,15).toISOString();
  assert.equal(saved.date,selected,'Saved instant matches selected local date/time');
  await page.evaluate(id=>App.navigate('appointments',{id}),saved.id);
  await page.locator('#main [aria-label="Edit customer details"]').waitFor({state:'visible'});
  await page.reload();
  await page.locator('#main [aria-label="Edit customer details"]').waitFor({state:'visible'});
  await page.waitForFunction(id=>App.currentHash===`appointments?id=${id}`&&document.querySelector('#main .skeleton-screen')===null,saved.id);
  await page.locator('#main').getByText('SYNTHETIC Layout Visit',{exact:true}).first().waitFor({state:'visible'});
  assert.equal(await page.evaluate(async id=>(await DB.getAppointment(id)).date,saved.id),selected);
  await page.waitForFunction(()=>document.querySelectorAll('.toast').length===0);
  await page.screenshot({path:artifactPath(`beelo-visit-layout-saved-${engine.name()}.png`),animations:'disabled'});
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: new-visit date/time controls fit seven portrait/landscape widths; real form saved synthetic context and exact selected instant; reload/detail readback retained; no uploads`);
 }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
