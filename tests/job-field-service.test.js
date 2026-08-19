'use strict';
const fs=require('fs'),path=require('path');
global.Utils={escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
const calls=[];
global.DB={
 getJob:async id=>({id,status:'on_site',appointmentId:8}),
 getChecklistForJob:async()=>({items:[{id:1,label:'Child safety devices',required:true},{id:2,label:'Clean area',required:false}],responses:[{checklistItemId:2,completed:true}]}),
 getJobIssues:async()=>[{id:3,title:'Damaged rail',status:'open',requiresReturnVisit:true}],
 completeJob:async(id,data)=>{calls.push(['complete',id,data]);return{id,stage:'completed'};},
 signOffJob:async(id,data)=>{calls.push(['signoff',id,data]);return{id,stage:'signed_off'};},
 setChecklistResponse:async data=>calls.push(['checklist',data])
};
global.Toast={show(){}};global.App={openModal(){},closeModal(){},navigate(){}};
const code=fs.readFileSync(path.join(__dirname,'..','js/services/job-field-service.js'),'utf8');(0,eval)(`${code}\nglobal.JobFieldService=JobFieldService;`);
const ok=(n,c,d)=>{if(!c){console.error('FAIL:',n,d||'');process.exitCode=1}else console.log('OK:',n)};
(async()=>{
 const ws=await JobFieldService.load(7);
 const assessment=JobFieldService.assess(ws);
 ok('mandatory incomplete checklist blocks normal completion',assessment.blocked&&assessment.mandatoryIncomplete.length===1);
 ok('open issue is included in completion blockers',assessment.openIssues.length===1);
 const html=JobFieldService.render(ws);
 ok('checklist and issue render',html.includes('Child safety devices')&&html.includes('Damaged rail'));
 ok('user content is escaped',!JobFieldService.render({...ws,issues:[{id:9,title:'<script>x</script>',status:'open'}]}).includes('<script>x'));
 ok('completion copy separates payment',html.includes('does not mark the order or balance as paid'));
 await JobFieldService.setChecklistItem(7,1,{target:{checked:true}});
 ok('checklist response is persisted explicitly',calls.some(c=>c[0]==='checklist'&&c[1].completed===true));
 const clear=JobFieldService.assess({checklist:{items:[{id:1,required:true}],responses:[{checklistItemId:1,completed:true}]},issues:[]});
 ok('completed mandatory checklist with no issues is clear',!clear.blocked);
})();
