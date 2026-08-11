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
    window: {}
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
  ok(engine + ': exportAll shape', Object.keys(exported).length === 7 && exported.customers.length === 3);

  // Import: corrupt payload must throw and leave data untouched.
  const beforeExport = await DB.exportAll();
  const beforeCounts = Object.fromEntries(Object.keys(beforeExport).map(t => [t, beforeExport[t].length]));
  let threw = false;
  try { await DB.importAll({ customers: 'nonsense' }); } catch (e) { threw = true; }
  ok(engine + ': corrupt import rejected', threw);
  const afterCorrupt = await DB.exportAll();
  const corruptCounts = Object.fromEntries(Object.keys(afterCorrupt).map(t => [t, afterCorrupt[t].length]));
  ok(engine + ': corrupt import leaves every table intact', JSON.stringify(corruptCounts) === JSON.stringify(beforeCounts), { beforeCounts, corruptCounts });

  // Import: mid-way failure rolls back (table 3 of 7 has a bad record).
  const backup = await DB.exportAll();
  const badOrders = backup.orders.slice(0);
  if (badOrders.length) badOrders.push({ ...badOrders[0] }); // duplicate key
  threw = false;
  try {
    await DB.importAll({ ...backup, orders: badOrders });
  } catch (e) { threw = true; }
  ok(engine + ': partial import rolls back', threw);
  const afterFailed = await DB.exportAll();
  const failedCounts = Object.fromEntries(Object.keys(afterFailed).map(t => [t, afterFailed[t].length]));
  ok(engine + ': rollback restores every table', JSON.stringify(failedCounts) === JSON.stringify(beforeCounts), { beforeCounts, failedCounts });

  const del = await DB.deleteCustomer(c.id);
  ok(engine + ': deleteCustomer cascades', del.appointments >= 1 && del.orders === 1 && del.communications === 1 && del.photos === 1, del);
  ok(engine + ': customer gone after cascade', (await DB.db.customers.get(c.id)) === undefined);
  ok(engine + ': photos gone after customer cascade', (await DB.db.photos.count()) === 0);
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
  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });
