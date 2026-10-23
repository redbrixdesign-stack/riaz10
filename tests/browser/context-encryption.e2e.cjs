'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const p=await c.newPage(),posts=[],errors=[];
  p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC-context-device');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-context-device');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  await p.waitForFunction(()=>App.currentHash==='today');await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForTimeout(700);
  const ids=await p.evaluate(async()=>{
   const customer=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Context',fullName:'SYNTHETIC Context',postcodeNormalized:'M147FZ',address:{postcode:'M14 7FZ'},notes:'SYNTHETIC customer history'});
   const date=new Date();date.setDate(date.getDate()+1);date.setHours(10,0,0,0);
   const visit=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Context',type:'fitting',date:date.toISOString(),access:'SYNTHETIC side gate 1234'});
   const measurement=await DB.addMeasurement({appointmentId:visit.id,windowName:'SYNTHETIC bedroom',description:'SYNTHETIC blue roller left',notes:'اردو 🪟',widthTop:1000,widthMiddle:1001,widthBottom:1002,dropLeft:1200,dropCentre:1201,dropRight:1202,photos:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=']});
   const photo=await DB.addPhoto({customerId:customer.id,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',mimeType:'image/png',caption:'SYNTHETIC photo caption'});
   // Simulate the coming writer release while testing rollback readers.
   await DB.db.customers.update(customer.id,{fullName:await encryptField(customer.fullName),postcodeNormalized:await encryptField(customer.postcodeNormalized)});
   await DB.db.appointments.update(visit.id,{access:await encryptField(visit.access)});
   await DB.db.measurements.update(measurement.id,{windowName:await encryptField(measurement.windowName),description:await encryptField(measurement.description),notes:await encryptField(measurement.notes),photos:await Promise.all(measurement.photos.map(encryptField))});
   await DB.db.photos.update(photo.id,{data:await encryptField(photo.data),caption:await encryptField(photo.caption)});
   return {customer:customer.id,visit:visit.id,measurement:measurement.id,photo:photo.id};
  });
  await p.evaluate(id=>App.navigate('customer',{id}),ids.customer);
  await p.getByText('SYNTHETIC bedroom',{exact:false}).first().waitFor();
  assert.equal(await p.evaluate(async()=> (await Search.searchByPostcode('M14'))[0].fullName),'SYNTHETIC Context');
  await p.evaluate(id=>App.navigate('appointments',{id}),ids.visit);
  await p.getByText('SYNTHETIC blue roller left',{exact:false}).first().waitFor();
  await p.evaluate(id=>AppointmentsFeature.openPhotoViewer(id),ids.photo);
  await p.locator('#photo-viewer-caption').waitFor();assert.equal(await p.locator('#photo-viewer-caption').inputValue(),'SYNTHETIC photo caption');
  assert(await p.locator('.sheet-body img').evaluate(img=>img.complete&&img.naturalWidth>0));
  await p.evaluate(()=>App.closeModal());await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'}));
  await p.getByText('Access: SYNTHETIC side gate 1234',{exact:false}).first().waitFor();
  const backup=await p.evaluate(()=>DB.exportAll());
  assert.equal(backup.measurements[0].notes,'اردو 🪟');assert.equal(backup.photos[0].caption,'SYNTHETIC photo caption');assert.equal(backup.customers[0].fullName,'SYNTHETIC Context');
  await c.setOffline(true);
  if(engine===chromium) await p.reload({waitUntil:'domcontentloaded'});
  else { await p.evaluate(id=>App.navigate('customer',{id}),ids.customer);await p.getByText('SYNTHETIC bedroom',{exact:false}).first().waitFor();await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'})); }
  await p.getByText('SYNTHETIC side gate 1234',{exact:false}).first().waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({path:`/private/tmp/beelo-context-readers-${engine.name()}.png`,animations:'disabled'});
  await c.setOffline(false);await p.reload();await p.getByText('SYNTHETIC side gate 1234',{exact:false}).first().waitFor();
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: real unlock, protected mixed records in customer/visit/plan/gallery/postcode search, readable export, ${engine===chromium?'offline reload':'offline in-app navigation (offline reload not certified: WebKit internal navigation error)'}, online reload/reconnect; no uploads`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
