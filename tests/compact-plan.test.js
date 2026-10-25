'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const file of ['js/features/appointments/appointments.js','js/features/appointments/appointments.min.js']){
 const rows=[{id:1,date:'2030-01-02T09:00:00Z',clientName:'SYNTHETIC Alder <img src=x>',address:'SYNTHETIC Street',arrivalStart:'09:00',arrivalEnd:'12:00',type:'measure',timeProposal:{status:'pending',time:'10:15'},notes:'Saved access notes'},{id:2,date:'2030-01-02T13:00:00Z',clientName:'SYNTHETIC Cedar',type:'fitting'},{id:3,date:'2030-01-02T14:00:00Z',status:'cancelled'},{id:4,date:'2030-01-02T15:00:00Z',outcome:'fitted'}];
 const before=JSON.stringify(rows),s={console,Date,Intl,setTimeout,clearTimeout,CONFIG:{appointmentTypes:[]},App:{registerFeature(){},renderTopHeader:()=>''},DB:{getAppointmentsForDate:async()=>JSON.parse(JSON.stringify(rows)),getPrivateSetting:async()=>null,getCustomer:async()=>null}};
 vm.createContext(s);vm.runInContext(fs.readFileSync('js/core/utils.js','utf8'),s);
 const source=process.env.BEELO_NEGATIVE_PLAN?require('node:child_process').execFileSync('git',['show','75b49da:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
 const feature=vm.runInContext(source+'\nAppointmentsFeature;',s);let html=await feature.renderTomorrowPlan();
 assert.equal((html.match(/class="plan-row"/g)||[]).length,2,'Active visits must use compact rows');
 for(const text of ['Client','Arrival window','Proposed time','Address','09:00–12:00','10:15','Not agreed','SYNTHETIC Street','Not recorded','Details &amp; actions','Saved access notes','Saved messages','Review pre-visit message','data-plan-drag','Move visit 1 down'])assert(html.includes(text),text);
 assert(!html.includes('<img src=x>'));assert(html.includes('&lt;img'));assert(!/<details[^>]*\sopen/.test(html),'Extra context starts collapsed');assert.equal(JSON.stringify(rows),before);
 s.DB.getPrivateSetting=async()=>JSON.stringify([2,1]);html=await feature.renderTomorrowPlan();assert(html.indexOf('SYNTHETIC Cedar')<html.indexOf('SYNTHETIC Alder'),'Saved plan order remains');
 html=await feature.renderTomorrowPlan('today-plan');assert(!html.includes('data-action="TalkFeature.sendDayBefore"'),'Today does not get tomorrow-specific messaging');
 s.DB.getAppointmentsForDate=async()=>[];html=await feature.renderTomorrowPlan();assert(html.includes('No active visits booked for tomorrow.'));
 s.DB.getAppointmentsForDate=async()=>{throw Error('SYNTHETIC read failure');};html=await feature.renderTomorrowPlan();assert(html.includes('Could not load the selected day'));
 console.log('PASS '+file+': four requested fields, collapsed retained context/actions, escaped names, missing values, active/saved order, today/empty/error and no record changes');
}})().catch(error=>{console.error(error);process.exitCode=1;});
