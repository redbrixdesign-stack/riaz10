'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
const live=new URL(base).protocol==='https:';
const origin=live?new URL(base).origin:'https://beelo-public.invalid';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:live?'allow':'block'});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_enc_test','1');localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:0}));});
  if(!live)await c.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort('blockedbyclient');const response=await c.request.get(new URL(url.pathname+url.search,base).href);return route.fulfill({response});});
  const p=await c.newPage(),errors=[],posts=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await p.goto(origin);await p.locator('#enc-passphrase-new').waitFor();
  assert(await p.evaluate(()=>localStorage.getItem('advisoros_enc_test')==='1'&&!Utils.isLocalBrowserTest()&&!hasEncryptionKey()&&DB.db===null),'Public storage flag cannot initialise the known key/database');
  await p.screenshot({path:artifactPath(`beelo-public-test-flag-${engine.name()}.png`),animations:'disabled'});
  await p.locator('#enc-passphrase-new').fill('SYNTHETIC-genuine-device');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-genuine-device');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
  await p.getByRole('button',{name:'I understand',exact:true}).waitFor();await p.getByRole('button',{name:'I understand',exact:true}).click();
  const id=await p.evaluate(async()=> (await DB.addCustomer({firstName:'SYNTHETIC',notes:'SYNTHETIC genuine-key record'})).id);
  await p.reload();await p.locator('#enc-passphrase').waitFor();assert(await p.evaluate(()=>!Utils.isLocalBrowserTest()&&DB.db===null));
  await p.locator('#enc-passphrase').fill('test-passphrase-123');await p.getByRole('button',{name:'Unlock',exact:true}).click();await p.getByText('Incorrect passphrase',{exact:true}).waitFor();assert(await p.evaluate(()=>DB.db===null));
  await p.locator('#enc-passphrase').fill('SYNTHETIC-genuine-device');await p.getByRole('button',{name:'Unlock',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
  assert.equal(await p.evaluate(async id=>(await DB.getCustomer(id)).notes,id),'SYNTHETIC genuine-key record');assert(await p.evaluate(async id=>isEncrypted((await DB.db.customers.get(id)).notes),id));
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()} ${live?'live public':'secure public-origin fixture'}: stored test flag cannot skip genuine gate/consent; known fixture passphrase rejected; real passphrase unlock/reload retains encrypted record; no uploads`);
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
