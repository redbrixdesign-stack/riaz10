'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function run(file,phase){
 const timers=new Map(),requests=[],messages=[],session=new Map();let next=0,release;
 const field={value:'SYNTHETIC original context',dispatchEvent(){}};
 const CONFIG={ai:{secret:'SYNTHETIC-old'}};
 const context=vm.createContext({console,Blob,Event,AbortController,CONFIG,
  navigator:{onLine:true},document:{getElementById:()=>field},
  setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  sessionStorage:{setItem:(k,v)=>session.set(k,v)},
  AIService:{config:()=>CONFIG.ai},DB:{getDeviceAISecret:async()=>phase==='credential'?new Promise(resolve=>release=resolve):'SYNTHETIC-new'},
  Toast:{show:(text)=>messages.push(text)},
  fetch:async(url,options)=>{
   requests.push({url,options});
   if(phase==='success')return{status:200,ok:true,json:async()=>({ok:true,text:'SYNTHETIC transcript'})};
   if((phase==='credential'||phase==='retry')&&requests.length===1)return{status:403,ok:false};
   if(phase==='body')return{status:200,ok:true,json:()=>new Promise(resolve=>release=resolve)};
   return new Promise(resolve=>release=resolve);
  }
 });
 const notes=vm.runInContext(fs.readFileSync(file,'utf8')+'\nNoteCapture;',context);
 notes.refresh=()=>{};notes.setRecordings('appt-notes',[{id:'SYNTHETIC-audio',dataUrl:'data:audio/webm;base64,QUJD'}]);
 const draft=vm.runInContext(fs.readFileSync('js/services/visit-draft.js','utf8')+'\nVisitDraft;',context);
 const pending=notes.transcribe('appt-notes','SYNTHETIC-audio');await drain();
 if(phase==='success'){
  await pending;assert.equal(field.value,'SYNTHETIC original context\n\nSYNTHETIC transcript');assert.equal(timers.size,0);assert.equal(requests[0].options.signal.aborted,false);return;
 }
 assert.equal(timers.size,1,'A stalled transcription must have a bounded client deadline');
 assert.equal([...timers.values()][0].ms,75_000);assert.equal(draft.busy(),true);
 [...timers.values()][0].fn();await pending;
 assert.equal(draft.busy(),false,'Timeout releases the New Visit navigation/save lock');
 assert.equal(notes.getRecordings('appt-notes').length,1);assert.equal(field.value,'SYNTHETIC original context');
 assert(requests.every(request=>request.options.signal.aborted));assert.equal(timers.size,0);
 assert(messages.some(text=>/timed out/i.test(text)));assert.equal(requests.length,phase==='retry'?2:1,'Timeout must not automatically retry');
 // Fetch/body/credential implementations may resolve despite abort. Their late
 // completion must not append text, mutate credentials or make another call.
 release(phase==='credential'?'SYNTHETIC-late':phase==='body'?{ok:true,text:'SYNTHETIC late'}:{status:200,ok:true,json:async()=>({ok:true,text:'SYNTHETIC late'})});await drain();
 assert.equal(field.value,'SYNTHETIC original context');assert.equal(requests.length,phase==='retry'?2:1);
 if(phase==='credential'){assert.equal(CONFIG.ai.secret,'SYNTHETIC-old');assert.equal(session.size,0);}
 assert.equal(notes.getRecordings('appt-notes')[0].transcript,undefined);
 // An explicit retry by the adviser remains possible with the same audio.
 context.fetch=async()=>({status:200,ok:true,json:async()=>({ok:true,text:'SYNTHETIC manual retry'})});
 await notes.transcribe('appt-notes','SYNTHETIC-audio');assert.equal(field.value,'SYNTHETIC original context\n\nSYNTHETIC manual retry');assert.equal(draft.busy(),false);assert.equal(timers.size,0);
}
(async()=>{for(const file of ['js/services/note-capture.js','js/services/note-capture.min.js']){
 for(const phase of ['fetch','body','credential','retry','success'])await run(file,phase);
 console.log('PASS '+file+': bounded full-operation deadline, hanging fetch/body/credential/auth retry, late-result isolation, retained audio/text, released draft lock and explicit retry');
}})().catch(error=>{console.error(error);process.exitCode=1;});
