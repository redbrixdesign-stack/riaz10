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
    crypto: globalThis.crypto || require('crypto').webcrypto,
    TextEncoder,
    TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    FileReader: class FileReader {
      constructor() { this.onload = null; this.result = null; }
      readAsText(file) { setTimeout(async () => { this.result = typeof file.text === 'function' ? await file.text() : (file._text || ''); this.onload?.({ target: { result: this.result } }); }, 0); }
    },
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
  await sandbox.initEncryption('test-passphrase-123');

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
  const voiceAppt = await DB.addAppointment({ customerId: c.id, date: today, outcome: 'quoted', value: 300, commission: 30 });
  await DB.addAppointment({ customerId: c.id, date: today, outcome: null, value: 0, status: 'cancelled' });
  const todayAppts = await DB.getAppointmentsForDate(new Date());
  ok(engine + ': getAppointmentsForDate excludes cancelled', todayAppts.length === 1, todayAppts.length);

  const o = await DB.addOrder({ customerId: c.id, total: 1000, commission: 100 });
  // The legacy-outcome fixture above has 2 sold appointments with no linked
  // order, so backfillLegacyOrders() issues ORD-...-0001/-0002 first; a new
  // order must continue the sequence after them (0003+), never collide.
  ok(engine + ': order numbering continues after backfilled legacy orders',
    o.orderNumber.startsWith('ORD-') && !o.orderNumber.endsWith('-0001') && !o.orderNumber.endsWith('-0002'), o.orderNumber);
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
  const legacyPhoto = await DB.addPhoto({ customerId: c.id, data: `data:image/heic;base64,${photoData}`, mimeType: 'image/heic', caption: 'Apple photo' });
  const normalisedPhoto = await DB.db.photos.get(legacyPhoto.id);
  ok(engine + ': full photo data URL is normalised before storage', normalisedPhoto.data === photoData && normalisedPhoto.mimeType === 'image/heic');
  ok(engine + ': photos are per customer', (await DB.getPhotosForCustomer(9999)).length === 0);
  await DB.deletePhoto(ph.id);
  await DB.deletePhoto(legacyPhoto.id);
  ok(engine + ': photo deletable', (await DB.db.photos.count()) === 0);
  await DB.addPhoto({ customerId: c.id, data: photoData, caption: 'Back yard' });
  // A realistic recording is large enough to exceed JavaScript's function
  // argument limit if encryption converts it with one unbounded spread.
  const audioData = Buffer.alloc(1024 * 1024, 0x5a).toString('base64');
  const voice = await DB.addVoiceNote({ customerId: c.id, appointmentId: voiceAppt.id, data: audioData, mimeType: 'audio/mp4', durationSeconds: 12, title: 'Synthetic visit note' });
  ok(engine + ': voice note stores linked offline audio', voice.id > 0 && (await DB.getVoiceNotes({ appointmentId: voiceAppt.id }))[0].data === audioData, voice);
  await DB.updateVoiceNoteTitle(voice.id, 'Renamed synthetic note');
  ok(engine + ': voice note title updates', (await DB.getVoiceNote(voice.id)).title === 'Renamed synthetic note');
  const rawVoice = await DB.db.voiceNotes.get(voice.id);
  ok(engine + ': voice note audio and title are encrypted at rest', typeof rawVoice.data === 'object' && !!rawVoice.data.ct && typeof rawVoice.title === 'object' && !!rawVoice.title.ct);

  const exported = await DB.exportAll();
  ok(engine + ': exportAll shape', Object.keys(exported).length === 39 && exported.customers.length === 3 && exported.photos.length === 1 && exported.voiceNotes.length === 1, Object.keys(exported));

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
  ok(engine + ': deleteCustomer cascades', del.appointments >= 1 && del.orders === 1 && del.communications === 1 && del.photos === 1 && del.voiceNotes === 1, del);
  ok(engine + ': customer gone after cascade', (await DB.db.customers.get(c.id)) === undefined);
  ok(engine + ': photos gone after customer cascade', (await DB.db.photos.count()) === 0);
  ok(engine + ': voice notes gone after customer cascade', (await DB.db.voiceNotes.count()) === 0);

  // Mixed date storage: a Date object (older engines/imports) must appear in
  // the day/range queries too — string-bounded index ranges silently skip it.
  // Pinned to the UK day (the app's date contract) so these assertions hold
  // on any device timezone; every public window is half-open [start, end).
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
  const upcomingRow = new Date(t.getTime() + 2 * 3600000);
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

  // Explicit query contracts: sorted, cancelled-free, half-open, and stable
  // without depending on the wall clock at which the suite happens to run.
  const fixedStart = new Date('2026-02-10T10:00:00.000Z');
  const fixedEnd = new Date('2026-02-10T12:00:00.000Z');
  await DB.db.appointments.bulkAdd([
    { customerId: 2, clientName: 'Window Later', date: new Date('2026-02-10T11:30:00.000Z'), status: 'confirmed' },
    { customerId: 2, clientName: 'Window Earlier', date: '2026-02-10T10:30:00.000Z', status: 'confirmed' },
    { customerId: 2, clientName: 'Window Cancelled', date: '2026-02-10T11:00:00.000Z', status: 'cancelled' },
    { customerId: 2, clientName: 'Window At End', date: fixedEnd.toISOString(), status: 'confirmed' }
  ]);
  const between = await DB.getAppointmentsBetween(fixedStart, fixedEnd);
  const windowNames = between.filter(a => a.clientName.startsWith('Window ')).map(a => a.clientName);
  ok(engine + ': exact window is sorted and excludes cancelled rows',
    JSON.stringify(windowNames) === JSON.stringify(['Window Earlier', 'Window Later']), windowNames);
  ok(engine + ': exact window excludes its upper bound', !windowNames.includes('Window At End'), windowNames);
  const future = await DB.getFutureAppointmentsUntil(fixedEnd, fixedStart);
  ok(engine + ': future query uses explicit instants',
    future.some(a => a.clientName === 'Window Earlier') && !future.some(a => a.clientName === 'Window At End'));

  // UK calendar boundaries must use the real next UK midnight: spring has
  // 23 hours and autumn has 25. A row at the following midnight belongs only
  // to the following day.
  const springAnchor = new Date('2024-03-31T12:00:00.000Z');
  const springStart = sandboxUtils.ukMidnightInstant(2024, 3, 31);
  const springEnd = sandboxUtils.ukMidnightInstant(2024, 4, 1);
  const autumnAnchor = new Date('2024-10-27T12:00:00.000Z');
  const autumnStart = sandboxUtils.ukMidnightInstant(2024, 10, 27);
  const autumnEnd = sandboxUtils.ukMidnightInstant(2024, 10, 28);
  ok(engine + ': UK spring-forward calendar day is 23 hours', springEnd - springStart === 23 * 3600000);
  ok(engine + ': UK autumn-fallback calendar day is 25 hours', autumnEnd - autumnStart === 25 * 3600000);
  await DB.db.appointments.bulkAdd([
    { customerId: 2, clientName: 'Spring Last', date: new Date(springEnd.getTime() - 1), status: 'confirmed' },
    { customerId: 2, clientName: 'Spring Boundary', date: springEnd, status: 'confirmed' },
    { customerId: 2, clientName: 'Autumn Last', date: new Date(autumnEnd.getTime() - 1), status: 'confirmed' },
    { customerId: 2, clientName: 'Autumn Boundary', date: autumnEnd, status: 'confirmed' }
  ]);
  const springRows = await DB.getAppointmentsForUKDate(springAnchor);
  const autumnRows = await DB.getAppointmentsForUKCalendarDays(1, autumnAnchor);
  ok(engine + ': spring day includes last instant and excludes next midnight',
    springRows.some(a => a.clientName === 'Spring Last') && !springRows.some(a => a.clientName === 'Spring Boundary'));
  ok(engine + ': autumn day includes last instant and excludes next midnight',
    autumnRows.some(a => a.clientName === 'Autumn Last') && !autumnRows.some(a => a.clientName === 'Autumn Boundary'));
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
  await sandbox.initEncryption('test-passphrase-123');

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
  await sandbox.initEncryption('test-passphrase-123');

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
  const backupAudio = Buffer.from('backup-voice-note').toString('base64');
  await DB.addVoiceNote({ customerId: c1.id, appointmentId: a1.id, data: backupAudio, mimeType: 'audio/mp4', durationSeconds: 8, title: 'Backup note' });

  // Settings: real config plus runtime-only rows that must NOT travel.
  await DB.setSetting('config', { advisorName: 'Riaz', weeklyTarget: 600 });
  await DB.setSetting('__storage_probe__', { origin: 'test', updatedAt: now });
  await DB.setSetting('pitchDemoSeeded', true);
  await DB.setPrivateSetting('__device_ai_secret__', 'device-only-secret');
  const privateRow = await DB.db.settings.get('__device_ai_secret__');
  ok(engine + ': private setting decrypts on this device', (await DB.getPrivateSetting('__device_ai_secret__')) === 'device-only-secret');
  ok(engine + ': private setting is encrypted at rest', privateRow && typeof privateRow.value === 'object' && privateRow.value.ct && privateRow.value.iv, privateRow);

  const exported = await DB.exportAll();
  ok(engine + ': backup exports all 39 tables', Object.keys(exported).length === 39, Object.keys(exported));
  ok(engine + ': backup carries photos', exported.photos.length === 3, exported.photos.length);
  ok(engine + ': backup drops runtime-only settings', exported.settings.length === 1 && exported.settings[0].key === 'config', exported.settings);
  ok(engine + ': backup carries sequences', exported.sequences.length === 5, exported.sequences);
  ok(engine + ': backup photo payloads exact', exported.photos.some(p => p.data === photoB) && exported.photos.some(p => p.data === photoA));
  ok(engine + ': backup carries voice-note audio', exported.voiceNotes.length === 1 && exported.voiceNotes[0].data === backupAudio);

  // Wipe (simulating a lost/cleared device) then restore from the dump.
  await DB.deleteAllData();
  await DB.importAll(JSON.parse(JSON.stringify(exported)));

  const restored = await DB.exportAll();
  
  // Compare tables, decrypting customer PII fields for equivalence check
  // since AES-GCM uses random IVs per encryption.
  const tablesEqual = Object.keys(exported).every(t => {
    if (t === 'customers') {
      return exported.customers.length === restored.customers.length &&
        exported.customers.every((orig, i) => {
          const restored_c = restored.customers[i];
          // Compare non-PII fields directly
          return orig.id === restored_c.id &&
            orig.customerNumber === restored_c.customerNumber &&
            orig.status === restored_c.status &&
            orig.source === restored_c.source &&
            orig.createdAt === restored_c.createdAt &&
            orig.totalOrdersValue === restored_c.totalOrdersValue &&
            orig.totalCommission === restored_c.totalCommission &&
            orig.orderCount === restored_c.orderCount &&
            orig.referralCount === restored_c.referralCount &&
            orig.referralValue === restored_c.referralValue;
        });
    }
    return JSON.stringify(exported[t]) === JSON.stringify(restored[t]);
  });
  ok(engine + ': import reconstructs every table equivalently', tablesEqual);

  const restoredPhotos = await DB.db.photos.toArray();
  ok(engine + ': photo count after restore', restoredPhotos.length === 3);
  ok(engine + ': photo data integrity after restore', restoredPhotos.every(p => p.data === photoA || p.data === photoB));
  ok(engine + ': photo customer links intact', restoredPhotos.filter(p => p.customerId === c1.id).length === 2);
  ok(engine + ': voice note restores with links intact', (await DB.getVoiceNotes({ customerId: c1.id })).some(n => n.appointmentId === a1.id && n.data === backupAudio));
  ok(engine + ': settings restored', (await DB.getSetting('config')).weeklyTarget === 600);
  ok(engine + ': runtime settings NOT restored', (await DB.getSetting('__storage_probe__')) === null && (await DB.getSetting('pitchDemoSeeded')) === null);
  ok(engine + ': device secret never travels in the backup', (await DB.getPrivateSetting('__device_ai_secret__')) === null && !JSON.stringify(exported).includes('device-only-secret'));

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

  // Unknown tables cannot be silently discarded: that would report a
  // successful restore while losing data from a newer/incompatible model.
  await expectReject('unknown backup table', {
    customers: [goodCustomer],
    appointments: [],
    futureJobs: [{ id: 1 }]
  });

  // 3. Invalid record: entries that aren't record objects.
  await expectReject('malformed record', { customers: [null], appointments: [] });

  // 4. Duplicate primary ID.
  await expectReject('duplicate customer id', { customers: [goodCustomer, { ...goodCustomer }] });

  // 5. Dangling customer reference.
  await expectReject('dangling customer reference', {
    customers: [goodCustomer],
    appointments: [{ id: 9991, customerId: 424242, date: now }]
  });

  // Appointments WITHOUT a customerId are valid — phone conversions can be
  // typed straight onto the visit with no customer record yet, and the
  // backup must round-trip them. The dangling-reference case above still
  // rejects a customerId that points nowhere.
  {
    const pre = await DB.exportAll();
    const orphanAppt = { id: 9992, date: now, clientName: 'Phone Conversion', status: 'confirmed' };
    let threw = false;
    try { await DB.importAll({ customers: [], appointments: [orphanAppt] }); } catch (e) { threw = true; }
    ok(engine + ': appointment without customerId accepted', !threw);
    const after = await DB.exportAll();
    ok(engine + ': orphan appointment restored', after.appointments.some(a => a.id === 9992 && a.clientName === 'Phone Conversion'));
    // Restore the pre-test state so later assertions count customers correctly.
    await DB.importAll(JSON.parse(JSON.stringify(pre)));
    ok(engine + ': state restored after orphan-appointment test', (await DB.db.customers.count()) === 3, await DB.db.customers.count());
  }

  // Same optional-reference contract for trips (standalone mileage logs) and
  // communications (EOD notes written without a customer). Both are valid app
  // records and must round-trip through a backup.
  {
    const pre = await DB.exportAll();
    const orphanTrips = { customers: [], trips: [{ id: 9997, date: now, purpose: 'business', distanceKm: 12 }] };
    let threw = false;
    try { await DB.importAll(orphanTrips); } catch (e) { threw = true; }
    ok(engine + ': trip without appointmentId accepted', !threw);
    const orphanComms = { customers: [], communications: [{ id: 9998, type: 'note', content: 'EOD note', sentAt: now }] };
    threw = false;
    try { await DB.importAll(orphanComms); } catch (e) { threw = true; }
    ok(engine + ': communication without customerId accepted', !threw);
    await DB.importAll(JSON.parse(JSON.stringify(pre)));
    ok(engine + ': state restored after orphan trip/comm test', (await DB.db.customers.count()) === 3, await DB.db.customers.count());
  }

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
  await sandbox.initEncryption('test-passphrase-123');
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
  const storageContract = DB.storageContract();
  ok('envelope: authoritative storage contract is schema 9 / format 1',
    storageContract.databaseSchemaVersion === 9 && storageContract.backupFormatVersion === 1, storageContract);
  ok('envelope: backupFormatVersion present', backup.backupFormatVersion === 1, backup.backupFormatVersion);
  ok('envelope: databaseSchemaVersion present', backup.databaseSchemaVersion === 9, backup.databaseSchemaVersion);
  ok('envelope: appVersion present', backup.appVersion === '5.0', backup.appVersion);
  ok('envelope: legacy version field kept', backup.version === '5.0');
  ok('envelope: exportedAt timestamp', typeof backup.exportedAt === 'string' && !isNaN(Date.parse(backup.exportedAt)));
  ok('envelope: carries all 39 data tables', Object.keys(backup.data).length === 39, Object.keys(backup.data));
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

  const intactBeforeMetadataRejects = JSON.stringify(await DB.exportAll());
  threw = false;
  try {
    await ExportService.importBackup({ text: async () => JSON.stringify({
      backupFormatVersion: 1,
      databaseSchemaVersion: storageContract.databaseSchemaVersion + 1,
      appVersion: '6.0', version: '6.0', exportedAt: now, data: backup.data
    }) });
  } catch (e) { threw = e.message.includes('newer database schema'); }
  ok('envelope: future database schema rejected', threw);
  ok('envelope: future schema rejection leaves every table intact',
    JSON.stringify(await DB.exportAll()) === intactBeforeMetadataRejects);

  for (const [label, field, value] of [
    ['exportedAt', 'exportedAt', 'not-a-date'],
    ['database schema', 'databaseSchemaVersion', 0],
    ['app version', 'appVersion', { bad: true }]
  ]) {
    const malformed = { ...backup, [field]: value };
    threw = false;
    try { await ExportService.importBackup({ text: async () => JSON.stringify(malformed) }); } catch (e) { threw = true; }
    ok(`envelope: malformed ${label} metadata rejected`, threw);
    ok(`envelope: malformed ${label} leaves every table intact`,
      JSON.stringify(await DB.exportAll()) === intactBeforeMetadataRejects);
  }

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

// Immutable Phase 0 compatibility fixtures are executable contracts, not
// documentation samples. Exercise every fixture through both supported
// storage engines and prove record counts plus post-restore sequence floors.
async function runPhase0Fixtures(engine) {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures/phase0-manifest.json'), 'utf8'));
  for (const entry of manifest.fixtures) {
    const fixture = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures', entry.file), 'utf8'));
    const data = fixture.data;
    const sandbox = baseSandbox();
    if (engine === 'dexie') {
      const Dexie = require('dexie');
      Dexie.dependencies.indexedDB = indexedDB;
      Dexie.dependencies.IDBKeyRange = IDBKeyRange;
      sandbox.Dexie = Dexie;
    } else {
      sandbox.Dexie = loadShim(sandbox);
    }
    const DB = loadDbJs(sandbox, `advisoros_v6_fixture_${engine}_${entry.kind}_${Date.now()}`);
    await DB.init();
    await sandbox.initEncryption('fixture-passphrase');
    await DB.importAll(JSON.parse(JSON.stringify(data)));
    const restored = await DB.exportAll();
    const inputCounts = Object.fromEntries(DB.storageContract().backupTables.map(table => [table, (data[table] || []).length]));
    const expectedCounts = Object.fromEntries(DB.storageContract().backupTables.map(table => [table, entry.expectedCounts[table] || 0]));
    ok(`${engine}: ${entry.kind} fixture source counts match manifest`,
      JSON.stringify(inputCounts) === JSON.stringify(expectedCounts), { inputCounts, expected: expectedCounts });
    const recordsPreserved = DB.storageContract().backupTables
      .filter(table => table !== 'sequences')
      .every(table => restored[table].length === expectedCounts[table]);
    ok(`${engine}: ${entry.kind} fixture restores expected records`, recordsPreserved);
    const sequences = Object.fromEntries(restored.sequences.map(row => [row.name, row.value]));
    ok(`${engine}: ${entry.kind} fixture enforces sequence floors`,
      Object.entries(entry.expectedSequenceFloors).every(([name, floor]) => (sequences[name] || 0) >= floor),
      { sequences, floors: entry.expectedSequenceFloors });
  }
}

// Cross-install restore: a backup made under one passphrase must restore
// readable customers on a fresh install with a DIFFERENT passphrase. The
// store's customer rows carry ciphertext, so exportAll() must emit the
// decrypted record — importing ciphertext would re-lock it under the old
// key (importAll skips already-encrypted fields) and the restored customer
// list would be permanently unreadable.
async function runCrossInstallRestore(engine, tag) {
  const makeDb = name => {
    const sandbox = baseSandbox();
    if (engine === 'dexie') {
      const Dexie = require('dexie');
      Dexie.dependencies.indexedDB = indexedDB;
      Dexie.dependencies.IDBKeyRange = IDBKeyRange;
      sandbox.Dexie = Dexie;
    } else {
      sandbox.Dexie = loadShim(sandbox);
    }
    return { DB: loadDbJs(sandbox, name), sandbox };
  };

  const isEnc = v => v && typeof v === 'object' && 'iv' in v && 'ct' in v;

  // Device A: real key A.
  const { DB: dbA, sandbox: sbA } = makeDb('advisoros_v6_crossA_' + Date.now());
  await dbA.init();
  await sbA.initEncryption('device-a-passphrase');
  const a = await dbA.addCustomer({ firstName: 'Vera', lastName: 'Cross', phone: '07700 900777', email: 'vera@cross.test', address: { line1: '9 Backup Lane', town: 'Bolton', postcode: 'BL1 1AA', postcodeNormalized: 'BL11AA' } });
  await dbA.addAppointment({ customerId: a.id, date: new Date().toISOString(), type: 'consultation', clientName: 'Vera Cross' });

  const exported = await dbA.exportAll();
  const exportedCustomer = exported.customers.find(c => c.firstName === 'Vera');
  ok(engine + ': backup carries plaintext customer PII', !!exportedCustomer && !isEnc(exportedCustomer.firstName) && !isEnc(exportedCustomer.phone) && !isEnc(exportedCustomer.address.line1) && exportedCustomer.firstName === 'Vera', exportedCustomer && exportedCustomer.firstName);

  // Device B: fresh install, brand-new salt, different passphrase.
  const { DB: dbB, sandbox: sbB } = makeDb('advisoros_v6_crossB_' + Date.now());
  await dbB.init();
  await sbB.initEncryption('device-b-passphrase');
  await dbB.importAll(JSON.parse(JSON.stringify(exported)));

  const restored = await dbB.getCustomer(a.id);
  ok(engine + ': restore under different key decrypts', restored && restored.firstName === 'Vera' && restored.lastName === 'Cross' && restored.phone === '07700 900777' && restored.address.line1 === '9 Backup Lane', restored && restored.firstName);
  const raw = await dbB.db.customers.get(a.id);
  ok(engine + ': restored row re-encrypted at rest', isEnc(raw.firstName) && isEnc(raw.phone) && isEnc(raw.address.line1));
  const search = await dbB.searchCustomers('vera');
  ok(engine + ': restored customer searchable', search.length === 1 && search[0].firstName === 'Vera', search.length);
}

async function runMutationBoundaries(engine) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') {
    const Dexie = require('dexie');
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    sandbox.Dexie = Dexie;
  } else {
    sandbox.Dexie = loadShim(sandbox);
  }
  const DB = loadDbJs(sandbox, 'advisoros_v6_mutations_' + engine + '_' + Date.now());
  await DB.init();
  await sandbox.initEncryption('mutation-passphrase');
  const customer = await DB.addCustomer({ firstName: 'Jo', lastName: 'Field' });
  const appt = await DB.addAppointment({ customerId: customer.id, date: new Date().toISOString(), type: 'consultation' });
  const fields = { status: 'completed', outcome: 'ordered', value: 1000, commission: 100, completedAt: Date.now(), travelStatus: null };

  let result = await DB.completeVisitOutcome({ appointmentId: appt.id, appointmentFields: fields, paymentAmount: 200, paymentOperationId: 'door-1' });
  let linked = await DB.db.orders.where('appointmentId').equals(appt.id).toArray();
  ok(engine + ': outcome creates exactly one linked order', linked.length === 1, linked.length);
  ok(engine + ': door payment applied and clamped', result.payment.applied === 200 && linked[0].depositPaid === 200 && linked[0].balanceDue === 800, linked[0]);

  await DB.completeVisitOutcome({ appointmentId: appt.id, appointmentFields: fields, paymentAmount: 200, paymentOperationId: 'door-1' });
  linked = await DB.db.orders.where('appointmentId').equals(appt.id).toArray();
  ok(engine + ': retry token prevents duplicate payment', linked[0].depositPaid === 200 && linked[0].balanceDue === 800, linked[0]);

  await DB.completeVisitOutcome({ appointmentId: appt.id, appointmentFields: { ...fields, value: 1200 }, paymentAmount: 0 });
  linked = await DB.db.orders.where('appointmentId').equals(appt.id).toArray();
  ok(engine + ': re-save preserves paid amount without resurrecting full balance', linked.length === 1 && linked[0].depositPaid === 200 && linked[0].balanceDue === 1000, linked[0]);

  await DB.db.orders.add({ ...linked[0], id: undefined, orderNumber: 'DUPLICATE' });
  await DB.completeVisitOutcome({ appointmentId: appt.id, appointmentFields: { ...fields, value: 1200 } });
  linked = await DB.db.orders.where('appointmentId').equals(appt.id).toArray();
  ok(engine + ': reconciliation removes duplicate linked orders', linked.length === 1, linked.length);

  result = await DB.recordOrderPayment(linked[0].id, 99999);
  ok(engine + ': payment never exceeds balance', result.applied === 1000 && result.balanceDue === 0 && result.fullyPaid);

  await DB.completeVisitOutcome({ appointmentId: appt.id, appointmentFields: { ...fields, outcome: 'quoted', value: 900, commission: null } });
  linked = await DB.db.orders.where('appointmentId').equals(appt.id).toArray();
  const totals = await DB.db.customers.get(customer.id);
  ok(engine + ': ordered outcome reversal removes linked order and totals', linked.length === 0 && totals.orderCount === 0 && totals.totalOrdersValue === 0, { linked: linked.length, totals });

  if (engine === 'dexie') {
    const appt2 = await DB.addAppointment({ customerId: customer.id, date: new Date().toISOString(), type: 'consultation' });
    const originalRefresh = DB._refreshCustomerTotalsUnsafe;
    DB._refreshCustomerTotalsUnsafe = async () => { throw new Error('injected mutation failure'); };
    let threw = false;
    try {
      await DB.completeVisitOutcome({ appointmentId: appt2.id, appointmentFields: fields });
    } catch (e) { threw = true; }
    DB._refreshCustomerTotalsUnsafe = originalRefresh;
    const rolledBackAppt = await DB.getAppointment(appt2.id);
    const rolledBackOrders = await DB.db.orders.where('appointmentId').equals(appt2.id).toArray();
    ok('dexie: outcome mutation failure rolls back all records', threw && rolledBackAppt.outcome !== 'ordered' && rolledBackOrders.length === 0, { threw, outcome: rolledBackAppt.outcome, orders: rolledBackOrders.length });
  }
}

async function runPhase1WorkStorage(engine) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') {
    const Dexie = require('dexie');
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    sandbox.Dexie = Dexie;
  } else sandbox.Dexie = loadShim(sandbox);
  const DB = loadDbJs(sandbox, `advisoros_v6_phase1_${engine}_${Date.now()}`);
  await DB.init();
  await sandbox.initEncryption('phase1-passphrase');

  const lead = await DB.addLead({ firstName: 'Priya', lastName: 'Shah', phone: '07700 900444', address: { line1: '1 High Street', postcode: 'M1 1AA' }, source: 'website', notes: 'Call evenings' });
  const rawLead = await DB.db.leads.get(lead.id);
  ok(engine + ': lead PII encrypted at rest', typeof rawLead.firstName === 'object' && typeof rawLead.notes === 'object' && typeof rawLead.address === 'object');
  const readLead = await DB.getLead(lead.id);
  ok(engine + ': lead PII decrypts', readLead.firstName === 'Priya' && readLead.address.postcode === 'M1 1AA');

  const task = await DB.addTask({ title: 'Call Priya', notes: 'Discuss access', leadId: lead.id, dueAt: new Date(Date.now() + 3600000).toISOString() });
  const rawTask = await DB.db.tasks.get(task.id);
  ok(engine + ': task PII encrypted at rest', typeof rawTask.title === 'object' && typeof rawTask.notes === 'object');
  await DB.completeTask(task.id, 'complete-once');
  await DB.completeTask(task.id, 'complete-once');
  ok(engine + ': completion is idempotent', (await DB.getTaskEvents(task.id)).length === 1 && (await DB.getTask(task.id)).status === 'completed');
  await DB.snoozeTask(task.id, new Date(Date.now() + 86400000), 'snooze-once');
  await DB.snoozeTask(task.id, new Date(Date.now() + 86400000), 'snooze-once');
  ok(engine + ': snooze is idempotent', (await DB.getTaskEvents(task.id)).length === 2 && (await DB.getTask(task.id)).status === 'open');
  const derivedA = await DB.createTaskFromSuggestion('quote:42', { title: 'Follow up quote' });
  const derivedB = await DB.createTaskFromSuggestion('quote:42', { title: 'Duplicate ignored' });
  ok(engine + ': derived suggestion deduplicates', derivedA.id === derivedB.id);

  const converted = await DB.convertLeadToVisit(lead.id, { date: new Date().toISOString(), type: 'consultation' });
  const retry = await DB.convertLeadToVisit(lead.id, { date: new Date().toISOString(), type: 'consultation' });
  ok(engine + ': lead conversion is retry-safe', converted.customer.id === retry.customer.id && converted.appointment.id === retry.appointment.id && retry.lead.status === 'converted');

  const exported = await DB.exportAll();
  ok(engine + ': Phase 1 tables exported readable', exported.leads[0].firstName === 'Priya' && exported.tasks.some(t => t.title === 'Call Priya') && exported.taskEvents.length === 2);
  await DB.deleteAllData();
  await DB.importAll(JSON.parse(JSON.stringify(exported)));
  ok(engine + ': Phase 1 graph restores', (await DB.db.leads.count()) === 1 && (await DB.db.tasks.count()) === 2 && (await DB.db.taskEvents.count()) === 2);
  await DB.deleteCustomer(converted.customer.id);
  ok(engine + ': customer deletion removes linked Phase 1 graph', (await DB.db.leads.count()) === 0 && (await DB.db.tasks.count()) === 1 && (await DB.db.taskEvents.count()) === 0);
}

async function runPhase2QuoteStorage(engine) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') {
    const Dexie = require('dexie'); Dexie.dependencies.indexedDB = indexedDB; Dexie.dependencies.IDBKeyRange = IDBKeyRange; sandbox.Dexie = Dexie;
  } else sandbox.Dexie = loadShim(sandbox);
  const DB = loadDbJs(sandbox, `advisoros_v6_phase2_${engine}_${Date.now()}`);
  await DB.init(); await sandbox.initEncryption('phase2-passphrase');
  const customer = await DB.addCustomer({ firstName: 'Quote', lastName: 'Customer' });
  const appointment = await DB.addAppointment({ customerId: customer.id, date: new Date().toISOString(), outcome: 'quoted', value: 999 });
  const created = await DB.createQuote({ customerId: customer.id, appointmentId: appointment.id, notes: 'Private quote note', termsSnapshot: 'Payment terms', discountPercent: 10, taxTreatment: 'exclusive', taxRate: 20, items: [
    { description: 'Blind supply', quantity: 2, unit: 'each', unitPrice: 100, cost: 40 },
    { description: 'Fitting', quantity: 1, unit: 'service', unitPrice: 50, cost: 10 }
  ] });
  ok(engine + ': quote totals derive from line items', created.quote.subtotal === 250 && created.quote.discountAmount === 25 && created.quote.taxAmount === 45 && created.quote.total === 270 && created.quote.totalCost === 90, created.quote);
  ok(engine + ': historic appointment value is untouched', (await DB.getAppointment(appointment.id)).value === 999);
  const rawQuote = await DB.db.quotes.get(created.quote.id); const rawItems = await DB.db.quoteItems.where('quoteId').equals(created.quote.id).toArray();
  ok(engine + ': quote content encrypted at rest', typeof rawQuote.notes === 'object' && typeof rawQuote.termsSnapshot === 'object' && typeof rawItems[0].description === 'object');
  const updated = await DB.updateQuote(created.quote.id, { discountAmount: 20 }, [{ description: 'Revised package', quantity: 1, unitPrice: 300, cost: 120 }]);
  ok(engine + ': draft update replaces items and recalculates', updated.items.length === 1 && updated.quote.subtotal === 300 && updated.quote.total === 336);
  await DB.issueQuote(created.quote.id);
  let editRejected = false; try { await DB.updateQuote(created.quote.id, { notes: 'mutate issued' }); } catch (e) { editRejected = true; }
  ok(engine + ': issued quote is immutable', editRejected);
  const expiring = await DB.createQuote({ customerId: customer.id, items: [{ description: 'Expiry test', quantity: 1, unitPrice: 10 }] });
  await DB.issueQuote(expiring.quote.id);
  const expired = await DB.expireQuote(expiring.quote.id);
  ok(engine + ': issued quote can be explicitly expired idempotently', expired.status === 'expired' && (await DB.expireQuote(expiring.quote.id)).status === 'expired');
  const versioned = await DB.createQuoteVersion(created.quote.id, { notes: 'Version two' });
  ok(engine + ': version preserves number and supersedes old', versioned.quote.version === 2 && versioned.quote.quoteNumber === created.quote.quoteNumber && (await DB.getQuote(created.quote.id)).quote.status === 'superseded');
  await DB.issueQuote(versioned.quote.id); await DB.acceptQuote(versioned.quote.id, { acceptanceName: 'Customer' });
  const conversions = await Promise.all([DB.convertAcceptedQuoteToOrder(versioned.quote.id, 'convert-a'), DB.convertAcceptedQuoteToOrder(versioned.quote.id, 'convert-b')]);
  const linkedOrders = await DB.db.orders.where('quoteId').equals(versioned.quote.id).toArray();
  ok(engine + ': accepted quote converts exactly once', linkedOrders.length === 1 && conversions.filter(r => r.created).length === 1 && linkedOrders[0].total === versioned.quote.total, { count: linkedOrders.length, created: conversions.map(r => r.created) });
  ok(engine + ': quote sequence initialized', (await DB.db.sequences.get('quote')).value >= 1);
  const exported = await DB.exportAll(); await DB.deleteAllData(); await DB.importAll(JSON.parse(JSON.stringify(exported)));
  ok(engine + ': quote graph backup restores', (await DB.db.quotes.count()) === 3 && (await DB.db.quoteItems.count()) === 3 && (await DB.db.orders.where('quoteId').equals(versioned.quote.id).count()) === 1);
  const next = await DB.createQuote({ customerId: customer.id, items: [{ description: 'Next', quantity: 1, unitPrice: 1 }] });
  ok(engine + ': quote numbering continues after restore', next.quote.quoteNumber !== created.quote.quoteNumber);
}

async function runPhase3JobStorage(engine) {
  const sandbox = baseSandbox();
  if (engine === 'dexie') { const Dexie = require('dexie'); Dexie.dependencies.indexedDB = indexedDB; Dexie.dependencies.IDBKeyRange = IDBKeyRange; sandbox.Dexie = Dexie; }
  else sandbox.Dexie = loadShim(sandbox);
  const DB = loadDbJs(sandbox, `advisoros_v6_phase3_${engine}_${Date.now()}`); await DB.init(); await sandbox.initEncryption('phase3-passphrase');
  const customer = await DB.addCustomer({ firstName: 'Job', lastName: 'Customer' });
  const order = await DB.addOrder({ customerId: customer.id, total: 800 });
  const first = await DB.createJobFromOrder(order.id, { type: 'fitting', notes: 'Private fitting note' }, 'job-op-1');
  const retry = await DB.createJobFromOrder(order.id, { type: 'fitting' }, 'job-op-1');
  const second = await DB.createJobFromOrder(order.id, { type: 'service_call' }, 'job-op-2');
  ok(engine + ': job creation dedupes operation but permits multiple jobs per order', first.created && !retry.created && second.created && first.job.id !== second.job.id);
  ok(engine + ': job PII encrypted at rest', typeof (await DB.db.jobs.get(first.job.id)).notes === 'object');
  const template = await DB.createChecklistTemplate({ name: 'Fitting', visitType: 'fitting' }, [{ label: 'Check brackets', required: true }, { label: 'Clean area', required: false }]);
  const visits = await Promise.all([
    DB.scheduleJobVisit(first.job.id, { date: new Date().toISOString(), type: 'fitting', operationId: 'visit-op-1' }),
    DB.scheduleJobVisit(first.job.id, { date: new Date().toISOString(), type: 'fitting', operationId: 'visit-op-1' })
  ]);
  ok(engine + ': job visit scheduling is retry-safe', visits[0].id === visits[1].id && (await DB.getJobAppointments(first.job.id)).length === 1 && (await DB.getJob(first.job.id)).status === 'fitting_scheduled');
  if (engine === 'dexie') {
    const originalUpdate = DB.db.jobs.update.bind(DB.db.jobs); DB.db.jobs.update = async () => { throw new Error('injected job scheduling failure'); };
    let threw = false; try { await DB.scheduleJobVisit(second.job.id, { date: new Date(Date.now() + 86400000).toISOString(), operationId: 'visit-fail' }); } catch (e) { threw = true; }
    DB.db.jobs.update = originalUpdate;
    ok('dexie: scheduling failure rolls back appointment', threw && !(await DB.getJobAppointments(second.job.id)).some(a => a.jobScheduleOperationId === 'visit-fail'));
  }
  let completionBlocked = false; try { await DB.completeJob(first.job.id, { confirmed: true, operationId: 'complete-1' }); } catch (e) { completionBlocked = true; }
  ok(engine + ': mandatory checklist blocks completion', completionBlocked);
  await DB.setChecklistResponse({ jobId: first.job.id, appointmentId: visits[0].id, checklistItemId: template.items[0].id, completed: true, notes: 'Done safely' });
  const issue = await DB.addJobIssue(first.job.id, { title: 'Damaged part', type: 'damaged_material', dueAt: new Date(Date.now() + 86400000).toISOString() });
  let issueBlocked = false; try { await DB.completeJob(first.job.id, { confirmed: true, operationId: 'complete-2' }); } catch (e) { issueBlocked = true; }
  ok(engine + ': open issue blocks completion', issueBlocked);
  let resolveBlocked = false; try { await DB.resolveJobIssue(issue.id, 'Replaced'); } catch (e) { resolveBlocked = true; }
  ok(engine + ': issue resolution requires confirmation', resolveBlocked);
  await DB.resolveJobIssue(issue.id, 'Replaced', { confirmed: true });
  const completed = await DB.completeJob(first.job.id, { confirmed: true, operationId: 'complete-3' });
  let signoffBlocked = false; try { await DB.signOffJob(second.job.id, { confirmed: true }); } catch (e) { signoffBlocked = true; }
  const signed = await DB.signOffJob(first.job.id, { confirmed: true, customerName: 'Customer', operationId: 'sign-1' });
  ok(engine + ': completion and sign-off are explicit and separate from payment', completed.status === 'completed' && signed.status === 'signed_off' && signoffBlocked && (await DB.db.orders.get(order.id)).balanceDue === 800);
  const rawResponse = (await DB.db.checklistResponses.where('jobId').equals(first.job.id).first()); const rawIssue = await DB.db.jobIssues.get(issue.id); const rawSigned = await DB.db.jobs.get(first.job.id);
  ok(engine + ': job operational PII encrypted', typeof rawResponse.notes === 'object' && typeof rawIssue.title === 'object' && typeof rawIssue.resolution === 'object' && typeof rawSigned.signoffName === 'object');
  await DB.addPhoto({ customerId: customer.id, jobId: first.job.id, appointmentId: visits[0].id, data: Buffer.from('job-photo').toString('base64') });
  const exported = await DB.exportAll(); await DB.deleteAllData(); await DB.importAll(JSON.parse(JSON.stringify(exported)));
  ok(engine + ': job graph backup restores', (await DB.db.jobs.count()) === 2 && (await DB.db.checklistTemplates.count()) === 1 && (await DB.db.checklistItems.count()) === 2 && (await DB.db.checklistResponses.count()) === 1 && (await DB.db.jobIssues.count()) === 1 && (await DB.db.photos.where('jobId').equals(first.job.id).count()) === 1);
  await DB.deleteCustomer(customer.id);
  ok(engine + ': customer deletion removes job graph', (await DB.db.jobs.count()) === 0 && (await DB.db.checklistResponses.count()) === 0 && (await DB.db.jobIssues.count()) === 0);
}

async function runPhase4FinanceStorage(engine){
 const sandbox=baseSandbox();if(engine==='dexie'){const Dexie=require('dexie');Dexie.dependencies.indexedDB=indexedDB;Dexie.dependencies.IDBKeyRange=IDBKeyRange;sandbox.Dexie=Dexie;}else sandbox.Dexie=loadShim(sandbox);const DB=loadDbJs(sandbox,`advisoros_v6_phase4_${engine}_${Date.now()}`);await DB.init();await sandbox.initEncryption('phase4-pass');
 const c=await DB.addCustomer({firstName:'Finance',lastName:'Customer'});const o=await DB.addOrder({customerId:c.id,total:500});await DB.db.orders.update(o.id,{depositPaid:100,balanceDue:400});const migrated=await DB.migrateLegacyOrderPayment(o.id);const again=await DB.migrateLegacyOrderPayment(o.id);ok(engine+': unambiguous legacy payment migrates exactly once',migrated&&again===null&&(await DB.db.payments.where('orderId').equals(o.id).count())===1);
 const p=await DB.recordLedgerPayment({orderId:o.id,amount:200,method:'card',reference:'REF',notes:'Private',operationId:'pay-1'});await DB.recordLedgerPayment({orderId:o.id,amount:200,operationId:'pay-1'});let sum=await DB.reconcileOrderBalance(o.id);ok(engine+': ledger payment idempotent and projects order',sum.paid===300&&sum.balanceDue===200&&(await DB.db.payments.where('orderId').equals(o.id).count())===2);
 await DB.refundPayment(p.id,{amount:50,operationId:'refund-1'});let over=false;try{await DB.refundPayment(p.id,{amount:151,operationId:'refund-over'});}catch(e){over=true;}let reverseRefund=false;try{await DB.reversePayment((await DB.getPayments({kind:'refund'}))[0].id,{operationId:'bad-reverse'});}catch(e){reverseRefund=true;}sum=await DB.reconcileOrderLedger(o.id);ok(engine+': refunds are append-only and cannot over-credit',over&&reverseRefund&&sum.paid===250&&sum.balanceDue===250);
 const invoice=await DB.createInvoice({customerId:c.id,orderId:o.id,terms:'Private terms'},[{description:'Supply',quantity:2,unitPrice:100,taxRate:20}]);ok(engine+': invoice totals derive from items',invoice.invoice.subtotal===200&&invoice.invoice.taxAmount===40&&invoice.invoice.total===240);await DB.issueInvoice(invoice.invoice.id);let immutable=false;try{await DB.updateInvoice(invoice.invoice.id,{notes:'change'});}catch(e){immutable=true;}const credit=await DB.createCreditNote(invoice.invoice.id,{amount:40,reason:'Adjustment'});let overCredit=false;try{await DB.createCreditNote(invoice.invoice.id,{amount:201});}catch(e){overCredit=true;}ok(engine+': issued invoice immutable and credits bounded',immutable&&overCredit&&credit.creditNumber.startsWith('CRN-')&&(await DB.getCreditNote(credit.id)).reason==='Adjustment');
 await DB.recordPayment({orderId:o.id,invoiceId:invoice.invoice.id,amount:100,method:'bank',operationId:'invoice-pay'});const balance=await DB.getInvoiceBalance(invoice.invoice.id);ok(engine+': invoice balance reconciles payments and credits',balance.balanceDue===100);
 const doc=await DB.addDocumentMetadata({customerId:c.id,type:'receipt',paymentId:p.id,filename:'receipt.pdf',hash:'abc'});const receipt=await DB.getReceipt(p.id);ok(engine+': document metadata links without binary',receipt.document.id===doc.id&&receipt.payment.reference==='REF');
 const rawP=await DB.db.payments.get(p.id),rawI=await DB.db.invoices.get(invoice.invoice.id),rawC=await DB.db.creditNotes.get(credit.id);ok(engine+': finance PII encrypted at rest',typeof rawP.reference==='object'&&typeof rawI.terms==='object'&&typeof rawC.reason==='object');
 const exported=await DB.exportAll();await DB.deleteAllData();await DB.importAll(JSON.parse(JSON.stringify(exported)));ok(engine+': finance graph backup restores',(await DB.db.payments.count())===4&&(await DB.db.invoices.count())===1&&(await DB.db.invoiceItems.count())===1&&(await DB.db.creditNotes.count())===1&&(await DB.db.documents.count())===1);const inv2=await DB.createInvoice({customerId:c.id},[{description:'Next',quantity:1,unitPrice:1}]);ok(engine+': invoice numbering continues after restore',inv2.invoice.invoiceNumber!==invoice.invoice.invoiceNumber);
}

async function runPhase5ProfitabilityStorage(engine) {
  const sandbox=baseSandbox();if(engine==='dexie'){const Dexie=require('dexie');Dexie.dependencies.indexedDB=indexedDB;Dexie.dependencies.IDBKeyRange=IDBKeyRange;sandbox.Dexie=Dexie;}else sandbox.Dexie=loadShim(sandbox);const DB=loadDbJs(sandbox,`advisoros_v7_phase5_${engine}_${Date.now()}`);await DB.init();await sandbox.initEncryption('phase5-pass');
  const oldPolicy=await DB.createFinancialPolicy({mode:'sole_trader',effectiveFrom:'2026-01-01T00:00:00.000Z',commissionRate:10,paymentFeeRate:1.5,mileageRate:.45,labourHourlyCost:20});
  const c=await DB.addCustomer({firstName:'Profit',lastName:'Customer'});const q=await DB.createQuote({customerId:c.id,items:[{description:'Supply',quantity:2,unitPrice:300,cost:100}],createdAt:'2026-02-01T00:00:00.000Z'});const quoted=await DB.calculateQuoteProfitability(q.quote.id,4);
  ok(engine+': quote profitability is deterministic',quoted.revenue===600&&quoted.directCost===200&&quoted.grossProfit===400&&quoted.marginPercent===66.67&&quoted.effectiveHourlyValue===100&&quoted.policyId===oldPolicy.id);
  ok(engine+': financial mode changes revenue basis',DB._effectiveRevenue(1000,{mode:'commission_advisor',commissionRate:12.2})===122&&DB._effectiveRevenue(1000,{mode:'sole_trader'})===1000);
  await DB.acceptQuote(q.quote.id).catch(async()=>{await DB.issueQuote(q.quote.id);await DB.acceptQuote(q.quote.id);});const converted=await DB.convertAcceptedQuoteToOrder(q.quote.id);const job=(await DB.createJobFromOrder(converted.order.id,{},'profit-job')).job;
  const cost=await DB.addJobCost({jobId:job.id,orderId:converted.order.id,category:'materials',amount:125.555,description:'Private supplier detail',operationId:'cost-1'});const retry=await DB.addJobCost({jobId:job.id,orderId:converted.order.id,category:'materials',amount:999,operationId:'cost-1'});const actual=await DB.calculateJobProfitability(job.id,5);
  ok(engine+': actual costs are explicit, rounded and idempotent',cost.id===retry.id&&actual.directCost===125.56&&actual.grossProfit===474.44&&actual.effectiveHourlyValue===94.89);
  await DB.createFinancialPolicy({mode:'sole_trader',effectiveFrom:'2027-01-01T00:00:00.000Z',commissionRate:0,paymentFeeRate:2,mileageRate:.5,labourHourlyCost:25});const historic=await DB.calculateJobProfitability(job.id,5);let backdateBlocked=false;try{await DB.createFinancialPolicy({mode:'hybrid',effectiveFrom:'2026-06-01T00:00:00.000Z'});}catch(e){backdateBlocked=true;}
  ok(engine+': later policy does not rewrite historic result',historic.policyId===oldPolicy.id&&historic.grossProfit===actual.grossProfit&&backdateBlocked);
  ok(engine+': job cost PII encrypted at rest',typeof (await DB.db.jobCosts.get(cost.id)).description==='object');
  const exported=await DB.exportAll();await DB.deleteAllData();await DB.importAll(JSON.parse(JSON.stringify(exported)));ok(engine+': Phase 5 profitability graph restores',(await DB.db.jobCosts.count())===1&&(await DB.db.financialPolicies.count())===2&&(await DB.calculateJobProfitability(job.id,5)).grossProfit===474.44);
}

async function runPhase6RetentionStorage(engine) {
  const sandbox=baseSandbox();if(engine==='dexie'){const Dexie=require('dexie');Dexie.dependencies.indexedDB=indexedDB;Dexie.dependencies.IDBKeyRange=IDBKeyRange;sandbox.Dexie=Dexie;}else sandbox.Dexie=loadShim(sandbox);const DB=loadDbJs(sandbox,`advisoros_v8_phase6_${engine}_${Date.now()}`);await DB.init();await sandbox.initEncryption('phase6-pass');
  const c=await DB.addCustomer({firstName:'Retain',lastName:'Customer'}),o=await DB.addOrder({customerId:c.id,total:500}),j=(await DB.createJobFromOrder(o.id,{},'retain-job')).job;
  const retention=await DB.addRetentionRecord({customerId:c.id,orderId:o.id,jobId:j.id,type:'warranty',dueAt:'2027-01-01T10:00:00Z',notes:'Private warranty details',operationId:'ret-1'}),retry=await DB.addRetentionRecord({customerId:c.id,type:'warranty',operationId:'ret-1'});await DB.updateRetentionRecord(retention.id,{status:'completed',outcome:'Customer contacted',completedAt:'2027-01-02T10:00:00Z'});
  ok(engine+': retention records are linked, retry-safe and lifecycle-aware',retention.id===retry.id&&(await DB.getRetentionRecords({customerId:c.id,status:'completed'})).length===1);
  await DB.setContactPreference({customerId:c.id,channel:'whatsapp',status:'opted_in',consentSource:'Verbal',notes:'At visit'},'consent-1');await DB.setContactPreference({customerId:c.id,channel:'whatsapp',status:'opted_out',effectiveAt:'2027-02-01T00:00:00Z'},'consent-2');const preferences=await DB.getContactPreferences(c.id);ok(engine+': consent history retains current preference',preferences.history.length===2&&preferences.whatsapp.status==='opted_out');
  const communication=await DB.addCommunication({customerId:c.id,type:'whatsapp_attempted',content:'Hi'});await DB.recordCommunicationEvent(communication.id,'attempted',{detail:'Opened handoff'},'comm-1');await DB.recordCommunicationEvent(communication.id,'attempted',{},'comm-1');ok(engine+': communication lifecycle events are append-only and idempotent',(await DB.getCommunicationEvents(communication.id)).length===1);
  const link=await DB.upsertIntegrationLink({provider:'calendar',entityType:'appointment',localId:99,remoteId:'remote-1'});const conflict=await DB.addIntegrationConflict({integrationLinkId:link.id,localSnapshot:'private local',remoteSnapshot:'private remote'},'conflict-1');await DB.resolveIntegrationConflict(conflict.id,'keep_local',{notes:'Checked'});const queued=await DB.enqueueIntegrationOutbox({provider:'calendar',entityType:'appointment',localId:99,action:'upsert',payload:'private payload'},'outbox-1'),claimed=await DB.claimIntegrationOutbox('calendar');await DB.failIntegrationOutbox(claimed.id,'temporary','2027-01-01T00:00:00Z');ok(engine+': integration provenance, conflicts and outbox retain state',queued.id===claimed.id&&(await DB.getIntegrationConflicts({status:'resolved'})).length===1&&(await DB.getIntegrationOutbox({status:'retry'})).length===1);
  const raw=await DB.db.retentionRecords.get(retention.id),rawPreference=(await DB.db.contactPreferences.toArray())[0],rawOutbox=await DB.db.integrationOutbox.get(queued.id);ok(engine+': Phase 6 sensitive metadata encrypted',typeof raw.notes==='object'&&typeof rawPreference.consentSource==='object'&&typeof rawOutbox.payload==='object');
  const exported=await DB.exportAll();await DB.deleteAllData();await DB.importAll(JSON.parse(JSON.stringify(exported)));ok(engine+': Phase 6 graph backup restores',(await DB.db.retentionRecords.count())===1&&(await DB.db.contactPreferences.count())===2&&(await DB.db.communicationEvents.count())===1&&(await DB.db.integrationLinks.count())===1&&(await DB.db.integrationConflicts.count())===1&&(await DB.db.integrationOutbox.count())===1);
  await DB.deleteCustomer(c.id);ok(engine+': customer deletion removes retention and consent graph',(await DB.db.retentionRecords.count())===0&&(await DB.db.contactPreferences.count())===0&&(await DB.db.communicationEvents.count())===0);
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

  console.log('\nTest 9: cross-install restore — real Dexie');
  await runCrossInstallRestore('dexie', 'dexie');

  console.log('\nTest 10: cross-install restore — bundled shim');
  await runCrossInstallRestore('shim', 'shim');
  console.log('\nTest 11: mutation boundaries — real Dexie');
  await runMutationBoundaries('dexie');
  console.log('\nTest 12: mutation boundaries — bundled shim');
  await runMutationBoundaries('shim');
  console.log('\nTest 13: Phase 0 fixtures — real Dexie');
  await runPhase0Fixtures('dexie');
  console.log('\nTest 14: Phase 0 fixtures — bundled shim');
  await runPhase0Fixtures('shim');
  console.log('\nTest 15: Phase 1 durable work storage — real Dexie');
  await runPhase1WorkStorage('dexie');
  console.log('\nTest 16: Phase 1 durable work storage — bundled shim');
  await runPhase1WorkStorage('shim');
  console.log('\nTest 17: Phase 2 quote storage — real Dexie');
  await runPhase2QuoteStorage('dexie');
  console.log('\nTest 18: Phase 2 quote storage — bundled shim');
  await runPhase2QuoteStorage('shim');
  console.log('\nTest 19: Phase 3 job storage — real Dexie');
  await runPhase3JobStorage('dexie');
  console.log('\nTest 20: Phase 3 job storage — bundled shim');
  await runPhase3JobStorage('shim');
  console.log('\nTest 21: Phase 4 finance storage — real Dexie');await runPhase4FinanceStorage('dexie');
  console.log('\nTest 22: Phase 4 finance storage — bundled shim');await runPhase4FinanceStorage('shim');
  console.log('\nTest 23: Phase 5 profitability storage — real Dexie');await runPhase5ProfitabilityStorage('dexie');
  console.log('\nTest 24: Phase 5 profitability storage — bundled shim');await runPhase5ProfitabilityStorage('shim');
  console.log('\nTest 25: Phase 6 retention storage — real Dexie');await runPhase6RetentionStorage('dexie');
  console.log('\nTest 26: Phase 6 retention storage — bundled shim');await runPhase6RetentionStorage('shim');
  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });
