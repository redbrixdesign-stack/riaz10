'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'});
  await context.addInitScript(()=>{
   localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));
   localStorage.setItem('advisoros_visit_reminders_enabled','false');localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));
  });
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[],posts=[];
  page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(base);
  await page.locator('#enc-passphrase-new').fill('SYNTHETIC-draft-device');await page.locator('#enc-passphrase-confirm').fill('SYNTHETIC-draft-device');
  await page.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  await page.waitForFunction(()=>App.currentHash==='today');
  const open=async()=>{await page.evaluate(()=>App.navigate('appointments',{action:'add',date:'2026-11-23',time:'09:00'}));await page.waitForFunction(()=>VisitDraft.current?.ready);};
  const saved=async()=>{await page.waitForFunction(()=>document.getElementById('visit-draft-status')?.textContent.startsWith('Draft saved encrypted'));};
  await open();
  assert.equal(await page.evaluate(()=>DB.getVisitDraft()),null,'An untouched empty form is not a draft');
  await page.locator('#appt-name').dispatchEvent('input');
  await page.waitForFunction(()=>document.getElementById('visit-draft-status')?.textContent.startsWith('No unfinished changes'));
  assert.equal(await page.evaluate(()=>DB.getVisitDraft()),null,'An empty no-op event must not invent a saved draft');
  await page.locator('#appt-name').fill('SYNTHETIC Willow Recovery');
  await page.locator('#appt-address').fill('1 SYNTHETIC Lane — not a real address');
  await page.locator('#appt-access').fill('SYNTHETIC side gate');
  const note='SYNTHETIC bedroom 🪟 اردو </textarea><img src=x onerror=alert(1)>';
  await page.locator('#appt-notes').fill(note);
  await page.evaluate(()=>{NoteCapture.setRecordings('appt-notes',[{id:'synthetic-audio',dataUrl:'data:audio/webm;base64,QUJD',mediaType:'audio/webm',transcript:'SYNTHETIC transcript'}]);NoteCapture.refresh('appt-notes');});
  await saved();
  const unchangedRevision=await page.evaluate(async()=>(await DB.getVisitDraft()).revision);
  await page.locator('#appt-name').dispatchEvent('input');await saved();
  assert.equal(await page.evaluate(async()=>(await DB.getVisitDraft()).revision),unchangedRevision,'No-op input must restore truthful Saved status without rewriting the draft');
  // A deliberately stalled transport must release the real New Visit gate.
  // Only this explicit synthetic call is intercepted; no provider is contacted.
  await page.clock.install();
  await page.evaluate(()=>{
   window.originalTranscriptionFetch=window.fetch;
   window.fetch=(url,options)=>url==='/api/transcribe'?new Promise(resolve=>{window.releaseStalledTranscription=resolve;}):window.originalTranscriptionFetch(url,options);
   window.stalledTranscription=NoteCapture.transcribe('appt-notes','synthetic-audio');
  });
  assert(await page.evaluate(()=>VisitDraft.busy()));
  await page.evaluate(()=>App.navigate('today'));assert(await page.locator('#appt-name').isVisible());
  await page.clock.fastForward(75_000);await page.evaluate(()=>window.stalledTranscription);
  assert.equal(await page.evaluate(()=>VisitDraft.busy()),false);assert.equal(await page.locator('#appt-notes').inputValue(),note);
  assert.equal(await page.evaluate(()=>NoteCapture.getRecordings('appt-notes').length),1);
  await page.evaluate(()=>{window.fetch=window.originalTranscriptionFetch;window.releaseStalledTranscription({ok:true,status:200,json:async()=>({ok:true,text:'SYNTHETIC late transcript — must not append'})});});
  await page.clock.resume();assert.equal(await page.locator('#appt-notes').inputValue(),note);
  assert(await page.evaluate(async()=>isEncrypted((await DB.db.settings.get('__new_visit_draft_v1__')).value)),'Raw persisted draft must be encrypted');
  assert.equal(await page.evaluate(()=>DB.db.appointments.count()),0);
  assert(!(await page.evaluate(()=>DB.exportAll())).settings.some(row=>row.key==='__new_visit_draft_v1__'),'Export excludes recovery data');
  await page.evaluate(async()=>{try{await DB.importAll(await DB.exportAll());throw Error('unexpected import');}catch(e){if(!e.message.includes('unfinished visit'))throw e;}});
  await page.evaluate(()=>App.navigate('today'));
  await page.getByRole('heading',{name:'Leave unfinished visit?',exact:true}).waitFor();
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();assert.equal(await page.locator('#appt-notes').inputValue(),note);
  await page.evaluate(()=>App.navigate('appointments',{action:'add',name:'SYNTHETIC separate scan'}));await page.getByRole('button',{name:'Leave and keep draft',exact:true}).click();
  await page.getByRole('button',{name:'Resume draft',exact:true}).waitFor();
  assert(await page.locator('#appt-name').evaluate(el=>el.closest('.p-md').inert),'Finishing the old session must not enable a new form before recovery');
  await page.getByRole('button',{name:'Resume draft',exact:true}).click();await page.waitForFunction(()=>VisitDraft.current?.ready);
  assert.equal(await page.locator('#appt-name').inputValue(),'SYNTHETIC Willow Recovery');assert.equal(await page.locator('#appt-notes').inputValue(),note);
  assert.equal(await page.evaluate(()=>NoteCapture.getRecordings('appt-notes').length),1);assert.equal(await page.locator('#appt-notes img').count(),0);
  await page.screenshot({path:artifactPath(`beelo-draft-restored-${engine.name()}.png`),animations:'disabled'});
  // Reload must recover the durable encrypted snapshot, never create a visit.
  await page.reload();await page.getByRole('button',{name:'Resume draft',exact:true}).click();await page.waitForFunction(()=>VisitDraft.current?.ready);
  assert.equal(await page.locator('#appt-notes').inputValue(),note);assert.equal(await page.evaluate(()=>DB.db.appointments.count()),0);
  // Simulated storage failure: truthful status and no navigation/update bypass.
  await page.evaluate(()=>{window.originalDraftWrite=DB.writeVisitDraft;DB.writeVisitDraft=async()=>{throw Error('SYNTHETIC quota');};});
  await page.locator('#appt-notes').fill(note+' changed');await page.waitForFunction(()=>document.getElementById('visit-draft-status').textContent.startsWith('Draft not saved'));
  await page.evaluate(()=>{App._waitingServiceWorker={postMessage:()=>{window.syntheticActivated=true;}};});
  await page.evaluate(()=>App.applyServiceWorkerUpdate());assert.equal(await page.evaluate(()=>!!window.syntheticActivated),false);
  await page.evaluate(()=>App.navigate('today'));await page.getByRole('button',{name:'Leave and keep draft',exact:true}).click();
  assert.equal(await page.locator('#appt-notes').inputValue(),note+' changed');
  await page.evaluate(()=>{DB.writeVisitDraft=window.originalDraftWrite;App.closeModal({all:true});});
  await page.evaluate(()=>VisitDraft.flush());
  // Completed audio remains; pending capture cannot be lost to a route/update.
  await page.evaluate(()=>{NoteCapture.finalizing.add('appt-notes');App.navigate('today');});
  assert(await page.locator('#appt-name').isVisible());await page.evaluate(()=>NoteCapture.finalizing.delete('appt-notes'));
  // Failed booking validation preserves the draft, then a real Save clears it.
  await page.locator('#appt-address').fill('');await page.locator('#appt-save-btn').click();assert.equal(await page.evaluate(()=>DB.db.appointments.count()),0);assert(await page.evaluate(()=>DB.getVisitDraft()));
  await page.locator('#appt-address').fill('1 SYNTHETIC Lane — not a real address');
  // Invalid audio bytes intentionally stay in the draft-only exercise above;
  // remove them before testing booking playback-independent persistence.
  await page.evaluate(()=>{NoteCapture.setRecordings('appt-notes',[]);NoteCapture.refresh('appt-notes');});
  await page.evaluate(()=>{window.originalAppointmentWrite=DB.addAppointment;DB.addAppointment=async()=>{throw Error('SYNTHETIC booking failure');};});
  await page.locator('#appt-save-btn').click();await page.waitForFunction(()=>!AppointmentsFeature._saveAppointmentInFlight);
  assert.equal(await page.evaluate(()=>DB.db.appointments.count()),0);assert(await page.evaluate(()=>DB.getVisitDraft()));assert.equal(await page.locator('#appt-notes').inputValue(),note+' changed');
  await page.evaluate(()=>{DB.addAppointment=window.originalAppointmentWrite;});
  await page.locator('#appt-save-btn').click();
  await page.waitForFunction(async()=>await DB.db.appointments.count()===1);
  await page.waitForFunction(()=>!VisitDraft.isEditing());
  assert.equal(await page.evaluate(()=>DB.getVisitDraft()),null);
  assert.equal(await page.evaluate(async()=>(await DB.getAppointment((await DB.db.appointments.toArray())[0].id)).notes),'Access: SYNTHETIC side gate\n\n'+note+' changed');
  await open();await page.locator('#appt-name').fill('SYNTHETIC explicit discard');await saved();
  await page.getByRole('button',{name:'Discard unfinished visit',exact:true}).click();await page.getByRole('button',{name:'Keep draft',exact:true}).click();assert(await page.evaluate(()=>DB.getVisitDraft()));
  await page.getByRole('button',{name:'Discard unfinished visit',exact:true}).click();await page.locator('#modal-overlay').getByRole('button',{name:'Discard unfinished visit',exact:true}).click();
  await page.waitForFunction(()=>!VisitDraft.isEditing());assert.equal(await page.evaluate(()=>DB.getVisitDraft()),null);assert.equal(await page.evaluate(()=>DB.db.appointments.count()),1);
  // A stale tab/session cannot overwrite or delete another session's revision.
  await open();await page.locator('#appt-name').fill('SYNTHETIC stale tab');await saved();
  await page.evaluate(async()=>{const row=await DB.getVisitDraft();await DB.writeVisitDraft({...row.draft,updatedAt:'SYNTHETIC other tab'},row.revision);});
  await page.locator('#appt-notes').fill('SYNTHETIC conflict');await page.waitForFunction(()=>document.getElementById('visit-draft-status').textContent.startsWith('Draft changed in another tab'));
  await page.evaluate(async()=>{try{await VisitDraft.prepareSave();throw Error('unexpected stale save');}catch(e){if(e.message!=='draft_conflict')throw e;}});
  assert.equal(await page.evaluate(()=>DB.db.appointments.count()),1);
  await page.screenshot({path:artifactPath(`beelo-draft-conflict-${engine.name()}.png`),animations:'disabled'});
  await page.getByRole('button',{name:'Discard unfinished visit',exact:true}).click();await page.locator('#modal-overlay').getByRole('button',{name:'Discard unfinished visit',exact:true}).click();
  assert(await page.locator('#appt-notes').isVisible(),'Stale discard must keep this form open');await page.evaluate(()=>App.closeModal({all:true}));
  // Crash after booking commit but before draft cleanup: only open the saved
  // visit, never offer the draft for another booking.
  await page.evaluate(async()=>{const row=await DB.getVisitDraft();await DB.addAppointment({entryDraftId:row.draft.id,clientName:'SYNTHETIC committed recovery',date:new Date(2026,10,24,9).toISOString(),type:'consultation'});});
  await page.reload();await page.getByRole('button',{name:'Open saved visit',exact:true}).click();await page.waitForFunction(()=>!VisitDraft.isEditing());
  assert.equal(await page.evaluate(()=>DB.getVisitDraft()),null);assert.equal(await page.evaluate(()=>DB.db.appointments.count()),2);
  await page.evaluate(()=>App.navigate('appointments',{action:'add',leadId:'999',date:'2026-11-23',time:'09:00'}));await page.waitForFunction(()=>VisitDraft.current?.ready);
  await page.locator('#appt-name').fill('SYNTHETIC linked entry');await saved();await page.evaluate(()=>App.navigate('today'));await page.getByRole('button',{name:'Leave and keep draft',exact:true}).click();await page.waitForFunction(()=>App.currentHash==='today');
  await page.evaluate(()=>App.navigate('appointments',{action:'add',jobId:'888',jobRole:'fitting'}));await page.getByRole('button',{name:'Resume draft',exact:true}).click();await page.waitForFunction(()=>VisitDraft.current?.ready);
  assert.equal(await page.locator('#appt-lead-id').inputValue(),'999');assert.equal(await page.locator('#appt-job-id').count(),0,'Resuming a lead draft cannot silently bind it to a newly opened job');
  await page.getByRole('button',{name:'Discard unfinished visit',exact:true}).click();await page.locator('#modal-overlay').getByRole('button',{name:'Discard unfinished visit',exact:true}).click();await page.waitForFunction(()=>!VisitDraft.isEditing());
  await page.evaluate(async()=>{await DB.db.settings.put({key:'__new_visit_draft_v1__',value:'SYNTHETIC unreadable',revision:'SYNTHETIC-revision'});App.navigate('appointments',{action:'add'});});
  await page.getByRole('button',{name:'Discard saved draft',exact:true}).waitFor();assert(await page.locator('#appt-name').evaluate(el=>el.closest('.p-md').inert));
  await page.getByRole('button',{name:'Discard saved draft',exact:true}).click();await page.locator('#modal-overlay').getByRole('button',{name:'Discard unfinished visit',exact:true}).click();await page.waitForFunction(()=>!VisitDraft.isEditing());
  assert.equal(await page.evaluate(()=>DB.getVisitDraft()),null);assert.equal(await page.evaluate(()=>DB.db.appointments.count()),2);
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: real encryption/unlock, durable text/audio recovery and reload, stalled transcription deadline/late-result isolation, no auto booking, leave/discard confirmation, export/import boundary, storage failure, blocked update, busy capture, validation/save cleanup, stale revision protection; no sends`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
