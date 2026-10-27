'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8038';
(async()=>{for(const engine of [chromium,webkit]){const browser=await engine.launch();let p;try{
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'}),errors=[],posts=[];
 await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60,ai:{enabled:false}}));localStorage.setItem('advisoros_visit_reminders_enabled','false');localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
 p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});await p.clock.setFixedTime(new Date('2026-10-27T18:00:00Z'));await p.goto(base);
 await p.locator('#enc-passphrase-new').fill('SYNTHETIC return context');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC return context');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
 const seed=await p.evaluate(async()=>{
  const ids=[];for(let i=0;i<7;i++){const v=await DB.addAppointment({clientName:'SYNTHETIC Return '+i,address:'SYNTHETIC '+i+' Test Street',type:'fitting',date:'2026-10-28T'+String(9+i).padStart(2,'0')+':00:00Z',arrivalStart:'09:00',arrivalEnd:'17:00',status:'confirmed',notes:'SYNTHETIC context, no real customer'});ids.push(v.id);}
  const order=[...ids].reverse();await DB.setPrivateSetting('visit-plan:2026-10-28',JSON.stringify(order));return {ids,order,rows:JSON.stringify(await DB.getAllAppointments())};
 });
 await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'}));await p.locator('.plan-row').nth(6).waitFor();
 const names=p.locator('.plan-name');assert.match(await names.first().innerText(),/Return 6/);
 await p.waitForFunction(()=>!document.getElementById('main').classList.contains('fade-in') && document.querySelectorAll('.toast').length===0);
 await p.evaluate(()=>{document.getElementById('main').scrollTop=500;window.scrollTo({top:500,behavior:'instant'});});const before=await p.evaluate(()=>Math.max(document.getElementById('main').scrollTop,window.scrollY,document.scrollingElement?.scrollTop||0));assert(before>0);
 await names.nth(4).click();await p.waitForFunction(()=>App.currentHash.startsWith('appointments?id='));await p.getByRole('heading',{name:'Visit',exact:true}).waitFor();
 const expected=seed.order[4];assert.match(await p.locator('#main').innerText(),/SYNTHETIC Return 2/);
 // Crossing midnight while reviewing must not silently change the selected day.
 await p.clock.setFixedTime(new Date('2026-10-28T00:10:00Z'));
 await p.getByRole('button',{name:'Back',exact:true}).click();await p.waitForFunction(id=>document.activeElement?.closest('[data-plan-id]')?.dataset.planId===String(id),expected);
 assert.match(await p.locator('#main').innerText(),/Wednesday 28 Oct/);assert.match(await names.first().innerText(),/Return 6/);assert.equal(await p.getByRole('button',{name:'Today',exact:true}).getAttribute('aria-pressed'),'true');assert(Math.abs((await p.evaluate(()=>Math.max(document.getElementById('main').scrollTop,window.scrollY,document.scrollingElement?.scrollTop||0)))-before)<3,'App Back restores scroll');
 await p.screenshot({path:artifactPath('beelo-planning-return-'+engine.name()+'.png'),animations:'disabled'});
 // Browser Back uses the replaced planning history entry, not a generic diary.
 await names.nth(5).click();await p.waitForFunction(()=>App.currentHash.startsWith('appointments?id='));await p.goBack();await p.waitForFunction(id=>document.activeElement?.closest('[data-plan-id]')?.dataset.planId===String(id),seed.order[5]);assert.match(await names.first().innerText(),/Return 6/);
 // Detail reload retains its explicit return destination. Offline Back needs no server.
 await names.nth(3).click();await p.waitForFunction(()=>App.currentHash.startsWith('appointments?id='));await p.reload();
 // Simulated midnight exceeds the60-minute grace: unlock through the real UI.
 await p.locator('#enc-passphrase').fill('SYNTHETIC return context');await p.getByRole('button',{name:'Unlock',exact:true}).click();
 await p.getByRole('heading',{name:'Visit',exact:true}).waitFor();await c.setOffline(true);await p.getByRole('button',{name:'Back',exact:true}).click();await p.waitForFunction(id=>document.activeElement?.closest('[data-plan-id]')?.dataset.planId===String(id),seed.order[3]);await c.setOffline(false);
 for(const width of [320,390,768]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);}
 assert.equal(await p.evaluate(()=>DB.getPrivateSetting('visit-plan:2026-10-28')),JSON.stringify(seed.order));assert.equal(await p.evaluate(async()=>JSON.stringify(await DB.getAllAppointments())),seed.rows,'Navigation cannot modify bookings');
 // Direct visit links and invalid injected return metadata keep the ordinary diary Back.
 for(const params of [{id:seed.ids[0]},{id:seed.ids[0],returnDay:'2026-02-30',returnAction:'add',returnVisit:'<bad>'}]){await p.evaluate(params=>App.navigate('appointments',params),params);await p.getByRole('heading',{name:'Visit',exact:true}).waitFor();await p.getByRole('button',{name:'Back',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='appointments');assert.equal(await p.locator('#tomorrow-plan').count(),0);}
 assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);console.log('PASS '+engine.name()+': planner→visit App/browser Back, same private order/day across midnight, restored position/focus, detail reload and offline Back; direct-link fallback, responsive widths, no booking writes or sends');
 }catch(e){if(p)await p.screenshot({path:artifactPath('beelo-planning-return-failure-'+engine.name()+'.png')}).catch(()=>{});throw e;}finally{await browser.close();}}})().catch(e=>{console.error(e);process.exitCode=1;});
