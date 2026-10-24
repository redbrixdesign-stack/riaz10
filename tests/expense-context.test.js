'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
async function run(file,engine){
 const values=new Map();const s={indexedDB,IDBKeyRange,console,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,setTimeout,clearTimeout,Date,Intl,
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},safeJSONParse:v=>v?JSON.parse(v):null};s.window=s;s.self=s;s.globalThis=s;vm.createContext(s);
 if(engine==='dexie'){s.Dexie=require('dexie');s.Dexie.dependencies.indexedDB=indexedDB;s.Dexie.dependencies.IDBKeyRange=IDBKeyRange;}
 else vm.runInContext(fs.readFileSync('js/vendor/minidexie.js','utf8'),s);
 for(const path of ['js/core/config.js','js/core/utils.js'])vm.runInContext(fs.readFileSync(path,'utf8'),s);
 const name='synthetic-expense-context-'+engine+'-'+file.replace(/\W/g,'');
 const api=vm.runInContext(fs.readFileSync(file,'utf8').replace(/new Dexie\(['"]advisoros_v6['"]\)/,`new Dexie('${name}')`)+'\n({DB,initEncryption});',s);
 const DB=api.DB;assert.equal(typeof DB.updateExpense,'function','Expense context needs validated update support');
 await api.initEncryption('SYNTHETIC context key');await DB.init();
 const a=await DB.addCustomer({firstName:'SYNTHETIC Cedar'}),b=await DB.addCustomer({firstName:'SYNTHETIC Willow'});
 const payload={date:'2026-10-20T12:00:00.000Z',amount:12.5,category:'tools',description:'SYNTHETIC brackets',photo:'data:image/png;base64,U1lOVEhFVElD'};
 const general=await DB.addExpense(payload);assert.equal(general.customerId,null);
 const linked=await DB.addExpense({...payload,customerId:a.id});
 assert.equal((await DB.getExpensesByCustomer(a.id)).length,1);assert.equal((await DB.getExpensesByCustomer(b.id)).length,0);
 const captured=linked.createdAt;await DB.updateExpense(linked.id,{customerId:b.id});
 assert.equal((await DB.getExpensesByCustomer(a.id)).length,0);assert.equal((await DB.getExpensesByCustomer(b.id))[0].id,linked.id);assert.equal(await DB.db.expenses.count(),2);
 let row=await DB.db.expenses.get(linked.id);assert.equal(row.photo,payload.photo);assert.equal(row.amount,12.5);assert.equal(row.date,payload.date);assert.equal(row.createdAt,captured);
 await DB.updateExpense(linked.id,{customerId:null});assert.equal((await DB.getExpensesByCustomer(b.id)).length,0);
 for(const id of [0,-1,'1',99999]){await assert.rejects(DB.addExpense({...payload,customerId:id}),/customer/i);await assert.rejects(DB.updateExpense(linked.id,{amount:99,customerId:id}),/customer/i);}
 assert.equal((await DB.db.expenses.get(linked.id)).amount,12.5,'Rejected link cannot partially update financial values');
 await assert.rejects(DB.updateExpense(99999,{customerId:a.id}),/not found/i);
 await DB.updateExpense(linked.id,{customerId:a.id});
 const backup=await DB.exportAll();await DB._validateBackup(backup);const invalid=JSON.parse(JSON.stringify(backup));invalid.expenses.find(r=>r.id===linked.id).customerId=99999;
 await assert.rejects(DB.importAll(invalid),/expenses.*customerId/i);assert.equal((await DB.db.expenses.get(linked.id)).customerId,a.id);
 await DB.importAll(backup);assert.equal((await DB.getExpensesByCustomer(a.id))[0].photo,payload.photo);
 const result=await DB.deleteCustomer(a.id);row=await DB.db.expenses.get(linked.id);
 assert.equal(row.customerId,null);assert.equal(row.photo,payload.photo);assert.equal(row.amount,payload.amount);assert.equal(result.expensesUnlinked,1);
 assert.equal(await DB.db.expenses.count(),2,'Customer removal never silently removes business expense evidence');
 console.log('PASS '+file+' '+engine+': general/link/reassign/unlink, preserved evidence, invalid-reference/atomic-update guards, backup validation/restore and customer-delete retention');
 if(typeof DB.db.close==='function')DB.db.close();
}
const deadline=setTimeout(()=>{console.error('FAIL expense context test did not settle');process.exit(1);},20000);
(async()=>{for(const file of ['js/core/db.js','js/core/db.min.js'])for(const engine of ['dexie','shim'])await run(file,engine);})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(deadline));
