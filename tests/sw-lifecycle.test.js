'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{for(const file of ['js/core/app.js','js/core/app.min.js']){
 for(const installed of [false,true]){
  let reloads=0,offers=0,activations=0;const events={};
  const worker={postMessage:message=>{assert.equal(message.type,'SKIP_WAITING');activations++;}};
  const registration={waiting:installed?worker:null,addEventListener(){}};
  const sw={controller:installed?{}:null,register:async()=>registration,addEventListener:(name,fn)=>events[name]=fn};
  const s={console,Utils:{isLocalBrowserTest:()=>false},navigator:{serviceWorker:sw},localStorage:{getItem:()=>null},window:{location:{reload:()=>reloads++}},document:{addEventListener(){},querySelector:()=>null}};
  vm.createContext(s);const app=vm.runInContext(fs.readFileSync(file,'utf8')+'\nApp;',s);app.openModal=()=>offers++;
  await app.setupServiceWorker();assert.equal(reloads,0);assert.equal(activations,0);
  if(!installed){sw.controller={};events.controllerchange();assert.equal(reloads,0,'First claim cannot interrupt the new page');}
  else {assert.equal(offers,1);app.applyServiceWorkerUpdate();assert.equal(activations,1,'Only adviser action requests activation');}
  events.controllerchange();assert.equal(reloads,1);events.controllerchange();assert.equal(reloads,1,'An applied update reloads only once');
 }
 console.log('PASS '+file+': first-install claim keeps page, installed update waits for adviser, activation/reload single-flight');
}})().catch(e=>{console.error(e);process.exitCode=1;});
