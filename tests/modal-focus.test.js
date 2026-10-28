'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const suffix of ['.js','.min.js']){
 const queue=[],document={addEventListener(){},activeElement:null},s={console,document,requestAnimationFrame:fn=>queue.push(fn)};vm.createContext(s);const app=vm.runInContext(fs.readFileSync('js/core/app'+suffix,'utf8')+'\nApp;',s);
 let count=0;const first={focus(){count++;document.activeElement=this;}},chosen={focus(){document.activeElement=this;}},sheet={isConnected:true,firstElementChild:{},contains:node=>[first,chosen].includes(node),querySelector:()=>first};
 app.focusFirstControl(sheet);queue.shift()();assert.equal(document.activeElement,first,'Default first control receives focus');
 app.focusFirstControl(sheet);chosen.focus();queue.shift()();assert.equal(document.activeElement,chosen,'Deferred initial focus must respect an already chosen control');assert.equal(count,1);
 document.activeElement=null;app.focusFirstControl(sheet);sheet.firstElementChild={};queue.shift()();assert.equal(document.activeElement,null,'Stale dialog callback cannot focus replacement content');
 app.focusFirstControl(sheet);sheet.isConnected=false;queue.shift()();assert.equal(document.activeElement,null,'Detached sheet cannot steal focus');
 console.log('PASS modal focus '+suffix+': default first control, user/on-open focus ownership, stale replacement and detached guard');
 const timers=[],nodes=new Map();let focused=0,scrolled=0,modalOpen=true;const heading={setAttribute(){},focus(){focused++;}},panel={isConnected:true,querySelector:()=>heading,scrollIntoView(){scrolled++;}};nodes.set('customer-followups',panel);nodes.set('modal-overlay',{classList:{contains:()=>modalOpen}});
 const cs={document:{getElementById:id=>nodes.get(id)||null},App:{registerFeature(){},_navigationRevision:3},setTimeout:fn=>timers.push(fn)};vm.createContext(cs);const customer=vm.runInContext(fs.readFileSync('js/features/customer/customer'+suffix,'utf8')+'\nCustomerFeature;',cs);
 customer.activate({section:'followups'});timers.shift()();assert.equal(focused,0,'Background profile return must not steal focus from a dialog');modalOpen=false;customer.activate({section:'followups'});timers.shift()();assert.equal(focused,1);assert.equal(scrolled,1);customer.activate({section:'followups'});cs.App._navigationRevision++;timers.shift()();assert.equal(focused,1,'Navigation away cancels restoration');
 console.log('PASS profile focus '+suffix+': normal restoration, active-dialog guard and navigation revision ownership');
}
