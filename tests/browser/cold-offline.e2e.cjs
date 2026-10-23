'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8023';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 let transport=null;
 try{
  // WebKit's context.setOffline aborts before cached SW script responses in
  // this runner. A loopback-only proxy drops real sockets instead: requests
  // genuinely fail, without changing the browser's network emulation flag.
  let target=base;
  if(engine===webkit && ['127.0.0.1','localhost'].includes(new URL(base).hostname)){
   transport={blocked:false};transport.server=http.createServer((request,response)=>{
    if(transport.blocked){request.socket.destroy();return;}
    const upstream=http.get(new URL(request.url,base),result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});
    upstream.on('error',()=>{response.writeHead(503);response.end('SYNTHETIC network unavailable');});
   });await new Promise(resolve=>transport.server.listen(0,'127.0.0.1',resolve));target=`http://127.0.0.1:${transport.server.address().port}`;
  }
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
  const p=await c.newPage(),posts=[],errors=[];let navigations=0;p.setDefaultTimeout(20000);p.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===p.mainFrame())navigations++;if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(target);await p.locator('#enc-passphrase-new').fill('SYNTHETIC-offline-device');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC-offline-device');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForTimeout(700);
  assert.equal(navigations,1,'First controller claim must not reload the working page');
  assert(await p.evaluate(()=>App.features.get('settings')._lazy&&App.scriptLoads.size===0),'No secondary feature was opened online');
  const cached=await p.evaluate(async()=>{const keys=await caches.keys();const cache=await caches.open(keys.find(k=>k.startsWith('advisoros-v6-')));return (await cache.keys()).map(r=>r.url);});
  assert(cached.some(url=>url.endsWith('/js/features/settings/settings.min.js?v=24')));
  const id=await p.evaluate(async()=>{const c=await DB.addCustomer({firstName:'SYNTHETIC',lastName:'Offline'});return(await DB.addAppointment({customerId:c.id,type:'fitting',clientName:'SYNTHETIC Offline',date:'2020-01-01T10:00:00Z'})).id;});
  if(engine===webkit&&!transport){console.log('LIMITATION webkit public origin: cached lazy assets verified; automated first-offline script loading not certified (context offline blocks SW scripts). Local socket-drop journey covers this separately.');continue;}
  if(transport)transport.blocked=true;else await c.setOffline(true);
  await p.evaluate(()=>App.navigate('settings',{section:'data'}));await p.getByRole('button',{name:'Password-protected backup',exact:true}).waitFor();
  await p.getByRole('button',{name:'Password-protected backup',exact:true}).click();await p.getByRole('button',{name:'Cancel',exact:true}).click();
  for(const route of ['quotes','jobs','invoices','suppliers','capacity','profitability','retention','social']){
   assert(await p.evaluate(route=>!!App.features.get(route)._lazy,route));
   await p.evaluate(({route,id})=>App.navigate(route,route==='social'?{appointmentId:id}:{}),{route,id});await p.waitForFunction(route=>App.currentHash.split('?')[0]===route,route);
   assert(!/Failed to load|Something went wrong/.test(await p.locator('#main').innerText()));
  }
  await p.evaluate(()=>App.navigate('settings',{section:'data'}));await p.getByRole('button',{name:'Password-protected backup',exact:true}).waitFor();await p.waitForTimeout(400);await p.screenshot({path:`/private/tmp/beelo-cold-offline-${engine.name()}.png`,animations:'disabled'});
  if(transport)transport.blocked=false;else await c.setOffline(false);
  await p.reload();await p.getByRole('button',{name:'Password-protected backup',exact:true}).waitFor();assert.equal(await p.evaluate(()=>DB.db.customers.count()),1);
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine.name()} (${transport?'loopback socket-drop':'context offline'}): fresh install, no online lazy opens, first offline Settings/protected-dialog plus all eight other secondary routes, online reload and retained mock customer; no uploads`);
 }finally{await browser.close();if(transport)await new Promise(resolve=>transport.server.close(resolve));}
}})().catch(e=>{console.error(e);process.exitCode=1;});
