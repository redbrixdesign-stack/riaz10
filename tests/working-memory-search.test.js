'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const file of ['js/core/search.js','js/core/search.min.js']){
 const customers=[{id:1,firstName:'SYNTHETIC Cedar',lastName:'Example',address:{postcode:'M14 7FZ'},notes:'Dog sleeps downstairs'},{id:2,firstName:'SYNTHETIC Willow'}];
 const appointments=[{id:7,customerId:1,date:'2026-10-25T10:00:00Z',type:'measure',notes:'Parking behind garage',audioNotes:[{transcript:'Review navy fabric'}]},{id:8,customerId:2,date:null,type:'fitting',notes:'Different customer'}];
 const windows=[{id:11,appointmentId:7,windowName:'Bedroom',description:'SYNTHETIC roman blinds',transcripts:['Control left']},{id:12,appointmentId:7,windowName:'Kitchen',description:'green roller'}];
 const s={console,CONFIG:{appointmentTypes:[{id:'measure',name:'Survey'}]},Utils:{formatDate:d=>d.slice(0,10),formatTime:()=> '10:00'},
 DB:{getAllCustomers:async()=>customers,getAllAppointments:async()=>appointments,getMeasurementSearchRecords:async()=>windows,
 searchCustomers:async query=>customers.filter(c=>c.firstName.toLowerCase().includes(query)),
 getCustomersByIds:async ids=>customers.filter(c=>ids.includes(c.id)),
 db:{orders:{toArray:async()=>[{id:2,customerId:1,orderNumber:'ORD-42'}],filter:()=>({limit:()=>({toArray:async()=>[]})})}}}};
 vm.createContext(s);const source=process.env.BEELO_NEGATIVE_SEARCH?require('node:child_process').execFileSync('git',['show','4d9f7d6:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');const search=vm.runInContext(source+'\nSearch;',s);
 const before=JSON.stringify({customers,appointments,windows});
 assert((await search.search('Cedar bedroom')).some(r=>r.type==='appointment'&&r.id===7));
 assert(!(await search.search('Cedar',{types:['appointment']}))[0].detail.startsWith('Window:'),'Name-only search must not imply a particular window matched');
 assert((await search.search('Cedar navy')).some(r=>r.id===7&&r.type==='appointment'));
 assert((await search.search('Cedar control')).some(r=>r.id===7&&r.type==='appointment'));
 assert((await search.search('garage Cedar')).some(r=>r.id===7&&r.type==='appointment'));
 assert.equal((await search.search('bedroom green')).length,0,'Never join two unrelated windows to fabricate match');
 assert.equal((await search.search('Willow bedroom')).length,0,'Never cross customers');
 assert((await search.search('M147FZ',{types:['customer']})).some(r=>r.id===1));
 assert.equal((await search.search('Cedar bedroom',{types:['customer']})).length,0);
 assert.equal((await search.search('ORD-42'))[0].type,'order');
 assert.equal((await search.search('Dog downstairs',{types:['customer']}))[0].id,1);
 assert.equal((await search.search('Willow',{types:['appointment']}))[0].title,'Date unavailable');
 assert.equal((await search.search('x')).length,0);assert.equal((await search.search(null)).length,0);
 assert.equal((await search.search('absent')).length,0);
 assert.equal(JSON.stringify({customers,appointments,windows}),before,'Read-only search must not sort/mutate original rows');
 s.DB.getMeasurementSearchRecords=async()=>{throw Error('SYNTHETIC read failure');};
 await assert.rejects(search.search('Cedar'),/read failure/);
 assert.equal((await search.search('Cedar',{types:['customer']}))[0].id,1,'Customer picker should not depend on measurement read');
 console.log('PASS '+file+': multi-term context, notes/transcripts/windows, customer isolation, legacy dates, type-only matching, postcode, explicit failure and no mutation');
}})().catch(e=>{console.error(e);process.exitCode=1;});
