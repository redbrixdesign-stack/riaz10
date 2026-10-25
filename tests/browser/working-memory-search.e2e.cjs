'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();let pageForEvidence;try{
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'});
 await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
 const p=await c.newPage(),errors=[],posts=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 pageForEvidence=p;
 await p.goto(base);
 await p.locator('#enc-passphrase-new').waitFor().catch(async error=>{await p.screenshot({path:artifactPath('beelo-search-setup-failure-'+engine.name()+'.png')});console.error(await p.locator('body').innerText());console.error(errors);throw error;});
 await p.locator('#enc-passphrase-new').fill('SYNTHETIC memory search');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC memory search');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
 const data=await p.evaluate(async()=>{
  const customer=await DB.addCustomer({firstName:'SYNTHETIC Cedar',lastName:'Example',address:{line1:'SYNTHETIC test street',postcode:'M14 7FZ'},notes:'SYNTHETIC customer likes navy'});
  const visit=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Cedar Example',date:'2026-10-25T10:00:00Z',type:'measure',status:'confirmed',notes:'SYNTHETIC garage parking. Transcribed: quiet dog upstairs'});
  await DB.addMeasurement({appointmentId:visit.id,windowName:'Bedroom',description:'SYNTHETIC roman <img src=x onerror=alert(1)>',widthTop:1001,widthMiddle:1002,widthBottom:1003,dropLeft:1201,dropCentre:1202,dropRight:1203,notes:'SYNTHETIC blackout',audioNotes:[{transcript:'SYNTHETIC control left',dataUrl:'data:audio/mp4;base64,U1lOVEhFVElD'}]});
  const raw=await DB.db.measurements.toArray();
  return {customerId:customer.id,visitId:visit.id,protected:typeof raw[0].windowName==='object',before:JSON.stringify(raw)};
 });
 assert(data.protected,'Measurement text must be encrypted at rest');
 await p.evaluate(()=>App.navigate('appointments'));await p.getByRole('button',{name:'Search',exact:true}).click();
 const input=p.locator('#customer-search-input'),results=p.locator('#customer-search-results');
 await input.fill('Cedar bedroom');await results.getByRole('button').waitFor();assert.equal(await results.getByRole('button').count(),1);
 assert.match(await results.innerText(),/Window: Bedroom/);assert.equal(await results.locator('img').count(),0);
 assert((await results.locator('strong').boundingBox()).width>180,'Search text uses content column');
 await results.getByRole('button').scrollIntoViewIfNeeded();
 await p.locator('.toast').waitFor({state:'hidden'});
 await p.screenshot({path:artifactPath('beelo-working-memory-search-'+engine.name()+'.png'),animations:'disabled'});
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await results.getByRole('button').click();await p.waitForFunction(id=>App.currentHash.includes('id='+id),data.visitId);await p.getByText('Window measurements (1)',{exact:true}).waitFor();await p.getByText('Bedroom',{exact:true}).first().waitFor();
 await p.evaluate(()=>AppointmentsFeature.openCustomerSearch());await input.fill('Cedar garage');await results.getByRole('button').waitFor();assert.match(await results.innerText(),/Saved visit context/);
 await input.fill('Cedar quiet dog');await results.getByText(/Saved visit context/).waitFor();
 await c.setOffline(true);await input.fill('Cedar control left');await results.getByText(/Window: Bedroom/).waitFor();assert.match(await results.innerText(),/Window: Bedroom/);await c.setOffline(false);
 await input.fill('SYNTHETIC not present');await results.getByText('No matches for "SYNTHETIC not present"',{exact:true}).waitFor();
 await p.evaluate(()=>{window.savedSearchRead=DB.getMeasurementSearchRecords;DB.getMeasurementSearchRecords=async()=>{throw Error('SYNTHETIC failed read');};});
 await input.fill('Cedar');await results.getByText('Search failed - try again',{exact:true}).waitFor();
 await p.evaluate(()=>{DB.getMeasurementSearchRecords=window.savedSearchRead;});
 await input.fill('Cedar bedroom');await results.getByRole('button').waitFor();
 // Resolve an older query after a newer query: the older response must not paint.
 await p.evaluate(async()=>{
  const original=Search.search;let finishOld;
  Search.search=q=>q==='old'?new Promise(r=>finishOld=r):Promise.resolve([{id:999,type:'customer',title:'SYNTHETIC latest',icon:'person'}]);
  const old=AppointmentsFeature.runCustomerSearch('old');await AppointmentsFeature.runCustomerSearch('new');
  finishOld([{id:998,type:'customer',title:'SYNTHETIC stale',icon:'person'}]);await old;Search.search=original;
 });
 assert.match(await results.innerText(),/SYNTHETIC latest/);assert(!((await results.innerText()).includes('stale')));
 assert.equal(await p.evaluate(()=>localStorage.getItem('advisoros_search_index')),null);
 assert.equal(await p.evaluate(async()=>JSON.stringify(await DB.db.measurements.toArray())),data.before,'Search never rewrites saved evidence');
 await p.reload();await p.waitForFunction(()=>App.currentHash.includes('appointments'));await p.evaluate(()=>AppointmentsFeature.openCustomerSearch());await input.fill('Cedar bedroom');await results.getByRole('button').waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
 console.log('PASS '+engine.name()+': encrypted measurement/notes/transcript retrieval, source visit open, escaped readable390px results, empty/error/retry, offline search, newest-query ownership, persistence and no uploads');
 }catch(error){if(pageForEvidence){await pageForEvidence.screenshot({path:artifactPath('beelo-search-failure-'+engine.name()+'.png')});console.error(await pageForEvidence.locator('body').innerText());}throw error;}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
