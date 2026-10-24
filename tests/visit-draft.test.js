'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const Dexie=require('dexie');const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
Dexie.dependencies.indexedDB=indexedDB;Dexie.dependencies.IDBKeyRange=IDBKeyRange;
(async()=>{for(const file of ['js/core/db.js','js/core/db.min.js']){
 const values=new Map(),s={console,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,
 localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
 vm.createContext(s);const {DB,initEncryption}=vm.runInContext(fs.readFileSync(file,'utf8')+'\n({DB,initEncryption});',s);
 const db=new Dexie('SYNTHETIC-draft-'+Math.random());db.version(1).stores({settings:'key',appointments:'++id'});await db.open();DB.db=db;
 const draft={v:1,id:'SYNTHETIC',params:{action:'add'},values:{'appt-name':'SYNTHETIC customer'},audio:[]};
 await assert.rejects(()=>DB.writeVisitDraft(draft),/Encryption key not initialized/);assert.equal(await db.settings.count(),0);
 await initEncryption('SYNTHETIC-only');
 const rev=await DB.writeVisitDraft(draft);const raw=await db.settings.get('__new_visit_draft_v1__');
 assert(raw.value.ct&&raw.value.iv);assert(!JSON.stringify(raw).includes('SYNTHETIC customer'));
 assert.equal((await DB.getVisitDraft()).draft.values['appt-name'],'SYNTHETIC customer');
 const race=await Promise.allSettled([DB.writeVisitDraft(draft,rev),DB.writeVisitDraft(draft,rev)]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'Atomic transaction permits exactly one revision claim');
 assert.equal(race.filter(r=>r.status==='rejected'&&r.reason.message==='draft_conflict').length,1);
 await assert.rejects(()=>DB.deleteVisitDraft(rev),/draft_conflict/);const latest=await DB.getVisitDraft();
 await DB.deleteVisitDraft(latest.revision);assert.equal(await DB.getVisitDraft(),null);
 const bookings=await Promise.all([DB.addAppointment({entryDraftId:'SYNTHETIC',clientName:'SYNTHETIC booking'}),DB.addAppointment({entryDraftId:'SYNTHETIC',clientName:'SYNTHETIC booking'})]);
 assert.equal(bookings[0].id,bookings[1].id);assert.equal(await db.appointments.count(),1,'Concurrent recovery saves cannot create two visits');
 await db.settings.put({key:'__new_visit_draft_v1__',value:'SYNTHETIC plaintext',revision:'bad'});
 await assert.rejects(()=>DB.getVisitDraft(),/draft_unreadable/);assert.equal((await db.settings.get('__new_visit_draft_v1__')).value,'SYNTHETIC plaintext');
 DB.db={settings:db.settings};await assert.rejects(()=>DB.writeVisitDraft(draft),/draft_transactions_unavailable/);
 await db.delete();console.log('PASS '+file+': AES encryption/no key failure, atomic cross-session CAS, stale delete rejection, unreadable preservation, no unsafe transaction fallback');
}
for(const file of ['js/services/visit-draft.js','js/services/visit-draft.min.js']){
 const s={console,setTimeout,clearTimeout};vm.createContext(s);
 const service=vm.runInContext(fs.readFileSync(file,'utf8')+'\nVisitDraft;',s);
 const original={inert:false},replacement={inert:true};
 service.current={ready:true,form:{isConnected:true,querySelector:()=>original}};
 service.busy=()=>false;service.flush=async()=>{};
 service.leave=()=>{service.current={ready:false,form:{isConnected:true,querySelector:()=>replacement}};};
 await service.leaveKept();assert.equal(replacement.inert,true,'Old session cleanup cannot unlock a replacement form');
 console.log('PASS '+file+': session-bound exit does not unlock a new recovery chooser');
}
})().catch(e=>{console.error(e);process.exitCode=1;});
