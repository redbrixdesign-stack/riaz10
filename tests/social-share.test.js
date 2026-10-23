'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{for(const file of ['js/features/social/social.js','js/features/social/social.min.js']){
 const nodes={'social-consent':{checked:true},'social-privacy':{checked:true},'social-product':{value:'SYNTHETIC roller'},'social-results':{innerHTML:'',scrollIntoView(){}},'social-draft-warm':{value:'SYNTHETIC caption'},'social-hashtags':{value:'#Synthetic'},'social-media-preview':{innerHTML:'',textContent:''}};
 const updates=[],shares=[],copies=[],toasts=[];let storageFails=false;
 const s={console,Date,Math,App:{registerFeature(){},navigate(){},renderTopHeader:()=>''},DB:{getAppointment:async id=>({id,type:'fitting',...(updates.filter(row=>row.id===id).at(-1)?.fields||{})}),updateAppointment:async(id,fields)=>{if(storageFails)throw Error('SYNTHETIC disk failure');updates.push({id,fields});}},document:{getElementById:id=>nodes[id]},Utils:{escapeHtml:String},Toast:{show:(message,type)=>toasts.push({message,type})},navigator:{canShare:()=>true,share:async data=>shares.push(data),clipboard:{writeText:async text=>copies.push(text)}},AIService:{isEnabled:()=>false}};
 vm.createContext(s);const f=vm.runInContext(fs.readFileSync(file,'utf8')+'\nSocialFeature;',s);
 const image={name:'SYNTHETIC one.png',type:'image/png',size:100},video={name:'SYNTHETIC two.mp4',type:'video/mp4',size:100};
 await f.render({appointmentId:7});f.mediaFile=image;await f.generate();await f.share('warm');assert.equal(shares.length,1);assert.equal(shares[0].files[0],image);assert.equal(updates[0].id,7);
 nodes['social-consent'].checked=false;await f.share('warm');assert.equal(shares.length,1);assert.equal(copies.length,0);
 nodes['social-consent'].checked=true;nodes['social-privacy'].checked=false;await f.share('warm');assert.equal(shares.length,1);
 f.selectMedia({target:{files:[video],value:'selected'}});assert.equal(nodes['social-consent'].checked,false);assert.equal(nodes['social-privacy'].checked,false);
 nodes['social-consent'].checked=true;nodes['social-privacy'].checked=true;await f.share('warm');assert.equal(shares.length,1,'New media needs a fresh saved approval');
 await f.generate();await f.share('warm');assert.equal(shares.length,2);assert.equal(shares[1].files[0],video);
 s.navigator.canShare=()=>false;await f.share('warm');assert.equal(copies.length,1);assert.equal(shares.length,2);
 s.navigator.canShare=()=>true;s.navigator.share=async()=>{throw Object.assign(Error('SYNTHETIC cancelled'),{name:'AbortError'});};await f.share('warm');assert.equal(copies.length,1,'Share cancellation must not copy/fallback');
 storageFails=true;await f.withdrawConsent();nodes['social-consent'].checked=true;nodes['social-privacy'].checked=true;await f.share('warm');assert.equal(copies.length,1);assert(!f._shareApproval,'Failed withdrawal still blocks local sharing');
 storageFails=false;await f.withdrawConsent();assert.equal(updates.at(-1).fields.socialDrafts,null);
 // An old AI result cannot save permission for changed media/fitting.
 await f.render({appointmentId:8});f.mediaFile=image;nodes['social-consent'].checked=true;nodes['social-privacy'].checked=true;
 let resolveAI;s.AIService.isEnabled=()=>true;s.AIService.createSocialPosts=()=>new Promise(resolve=>resolveAI=resolve);
 const before=updates.length;const generating=f.generate();f.selectMedia({target:{files:[video],value:''}});resolveAI({ok:true,drafts:{warm:'STALE'}});await generating;assert.equal(updates.length,before);assert(!f._shareApproval);
 // A failed save cannot produce an approved shareable draft or success toast.
 s.AIService.isEnabled=()=>false;storageFails=true;nodes['social-consent'].checked=true;nodes['social-privacy'].checked=true;toasts.length=0;await f.generate();assert(!f._shareApproval);assert(!toasts.some(t=>t.type==='success'));
 f.selectMedia({target:{files:[{type:'text/plain',size:1}],value:''}});assert.equal(f.mediaFile,null);assert(!nodes['social-consent'].checked);
 storageFails=false;f.mediaFile=image;nodes['social-consent'].checked=true;nodes['social-privacy'].checked=true;s.DB.getAppointment=async()=>null;await f.generate();assert(!f._shareApproval,'A deleted fitting cannot acquire approval through a silent zero-row update');
 console.log('PASS '+file+': live checks, photo/video identity, replacement, stale AI, save/withdraw failure, cancel and manual fallback; no publication');
}})().catch(e=>{console.error(e);process.exitCode=1;});
