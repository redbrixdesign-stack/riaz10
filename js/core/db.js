/* ============================================
   ADVISOROS v5.0 — DATABASE LAYER
   IndexedDB via Dexie.js
   ============================================ */

const DB = {
  db: null,

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
        const parsed = JSON.parse(localStorage.getItem(key));
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

    const id = await this.db.customers.add(customer);
    return { ...customer, id };
  },

  // Deletes the customer plus everything keyed to them - appointments,
  // orders, and communications. A customer row alone doesn't show up
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
    await Promise.all([
      this.db.appointments.where('customerId').equals(customerId).delete(),
      this.db.orders.where('customerId').equals(customerId).delete(),
      this.db.communications.where('customerId').equals(customerId).delete(),
      this.db.photos.where('customerId').equals(customerId).delete()
    ]);
    await this.db.customers.delete(customerId);
    return { appointments: appts.length, orders: orders.length, communications: comms.length, photos: photoCount };
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
  // Photos are intentionally excluded from exportAll()/importAll() so
  // backups stay lean text/JSON — re-adding them would need base64
  // conversion and inflate every file.
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

    return await this.db.customers
      .filter(c => {
        return (c.firstName && c.firstName.toLowerCase().includes(normalized)) ||
               (c.lastName && c.lastName.toLowerCase().includes(normalized)) ||
               (c.fullName && c.fullName.toLowerCase().includes(normalized)) ||
               (c.customerNumber && c.customerNumber.toLowerCase().includes(normalized)) ||
               (c.phone && c.phone.includes(normalized)) ||
               ((c.postcodeNormalized || c.address?.postcodeNormalized || '').includes(normalized.replace(/\s/g, '').toUpperCase())) ||
               (c.address && c.address.line1 && c.address.line1.toLowerCase().includes(normalized));
      })
      .limit(20)
      .toArray();
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
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const rows = await this.db.appointments.toArray();
    return rows.filter(a => a.status !== 'cancelled' && this._inDateWindow(a.date, start, end));
  },

  // Generic date-range fetch — used by the standard month calendar view.
  async getAppointmentsForRange(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const rows = await this.db.appointments.toArray();
    return rows.filter(a => a.status !== 'cancelled' && this._inDateWindow(a.date, start, end));
  },

  async getUpcomingAppointments(days = 7) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    const rows = await this.db.appointments.toArray();
    return rows.filter(a => a.status !== 'cancelled' && this._inDateWindow(a.date, now, future));
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
    // Auto-calculate least measurements
    const width = {
      top: data.widthTop || 0,
      middle: data.widthMiddle || 0,
      bottom: data.widthBottom || 0
    };
    const widthLeast = Math.min(width.top, width.middle, width.bottom);

    const drop = {
      left: data.dropLeft || 0,
      centre: data.dropCentre || 0,
      right: data.dropRight || 0
    };
    const dropLeast = Math.min(drop.left, drop.centre, drop.right);

    const tolerance = data.tolerance || 10;
    const fittingType = data.fittingType || 'recess';

    const measurement = {
      ...data,
      widthLeast,
      dropLeast,
      widthUsed: fittingType === 'recess' ? widthLeast - tolerance : widthLeast,
      dropUsed: dropLeast,
      diagonalVariance: Math.abs((data.diagonalTlBr || 0) - (data.diagonalTrBl || 0)),
      isSquare: Math.abs((data.diagonalTlBr || 0) - (data.diagonalTrBl || 0)) <= 5,
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

  // Export
  async exportAll() {
    const data = {};
    const tables = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications'];

    for (const table of tables) {
      data[table] = await this.db[table].toArray();
    }

    return data;
  },

  async importAll(data) {
    const tables = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications'];

    // Validate the whole backup's shape before touching anything on disk —
    // catches most corrupt/incompatible files without ever clearing a table.
    for (const table of tables) {
      if (data[table] !== undefined && !Array.isArray(data[table])) {
        throw new Error(`Backup file is corrupt: "${table}" is not a list of records`);
      }
    }

    // On the real engine this is a single atomic readwrite transaction
    // across every table: a failure anywhere aborts the whole import and
    // the previous data comes back untouched. (The mini-Dexie shim fallback
    // has no transaction(), so it keeps the snapshot-and-restore path below.)
    if (typeof this.db.transaction === 'function') {
      try {
        await this.db.transaction('rw', tables.map(t => this.db[t]), async () => {
          for (const table of tables) {
            await this.db[table].clear();
            if (data[table]) {
              await this.db[table].bulkAdd(data[table]);
            }
          }
        });
      } catch (err) {
        throw new Error('Import failed and was rolled back. Your previous data should be intact — please check Money, Visits and Customers.');
      }
      return;
    }

    // Snapshot current data so a failure partway through the import (e.g. a
    // bad record on table 4 of 7) can be rolled back, instead of leaving some
    // tables replaced with the new backup and others cleared-but-not-refilled.
    // Note: this isn't a true atomic DB transaction (the shim fallback
    // doesn't support one across tables) — it's a best-effort restore, and
    // rollback itself could theoretically fail (e.g. storage completely full).
    const snapshot = {};
    for (const table of tables) {
      snapshot[table] = await this.db[table].toArray();
    }

    try {
      for (const table of tables) {
        await this.db[table].clear();
        if (data[table]) {
          await this.db[table].bulkAdd(data[table]);
        }
      }
    } catch (err) {
      console.error('Import failed partway through — rolling back to pre-import state:', err);
      for (const table of tables) {
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
};
