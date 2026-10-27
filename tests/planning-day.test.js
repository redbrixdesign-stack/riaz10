'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const suffix of ['.js','.min.js']){
 let clock=Date.parse('2026-10-27T18:00:00Z');const s={console,Date:class extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}},Intl,CONFIG:{appointmentTypes:[]},App:{registerFeature(){},renderTopHeader:()=>''},DB:{getAppointmentsForDate:async()=>[],getPrivateSetting:async()=>null}};
 vm.createContext(s);const utils=vm.runInContext(fs.readFileSync('js/core/utils'+suffix,'utf8')+'\nUtils;',s);const f=vm.runInContext(fs.readFileSync('js/features/appointments/appointments'+suffix,'utf8')+'\nAppointmentsFeature;',s);
 for(const [now,today,tomorrow,bound]of [['2026-10-27T18:00:00Z','2026-10-27','2026-10-28','2026-10-28T00:00:00.000Z'],['2026-03-29T12:00:00Z','2026-03-29','2026-03-30','2026-03-29T23:00:00.000Z'],['2026-10-25T12:00:00Z','2026-10-25','2026-10-26','2026-10-26T00:00:00.000Z'],['2026-12-31T18:00:00Z','2026-12-31','2027-01-01','2027-01-01T00:00:00.000Z'],['2026-08-15T23:30:00Z','2026-08-16','2026-08-17','2026-08-16T23:00:00.000Z']]){
  clock=Date.parse(now);assert.equal(utils.getTomorrow().toISOString(),bound);
  for(const [action,date]of [['today-plan',today],['tomorrow',tomorrow]]){const html=await f.renderTomorrowPlan(action);const match=html.match(/data-args='([^']+)'\s*>Add visit<\/button>/);assert(match,'Planner Add link exists');assert.deepEqual(JSON.parse(match[1]),['appointments',{action:'add',date}]);}
 }
 console.log('PASS planning day '+suffix+': today/tomorrow link date, UK midnight, foreign TZ '+process.env.TZ+', both DST transitions, year rollover, late UK evening');
}})().catch(e=>{console.error(e);process.exitCode=1;});
