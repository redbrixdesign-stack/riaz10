const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch();
 try {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(() => {
   localStorage.setItem('advisoros_enc_test','1');
   localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true}));
   localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));
  });
  const page = await context.newPage(); const errors=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/api/transcribe', route=>route.fulfill({json:{ok:true,text:'Synthetic customer prefers blackout blinds.'}}));
  await page.goto('http://127.0.0.1:8022');
  await page.waitForFunction(()=>typeof DB!=='undefined' && App.currentHash==='today');
  const id=await page.evaluate(async()=> (await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Release',fullName:'SYNTHETIC Release',address:{line1:'1 Fictional Way'},notes:'Original context'})).id);
  await page.evaluate(id=>AppointmentsFeature.openEditCustomerModal(id),id);
  await page.locator('#edit-cust-notes').waitFor();
  await page.evaluate(()=>{NoteCapture.setRecordings('edit-cust-notes',[{id:'mock-audio',mediaType:'audio/wav',dataUrl:'data:audio/wav;base64,UklGRg=='}]);NoteCapture.refresh('edit-cust-notes');});
  await page.locator('[data-action="NoteCapture.transcribe"]').click();
  console.log('Transcribe clicked');
  await page.waitForFunction(()=>document.getElementById('edit-cust-notes').value.includes('Synthetic customer'));
  await page.getByRole('button',{name:'Delete saved audio',exact:true}).click();
  await page.getByRole('button',{name:'Delete audio',exact:true}).click();
  assert.match(await page.locator('#edit-cust-notes').inputValue(),/Original context/);
  await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  await page.waitForFunction(async id=>(await DB.getCustomer(id)).notes.includes('Synthetic customer'),id);
  assert.equal(await page.evaluate(async id=>(await DB.getCustomer(id)).audioNotes.length,id),0);
  await page.reload();
  await page.waitForFunction(()=>typeof DB!=='undefined' && App.currentHash==='today');
  assert.match(await page.evaluate(async id=>(await DB.getCustomer(id)).notes,id),/Synthetic customer/);
  await page.evaluate(id=>App.navigate('customer',{id}),id);
  await page.locator('[data-action="CommunicationsFeature.openPreferences"]').waitFor();
  await page.locator('[data-action="CustomerFeature.openReplyModal"]').waitFor();
  await page.evaluate(async id=>{
    const visit=await DB.addAppointment({customerId:id,type:'fitting',date:new Date().toISOString(),status:'completed',outcome:'completed'});
    App.navigate('social',{appointmentId:visit.id});
  },id);
  await page.locator('#social-consent').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS integrated mobile notes: transcription, inline deletion, encrypted save/reload, contact preferences, reply history, social route');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
