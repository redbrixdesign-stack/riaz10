'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{for(const suffix of ['.js','.min.js']){
 const RealDate=Date;class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-09T12:00:00Z']));}static now(){return RealDate.parse('2026-11-09T12:00:00Z');}}
 const c={console,Date:FixedDate};vm.createContext(c);vm.runInContext(fs.readFileSync('js/core/config'+suffix,'utf8')+'\n'+fs.readFileSync('js/core/utils'+suffix,'utf8')+'\n'+fs.readFileSync('js/core/tax'+suffix,'utf8')+'\n'+fs.readFileSync('js/features/today/home-workspace'+suffix,'utf8')+'\nthis.Tax=TaxCalculator;this.Home=HomeWorkspace;this.config=CONFIG;this.u=Utils;',c);
 const {Tax,Home,config,u}=c,day=u.formatDate(u.getToday(),'iso');
 const expenses=[['fuel',50],['vehicle_insurance',15],['tools',100],['business_insurance',30],['parking',5],['public_transport',20],['insurance',40],['other',10]].map(([category,amount])=>({category,amount,date:day+'T08:00:00Z'}));
 const trips=[{date:day+'T08:00:00Z',distanceKm:10/.621371,confirmed:true,purpose:'business'},{date:day,distanceKm:9999,confirmed:true,purpose:'private'},{date:day,distanceKm:9999,confirmed:false,purpose:'business'}];
 const baseline=JSON.stringify({expenses,trips});c.DB={db:{appointments:{where:()=>({between:()=>({and:()=>({toArray:async()=>[{outcome:'ordered',commission:1000}]})})})}},getExpensesForPeriod:async()=>expenses,getTripsForPeriod:async()=>trips,getWeekStats:async()=>({earnings:1000})};
 const b=Tax.expenseBreakdown(expenses);assert.deepEqual(JSON.parse(JSON.stringify(b)),{cash:270,deductible:155,mileageCovered:65,review:50,reviewCount:2});
 const a=await Tax.calculateFromData('2026-04-06T00:00:00Z','2027-04-06T00:00:00Z');assert.equal(a.totalExpenses,270);assert.equal(a.deductibleExpenses,155);assert(Math.abs(a.mileageClaim-5.5)<1e-8);assert(Math.abs(a.totalDeductible-160.5)<1e-8);assert.equal(a.reviewExpenses,50);
 c.DB.getExpensesForPeriod=async()=>[{category:'fuel',amount:50,date:day}];const oldBug=await Tax.calculateFromData('2026-04-06','2027-04-06');assert.equal(oldBug.totalExpenses,50);assert(Math.abs(oldBug.totalDeductible-5.5)<1e-8,'Fuel does not duplicate mileage deduction');
 c.DB.getExpensesForPeriod=async()=>expenses;const w=await Home.weekMoney();assert.equal(w.expenses,270);assert.equal(w.reviewExpenses,50);assert(Math.abs(w.mileage-5.5)<1e-8);assert(Math.abs(w.net-(1000-270-w.reserve))<1e-8,'Cash only deducted once; mileage is not cash');
 assert(Math.abs(Tax.calculateMileageClaim(10000/.621371,'2025-04-06')-4500)<1e-8);assert(Math.abs(Tax.calculateMileageClaim(10001/.621371,'2026-04-06')-5500.25)<1e-8);
 c.DB.getTripsForPeriod=async()=>[{date:'2026-07-01',purpose:'business',confirmed:true,distanceKm:10000/.621371},{date:'2026-11-09T08:00:00Z',purpose:'business',confirmed:true,distanceKm:10/.621371}];assert(Math.abs(await Tax.calculatePeriodMileage('2026-11-09','2026-11-10')-2.5)<1e-8,'Period uses previous annual mileage before applying the lower band');
 assert.equal(JSON.stringify({expenses,trips}),baseline,'Calculations never rewrite records');
 config.commission={mode:'manual',type:'percentage',rate:99};assert.equal(Tax.estimateCommission(1000),0);assert.equal(Tax.estimateSurveyCommission(1000),0);assert.equal(Tax.getEffectiveCommissionRate(),0);assert.equal(Tax.getRequiredWeeklySales(1000),0);
 config.commission={mode:'simple',simpleRate:12};assert.equal(Tax.estimateCommission(1000),120);assert.equal(Tax.estimateSurveyCommission(1000),100);
 config.commission={mode:'two_stage',saleReductionRate:20,netCommissionRate:15.25};assert.equal(Tax.estimateCommission(1000),122);assert.equal(Tax.estimateSurveyCommission(1000),106);
 console.log('PASS '+suffix+': cash/deduction separation, vehicle/typed insurance/review categories, private/unconfirmed mileage exclusion, Home/Money parity, 2025/26 and 2026/27 bands, immutable records, explicit commission');
}})().catch(e=>{console.error(e);process.exitCode=1});
