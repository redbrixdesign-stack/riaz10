'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(file){
 const fields={},writes=[],messages=[];const s={Date,Intl,console,setTimeout,clearTimeout,document:{getElementById:id=>fields[id]||null},App:{registerFeature(){}},Toast:{show:m=>messages.push(m)},DB:{getCustomer:async id=>({id,firstName:'SYNTHETIC '+id}),searchCustomers:async()=>[],addExpense:async data=>writes.push(data)}};
 vm.createContext(s);vm.runInContext(fs.readFileSync('js/core/utils.js','utf8'),s);const money=vm.runInContext(fs.readFileSync(file,'utf8')+'\nMoneyFeature;',s);
 const form=(prefix='')=>{for(const [key,value]of Object.entries({'customer-id':'1','customer-search':'Willow','customer-summary':'SYNTHETIC original','customer-results':'',date:'2026-10-20',amount:'12.50',category:'tools',description:'SYNTHETIC'}))fields[prefix+'expense-'+key]={value,textContent:'',innerHTML:''};};form();
 return{money,fields,s,writes,messages,form};
}
async function run(file){
 let f=fixture(file),resolve;f.s.DB.getCustomer=()=>new Promise(r=>resolve=r);
 const selected=f.money.selectExpenseCustomer(2);assert(f.money.expenseCustomerPending());await f.money.saveExpense();assert.equal(f.writes.length,0,'Save cannot outrun selected-customer validation');
 resolve({id:2,firstName:'SYNTHETIC Willow'});await selected;assert.equal(f.fields['expense-customer-id'].value,'2');assert(!f.money.expenseCustomerPending());
 f.money.clearExpenseCustomer();assert.equal(f.fields['expense-customer-id'].value,'');assert.equal(f.writes.length,0,'Unlink stays a draft until Save');
 f=fixture(file);f.s.DB.getCustomer=()=>new Promise(r=>resolve=r);const old=f.money.selectExpenseCustomer(2);f.form();resolve({id:2,firstName:'SYNTHETIC old'});await old;assert.equal(f.fields['expense-customer-id'].value,'1','Old selection cannot change a replacement form');
 f=fixture(file);f.s.DB.getCustomer=()=>new Promise(r=>resolve=r);const cancelled=f.money.selectExpenseCustomer(2);f.money.clearExpenseCustomer();resolve({id:2,firstName:'SYNTHETIC cancelled'});await cancelled;assert.equal(f.fields['expense-customer-id'].value,'','Clear invalidates pending selection');
 f=fixture(file);let oldSearch,newSearch;f.s.DB.searchCustomers=query=>new Promise(r=>{if(query==='Cedar')oldSearch=r;else newSearch=r;});
 const input=f.fields['expense-customer-search'];input.value='Cedar';const a=f.money.searchExpenseCustomers({target:input});input.value='Willow';const b=f.money.searchExpenseCustomers({target:input});
 oldSearch([{id:1,firstName:'SYNTHETIC stale Cedar'}]);await a;assert(!f.fields['expense-customer-results'].innerHTML.includes('stale'));
 newSearch([{id:2,firstName:'SYNTHETIC <img src=x onerror=alert(1)>'}]);await b;assert(f.fields['expense-customer-results'].innerHTML.includes('&lt;img'));assert(!f.fields['expense-customer-results'].innerHTML.includes('<img'));
 f.s.DB.searchCustomers=async()=>{throw Error('SYNTHETIC read');};await f.money.searchExpenseCustomers({target:input});assert.match(f.fields['expense-customer-results'].textContent,/Could not search/);assert.equal(f.fields['expense-customer-id'].value,'1');
 console.log('PASS '+file+': pending-selection Save guard, replacement/clear isolation, latest search only, escaped names and explicit read errors');
}
(async()=>{for(const file of ['js/features/money/money.js','js/features/money/money.min.js'])await run(file);})().catch(error=>{console.error(error);process.exitCode=1;});
