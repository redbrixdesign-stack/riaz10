/* ============================================
   ADVISOROS v5.0 — SEARCH
   Global search across all entities
   ============================================ */

const Search = {
  index: null,

  async buildIndex() {
    // Build in-memory search index
    this.index = {
      customers: [],
      appointments: [],
      orders: []
    };

    const customers = await DB.getAllCustomers();
    this.index.customers = await Promise.all(customers.map(async c => {
      const decrypted = c;
      return {
        id: decrypted.id,
        type: 'customer',
        title: `${decrypted.firstName} ${decrypted.lastName}`,
        subtitle: decrypted.address ? `${decrypted.address.line1}, ${decrypted.address.postcodeFormatted}` : '',
        phone: decrypted.phone,
        customerNumber: decrypted.customerNumber,
        keywords: [
          decrypted.firstName,
          decrypted.lastName,
          decrypted.phone,
          decrypted.email,
          decrypted.customerNumber,
          decrypted.address?.line1,
          decrypted.address?.postcode,
          decrypted.address?.city
        ].filter(Boolean).join(' ').toLowerCase()
      };
    }));

    const appointments = await DB.db.appointments.toArray();
    this.index.appointments = appointments.map(a => ({
      id: a.id,
      type: 'appointment',
      title: `${Utils.formatDate(a.date, 'short')} ${Utils.formatTime(a.date)}`,
      subtitle: a.type,
      keywords: [
        a.type,
        a.status,
        a.outcome,
        Utils.formatDate(a.date)
      ].filter(Boolean).join(' ').toLowerCase()
    }));

    const orders = await DB.db.orders.toArray();
    this.index.orders = orders.map(o => ({
      id: o.id,
      type: 'order',
      title: o.orderNumber,
      subtitle: o.supplierOrderNumber || '',
      keywords: [
        o.orderNumber,
        o.supplierOrderNumber,
        o.status
      ].filter(Boolean).join(' ').toLowerCase()
    }));
  },

  // No persistent plaintext index: read current decrypted text only for this query.
  text(...values) {
    return values.flat(Infinity).filter(value => typeof value === 'string' || typeof value === 'number')
      .join(' ').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  },

  async search(query, options = {}) {
    if (typeof query !== 'string' || query.trim().length < 2) return [];
    const terms = this.text(query).split(' ').filter(Boolean);
    const matches = (...values) => {
      const text = this.text(...values);
      return terms.every(term => text.includes(term));
    };
    const wants = type => !options.types || options.types.includes(type);
    const results = [];
    // A failed read must reject, not masquerade as "no matches".
    const customers = await DB.getAllCustomers();
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const customerName = c => c ? [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || 'Customer' : 'Linked customer unavailable';
    const customerText = c => c ? [
      customerName(c), c.phone, c.email, c.customerNumber, c.notes,
      c.address?.line1, c.address?.town, c.address?.city,
      c.address?.postcode, c.address?.postcodeNormalized, c.postcodeNormalized,
      String(c.address?.postcode || '').replace(/\s/g, '')
    ] : [];
    const transcripts = row => (row.audioNotes || []).map(note => note.transcript || '');
    const visitDate = row => row.date && Number.isFinite(new Date(row.date).getTime())
      ? Utils.formatDate(row.date, 'short') + ' — ' + Utils.formatTime(row.date) : 'Date unavailable';

    if (wants('customer')) {
      for (const c of customers) {
        if (!matches(customerText(c), transcripts(c))) continue;
        results.push({ type: 'customer', id: c.id, title: customerName(c),
          subtitle: c.customerNumber || 'Customer',
          detail: [c.address?.line1, c.address?.postcode].filter(Boolean).join(', '),
          icon: 'person', data: c });
      }
    }

    if (wants('appointment')) {
      const appointments = [...await DB.getAllAppointments()];
      const measurements = await DB.getMeasurementSearchRecords(appointments.map(a => a.id));
      const byVisit = new Map();
      for (const m of measurements) {
        if (!byVisit.has(m.appointmentId)) byVisit.set(m.appointmentId, []);
        byVisit.get(m.appointmentId).push(m);
      }
      const measurementText = m => [m.windowName, m.room, m.productName, m.description, m.notes, m.transcripts];
      appointments.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || b.id - a.id);
      for (const a of appointments) {
        const customer = customerMap.get(a.customerId);
        const windows = byVisit.get(a.id) || [];
        const shared = [customerText(customer), a.clientName, a.address, a.type,
          CONFIG.appointmentTypes.find(t => t.id === a.type)?.name, a.status, a.outcome, a.date, visitDate(a)];
        // Match one source at a time: don't combine unrelated windows to fabricate a match.
        const window = windows.find(m => matches(shared, measurementText(m)));
        if (!window && !matches(shared, a.notes, a.access, transcripts(a))) continue;
        results.push({ type: 'appointment', id: a.id, title: visitDate(a),
          subtitle: customer ? customerName(customer) : a.clientName || 'Visit',
          detail: window ? 'Window: ' + [window.windowName, window.description || window.productName].filter(Boolean).join(' · ')
            : (CONFIG.appointmentTypes.find(t => t.id === a.type)?.name || a.type || 'Visit') + ' · Saved visit context',
          icon: window ? 'straighten' : 'event', data: a });
      }
    }

    if (wants('order')) {
      const orders = await DB.db.orders.toArray();
      for (const order of orders) {
        const customer = customerMap.get(order.customerId);
        if (!matches(customerText(customer), order.orderNumber, order.supplierOrderNumber, order.status)) continue;
        results.push({ type: 'order', id: order.id, title: order.orderNumber || 'Order',
          subtitle: customerName(customer), detail: 'Order', icon: 'receipt', data: order });
      }
    }
    const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
    return results.slice(0, limit);
  },

  async searchByPostcode(postcode) {
    const normalized = Utils.normalizePostcode(postcode);
    // Ciphertext cannot be queried through a plaintext postcode index.
    const customers = await DB.getAllCustomers();
    return customers.filter(customer => Utils.normalizePostcode(customer.postcodeNormalized || customer.address?.postcodeNormalized || customer.address?.postcode || '').startsWith(normalized)).slice(0, 20);
  },

  async searchNearby(lat, lng, radiusKm = 10) {
    const customers = await DB.getAllCustomers();
    return customers.filter(c => {
      if (!c.address?.latLng) return false;
      const dist = Geo.calculateDistance(
        lat, lng,
        c.address.latLng[0], c.address.latLng[1]
      );
      return dist <= radiusKm;
    }).map(c => ({
      ...c,
      distance: Geo.calculateDistance(
        lat, lng,
        c.address.latLng[0], c.address.latLng[1]
      )
    })).sort((a, b) => a.distance - b.distance);
  }
};
