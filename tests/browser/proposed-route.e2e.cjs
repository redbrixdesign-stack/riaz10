'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {artifactPath}=require('./release-artifacts.cjs');
const base=process.env.BEELO_TEST_URL||'http://127.0.0.1:8037';
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();let p;try{
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Europe/London'});
 let failTiles=false,failLibrary=false,libraryDelay=0,geocodeNull=false;const outgoing=[],posts=[],errors=[],lookups=[];
 await c.route('**/*',async r=>{
  const url=new URL(r.request().url());
  if(url.origin===new URL(base).origin)return r.continue();
  if(url.hostname==='nominatim.openstreetmap.org'){
   const address=url.searchParams.get('q');assert(address.startsWith('SYNTHETIC'),'Only synthetic lookup addresses');lookups.push(address);
   return r.fulfill({contentType:'application/json',body:JSON.stringify(geocodeNull?[]:[{lat:'53.49',lon:'-2.20',display_name:'SYNTHETIC mock lookup'}])});
  }
  if(url.hostname==='unpkg.com'&&url.pathname.startsWith('/leaflet@1.9.4/dist/')){
   if(libraryDelay)await new Promise(resolve=>setTimeout(resolve,libraryDelay));
   if(failLibrary)return r.abort();
   const name=url.pathname.endsWith('.css')?'leaflet.css':'leaflet.js';return r.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(require.resolve('leaflet/dist/'+name))});
  }
  if(url.hostname.endsWith('.tile.openstreetmap.org')){
   if(failTiles)return r.abort();
   return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#333"/><path d="M0 128H256 M128 0V256" stroke="#777"/><text x="12" y="30" fill="#bbb">SYNTHETIC MAP TILE</text></svg>'});
  }
  outgoing.push(r.request().url());return r.abort();
 });
 await c.addInitScript(()=>{localStorage.setItem('advisoros_config',JSON.stringify({onboardingComplete:true,unlockTimeoutMinutes:60}));localStorage.setItem('advisoros_consent',JSON.stringify({v:2}));});
 p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await p.goto(base);await p.locator('#enc-passphrase-new').fill('SYNTHETIC route planner');await p.locator('#enc-passphrase-confirm').fill('SYNTHETIC route planner');await p.getByRole('button',{name:'Set Passphrase',exact:true}).click();await p.waitForFunction(()=>App.currentHash==='today');
 const fixture=await p.evaluate(async()=>{
  CONFIG.businessAddress='SYNTHETIC Base';CONFIG.businessLatLng=[53.45,-2.25];
  const day=Utils.formatDate(Utils.getTomorrow(),'iso'),ids=[];
  const coords=[[53.49,-2.20],[53.46,-2.25],[53.48,-2.24],[53.47,-2.19]];
  for(let i=0;i<coords.length;i++)ids.push((await DB.addAppointment({clientName:'SYNTHETIC Stop '+(i+1),address:'SYNTHETIC '+(i+1)+' Mock Street',latLng:coords[i],type:'fitting',date:AppointmentsFeature.proposalInstant(day,String(9+i).padStart(2,'0')+':00'),introSent:true,dayBeforeSent:true})).id);
  return {ids,dates:await Promise.all(ids.map(async id=>(await DB.getAppointment(id)).date))};
 });
 await p.evaluate(()=>App.navigate('appointments',{action:'tomorrow'}));await p.locator('.plan-row').nth(3).waitFor();
 const open=async()=>{await p.getByRole('button',{name:'Preview proposed route',exact:true}).click();await p.locator('#planning-route-preview').waitFor();};
 await open();await p.waitForFunction(()=>RouteFeature._planningMap?.getContainer()?.querySelector('.leaflet-overlay-pane path'));
 const info=await p.evaluate(()=>{
  const layers=Object.values(RouteFeature._planningMap._layers),line=layers.find(l=>l instanceof L.Polyline),pts=line.getLatLngs();
  return {points:pts.map(p=>[p.lat,p.lng]),markers:layers.filter(l=>l instanceof L.Marker).length,ids:document.querySelector('#planning-route-preview')._suggestion.ids,normalMap:RouteFeature.map};
 });
 assert.equal(info.markers,5);assert.deepEqual(info.points[0],[53.45,-2.25]);assert.deepEqual(info.points.at(-1),info.points[0]);assert.equal(info.points.length,6);assert.equal(info.normalMap,null);
 assert.match(await p.locator('#planning-route-preview').innerText(),/Booked times ignored/);assert(!((await p.locator('#planning-route-preview').innerText()).includes('09:00')));
 await p.screenshot({path:artifactPath('beelo-proposed-route-'+engine.name()+'.png'),animations:'disabled'});
 await c.setOffline(true);await p.getByRole('button',{name:'Use this order',exact:true}).click();await p.locator('.plan-row').nth(3).waitFor();await p.waitForFunction(()=>!RouteFeature._planningMap);await p.waitForFunction(ids=>JSON.stringify(AppointmentsFeature._tomorrowIds)===JSON.stringify(ids),info.ids);await c.setOffline(false);
 assert.deepEqual(await p.evaluate(()=>AppointmentsFeature._tomorrowIds),info.ids);
 assert.deepEqual(await p.evaluate(async ids=>Promise.all(ids.map(async id=>(await DB.getAppointment(id)).date)),fixture.ids),fixture.dates);
 // Saved private order survives reload; map suggestion does not change any booking.
 await p.reload();await p.locator('.plan-row').nth(3).waitFor();assert.deepEqual(await p.evaluate(()=>AppointmentsFeature._tomorrowIds),info.ids);
 await p.evaluate(()=>{CONFIG.businessAddress='SYNTHETIC Base';CONFIG.businessLatLng=[53.45,-2.25];});
 await open();await p.waitForFunction(()=>!!RouteFeature._planningMap);
 await p.evaluate(async id=>DB.updateAppointment(id,{date:new Date(new Date((await DB.getAppointment(id)).date).getTime()+900000).toISOString()}),fixture.ids[0]);
 await p.getByRole('button',{name:'Use this order',exact:true}).click();await p.getByText('The plan or locations changed. Open a fresh route preview.',{exact:true}).waitFor();await p.getByRole('button',{name:'Close route preview',exact:true}).click();await p.waitForFunction(()=>!RouteFeature._planningMap);
 // Missing base/visit data cannot silently produce a complete route or a use-order action.
 await p.evaluate(()=>{CONFIG.businessLatLng=null;});await open();await p.getByText(/Save a business base/).waitFor();assert.equal(await p.locator('#planning-preview-map').count(),0);assert.equal(await p.getByRole('button',{name:'Use this order',exact:true}).count(),0);await p.getByRole('button',{name:'Close route preview',exact:true}).click();
 await p.evaluate(async id=>{CONFIG.businessLatLng=[53.45,-2.25];await DB.updateAppointment(id,{latLng:null});},fixture.ids[0]);await open();await p.getByText(/Some visit locations are missing/).waitFor();assert.equal(await p.locator('#planning-preview-map').count(),0);assert.deepEqual(lookups,[],'Lookup never starts on opening preview');
 geocodeNull=true;await p.getByRole('button',{name:'Find missing locations',exact:true}).click();await p.getByText(/No precise locations found/).waitFor();assert.equal(await p.locator('#planning-preview-map').count(),0);
 geocodeNull=false;await p.getByRole('button',{name:'Find missing locations',exact:true}).click();await p.waitForFunction(()=>!!RouteFeature._planningMap);assert.deepEqual(await p.evaluate(async id=>(await DB.getAppointment(id)).latLng,fixture.ids[0]),[53.49,-2.20]);assert(lookups.length>=2);await p.getByRole('button',{name:'Close route preview',exact:true}).click();await p.waitForFunction(()=>!RouteFeature._planningMap);
 // Change the synthetic base to request uncached tiles rather than reuse decoded browser images.
 await p.evaluate(()=>{CONFIG.businessLatLng=[53.1,-2.9];});
 failTiles=true;await open();await p.getByText(/Map background unavailable/).waitFor();assert.equal(await p.locator('#planning-route-preview li').count(),4);failTiles=false;await p.getByRole('button',{name:'Retry map',exact:true}).click();await p.getByText('Suggested route sketch. Booked times ignored.',{exact:true}).waitFor();await p.getByRole('button',{name:'Close route preview',exact:true}).click();await p.waitForFunction(()=>!RouteFeature._planningMap);
 // Cold library failure has a bounded fallback; closing a pending load never paints another modal.
 await p.evaluate(()=>{delete window.L;document.getElementById('leaflet-js')?.remove();});failLibrary=true;await open();await p.getByText(/Map unavailable. Your suggested stop order/).waitFor({timeout:10000});assert.equal(await p.locator('#planning-route-preview li').count(),4);await p.getByRole('button',{name:'Close route preview',exact:true}).click();
 failLibrary=false;libraryDelay=700;await p.evaluate(()=>document.getElementById('leaflet-js')?.remove());await open();await p.getByRole('button',{name:'Close route preview',exact:true}).click();await p.waitForTimeout(900);assert.equal(await p.evaluate(()=>!!RouteFeature._planningMap),false);
 assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);assert.deepEqual(outgoing,[]);
 console.log('PASS '+engine.name()+': real Leaflet with mock tiles, numbered base loop, ignores times, explicit order persistence/reload, original bookings intact, stale rejection, missing coordinates/base, tile/library failure/retry, cleanup/late load; no provider calls or messages');
 }catch(e){if(p)await p.screenshot({path:artifactPath('beelo-proposed-route-failure-'+engine.name()+'.png')}).catch(()=>{});throw e;}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
