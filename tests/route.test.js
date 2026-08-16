/* ============================================
   ADVISOROS — ROUTE (TRIPS) FEATURE TESTS
   Run with: node tests/route.test.js

   Exercises RouteFeature.getDayMode() and getActiveRouteLeg() in a stubbed
   environment: the working-day mode must come from the UK wall-clock
   weekday (not the device's), and the "next visit" leg must never be a
   completed stop.
   ============================================ */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

let failures = 0;
function ok(label, cond, extra) {
  if (cond) {
    console.log('  OK ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

// ---- stub browser globals RouteFeature touches at load time ----
let lastUkPartsInput = undefined;
const sandbox = {
  console,
  window: {},
  document: { head: { appendChild() {} }, getElementById() { return null; } },
  L: undefined,
  CONFIG: {
    workingWeek: { salesDays: [1, 2, 4], fittingDays: [3, 5] },
    businessAddress: ''
  },
  Utils: {
    ukParts(date = new Date()) {
      lastUkPartsInput = date;
      return { year: 2026, month: 8, day: 16, hour: 10, minute: 0, second: 0, weekday: 0 };
    },
    getToday() { return new Date('2026-08-16T09:00:00'); },
    formatDistance(km) { return `${Math.round(km * 10) / 10} km`; },
    formatTime(d) { return String(d); },
    formatDate(d) { return String(d); },
    escapeHtml: s => String(s),
    escapeJsString: s => String(s),
    truncate: (s, n) => String(s).slice(0, n)
  },
  Geo: { calculateDistance: () => 1.2 },
  GeoProviderRegistry: { get: () => ({}) },
  TaxCalculator: { calculateMileageClaim: km => Math.round(km * 45) },
  DB: { db: {}, getAppointmentsForDate: async () => [], getPhotosForCustomer: async () => [] },
  Toast: { show() {} },
  App: {
    navigate() {},
    registerFeature(f) { sandbox.App.feature = f; }
  }
};
sandbox.App.feature = null;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, 'js/features/route/route.js'), 'utf8'), sandbox);
const RouteFeature = sandbox.App.feature;

const makeAppt = (id, overrides = {}) => ({
  id, customerId: 1, clientName: 'Test Visit', address: '1 High Street, Manchester M14 7FZ',
  latLng: [53.4, -2.3], date: '2026-08-16T09:00:00.000Z', type: 'consultation',
  status: 'confirmed', outcome: null, ...overrides
});

const makeLeg = (index, toAppt, overrides = {}) => ({
  index,
  from: { type: 'appointment', label: 'Base', address: 'Base', latLng: [53.4, -2.28] },
  to: toAppt ? { type: 'appointment', label: toAppt.clientName, appointment: toAppt, latLng: toAppt.latLng, address: toAppt.address } : { type: 'base', label: 'Base', latLng: [53.4, -2.28], address: 'Base' },
  distanceKm: 3.2, etaMin: 5, appointmentId: toAppt ? toAppt.id : null, isReturn: !toAppt,
  unresolvedPoint: null, implausible: false, ...overrides
});

(async () => {

console.log('getDayMode (UK wall-clock weekday)');
{
  sandbox.Utils.ukParts = date => {
    lastUkPartsInput = date;
    return { weekday: 1 }; // UK Monday
  };
  ok('UK Monday -> sales', RouteFeature.getDayMode(new Date(2026, 7, 16)) === 'sales', RouteFeature.getDayMode(new Date(2026, 7, 16)));
}
{
  sandbox.Utils.ukParts = () => ({ weekday: 3 }); // UK Wednesday
  ok('UK Wednesday -> fitting', RouteFeature.getDayMode(new Date(2026, 7, 18)) === 'fitting', RouteFeature.getDayMode(new Date(2026, 7, 18)));
}
{
  sandbox.Utils.ukParts = () => ({ weekday: 0 }); // UK Sunday
  ok('UK Sunday -> mixed', RouteFeature.getDayMode(new Date(2026, 7, 16)) === 'mixed', RouteFeature.getDayMode(new Date(2026, 7, 16)));
}
{
  // The device-local weekday must never be consulted — the fix routes the
  // day through ukParts. A device reading a UK-Monday instant as Sunday
  // (UTC-11) would otherwise get "mixed" instead of "sales".
  sandbox.Utils.ukParts = date => {
    lastUkPartsInput = date;
    return { weekday: 1 };
  };
  RouteFeature.getDayMode(new Date(2026, 7, 16));
  ok('getDayMode passes the date into ukParts', typeof lastUkPartsInput !== 'undefined' && lastUkPartsInput.getTime() === new Date(2026, 7, 16).getTime(), lastUkPartsInput);
}
{
  // No workingWeek config -> documented defaults.
  sandbox.Utils.ukParts = () => ({ weekday: 2 });
  const saved = sandbox.CONFIG.workingWeek;
  sandbox.CONFIG.workingWeek = undefined;
  ok('default salesDays (Tue=2) apply without config', RouteFeature.getDayMode(new Date(2026, 7, 18)) === 'sales', RouteFeature.getDayMode(new Date(2026, 7, 18)));
  sandbox.CONFIG.workingWeek = saved;
}

console.log('getActiveRouteLeg (never a completed stop as "next")');
{
  const pending = makeAppt(1, { status: 'confirmed' });
  const done = makeAppt(2, { status: 'completed', outcome: 'ordered' });
  const legs = [makeLeg(0, done), makeLeg(1, pending), makeLeg(2, null)];
  ok('pending visit leg is the active leg', RouteFeature.getActiveRouteLeg(legs).index === 1, RouteFeature.getActiveRouteLeg(legs));
}
{
  const done1 = makeAppt(1, { status: 'completed', outcome: 'ordered' });
  const done2 = makeAppt(2, { status: 'completed', outcome: 'quoted' });
  const legs = [makeLeg(0, done1), makeLeg(1, done2), makeLeg(2, null)];
  ok('all completed with a return leg -> return leg (no next visit)', RouteFeature.getActiveRouteLeg(legs).isReturn === true, RouteFeature.getActiveRouteLeg(legs));
}
{
  // No base configured (no return leg): every stop done -> null, not the
  // last stop re-labelled as "next".
  const done1 = makeAppt(1, { status: 'completed', outcome: 'ordered' });
  const done2 = makeAppt(2, { status: 'completed', outcome: 'quoted' });
  const legs = [makeLeg(0, done1), makeLeg(1, done2)];
  ok('all completed without a base -> null (day is over)', RouteFeature.getActiveRouteLeg(legs) === null, RouteFeature.getActiveRouteLeg(legs));
}
{
  const pending = makeAppt(1, { status: 'confirmed' });
  const legs = [makeLeg(0, pending)];
  ok('single pending stop is the active leg', RouteFeature.getActiveRouteLeg(legs).index === 0, RouteFeature.getActiveRouteLeg(legs));
}
{
  ok('empty legs -> null', RouteFeature.getActiveRouteLeg([]) === null);
}

console.log('getAreaLabel');
{
  ok('postcode outward code used as area', RouteFeature.getAreaLabel({ address: '1 High Street, Manchester M14 7FZ' }) === 'M14', RouteFeature.getAreaLabel({ address: '1 High Street, Manchester M14 7FZ' }));
  ok('penultimate comma part used without postcode', RouteFeature.getAreaLabel({ address: '1 High Street, Didsbury, Manchester' }) === 'Didsbury', RouteFeature.getAreaLabel({ address: '1 High Street, Didsbury, Manchester' }));
  ok('no address -> Area unknown', RouteFeature.getAreaLabel({ address: '' }) === 'Area unknown', RouteFeature.getAreaLabel({ address: '' }));
}

})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); })
  .finally(() => process.exit(failures ? 1 : 0));