'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{for(const suffix of ['.js','.min.js']){
 for(const host of ['localhost','127.0.0.1','[::1]','beelo.beelestial.co.uk','beelo1.vercel.app','localhost.evil.example','127.0.0.1.evil.example','']){
  const allowed=['localhost','127.0.0.1','[::1]'].includes(host);let initialisations=0,modal='';
  const s={console,window:{location:{hostname:host}},localStorage:{getItem:key=>key==='advisoros_enc_test'?'1':null},document:{addEventListener(){},getElementById:()=>null,querySelector:()=>null},initEncryption:async()=>initialisations++};
  vm.createContext(s);vm.runInContext(fs.readFileSync('js/core/utils'+suffix,'utf8'),s);const app=vm.runInContext(fs.readFileSync('js/core/app'+suffix,'utf8')+'\nApp;',s);app.openModal=html=>modal=html;
  assert.equal(vm.runInContext('Utils.isLocalBrowserTest()',s),allowed,host);
  const pending=app.promptPassphrase();if(allowed)await pending;
  assert.equal(initialisations,allowed?1:0,'Known key selection must be loopback-only: '+host);
  assert.equal(modal.includes('enc-passphrase-new'),!allowed,'Public test flag still requires genuine passphrase: '+host);
 }
 for(const file of ['js/core/app'+suffix,'js/core/install-prompt'+suffix,'js/core/legal'+suffix]){
  assert(!/getItem\(["']advisoros_enc_test["']\)/.test(fs.readFileSync(file,'utf8')),'Exemptions must use the common host boundary');
 }
 console.log('PASS '+suffix+': public/vercel/lookalike/file origins cannot select fixture key; only explicit loopback flag opt-in; all exemptions use the same boundary');
}})().catch(e=>{console.error(e);process.exitCode=1;});
