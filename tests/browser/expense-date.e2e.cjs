'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=','base64');
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 let page;
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));localStorage.setItem('advisoros_visit_reminders_enabled','false');});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  page=await context.newPage();const errors=[],posts=[];page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
  await page.clock.install({time:new Date('2026-04-05T23:30:00Z')});
  await page.goto(base);await page.locator('#enc-passphrase-new').fill('SYNTHETIC-expense-device');await page.locator('#enc-passphrase-confirm').fill('SYNTHETIC-expense-device');await page.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  await page.waitForFunction(()=>App.currentHash==='today');await page.evaluate(()=>App.navigate('money'));
  await page.locator('button[data-action="MoneyFeature.openExpenseModal"]').last().click();
  await page.waitForFunction(()=>document.activeElement?.id==='expense-date');
  assert.equal(await page.locator('#expense-date').inputValue(),'2026-04-06','Default uses UK day, not UTC or device day');
  await page.locator('#expense-amount').fill('12.50');await page.locator('#expense-description').fill('SYNTHETIC older fixing receipt');
  await page.evaluate(()=>{AIService.isEnabled=()=>true;AIService.extractReceipt=async()=>({ok:true,fields:{date:'2026-04-05',amount:'12.50',description:'SYNTHETIC older fixing receipt',category:CONFIG.expenseCategories[0].id}});});
  await page.locator('#expense-photo').setInputFiles({name:'SYNTHETIC-receipt.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.getElementById('expense-date')?.value==='2026-04-05');
  await page.getByText('Date read from receipt — check it before saving.',{exact:true}).waitFor();
  const photo=await page.evaluate(()=>MoneyFeature.expensePhotoData);assert(photo.startsWith('data:image/'));
  await page.locator('#expense-date').fill('');await page.getByRole('button',{name:'Save Expense',exact:true}).click();assert.equal(await page.evaluate(()=>DB.db.expenses.count()),0);assert.equal(await page.evaluate(()=>MoneyFeature.expensePhotoData),photo);
  await page.locator('#expense-date').fill('2026-04-05');
  // Controlled slow local storage verifies duplicate protection and retained
  // form/receipt on a failed write; no provider or real database is involved.
  await page.evaluate(()=>{window.originalExpenseAdd=DB.addExpense;window.syntheticExpenseWrites=0;DB.addExpense=()=>{window.syntheticExpenseWrites++;return new Promise(resolve=>{window.releaseExpenseWrite=resolve;});};});
  await page.getByRole('button',{name:'Save Expense',exact:true}).click();await page.getByRole('button',{name:'Save Expense',exact:true}).click();
  assert.equal(await page.evaluate(()=>DB.db.expenses.count()),0);
  assert.equal(await page.evaluate(()=>window.syntheticExpenseWrites),1);
  await page.evaluate(()=>{window.releaseExpenseWrite({id:999});DB.addExpense=window.originalExpenseAdd;});
  await page.waitForFunction(()=>!MoneyFeature._savingExpense);
  await page.locator('button[data-action="MoneyFeature.openExpenseModal"]').last().click();await page.waitForFunction(()=>document.activeElement?.id==='expense-date');
  await page.locator('#expense-date').fill('2026-04-05');await page.locator('#expense-amount').fill('12.50');await page.locator('#expense-description').fill('SYNTHETIC older fixing receipt');
  await page.evaluate(()=>{AIService.isEnabled=()=>false;});await page.locator('#expense-photo').setInputFiles({name:'SYNTHETIC-receipt.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>!!MoneyFeature.expensePhotoData);
  const finalPhoto=await page.evaluate(()=>MoneyFeature.expensePhotoData);
  await page.evaluate(()=>{DB.addExpense=async()=>{throw Error('SYNTHETIC disk failure');};});
  await page.getByRole('button',{name:'Save Expense',exact:true}).click();await page.waitForFunction(()=>!MoneyFeature._savingExpense);
  assert.equal(await page.locator('#expense-date').inputValue(),'2026-04-05');assert.equal(await page.evaluate(()=>MoneyFeature.expensePhotoData),finalPhoto);
  await page.evaluate(()=>{DB.addExpense=window.originalExpenseAdd;});await page.getByRole('button',{name:'Save Expense',exact:true}).click();
  await page.waitForFunction(async()=>await DB.db.expenses.count()===1);
  const row=await page.evaluate(async()=>(await DB.db.expenses.toArray())[0]);
  assert.equal(row.date,'2026-04-04T23:00:00.000Z');assert.equal(row.photo,finalPhoto);assert.equal(row.amount,12.5);assert.equal(row.description,'SYNTHETIC older fixing receipt');
  assert.equal(await page.evaluate(date=>Utils.formatDateUK(date,'iso'),row.createdAt),'2026-04-06','Capture timestamp stays separate');
  const ids=await page.evaluate(async()=>({before:(await DB.getExpensesForPeriod(Utils.ukMidnightInstant(2025,4,6).toISOString(),Utils.ukMidnightInstant(2026,4,6).toISOString())).map(r=>r.id),after:(await DB.getExpensesForPeriod(Utils.ukMidnightInstant(2026,4,6).toISOString(),Utils.ukMidnightInstant(2027,4,6).toISOString())).map(r=>r.id)}));
  assert(ids.before.includes(row.id));assert(!ids.after.includes(row.id),'Expense before cutover must not become a current-year expense');
  await page.evaluate(id=>MoneyFeature.openEditExpenseModal(id),row.id);await page.waitForFunction(()=>document.activeElement?.id==='edit-expense-date');
  assert.equal(await page.locator('#edit-expense-date').inputValue(),'2026-04-05');assert.equal(await page.locator('#edit-expense-description').inputValue(),row.description);assert.equal(await page.locator('.sheet-body img').getAttribute('src'),finalPhoto);
  await page.screenshot({path:artifactPath(`beelo-expense-date-${engine.name()}.png`),animations:'disabled'});
  // All small widths keep the date and save control inside their container.
  for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});assert(await page.locator('#edit-expense-date').evaluate(el=>el.getBoundingClientRect().right<=window.innerWidth+1));}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.locator('#edit-expense-date').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(async id=>(await DB.db.expenses.get(id)).date,row.id),row.date);
  await page.evaluate(id=>MoneyFeature.openEditExpenseModal(id),row.id);await page.waitForFunction(()=>document.activeElement?.id==='edit-expense-date');await page.locator('#edit-expense-date').fill('2026-03-31');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.locator('#edit-expense-date').waitFor({state:'hidden'});
  await page.reload();await page.waitForFunction(()=>typeof MoneyFeature!=='undefined'&&DB.db?.isOpen());
  const restored=await page.evaluate(async id=>{await DB.init();return DB.db.expenses.get(id);},row.id);
  assert.equal(restored.date,'2026-03-30T23:00:00.000Z');assert.equal(restored.photo,finalPhoto);assert.equal(restored.description,row.description);assert.equal(restored.createdAt,row.createdAt);
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()}: genuine local key, UK day on foreign device, mocked receipt-date review, historical expense/period, validation/failure/media retention, edit/no-op/reload and small widths; no provider or sends`);
 }catch(error){
  if(page){await page.screenshot({path:artifactPath(`beelo-expense-failure-${engine.name()}.png`)}).catch(()=>{});require('node:fs').writeFileSync(artifactPath(`beelo-expense-failure-${engine.name()}.txt`),JSON.stringify({message:error.message,url:page.url(),body:await page.locator('body').innerText().catch(()=>''),state:await page.evaluate(()=>({route:App.currentHash,date:document.getElementById('expense-date')?.value,editing:document.getElementById('edit-expense-date')?.value})).catch(()=>null)},null,2));}
  throw error;
 }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
