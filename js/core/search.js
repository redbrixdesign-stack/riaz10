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

    const customers = await DB.db.customers.toArray();
    this.index.customers = customers.map(c => ({
      id: c.id,
      type: 'customer',
      title: `${c.firstName} ${c.lastName}`,
      subtitle: c.address ? `${c.address.line1}, ${c.address.postcodeFormatted}` : '',
      phone: c.phone,
      customerNumber: c.customerNumber,
      keywords: [
        c.firstName,
        c.lastName,
        c.phone,
        c.email,
        c.customerNumber,
        c.address?.line1,
        c.address?.postcode,
        c.address?.city
      ].filter(Boolean).join(' ').toLowerCase()
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

  async search(query, options = {}) {
    if (!query || query.trim().length < 2) return [];

    const normalized = query.toLowerCase().trim();
    const results = [];

    // Search customers
    if (!options.types || options.types.includes('customer')) {
      try {
        const customers = await DB.searchCustomers(normalized);
        results.push(...customers.map(c => ({
          type: 'customer',
          id: c.id,
          title: `${c.firstName} ${c.lastName}`,
          subtitle: c.customerNumber,
          detail: c.address ? `${c.address.line1}${c.address.postcode ? ', ' + c.address.postcode : ''}` : '',
          icon: 'person',
          data: c
        })));
      } catch (e) { console.error('Customer search failed:', e); }
    }

    // Search appointments
    if (!options.types || options.types.includes('appointment')) {
      try {
        const appointments = await DB.db.appointments
          .filter(a => {
            const customer = results.find(r => r.type === 'customer' && r.id === a.customerId);
            return customer || a.notes?.toLowerCase().includes(normalized);
          })
          .limit(10)
          .toArray();

        for (const appt of appointments) {
          const customer = await DB.db.customers.get(appt.customerId);
          results.push({
            type: 'appointment',
            id: appt.id,
            title: `${Utils.formatDate(appt.date, 'short')} — ${Utils.formatTime(appt.date)}`,
            subtitle: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
            detail: CONFIG.appointmentTypes.find(t => t.id === appt.type)?.name || appt.type,
            icon: 'event',
            data: appt
          });
        }
      } catch (e) { console.error('Appointment search failed:', e); }
    }

    // Search orders - uses .filter() rather than a .where().or() chain,
    // since .or() isn't implemented in this app's IndexedDB shim.
    if (!options.types || options.types.includes('order')) {
      try {
        const orders = await DB.db.orders
          .filter(o =>
            (o.orderNumber || '').toLowerCase().startsWith(normalized) ||
            (o.supplierOrderNumber || '').toLowerCase().startsWith(normalized)
          )
          .limit(10)
          .toArray();

        for (const order of orders) {
          const customer = await DB.db.customers.get(order.customerId);
          results.push({
            type: 'order',
            id: order.id,
            title: order.orderNumber,
            subtitle: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
            detail: `£${order.total}`,
            icon: 'receipt',
            data: order
          });
        }
      } catch (e) { console.error('Order search failed:', e); }
    }

    return results.slice(0, options.limit || 20);
  },

  async searchByPostcode(postcode) {
    const normalized = Utils.normalizePostcode(postcode);
    return await DB.db.customers
      .where('postcodeNormalized')
      .startsWith(normalized)
      .limit(20)
      .toArray();
  },

  async searchNearby(lat, lng, radiusKm = 10) {
    const customers = await DB.db.customers.toArray();
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
