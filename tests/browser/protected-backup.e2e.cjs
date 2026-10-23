const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_enc_test','1');localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const p=await c.newPage();const posts=[];
  p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await p.goto(base);await p.waitForFunction(()=>App.currentHash==='today');
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForTimeout(700);
  const ids=await p.evaluate(async()=>{
   const c=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Backup',notes:'SYNTHETIC Urdu اردو 🪟'});
   const a=await DB.addAppointment({customerId:c.id,type:'fitting',date:'2020-01-01T10:00:00Z',notes:'SYNTHETIC visit note'});
   await DB.addVoiceNote({customerId:c.id,appointmentId:a.id,data:'A'.repeat(1000000),mimeType:'audio/wav',durationSeconds:30,title:'SYNTHETIC large recording'});
   await DB.addPhoto({customerId:c.id,data:'QUJD',caption:'SYNTHETIC mock photo'});
   App.navigate('settings',{section:'data'});return {c:c.id,a:a.id};
  });
  await p.getByRole('button',{name:'Password-protected backup',exact:true}).click();
  await p.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await p.evaluate(()=>ExportService.getLastBackupMeta()),null,'Cancel does not record backup');
  await p.getByRole('button',{name:'Password-protected backup',exact:true}).click();
  await p.locator('#enc-backup-password').fill('SYNTHETIC-backup-123');await p.locator('#enc-backup-confirm').fill('different');
  await p.getByRole('button',{name:'Create encrypted backup',exact:true}).click();await p.getByText('Passwords do not match',{exact:true}).waitFor();
  await p.locator('#enc-backup-confirm').fill('SYNTHETIC-backup-123');
  const dl=p.waitForEvent('download');await p.getByRole('button',{name:'Create encrypted backup',exact:true}).click();
  const download=await dl;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const encrypted=Buffer.concat(chunks).toString();
  assert(encrypted.length>1000000&&encrypted.startsWith('advisoros:enc:v1:'));assert(!encrypted.includes('SYNTHETIC'));
  await p.waitForFunction(()=>!!ExportService.getLastBackupMeta());
  assert.equal((await p.evaluate(()=>ExportService.getLastBackupMeta())).filename,download.suggestedFilename());
  await p.screenshot({path:artifactPath(`beelo-protected-backup-${engine.name()}.png`)});
  // A separate device/profile uses a genuine, different passphrase, not the
  // test bypass, and receives only a locally selected encrypted File.
  const d=await browser.newContext({viewport:{width:390,height:844}});
  await d.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const q=await d.newPage();q.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await q.goto(base);await q.locator('#enc-passphrase-new').fill('SYNTHETIC-device-B-123');await q.locator('#enc-passphrase-confirm').fill('SYNTHETIC-device-B-123');await q.getByRole('button',{name:'Set Passphrase',exact:true}).click();
  await q.waitForFunction(()=>App.currentHash==='today');await q.evaluate(()=>navigator.serviceWorker.ready);await q.waitForFunction(()=>!!navigator.serviceWorker.controller);await q.waitForTimeout(600);
  await q.waitForFunction(()=>App.currentHash==='today');
  const sentinel=await q.evaluate(async()=> (await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Must survive failed restore'})).id);
  const startImport=async()=>q.evaluate(text=>{window.backupResult=null;void ExportService.importBackup(new File([text],'SYNTHETIC.enc.json')).then(()=>window.backupResult='ok',e=>window.backupResult=e.message);},encrypted);
  await startImport();await q.locator('#enc-backup-password').fill('WRONG');await q.getByRole('button',{name:'Decrypt & Import',exact:true}).click();
  await q.waitForFunction(()=>!!window.backupResult);assert.match(await q.evaluate(()=>window.backupResult),/password is wrong/);
  assert.equal(await q.evaluate(async id=>(await DB.getCustomer(id)).lastName,sentinel),'Must survive failed restore');
  q.once('dialog',dialog=>dialog.dismiss());await startImport();await q.locator('#enc-backup-password').fill('SYNTHETIC-backup-123');await q.getByRole('button',{name:'Decrypt & Import',exact:true}).click();
  await q.waitForFunction(()=>!!window.backupResult);assert.equal(await q.evaluate(()=>window.backupResult),'Restore cancelled');
  assert.equal(await q.evaluate(()=>DB.db.customers.count()),1);
  q.once('dialog',dialog=>dialog.accept());await startImport();await q.locator('#enc-backup-password').fill('SYNTHETIC-backup-123');await q.getByRole('button',{name:'Decrypt & Import',exact:true}).click();
  await q.waitForFunction(()=>window.backupResult==='ok');
  const verify=()=>q.evaluate(async ids=>({notes:(await DB.getCustomer(ids.c)).notes,voice:(await DB.getVoiceNotes({customerId:ids.c}))[0].data,photos:(await DB.getPhotosForCustomer(ids.c))[0].data,encrypted:typeof(await DB.db.customers.get(ids.c)).notes==='object'}),ids);
  let restored=await verify();assert.equal(restored.notes,'SYNTHETIC Urdu اردو 🪟');assert.equal(restored.voice,'A'.repeat(1000000));assert.equal(restored.photos,'QUJD');assert(restored.encrypted);
  await q.reload();await q.waitForFunction(()=>App.currentHash==='today');restored=await verify();assert.equal(restored.voice.length,1000000);
  assert.deepEqual(posts,[]);
  console.log(`PASS ${engine.name()}: protected download >1 MB, password validation/cancel, wrong password and declined restore preserve data, real different-device key import, exact audio/photo/Unicode and reload; no uploads`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
