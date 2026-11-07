
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s={console,Date,Intl,App:{registerFeature(){}}};vm.createContext(s);
vm.runInContext(['js/core/utils.js','js/services/adviser-context.js','js/features/companion/companion.js'].map(p=>fs.readFileSync(p,'utf8')).join('\n')+'\nthis.C=AdviserContext;this.F=CompanionFeature;this.U=Utils;',s);
const {C,F,U}=s,day=U.formatDate(U.getToday(),'iso');
const old={id:1,date:day+'T09:00:00Z',status:'confirmed'},site={id:2,date:day+'T10:00:00Z',arrivedAt:1000,status:'confirmed'},travel={id:3,date:day+'T14:00:00Z',travelStatus:'in_transit',travelStartedAt:2000,status:'confirmed'};
assert.equal(C.select([old,site],day).id,2);
assert.equal(C.select([old,site,travel],day).id,3);
site.outcome='fitted';site.status='completed';
assert.equal(C.select([old,site],day,{trackedId:2}).id,2,'Genuine tracked attendance survives outcome');
assert.equal(C.select([old,site,travel],day,{trackedId:2}).id,3,'New journey wins without deleting earlier timer');
site.leftAt=3000;assert.equal(C.select([old,site],day,{trackedId:2}).id,1);
travel.status='cancelled';assert.equal(C.select([old,travel],day).id,1);
assert.equal(C.select([old,site],day,{today:'1900-01-01',trackedId:2}).id,1,'Historic view never infers current attendance');
assert.equal(C.select([],day),null);
assert.equal(C.businessKm([{distanceKm:100,confirmed:true,purpose:'private'},{distanceKm:5,purpose:'business'},{distanceKm:10,confirmed:true,purpose:'business'},{distanceKm:-4,confirmed:true,purpose:'business'}]),10);
s.CommunicationService={collectionResponsibility:o=>o.paymentResponsibility||'unknown'};
assert.equal(C.collectable({paymentResponsibility:'advisor'}),true);assert.equal(C.collectable({paymentResponsibility:'external'}),false);assert.equal(C.collectable({}),false);
(async()=>{
 for(const [key,aliases]of Object.entries(F.ALIASES)){
  const method=F.commandHandlers[key];assert.equal(typeof F[method],'function',key+' has a real handler');
  const saved=F[method];F[method]=async()=>({text:'SYNTHETIC '+key});
  assert.equal((await F.runCommand(F.normalizeCommand(aliases[0]),aliases[0])).text,'SYNTHETIC '+key);
  F[method]=saved;
 }
 assert.equal(F.normalizeCommand('what next'),'next visit');
 assert.equal((await F.runCommand('__proto__','')).text,F.answerDefault().text);
 const saved=F.answerOrders;let seen='unset';F.answerOrders=async n=>(seen=n,{text:'ok'});
 await F.runCommand('orders','orders');assert(!seen,'General order command cannot masquerade as an order-number lookup');F.answerOrders=saved;
 console.log('PASS adviser foundation: every alias dispatch, unknown command, external responsibility, mileage eligibility, current arrival/new travel/completed attendance/history/cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
