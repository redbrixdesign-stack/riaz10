'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
if (!process.env.BEELO_CAPACITY_TZ_CHILD) {
 for (const timezone of ['Europe/London','UTC','America/New_York','Pacific/Kiritimati']) {
  const result=require('node:child_process').spawnSync(process.execPath,[__filename],{env:{...process.env,TZ:timezone,BEELO_CAPACITY_TZ_CHILD:'1'},stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
 }
 process.exit(0);
}
(async()=>{for(const suffix of ['.js','.min.js']){
 const context={console,Intl,Date,CONFIG:{workingWeek:{slotMinutes:15,blocks:[{start:'09:00',end:'18:00'}]}},DB:{getAvailabilityBlocks:async()=>[]}};vm.createContext(context);vm.runInContext(fs.readFileSync('js/core/utils'+suffix,'utf8'),context);const capacity=vm.runInContext(fs.readFileSync('js/services/capacity'+suffix,'utf8')+'\nCapacityService;',context);
 for(const date of ['2030-11-07T10:00:00Z','2030-06-07T09:00:00Z','2030-03-31T09:00:00Z','2030-10-27T10:00:00Z'])assert(!(await capacity.analyse({date,durationSlots:2})).some(w=>w.code==='closed_hours'),'10:00 UK is inside hours on '+date+' in '+process.env.TZ);
 for(const [date,closed]of [['2030-06-07T07:45:00Z',true],['2030-06-07T08:00:00Z',false],['2030-06-07T16:45:00Z',false],['2030-06-07T17:00:00Z',true]])assert.equal((await capacity.analyse({date,durationSlots:1})).some(w=>w.code==='closed_hours'),closed,'UK boundary '+date);
 const visits=[{id:1,date:'2030-06-07T08:00:00Z',durationSlots:4,status:'confirmed'}],before=JSON.stringify(visits);
 assert((await capacity.analyse({date:'2030-06-07T08:30:00Z',durationSlots:2},visits)).some(w=>w.code==='overlap'));
 assert(!(await capacity.analyse({date:'2030-06-07T08:30:00Z',durationSlots:2},visits,1)).some(w=>w.code==='overlap'));
 const suggested=await capacity.suggest({date:'2030-06-07',durationSlots:2},visits);assert.equal(suggested[0].date,'2030-06-07T09:00:00.000Z');assert.equal(suggested[0].label,'10:00');
 const boundary=await capacity.suggest({date:'2030-06-06T23:30:00Z',durationSlots:2},[]);assert.equal(boundary[0].date,'2030-06-07T08:00:00.000Z','suggestion follows UK day across UTC midnight');
 context.DB.getAvailabilityBlocks=async()=>[{type:'leave',startAt:'2030-06-07T08:00:00Z',endAt:'2030-06-07T11:00:00Z'}];const afterLeave=await capacity.suggest({date:'2030-06-07',durationSlots:2},[]);assert.equal(afterLeave[0].date,'2030-06-07T11:00:00.000Z');assert.equal(JSON.stringify(visits),before,'advice never rewrites visits');
 const utils=vm.runInContext('Utils',context);assert.equal(utils.ukDateTimeISO('2030-03-31','01:30'),null,'nonexistent spring time rejected');assert.equal(utils.ukDateTimeISO('2030-10-27','01:30'),null,'ambiguous autumn time rejected');assert.equal(utils.ukDateTimeISO('2030-02-31','10:00'),null);assert.equal(utils.ukDateTimeISO('2030-06-07','10:00'),'2030-06-07T09:00:00.000Z');
 console.log('PASS '+suffix+' '+process.env.TZ+': UK working hours/suggestions, GMT/BST/DST dates and bounds, overlap/exclusion/leave retained, UK-vs-UTC day, invalid/ambiguous times, no writes');
}})().catch(e=>{console.error(e);process.exitCode=1;});
