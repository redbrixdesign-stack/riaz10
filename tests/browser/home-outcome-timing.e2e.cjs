'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8038';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();let p;try{
  const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'America/Los_Angeles'}),external=[],posts=[],errors=[];
  await c.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(base).origin)return r.continue();external.push(r.request().url());return r.abort();});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60,ai:{enabled:false}}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));localStorage.setItem('advisoros_visit_reminders_enabled','false');});
  p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await p.clock.setFixedTime(new Date('2026-10-26T10:30:00Z'));await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC outcome timing');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC outcome timing');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
  const fixture=await p.evaluate(async()=>{
   const customer=await DB.addCustomer({firstName:'SYNTHETIC outcome timing',notes:'SYNTHETIC context retained'});const ids=[];
   for(const [name,date,status,outcome] of [['Ongoing','2026-10-26T10:00:00Z','confirmed',null],['Future','2026-10-26T12:00:00Z','confirmed',null],['Cancelled','2026-10-26T08:00:00Z','cancelled',null],['Completed','2026-10-26T08:00:00Z','completed','completed']]){
    ids.push((await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC '+name,date,status,outcome,durationSlots:4,type:'fitting',latLng:[53.46,-2.25],introSent:true,dayBeforeSent:true})).id);
   }
   return{ids,original:JSON.stringify(await DB.db.appointments.toArray())};
  });
  async function check(due){
   const state=await p.evaluate(async()=>({home:(await CompanionFeature.buildHomeData()).attention.filter(a=>a.label==='Outcomes not logged'),evening:(await CompanionFeature.answerEveningReview()).facts.filter(a=>a.label==='Outcomes not logged'),tasks:(await FollowupsFeature.loadTasks()).filter(t=>t.kind==='visit_today'&&t.due)}));
   assert.equal(state.home.length,due?1:0);assert.equal(state.evening.length,due?1:0);assert.equal(state.tasks.length,due?1:0);if(due){assert.match(state.home[0].value,/1 visit today/);assert.match(state.evening[0].value,/1 visit today/);}
   await p.evaluate(()=>App.navigate('today'));await p.waitForFunction(expected=>!!document.querySelector('.comp-home')&&[...document.querySelectorAll('.comp-home-attention-label')].filter(el=>el.textContent.trim()==='Outcomes not logged').length===expected,due?1:0);assert.equal(await p.getByText('Outcomes not logged',{exact:true}).count(),due?1:0);
  }
  await check(false);await p.clock.setFixedTime(new Date('2026-10-26T10:59:59.999Z'));await check(false);await p.waitForFunction(()=>document.querySelectorAll('.toast').length===0);await p.screenshot({path:artifactPath('beelo-home-outcome-not-due-'+engine.name()+'.png'),animations:'disabled'});
  await p.clock.setFixedTime(new Date('2026-10-26T11:00:00Z'));await check(true);await p.locator('#comp-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});await p.screenshot({path:artifactPath('beelo-home-outcome-due-'+engine.name()+'.png'),animations:'disabled'});
  assert.equal(await p.evaluate(async()=>JSON.stringify(await DB.db.appointments.toArray())),fixture.original,'Rendering must not write booking, status, outcome or earnings');
  await c.setOffline(true);await p.evaluate(id=>DB.updateAppointment(id,{date:'2026-10-27T10:00:00Z'}),fixture.ids[0]);await check(false);await c.setOffline(false);await p.reload();await p.waitForFunction(()=>App.currentHash==='today');await check(false);assert.equal(await p.evaluate(async id=>(await DB.getAppointment(id)).status,fixture.ids[0]),'confirmed');
  assert.deepEqual(posts,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('PASS '+engine.name()+': Home/evening/Follow-ups agree before/during/exact scheduled finish; cancelled/completed excluded; UK day on foreign device; no automatic booking/earnings writes; explicit offline reschedule removes alert and survives reload; no sends/provider calls');
 }catch(e){if(p)await p.screenshot({path:artifactPath('beelo-home-outcome-failure-'+engine.name()+'.png')}).catch(()=>{});throw e;}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
