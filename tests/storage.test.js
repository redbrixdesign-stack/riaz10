/* ============================================
   ADVISOROS — STORAGE LAYER TESTS
   Run with: npm test   (node tests/storage.test.js)

   Covers three things:
   1. Parity between the real Dexie engine (js/vendor/dexie.min.js) and the
      bundled fallback shim (js/vendor/minidexie.js) — identical operations
      must behave identically.
   2. The real db.js boot path (schema, legacy migration, sequences, all
      DB.* operations) running on real Dexie.
   3. The same db.js boot path running on the shim — this is what happens
      in the browser if dexie.min.js ever fails to load.

   All of it runs in-memory via fake-indexeddb; nothing touches disk.
   ============================================ */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');

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

// ---------- sandbox helpers ----------

function makeLocalStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

function baseSandbox(extra) {
  const sandbox = {
    indexedDB,
    IDBKeyRange,
    localStorage: makeLocalStorage(),
    console, Math, JSON, Date, Promise, Map, Set, Array, Object,
    Number, String, Boolean, RegExp, Error, parseInt, parseFloat,
    isNaN, isFinite, setTimeout, clearTimeout,
    App: { calculateDeposit: total => ({ amount: Math.round(total * 0.2) }) },
    TaxCalculator: { estimateCommission: value => Math.round(value * 0.1) },
    window: {},
    // Safe JSON.parse wrapper for corrupted stored data
    safeJSONParse(str, key) {
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch (e) {
        const preview = str.slice(0, 500);
        console.error(`JSON.parse failed for localStorage key "${key}":`, e.message);
        console.error(`Corrupted value preview: ${preview}`);
        throw e;
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  return sandbox;
}

function loadShim(sandbox) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/vendor/minidexie.js'), 'utf8'), sandbox);
  return sandbox.Dexie;
}

function loadDbJs(sandbox, dbName) {
  // db.js hardcodes 'advisoros_v6'; the fake-indexeddb instance is shared
  // by every run in this process, so each run gets its own database name
  // (otherwise the migration flag from run 1 would skip run 2 entirely).
  let src = fs.readFileSync(path.join(REPO, 'js/core/db.js'), 'utf8');
  if (dbName) src = src.replace("new Dexie('advisoros_v6')", `new Dexie('${dbName}')`);
  // db.js now reads the UK calendar via Utils.ukParts (day/range windows),
  // so the real config + utils run in the sandbox ahead of it.
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/config.js'), 'utf8') + ';CONFIG;', sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/utils.js'), 'utf8'), sandbox);
  // 'const DB' is a global lexical binding — not a sandbox property — so the
  // script's completion value (a trailing `DB;` expression) carries it out.
  return vm.runInContext(src + '\nDB;', sandbox);
}

// Raw-IDB seeds of the legacy 'advisoros_v5' database, as the old shim
// left it (object stores with keyPath 'id' + autoIncrement, no indexes).
function openLegacyDb(version = 1) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('advisoros_v5', version);
    req.onupgradeneeded = () => {
      const db = req.result;
      const stores = {
        customers: '++id, name',
        appointments: '++id, customerId, date',
        orders: '++id, customerId, appointmentId',
        expenses: '++id, date, category',
        trips: '++id, date',
        measurements: '++id, appointmentId',
        communications: '++id, customerId',
        settings: 'key',
        sequences: 'name'
      };
      for (const [name, def] of Object.entries(stores)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function seedLegacyDb() {
  const db = await openLegacyDb(2);
  const tx = db.transaction(['customers', 'appointments', 'sequences', 'settings'], 'readwrite');
  tx.objectStore('customers').add({ firstName: 'Grace', lastName: 'Hopper', customerNumber: 'CUS-2026-0003', phone: '07700 900123' });
  tx.objectStore('customers').add({ firstName: 'Ada', lastName: 'Lovelace', customerNumber: 'CUS-2026-0007', phone: '07700 900456' });
  const now = new Date();
  tx.objectStore('appointments').add({ customerId: 1, date: new Date(now.getTime() - 26 * 3600000).toISOString(), outcome: 'ordered', value: 900, status: 'completed' });
  tx.objectStore('appointments').add({ customerId: 2, date: new Date(now.getTime() - 30 * 3600000).toISOString(), outcome: 'measured_quoted_sold', value: 500, status: 'completed' });
  tx.objectStore('sequences').put({ name: 'customer', value: 0 });
  tx.objectStore('sequences').put({ name: 'order', value: 0 });
  tx.objectStore('settings').put({ key: 'config', value: { weeklyTarget: 600 } });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}

// ---------- Test 1: parity between Dexie and the shim ----------

async function parityRun(engine, dbName) {
  const db = engine === 'dexie'
    ? (() => {
        const Dexie = require('dexie');
        Dexie.dependencies.indexedDB = indexedDB;
        Dexie.dependencies.IDBKeyRange = IDBKeyRange;
        return new Dexie(dbName);
      })()
    : new (loadShim(baseSandbox()))(dbName);

  db.version(1).stores({
    customers: '++id, name',
    appointments: '++id, customerId, date',
    orders: '++id, customerId, appointmentId',
    sequences: 'name'
  });
  await db.open();

  // Sequence generation. The real engine hands out numbers inside one
  // readwrite transaction, so concurrent callers can never collide; the
  // shim has no transaction() and is instead serialized in practice
  // (documented in db.js.getNextSequence). Row is pre-seeded first, as
  // DB.initSequences does at boot.
  await db.sequences.put({ name: 'n', value: 0 });
  const tx = typeof db.transaction === 'function';
  const next = () => tx
    ? db.transaction('rw', db.sequences, async () => {
        const s = await db.sequences.get('n');
        const v = s.value + 1;
        await db.sequences.put({ name: 'n', value: v });
        return v;
      })
    : db.sequences.update('n', s => { s.value += 1; }).then(async () => (await db.sequences.get('n')).value);

  const nums = tx
    ? await Promise.all([next(), next(), next()])
    : [await next(), await next(), await next()];
  ok(engine + ': sequences increment to 1,2,3', JSON.stringify(nums) === JSON.stringify([1, 2, 3]), nums);
  if (tx) {
    ok(engine + ': transactional sequence uniqueness', new Set(nums).size === 3);
  }

  const ids = await Promise.all([
    db.customers.add({ name: 'Alice' }),
    db.customers.add({ name: 'Bob' }),
    db.customers.add({ name: 'Charlie' })
  ]);
  ok(engine + ': add returns ids', ids.length === 3 && ids.every(i => typeof i === 'number'));

  const byRange = await db.customers.where('name').between('B', 'D').toArray();
  ok(engine + ': between range', byRange.length === 2 && byRange[0].name === 'Bob', byRange.map(r => r.name));

  const any = await db.customers.where('name').anyOf(['Alice', 'Charlie']).toArray();
  ok(engine + ': anyOf', any.length === 2);

  const bulk = await db.customers.bulkGet(ids);
  ok(engine + ': bulkGet', bulk.length === 3 && bulk[1].name === 'Bob');

  await db.customers.update(ids[0], { name: 'Alicia' });
  ok(engine + ': update', (await db.customers.get(ids[0])).name === 'Alicia');

  await db.customers.update(ids[1], { nick: null });
  ok(engine + ': null field survives update', (await db.customers.get(ids[1])).nick === null);

  ok(engine + ': count', (await db.customers.count()) === 3);

  await db.customers.where('name').equals('Alicia').delete();
  ok(engine + ': where.delete', (await db.customers.count()) === 2);

  const sorted = await db.customers.filter(c => true).sortBy('name');
  ok(engine + ': sortBy asc', sorted[0].name === 'Bob' && sorted[1].name === 'Charlie', sorted.map(r => r.name));

  await db.customers.clear();
  ok(engine + ': clear', (await db.customers.count()) === 0);
}

// ---------- Tests 2 & 3: the real db.js on Dexie / on the shim ----------

async function runDbJs(engine, tag) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') {
    const Dexie = require('dexie');
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    sandbox.Dexie = Dexie;
  } else {
    sandbox.Dexie = loadShim(sandbox);
  }
  const DB = loadDbJs(sandbox, 'advisoros_v6_' + tag + '_' + Date.now());

  await DB.init();

  // Legacy migration results
  const customers = await DB.db.customers.toArray();
  customers.sort((a, b) => (a.customerNumber < b.customerNumber ? -1 : 1));
  ok(engine + ': legacy customers migrated', customers.length === 2, customers.length);
  ok(engine + ': legacy customer numbering intact', customers.some(c => c.customerNumber === 'CUS-2026-0007'));
  ok(engine + ': legacy appts migrated', (await DB.db.appointments.count()) === 2);
  ok(engine + ': legacy outcome renamed', (await DB.db.appointments.where('outcome').equals('ordered').count()) === 2);
  ok(engine + ': settings migrated', (await DB.getSetting('config')).weeklyTarget === 600);

  // Sequence guard: legacy records carry CUS-2026-0007 but the old counter
  // was 0 — next number must be 8, never 1.
  const c = await DB.addCustomer({ firstName: 'Edsger', lastName: 'Dijkstra', phone: '07700 900789' });
  ok(engine + ': sequence guarded', c.customerNumber === `CUS-${new Date().getFullYear()}-0008`, c.customerNumber);

  const search = await DB.searchCustomers('hopp');
  ok(engine + ': search by name', search.length === 1 && search[0].lastName === 'Hopper');
  const searchPost = await DB.searchCustomers('07700 900456');
  ok(engine + ': search by phone', searchPost.length === 1 && searchPost[0].firstName === 'Ada');

  const today = new Date().toISOString();
  await DB.addAppointment({ customerId: c.id, date: today, outcome: 'quoted', value: 300, commission: 30 });
  await DB.addAppointment({ customerId: c.id, date: today, outcome: null, value: 0, status: 'cancelled' });
  const todayAppts = await DB.getAppointmentsForDate(new Date());
  ok(engine + ': getAppointmentsForDate excludes cancelled', todayAppts.length === 1, todayAppts.length);

  const o = await DB.addOrder({ customerId: c.id, total: 1000, commission: 100 });
  ok(engine + ': order numbering', o.orderNumber.startsWith('ORD-') && o.orderNumber.endsWith('-0001'), o.orderNumber);
  ok(engine + ': deposit via App.calculateDeposit', o.depositRequired === 200, o.depositRequired);
  const totals = await DB.db.customers.get(c.id);
  ok(engine + ': customer totals recomputed', totals.totalOrdersValue === 1000 && totals.orderCount === 1, totals);

  const stats = await DB.getWeekStats(new Date(Date.now() - 2 * 86400000).toISOString(), new Date(Date.now() + 86400000).toISOString());
  ok(engine + ': week stats count ordered only', stats.orderedCount === 2 && stats.sales === 900 + 500, stats);

  const pipeline = await DB.getPipeline();
  ok(engine + ': pipeline includes quoted, not cancelled', pipeline.length >= 1 && pipeline.every(a => a.status !== 'cancelled'));

  const exp = await DB.addExpense({ date: today, category: 'fuel', amount: 40 });
  ok(engine + ': expense roundtrip', (await DB.getExpensesForPeriod(today, today)).some(e => e.id === exp.id));

  await DB.addCommunication({ customerId: c.id, type: 'sms', template: 'quote_followup' });

  // Customer photos: base64 roundtrip, caption, per-customer fetch, and the
  // cascade — a deleted customer takes their photos with them.
  const photoData = Buffer.from('fake-jpeg-bytes-'.repeat(100)).toString('base64');
  const ph = await DB.addPhoto({ customerId: c.id, data: photoData, caption: 'Front windows' });
  ok(engine + ': photo stored with id and caption', ph.id > 0 && ph.caption === 'Front windows');
  ok(engine + ': photo data roundtrip', (await DB.getPhotosForCustomer(c.id)).length === 1 && (await DB.db.photos.get(ph.id)).data === photoData);
  ok(engine + ': photos are per customer', (await DB.getPhotosForCustomer(9999)).length === 0);
  await DB.deletePhoto(ph.id);
  ok(engine + ': photo deletable', (await DB.db.photos.count()) === 0);
  await DB.addPhoto({ customerId: c.id, data: photoData, caption: 'Back yard' });

  const exported = await DB.exportAll();
  ok(engine + ': exportAll shape', Object.keys(exported).length === 10 && exported.customers.length === 3 && exported.photos.length === 1, Object.keys(exported));

  // Import: corrupt payload must throw and leave data untouched.
  const beforeExport = await DB.exportAll();
  const beforeCounts = Object.fromEntries(Object.keys(beforeExport).map(t => [t, beforeExport[t].length]));
  let threw = false;
  try { await DB.importAll({ customers: 'nonsense' }); } catch (e) { threw = true; }
  ok(engine + ': corrupt import rejected', threw);
  const afterCorrupt = await DB.exportAll();
  const corruptCounts = Object.fromEntries(Object.keys(afterCorrupt).map(t => [t, afterCorrupt[t].length]));
  ok(engine + ': corrupt import leaves every table intact', JSON.stringify(corruptCounts) === JSON.stringify(beforeCounts), { beforeCounts, corruptCounts });

  // Import: a corrupt payload (duplicate order id) is rejected up-front by
  // backup validation and must leave every table untouched.
  const backup = await DB.exportAll();
  const badOrders = backup.orders.slice(0);
  if (badOrders.length) badOrders.push({ ...badOrders[0] }); // duplicate key
  threw = false;
  try {
    await DB.importAll({ ...backup, orders: badOrders });
  } catch (e) { threw = true; }
  ok(engine + ': corrupt import (duplicate id) rejected', threw);
  const afterFailed = await DB.exportAll();
  const failedCounts = Object.fromEntries(Object.keys(afterFailed).map(t => [t, afterFailed[t].length]));
  ok(engine + ': corrupt import leaves every table intact', JSON.stringify(failedCounts) === JSON.stringify(beforeCounts), { beforeCounts, failedCounts });

  const del = await DB.deleteCustomer(c.id);
  ok(engine + ': deleteCustomer cascades', del.appointments >= 1 && del.orders === 1 && del.communications === 1 && del.photos === 1, del);
  ok(engine + ': customer gone after cascade', (await DB.db.customers.get(c.id)) === undefined);
  ok(engine + ': photos gone after customer cascade', (await DB.db.photos.count()) === 0);

  // Mixed date storage: a Date object (older engines/imports) must appear in
  // the day/range queries too — string-bounded index ranges silently skip it.
  // Pinned to the UK day (the app's date contract) so these assertions hold
  // on any device timezone; the day window is [UK midnight, +24h).
  const sandboxUtils = vm.runInContext('Utils;', sandbox);
  const ukNow = sandboxUtils.ukParts(new Date());
  const t = sandboxUtils.ukMidnightInstant(ukNow.year, ukNow.month, ukNow.day);
  const tISO = t.toISOString();
  await DB.addAppointment({ customerId: 1, clientName: 'Date Object Row', date: tISO, status: 'confirmed' });
  const rawDate = new Date(t.getTime() + 3600000);
  await DB.db.appointments.add({ customerId: 2, clientName: 'Raw Date Row', date: rawDate, status: 'confirmed' });
  const earlyRow = new Date(t.getTime() + 90 * 60000);
  await DB.db.appointments.add({ customerId: 2, clientName: 'Early UK Row', date: earlyRow.toISOString(), status: 'confirmed' });
  const prevLate = new Date(t.getTime() - 3600000);
  await DB.db.appointments.add({ customerId: 2, clientName: 'Prev Late Row', date: prevLate.toISOString(), status: 'confirmed' });
  const upcomingRow = new Date(Date.now() + 3600000);
  await DB.db.appointments.add({ customerId: 2, clientName: 'Upcoming Row', date: upcomingRow, status: 'confirmed' });
  const dayRows = await DB.getAppointmentsForDate(t);
  ok(engine + ': day query finds ISO-string rows', dayRows.some(a => a.clientName === 'Date Object Row'));
  ok(engine + ': day query finds Date-object rows', dayRows.some(a => a.clientName === 'Raw Date Row'), dayRows.map(a => a.clientName));
  ok(engine + ': UK 01:30 row lands in the UK day window', dayRows.some(a => a.clientName === 'Early UK Row'));
  ok(engine + ': UK 23:00 previous-day row stays out of the window', !dayRows.some(a => a.clientName === 'Prev Late Row'));
  const rangeRows = await DB.getAppointmentsForRange(t, new Date(rawDate.getTime() + 86400000));
  ok(engine + ': range query finds Date-object rows', rangeRows.some(a => a.clientName === 'Raw Date Row'));
  const upcoming = await DB.getUpcomingAppointments(1);
  ok(engine + ': upcoming finds Date-object rows', upcoming.some(a => a.clientName === 'Upcoming Row'));
  await DB.db.appointments.filter(a => ['Raw Date Row', 'Early UK Row', 'Prev Late Row', 'Upcoming Row'].includes(a.clientName)).delete();

  // Factory reset: every table empties and app-prefixed localStorage keys go.
  sandbox.localStorage.setItem('advisoros_config', JSON.stringify({ advisorName: 'Riaz' }));
  sandbox.localStorage.setItem('advisoros_auto_visit_1', '1');
  await DB.deleteAllData();
  const afterWipe = await DB.exportAll();
  const wipedCounts = Object.fromEntries(Object.keys(afterWipe).map(t => [t, afterWipe[t].length]));
  const allEmpty = Object.values(wipedCounts).every(n => n === 0);
  ok(engine + ': deleteAllData empties every table', allEmpty, wipedCounts);
  ok(engine + ': deleteAllData removes advisoros localStorage keys',
    sandbox.localStorage.getItem('advisoros_config') === null && sandbox.localStorage.getItem('advisoros_auto_visit_1') === null);
}

// ---------- Test: localStorage fallback migration (shim-era users) ----------

async function runLocalStorageMigration(engine) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') {
    const Dexie = require('dexie');
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    sandbox.Dexie = Dexie;
  } else {
    sandbox.Dexie = loadShim(sandbox);
  }
  // Shim-era localStorage fallback rows: 'advisoros:<dbName>:<table>' ->
  // JSON { nextId, rows }. No legacy IDB database exists in this run.
  sandbox.localStorage.setItem('advisoros:advisoros_v5:customers', JSON.stringify({
    nextId: 4,
    rows: [
      { id: 1, firstName: 'Katherine', lastName: 'Johnson', customerNumber: 'CUS-2026-0001', phone: '07700 900111' },
      { id: 3, firstName: 'Mary', lastName: 'Jackson', customerNumber: 'CUS-2026-0003', phone: '07700 900222' }
    ]
  }));
  sandbox.localStorage.setItem('advisoros:advisoros_v5:appointments', JSON.stringify({
    nextId: 2,
    rows: [{ id: 1, customerId: 1, date: new Date(Date.now() - 3600000).toISOString(), outcome: 'quoted', value: 400, status: 'completed' }]
  }));
  sandbox.localStorage.setItem('advisoros:advisoros_v5:sequences', JSON.stringify({
    nextId: 1, rows: [{ name: 'customer', value: 0 }]
  }));
  sandbox.localStorage.setItem('advisoros:advisoros_v5:settings', JSON.stringify({
    nextId: 2, rows: [{ key: 'config', value: { weeklyTarget: 500 } }]
  }));

  const DB = loadDbJs(sandbox, 'advisoros_v6_ls_' + engine + '_' + Date.now());
  await DB.init();

  const customers = await DB.db.customers.toArray();
  ok(engine + ': localStorage customers migrated', customers.length === 2, customers.length);
  ok(engine + ': localStorage numbering intact', customers.some(c => c.customerNumber === 'CUS-2026-0003'));
  ok(engine + ': localStorage appts migrated', (await DB.db.appointments.count()) === 1);
  ok(engine + ': localStorage sequence guarded', (await DB.db.sequences.get('customer')).value === 3);
  ok(engine + ': localStorage settings migrated', (await DB.getSetting('config')).weeklyTarget === 500);
  ok(engine + ': migration flag set', (await DB.getSetting('__v6_legacy_migrated__')) === true);
}

// ---------- Test: customer deletion cascade across the whole graph ----------

// Customer data is an operational-memory graph: appointments carry
// measurements and trips, and the customer owns orders, communications and
// photos. deleteCustomer() must remove the entire graph for the deleted
// customer while leaving every other customer's graph untouched.
async function runCustomerCascade(engine, tag) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') {
    const Dexie = require('dexie');
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    sandbox.Dexie = Dexie;
  } else {
    sandbox.Dexie = loadShim(sandbox);
  }
  const DB = loadDbJs(sandbox, 'advisoros_v6_cascade_' + engine + '_' + Date.now());
  await DB.init();

  const now = new Date().toISOString();
  const photoData = Buffer.from('fake-jpeg-bytes-'.repeat(100)).toString('base64');

  // Customer A: full graph - 2 appointments (multiple measurements, one with
  // multiple trips), an order, a communication and a photo.
  const a = await DB.addCustomer({ firstName: 'Ava', lastName: 'Alpha', phone: '07700 900001' });
  const aAppt1 = await DB.addAppointment({ customerId: a.id, date: now, type: 'consultation' });
  const aAppt2 = await DB.addAppointment({ customerId: a.id, date: now, type: 'measure' });
  await DB.addMeasurement({ appointmentId: aAppt1.id, windowName: 'Bay' });
  await DB.addMeasurement({ appointmentId: aAppt1.id, windowName: 'Kitchen' });
  await DB.addMeasurement({ appointmentId: aAppt2.id, windowName: 'Bedroom' });
  await DB.addTrip({ appointmentId: aAppt1.id, date: now, purpose: 'business' });
  await DB.addTrip({ appointmentId: aAppt1.id, date: now, purpose: 'business' });
  await DB.addTrip({ appointmentId: aAppt2.id, date: now, purpose: 'business' });
  await DB.addOrder({ customerId: a.id, appointmentId: aAppt1.id, total: 800, commission: 80 });
  await DB.addCommunication({ customerId: a.id, type: 'sms', template: 'intro' });
  await DB.addPhoto({ customerId: a.id, data: photoData, caption: 'Front' });

  // Customer B: equivalent graph - must survive A's deletion untouched.
  const b = await DB.addCustomer({ firstName: 'Ben', lastName: 'Beta', phone: '07700 900002' });
  const bAppt1 = await DB.addAppointment({ customerId: b.id, date: now, type: 'consultation' });
  await DB.addMeasurement({ appointmentId: bAppt1.id, windowName: 'Bay' });
  await DB.addTrip({ appointmentId: bAppt1.id, date: now, purpose: 'business' });
  await DB.addOrder({ customerId: b.id, appointmentId: bAppt1.id, total: 600, commission: 60 });
  await DB.addCommunication({ customerId: b.id, type: 'sms', template: 'quote_followup' });
  await DB.addPhoto({ customerId: b.id, data: photoData, caption: 'Back' });

  // Customer C: no appointments at all.
  const c = await DB.addCustomer({ firstName: 'Cleo', lastName: 'Gamma', phone: '07700 900003' });

  // Customer D: appointments but no measurements or trips.
  const d = await DB.addCustomer({ firstName: 'Drew', lastName: 'Delta', phone: '07700 900004' });
  await DB.addAppointment({ customerId: d.id, date: now, type: 'fitting' });

  // Delete A - the whole graph must go.
  const delA = await DB.deleteCustomer(a.id);
  ok(engine + ': cascade removes full graph', delA.appointments === 2 && delA.measurements === 3 && delA.trips === 3 && delA.orders === 1 && delA.communications === 1 && delA.photos === 1, delA);
  ok(engine + ': cascade removes measurements', (await DB.db.measurements.where('appointmentId').anyOf([aAppt1.id, aAppt2.id]).count()) === 0);
  ok(engine + ': cascade removes trips', (await DB.db.trips.where('appointmentId').anyOf([aAppt1.id, aAppt2.id]).count()) === 0);
  ok(engine + ': cascade removes appointments', (await DB.db.appointments.where('customerId').equals(a.id).count()) === 0);
  ok(engine + ': cascade removes orders', (await DB.db.orders.where('customerId').equals(a.id).count()) === 0);
  ok(engine + ': cascade removes communications', (await DB.db.communications.where('customerId').equals(a.id).count()) === 0);
  ok(engine + ': cascade removes photos', (await DB.db.photos.where('customerId').equals(a.id).count()) === 0);
  ok(engine + ': cascade removes customer', (await DB.db.customers.get(a.id)) === undefined);

  // B's graph must be completely untouched.
  ok(engine + ': other customer appointments survive', (await DB.db.appointments.where('customerId').equals(b.id).count()) === 1);
  ok(engine + ': other customer measurements survive', (await DB.db.measurements.where('appointmentId').equals(bAppt1.id).count()) === 1);
  ok(engine + ': other customer trips survive', (await DB.db.trips.where('appointmentId').equals(bAppt1.id).count()) === 1);
  ok(engine + ': other customer orders survive', (await DB.db.orders.where('customerId').equals(b.id).count()) === 1);
  ok(engine + ': other customer communications survive', (await DB.db.communications.where('customerId').equals(b.id).count()) === 1);
  ok(engine + ': other customer photos survive', (await DB.db.photos.where('customerId').equals(b.id).count()) === 1);
  ok(engine + ': other customer survives', (await DB.db.customers.get(b.id)) !== undefined);

  // Only B's graph remains in the orphan-prone tables.
  ok(engine + ': only other measurements remain', (await DB.db.measurements.count()) === 1);
  ok(engine + ': only other trips remain', (await DB.db.trips.count()) === 1);

  // Delete B too - a second full-graph cascade.
  const delB = await DB.deleteCustomer(b.id);
  ok(engine + ': second cascade removes full graph', delB.appointments === 1 && delB.measurements === 1 && delB.trips === 1 && delB.orders === 1 && delB.communications === 1 && delB.photos === 1, delB);
  ok(engine + ': second cascade leaves no measurements', (await DB.db.measurements.count()) === 0);
  ok(engine + ': second cascade leaves no trips', (await DB.db.trips.count()) === 0);

  // Customer with no appointments - still deletable, zero graph counts.
  const delC = await DB.deleteCustomer(c.id);
  ok(engine + ': no-appointment customer deletes cleanly', delC.appointments === 0 && delC.measurements === 0 && delC.trips === 0 && delC.orders === 0 && delC.communications === 0 && delC.photos === 0, delC);
  ok(engine + ': no-appointment customer gone', (await DB.db.customers.get(c.id)) === undefined);

  // Customer with appointments but no measurements/trips - appointments go,
  // and the measurement/trip deletes are harmless no-ops.
  const delD = await DB.deleteCustomer(d.id);
  ok(engine + ': appointments-only customer deletes cleanly', delD.appointments === 1 && delD.measurements === 0 && delD.trips === 0, delD);
  ok(engine + ': appointments-only customer appointments gone', (await DB.db.appointments.where('customerId').equals(d.id).count()) === 0);
  ok(engine + ': appointments-only customer leaves no orphan measurements', (await DB.db.measurements.count()) === 0);
  ok(engine + ': appointments-only customer leaves no orphan trips', (await DB.db.trips.count()) === 0);
}

// ---------- Test: complete operational backup roundtrip (DB layer) ----------

// exportAll()/importAll() must fully reconstruct the advisor's operational
// memory on a fresh device: every table including photos (with exact base64
// payloads) and settings, minus runtime-only rows, with sequence counters
// guarded so restored records never collide with freshly issued numbers.
async function runBackupRoundtrip(engine, tag) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') {
    const Dexie = require('dexie');
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    sandbox.Dexie = Dexie;
  } else {
    sandbox.Dexie = loadShim(sandbox);
  }
  const DB = loadDbJs(sandbox, 'advisoros_v6_backup_' + engine + '_' + Date.now());
  await DB.init();

  const now = new Date().toISOString();
  const photoA = Buffer.from('window-photo-a-'.repeat(40)).toString('base64');
  const photoB = Buffer.from('window-photo-b-'.repeat(60)).toString('base64');

  // Realistic dataset: two customers, each with appointments, measurements,
  // trips, orders, expenses, communications and photos.
  const c1 = await DB.addCustomer({ firstName: 'Riaz', lastName: 'Ahmed', phone: '07700 900111' });
  const a1 = await DB.addAppointment({ customerId: c1.id, date: now, type: 'consultation', outcome: 'ordered', value: 900, commission: 90 });
  const a2 = await DB.addAppointment({ customerId: c1.id, date: now, type: 'fitting' });
  await DB.addMeasurement({ appointmentId: a1.id, windowName: 'Bay', widthTop: 1200, widthMiddle: 1195, widthBottom: 1210, dropLeft: 1500, dropCentre: 1490, dropRight: 1505 });
  await DB.addMeasurement({ appointmentId: a2.id, windowName: 'Kitchen' });
  await DB.addTrip({ appointmentId: a1.id, date: now, purpose: 'business' });
  await DB.addOrder({ customerId: c1.id, appointmentId: a1.id, total: 900, commission: 90 });
  await DB.addExpense({ date: now, category: 'fuel', amount: 35 });
  await DB.addCommunication({ customerId: c1.id, type: 'whatsapp', template: 'outcome_ordered' });
  await DB.addPhoto({ customerId: c1.id, data: photoA, caption: 'Front bay' });
  await DB.addPhoto({ customerId: c1.id, data: photoB, caption: 'Kitchen' });

  const c2 = await DB.addCustomer({ firstName: 'Sara', lastName: 'Khan', phone: '07700 900222' });
  const b1 = await DB.addAppointment({ customerId: c2.id, date: now, type: 'measure' });
  await DB.addMeasurement({ appointmentId: b1.id, windowName: 'Lounge' });
  await DB.addPhoto({ customerId: c2.id, data: photoA, caption: 'Lounge window' });

  // Settings: real config plus runtime-only rows that must NOT travel.
  await DB.setSetting('config', { advisorName: 'Riaz', weeklyTarget: 600 });
  await DB.setSetting('__storage_probe__', { origin: 'test', updatedAt: now });
  await DB.setSetting('pitchDemoSeeded', true);

  const exported = await DB.exportAll();
  ok(engine + ': backup exports all 10 tables', Object.keys(exported).length === 10, Object.keys(exported));
  ok(engine + ': backup carries photos', exported.photos.length === 3, exported.photos.length);
  ok(engine + ': backup drops runtime-only settings', exported.settings.length === 1 && exported.settings[0].key === 'config', exported.settings);
  ok(engine + ': backup carries sequences', exported.sequences.length === 2, exported.sequences);
  ok(engine + ': backup photo payloads exact', exported.photos.some(p => p.data === photoB) && exported.photos.some(p => p.data === photoA));

  // Wipe (simulating a lost/cleared device) then restore from the dump.
  await DB.deleteAllData();
  await DB.importAll(JSON.parse(JSON.stringify(exported)));

  const restored = await DB.exportAll();
  const tablesEqual = Object.keys(exported).every(t => JSON.stringify(exported[t]) === JSON.stringify(restored[t]));
  ok(engine + ': import reconstructs every table equivalently', tablesEqual);

  const restoredPhotos = await DB.db.photos.toArray();
  ok(engine + ': photo count after restore', restoredPhotos.length === 3);
  ok(engine + ': photo data integrity after restore', restoredPhotos.every(p => p.data === photoA || p.data === photoB));
  ok(engine + ': photo customer links intact', restoredPhotos.filter(p => p.customerId === c1.id).length === 2);
  ok(engine + ': settings restored', (await DB.getSetting('config')).weeklyTarget === 600);
  ok(engine + ': runtime settings NOT restored', (await DB.getSetting('__storage_probe__')) === null && (await DB.getSetting('pitchDemoSeeded')) === null);

  // Sequences: restored counters keep issuing non-colliding numbers. The
  // dataset used CUS-2026-0001/2 and ORD-2026-0001, so the next issued
  // numbers must be strictly greater than any restored record's number.
  const newCust = await DB.addCustomer({ firstName: 'New', lastName: 'Customer', phone: '07700 900333' });
  ok(engine + ': numbering continues after restore', newCust.customerNumber !== c1.customerNumber && newCust.customerNumber !== c2.customerNumber, newCust.customerNumber);
  const newOrder = await DB.addOrder({ customerId: c1.id, total: 100, commission: 10 });
  ok(engine + ': order numbering continues after restore', newOrder.orderNumber !== (await DB.db.orders.where('customerId').equals(c1.id).first()).orderNumber, newOrder.orderNumber);

  // Old backup format: 7 tables only, no photos/settings/sequences, records
  // carrying higher CUS-/ORD- numbers than any counter. The import must
  // restore them and raise the counters above the restored data.
  await DB.deleteAllData();
  const legacy = {
    customers: [
      { id: 1, firstName: 'Grace', lastName: 'Hopper', customerNumber: 'CUS-2026-0007', phone: '07700 900123' },
      { id: 2, firstName: 'Ada', lastName: 'Lovelace', customerNumber: 'CUS-2026-0009', phone: '07700 900456' }
    ],
    appointments: [{ id: 1, customerId: 1, date: now, outcome: 'quoted', value: 400, status: 'completed' }],
    orders: [{ id: 1, customerId: 1, appointmentId: 1, orderNumber: 'ORD-2026-0003', total: 400, commission: 40, status: 'deposit_pending' }],
    expenses: [{ id: 1, date: now, category: 'fuel', amount: 20 }],
    trips: [{ id: 1, date: now, appointmentId: 1, purpose: 'business', confirmed: false }],
    measurements: [{ id: 1, appointmentId: 1, windowName: 'Bay' }],
    communications: [{ id: 1, customerId: 1, type: 'sms', template: 'quote_followup' }]
  };
  await DB.importAll(JSON.parse(JSON.stringify(legacy)));
  ok(engine + ': legacy-format import restores 7 tables', (await DB.db.customers.count()) === 2 && (await DB.db.appointments.count()) === 1 && (await DB.db.orders.count()) === 1 && (await DB.db.photos.count()) === 0);
  ok(engine + ': legacy-format import raises customer counter', (await DB.db.sequences.get('customer')).value >= 9, await DB.db.sequences.get('customer'));
  ok(engine + ': legacy-format import raises order counter', (await DB.db.sequences.get('order')).value >= 3, await DB.db.sequences.get('order'));
  const afterLegacy = await DB.addCustomer({ firstName: 'Edsger', lastName: 'Dijkstra', phone: '07700 900789' });
  ok(engine + ': no collision after legacy import', afterLegacy.customerNumber.endsWith('-0010'), afterLegacy.customerNumber);

  // ---- Failure cases: every rejection must leave the database untouched ----
  // Each attempt snapshots the database first and compares it afterwards.
  const expectReject = async (label, data) => {
    const snapshot = await DB.exportAll();
    let threw = false;
    try { await DB.importAll(data); } catch (e) { threw = true; }
    ok(engine + ': ' + label + ' rejected', threw);
    const after = await DB.exportAll();
    ok(engine + ': ' + label + ' leaves database intact', JSON.stringify(after) === JSON.stringify(snapshot));
  };

  const goodCustomer = (await DB.db.customers.toArray())[0];
  const goodAppt = (await DB.db.appointments.toArray())[0];

  // 2. Missing tables: a backup carrying no tables at all must be rejected
  // (importing it would wipe the database with nothing to restore).
  await expectReject('empty backup (no tables)', {});

  // 3. Invalid record: entries that aren't record objects.
  await expectReject('malformed record', { customers: [null], appointments: [] });

  // 4. Duplicate primary ID.
  await expectReject('duplicate customer id', { customers: [goodCustomer, { ...goodCustomer }] });

  // 5. Dangling customer reference.
  await expectReject('dangling customer reference', {
    customers: [goodCustomer],
    appointments: [{ id: 9991, customerId: 424242, date: now }]
  });

  // Missing required relationship field (appointment without customerId).
  await expectReject('appointment missing customerId', {
    customers: [goodCustomer],
    appointments: [{ id: 9992, date: now }]
  });

  // 6. Dangling appointment reference (measurement and trip).
  await expectReject('dangling measurement reference', {
    customers: [goodCustomer],
    appointments: [goodAppt],
    measurements: [{ id: 9993, appointmentId: 424242 }]
  });
  await expectReject('dangling trip reference', {
    customers: [goodCustomer],
    appointments: [goodAppt],
    trips: [{ id: 9994, appointmentId: 424242, date: now }]
  });

  // Non-integer ID type.
  await expectReject('non-integer id', { customers: [{ id: 'abc', firstName: 'Bad' }] });

  // 7. Invalid photo: non-string image data.
  await expectReject('invalid photo data', {
    customers: [goodCustomer],
    photos: [{ id: 9995, customerId: goodCustomer.id, data: 12345 }]
  });

  // 8. Invalid date.
  await expectReject('invalid appointment date', {
    customers: [goodCustomer],
    appointments: [{ id: 9996, customerId: goodCustomer.id, date: 'not-a-date' }]
  });

  // 9. Intentional failure DURING the import (after validation): the wipe has
  // started when orders.bulkAdd throws. Real Dexie must roll its transaction
  // back; the shim must restore its snapshot.
  const snapshot = await DB.exportAll();
  const realBulkAdd = DB.db.orders.bulkAdd.bind(DB.db.orders);
  let injected = false;
  DB.db.orders.bulkAdd = async rows => {
    if (!injected) { injected = true; throw new Error('injected import failure'); }
    return realBulkAdd(rows);
  };
  let threw = false;
  try { await DB.importAll(JSON.parse(JSON.stringify(snapshot))); } catch (e) { threw = true; }
  DB.db.orders.bulkAdd = realBulkAdd;
  ok(engine + ': mid-import failure rejected', threw);
  const afterMid = await DB.exportAll();
  ok(engine + ': mid-import failure leaves every table intact', JSON.stringify(afterMid) === JSON.stringify(snapshot));

  // Corrupt photo records are rejected safely even with an empty customer set.
  threw = false;
  try {
    await DB.importAll({ customers: [], photos: [{ customerId: 1, data: null }] });
  } catch (e) { threw = true; }
  ok(engine + ': corrupt photo payload rejected', threw);
  ok(engine + ': corrupt photo rejection leaves data intact', (await DB.db.customers.count()) === 3, await DB.db.customers.count());
}

// ---------- Test: backup envelope (ExportService) ----------

// The file format layer: metadata fields, secret sanitization, version gates
// and config filtering. Envelope logic is engine-independent, so it runs once
// on the real Dexie engine.
async function runBackupEnvelope() {
  const sandbox = baseSandbox({
    Utils: { formatDate: () => '2026-08-14', formatDateUK: () => '2026-08-14' },
    App: {},
    Toast: { show: () => {} }
  });
  const Dexie = require('dexie');
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  sandbox.Dexie = Dexie;
  const DB = loadDbJs(sandbox, 'advisoros_v6_envelope_' + Date.now());
  await DB.init();
  sandbox.DB = DB;
  const CONFIG = vm.runInContext('CONFIG;', sandbox);
  const ExportService = vm.runInContext(fs.readFileSync(path.join(REPO, 'js/services/export.js'), 'utf8') + '\nExportService;', sandbox);
  ExportService.downloadFile = () => {};

  const now = new Date().toISOString();
  const photo = Buffer.from('envelope-photo-'.repeat(30)).toString('base64');
  const cust = await DB.addCustomer({ firstName: 'Riaz', lastName: 'Ahmed', phone: '07700 900111' });
  const appt = await DB.addAppointment({ customerId: cust.id, date: now, type: 'consultation' });
  await DB.addPhoto({ customerId: cust.id, data: photo, caption: 'Front' });

  CONFIG.ai.secret = 'super-secret-key';
  CONFIG.weeklyTarget = 750;

  const backup = await ExportService.exportBackup();
  ok('envelope: backupFormatVersion present', backup.backupFormatVersion === 1, backup.backupFormatVersion);
  ok('envelope: databaseSchemaVersion present', backup.databaseSchemaVersion === 2, backup.databaseSchemaVersion);
  ok('envelope: appVersion present', backup.appVersion === '5.0', backup.appVersion);
  ok('envelope: legacy version field kept', backup.version === '5.0');
  ok('envelope: exportedAt timestamp', typeof backup.exportedAt === 'string' && !isNaN(Date.parse(backup.exportedAt)));
  ok('envelope: carries all 10 data tables', Object.keys(backup.data).length === 10, Object.keys(backup.data));
  ok('envelope: photos in backup', backup.data.photos.length === 1 && backup.data.photos[0].data === photo);
  ok('envelope: no proxy secret in backup config', backup.config.ai && backup.config.ai.secret === undefined);
  ok('envelope: secret absent from serialized file', JSON.stringify(backup).indexOf('super-secret-key') === -1);

  // Full restore path through the envelope: wipe, then import the file.
  await DB.deleteAllData();
  await ExportService.importBackup({ text: async () => JSON.stringify(backup) });
  ok('envelope: full restore reconstructs data',
    (await DB.db.customers.count()) === backup.data.customers.length &&
    (await DB.db.photos.count()) === backup.data.photos.length &&
    JSON.stringify(await DB.db.photos.toArray()) === JSON.stringify(backup.data.photos));
  ok('envelope: config restored', CONFIG.weeklyTarget === 750, CONFIG.weeklyTarget);

  // The device's own proxy secret must survive an import.
  CONFIG.ai.secret = 'device-secret';
  await ExportService.importBackup({ text: async () => JSON.stringify(backup) });
  ok('envelope: import never overwrites device proxy secret', CONFIG.ai.secret === 'device-secret', CONFIG.ai.secret);

  // Version gates.
  let threw = false;
  try {
    await ExportService.importBackup({ text: async () => JSON.stringify({ version: '6.0', data: {} }) });
  } catch (e) { threw = true; }
  ok('envelope: unknown legacy version rejected', threw);

  threw = false;
  try {
    await ExportService.importBackup({ text: async () => JSON.stringify({ backupFormatVersion: 99, data: {} }) });
  } catch (e) { threw = e.message.indexOf('newer version') !== -1; }
  ok('envelope: future format version rejected', threw);

  threw = false;
  try {
    await ExportService.importBackup({ text: async () => JSON.stringify({ backupFormatVersion: 1, data: 'nonsense' }) });
  } catch (e) { threw = true; }
  ok('envelope: corrupt data rejected', threw);

  // 1. Malformed JSON: parse fails before anything is read or written.
  threw = false;
  try {
    await ExportService.importBackup({ text: async () => '{this is not json' });
  } catch (e) { threw = true; }
  ok('envelope: malformed JSON rejected', threw);
  ok('envelope: malformed JSON leaves database untouched', (await DB.db.customers.count()) === 3, await DB.db.customers.count());

  // Legacy 4.0/5.0 files (7 tables, no backupFormatVersion) still import.
  const legacyData = {
    customers: [{ id: 1, firstName: 'Grace', lastName: 'Hopper', customerNumber: 'CUS-2026-0001', phone: '07700 900123' }],
    appointments: [{ id: 1, customerId: 1, date: now, outcome: 'quoted', value: 400, status: 'completed' }],
    orders: [], expenses: [], trips: [], measurements: [], communications: []
  };
  await DB.deleteAllData();
  const legacyBackup = { version: '5.0', exportedAt: now, data: legacyData };
  await ExportService.importBackup({ text: async () => JSON.stringify(legacyBackup) });
  ok('envelope: legacy 5.0 file still imports', (await DB.db.customers.count()) === 1 && (await DB.db.appointments.count()) === 1);
  await DB.deleteAllData();
  await ExportService.importBackup({ text: async () => JSON.stringify({ version: '4.0', exportedAt: now, data: legacyData }) });
  ok('envelope: legacy 4.0 file still imports', (await DB.db.customers.count()) === 1);

  // Config injection attempts must be filtered by the existing-key/type rules.
  const tampered = JSON.parse(JSON.stringify(backup));
  tampered.config.evilKey = true;
  tampered.config.weeklyTarget = 'not-a-number';
  tampered.config.ai.secret = 'injected-secret';
  await ExportService.importBackup({ text: async () => JSON.stringify(tampered) });
  ok('envelope: unknown config key rejected', !('evilKey' in CONFIG));
  ok('envelope: type-mismatched config value rejected', typeof CONFIG.weeklyTarget === 'number');
  ok('envelope: injected secret cannot override device secret', CONFIG.ai.secret === 'device-secret', CONFIG.ai.secret);
}

// ---------- runner ----------

(async () => {
  console.log('\nTest 1a: parity — real Dexie');
  await parityRun('dexie', 'parity_dexie');

  console.log('\nTest 1b: parity — bundled shim');
  await parityRun('shim', 'parity_shim');

  console.log('\nTest 1c: localStorage fallback migration — real Dexie');
  await runLocalStorageMigration('dexie');

  console.log('\nTest 2: db.js boot path — real Dexie (with legacy migration)');
  await seedLegacyDb();
  await runDbJs('dexie', 'dexie');

  console.log('\nTest 3: db.js boot path — shim fallback (with legacy migration)');
  await runDbJs('shim', 'shim');

  console.log('\nTest 4: customer deletion cascade — real Dexie');
  await runCustomerCascade('dexie', 'dexie');

  console.log('\nTest 5: customer deletion cascade — bundled shim');
  await runCustomerCascade('shim', 'shim');

  console.log('\nTest 6: operational backup roundtrip — real Dexie');
  await runBackupRoundtrip('dexie', 'dexie');

  console.log('\nTest 7: operational backup roundtrip — bundled shim');
  await runBackupRoundtrip('shim', 'shim');

  console.log('\nTest 8: backup envelope (ExportService)');
  await runBackupEnvelope();
  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });
