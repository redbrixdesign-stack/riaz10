'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const suffix of ['.js','.min.js']){
 const c={console,CONFIG:{},Utils:{escapeHtml:s=>String(s).replaceAll("'",'&#39;'),formatCurrency:n=>'£'+n,formatDate:String},App:{registerFeature(){},renderTopHeader:()=>'',openModal(html){c.modal=html;}},Toast:{show(){}},CommunicationService:{collectionResponsibility:o=>o.paymentResponsibility||'unknown'}};vm.createContext(c);
 vm.runInContext(fs.readFileSync('js/features/control/control'+suffix,'utf8')+'\nthis.Control=ControlFeature;',c);
 c.DB={getSetting:async()=>true,getAllCustomers:async()=>{throw Error('Tools must not query/delete customers based on a demo flag');},deleteCustomer:()=>{throw Error('No deletion');}};
 const html=await c.Control.render();assert.equal((html.match(/class="control-tile"/g)||[]).length,17);for(const text of ['Find Customer','Scan Document','Integrations','Remove Demo Data','Export Backup'])assert(!html.includes('>'+text+'<'));assert(html.includes('Backup &amp; restore')||html.includes('Backup & restore'));assert.equal(typeof c.Control.clearPitchDemo,'undefined');assert.equal(typeof c.Control.at,'undefined');assert.equal(typeof c.Control.openMeasurePicker,'function','Deep-link measurement fallback remains functional');
 vm.runInContext(fs.readFileSync('js/features/profitability/profitability'+suffix,'utf8')+'\nthis.Costing=ProfitabilityFeature;',c);
 let calls=0;const order={id:1,total:1000,createdAt:'2026-11-01',paymentResponsibility:'external'};let policy=null;
 c.DB={getJob:async()=>({id:1,orderId:1}),getJobCosts:async()=>[{amount:20,category:'materials',description:'SYNTHETIC cost'}],db:{orders:{get:async()=>order}},getEffectiveFinancialPolicy:async()=>policy,calculateJobProfitability:async()=>{calls++;return {revenue:100,directCost:20,grossProfit:80,marginPercent:80,effectiveHourlyValue:null,financialMode:'commission_advisor',basis:'actual_job_costs'};}};
 await c.Costing.openJob(1);assert.equal(calls,0);assert.match(c.modal,/Job costing needs review/);assert(!c.modal.includes('Costing revenue'));
 policy={mode:'sole_trader'};await c.Costing.openJob(1);assert.equal(calls,0,'Company order total is not own-business revenue');
 policy={mode:'commission_advisor'};await c.Costing.openJob(1);assert.equal(calls,1);assert.match(c.modal,/Job costing estimate/);
 order.paymentResponsibility='unknown';await c.Costing.openJob(1);assert.equal(calls,1,'Unknown responsibility must be reviewed');
 order.paymentResponsibility='advisor';policy={mode:'sole_trader'};await c.Costing.openJob(1);assert.equal(calls,2,'Own business plus explicit dated policy retains costing');
 console.log('PASS '+suffix+': 17 purposeful tool entries, safe recovery route, no phone-based demo deletion or unused date helper, measurement deep link retained; company/unknown/no-policy costing guarded and explicit own/commission basis retained');
}})().catch(e=>{console.error(e);process.exitCode=1});
