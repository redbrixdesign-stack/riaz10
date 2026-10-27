'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const suffix of ['.js','.min.js']){
 const s={console,Date,Intl,CONFIG:{appointmentTypes:[]},App:{registerFeature(){},renderTopHeader:o=>JSON.stringify(o)},DB:{getAppointmentsForDate:async()=>[],getPrivateSetting:async()=>null}};
 vm.createContext(s);vm.runInContext(fs.readFileSync('js/core/utils.js','utf8'),s);const f=vm.runInContext(fs.readFileSync('js/features/appointments/appointments'+suffix,'utf8')+'\nAppointmentsFeature;',s);
 for(const day of ['2026-10-28','2026-03-29','2026-08-17','2027-01-01']){
  assert.equal(f.planningDate(day),day);await f.renderTomorrowPlan('tomorrow',{planDate:day});assert.equal(f.planningParams().planDate,day,'BST midnight must not become previous UTC date');
 }
 for(const bad of ['',null,'2026-02-30','2026-13-01','2026-10-28&action=add','https://bad.test'])assert.equal(f.planningDate(bad),'');
 const valid={returnDay:'2026-10-28',returnAction:'tomorrow',returnVisit:'42',returnScroll:'350'};
 assert.deepEqual(JSON.parse(JSON.stringify(f.planningReturn(valid))),{action:'tomorrow',planDate:'2026-10-28',focusVisit:'42',planScroll:350});
 assert.equal(f.planningReturn({...valid,returnAction:'add'}),null);assert.equal(f.planningReturn({...valid,returnVisit:'<bad>'}),null);assert.equal(f.planningReturn({...valid,returnDay:'2026-02-30'}),null);assert.equal(f.planningReturn({}),null);assert.equal(f.planningReturn({...valid,returnScroll:'Infinity'}).planScroll,100000);assert.equal(f.planningReturn({...valid,returnScroll:'-5'}).planScroll,0);
 console.log('PASS planning return '+suffix+': validated internal destination, bounded position, date rollover/BST, direct-link fallback; no record writes');
}})().catch(e=>{console.error(e);process.exitCode=1;});
