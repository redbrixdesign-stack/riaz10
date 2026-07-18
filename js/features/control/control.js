/* ============================================
   ADVISOROS v5.0 — CONTROL CENTER
   Quiet home, practical tools one tap away
   ============================================ */

const ControlFeature = {
  id: 'control',
  name: 'Tools',
  icon: 'construction',

  render() {
    return `
      <div class="fade-in notebook-page control-center">
        <div class="notebook-brand">
          <div class="notebook-logo">${Utils.escapeHtml((CONFIG.companyName || 'AdvisorOS').trim())}</div>
        </div>

        <section class="notebook-section">
          <div class="notebook-title">
            <h1>TOOLS</h1>
          </div>
          <p class="control-intro">Fast actions, money tools and route helpers, kept off Home so the day stays calm.</p>
        </section>

        ${this.renderSection('Today actions', [
          { icon: 'add', label: 'Add Visit', action: "App.navigate('appointments', {action: 'add'})" },
          { icon: 'percent', label: 'Discount Impact', action: "TodayFeature.openDiscountCalculator()" },
          { icon: 'route', label: 'Log Mileage', action: "MoneyFeature.openMileageModal()" },
          { icon: 'receipt_long', label: 'Log Expense', action: "MoneyFeature.openExpenseModal()" },
          { icon: 'fact_check', label: 'End of Day', action: "TodayFeature.openEODModal()" }
        ])}

        ${this.renderSection('Plan & measure', [
          { icon: 'map', label: 'Route Planner', action: "App.navigate('route')" },
          { icon: 'straighten', label: 'Measure', action: "ControlFeature.openMeasurePicker()" },
          { icon: 'document_scanner', label: 'Scan Document', action: "App.navigate('ocr')" }
        ])}

        ${this.renderSection('Account', [
          { icon: 'settings', label: 'Settings', action: "App.navigate('settings')" },
          { icon: 'cloud_download', label: 'Export Backup', action: "ExportService.exportBackup()" }
        ])}

        ${this.renderSection('Pitch prep', [
          { icon: 'auto_awesome', label: 'Load Demo Day', action: "ControlFeature.seedPitchDemo()" }
        ])}
      </div>
    `;
  },

  renderSection(title, items) {
    return `
      <section class="notebook-section control-section">
        <div class="notebook-title">
          <h2>${Utils.escapeHtml(title)}</h2>
        </div>
        <div class="control-grid">
          ${items.map(item => `
            <button class="control-tile" type="button" onclick="${item.action}">
              <span class="material-symbols-rounded">${item.icon}</span>
              <span>${Utils.escapeHtml(item.label)}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  },

  at(date, time) {
    const [hours, minutes] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  },

  // Pick a visit, then open the Measure tool against it. Measure is a per-visit
  // tool (it needs an appointmentId to save against), so it can't open directly.
  async openMeasurePicker() {
    let visits = [];
    try {
      const upcoming = await DB.getUpcomingAppointments(30);
      const today = await DB.getAppointmentsForDate(Utils.getToday().toISOString());
      visits = [...today, ...upcoming]
        .filter((visit, index, all) => all.findIndex(v => v.id === visit.id) === index)
        .slice(0, 15);
    } catch (e) {
      console.error('Measure picker failed:', e);
    }

    if (visits.length === 0) {
      Toast.show('Add a visit first, then measure against it', 'info');
      App.navigate('appointments', {action: 'add'});
      return;
    }

    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Measure for which visit?</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${visits.map(visit => `
            <button class="list-item" style="border:1px solid var(--border-light);border-radius:8px;text-align:left;" onclick="App.closeModal(); App.navigate('measure', {appointmentId: ${visit.id}})">
              <span class="material-symbols-rounded" style="color:var(--primary);margin-right:12px;">straighten</span>
              <span style="flex:1;min-width:0;">
                <span style="display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(visit.clientName || 'Unknown')}</span>
                <span style="display:block;font-size:12px;color:var(--text-tertiary);">${Utils.formatDate(visit.date, 'datetime')}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>`;
    App.openModal(content);
  },

  async seedPitchDemo() {
    try {
      const alreadySeeded = await DB.getSetting('pitchDemoSeeded', false);
      if (alreadySeeded) {
        Toast.show('Demo day is already loaded', 'info');
        App.navigate('today');
        return;
      }

      // Seeded against today's actual date, not a fixed weekday — so "Load Demo Day" puts
      // appointments on the current day's Today tab no matter which day it's run on.
      const demoDay = Utils.getToday();
      const yesterday = Utils.addDays(Utils.getToday(), -1);

      const customers = [
        {
          fullName: 'Ayesha Khan',
          firstName: 'Ayesha',
          lastName: 'Khan',
          phone: '07494 809272',
          address: { line1: 'M14 7FZ', postcode: 'M14 7FZ', postcodeNormalized: 'M147FZ' },
          source: 'referral'
        },
        {
          fullName: 'James Wilson',
          firstName: 'James',
          lastName: 'Wilson',
          phone: '07700 900481',
          address: { line1: 'M20 3YA', postcode: 'M20 3YA', postcodeNormalized: 'M203YA' },
          source: 'facebook'
        },
        {
          fullName: 'Priya Shah',
          firstName: 'Priya',
          lastName: 'Shah',
          phone: '07700 900612',
          address: { line1: 'SK8 4AE', postcode: 'SK8 4AE', postcodeNormalized: 'SK84AE' },
          source: 'website'
        },
        {
          fullName: 'Mark Evans',
          firstName: 'Mark',
          lastName: 'Evans',
          phone: '07700 900734',
          address: { line1: 'WA15 8QW', postcode: 'WA15 8QW', postcodeNormalized: 'WA158QW' },
          source: 'google'
        },
        {
          fullName: 'Helen Carter',
          firstName: 'Helen',
          lastName: 'Carter',
          phone: '07700 900845',
          address: { line1: 'M33 2LX', postcode: 'M33 2LX', postcodeNormalized: 'M332LX' },
          source: 'referral'
        },
        {
          fullName: 'Omar Malik',
          firstName: 'Omar',
          lastName: 'Malik',
          phone: '07700 900926',
          address: { line1: 'OL6 7SR', postcode: 'OL6 7SR', postcodeNormalized: 'OL67SR' },
          source: 'instagram'
        }
      ];

      const ids = {};
      for (const customer of customers) {
        const saved = await DB.addCustomer(customer);
        ids[customer.fullName] = saved.id;
      }

      await DB.addAppointment({
        customerId: ids['Ayesha Khan'],
        clientName: 'Ayesha Khan',
        phone: '07494 809272',
        address: 'M14 7FZ',
        date: this.at(demoDay, '09:00'),
        durationSlots: 4,
        type: 'consultation',
        source: 'referral',
        notes: 'Three bedrooms. Wants blackout blinds before school term.'
      });

      await DB.addAppointment({
        customerId: ids['James Wilson'],
        clientName: 'James Wilson',
        phone: '07700 900481',
        address: 'M20 3YA',
        date: this.at(demoDay, '11:30'),
        durationSlots: 4,
        type: 'consultation',
        source: 'facebook',
        notes: 'Bay window. Price sensitive but ready if deposit is clear.'
      });

      await DB.addAppointment({
        customerId: ids['Priya Shah'],
        clientName: 'Priya Shah',
        phone: '07700 900612',
        address: 'SK8 4AE',
        date: this.at(demoDay, '15:00'),
        durationSlots: 4,
        type: 'consultation',
        source: 'website',
        notes: 'Living room shutters. Partner may join by phone.'
      });

      await DB.addAppointment({
        customerId: ids['Mark Evans'],
        clientName: 'Mark Evans',
        phone: '07700 900734',
        address: 'WA15 8QW',
        date: this.at(demoDay, '18:00'),
        durationSlots: 4,
        type: 'consultation',
        source: 'google',
        notes: 'Evening slot. Wants quote same day.'
      });

      await DB.addAppointment({
        customerId: ids['Helen Carter'],
        clientName: 'Helen Carter',
        phone: '07700 900845',
        address: 'M33 2LX',
        date: this.at(yesterday, '14:00'),
        durationSlots: 4,
        type: 'consultation',
        source: 'referral',
        outcome: 'quoted',
        value: 1800,
        quoteReason: 'partner',
        notes: 'Quoted for shutters. Wants to speak with partner tonight.'
      });

      await DB.addAppointment({
        customerId: ids['Omar Malik'],
        clientName: 'Omar Malik',
        phone: '07700 900926',
        address: 'OL6 7SR',
        date: this.at(Utils.addDays(yesterday, -2), '10:30'),
        durationSlots: 4,
        type: 'consultation',
        source: 'instagram',
        outcome: 'compare_quotes',
        value: 2400,
        quoteReason: 'compare_quotes',
        notes: 'Hot lead. Comparing two quotes, likely to move if fitting date is firm.'
      });

      await DB.addCommunication({ customerId: ids['Helen Carter'], type: 'whatsapp', template: 'quote_follow_up' });
      await DB.addCommunication({ customerId: ids['Omar Malik'], type: 'whatsapp', template: 'quote_follow_up' });
      await DB.setSetting('pitchDemoSeeded', true);

      Toast.show('Demo day loaded', 'success');
      App.navigate('today');
    } catch (e) {
      console.error('Pitch demo seed failed:', e);
      Toast.show('Could not load demo data', 'error');
    }
  }
};

App.registerFeature(ControlFeature);
