'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   localStorage.setItem('advisoros_enc_test','1');localStorage.setItem('advisoros_visit_reminders_enabled','false');
   localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));
  });
  const page=await context.newPage(),errors=[],posts=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.goto(base);
  if(new URL(base).protocol==='https:'){
   await page.locator('#enc-passphrase-new').fill('SYNTHETIC-modal-device');await page.locator('#enc-passphrase-confirm').fill('SYNTHETIC-modal-device');
   await page.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  }
  await page.waitForFunction(()=>App.currentHash==='today');
  const id=await page.evaluate(async()=>{
   const customer=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Original'});
   const first=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Original',address:'1 SYNTHETIC Lane',date:new Date(2026,10,12,9,0).toISOString(),type:'consultation',durationSlots:1});
   await DB.addAppointment({clientName:'SYNTHETIC Next',address:'99 SYNTHETIC Road',date:new Date(2026,10,12,9,45).toISOString(),type:'consultation',durationSlots:1});
   return first.id;
  });
  await page.evaluate(id=>App.navigate('appointments',{id}),id);
  await page.locator('[aria-label="Edit customer details"]').waitFor();
  await page.locator('[aria-label="Edit customer details"]').click();
  await page.locator('#edit-detail-name').fill('SYNTHETIC Corrected');
  await page.locator('#edit-detail-time').fill('09:30');
  await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  await page.getByRole('heading',{name:'Check this diary slot',exact:true}).waitFor();
  assert.equal(await page.evaluate(async id=>(await DB.getAppointment(id)).clientName,id),'SYNTHETIC Original','Warning must not save the draft');
  await page.getByRole('button',{name:'Adjust time',exact:true}).click();
  await page.locator('#edit-detail-name').waitFor();
  const restored={name:await page.locator('#edit-detail-name').inputValue(),time:await page.locator('#edit-detail-time').inputValue()};
  await page.screenshot({path:artifactPath(`beelo-modal-visit-restored-${engine.name()}.png`),animations:'disabled'});
  assert.deepEqual(restored,{name:'SYNTHETIC Corrected',time:'09:30'},'Returning from the real travel warning must retain unsaved edits');
  await page.locator('#edit-detail-time').fill('09:00');
  await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  await page.locator('#edit-detail-name').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(async id=>(await DB.getAppointment(id)).clientName,id),'SYNTHETIC Corrected');
  await page.evaluate(()=>App.openModal(`<h3>SYNTHETIC form</h3><input id="nested-text" value="original"><textarea id="nested-note">original</textarea><input id="nested-check" type="checkbox"><input id="radio-a" type="radio" name="synthetic-choice" checked><input id="radio-b" type="radio" name="synthetic-choice"><select id="nested-select" multiple><option value="a" selected>A</option><option value="b">B</option><option value="c">C</option></select><input id="nested-secret" type="password"><textarea id="nested-passphrase" class="passphrase-input"></textarea><input id="nested-file" type="file">`));
  await page.locator('#nested-text').fill('SYNTHETIC changed');
  const note='SYNTHETIC bedroom — </textarea><img src=x onerror=alert(1)> & "left control"';
  await page.locator('#nested-note').fill(note);await page.locator('#nested-check').check();await page.locator('#radio-b').check();
  await page.locator('#nested-select').selectOption(['b','c']);
  await page.locator('#nested-secret').fill('SYNTHETIC-not-a-real-secret');await page.locator('#nested-passphrase').fill('SYNTHETIC-not-a-real-passphrase');
  await page.locator('#nested-file').setInputFiles({name:'SYNTHETIC.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC')});
  await page.evaluate(()=>{App.openModal('<h3>SYNTHETIC second layer</h3><input id="layer-two" value="original">');});
  await page.locator('#layer-two').fill('SYNTHETIC second-layer edit');
  await page.evaluate(()=>{App.openModal('<h3>SYNTHETIC third layer</h3>');App.closeModal();});
  assert.equal(await page.locator('#layer-two').inputValue(),'SYNTHETIC second-layer edit');
  await page.evaluate(()=>App.closeModal());
  assert.equal(await page.locator('#nested-text').inputValue(),'SYNTHETIC changed');
  assert.equal(await page.locator('#nested-note').inputValue(),note);assert.equal(await page.locator('#nested-note img').count(),0,'Note text cannot become markup');
  assert(await page.locator('#nested-check').isChecked());assert(await page.locator('#radio-b').isChecked());assert(!(await page.locator('#radio-a').isChecked()));
  assert.deepEqual(await page.locator('#nested-select').evaluate(e=>[...e.selectedOptions].map(o=>o.value)),['b','c']);
  assert.equal(await page.locator('#nested-secret').inputValue(),'');assert.equal(await page.locator('#nested-passphrase').inputValue(),'');assert.equal(await page.locator('#nested-file').evaluate(e=>e.files.length),0);
  await page.evaluate(()=>{App.openModal('<h3>SYNTHETIC replacement</h3>',{replace:true});});
  assert.equal(await page.evaluate(()=>App.modalStack.length),0,'Replacement must not introduce another stack frame');
  await page.evaluate(()=>{App.openModal('<h3>SYNTHETIC final layer</h3>');App.closeModal({all:true});});
  assert.equal(await page.evaluate(()=>App.modalStack.length),0);assert(!(await page.locator('#modal-overlay').evaluate(e=>e.classList.contains('active'))));
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: real edit/warning/adjust/save, nested text/Unicode/checkbox/radio/multi-select, escaped markup, secret/file exclusion, replace and close-all; no sends`);
 }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
