'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8038';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();let p;try{
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'}),requests=[],external=[],errors=[];let holdAI=false,releaseAI;
 await c.route('**/*',async r=>{
  const url=new URL(r.request().url());
  if(url.origin===new URL(base).origin&&url.pathname==='/__synthetic_communication_ai'){
   assert.equal(r.request().method(),'POST');requests.push(JSON.parse(r.request().postData()));
   if(holdAI)await new Promise(resolve=>releaseAI=resolve);
   return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,text:JSON.stringify({draft_message:"Hi SYNTHETIC, I'm SYNTHETIC Adviser, your adviser. This deliberately omits preparation and links."}),model:'SYNTHETIC-MOCK',type:'draft'})});
  }
  if(url.origin===new URL(base).origin)return r.continue();external.push(r.request().url());return r.abort();
 });
 await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
 p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC communication continuity');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC communication continuity');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
 const fixture=await p.evaluate(async base=>{
  CONFIG.advisorName='SYNTHETIC Adviser';CONFIG.advisorTitle='Independent Window Coverings Expert';CONFIG.socialLinks={facebook:'https://www.facebook.com/SYNTHETIC',instagram:'https://www.instagram.com/SYNTHETIC/'};CONFIG.ai={...CONFIG.ai,enabled:true,proxyUrl:base+'/__synthetic_communication_ai',secret:''};
  const customer=await DB.addCustomer({firstName:'SYNTHETIC Cedar',phone:'07700900123'}),date=new Date(Date.now()+2*86400000);date.setHours(10,0,0,0);
  const visit=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Cedar',phone:'07700900123',type:'consultation',date:date.toISOString(),arrivalStart:'09:00',arrivalEnd:'12:00',address:'SYNTHETIC Test Street',latLng:[53.46,-2.25]});
  TalkFeature.getLiveEta=async()=>({etaMin:9,distanceKm:2,usedLiveGPS:false});
  return {id:visit.id,date:visit.date};
 },base);
 const open=async key=>{await p.evaluate(({id,key})=>TalkFeature.sendMessage(id,key),{id:fixture.id,key});await p.locator('#talk-message-preview').waitFor();};
 const close=async()=>{await p.getByRole('button',{name:'Close message preview',exact:true}).click();await p.locator('#talk-message-preview').waitFor({state:'detached'});};
 await open('pre_intro');let text=await p.locator('#talk-message-preview').inputValue();assert.match(text,/I'm SYNTHETIC Adviser/);assert.match(text,/clear the area around the windows/);assert.match(text,/parking restrictions, permits/);assert.match(text,/Facebook: https:\/\/www.facebook.com\/SYNTHETIC/);assert.match(text,/Instagram: https:\/\/www.instagram.com\/SYNTHETIC\//);
 await p.getByRole('button',{name:'Rewrite with AI',exact:true}).click();await p.getByText('Draft ready — review before sending',{exact:true}).waitFor();text=await p.locator('#talk-message-preview').inputValue();assert(!text.includes('deliberately omits'));assert.match(text,/clear.*windows/);assert.equal((text.match(/Facebook:/g)||[]).length,1);assert.equal(requests.length,1);const sentContext=JSON.parse(requests[0].draftContext);assert(sentContext.introduction_required&&!sentContext.advisor_already_introduced);
 await p.screenshot({path:artifactPath('beelo-communication-intro-'+engine.name()+'.png'),animations:'disabled'});
 holdAI=true;await Promise.all([p.waitForRequest(r=>r.url().endsWith('/__synthetic_communication_ai')),p.getByRole('button',{name:'Rewrite with AI',exact:true}).click()]);await p.locator('#talk-message-preview').fill('SYNTHETIC wording edited while the model is busy.');assert.equal(typeof releaseAI,'function');releaseAI();await p.getByText(/Your wording changed while drafting/).waitFor();assert.equal(await p.locator('#talk-message-preview').inputValue(),'SYNTHETIC wording edited while the model is busy.');holdAI=false;await close();
 // Model an explicit adviser-recorded send, never open WhatsApp or contact a number.
 await p.evaluate(async id=>{const visit=await DB.getAppointment(id);await DB.recordPreviouslySent(id,'pre_intro',DB.visitContactSnapshot(visit),'SYNTHETIC-record-intro');},fixture.id);
 await open('intro_day_before');text=await p.locator('#talk-message-preview').inputValue();assert(!text.includes('SYNTHETIC Adviser'));assert(!/Facebook:|Instagram:|roughly how many/.test(text));assert.match(text,/just to confirm/);await close();
 await open('on_my_way');text=await p.locator('#talk-message-preview').inputValue();assert.match(text,/on my way/);assert.match(text,/9 minutes/);assert(!/SYNTHETIC Adviser|Facebook:|parking|clear the/.test(text));assert.equal(await p.getByRole('button',{name:'Rewrite with AI',exact:true}).count(),0);
 await p.locator('#talk-message-preview').fill("Hi SYNTHETIC, I'm SYNTHETIC Adviser — an old saved introduction. Facebook: https://www.facebook.com/SYNTHETIC");await close();await open('on_my_way');assert.match(await p.locator('#talk-message-preview').inputValue(),/old saved introduction/);await p.getByText(/Saved wording preserved/).waitFor();
 await p.getByRole('button',{name:'Use short journey update',exact:true}).click();await p.waitForFunction(()=>document.getElementById('talk-message-preview')?.value.includes('on my way')&&!document.getElementById('talk-message-preview')?.value.includes('old saved'));
 await p.screenshot({path:artifactPath('beelo-communication-journey-'+engine.name()+'.png'),animations:'disabled'});
 await c.setOffline(true);await p.locator('#talk-message-preview').fill('SYNTHETIC manual journey wording saved offline.');await close();await open('on_my_way');assert.equal(await p.locator('#talk-message-preview').inputValue(),'SYNTHETIC manual journey wording saved offline.');await close();await c.setOffline(false);
 await p.reload();await p.waitForFunction(()=>App.currentHash==='today');await p.evaluate(()=>{TalkFeature.getLiveEta=async()=>null;});await open('running_late');text=await p.locator('#talk-message-preview').inputValue();assert.match(text,/running late/);assert(!/15-20|10-15|SYNTHETIC Adviser|Facebook:/.test(text));await close();
 const result=await p.evaluate(async id=>{const v=await DB.getAppointment(id);return {date:v.date,intro:v.introSent,reminder:!!v.dayBeforeSent,handoffs:await CommunicationService.pendingHandoffs()};},fixture.id);assert.equal(result.date,fixture.date);assert(result.intro&&!result.reminder);assert.deepEqual(result.handoffs,[]);assert.equal(requests.length,2,'No journey model calls');assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await p.evaluate(async id=>{const v=await DB.getAppointment(id);App.navigate('customer',{id:v.customerId});},fixture.id);
 await p.locator('#customer-communication-record').waitFor();await p.getByRole('button',{name:'Log contact attempt',exact:true}).click();await p.locator('#customer-attempt-text').fill('SYNTHETIC called before departure; no answer. <not HTML>');await c.setOffline(true);await p.getByRole('button',{name:'Save contact attempt',exact:true}).click();await p.locator('#customer-communication-record').waitFor();
 await p.getByRole('button',{name:'Log reply',exact:true}).click();await p.locator('#customer-reply-text').fill('SYNTHETIC expecting you; parking permit available.');await p.getByRole('button',{name:'Save reply',exact:true}).click();await p.locator('#customer-communication-record').waitFor();await c.setOffline(false);await p.reload();await p.locator('#customer-communication-record').waitFor();await p.locator('#customer-communication-record summary').click();
 const record=await p.locator('#customer-communication-record').innerText();assert.match(record,/1 replies recorded/);assert.match(record,/Contact attempt: SYNTHETIC called before departure; no answer. <not HTML>/);assert.match(record,/SYNTHETIC expecting you; parking permit available/);assert.match(record,/not imported automatically/);await p.screenshot({path:artifactPath('beelo-customer-communication-record-'+engine.name()+'.png'),animations:'disabled'});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS '+engine.name()+': initial prep/parking/social footer and contact expectations; guarded mock AI; recorded intro suppresses repeated identity; short journey updates; offline drafts and customer contact attempt/reply history survive reload; escaped full text and factual counts; no WhatsApp send or automatic cancellation');
 }catch(e){if(p)await p.screenshot({path:artifactPath('beelo-communication-continuity-failure-'+engine.name()+'.png')}).catch(()=>{});throw e;}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
