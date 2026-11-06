'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
(async()=>{for(const suffix of ['.js','.min.js']){
 const values=new Map(),scheduled=[];
 const context={console,crypto:require('node:crypto').webcrypto,indexedDB,IDBKeyRange,TextEncoder,TextDecoder,Uint8Array,btoa,atob,setTimeout,clearTimeout,Date,Intl,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},safeJSONParse:v=>v?JSON.parse(v):null,MessageScheduler:{onAppointmentChanged:async(before,after)=>scheduled.push({before,after})}};
 context.window=context;context.self=context;context.Dexie=require('dexie');context.Dexie.dependencies.indexedDB=indexedDB;context.Dexie.dependencies.IDBKeyRange=IDBKeyRange;vm.createContext(context);
 for(const file of ['js/core/config.js','js/core/utils.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const code=fs.readFileSync('js/core/db'+suffix,'utf8').replace(/new Dexie\(['"]advisoros_v6['"]\)/,`new Dexie('synthetic-reminder-reset-${suffix}')`);
 const {DB,initEncryption}=vm.runInContext(code+'\n({DB,initEncryption});',context);await initEncryption('SYNTHETIC reset unit');await DB.init();
 const customer=await DB.addCustomer({firstName:'SYNTHETIC Reminder'});
 const visit=await DB.addAppointment({customerId:customer.id,clientName:customer.firstName,date:'2030-11-06T10:00:00Z',type:'fitting',arrivalStart:'09:00',arrivalEnd:'12:00',status:'confirmed',introSent:true,dayBeforeSent:true,value:1000,commission:80,notes:'SYNTHETIC encrypted note',contactOutcomes:[{id:'SYNTHETIC old history',outcome:'visit_agreed'}]});
 await DB.updateAppointment(visit.id,{notes:'SYNTHETIC revised note',date:visit.date,arrivalStart:visit.arrivalStart,arrivalEnd:visit.arrivalEnd,type:visit.type});
 assert.equal((await DB.getAppointment(visit.id)).dayBeforeSent,true,'Unchanged booking and note-only edits preserve reminder');
 assert.notEqual((await DB.db.appointments.get(visit.id)).notes,'SYNTHETIC revised note','PII remains encrypted');
 const cases=[{date:'2030-11-07T10:00:00Z'},{arrivalStart:'10:00'},{arrivalEnd:'13:00'},{type:'measure'}];
 for(const patch of cases){await DB.updateAppointment(visit.id,{dayBeforeSent:true});const before=await DB.getAppointment(visit.id);await DB.updateAppointment(visit.id,{...patch,dayBeforeSent:true});const after=await DB.getAppointment(visit.id);assert.equal(after.dayBeforeSent,false,'Changed booking cannot inherit prior reminder: '+JSON.stringify(patch));assert.equal(after.introSent,true,'Customer introduction survives a move');assert.deepEqual(after.contactOutcomes,before.contactOutcomes,'Contact history retained');assert.equal(after.value,1000);assert.equal(after.commission,80);assert.equal(after.status,'confirmed');assert.equal(after.notes,'SYNTHETIC revised note');assert.notEqual(DB.visitContactSnapshot(after),DB.visitContactSnapshot(before));}
 await DB.updateAppointment(visit.id,{dayBeforeSent:true,status:'completed',outcome:'completed'});assert.equal((await DB.getAppointment(visit.id)).dayBeforeSent,true,'Outcome-only writes do not rewrite reminder evidence');
 assert(scheduled.length>=cases.length,'Scheduler sees booking changes');DB.db.close();console.log('PASS '+suffix+': date/window/type invalidate only prior reminder; unchanged/note/outcome writes preserve evidence, encrypted notes/history/introduction/earnings retained');
}})().catch(e=>{console.error(e);process.exitCode=1;});
