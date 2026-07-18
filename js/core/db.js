/* ============================================
   ADVISOROS v5.0 — DATABASE LAYER
   IndexedDB via Dexie.js
   ============================================ */

const DB = {
  db: null,

  async init() {
    this.db = new Dexie('advisoros_v5');

    this.db.version(2).stores({
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

    if (typeof this.db.open === 'function') {
      await this.db.open();
    }

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
    const measureOnly = await this.db.appointments.where('outcome').equals('measure_only').toArray();
    for (const appt of measureOnly) {
      const existingNotes = appt.notes || '';
      const flag = '[Legacy outcome: Measure Only - re-review, no quote was given]';
      await this.db.appointments.update(appt.id, {
        outcome: undefined,
        notes: [existingNotes, flag].filter(Boolean).join('\n\n')
      });
    }

    const total = affected.length + measureOnly.length;
    if (total) {
      console.log(`Migrated ${total} appointment(s) from legacy outcome ids`);
    }
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

  async getAppointmentsForDate(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return await this.db.appointments
      .where('date')
      .between(start.toISOString(), end.toISOString())
      .and(a => a.status !== 'cancelled')
      .toArray();
  },

  // Generic date-range fetch — used by the standard month calendar view.
  async getAppointmentsForRange(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return await this.db.appointments
      .where('date')
      .between(start.toISOString(), end.toISOString())
      .and(a => a.status !== 'cancelled')
      .toArray();
  },

  async getUpcomingAppointments(days = 7) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return await this.db.appointments
      .where('date')
      .between(now.toISOString(), future.toISOString())
      .and(a => a.status !== 'cancelled')
      .toArray();
  },

  async getPipeline() {
    const now = new Date().toISOString();

    // FIX: Dexie 3 doesn't support sortBy() after filter/and
    // Get results first, then sort in JavaScript
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

    // Update customer totals
    if (data.customerId) {
      await this.db.customers.update(data.customerId, customer => {
        customer.totalOrdersValue += (data.total || 0);
        customer.orderCount += 1;
      });
    }

    return { ...order, id };
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
      .between(startDate, endDate)
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
      .between(startDate, endDate)
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
      dropUsed: fittingType === 'recess' ? dropLeast : dropLeast,
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

    // Snapshot current data so a failure partway through the import (e.g. a
    // bad record on table 4 of 7) can be rolled back, instead of leaving some
    // tables replaced with the new backup and others cleared-but-not-refilled.
    // Note: this isn't a true atomic DB transaction (the storage layer here
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
