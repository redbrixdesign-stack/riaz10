'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {artifactPath}=require('./release-artifacts.cjs');
const http=require('node:http');
const fs=require('node:fs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
const originStop=process.env.BEELO_OFFLINE_DIAGNOSTIC_MODE==='origin-stop';
async function workerTrace(page){
 if(process.env.BEELO_SW_TRACE!=='1')return undefined;
 return page.evaluate(()=>new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve({timeout:true});},2000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};navigator.serviceWorker.controller.postMessage({type:'BEELO_TEST_DIAGNOSTIC'},[channel.port2]);})).catch(error=>({error:error.message}));
}
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 let transport=null;
 try{
  // WebKit's context.setOffline aborts before cached SW script responses in
  // this runner. A loopback-only proxy drops real sockets instead: requests
  // genuinely fail, without changing the browser's network emulation flag.
  let target=base;
  if(engine===webkit && ['127.0.0.1','localhost'].includes(new URL(base).hostname)){
   transport={blocked:false,requests:[]};transport.server=http.createServer((request,response)=>{
    transport.requests.push({url:request.url,blocked:transport.blocked,time:Date.now()});
    if(transport.blocked){request.socket.destroy();return;}
    const upstream=http.get(new URL(request.url,base),result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});
    upstream.on('error',()=>{response.writeHead(503);response.end('SYNTHETIC network unavailable');});
   });await new Promise(resolve=>transport.server.listen(0,'127.0.0.1',resolve));target=`http://127.0.0.1:${transport.server.address().port}`;
  }
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const p=await c.newPage(),posts=[],errors=[],consoleErrors=[],scriptRequests=[],scriptResponses=[],failedRequests=[],routeResults=[];let navigations=0;p.setDefaultTimeout(20000);p.on('request',r=>{if(r.resourceType()==='script')scriptRequests.push({url:r.url(),time:Date.now()});if(r.isNavigationRequest()&&r.frame()===p.mainFrame())navigations++;if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
  p.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  p.on('response',response=>{if(response.request().resourceType()==='script')scriptResponses.push({url:response.url(),status:response.status(),worker:response.fromServiceWorker()});});
  p.on('requestfailed',request=>failedRequests.push({url:request.url(),type:request.resourceType(),failure:request.failure()?.errorText}));
  await p.goto(target);await p.locator('#enc-passphrase-new').fill('SYNTHETIC-offline-device');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-offline-device');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForTimeout(700);
  assert.equal(navigations,1,'First controller claim must not reload the working page');
  assert(await p.evaluate(()=>App.features.get('settings')._lazy&&App.scriptLoads.size===0),'No secondary feature was opened online');
  const cached=await p.evaluate(async()=>{const keys=await caches.keys();const cache=await caches.open(keys.find(k=>k.startsWith('advisoros-v6-')));return (await cache.keys()).map(r=>r.url);});
  assert(cached.some(url=>url.includes('/js/features/settings/settings.min.js?v=')));
  const id=await p.evaluate(async()=>{const c=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Offline'});return(await DB.addAppointment({customerId:c.id,type:'fitting',clientName:'SYNTHETIC Offline',date:'2020-01-01T10:00:00Z'})).id;});
  if(engine===webkit&&process.env.BEELO_SW_TRACE==='1'&&process.env.BEELO_DIAGNOSTIC_CACHE_MISS==='1'){
   await p.evaluate(async()=>{for(const key of await caches.keys())if(key.startsWith('advisoros-v6-'))await(await caches.open(key)).delete(new URL('js/services/quote-document.min.js?v=3',location.href).href);});
  }
  if(engine===webkit&&!transport){console.log('LIMITATION webkit public origin: cached lazy assets verified; automated first-offline script loading not certified (context offline blocks SW scripts). Local socket-drop journey covers this separately.');continue;}
  if(transport){transport.blocked=true;if(originStop){transport.port=transport.server.address().port;transport.server.closeAllConnections();await new Promise(resolve=>transport.server.close(resolve));}}else await c.setOffline(true);
  await p.evaluate(()=>App.navigate('settings',{section:'data'}));await p.getByRole('button',{name:'Password-protected backup',exact:true}).waitFor();
  await p.getByRole('button',{name:'Password-protected backup',exact:true}).click();await p.getByRole('button',{name:'Cancel',exact:true}).click();
  for(const route of ['quotes','jobs','invoices','suppliers','capacity','profitability','retention','social']){
   console.log(`CHECK ${engine.name()} first offline ${route}`);
   let rendered='';
   try{
   assert(await p.evaluate(route=>!!App.features.get(route)._lazy,route));
   await p.evaluate(({route,id})=>App.navigate(route,route==='social'?{appointmentId:id}:{}),{route,id});await p.waitForFunction(route=>App.currentHash.split('?')[0]===route,route);
   rendered=await p.locator('#main').innerText();
   routeResults.push({route,rendered:rendered.slice(0,500)});
   assert(!/Failed to load|Something went wrong/.test(rendered),`${engine.name()} first offline ${route} must render`);
   }catch(error){
    const state=await p.evaluate(()=>({hash:App.currentHash,current:App.currentFeature?.id,revision:App._navigationRevision,scripts:[...document.querySelectorAll('script[data-lazy-src]')].map(script=>script.src),features:[...App.features].map(([id,feature])=>({id,lazy:!!feature._lazy})),body:document.getElementById('main')?.innerText})).catch(captureError=>({captureError:captureError.message}));
    const pendingUrls=scriptRequests.filter(request=>!scriptResponses.some(response=>response.url===request.url)).map(request=>request.url);
    const probeUrls=[...new Set([...(state.scripts||[]),...pendingUrls])];
    const cacheProbe=await p.evaluate(urls=>Promise.race([
     Promise.all(urls.map(async url=>{const response=await caches.match(url);return {url,status:response?.status,bytes:response?(await response.arrayBuffer()).byteLength:null};})),
     new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),2000))
    ]),probeUrls).catch(error=>({error:error.message}));
    const evidence={engine:engine.name(),route,error:error.message,rendered,state,routeResults,errors,consoleErrors,cached,cacheProbe,scriptRequests,scriptResponses,failedRequests,transportRequests:transport?.requests,workerTrace:await workerTrace(p)};
    console.error('OFFLINE FAILURE',JSON.stringify(evidence));
    fs.writeFileSync(artifactPath(`beelo-cold-offline-failed-${engine.name()}-${route}.json`),JSON.stringify(evidence,null,2));
    await p.screenshot({path:artifactPath(`beelo-cold-offline-failed-${engine.name()}-${route}.png`),animations:'disabled'}).catch(captureError=>console.error('Screenshot capture failed:',captureError.message));
    throw error;
   }
  }
  await p.evaluate(()=>App.navigate('settings',{section:'data'}));await p.getByRole('button',{name:'Password-protected backup',exact:true}).waitFor();await p.waitForTimeout(400);await p.screenshot({path:artifactPath(`beelo-cold-offline-${engine.name()}.png`),animations:'disabled'});
  if(transport){transport.blocked=false;if(originStop)await new Promise(resolve=>transport.server.listen(transport.port,'127.0.0.1',resolve));}else await c.setOffline(false);
  await p.reload();await p.getByRole('button',{name:'Password-protected backup',exact:true}).waitFor();assert.equal(await p.evaluate(()=>DB.db.customers.count()),1);
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(artifactPath(`beelo-cold-offline-${engine.name()}.json`),JSON.stringify({engine:engine.name(),cached,routeResults,scriptResponses,failedRequests,errors,consoleErrors,workerTrace:await workerTrace(p)},null,2));
  console.log(`PASS ${engine.name()} (${transport?(originStop?'loopback origin stopped':'loopback socket-drop'):'context offline'}): fresh install, no online lazy opens, first offline Settings/protected-dialog plus all eight other secondary routes, online reload and retained mock customer; no uploads`);
 }finally{await browser.close();if(transport?.server.listening)await new Promise(resolve=>transport.server.close(resolve));}
}})().catch(e=>{console.error(e);process.exitCode=1;});
