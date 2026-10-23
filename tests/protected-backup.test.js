const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 for (const file of ['js/services/export.js','js/services/export.min.js']) {
  const values = new Map();
  const sandbox = { crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob, console, CONFIG: { appVersion:'5.0', ai:{secret:'SYNTHETIC-private'} }, Utils:{formatDateUK:()=> '2026-10-23'}, Toast:{show(){}}, localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}, DB:{exportAll:async()=>({customers:[],voiceNotes:[]}),storageContract:()=>({databaseSchemaVersion:9,backupFormatVersion:1})} };
  vm.createContext(sandbox);
  const api = vm.runInContext(fs.readFileSync(file,'utf8')+'\n({exportEncrypt,exportDecrypt,service:ExportService});',sandbox);
  for (const bytes of [1000,200000,1000000,4000000]) {
   const text=JSON.stringify({synthetic:'x'.repeat(bytes),unicode:'🪟 اردو'});
   const encrypted=await api.exportEncrypt(text,'SYNTHETIC-backup');
   assert(encrypted.startsWith('advisoros:enc:v1:'));
   assert.equal(await api.exportDecrypt(encrypted,'SYNTHETIC-backup'),text);
   if(bytes===1000){await assert.rejects(api.exportDecrypt(encrypted,'wrong'));await assert.rejects(api.exportDecrypt(encrypted.slice(0,-10),'SYNTHETIC-backup'));}
  }
  const salt=new Uint8Array(16),iv=new Uint8Array(12);
  const old = await vm.runInContext('(async()=>{const key=await exportDeriveKey("legacy",new Uint8Array(16));const c=await crypto.subtle.encrypt({name:"AES-GCM",iv:new Uint8Array(12)},key,new TextEncoder().encode("legacy fixture"));const bytes=new Uint8Array(28+c.byteLength);bytes.set(new Uint8Array(c),28);return "advisoros:enc:v1:"+btoa(String.fromCharCode(...bytes));})()',sandbox);
  assert.equal(await api.exportDecrypt(old,'legacy'),'legacy fixture','Old wire-format compatibility');
  let downloaded;
  api.service.downloadFile=(content,filename)=>{downloaded={content,filename};};
  await api.service.exportBackup('SYNTHETIC-backup');
  assert(downloaded.filename.endsWith('.enc.json'));
  assert.equal(JSON.parse(values.get('beelo_last_backup')).filename,downloaded.filename);
  assert(!JSON.stringify(JSON.parse(await api.exportDecrypt(downloaded.content,'SYNTHETIC-backup'))).includes('SYNTHETIC-private'));
  const before=values.get('beelo_last_backup');
  api.service.downloadFile=()=>{throw new Error('synthetic download failure');};
  await assert.rejects(api.service.exportBackup('SYNTHETIC-backup'));
  assert.equal(values.get('beelo_last_backup'),before,'Failed export cannot advance backup metadata');
  console.log('PASS protected backups '+file+': 4 MB/Unicode roundtrip, wrong password/tamper, legacy envelope, secret exclusion, filename and failure metadata');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
