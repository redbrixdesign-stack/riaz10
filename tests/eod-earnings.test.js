'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const suffix of ['.js','.min.js']){
 let clock=Date.parse('2026-10-27T18:00:00Z'),modal='',error=false,reads=[];const notices=[];
 const context={console:{error(){}},Intl,Date:class extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}},CONFIG:{currency:'GBP'},window:{},localStorage:{getItem:()=>null},App:{registerFeature(){},openModal(html){modal=html;}},Toast:{show:(...args)=>notices.push(args)},TaxCalculator:{estimateCommission:v=>v/10}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/core/utils.js','utf8'),context);const db=vm.runInContext(fs.readFileSync('js/core/db.js','utf8')+'\nDB;',context);const feature=vm.runInContext(fs.readFileSync('js/features/today/today'+suffix,'utf8')+'\nTodayFeature;',context);
 let rows=[];db.db={appointments:{toArray:async()=>{if(error)throw Error('synthetic read failure');return rows;}}};db.getAppointmentsForDate=async date=>{reads.push(date);return rows.filter(a=>a.status!=='cancelled'&&db._inDateWindow(a.date,db._ukCalendarBoundary(date),db._ukCalendarBoundary(date,1)));};
 for(const [instant,start,end]of [['2026-10-27T18:00:00Z','2026-10-27T00:00:00.000Z','2026-10-28T00:00:00.000Z'],['2026-03-29T18:00:00Z','2026-03-29T00:00:00.000Z','2026-03-29T23:00:00.000Z'],['2026-10-25T18:00:00Z','2026-10-24T23:00:00.000Z','2026-10-26T00:00:00.000Z'],['2026-12-31T18:00:00Z','2026-12-31T00:00:00.000Z','2027-01-01T00:00:00.000Z']]){
  clock=Date.parse(instant);const at=new Date(Date.parse(start)+3600000).toISOString();rows=[{date:at,type:'consultation',outcome:'ordered',status:'completed',value:1000,commission:122},{date:at,type:'measure',outcome:'measured',status:'completed',visitEarnings:106},{date:at,type:'service_call',outcome:'parts_needed',status:'completed',visitEarnings:20},{date:at,type:'service_call',outcome:'customer_no_show',status:'completed',visitEarnings:20},{date:at,type:'service_call',outcome:'resolved',status:'confirmed',visitEarnings:20},{date:at,type:'consultation',outcome:'ordered',status:'cancelled',commission:999},{date:new Date(Date.parse(start)-1).toISOString(),outcome:'ordered',commission:999},{date:end,outcome:'ordered',commission:999}];
  const before=JSON.stringify(rows);await feature.openEODModal();assert.match(modal,/£248\.00/);assert.match(modal,/Results Logged/);assert.equal(reads.at(-1),start);assert.equal(JSON.stringify(rows),before);
 }
 rows=[];await feature.openEODModal();assert.match(modal,/£0\.00/);
 modal='';error=true;await feature.openEODModal();assert.equal(modal,'');assert.equal(notices.at(-1)[1],'error');
 console.log('PASS EOD '+suffix+': canonical sales/survey/attended service earnings; no-show, incomplete, cancelled and adjacent days excluded; empty, UK DST/year bounds, no writes, fail closed');
}})().catch(e=>{console.error(e);process.exitCode=1;});
