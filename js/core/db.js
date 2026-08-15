/* ============================================
   ADVISOROS v5.0 — DATABASE LAYER
   IndexedDB via Dexie.js
   ============================================ */

// Every table a backup can carry. exportAll() and importAll() speak this
// exact list; adding a table here is a backup-format change and must be
// mirrored in the backup envelope's versioning (js/services/export.js).
const BACKUP_TABLES = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications', 'photos', 'settings', 'sequences'];

// ============================================
// Field-level encryption (AES-GCM 256-bit, key from passphrase via PBKDF2)
// ============================================
const PII_FIELDS = ['firstName', 'lastName', 'phone', 'email', 'address'];
const ADDRESS_PII_FIELDS = ['line1', 'town', 'city', 'postcode', 'postcodeNormalized'];
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

let encryptionKey = null;
let encryptionSalt = null;

async function deriveKey(passphrase, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

async function getOrCreateSalt() {
  if (encryptionSalt) return encryptionSalt;
  const stored = localStorage.getItem('advisoros_enc_salt');
  if (stored) {
    encryptionSalt = new Uint8Array(JSON.parse(stored));
    return encryptionSalt;
  }
  encryptionSalt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem('advisoros_enc_salt', JSON.stringify(Array.from(encryptionSalt)));
  return encryptionSalt;
}

async function initEncryption(passphrase) {
  const salt = await getOrCreateSalt();
  encryptionKey = await deriveKey(passphrase, salt);
  // Verify the key works by encrypting/decrypting a test value
  const test = await encryptField('__test__');
  const decrypted = await decryptField(test);
  if (decrypted !== '__test__') throw new Error('Encryption verification failed');
  return true;
}

function clearEncryptionKey() {
  encryptionKey = null;
}

function hasEncryptionKey() {
  return encryptionKey !== null;
}

async function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  if (typeof plaintext !== 'string') plaintext = String(plaintext);
  if (!encryptionKey) throw new Error('Encryption key not initialized');
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    encoder.encode(plaintext)
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
}

async function decryptField(encrypted) {
  if (!encrypted || typeof encrypted !== 'object') return encrypted;
  if (typeof encrypted === 'string') return encrypted; // already plaintext (legacy)
  if (!encryptionKey) throw new Error('Encryption key not initialized');
  const iv = new Uint8Array(atob(encrypted.iv).split('').map(c => c.charCodeAt(0)));
  const ct = new Uint8Array(atob(encrypted.ct).split('').map(c => c.charCodeAt(0)));
  const decoder = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    ct
  );
  return decoder.decode(plaintext);
}

function isEncrypted(value) {
  return value && typeof value === 'object' && 'iv' in value && 'ct' in value;
}

async function encryptCustomer(customer) {
  const encrypted = { ...customer };
  for (const field of PII_FIELDS) {
    if (field === 'address' && encrypted.address) {
      const addr = { ...encrypted.address };
      for (const afield of ADDRESS_PII_FIELDS) {
        if (addr[afield] !== undefined && addr[afield] !== null && !isEncrypted(addr[afield])) {
          addr[afield] = await encryptField(addr[afield]);
        }
      }
      encrypted.address = addr;
    } else if (encrypted[field] !== undefined && encrypted[field] !== null && !isEncrypted(encrypted[field])) {
      encrypted[field] = await encryptField(encrypted[field]);
    }
  }
  return encrypted;
}

async function decryptCustomer(customer) {
  if (!customer) return customer;
  const decrypted = { ...customer };
  for (const field of PII_FIELDS) {
    if (field === 'address' && decrypted.address) {
      const addr = { ...decrypted.address };
      for (const afield of ADDRESS_PII_FIELDS) {
        if (addr[afield] !== undefined && addr[afield] !== null && isEncrypted(addr[afield])) {
          addr[afield] = await decryptField(addr[afield]);
        }
      }
      decrypted.address = addr;
    } else if (decrypted[field] !== undefined && decrypted[field] !== null && isEncrypted(decrypted[field])) {
      decrypted[field] = await decryptField(decrypted[field]);
    }
  }
  return decrypted;
}

async function migratePlaintextCustomers() {
  if (!encryptionKey) return;
  const customers = await DB.db.customers.toArray();
  let migrated = 0;
  for (const customer of customers) {
    let needsUpdate = false;
    for (const field of PII_FIELDS) {
      if (field === 'address' && customer.address) {
        for (const afield of ADDRESS_PII_FIELDS) {
          if (customer.address[afield] !== undefined && customer.address[afield] !== null && !isEncrypted(customer.address[afield])) {
            needsUpdate = true;
            break;
          }
        }
      } else if (customer[field] !== undefined && customer[field] !== null && !isEncrypted(customer[field])) {
        needsUpdate = true;
      }
      if (needsUpdate) break;
    }
    if (needsUpdate) {
      const encrypted = await encryptCustomer(customer);
      await DB.db.customers.put(encrypted);
      migrated++;
    }
  }
  if (migrated) {
    console.log(`Encrypted ${migrated} customer record(s)`);
  }
}

const DB = {
  db: null,

  // Safe JSON.parse wrapper with debugging for corrupted stored data
  safeJSONParse(str, key) {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch (e) {
      const preview = str.slice(0, 500);
      console.error(`JSON.parse failed for localStorage key "${key}":`, e.message);
      console.error(`Corrupted value preview: ${preview}`);
      try { localStorage.removeItem(key); } catch (err) {}
      throw e;
    }
  },

  async init() {
    // 'advisoros_v6' (NOT 'advisoros_v5'): the old storage engine (the
    // bundled mini-Dexie shim) created its IndexedDB stores without any
    // indexes under the name 'advisoros_v5'. Opening that same database with
    // real Dexie and a declared schema would put the upgrade into
    // unknown-schema territory - risky for user data. Instead we use a fresh
    // database name and copy the old records across once (see
    // _migrateFromLegacyDb), leaving the shim's database untouched as a
    // safety net.
    this.db = new Dexie('advisoros_v6');

    this.db.version(1).stores({
      // Core tables
      customers: '++id, customerNumber, firstName, lastName, phone, email, postcodeNormalized, source, status, createdAt',
      appointments: '++id, customerId, date, type, status, outcome, source, createdAt',
      orders: '++id, customerId, appointmentId, orderNumber, supplierOrderNumber, status, createdAt',
      expenses: '++id, date, category, amount, tripId, createdAt',
      trips: '++id, date, appointmentId, purpose, confirmed, createdAt',
      measurements: '++id, appointmentId, windowName, createdAt',
      communications: '++id, customerId, type, template, sentAt',

      // Settings & config
      settings: 'key',

      // Sequences for numbering
      sequences: 'name'
    });

    // Photos were added after the original v6 store — additive migration, so
    // existing databases keep their data and simply gain the new table.
    this.db.version(2).stores({
      photos: '++id, customerId, createdAt'
    });

    if (typeof this.db.open === 'function') {
      await this.db.open();
    }

    // Real Dexie doesn't have storageMode; set it so the storage
    // diagnostics (App.verifyStorage, Settings > Data) can report properly.
    if (!this.db.storageMode) {
      this.db.storageMode = ('indexedDB' in window && !!window.indexedDB) ? 'indexedDB' : 'memory';
    }

    // One-time copy of records left in the previous storage engine's
    // database ('advisoros_v5', created by the bundled mini-Dexie shim).
    await this._migrateFromLegacyDb();

    // Initialize sequences if not exist
    await this.initSequences();

    // One-time fixup: earlier versions had duplicate outcome ids that have
    // since been merged (see js/core/config.js). Rewrite any appointments
    // still carrying the old ids so filters/reports don't silently miss them.
    await this.migrateLegacyOutcomes();

    // One-time migration: encrypt any plaintext customer PII fields
    await migratePlaintextCustomers();

    console.log('Database initialized');
  },

  async migrateLegacyOutcomes() {
    // Straight renames - same meaning, just a merged/renamed id.
    const outcomeRemap = {
      measured_quoted_sold: 'ordered',
      measured_quoted: 'quoted',
      no_sale: 'other_no_sale'
    };

    const legacyIds = Object.keys(outcomeRemap);
    const affected = await this.db.appointments.where('outcome').anyOf(legacyIds).toArray();

    for (const appt of affected) {
      const newOutcome = outcomeRemap[appt.outcome];
      await this.db.appointments.update(appt.id, { outcome: newOutcome });
    }

    // 'measure_only' isn't a straight rename - no quote was actually given,
    // so mapping it to 'quoted' would wrongly trigger quote follow-up
    // messaging. Clear the outcome (visit stays logged, just un-set) and
    // flag it in notes so the history is still visible.
    //
    // IMPORTANT: must use `null` here, NOT `undefined`. Dexie's update()
    // (and the bundled mini-Dexie shim in js/vendor/minidexie.js) implement
    // field updates via Object.assign(target, changes). Object.assign
    // SILENTLY SKIPS properties whose value is `undefined`, so writing
    // `outcome: undefined` was a no-op - the old 'measure_only' value was
    // left untouched, defeating the whole point of this migration. `null`
    // is a real value and properly clears the field.
    const measureOnly = await this.db.appointments.where('outcome').equals('measure_only').toArray();
    for (const appt of measureOnly) {
      const existingNotes = appt.notes || '';
      const flag = '[Legacy outcome: Measure Only - re-review, no quote was given]';
      await this.db.appointments.update(appt.id, {
        outcome: null,
        notes: [existingNotes, flag].filter(Boolean).join('\n\n')
      });
    }

    const total = affected.length + measureOnly.length;
    if (total) {
      console.log(`Migrated ${total} appointment(s) from legacy outcome ids`);
    }
  },

  // One-time migration from the previous storage engine. Everything up to
  // v5.x stored records in an IndexedDB database named 'advisoros_v5'
  // created by the bundled mini-Dexie shim (js/vendor/minidexie.js) - raw
  // object stores, no indexes, same table names. On the first boot of the
  // Dexie-backed version, copy every non-empty table into this database.
  // The old database is left in place untouched as a safety net.
  async _migrateFromLegacyDb() {
    const LEGACY_DB = 'advisoros_v5';
    const FLAG = '__v6_legacy_migrated__';
    if (!('indexedDB' in window)) return;

    try {
      if (await this.getSetting(FLAG)) return;

      const legacyDb = await new Promise((resolve, reject) => {
        const req = indexedDB.open(LEGACY_DB);
        req.onerror = () => reject(req.error);
        req.onblocked = () => {};
        req.onsuccess = () => resolve(req.result);
      });

      const tables = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications', 'settings', 'sequences'];
      let copied = 0;
      for (const table of tables) {
        // Never overwrite: this table already has data in the new database
        // (e.g. an import/restore happened before the migration ran).
        if (await this.db[table].count() > 0) continue;

        let rows = null;
        if (legacyDb.objectStoreNames.contains(table)) {
          rows = await new Promise((resolve, reject) => {
            const tx = legacyDb.transaction(table, 'readonly');
            const req = tx.objectStore(table).getAll();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result || []);
          });
        }

        // Users whose browser couldn't open IndexedDB (shim-era fallback)
        // have their rows in localStorage under 'advisoros:<dbName>:<table>'
        // instead of the legacy database. The old shim would only use this
        // path when IDB was genuinely unavailable, so few users have it —
        // but they'd otherwise boot to an empty app with no way back.
        if (!rows || !rows.length) {
          rows = this._readLegacyLocalStorageRows(table);
        }

        if (rows && rows.length) {
          await this.db[table].bulkAdd(rows);
          copied += rows.length;
        }
      }

      // Guard the sequence counters: never start numbering below the highest
      // number the migrated records already carry.
      for (const name of ['customer', 'order']) {
        const seq = await this.db.sequences.get(name);
        if (!seq) continue;
        const prefix = name === 'customer' ? 'CUS-' : 'ORD-';
        const year = new Date().getFullYear();
        const re = new RegExp(`^${prefix}\\d{4}-(\\d+)$`);
        const maxSeq = Math.max(...(await this.db[name + 's'].toArray()).map(r => {
          const m = String(r[name + 'Number'] || '').match(re);
          return m ? parseInt(m[1], 10) : 0;
        }));
        if (maxSeq > seq.value) {
          await this.db.sequences.update(name, { value: maxSeq });
        }
      }

      // Close the legacy connection: leaving it open would block any later
      // version upgrade of that database (and is the kind of connection the
      // old engine itself would have kept around in other tabs).
      legacyDb.close();

      if (copied) {
        console.log(`AdvisorOS: migrated ${copied} record(s) from the previous storage engine`);
      }
      await this.setSetting(FLAG, true);
    } catch (e) {
      // Nothing to migrate, or migration failed - either way the app runs
      // fine with an empty database; don't block startup over it.
      console.warn('AdvisorOS: legacy data migration skipped:', e);
    }
  },

  // Shim-era localStorage fallback rows: 'advisoros:<dbName>:<table>' ->
  // JSON { nextId, rows }. The dbName is unknown to us now, so match any
  // 'advisoros:' key that ends in ':table'.
  _readLegacyLocalStorageRows(table) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('advisoros:') || !key.endsWith(':' + table)) continue;
        const parsed = this.safeJSONParse(localStorage.getItem(key), key);
        if (parsed && Array.isArray(parsed.rows) && parsed.rows.length) {
          return parsed.rows;
        }
      }
    } catch (e) {
      console.warn('AdvisorOS: legacy localStorage read failed for', table, e);
    }
    return null;
  },

  async initSequences() {
    const sequences = ['customer', 'order'];
    for (const name of sequences) {
      const exists = await this.db.sequences.get(name);
      if (!exists) {
        await this.db.sequences.put({ name, value: 0 });
      }
    }
  },

  async getNextSequence(name) {
    // Real Dexie: increment + read inside ONE readwrite transaction so two
    // interleaved calls can never hand out the same number. (The mini-Dexie
    // shim has no transaction() - fall back to the old update-then-read,
    // which is fine there because its calls are serialized in practice.)
    if (typeof this.db.transaction === 'function') {
      return await this.db.transaction('rw', this.db.sequences, async () => {
        const seq = await this.db.sequences.get(name);
        const next = (seq ? seq.value : 0) + 1;
        await this.db.sequences.put({ name, value: next });
        return next;
      });
    }
    await this.db.sequences.update(name, seq => {
      seq.value += 1;
    });
    const seq = await this.db.sequences.get(name);
    return seq.value;
  },

  // Customer operations
  async addCustomer(data) {
    const seq = await this.getNextSequence('customer');
    const prefix = 'CUS';
    const customerNumber = `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

    const customer = {
      ...data,
      customerNumber,
      status: 'active',
      totalOrdersValue: 0,
      totalCommission: 0,
      orderCount: 0,
      referralCount: 0,
      referralValue: 0,
      createdAt: new Date().toISOString()
    };

    const encryptedCustomer = await encryptCustomer(customer);
    const id = await this.db.customers.add(encryptedCustomer);
    return { ...encryptedCustomer, id };
  },

  // Deletes the customer plus everything keyed to them - appointments and
  // their measurements and trips, orders, communications, and photos.
  // Customer data is an operational-memory graph: measurements and trips
  // hang off appointments (not the customer row), so the customer's
  // appointment IDs are collected first and used to clear both tables before
  // the appointments themselves go. A customer row alone doesn't show up
  // anywhere by itself; it's always reached through one of these related
  // records, so leaving them behind after "deleting" a customer would just
  // produce orphaned visits/orders that still show a name but silently fail
  // to open (or worse, point at a different customer if IDs get reused).
  // Returns how many of each were removed so the caller can tell the person
  // what actually happened, not just "done".
  async deleteCustomer(customerId) {
    const [appts, orders, comms] = await Promise.all([
      this.db.appointments.where('customerId').equals(customerId).toArray(),
      this.db.orders.where('customerId').equals(customerId).toArray(),
      this.db.communications.where('customerId').equals(customerId).toArray()
    ]);
    const photoCount = await this.db.photos.where('customerId').equals(customerId).count();
    const apptIds = appts.map(a => a.id);
    const [measurementCount, tripCount] = await Promise.all([
      this.db.measurements.where('appointmentId').anyOf(apptIds).delete(),
      this.db.trips.where('appointmentId').anyOf(apptIds).delete()
    ]);
    await Promise.all([
      this.db.appointments.where('customerId').equals(customerId).delete(),
      this.db.orders.where('customerId').equals(customerId).delete(),
      this.db.communications.where('customerId').equals(customerId).delete(),
      this.db.photos.where('customerId').equals(customerId).delete()
    ]);
    await this.db.customers.delete(customerId);
    return { appointments: appts.length, orders: orders.length, communications: comms.length, photos: photoCount, measurements: measurementCount, trips: tripCount };
  },

  // ---- Full factory reset ----
  // Clears every table (customers, visits, orders, photos, config, ...) plus
  // all app-prefixed localStorage keys (config, auto-message flags, active
  // trip), so the next page load boots back into onboarding. No undo —
  // callers must confirm first.
  async deleteAllData() {
    const tables = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications', 'photos', 'settings', 'sequences'];
    await Promise.all(tables.map(t => this.db[t] ? this.db[t].clear() : Promise.resolve()));
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('advisoros') === 0) doomed.push(key);
    }
    doomed.forEach(key => localStorage.removeItem(key));
  },

  // ---- Customer photos (gallery stored in the local database) ----
  // Photos arrive as base64 strings (the UI downscales + encodes them), not
  // Blobs: the bundled mini-Dexie fallback serializes records through JSON,
  // which would silently turn every Blob into an empty object. Base64 rides
  // through both engines intact and renders straight into <img> data URLs.
  // Photos are part of the operational customer record (window/wall photos an
  // advisor may rely on), so they ARE included in exportAll()/importAll() —
  // a restored backup must reconstruct them, not leave them behind.
  async addPhoto({ customerId, data, mimeType = 'image/jpeg', caption = '' }) {
    const photo = {
      customerId,
      data,
      mimeType,
      caption: caption || '',
      createdAt: new Date().toISOString()
    };
    const id = await this.db.photos.add(photo);
    return { ...photo, id };
  },

  async getPhotosForCustomer(customerId) {
    const photos = await this.db.photos.where('customerId').equals(customerId).toArray();
    photos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return photos;
  },

  async deletePhoto(photoId) {
    await this.db.photos.delete(photoId);
  },

  async searchCustomers(query) {
    const normalized = query.toLowerCase().trim();

    const customers = await this.db.customers.toArray();
    const results = [];
    for (const c of customers) {
      const decrypted = await decryptCustomer(c);
      if ((decrypted.firstName && decrypted.firstName.toLowerCase().includes(normalized)) ||
          (decrypted.lastName && decrypted.lastName.toLowerCase().includes(normalized)) ||
          (decrypted.fullName && decrypted.fullName.toLowerCase().includes(normalized)) ||
          (decrypted.customerNumber && decrypted.customerNumber.toLowerCase().includes(normalized)) ||
          (decrypted.phone && decrypted.phone.includes(normalized)) ||
          ((decrypted.postcodeNormalized || decrypted.address?.postcodeNormalized || '').includes(normalized.replace(/\s/g, '').toUpperCase())) ||
          (decrypted.address && decrypted.address.line1 && decrypted.address.line1.toLowerCase().includes(normalized))) {
        results.push(decrypted);
        if (results.length >= 20) break;
      }
    }
    return results;
  },

  // Fetch one customer by id, decrypting PII fields (the raw row carries
  // encrypted {iv,ct} values; features must not read DB.db.customers.get()).
  async getCustomer(customerId) {
    if (!customerId) return null;
    const row = await this.db.customers.get(customerId);
    return row ? decryptCustomer(row) : null;
  },

  // Fetch every customer, decrypting PII fields.
  async getAllCustomers() {
    const rows = await this.db.customers.toArray();
    return Promise.all(rows.map(c => decryptCustomer(c)));
  },

  // Batch-fetch customers by id, decrypting PII fields (bulkGet returns the
  // raw rows, which carry encrypted {iv,ct} values under field-level
  // encryption — features must not read DB.db.customers directly).
  async getCustomersByIds(ids) {
    const valid = [...new Set((ids || []).filter(Boolean))];
    if (!valid.length) return [];
    const rows = await this.db.customers.bulkGet(valid);
    return Promise.all(rows.filter(Boolean).map(c => decryptCustomer(c)));
  },

  // Find a customer by phone number. The phone column is encrypted at rest
  // (PII_FIELDS), so an indexed .where('phone') query can never match —
  // scan + decrypt instead, mirroring searchCustomers.
  async findCustomerByPhone(phone) {
    if (!phone) return null;
    const normalized = String(phone).trim();
    const customers = await this.db.customers.toArray();
    for (const c of customers) {
      const decrypted = await decryptCustomer(c);
      if (decrypted.phone && String(decrypted.phone).trim() === normalized) {
        return decrypted;
      }
    }
    return null;
  },

  // Update a customer row, encrypting PII fields so updates never write
  // plaintext into the encrypted columns (raw DB.db.customers.update()
  // would leave mixed-state rows that break the at-rest guarantee).
  async updateCustomer(customerId, fields) {
    const encrypted = await encryptCustomer(fields);
    await this.db.customers.update(customerId, encrypted);
  },

  // Appointment operations
  async addAppointment(data) {
    const appointment = {
      ...data,
      status: data.status || 'confirmed',
      outcome: data.outcome || null,
      value: data.value || 0,
      commission: data.commission || 0,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.appointments.add(appointment);
    return { ...appointment, id };
  },

  // Appointment rows can hold `date` as a Date object (older storage
  // engines, imports) or an ISO string (every current save path). A
  // string-bounded index range (between) silently skips Date-object rows —
  // IndexedDB orders Date keys before all strings — leaving that visit
  // searchable by customer yet invisible in the diary, Today and the
  // calendar. Compare in JS after parsing instead, so every storage shape
  // lands in the right day/range.
  _inDateWindow(value, start, end) {
    const d = value instanceof Date ? value : new Date(value);
    return !isNaN(d.getTime()) && d >= start && d <= end;
  },

  async getAppointmentsForDate(date) {
    // The day window is [UK midnight, +24h) of the instant's UK calendar
    // day — the app's date contract everywhere else. The old version did
    // setHours(0,0,0,0) in the DEVICE's timezone, so on any non-UK device
    // the "today" list silently started/finished hours off (early-morning
    // UK visits dropped, late-evening ones bleeding across days).
    const p = Utils.ukParts(new Date(date));
    const start = Utils.ukMidnightInstant(p.year, p.month, p.day);
    const end = new Date(start.getTime() + 86400000);

    const rows = await this.db.appointments.toArray();
    return rows.filter(a => a.status !== 'cancelled' && this._inDateWindow(a.date, start, end));
  },

  // Generic date-range fetch — used by the standard month calendar view.
  async getAppointmentsForRange(startDate, endDate) {
    // startDate/endDate arrive as UK-midnight instants (Utils week/month
    // windows); use them exactly. The old version re-mangled them through
    // device-local setHours, which on a non-UK device shrank the range to a
    // few hours and cut the week/month view to a sliver of appointments.
    const start = new Date(startDate);
    const end = new Date(endDate);

    const rows = await this.db.appointments.toArray();
    return rows.filter(a => a.status !== 'cancelled' && this._inDateWindow(a.date, start, end));
  },

  async getUpcomingAppointments(days = 7) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    const rows = await this.db.appointments.toArray();
    // Chronological order — "next visit" everywhere is the first row after
    // .find(), and insertion order (row id) is NOT booking date order, so an
    // appointment booked later for an earlier date would otherwise mask the
    // ones in between (e.g. a 24th created before two 17ths).
    return rows
      .filter(a => a.status !== 'cancelled' && this._inDateWindow(a.date, now, future))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  // Canonical weekly stats: sales value, earnings (commission) and order
  // count for a period, counting ONLY appointments that actually happened
  // (status !== 'cancelled') AND were sold (outcome === 'ordered').
  //
  // This is the single source of truth for "how am I doing this week" -
  // Today's dashboard, the Money screen and the Home screen all call this
  // instead of running their own query (the old copies drifted apart, and
  // none of them excluded cancelled visits, so cancelling a sold visit kept
  // counting toward the weekly target).
  async getWeekStats(startISO, endISO) {
    const start = new Date(startISO);
    const end = new Date(endISO);
    const rows = await this.db.appointments.toArray();
    const appts = rows.filter(a => a.status !== 'cancelled' && a.outcome === 'ordered' && this._inDateWindow(a.date, start, end));

    let sales = 0;
    let earnings = 0;
    for (const a of appts) {
      sales += a.value || 0;
      if (typeof a.commission === 'number' && a.commission > 0) {
        earnings += a.commission;
      } else {
        earnings += TaxCalculator.estimateCommission(a.value || 0);
      }
    }
    return { sales, earnings, orderedCount: appts.length };
  },

  async getPipeline() {
    const now = new Date().toISOString();

    // FIX: Dexie 3 doesn't support sortBy() after filter/and
    // Get results first, then sort in JavaScript.
    // Cancelled visits are excluded so a cancelled quote/thinking lead can't
    // keep generating follow-up nudges forever.
    const results = await this.db.appointments
      .where('outcome')
      .anyOf([
        'quoted',
        'thinking',
        'partner',
        'compare_quotes',
        'expensive',
        'customer_no_show',
        'advisor_unavailable'
      ])
      .and(a => a.status !== 'cancelled')
      .and(a => new Date(a.date) <= new Date(now))
      .toArray();

    // Sort by date ascending (oldest first = most urgent)
    return results.sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  // Order operations
  async addOrder(data) {
    const seq = await this.getNextSequence('order');
    const prefix = 'ORD';
    const orderNumber = `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

    // Calculate deposit
    const deposit = App.calculateDeposit(data.total || 0);

    const order = {
      ...data,
      orderNumber,
      depositRequired: deposit.amount,
      depositPaid: 0,
      balanceDue: data.total || 0,
      status: 'deposit_pending',
      reviewRequested: false,
      referralRequested: false,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.orders.add(order);

    // Customer totals are RECOMPUTED from the orders table rather than
    // incremented inline here. The old increment-only approach drifted
    // whenever an order was edited, deleted, or re-created (e.g. an outcome
    // flipped away from 'ordered' and back), leaving customer value/count
    // totals permanently wrong. Recompute keeps them correct for any order
    // lifecycle - refreshCustomerTotals is the only writer of these fields.
    if (data.customerId) {
      await this.refreshCustomerTotals(data.customerId);
    }

    return { ...order, id };
  },

  // Recomputes a customer's order aggregates from the orders table itself.
  // Single source of truth: called after add/update/delete of any order.
  async refreshCustomerTotals(customerId) {
    if (!customerId) return;
    const orders = await this.db.orders.where('customerId').equals(customerId).toArray();
    const totalOrdersValue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const orderCount = orders.length;
    const totalCommission = orders.reduce((sum, o) => sum + (o.commission || 0), 0);
    await this.db.customers.update(customerId, {
      totalOrdersValue,
      orderCount,
      totalCommission
    });
  },

  // Deletes an order and refreshes the owning customer's totals.
  // Returns the deleted order (or null if it didn't exist).
  async removeOrder(orderId) {
    const order = await this.db.orders.get(orderId);
    if (!order) return null;
    await this.db.orders.delete(orderId);
    if (order.customerId) {
      await this.refreshCustomerTotals(order.customerId);
    }
    return order;
  },

  // Expense operations
  async addExpense(data) {
    const expense = {
      ...data,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.expenses.add(expense);
    return { ...expense, id };
  },

  async getExpensesForPeriod(startDate, endDate) {
    return await this.db.expenses
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  },

  // Trip operations
  async addTrip(data) {
    const trip = {
      ...data,
      purpose: data.purpose || 'business',
      confirmed: false,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.trips.add(trip);
    return { ...trip, id };
  },

  async getTripsForPeriod(startDate, endDate) {
    return await this.db.trips
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  },

  // Measurement operations
  async addMeasurement(data) {
    // Auto-calculate least measurements. A group is only complete when all
    // three values are present and positive: a missing, zero or negative
    // entry means the measurement is incomplete, so the derived fields stay
    // null — incomplete data must never become a valid zero (or a negative
    // widthUsed from least - tolerance).
    const complete = (a, b, c) => (a > 0 && b > 0 && c > 0) ? Math.min(a, b, c) : null;
    const widthLeast = complete(data.widthTop, data.widthMiddle, data.widthBottom);
    const dropLeast = complete(data.dropLeft, data.dropCentre, data.dropRight);
    const diagVariance = (data.diagonalTlBr > 0 && data.diagonalTrBl > 0)
      ? Math.abs(data.diagonalTlBr - data.diagonalTrBl)
      : null;

    const tolerance = data.tolerance > 0 ? data.tolerance : 10;
    const fittingType = data.fittingType || 'recess';

    const measurement = {
      ...data,
      widthLeast,
      dropLeast,
      widthUsed: widthLeast === null ? null : (fittingType === 'recess' ? widthLeast - tolerance : widthLeast),
      dropUsed: dropLeast,
      diagonalVariance: diagVariance,
      isSquare: diagVariance === null ? null : diagVariance <= 5,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.measurements.add(measurement);
    return { ...measurement, id };
  },

  // Communication operations
  async addCommunication(data) {
    const comm = {
      ...data,
      sentAt: new Date().toISOString()
    };

    const id = await this.db.communications.add(comm);
    return { ...comm, id };
  },

  // Settings
  async getSetting(key, defaultValue = null) {
    const setting = await this.db.settings.get(key);
    return setting ? setting.value : defaultValue;
  },

  async setSetting(key, value) {
    await this.db.settings.put({ key, value });
  },

  // Schema version of the current database. Real Dexie reports it as `verno`
  // once opened; the bundled shim keeps it internally without exposing it, so
  // fall back to the current schema constant (2 = photos table added).
  schemaVersion() {
    return typeof this.db.verno === 'number' ? this.db.verno : 2;
  },

  // Export
  // Full operational backup of the database: every record an advisor's
  // operational memory consists of - customers, appointments with their
  // measurements and trips, orders, expenses, communications, photos,
  // settings and sequences. Photos are included: they are part of the
  // working customer record, not optional cosmetics, and a backup that
  // drops them cannot reconstruct the advisor's working memory.
  // Runtime-only settings rows (migration/storage probes, demo flags) are
  // excluded - they are transient state, not advisor data, and must never
  // travel inside a backup.
  async exportAll() {
    const data = {};
    const tables = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications', 'photos'];
    for (const table of tables) {
      data[table] = await this.db[table].toArray();
    }
    const RUNTIME_SETTING_KEYS = ['__v6_legacy_migrated__', '__storage_probe__', 'pitchDemoSeeded'];
    data.settings = (await this.db.settings.toArray()).filter(s => !RUNTIME_SETTING_KEYS.includes(s.key));
    data.sequences = await this.db.sequences.toArray();
    return data;
  },

  async importAll(data) {
    // Validate the whole backup — table shapes, record structure, primary
    // ID types, duplicate keys, date fields and every cross-table
    // relationship — BEFORE anything is touched on disk. A corrupt backup
    // is rejected wholesale; partial imports are impossible by construction.
    await this._validateBackup(data);

    // Prepare encrypted customer records before the transaction (encryption
    // is async and would otherwise yield, causing the transaction to become
    // inactive).
    let importData = data;
    if (encryptionKey && data.customers) {
      importData = { ...data };
      importData.customers = await Promise.all(data.customers.map(c => encryptCustomer(c)));
    }

    // On the real engine this is a single atomic readwrite transaction
    // across every table: a failure anywhere aborts the whole import and
    // the previous data comes back untouched. (The mini-Dexie shim fallback
    // has no transaction(), so it keeps the snapshot-and-restore path below.)
    if (typeof this.db.transaction === 'function') {
      try {
        await this.db.transaction('rw', BACKUP_TABLES.map(t => this.db[t]), async () => {
          for (const table of BACKUP_TABLES) {
            await this.db[table].clear();
            if (importData[table]) {
              await this.db[table].bulkAdd(importData[table]);
            }
          }
        });
      } catch (err) {
        console.error('Import failed:', err);
        throw new Error('Import failed and was rolled back. Your previous data should be intact — please check Money, Visits and Customers.');
      }
    } else {
      // Snapshot current data so a failure partway through the import (e.g. a
      // bad record on table 4 of 7) can be rolled back, instead of leaving some
      // tables replaced with the new backup and others cleared-but-not-refilled.
      // Note: this isn't a true atomic DB transaction (the shim fallback
      // doesn't support one across tables) — it's a best-effort restore, and
      // rollback itself could theoretically fail (e.g. storage completely full).
      const snapshot = {};
      for (const table of BACKUP_TABLES) {
        snapshot[table] = await this.db[table].toArray();
      }

      try {
        for (const table of BACKUP_TABLES) {
          await this.db[table].clear();
          if (importData[table]) {
            await this.db[table].bulkAdd(importData[table]);
          }
        }
      } catch (err) {
        console.error('Import failed partway through — rolling back to pre-import state:', err);
        for (const table of BACKUP_TABLES) {
          try {
            await this.db[table].clear();
            if (snapshot[table].length) await this.db[table].bulkAdd(snapshot[table]);
          } catch (rollbackErr) {
            console.error(`Rollback failed for "${table}" — this table's data may be lost:`, rollbackErr);
          }
        }
        throw new Error('Import failed and was rolled back. Your previous data should be restored — please check Money, Visits and Customers.');
      }
    }

    // Restored sequence counters must never sit below the highest number the
    // imported records carry — otherwise the next customer/order could get a
    // freshly-issued duplicate number. Imported sequence rows are trusted
    // as-is when already at or above that (mirrors the legacy-migration guard
    // in _migrateFromLegacyDb, so it also covers old backups with no
    // sequences table at all).
    await this._guardSequences(data);
  },

  // Full backup validation: never "is this an array?" alone. Checks record
  // shapes, primary-ID types, duplicate primary keys, date fields, and every
  // operational relationship in the customer memory graph:
  //
  //   appointment.customerId        -> existing customer
  //   order.customerId              -> existing customer
  //   order.appointmentId           -> existing appointment (when supplied)
  //   measurement.appointmentId     -> existing appointment
  //   trip.appointmentId            -> existing appointment
  //   communication.customerId      -> existing customer
  //   photo.customerId              -> existing customer
  //
  // Throws on the first problem; nothing has been written by then.
  async _validateBackup(data) {
    const isPosInt = v => Number.isInteger(v) && v > 0;
    const isValidDate = v =>
      (v instanceof Date && !isNaN(v.getTime())) ||
      (typeof v === 'string' && v.length > 0 && !isNaN(new Date(v).getTime()));

    // 1. Every supplied table must be a list of records; a backup carrying no
    // tables at all is corrupt (importing it would wipe the database with
    // nothing to restore).
    const present = [];
    for (const table of BACKUP_TABLES) {
      if (data[table] === undefined) continue;
      if (!Array.isArray(data[table])) {
        throw new Error(`Backup file is corrupt: "${table}" is not a list of records`);
      }
      present.push(table);
    }
    if (present.length === 0) {
      throw new Error('Backup file is corrupt: no tables found');
    }

    // 2. Record structure, primary-key types and duplicate primary keys.
    // id-keyed tables use 'id'; settings use 'key'; sequences use 'name'.
    const keyField = table => (table === 'settings' ? 'key' : table === 'sequences' ? 'name' : 'id');
    for (const table of present) {
      const field = keyField(table);
      const seen = new Set();
      for (const record of data[table]) {
        if (record === null || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error(`Backup file is corrupt: "${table}" contains a malformed record`);
        }
        const key = record[field];
        const keyOk = field === 'key' || field === 'name'
          ? (typeof key === 'string' && key.length > 0)
          : isPosInt(key);
        if (!keyOk) {
          throw new Error(`Backup file is corrupt: "${table}" record has an invalid ${field}`);
        }
        if (table === 'sequences' && typeof record.value !== 'number') {
          throw new Error('Backup file is corrupt: sequence record has an invalid value');
        }
        if (seen.has(key)) {
          throw new Error(`Backup file is corrupt: duplicate ${field} ${JSON.stringify(key)} in "${table}"`);
        }
        seen.add(key);
      }
    }

    // 3. Cross-table relationships. A reference must exist in the matching
    // table and be a positive integer; records without their required
    // relationship field are rejected outright.
    const customerIds = new Set((data.customers || []).map(c => c.id));
    const appointmentIds = new Set((data.appointments || []).map(a => a.id));
    const checkRef = (table, record, field, validIds) => {
      const v = record[field];
      if (v === null || v === undefined) {
        throw new Error(`Backup file is corrupt: "${table}" record is missing ${field}`);
      }
      if (!isPosInt(v) || !validIds.has(v)) {
        throw new Error(`Backup file is corrupt: "${table}" references a missing ${field} (${v})`);
      }
    };

    for (const record of data.appointments || []) {
      checkRef('appointments', record, 'customerId', customerIds);
    }
    for (const record of data.orders || []) {
      checkRef('orders', record, 'customerId', customerIds);
      // appointmentId is optional on orders (some orders are created without
      // a linked visit) — validated only when supplied.
      if (record.appointmentId !== null && record.appointmentId !== undefined) {
        if (!isPosInt(record.appointmentId) || !appointmentIds.has(record.appointmentId)) {
          throw new Error(`Backup file is corrupt: "orders" references a missing appointmentId (${record.appointmentId})`);
        }
      }
    }
    for (const record of data.measurements || []) {
      checkRef('measurements', record, 'appointmentId', appointmentIds);
    }
    for (const record of data.trips || []) {
      checkRef('trips', record, 'appointmentId', appointmentIds);
    }
    for (const record of data.communications || []) {
      checkRef('communications', record, 'customerId', customerIds);
    }
    for (const record of data.photos || []) {
      checkRef('photos', record, 'customerId', customerIds);
      if (typeof record.data !== 'string' || record.data.length === 0) {
        throw new Error('Backup file is corrupt: a photo record is missing its image data');
      }
    }

    // 4. Dates. Appointment dates drive the diary, trips and expenses drive
    // mileage/money — those must parse. The remaining date-bearing fields
    // (sentAt, createdAt) are validated when present.
    for (const record of data.appointments || []) {
      if (!isValidDate(record.date)) {
        throw new Error('Backup file is corrupt: appointment has an invalid date');
      }
    }
    for (const [table, field] of [['trips', 'date'], ['expenses', 'date'], ['communications', 'sentAt']]) {
      for (const record of data[table] || []) {
        if (record[field] !== undefined && record[field] !== null && !isValidDate(record[field])) {
          throw new Error(`Backup file is corrupt: "${table}" record has an invalid ${field}`);
        }
      }
    }
    for (const table of present) {
      for (const record of data[table]) {
        if (record.createdAt !== undefined && record.createdAt !== null && !isValidDate(record.createdAt)) {
          throw new Error(`Backup file is corrupt: "${table}" record has an invalid createdAt`);
        }
      }
    }
  },

  // Raises the customer/order sequence counters to cover the highest number
  // found in the imported records (same CUS-/ORD-YYYY-#### pattern and year
  // scoping the legacy migration uses). Never lowers an existing counter.
  async _guardSequences(data) {
    for (const name of ['customer', 'order']) {
      const prefix = name === 'customer' ? 'CUS-' : 'ORD-';
      const year = new Date().getFullYear();
      const re = new RegExp(`^${prefix}\\d{4}-(\\d+)$`);
      const maxSeq = (data[name + 's'] || []).reduce((max, r) => {
        const m = String(r[name + 'Number'] || '').match(re);
        return Math.max(max, m ? parseInt(m[1], 10) : 0);
      }, 0);
      if (!maxSeq) continue;
      const seq = await this.db.sequences.get(name);
if (!seq || seq.value < maxSeq) {
        await this.db.sequences.put({ name, value: maxSeq });
      }
    }
  }
};

// Expose encryption functions globally for app.js
if (typeof window !== 'undefined') {
  window.initEncryption = initEncryption;
  window.clearEncryptionKey = clearEncryptionKey;
  window.hasEncryptionKey = hasEncryptionKey;
  window.encryptCustomer = encryptCustomer;
  window.decryptCustomer = decryptCustomer;
  window.migratePlaintextCustomers = migratePlaintextCustomers;
  window.isEncrypted = isEncrypted;
  window.encryptField = encryptField;
  window.decryptField = decryptField;
}
