'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  // Deliberate missing script response, independent of the unresolved C14
  // SW/socket-drop failure. Use the real deadline, real router and retry UI.
  const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await c.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const p=await c.newPage(),posts=[],errors=[];let quoteRequests=0,socialRequests=0,heldQuote,heldJob,heldSocial;
  p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/js/services/quote-document.min.js*',route=>{quoteRequests++;if(quoteRequests===1)heldQuote=route;else return route.continue();});
  await p.route('**/js/features/jobs/jobs.min.js*',route=>{heldJob=route;});
  await p.route('**/js/features/social/social.min.js*',route=>{socialRequests++;if(socialRequests===1)heldSocial=route;else return route.continue();});
  await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC-script-deadline');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-script-deadline');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
  const id=await p.evaluate(async()=>{const row=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Load recovery'});return row.id;});
  await p.evaluate(()=>App.navigate('quotes'));
  await p.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:20000});
  assert.equal(quoteRequests,1,'No autonomous retry');assert(heldQuote);
  assert.equal(await p.evaluate(()=>App.currentHash),'quotes');
  assert.equal(await p.evaluate(()=>App.scriptLoads.has('js/services/quote-document.min.js?v=3')),false);
  await p.screenshot({path:artifactPath(`beelo-script-timeout-${engine.name()}.png`),animations:'disabled'});
  // Abort the stale transport only; the old load/error handlers must not
  // affect the new explicit retry. Old callback identity is also unit-tested.
  await heldQuote.abort().catch(()=>{});
  await p.getByRole('button',{name:'Try again',exact:true}).click();
  await p.waitForFunction(()=>App.currentHash==='quotes'&&!App.features.get('quotes')._lazy&&App.currentFeature===App.features.get('quotes'));
  assert.equal(quoteRequests,2);assert(!/Failed to load|Something went wrong/.test(await p.locator('#main').innerText()));
  await p.evaluate(()=>App.navigate('jobs'));await p.waitForFunction(()=>App.currentFeature?.id==='jobs');
  await p.evaluate(()=>App.navigate('today'));await p.waitForFunction(()=>App.currentHash==='today');
  await p.waitForFunction(()=>!App.scriptLoads.has('js/features/jobs/jobs.min.js?v=3'),{},{timeout:20000});
  assert(heldJob);assert.equal(await p.evaluate(()=>App.currentHash),'today');assert.equal(await p.getByRole('button',{name:'Try again',exact:true}).count(),0,'A timed-out old route cannot interrupt Today');
  assert.equal(await p.evaluate(async id=>(await DB.getCustomer(id)).lastName,id),'Load recovery');
  await heldJob.abort().catch(()=>{});
  const visit=await p.evaluate(async id=>(await DB.addAppointment({customerId:id,type:'fitting',clientName:'SYNTHETIC Load recovery',date:'2020-01-01T10:00:00Z'})).id,id);
  await p.evaluate(appointmentId=>App.navigate('social',{appointmentId}),visit);
  await p.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:20000});assert(heldSocial);await heldSocial.abort().catch(()=>{});
  await p.getByRole('button',{name:'Try again',exact:true}).click();await p.locator('#social-consent').waitFor();
  assert.equal(socialRequests,2);assert.equal(await p.evaluate(()=>SocialFeature.appointmentId),visit,'Retry must retain the actual fitting context');
  assert.equal(await p.evaluate(()=>App.currentHash),`social?appointmentId=${visit}`);
  await p.screenshot({path:artifactPath(`beelo-script-recovery-${engine.name()}.png`),animations:'disabled'});
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(artifactPath(`beelo-script-deadline-${engine.name()}.json`),JSON.stringify({engine:engine.name(),quoteRequests,posts,errors,deadlineMs:15000,recordRetained:true}));
  console.log(`PASS ${engine.name()}: real stalled script times out, no autonomous retry, explicit retry loads the actual feature and retains fitting context; navigated-away timeout stays quiet and synthetic record retained`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
