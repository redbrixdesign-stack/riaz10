'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
const expectEncryption=process.env.BEELO_EXPECT_CONTEXT_ENCRYPTION==='1';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  // This journey tests encrypted context, not device-zone conversion. Its
  // original host-local "tomorrow" seed diverged from Beelo's UK calendar
  // between 23:00 and 00:00 UTC in BST. Make that assumption explicit and
  // retain the failing instant as a deterministic regression boundary.
  const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/London'});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const p=await c.newPage(),posts=[],errors=[];
  const expandPlanContext=async()=>{const details=p.locator('#tomorrow-plan .plan-row-details').first();await details.waitFor({state:'attached'});if(!await details.evaluate(el=>el.open))await details.locator('summary').click();};
  await p.clock.setFixedTime(new Date('2026-10-23T23:44:00Z'));
  p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC-context-device');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-context-device');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  await p.waitForFunction(()=>App.currentHash==='today');await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForTimeout(700);
  const ids=await p.evaluate(async expectEncryption=>{
   const customer=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Context',fullName:'SYNTHETIC Context',postcodeNormalized:'M147FZ',address:{postcode:'M14 7FZ'},notes:'SYNTHETIC customer history'});
   const date=new Date();date.setDate(date.getDate()+1);date.setHours(10,0,0,0);
   const expectedDay=Utils.formatDate(Utils.getTomorrow(),'iso');
   if(Utils.formatDate(date,'iso')!==expectedDay)throw new Error('Context fixture must be on the UK tomorrow-plan day');
   const visit=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Context',type:'fitting',date:date.toISOString(),access:'SYNTHETIC side gate 1234'});
   const measurement=await DB.addMeasurement({appointmentId:visit.id,windowName:'SYNTHETIC bedroom',description:'SYNTHETIC blue roller left',notes:'اردو 🪟',widthTop:1000,widthMiddle:1001,widthBottom:1002,dropLeft:1200,dropCentre:1201,dropRight:1202,photos:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=']});
   const photo=await DB.addPhoto({customerId:customer.id,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',mimeType:'image/png',caption:'SYNTHETIC photo caption'});
   if(expectEncryption){
    const raw={customer:await DB.db.customers.get(customer.id),visit:await DB.db.appointments.get(visit.id),measurement:await DB.db.measurements.get(measurement.id),photo:await DB.db.photos.get(photo.id)};
    if(!isEncrypted(raw.customer.fullName)||!isEncrypted(raw.customer.postcodeNormalized)||!isEncrypted(raw.visit.access)||!isEncrypted(raw.measurement.notes)||!isEncrypted(raw.measurement.photos[0])||!isEncrypted(raw.photo.data)||!isEncrypted(raw.photo.caption))throw new Error('Context write escaped encryption');
   }
   // Simulate the coming writer release while testing rollback readers.
   if(!expectEncryption){
   await DB.db.customers.update(customer.id,{fullName:await encryptField(customer.fullName),postcodeNormalized:await encryptField(customer.postcodeNormalized)});
   await DB.db.appointments.update(visit.id,{access:await encryptField(visit.access)});
   await DB.db.measurements.update(measurement.id,{windowName:await encryptField(measurement.windowName),description:await encryptField(measurement.description),notes:await encryptField(measurement.notes),photos:await Promise.all(measurement.photos.map(encryptField))});
   await DB.db.photos.update(photo.id,{data:await encryptField(photo.data),caption:await encryptField(photo.caption)});
   }
   return {customer:customer.id,visit:visit.id,measurement:measurement.id,photo:photo.id};
  },expectEncryption);
  await p.evaluate(id=>App.navigate('customer',{id}),ids.customer);
  await p.getByText('SYNTHETIC bedroom',{exact:false}).first().waitFor();
  assert.equal(await p.evaluate(async()=> (await Search.searchByPostcode('M14'))[0].fullName),'SYNTHETIC Context');
  await p.evaluate(id=>App.navigate('appointments',{id}),ids.visit);
  await p.getByText('SYNTHETIC blue roller left',{exact:false}).first().waitFor();
  await p.evaluate(id=>AppointmentsFeature.openPhotoViewer(id),ids.photo);
  await p.locator('#photo-viewer-caption').waitFor();assert.equal(await p.locator('#photo-viewer-caption').inputValue(),'SYNTHETIC photo caption');
  assert(await p.locator('.sheet-body img').evaluate(img=>img.complete&&img.naturalWidth>0));
  if(expectEncryption){await p.locator('#photo-viewer-caption').fill('SYNTHETIC edited caption');await p.getByRole('button',{name:/Save caption/}).click();await p.waitForFunction(async id=>(await DB.getPhoto(id)).caption==='SYNTHETIC edited caption',ids.photo);assert(await p.evaluate(async id=>isEncrypted((await DB.db.photos.get(id)).caption),ids.photo));}
  await p.evaluate(()=>App.closeModal());await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'}));
  await expandPlanContext();await p.getByText('Access: SYNTHETIC side gate 1234',{exact:false}).first().waitFor();
  const backup=await p.evaluate(()=>DB.exportAll());
  assert.equal(backup.measurements[0].notes,'اردو 🪟');assert.equal(backup.photos[0].caption,expectEncryption?'SYNTHETIC edited caption':'SYNTHETIC photo caption');assert.equal(backup.customers[0].fullName,'SYNTHETIC Context');
  if(expectEncryption){
   await p.evaluate(async ids=>{await DB.db.customers.update(ids.customer,{fullName:'SYNTHETIC Context',postcodeNormalized:'M147FZ'});await DB.db.appointments.update(ids.visit,{access:'SYNTHETIC side gate 1234'});await DB.db.measurements.update(ids.measurement,{notes:'اردو 🪟'});await DB.db.photos.update(ids.photo,{caption:'SYNTHETIC edited caption'});},ids);
   await p.reload();await expandPlanContext();await p.getByText('SYNTHETIC side gate 1234',{exact:false}).first().waitFor();
   assert(await p.evaluate(async ids=>isEncrypted((await DB.db.customers.get(ids.customer)).fullName)&&isEncrypted((await DB.db.appointments.get(ids.visit)).access)&&isEncrypted((await DB.db.measurements.get(ids.measurement)).notes)&&isEncrypted((await DB.db.photos.get(ids.photo)).caption),ids),'Legacy fields migrate during real reload');
  }
  await c.setOffline(true);
  if(engine===chromium) await p.reload({waitUntil:'domcontentloaded'});
  else { await p.evaluate(id=>App.navigate('customer',{id}),ids.customer);await p.getByText('SYNTHETIC bedroom',{exact:false}).first().waitFor();await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'})); }
  await expandPlanContext();await p.getByText('SYNTHETIC side gate 1234',{exact:false}).first().waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({path:artifactPath(`beelo-context-readers-${engine.name()}.png`),animations:'disabled'});
  await c.setOffline(false);await p.reload();await expandPlanContext();await p.getByText('SYNTHETIC side gate 1234',{exact:false}).first().waitFor();
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: real unlock, protected mixed records in customer/visit/plan/gallery/postcode search, readable export, ${engine===chromium?'offline reload':'offline in-app navigation (offline reload not certified: WebKit internal navigation error)'}, online reload/reconnect; no uploads`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
