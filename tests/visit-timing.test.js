'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let now=Date.parse('2026-11-07T10:00:00Z'),row={id:1,status:'confirmed',arrivedAt:now,leftAt:null},ended=[],watches=0,clears=0;
class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const values=new Map(),s={console,Date:ClockDate,Promise,setInterval:()=>1,Number,JSON,Math,URLSearchParams,
 navigator:{geolocation:{watchPosition(){return ++watches;},clearWatch(){clears++;}}},
 localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
 encryptField:async v=>({ct:Buffer.from(v).toString('base64')}),decryptField:async v=>Buffer.from(v.ct,'base64').toString(),
 document:{getElementById:()=>null,querySelectorAll:()=>[]},Toast:{show(){}},App:{},
 Geo:{ARRIVAL_RADIUS_KM:.15,calculateDistance:(a,b,c,d)=>Math.hypot(a-c,b-d)*111},
 DB:{getAppointment:async()=>({...row}),db:{appointments:{update:async(id,p)=>{Object.assign(row,p);return 1;}}},endVisitTiming:async(id,arrival,leftAt,e)=>{if(row.leftAt)return false;ended.push({leftAt,...e});Object.assign(row,{leftAt,travelStatus:null});return true;}},
 Utils:{escapeHtml:String},AppointmentsFeature:{formatOnSiteDuration:v=>v+' min'}};
vm.createContext(s);const timing=vm.runInContext(fs.readFileSync('js/core/visit-timing.js','utf8')+';VisitTiming',s);
const fix=(lat=53,lng=-2,accuracy=10,speed=0,at=now)=>({coords:{latitude:lat,longitude:lng,accuracy,speed},timestamp:at});
(async()=>{
 const trip={destination:{lat:53,lng:-2}};
 assert.equal(timing.arrival(trip,fix(53,-2,200)),null);assert.equal(timing.arrival(trip,fix(53,-2,10,15)),null);
 assert.equal(timing.arrival(trip,fix()),null);now+=30000;const arrival=timing.arrival(trip,fix());assert.equal(arrival.arrivedAt,now-30000);
 now+=300000;assert.equal(timing.arrival(trip,fix()),null,'Long gap is not a dwell');
 row={id:1,status:'confirmed',arrivedAt:now,leftAt:null};await timing.begin(1,now,{lat:53,lng:-2});
 assert(!values.get('advisoros_active_site').includes('anchor'),'Recovery coordinates encrypted');
 now+=60000;await timing.enqueue(fix(53.004));assert.equal(row.leftAt,null,'One outside fix cannot end visit');
 now+=30000;await timing.enqueue(fix());assert.equal(row.leftAt,null,'Returning inside resets departure candidate');
 now+=30000;await timing.enqueue(fix(53.004));const firstOutside=now;now+=30000;await timing.enqueue(fix(53.005));assert.equal(row.leftAt,firstOutside);assert.equal(row.status,'confirmed');assert.equal(ended.length,1);assert.equal(timing.session,null);assert(!values.has('advisoros_active_site'));
 await timing.enqueue(fix(53.006));assert.equal(ended.length,1,'Late callbacks cannot duplicate completion');
 now+=60000;row={id:1,status:'completed',outcome:'fitted',arrivedAt:now,leftAt:null};await timing.begin(1,now,{lat:53,lng:-2});now+=300000;await timing.enqueue(fix(53.004));assert.equal(row.onSiteTimeReviewRequired,true);now+=30000;await timing.enqueue(fix(53.005));assert.equal(ended.at(-1).needsReview,true);assert.equal(row.outcome,'fitted','Departure preserves job outcome');
 now+=60000;row={id:1,status:'confirmed',arrivedAt:now,leftAt:null};await timing.begin(1,now,{lat:53,lng:-2});timing.stopWatch();timing.session=null;now+=60000;await timing.init();assert(timing.session&&watches>=3,'Only an explicitly started encrypted session resumes');
 row.status='cancelled';await timing.maintenance();assert.equal(timing.session,null);assert(clears>0);
 now+=60000;row={id:1,status:'confirmed',arrivedAt:now,leftAt:null};await timing.begin(1,now,{lat:53,lng:-2});const end=s.DB.endVisitTiming;s.DB.endVisitTiming=async()=>{throw Error('SYNTHETIC disk unavailable');};now+=30000;await timing.enqueue(fix(53.004));const observed=now;now+=30000;await timing.enqueue(fix(53.005));assert.equal(row.leftAt,null);assert(timing.session&&timing.session.needsReview,'Failed departure save keeps recovery and review state');s.DB.endVisitTiming=end;now+=30000;await timing.enqueue(fix(53.006));assert.equal(row.leftAt,observed,'Retry retains original observed departure');
 const noTravel=timing.summary({id:2,arrivedAt:now-60000,leftAt:now,travelDurationMinutes:null});assert.match(noTravel,/Incomplete/);assert.match(noTravel,/not recorded/);
 const total=timing.summary({id:2,arrivedAt:now-4*60000,leftAt:now,travelDurationMinutes:2});assert.match(total,/Customer time: 6 min/);
 assert.match(timing.summary({id:2,arrivedAt:now-60000,leftAt:now,travelDurationMinutes:5,travelTimeReviewed:true,travelDurationOverrideMinutes:null}),/Incomplete/,'An explicitly unknown reviewed travel time is not replaced by an old estimate');
 assert(!timing.summary({id:2,arrivedAt:now-60000,leftAt:'\" onmouseover=evil',travelDurationMinutes:2}).includes('onmouseover'),'Untrusted stored timestamps cannot inject attributes');
 // Pending encryption must not revive a session after an explicit stop.
 const originalEncrypt=s.encryptField;let releaseEncryption;const beforeWatch=watches;s.encryptField=value=>new Promise(resolve=>{releaseEncryption=()=>originalEncrypt(value).then(resolve);});const pendingStart=timing.begin(1,now,{lat:53,lng:-2});for(let i=0;i<10&&!releaseEncryption;i++)await Promise.resolve();assert(releaseEncryption);timing.clear();await releaseEncryption();await pendingStart;s.encryptField=originalEncrypt;assert.equal(timing.session,null);assert.equal(watches,beforeWatch);assert(!values.has('advisoros_active_site'));
 // Actual Geo entry point: a double tap creates one journey; another target
 // cannot inherit that journey or trigger a false new-customer departure.
 let geoWatches=0,gpsCalls=0,releaseGps,poll,delay;const gs={console,Date:ClockDate,Promise,Math,JSON,Number,URLSearchParams,setTimeout:(fn,ms)=>{poll=fn;delay=ms;return 1;},clearTimeout(){},localStorage:s.localStorage,encryptField:originalEncrypt,decryptField:s.decryptField,CONFIG:{distanceUnit:'miles'},Toast:{show(){}},App:{},document:{visibilityState:'visible',getElementById:()=>null},navigator:{geolocation:{watchPosition:()=>++geoWatches,clearWatch(){}}},Utils:{generateId:()=> 'SYNTHETIC-one-trip'},DB:{getAppointment:async()=>({id:1,status:'confirmed'}),db:{appointments:{filter:()=>({toArray:async()=>[]}),update:async()=>1}}}};
 vm.createContext(gs);const geo=vm.runInContext(fs.readFileSync('js/core/geo.js','utf8')+';Geo',gs);geo.renderTripBanner=geo.removeTripBanner=()=>{};geo.geocode=async()=>({lat:53,lng:-2});geo.getCurrentPosition=()=>{gpsCalls++;return new Promise(resolve=>{releaseGps=resolve;});};
 const first=geo.startTrip({appointmentId:1,destinationAddress:'SYNTHETIC Customer'}),second=geo.startTrip({appointmentId:1,destinationAddress:'SYNTHETIC Customer'});assert.equal(await geo.startTrip({appointmentId:2}),null);for(let i=0;i<10&&!releaseGps;i++)await Promise.resolve();assert(releaseGps);releaseGps({lat:52.99,lng:-2,accuracy:10,timestamp:now});const pair=await Promise.all([first,second]);assert.equal(pair[0].id,pair[1].id);assert.equal(gpsCalls,1);assert.equal(geoWatches,1);assert.equal(await geo.startTrip({appointmentId:2}),null);geo.cancelTrip();
 gs.DB.getAppointment=async()=>({status:'completed'});assert.equal(await geo.startTrip({appointmentId:1}),null);assert.equal(gpsCalls,1,'Closed visit navigation does not start tracking');
 const candidate={id:'poll',arrivalCandidate:{at:now}};geo.activeTrip=candidate;let pollObservations=0;geo.getCurrentPosition=async()=>({lat:53,lng:-2,accuracy:10,timestamp:now});geo.onTripPositionUpdate=async()=>{pollObservations++;};geo.scheduleArrivalCheck();assert.equal(delay,30000);await poll();assert.equal(pollObservations,1,'Stationary arrival receives a fresh confirmation check');geo.activeTrip={id:'new-trip'};await poll();assert.equal(pollObservations,1,'An old confirmation cannot affect another journey');
 console.log('PASS timing: arrival accuracy/dwell/drive-by/gap; departure jitter/debounce/idempotency; encrypted restore; completed/cancelled cases; unknown travel != zero; travel + on-site total');
})().catch(e=>{console.error(e);process.exitCode=1;});
