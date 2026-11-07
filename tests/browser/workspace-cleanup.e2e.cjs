'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),{artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8000';
(async()=>{for(const engine of [chromium,webkit]){const browser=await engine.launch();try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'}),errors=[],posts=[],external=[];
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(base).origin)return r.continue();external.push(r.request().url());return r.abort();});
 await context.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,advisorName:'SYNTHETIC Navigation Adviser',weeklyTarget:1000,ai:{enabled:false}}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));localStorage.setItem('advisoros_visit_reminders_enabled','false');});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});await p.clock.setFixedTime(new Date('2026-11-09T10:30:00Z'));await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC home money');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC home money');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.locator('.hw-home').waitFor();
 const ids=await p.evaluate(async()=>{WeatherService.getTodayWeather=async()=>null;const customer=await DB.addCustomer({firstName:'SYNTHETIC Navigation Customer',phone:'07700900951',notes:'Parking: sample driveway'});const sale=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Navigation Customer',type:'consultation',date:'2026-11-09T08:00:00Z',status:'completed',outcome:'ordered',value:400,commission:40});const visit=await DB.addAppointment({customerId:customer.id,clientName:'SYNTHETIC Navigation Customer',type:'fitting',date:'2026-11-09T14:00:00Z',status:'confirmed'});const order=await DB.db.orders.add({customerId:customer.id,appointmentId:sale.id,total:400,balanceDue:0,source:'survey_referral',stage:'ordered',orderNumber:'SYNTHETIC-NAV-400'});await DB.updateAppointment(visit.id,{orderId:order});return {customer:customer.id,visit:visit.id,order};});
 await p.evaluate(()=>App.navigate('today'));const weekly=p.getByRole('button',{name:'This week: open money details',exact:true});await weekly.waitFor();
 const nav=async()=>assert.deepEqual(await p.locator('#bottom-nav .nav-item').evaluateAll(x=>x.map(e=>e.dataset.feature)),['today','control']);await nav();
 await p.screenshot({path:artifactPath('cleanup-home-money-entry-'+engine.name()+'.png'),fullPage:true,animations:'disabled'});await weekly.click();await p.getByRole('heading',{name:'Money',exact:true}).waitFor();await nav();await p.locator('[data-action="MoneyFeature.openExpenseModal"]').click();await p.locator('#expense-amount').waitFor();await p.evaluate(()=>App.closeModal());await p.getByRole('button',{name:'Back',exact:true}).click();await p.locator('.hw-home').waitFor();
 await p.locator('#bottom-nav').getByRole('button',{name:'Tools',exact:true}).click();await p.getByText('More tools & saved records',{exact:true}).click();const overview=p.getByRole('button',{name:'Orders overview',exact:true});await overview.waitFor();await p.getByRole('button',{name:'Money',exact:true}).waitFor();await p.screenshot({path:artifactPath('cleanup-home-money-tools-'+engine.name()+'.png'),fullPage:true,animations:'disabled'});await overview.click();await p.getByRole('heading',{name:'Orders',exact:true}).waitFor();assert.match(await p.locator('#main').innerText(),/SYNTHETIC-NAV-400/);await nav();await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('heading',{name:'Tools',exact:true}).waitFor();await p.getByRole('button',{name:'Money',exact:true}).click();await p.getByRole('heading',{name:'Money',exact:true}).waitFor();
 await context.setOffline(true);await p.getByRole('button',{name:'Back',exact:true}).click();await weekly.waitFor();await weekly.click();await p.getByRole('heading',{name:'Money',exact:true}).waitFor();await context.setOffline(false);
 await p.reload();await p.getByRole('heading',{name:'Money',exact:true}).waitFor();await nav();await p.getByRole('button',{name:'Back',exact:true}).click();await p.locator('.hw-customer-name').click();await p.locator('#customer-workspace').waitFor();await p.getByRole('navigation',{name:'Customer workspace sections'}).getByRole('button',{name:'Money',exact:true}).click();assert.equal(await p.locator('#customer-money[open]').count(),1);await nav();
 for(const width of [320,390,768]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow '+width);}
 await p.evaluate(()=>{window.syntheticWeekMoney=HomeWorkspace.weekMoney;HomeWorkspace.weekMoney=async()=>{throw Error('SYNTHETIC summary unavailable')};App.navigate('today');});
 await p.getByRole('button',{name:'Open money details',exact:true}).waitFor();await p.getByRole('button',{name:'Open money details',exact:true}).click();await p.getByRole('heading',{name:'Money',exact:true}).waitFor();await p.evaluate(()=>{HomeWorkspace.weekMoney=window.syntheticWeekMoney;delete window.syntheticWeekMoney;});

 // Cleanup acceptance: a single diary, quiet finance/tools, no completion promotion.
 await p.evaluate(()=>CompanionFeature.openMyDay('2032-06-21'));
 await p.locator('#home-inline-calendar:not([hidden])').waitFor();
 assert.equal(await p.locator('#home-calendar-year').inputValue(),'2032');
 assert.equal(await p.locator('#home-calendar-month').inputValue(),'6');
 assert.equal(await p.locator('#companion-myday-root').count(),0);
 assert.equal(await p.evaluate(()=>typeof HomeScreenController),'undefined');
 await p.screenshot({path:artifactPath('cleanup-shared-diary-'+engine.name()+'.png'),fullPage:true});
 await p.evaluate(()=>App.navigate('control'));
 const more=p.locator('details').filter({has:p.locator('summary', {hasText:'More tools & saved records'})});
 assert.equal(await more.getAttribute('open'),null);
 assert.equal(await p.getByRole('button',{name:'Suppliers',exact:true}).count(),0);
 await more.locator('summary').click();await p.getByRole('button',{name:'Suppliers',exact:true}).waitFor();
 await p.getByRole('button',{name:'Invoices',exact:true}).waitFor();
 await p.evaluate(()=>App.navigate('money'));await p.locator('#tax-section').waitFor();
 assert.equal(await p.locator('#tax-section').getAttribute('open'),null);
 await p.evaluate(id=>App.navigate('appointments',{id}),ids.visit);
 await p.locator('[data-action="AppointmentsFeature.captureOutcome"]').first().waitFor();
 assert.equal(await p.getByRole('button',{name:'Create Social Post',exact:true}).count(),0,'No unfinished-work promotion');
 await p.evaluate(id=>AppointmentsFeature.captureOutcome(id,'completed'),ids.visit);
 await p.locator('#outcome-save').waitFor();await p.locator('#outcome-save').click();
 await p.waitForFunction(async id=>(await DB.getAppointment(id)).status==='completed',ids.visit);
 await p.getByRole('button',{name:'Create Social Post',exact:true}).waitFor();
 assert.equal(await p.getByRole('heading',{name:'Worth sharing?',exact:true}).count(),0);
 await p.evaluate(id=>App.navigate('customer',{id}),ids.customer);await p.locator('#customer-workspace').waitFor();
 assert.equal(await p.locator('.cw-money-overview-grid').count(),0);
 await p.evaluate(async id=>{
   const original=DB.getAppointment;let release;
   DB.getAppointment=async function(key){const value=await original.call(DB,key);await new Promise(resolve=>release=resolve);return value;};
   const pending=AppointmentsFeature.returnToVisit(id);
   while(!release)await new Promise(resolve=>setTimeout(resolve,0));
   App.navigate('control');release();await pending;DB.getAppointment=original;
 },ids.visit);
 await p.getByRole('heading',{name:'Tools',exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>App.currentHash),'control','Late completion refresh cannot override a later navigation');
 await p.evaluate(id=>App.navigate('customer',{id}),ids.customer);await p.locator('#customer-workspace').waitFor();

 await p.screenshot({path:artifactPath('cleanup-customer-'+engine.name()+'.png'),fullPage:true});
 const after=await p.evaluate(async ids=>({customer:!!await DB.getCustomer(ids.customer),visit:await DB.getAppointment(ids.visit),order:await DB.db.orders.get(ids.order)}),ids);assert(after.customer);assert.equal(after.visit.status,'completed');assert.equal(after.order.total,400);assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);assert.deepEqual(external,[]);console.log('PASS cleanup '+engine.name()+': Home weekly summary → Money → Back; Tools fallback and Orders overview; expense sheet, offline navigation, reload/deep link, customer money, 320–768px; unchanged records, no contacts/provider requests');
 }finally{await browser.close();}}})().catch(e=>{console.error(e);process.exitCode=1});
