'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(file){
 let now=Date.parse('2026-10-23T08:50:00Z'),current=null,appointment={id:8,date:'2026-10-23T09:00:00Z',status:'confirmed',clientName:'SYNTHETIC'};
 const stored=new Map(),timers=new Map(),notifications=[],events={};let serial=0,opens=0,closes=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 function Notification(title){notifications.push(title);}Notification.permission='granted';
 const App={modalStack:[],openModal(content){opens++;const token=content.match(/data-visit-reminder-owner="([^"]+)"/)[1];current={token,content,heading:{textContent:''},querySelector(){return this.heading;}};},closeModal(){closes++;current=null;}};
 const DB={db:{},async getAppointment(){return appointment;},async getUpcomingAppointments(){return [];}};
 const document={visibilityState:'visible',addEventListener:(event,fn)=>{events[event]=fn;},querySelector(selector){
  if(selector==='#modal-overlay.active, #modal-full.active')return current;
  const token=selector.match(/data-visit-reminder-owner="([^"]+)"/)?.[1];return token&&current?.token===token?current:null;
 }};
 const sandbox={console,Date:Clock,window:{Notification},Notification,navigator:{},document,App,DB,Utils:{formatTimeUK:()=> '10:00',escapeHtml:String},
  localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox);
 const service=vm.runInContext('NotificationService',sandbox);
 return {service,App,DB,stored,timers,notifications,events,async fire(){await service._fireVisitReminder(8,service._visitReminderKey(appointment));},
  get current(){return current;},set current(value){current=value;},get appointment(){return appointment;},set appointment(value){appointment=value;},
  get now(){return now;},set now(value){now=value;},get opens(){return opens;},get closes(){return closes;}};
}
(async()=>{for(const file of ['js/services/notification.js','js/services/notification.min.js']){
 let f=fixture(file);await f.fire();assert.equal(f.opens,1);assert.equal(f.timers.size,1);
 f.now+=2*60000;await [...f.timers.values()][0].fn();assert.equal(f.current.heading.textContent,'Next appointment in 8 minutes');assert.equal(f.notifications.length,1);
 f.now=Date.parse(f.appointment.date)+15*60000+1;await [...f.timers.values()].at(-1).fn();assert.equal(f.closes,1);assert.equal(f.service._openVisitReminder,null);assert.equal(f.timers.size,0);
 for(const change of [{status:'completed'},{status:'cancelled'},{outcome:'completed'},{date:'2026-10-24T09:00:00Z'},{date:'invalid'},null]){
  f=fixture(file);await f.fire();f.appointment=change?{...f.appointment,...change}:null;await f.service._refreshOpenVisitReminder();assert.equal(f.closes,1,'Booking change retires own sheet');
 }
 f=fixture(file);const editor={draft:'UNSAVED synthetic context'};f.current=editor;await f.fire();assert.equal(f.opens,0);assert.equal(f.current,editor);assert.equal(f.notifications.length,1,'Existing OS notification path retained');
 f=fixture(file);await f.fire();const reminder={content:f.current.content},other={content:'<input value="UNSAVED other snapshot">'};f.App.modalStack=[reminder,other];f.current=editor;f.now+=30*60000;
 await f.service._refreshOpenVisitReminder();assert.equal(f.current,editor);assert.equal(f.closes,0);assert.equal(f.App.modalStack.length,1);assert.equal(f.App.modalStack[0],other);
 f=fixture(file);await f.fire();f.current=null;await f.service._refreshOpenVisitReminder();assert.equal(f.service._openVisitReminder,null);assert.equal(f.timers.size,0);assert.equal(f.closes,0);
 f=fixture(file);await f.fire();f.DB.getAppointment=async()=>{throw Error('Synthetic read failure');};await f.service._refreshOpenVisitReminder();assert.equal(f.closes,0);assert.equal(f.timers.size,1);f.now+=30*60000;await [...f.timers.values()].at(-1).fn();assert.equal(f.closes,1);
 f=fixture(file);await f.fire();let releaseStall,reads=0;f.DB.getAppointment=()=>{reads++;return new Promise(resolve=>{releaseStall=resolve;});};const stalled=f.service._refreshOpenVisitReminder();await [...f.timers.values()].at(-1).fn();assert.equal(reads,1,'Pending read is not duplicated');f.now+=30*60000;await [...f.timers.values()].at(-1).fn();assert.equal(f.closes,1,'Deadline retires sheet before stalled read resolves');assert.equal(f.timers.size,0);releaseStall(f.appointment);await stalled;assert.equal(f.closes,1);
 f=fixture(file);await f.fire();let resolve;f.DB.getAppointment=()=>new Promise(r=>{resolve=r;});const pending=f.service._refreshOpenVisitReminder();f.App.modalStack=[{content:f.current.content}];f.current=editor;resolve({...f.appointment,status:'cancelled'});await pending;assert.equal(f.current,editor);assert.equal(f.closes,0);assert.equal(f.App.modalStack.length,0);
 f=fixture(file);await f.fire();let resolveOld;f.DB.getAppointment=()=>new Promise(r=>{resolveOld=r;});const oldRead=f.service._refreshOpenVisitReminder();const replacement={token:'replacement',key:'another booking',visitAt:f.now+600000};f.service._openVisitReminder=replacement;f.current={token:'replacement'};resolveOld(null);await oldRead;assert.equal(f.service._openVisitReminder,replacement);assert.equal(f.current.token,'replacement');assert.equal(f.closes,0,'Stale async read cannot retire a new owner');
 f=fixture(file);await f.fire();await f.service.setVisitReminderEnabled(false);assert.equal(f.closes,1);assert.equal(f.timers.size,0);
 console.log('PASS '+file+': timed expiry/countdown, booking changes, editor/stack ownership, dismissal, read failure, async form race and disabling');
}})().catch(error=>{console.error(error);process.exitCode=1;});
