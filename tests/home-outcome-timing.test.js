'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const suffix of ['.js','.min.js']){
 let clock=Date.parse('2026-10-26T09:00:00Z');const visits=[];
 const context={console,Intl,Date:class extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}},window:{},document:{},localStorage:{getItem:()=>null},App:{registerFeature(){}},CONFIG:{workingWeek:{slotMinutes:15},appointmentTypes:[],weeklyTarget:0},DB:{getAppointmentsForDate:async()=>visits,getUpcomingAppointments:async()=>[],getAllAppointments:async()=>[],db:{orders:{toArray:async()=>[]}}},RouteFeature:{getBasePoint:async()=>null},FollowupsFeature:{loadTasks:async()=>[]},TalkFeature:{getTemplateForOutcome:()=>null}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/core/utils.js','utf8'),context);const feature=vm.runInContext(fs.readFileSync('js/features/companion/companion'+suffix,'utf8')+'\nCompanionFeature;',context);
 const base={id:1,date:'2026-10-26T10:00:00Z',durationSlots:4,status:'confirmed',introSent:true,dayBeforeSent:true};visits.push(base);const before=JSON.stringify(visits);
 const hasAlert=async()=>({home:(await feature.buildHomeData()).attention.some(a=>a.label==='Outcomes not logged'),evening:(await feature.answerEveningReview()).facts.some(a=>a.label==='Outcomes not logged')});
 assert.deepEqual(await hasAlert(),{home:false,evening:false});clock=Date.parse('2026-10-26T10:59:59.999Z');assert.deepEqual(await hasAlert(),{home:false,evening:false});clock++;assert.deepEqual(await hasAlert(),{home:true,evening:true});
 assert.equal(JSON.stringify(visits),before,'Reminder rendering must not alter booking, completion or earnings');
 for(const patch of [{status:'cancelled'},{status:'completed'},{status:'draft'},{outcome:'fitted'},{date:'invalid'},{date:'2026-10-25T10:00:00Z'},{date:'2026-10-27T10:00:00Z'}]){visits[0]={...base,...patch};assert.equal(feature.outcomesAwaitingResult(visits).length,0);}
 visits[0]={...base,durationSlots:undefined,arrivalEnd:'17:00'};clock=Date.parse('2026-10-26T10:14:59Z');assert.equal(feature.outcomesAwaitingResult(visits).length,0);clock=Date.parse('2026-10-26T10:15:00Z');assert.equal(feature.outcomesAwaitingResult(visits).length,1,'Legacy default slot applies, not arrival end');
 for(const [date,end] of [['2026-03-29T00:45:00Z','2026-03-29T01:45:00Z'],['2026-10-25T00:45:00Z','2026-10-25T01:45:00Z']]){visits[0]={...base,date};clock=Date.parse(end)-1;assert.equal(feature.outcomesAwaitingResult(visits).length,0);clock++;assert.equal(feature.outcomesAwaitingResult(visits).length,1);}
 console.log('PASS '+suffix+': Home/evening future, ongoing, exact finish, completed/cancelled/draft, invalid/other-day, legacy duration, arrival-window independence, DST and no booking/earnings writes');
}})().catch(e=>{console.error(e);process.exitCode=1;});
