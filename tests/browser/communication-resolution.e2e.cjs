'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();try{
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'});
 await c.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
 const p=await c.newPage(),posts=[],errors=[];p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC send status');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC send status');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
 const data=await p.evaluate(async()=>{
  const a=await DB.addCustomer({firstName:'SYNTHETIC Cedar'}),b=await DB.addCustomer({firstName:'SYNTHETIC Willow'});
  const date=new Date();date.setDate(date.getDate()+1);date.setHours(10,0,0,0);
  const va=await DB.addAppointment({customerId:a.id,clientName:a.firstName,type:'consultation',date:date.toISOString(),arrivalStart:'09:00',arrivalEnd:'12:00'});
  const vb=await DB.addAppointment({customerId:b.id,clientName:b.firstName,type:'measure',date:date.toISOString(),arrivalStart:'09:00',arrivalEnd:'12:00'});
  // Simulate suspended/closed UI after two real local hand-off records. No
  // WhatsApp app or external person is opened/contacted in this test.
  const first=await CommunicationService.recordHandoff({customerId:a.id,appointmentId:va.id,template:'intro_day_before',content:'SYNTHETIC Cedar introduction and reminder'});
  const second=await CommunicationService.recordHandoff({customerId:b.id,appointmentId:vb.id,template:'pre_intro',content:'SYNTHETIC Willow introduction'});
  TalkFeature.beginSentConfirmation(first,{customerId:a.id,appointmentId:va.id,templateKey:'intro_day_before'});
  TalkFeature.beginSentConfirmation(second,{customerId:b.id,appointmentId:vb.id,templateKey:'pre_intro'});
  return {a:va.id,b:vb.id,first:first.id,second:second.id};
 });
 await p.reload();await p.waitForFunction(()=>App.currentHash==='today'&&App.currentFeature?.id==='today');
 await p.evaluate(()=>App.navigate('followups'));await p.waitForFunction(()=>App.currentHash==='followups');
 assert.equal(await p.getByRole('button',{name:'Record whether sent',exact:true}).count(),2,'Both hand-offs survive the single legacy pointer and reload');
 assert.equal(await p.getByRole('button',{name:'Review introduction & confirmation',exact:true}).count(),0);
 await p.screenshot({path:artifactPath(`beelo-send-queue-${engine.name()}.png`),animations:'disabled'});
 await p.locator('article').filter({hasText:'SYNTHETIC Cedar'}).getByRole('button',{name:'Record whether sent'}).click();
 await p.locator('#sent-message-purpose').selectOption('pre_intro');
 // Failed atomic save must retain the prompt and both obligations.
 await p.evaluate(()=>{window.originalResolveSend=DB.resolveCommunicationSend;DB.resolveCommunicationSend=async()=>{throw Error('SYNTHETIC save failed');};});
 await p.getByRole('button',{name:'Yes, I sent it',exact:true}).click();await p.locator('#send-confirmation-error').getByText('SYNTHETIC save failed',{exact:true}).waitFor();
 assert.equal(await p.evaluate(async id=>(await DB.getAppointment(id)).introSent||false,data.a),false);
 await p.evaluate(()=>{DB.resolveCommunicationSend=window.originalResolveSend;});
 await p.getByRole('button',{name:'Yes, I sent it',exact:true}).click();
 await p.getByRole('button',{name:'Review reminder',exact:true}).waitFor();
 let a=await p.evaluate(id=>DB.getAppointment(id),data.a);assert(a.introSent&&!a.dayBeforeSent,'Introduction-only confirmation leaves visit reminder');
 assert.equal(await p.getByRole('button',{name:'Record whether sent',exact:true}).count(),1);
 await p.locator('article').filter({hasText:'SYNTHETIC Willow'}).getByRole('button',{name:'Record whether sent'}).click();
 await p.getByRole('button',{name:'Not sent — keep reminder',exact:true}).click();await p.getByRole('button',{name:'Record whether sent',exact:true}).waitFor({state:'detached'});
 assert.equal(await p.evaluate(async id=>(await DB.getAppointment(id)).introSent||false,data.b),false);
 const willow=p.locator('article').filter({hasText:'SYNTHETIC Willow'});
 await willow.getByRole('button',{name:'Already sent…',exact:true}).click();
 await p.locator('#already-sent-purpose').selectOption('intro_day_before');await p.getByRole('button',{name:'Yes, I already sent this',exact:true}).click();
 await p.waitForFunction(async id=>{const v=await DB.getAppointment(id);return v.introSent&&v.dayBeforeSent;},data.b);
 await p.waitForFunction(()=>!document.getElementById('already-sent-error'));
 assert.equal(await p.locator('article').filter({hasText:'SYNTHETIC Willow'}).count(),0,'Already-sent action updates the inbox without reopening WhatsApp');
 await p.evaluate(()=>App.navigate('today'));await p.waitForFunction(()=>App.currentHash==='today');
 assert.equal(await p.getByText('Message needs confirmation',{exact:true}).count(),0,'Home has no duplicate generic alert');
 await p.reload();await p.waitForFunction(()=>App.currentHash==='today');
 a=await p.evaluate(id=>DB.getAppointment(id),data.a);assert(a.introSent&&!a.dayBeforeSent);
 const b=await p.evaluate(id=>DB.getAppointment(id),data.b);assert(b.introSent&&b.dayBeforeSent);
 // Exercise the actual handoff boundary with a stub opener: it must never
 // contact WhatsApp, and local persistence must precede the opener.
 const handoff=await p.evaluate(async id=>{
  await App.navigate('talk');
  TalkFeature.pendingMessage={customerId:(await DB.getAppointment(id)).customerId,appointmentId:id,templateKey:'day_before',phone:'07700900111'};
  TalkFeature._draftBookingSnapshot=await TalkFeature.draftBookingSnapshot(id);
  App.openModal('<textarea id="talk-message-preview">SYNTHETIC persistence ordering test</textarea>');
  const original=CommunicationService.recordHandoff;let opened=0,proof;
  NotificationService.sendWhatsApp=()=>{opened++;proof=DB.db.communications.toArray();return true;};
  CommunicationService.recordHandoff=async()=>{throw Error('SYNTHETIC persistence failure');};
  await TalkFeature.confirmSend();
  const failedRetained=!!document.getElementById('talk-message-preview')&&opened===0;
  CommunicationService.recordHandoff=original;
  await TalkFeature.confirmSend();
  const rows=await proof;
  return {failedRetained,opened,persistedBeforeOpen:rows.some(row=>row.content==='SYNTHETIC persistence ordering test'&&!row.sentAt)};
 },data.a);
 assert(handoff.failedRetained&&handoff.opened===1&&handoff.persistedBeforeOpen,'Storage failure retains draft; successful handoff is durably saved before mock opener');
 // A late already-sent completion must not close a different editor.
 await p.evaluate(id=>FollowupsFeature.openAlreadySent(id,'day_before'),data.a);
 await p.evaluate(()=>{
  const original=DB.recordPreviouslySent;
  DB.recordPreviouslySent=async(...args)=>{await new Promise(resolve=>window.finishSyntheticSave=resolve);return original.apply(DB,args);};
  window.syntheticSave=FollowupsFeature.saveAlreadySent();
  App.openModal('<textarea id="unrelated-editor">SYNTHETIC unsaved context</textarea>');
  window.finishSyntheticSave();
 });
 await p.evaluate(()=>window.syntheticSave);
 assert.equal(await p.locator('#unrelated-editor').inputValue(),'SYNTHETIC unsaved context','Late completion preserves another editor');
 assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
 fs.writeFileSync(artifactPath(`beelo-send-resolution-${engine.name()}.json`),JSON.stringify({engine:engine.name(),posts,errors,queueSurvivedReload:true,purposeSeparation:true,failedSaveRetained:true,alreadySentRecorded:true}));
 console.log(`PASS ${engine.name()}: multiple durable hand-offs/reload, one-purpose confirmation, atomic failure retry, not-sent reminder retained, already-sent recovery, Home de-duplication and persisted flags; no external sends`);
 }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
