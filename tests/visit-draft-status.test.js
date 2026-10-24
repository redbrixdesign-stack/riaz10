'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(file){
 const messages=[],writes=[],modal=[];let data={values:{'appt-name':'SYNTHETIC'},audio:[]},hasWork=true;
 const DB={writeVisitDraft:async(draft,revision)=>{writes.push({draft,revision});return 'revision-'+writes.length;}};
 const context=vm.createContext({console,crypto:require('node:crypto').webcrypto,clearTimeout(){},setTimeout(){return 1;},DB,
  window:{location:{hash:'#appointments?action=add'}},App:{currentHash:'appointments?action=add',openModal:html=>modal.push(html)}});
 const service=vm.runInContext(fs.readFileSync(file,'utf8')+'\nVisitDraft;',context);
 service.current={ready:true,form:{isConnected:true},id:'SYNTHETIC',revision:'known',persisted:JSON.stringify(data)};
 service.read=()=>JSON.parse(JSON.stringify(data));service.hasWork=()=>hasWork;service.status=message=>messages.push(message);
 return{service,DB,messages,writes,modal,set:(next,work=true)=>{data=next;hasWork=work;}};
}
async function run(file){
 let f=fixture(file);f.service.changed();await f.service.flush();
 assert.match(f.messages.at(-1),/^Draft saved encrypted/,'An unchanged event cannot leave a false Saving status');assert.equal(f.writes.length,0);
 f=fixture(file);f.service.current.revision=null;f.service.current.persisted=null;f.set({values:{'appt-name':''},audio:[]},false);
 f.service.changed();await f.service.flush();assert.match(f.messages.at(-1),/^No unfinished changes/);assert.equal(f.writes.length,0);
 // A clear event while a preceding write is still in flight must serialize
 // after it; otherwise recovery can bring back the text the adviser cleared.
 f=fixture(file);f.service.current.revision=null;f.service.current.persisted=null;let release;
 f.DB.writeVisitDraft=(draft,revision)=>{f.writes.push({draft,revision});return f.writes.length===1?new Promise(resolve=>release=resolve):Promise.resolve('after-clear');};
 const first=f.service.flush();await drain();f.set({values:{'appt-name':''},audio:[]},false);
 assert.equal(f.service.guardNavigation('today',{}),true,'A pending write still needs leave protection');assert.equal(f.modal.length,1);
 let cleared=false;const clear=f.service.flush().then(()=>{cleared=true;});await drain();assert.equal(cleared,false,'Empty flush must await pending persistence');
 release('before-clear');await first;await clear;
 assert.equal(f.writes.length,2);assert.equal(f.writes[1].revision,'before-clear');assert.equal(f.writes[1].draft.values['appt-name'],'');assert.equal(f.service.current.pendingWrites,0);
 // A failed/conflicting write must not be hidden by reverting to the last
 // successfully saved field values and then taking the no-change shortcut.
 f=fixture(file);const original={values:{'appt-name':'SYNTHETIC'},audio:[]};
 f.DB.writeVisitDraft=async()=>{throw Error('draft_conflict');};f.set({values:{'appt-name':'SYNTHETIC changed'},audio:[]});
 await assert.rejects(f.service.flush(),/draft_conflict/);f.set(original);f.service.changed();await assert.rejects(f.service.flush(),/draft_conflict/);
 assert.match(f.messages.at(-1),/^Draft changed in another tab/);
 console.log('PASS '+file+': truthful no-op/empty status, ordered clear behind pending write, leave protection and conflict preservation');
}
(async()=>{for(const file of ['js/services/visit-draft.js','js/services/visit-draft.min.js'])await run(file);})().catch(error=>{console.error(error);process.exitCode=1;});
