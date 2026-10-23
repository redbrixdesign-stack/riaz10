'use strict';
const {chromium,webkit}=require('playwright');
const http=require('node:http');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Mock API journey is loopback-only');
(async()=>{
 const names=['NODE_ENV','ALLOWED_ORIGIN','AI_SECRET','ANTHROPIC_API_KEY','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN'];
 const saved=Object.fromEntries(names.map(key=>[key,process.env[key]])),realFetch=global.fetch;let server,providerCalls=0;
 const {handle,_setRedisClient}=await import('../../api/claude.mjs');
 try{
  for(const key of names)delete process.env[key];Object.assign(process.env,{NODE_ENV:'production',ALLOWED_ORIGIN:new URL(base).origin,AI_SECRET:'SYNTHETIC-gate',ANTHROPIC_API_KEY:'SYNTHETIC-provider'});
  global.fetch=async url=>{assert.equal(String(url),'https://api.anthropic.com/v1/messages');providerCalls++;return{ok:true,json:async()=>({content:[{type:'text',text:'SYNTHETIC pong'}],usage:{input_tokens:1,output_tokens:1}})};};
  server=http.createServer((request,response)=>{let body='';request.on('data',chunk=>body+=chunk);request.on('end',async()=>{try{const result=await handle({method:request.method,headers:request.headers,body:body||{}});response.writeHead(result.status,result.headers);response.end(result.body);}catch(e){response.writeHead(500);response.end('SYNTHETIC harness failure');}});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${server.address().port}/api/claude`;
  for(const engine of [chromium,webkit]){
   const browser=await engine.launch();
   try{
    const c=await browser.newContext({viewport:{width:390,height:844}});await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
    const p=await c.newPage(),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC-ai-device');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-ai-device');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const id=await p.evaluate(async endpoint=>{const customer=await DB.addCustomer({firstName:'SYNTHETIC',notes:'SYNTHETIC notes must survive AI outage'});CONFIG.ai={...CONFIG.ai,enabled:true,proxyUrl:endpoint};sessionStorage.setItem('advisoros_ai_secret','SYNTHETIC-gate');App.navigate('settings',{section:'ai'});return customer.id;},endpoint);
    _setRedisClient(null);const before=providerCalls;await p.getByRole('button',{name:/Test connection/}).click();await p.getByText('AI is temporarily unavailable — please try again shortly',{exact:true}).waitFor();assert.equal(providerCalls,before);
    _setRedisClient({eval:async()=>{throw Error('SYNTHETIC store outage');}});const failure=await p.evaluate(()=>AIService.testConnection());assert.equal(failure.httpStatus,503);assert.equal(providerCalls,before);
    await p.screenshot({path:artifactPath(`beelo-claude-usage-${engine.name()}.png`),animations:'disabled'});
    _setRedisClient({eval:async()=>1});const success=await p.evaluate(()=>AIService.testConnection());assert(success.ok);assert.equal(providerCalls,before+1);
    _setRedisClient({eval:async()=>0});const limit=await p.evaluate(()=>AIService.testConnection());assert.equal(limit.httpStatus,429);assert.equal(providerCalls,before+1);
    assert.equal(await p.evaluate(async id=>(await DB.getCustomer(id)).notes,id),'SYNTHETIC notes must survive AI outage');assert.deepEqual(errors,[]);
    console.log(`PASS ${engine.name()}: Settings action -> real local production-mode handler -> missing/outage 503 without provider, healthy mocked-provider recovery and 429 deny; notes retained; no external provider call`);
   }finally{await browser.close();}
  }
 }finally{global.fetch=realFetch;_setRedisClient(null);if(server)await new Promise(resolve=>server.close(resolve));for(const key of names){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
})().catch(e=>{console.error(e);process.exitCode=1;});
