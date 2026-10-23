'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const p=await c.newPage(),posts=[],errors=[];p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC-lazy-device');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-lazy-device');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForTimeout(700);
  const id=await p.evaluate(async()=>{AIService.isEnabled=()=>false;const c=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Social'});return (await DB.addAppointment({customerId:c.id,type:'fitting',clientName:'SYNTHETIC Social',date:'2020-01-01T10:00:00Z'})).id;});
  assert.equal(await p.locator('.nav-item').count(),5);
  await p.evaluate(id=>App.navigate('social',{appointmentId:id}),id);await p.locator('#social-consent').waitFor();
  assert(await p.evaluate(()=>App.currentFeature===SocialFeature&&App.features.get('social')===SocialFeature));assert.equal(await p.evaluate(()=>SocialFeature.appointmentId),id);
  await p.locator('#social-media-input').setInputFiles({name:'SYNTHETIC-finished.png',mimeType:'image/png',buffer:png});
  await p.waitForFunction(()=>SocialFeature.mediaFile?.name==='SYNTHETIC-finished.png');
  await p.locator('#social-consent').check();await p.locator('#social-privacy').check();await p.locator('#social-product').fill('SYNTHETIC blue roller');
  await p.evaluate(()=>SocialFeature.generate());await p.locator('#social-draft-warm').waitFor();
  const draft=await p.locator('#social-draft-warm').inputValue();assert.match(draft,/SYNTHETIC blue roller/);
  assert.equal(await p.evaluate(async id=>(await DB.getAppointment(id)).socialDrafts.warm,id),draft);
  await p.reload();await p.locator('#social-draft-warm').waitFor();assert.equal(await p.locator('#social-draft-warm').inputValue(),draft);assert.equal(await p.locator('.nav-item').count(),5);
  for(const route of ['quotes','jobs','invoices','suppliers','capacity','profitability','retention','settings']){
   await p.evaluate(route=>App.navigate(route),route);await p.waitForFunction(route=>App.currentHash===route,route);
   assert(await p.evaluate(route=>{const real={quotes:()=>QuotesFeature,jobs:()=>JobsFeature,invoices:()=>InvoicesFeature,suppliers:()=>SuppliersFeature,capacity:()=>CapacityFeature,profitability:()=>ProfitabilityFeature,retention:()=>RetentionFeature,settings:()=>SettingsFeature}[route]();return App.currentFeature===real&&App.features.get(route)===real;},route));
   assert.equal(await p.locator('.nav-item').count(),5);assert(!/Failed to load|Something went wrong/.test(await p.locator('#main').innerText()));
  }
  // Force a stale same-route render to resolve after the newer fitting.
  await p.evaluate(async id=>{const get=DB.getAppointment.bind(DB);window.lazyGet=get;window.releaseOld=null;DB.getAppointment=visit=>visit===999999?new Promise(resolve=>window.releaseOld=()=>resolve({id:999999,type:'fitting'})):get(visit);App.navigate('social',{appointmentId:999999});App.navigate('social',{appointmentId:id});},id);
  await p.locator('#social-draft-warm').waitFor();await p.evaluate(()=>{window.releaseOld();DB.getAppointment=window.lazyGet;});await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>SocialFeature.appointmentId),id);
  assert.equal(await p.evaluate(()=>App.currentHash),`social?appointmentId=${id}`);
  await p.screenshot({path:artifactPath(`beelo-lazy-state-${engine.name()}.png`),animations:'disabled'});
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: first lazy social save/reload, all nine canonical routes, five primary nav items, stale fitting render cannot replace latest state; no uploads/shares`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
