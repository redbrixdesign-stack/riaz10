'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function verify(file) {
  let now = Date.parse('2026-10-23T08:45:00Z');
  const at = Date.parse('2026-10-23T09:00:00Z');
  let appointment = {id:71, date:new Date(at).toISOString(), status:'confirmed', clientName:'SYNTHETIC Reminder'};
  const stored = new Map(), notifications = [], modals = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  function FakeNotification(title, options) { notifications.push({title, options}); }
  FakeNotification.permission = 'granted';
  const db = {db:{}, async getAppointment() { return appointment; }};
  const sandbox = {console, Date:Clock, window:{Notification:FakeNotification}, Notification:FakeNotification, navigator:{},
    document:{visibilityState:'visible', addEventListener(){}},
    localStorage:{getItem:key=>stored.get(key)??null, setItem:(key,value)=>stored.set(key,String(value))},
    setTimeout(){return 1;}, clearTimeout(){}, DB:db,
    Utils:{formatTimeUK:()=> '10:00', escapeHtml:value=>String(value)}, App:{openModal:html=>modals.push(html)}};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox);
  const service = vm.runInContext('NotificationService',sandbox);
  const key = service._visitReminderKey(appointment);
  const reset = () => {stored.clear(); notifications.length=0; modals.length=0; now=at-15*60000;};
  const fire = () => service._fireVisitReminder(71,key);
  const noAlerts = label => {assert.equal(notifications.length,0,label+' notification'); assert.equal(modals.length,0,label+' modal'); assert.equal(stored.has('advisoros_visit_reminders_delivered'),false,label+' not consumed');};

  now = at+16*60000;
  await fire(); noAlerts('Suspended timer expired');
  reset(); now = at-16*60000;
  await fire(); noAlerts('Premature callback');
  reset(); stored.set('advisoros_visit_reminders_enabled','false');
  await fire(); noAlerts('Disabled callback');
  reset(); db.db = null;
  await fire(); noAlerts('Database unavailable'); db.db = {};
  reset(); appointment.date='invalid';
  await service._fireVisitReminder(71,service._visitReminderKey(appointment)); noAlerts('Invalid date'); appointment.date=new Date(at).toISOString();
  reset(); await Promise.all([fire(),fire()]);
  assert.equal(notifications.length,1,'Concurrent/replayed callback delivers once'); assert.equal(modals.length,1);
  await fire(); assert.equal(notifications.length,1,'Delivered callback remains quiet');
  reset(); now=at+15*60000;
  await fire(); assert.equal(notifications.length,1,'Existing final grace boundary retained');
  reset(); appointment.date = new Date(at+3600000).toISOString();
  await fire(); noAlerts('Rescheduled booking rejects old key'); appointment.date=new Date(at).toISOString();
  reset(); let release;
  db.getAppointment = () => new Promise(resolve=>{release=resolve;});
  const pending = fire(); stored.set('advisoros_visit_reminders_enabled','false'); release(appointment);
  await pending; noAlerts('Disabled while database read pending');
  reset(); const pendingExpiry = fire(); now=at+16*60000; release(appointment);
  await pendingExpiry; noAlerts('Expired while database read pending');
  console.log('PASS '+file+': late/early/disabled/unavailable/invalid/replayed/rescheduled/async expiry guards and valid grace boundary');
}
(async()=>{for(const file of ['js/services/notification.js','js/services/notification.min.js'])await verify(file);})().catch(error=>{console.error(error);process.exitCode=1;});
