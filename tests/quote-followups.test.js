'use strict';
const fs=require('fs'),path=require('path');
global.document={getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}};
global.App={registerFeature(f){global.FollowupsFeature=f;},renderTopHeader(){return'';}};
global.CONFIG={followups:{paymentReminderDays:3}};
global.Utils={
  ukParts(d){const x=new Date(d);return{year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()};},
  daysBetween(a,b){return Math.round((Date.UTC(new Date(a).getUTCFullYear(),new Date(a).getUTCMonth(),new Date(a).getUTCDate())-Date.UTC(new Date(b).getUTCFullYear(),new Date(b).getUTCMonth(),new Date(b).getUTCDate()))/86400000);},
  formatDate:v=>new Date(v).toISOString().slice(0,10),formatTime:()=>'',getTomorrow:()=>new Date(Date.now()+86400000),escapeHtml:String,formatCurrency:n=>`£${n}`
};
global.TalkFeature={getTemplateForOutcome:()=>null,SERVICE_OUTCOMES:{},apptTimeText:()=>''};
const day=n=>new Date(Date.now()+n*86400000).toISOString();
global.DB={
  getQuotes:async()=>[
    {id:1,customerId:9,appointmentId:10,quoteNumber:'LINKED',status:'issued',issueDate:day(-10),expiryDate:day(2)},
    {id:2,customerId:9,quoteNumber:'EXP',status:'issued',issueDate:day(-2),expiryDate:day(2)},
    {id:3,customerId:9,quoteNumber:'ISS',status:'issued',issueDate:day(-5),expiryDate:day(20)},
    {id:4,customerId:9,quoteNumber:'ACC',status:'accepted',acceptedAt:day(-1),convertedOrderId:null},
    {id:5,customerId:9,quoteNumber:'DONE',status:'accepted',convertedOrderId:44}
  ],
  getCustomersByIds:async()=>[{id:9,firstName:'Alice'}]
};
(0,eval)(fs.readFileSync(path.join(__dirname,'..','js/features/followups/followups.js'),'utf8'));
const ok=(n,c,d)=>{if(!c){console.error('FAIL:',n,d||'');process.exitCode=1}else console.log('OK:',n)};
(async()=>{
 const existing=[{kind:'quote',appointment:{id:10}}];
 const tasks=await FollowupsFeature.loadStructuredQuoteTasks(existing);
 ok('linked appointment quote does not duplicate existing derived chase',!tasks.some(t=>t.quote.id===1));
 ok('unlinked quote near expiry creates attention',tasks.some(t=>t.kind==='quote_expiring'&&t.quote.id===2));
 ok('older issued unlinked quote creates one follow-up',tasks.filter(t=>t.quote.id===3&&t.kind==='structured_quote').length===1);
 ok('accepted unconverted quote requests conversion',tasks.some(t=>t.kind==='quote_accepted'&&t.quote.id===4));
 ok('converted accepted quote creates no task',!tasks.some(t=>t.quote.id===5));
 ok('structured quote task links customer',tasks.every(t=>t.customer?.id===9));
})();
