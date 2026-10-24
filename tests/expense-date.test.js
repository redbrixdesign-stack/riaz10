'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(file){
 const fields={},messages=[],writes=[],updates=[],rows=new Map();let modal='';
 const DateAtMidnight=class extends Date{constructor(...args){super(...(args.length?args:['2026-04-05T23:30:00Z']));}static now(){return new Date('2026-04-05T23:30:00Z').getTime();}};
 const context=vm.createContext({Date:DateAtMidnight,Intl,console,setTimeout,clearTimeout,
  document:{getElementById:id=>fields[id]||null},CONFIG:{expenseCategories:[{id:'tools',name:'Tools'}]},
  App:{registerFeature(){},openModal:html=>{modal=html;},closeModal(){},navigate(){}},
  Toast:{show:message=>messages.push(message)},AIService:{isEnabled:()=>true,extractReceipt:async()=>({ok:true,fields:{date:'2026-04-05',amount:'12.50',description:'SYNTHETIC tool',category:'tools'}})},
  DB:{addExpense:async row=>{writes.push(row);return{id:writes.length,...row};},db:{expenses:{get:async id=>rows.get(id),update:async(id,patch)=>{updates.push({id,patch});return 1;}}}}});
 const utils=vm.runInContext(fs.readFileSync('js/core/utils.js','utf8')+'\nUtils;',context);
 context.DB.updateExpense=(id,patch)=>context.DB.db.expenses.update(id,patch);
 const money=vm.runInContext(fs.readFileSync(file,'utf8')+'\nMoneyFeature;',context);
 const field=(id,value='')=>fields[id]={value,options:[{value:'tools'}],innerHTML:''};
 const form=(prefix='')=>{field(prefix+'expense-date','2026-04-05');field(prefix+'expense-amount','12.50');field(prefix+'expense-category','tools');field(prefix+'expense-description','SYNTHETIC receipt');};
 return{money,utils,fields,messages,writes,updates,rows,field,form,context,modal:()=>modal};
}
async function run(file){
 let f=fixture(file);
 assert.equal(typeof f.money.expenseDateInstant,'function','Expense dates need strict UK calendar validation');
 assert.equal(f.money.expenseDateInstant('2026-04-06'),'2026-04-05T23:00:00.000Z');
 assert.equal(f.money.expenseDateInstant('2026-04-05'),'2026-04-04T23:00:00.000Z');
 assert.equal(f.money.expenseDateInstant('2026-03-29'),'2026-03-29T00:00:00.000Z');
 assert.equal(f.money.expenseDateInstant('2026-10-26'),'2026-10-26T00:00:00.000Z');
 for(const date of ['',null,'05/04/2026','2026-02-29','2026-04-31','2026-13-01','2026-4-05','2026-04-05T12:00:00Z'])assert.equal(f.money.expenseDateInstant(date),null,date);
 assert.equal(f.money.expenseDateInstant('2024-02-29'),'2024-02-29T00:00:00.000Z');
 f.money.openExpenseModal();assert.match(f.modal(),/id="expense-date"[^>]*value="2026-04-06"/,'Today follows UK day at BST midnight, not UTC date');
 f.form();f.money.expensePhotoData='data:image/png;base64,U1lOVEhFVElD';await f.money.saveExpense();
 assert.equal(f.writes[0].date,'2026-04-04T23:00:00.000Z');assert.equal(f.writes[0].photo,'data:image/png;base64,U1lOVEhFVElD');
 f.form();for(const value of ['','2026-02-30']){f.fields['expense-date'].value=value;await f.money.saveExpense();}assert.equal(f.writes.length,1);
 f.fields['expense-date'].value='2026-04-05';for(const value of ['Infinity','12garbage','0','-5']){f.fields['expense-amount'].value=value;await f.money.saveExpense();}assert.equal(f.writes.length,1);
 f=fixture(file);f.form();let release;f.context.DB.addExpense=row=>{f.writes.push(row);return new Promise(resolve=>release=resolve);};
 const save=f.money.saveExpense();await f.money.saveExpense();assert.equal(f.writes.length,1,'Repeated Save while pending must not duplicate');release({id:1});await save;
 f=fixture(file);f.form();f.money.expensePhotoData='SYNTHETIC retained';f.context.DB.addExpense=async()=>{throw Error('SYNTHETIC quota');};await f.money.saveExpense();assert.equal(f.fields['expense-date'].value,'2026-04-05');assert.equal(f.money.expensePhotoData,'SYNTHETIC retained');assert.match(f.messages.at(-1),/Failed/);
 f=fixture(file);const original='2026-04-05T14:15:16.123Z';f.rows.set(7,{id:7,date:original,amount:12.5,category:'tools',description:'SYNTHETIC',photo:'SYNTHETIC photo'});
 await f.money.openEditExpenseModal(7);assert.match(f.modal(),/id="edit-expense-date"[^>]*value="2026-04-05"/);assert.equal(f.updates.length,0,'Opening/cancelling an edit does not write');
 f.form('edit-');await f.money.saveEditExpense(7);assert.equal(f.updates[0].patch.date,original,'Unchanged day preserves original timestamp');assert(!('photo' in f.updates[0].patch));
 f.fields['edit-expense-date'].value='2026-04-06';await f.money.saveEditExpense(7);assert.equal(f.updates[1].patch.date,'2026-04-05T23:00:00.000Z');
 f.fields['edit-expense-date'].value='2026-02-30';await f.money.saveEditExpense(7);assert.equal(f.updates.length,2);
 f=fixture(file);f.form();f.money.applyReceiptDate('2026-03-01',f.fields['expense-date'],'2026-04-05');assert.equal(f.fields['expense-date'].value,'2026-03-01');
 f.money.applyReceiptDate('2026-02-01',f.fields['expense-date'],'2026-04-05');assert.equal(f.fields['expense-date'].value,'2026-03-01','A changed adviser date is not overwritten');
 f.fields['expense-date'].value='2026-04-05';f.money.applyReceiptDate('03/04/2026',f.fields['expense-date'],'2026-04-05');assert.equal(f.fields['expense-date'].value,'');assert.match(f.messages.at(-1),/date/i,'Ambiguous extracted date requires explicit entry, not silent today');
 // Slow file reads/results may only fill the same owning receipt form.
 f=fixture(file);f.form();let resolveRead;
 f.utils.fileToBase64=()=>new Promise(resolve=>resolveRead=resolve);
 const photo=f.money.handleExpensePhoto({target:{files:[{}]}});await f.money.saveExpense();assert.equal(f.writes.length,0,'Cannot save before selected receipt bytes attach');
 f.form();resolveRead('SYNTHETIC old photo');await photo;assert.equal(f.money.expensePhotoData,null,'Old file read cannot attach to a replacement form');
 f=fixture(file);f.form();f.field('expense-photo-preview');let resolveAnalysis;
 f.utils.fileToBase64=async()=> 'SYNTHETIC current photo';f.context.AIService.extractReceipt=()=>new Promise(resolve=>resolveAnalysis=resolve);
 const analysis=f.money.handleExpensePhoto({target:{files:[{}]}});for(let i=0;i<8;i++)await Promise.resolve();
 f.fields['expense-date'].value='2026-04-04';resolveAnalysis({ok:true,fields:{date:'2026-04-01',amount:'5',category:'tools'}});await analysis;
 assert.equal(f.fields['expense-date'].value,'2026-04-04','Adviser date wins while extraction is pending');
 f=fixture(file);f.form();f.field('expense-photo-preview');f.utils.fileToBase64=async()=> 'SYNTHETIC quick photo';
 await f.money.applyQuickCapture({}, {kind:'expense',date:'2026-04-01',amount:7,category:'tools',description:'SYNTHETIC quick'});
 assert.equal(f.fields['expense-date'].value,'2026-04-01');assert.equal(f.money.expensePhotoData,'SYNTHETIC quick photo');
 console.log('PASS '+file+': strict UK dates, historical/create/edit/receipt review, unchanged timestamp, validation, duplicate guard and failure retention');
}
(async()=>{for(const file of ['js/features/money/money.js','js/features/money/money.min.js'])await run(file);})().catch(error=>{console.error(error);process.exitCode=1;});
