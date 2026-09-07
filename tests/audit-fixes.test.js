'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

(async () => {
  const values = new Map();
  const s = { console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, Map,
    localStorage: { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) },
    navigator: { geolocation: { clearWatch() {}, watchPosition() { return 1; } } },
    Toast: { show() {} }, CONFIG: { distanceUnit: 'miles' }, App: {},
    encryptField: async value => ({ ct: Buffer.from(value).toString('base64'), iv: 'test' }),
    decryptField: async value => Buffer.from(value.ct, 'base64').toString(),
    document: { getElementById() { return null; } }, window: {} };
  vm.createContext(s);
  const geo = vm.runInContext(read('js/core/geo.js') + ';Geo;', s);
  geo.renderTripBanner = geo.removeTripBanner = geo.updateTripBanner = () => {};
  geo.getDrivingDistanceKm = async () => { throw new Error('offline'); };
  const trip = { id: 'trip-retry', startTime: new Date().toISOString(), path: [{lat:51,lng:0}], lastPos:{lat:51.1,lng:0}, destinationAddress:'Private address', distanceKm:3, appointmentId:1 };
  geo.activeTrip = trip;
  assert.equal(await geo.persistActiveTrip(), true);
  assert.ok(!values.get('advisoros_active_trip').includes('Private address'));
  s.DB = { completeTrackedTrip: async () => { throw new Error('quota failure'); } };
  assert.equal(await geo.finishTrip(), null);
  assert.equal(geo.activeTrip.id, trip.id);
  assert.equal(geo.activeTrip.saveFailed, true);
  assert.equal(geo.finishingTrip, false);
  geo.activeTrip = null;
  await geo.restoreActiveTrip();
  assert.equal(geo.activeTrip.destinationAddress, 'Private address');
  let saved = 0;
  s.DB.completeTrackedTrip = async data => { saved++; assert.equal(data.operationId, trip.id); };
  assert.equal(await geo.finishTrip(), 3);
  assert.equal(saved, 1);
  assert.equal(geo.activeTrip, null);
  assert.equal(values.has('advisoros_active_trip'), false);
  geo.activeTrip = trip;
  const pending = geo.persistActiveTrip();
  geo.clearPersistedTrip();
  await pending;
  assert.equal(values.has('advisoros_active_trip'), false, 'late encryption must not resurrect cleared trip');
  values.set('advisoros_active_trip', JSON.stringify(trip));
  await geo.restoreActiveTrip();
  assert.equal(JSON.parse(values.get('advisoros_active_trip')).version, 1, 'legacy draft migrates');

  const scheduler = vm.runInContext(read('js/services/message-scheduler.js') + ';MessageScheduler;', s);
  s.Geo = geo;
  geo.getCurrentPosition = async () => ({lat:52,lng:-1,timestamp:Date.now(),accuracy:20});
  geo.getDrivingRouteSummary = async (lat,lng,toLat,toLng) => {
    assert.deepEqual([lat,lng,toLat,toLng],[52,-1,53,-2]);
    return {source:'road', durationMin:18, distanceKm:12};
  };
  assert.equal((await scheduler.getLiveEta({latLng:[53,-2]})).etaMin, 18);
  geo.getDrivingRouteSummary = async () => ({source:'estimate',durationMin:12});
  assert.equal(await scheduler.getLiveEta({latLng:[53,-2]}), null);
  const intervals = [];
  s.setInterval = fn => { const timer = { fn, cleared:false }; intervals.push(timer); return timer; };
  s.clearInterval = timer => { timer.cleared = true; };
  s.CONFIG.autoMessages = {enabled:true};
  scheduler.startDelayChecker(1);
  scheduler.startDelayChecker(1);
  assert.equal(intervals[0].cleared, true, 'restart clears previous timer');
  s.DB.getAppointment = async () => ({id:1, status:'completed'});
  await intervals[1].fn();
  assert.equal(intervals[1].cleared, true, 'completed visit stops monitoring');
  assert.equal(scheduler.delayTimer, null);
  geo.getCurrentPosition = async () => ({lat:52,lng:-1,timestamp:Date.now()-120000});
  assert.equal(await scheduler.getLiveEta({latLng:[53,-2]}), null);
  for (const method of ['_clearTimers', '_daysFromNowUK', '_msUntilUKTime', 'onDeparture']) {
    assert.equal((read('js/services/message-scheduler.js').match(new RegExp('^  (?:async )?' + method + '\\(', 'gm')) || []).length, 1);
  }
  const scripts = [];
  s.document = { addEventListener() {}, createElement: () => ({dataset:{}, remove(){}}), head:{appendChild: node => scripts.push(node)} };
  const app = vm.runInContext(read('js/core/app.js') + ';App;', s);
  let ready = 0;
  const first = app.loadScripts(['test.js']).then(() => ready++);
  const second = app.loadScripts(['test.js']).then(() => ready++);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(scripts.length, 1);
  assert.equal(ready, 0);
  scripts[0].onload();
  await Promise.all([first, second]);
  assert.equal(ready, 2);
  const failure = app.loadScripts(['retry.js']);
  await Promise.resolve(); await Promise.resolve();
  scripts[1].onerror();
  await assert.rejects(failure);
  const retry = app.loadScripts(['retry.js']);
  await Promise.resolve(); await Promise.resolve();
  scripts[2].onload(); await retry;
  console.log('PASS: trip failure/recovery/migration, cancelled persistence, real GPS ETA, duplicate methods, concurrent script loading and retry');
})().catch(error => { console.error(error); process.exitCode = 1; });
