'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();let p;try{
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'});
 await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
 p=await c.newPage();const errors=[],posts=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC compact planner');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC compact planner');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
 await p.getByRole('button',{name:'Plan tomorrow',exact:true}).click();await p.getByText('No active visits booked for tomorrow.',{exact:true}).waitFor();
 const data=await p.evaluate(async()=>{
  const customer=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Planner',notes:'SYNTHETIC shared blue fabric context'});
  const day=Utils.formatDate(Utils.getTomorrow(),'iso'),ids=[];
  for(let i=0;i<7;i++){
   const row=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC '+['Alder','Birch','Cedar','Dogwood','Elm','Fir','Grove'][i],address:i===6?'':'SYNTHETIC '+(i+1)+' Mock Street, Test District',type:i%2?'fitting':'measure',date:AppointmentsFeature.proposalInstant(day,String(9+i).padStart(2,'0')+':00'),arrivalStart:i===6?'':i<3?'09:00':'12:00',arrivalEnd:i===6?'':i<3?'12:00':'15:00',introSent:true,dayBeforeSent:true,notes:'SYNTHETIC local access notes '.repeat(20)});
   ids.push(row.id);
  }
  const first=await DB.getAppointment(ids[0]);
  await DB.updateAppointment(first.id,{timeProposal:{status:'pending',time:'10:15',originalDate:first.date,createdAt:new Date().toISOString()}});
  await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC cancelled',date:first.date,status:'cancelled'});
  await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC completed',date:first.date,outcome:'fitted'});
  return {ids,dates:await Promise.all(ids.map(async id=>(await DB.getAppointment(id)).date))};
 });
 await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'}));
 const rows=p.locator('#tomorrow-plan .plan-row');await rows.nth(6).waitFor();assert.equal(await rows.count(),7);
 assert.equal(await p.locator('.plan-row-details[open]').count(),0);
 assert.match(await rows.first().innerText(),/SYNTHETIC Alder/);assert.match(await rows.first().innerText(),/09:00–12:00/);assert.match(await rows.first().innerText(),/10:15/);assert.match(await rows.first().innerText(),/Not agreed/);
 assert(!((await rows.first().innerText()).includes('shared blue fabric')),'Long context remains collapsed');
 assert.match(await rows.last().innerText(),/Not recorded/);
 await p.waitForFunction(()=>document.querySelectorAll('.toast').length===0);
 for(const width of [320,390,768]){
  await p.setViewportSize({width,height:844});
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways page scrolling at '+width);
  const height=(await rows.first().boundingBox()).height;assert(height<180,'Compact closed row must stay under180px at '+width+', got '+height);
  assert((await rows.first().locator('.plan-time').boundingBox()).height>=32);
  await p.screenshot({path:artifactPath('beelo-compact-plan-'+engine.name()+'-'+width+'.png'),animations:'disabled'});
 }
 await p.setViewportSize({width:390,height:844});
 const summary=rows.first().locator('summary');await summary.focus();await summary.press('Enter');await p.waitForFunction(()=>document.querySelector('.plan-row-details')?.open);
 await rows.first().getByText('SYNTHETIC shared blue fabric context',{exact:false}).waitFor();assert(await rows.first().getByRole('button',{name:'Review pre-visit message',exact:true}).isVisible());
 await rows.first().getByRole('button',{name:'Move visit 1 down',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.plan-name')?.textContent.includes('Birch'));
 // Real mouse pointer capture uses the same handle path as touch, without synthetic event overrides.
 const handle=rows.first().locator('[data-plan-drag]');await handle.scrollIntoViewIfNeeded();const from=await handle.boundingBox(),to=await rows.nth(1).boundingBox();
 await p.mouse.move(from.x+from.width/2,from.y+from.height/2);await p.mouse.down();await p.mouse.move(to.x+to.width/2,to.y+25,{steps:6});await p.mouse.up();
 await p.waitForFunction(()=>document.querySelector('.plan-name')?.textContent.includes('Alder'));
 assert.deepEqual(await p.evaluate(async ids=>Promise.all(ids.map(async id=>(await DB.getAppointment(id)).date)),data.ids),data.dates,'Reordering cannot alter booked times');
 await rows.first().locator('.plan-time').click();await p.locator('#proposal-time').waitFor();assert.equal(await p.locator('#proposal-time').inputValue(),'10:15');
 await p.getByRole('button',{name:'Review agreed booking change',exact:true}).click();await p.locator('#proposal-time').waitFor();assert.equal(await p.locator('#proposal-agreed').isChecked(),false);
 await p.locator('#proposal-time').fill('10:30');await p.getByRole('button',{name:'Save proposal',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#proposal-time')?.value==='10:30'&&document.querySelector('#proposal-copy')?.value.includes('10:30'));
 await p.getByRole('button',{name:'Close time proposal',exact:true}).click();await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'}));await rows.first().getByText('10:30',{exact:true}).waitFor();
 await c.setOffline(true);await rows.first().locator('summary').click();await rows.first().getByRole('button',{name:'Move visit 1 down',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.plan-name')?.textContent.includes('Birch'));await c.setOffline(false);
 await p.reload();await rows.nth(6).waitFor();assert.match(await rows.first().innerText(),/Birch/);assert.match(await rows.nth(1).innerText(),/10:30/);
 assert.deepEqual(await p.evaluate(async ids=>Promise.all(ids.map(async id=>(await DB.getAppointment(id)).date)),data.ids),data.dates,'Proposal and reload must preserve original bookings');
 await p.getByRole('button',{name:'Preview proposed route',exact:true}).click();await p.locator('#planning-route-preview').waitFor();assert.match(await p.locator('#planning-route-preview').innerText(),/backwards through booked times/);await p.getByRole('button',{name:'Close route preview',exact:true}).click();
 await p.getByRole('button',{name:'Reset to booked-time order',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.plan-name')?.textContent.includes('Alder'));
 await rows.first().locator('.plan-name').click();await p.waitForFunction(id=>App.currentHash==='appointments?id='+id,data.ids[0]);
 assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
 console.log('PASS '+engine.name()+': seven compact rows at320/390/768, four fields/missing values, collapsed context/keyboard actions, real pointer reorder, saved order/offline/reload, proposal without agreement/booked-time changes, preview and original visit; no uploads');
 }catch(error){if(p)await p.screenshot({path:artifactPath('beelo-compact-plan-failure-'+engine.name()+'.png')}).catch(()=>{});throw error;}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
