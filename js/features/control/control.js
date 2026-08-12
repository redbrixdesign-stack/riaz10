/* ============================================
   ADVISOROS v5.0 — CONTROL CENTER
   Quiet home, practical tools one tap away
   ============================================ */

const ControlFeature = {
  id: 'control',
  name: 'Tools',
  icon: 'construction',

  async render() {
    const demoSeeded = await DB.getSetting('pitchDemoSeeded', false);
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
          { icon: 'route', label: 'Log Mileage', action: "MoneyFeature.openMileageModal()" },
          { icon: 'receipt_long', label: 'Log Expense', action: "MoneyFeature.openExpenseModal()" },
          { icon: 'fact_check', label: 'End of Day', action: "TodayFeature.openEODModal()" }
        ])}

        ${this.renderSection('Selling & service', [
          { icon: 'view_kanban', label: 'Orders Board', action: "App.navigate('orders')" },
          { icon: 'campaign', label: 'Follow-ups', action: "App.navigate('followups')" },
          { icon: 'person_search', label: 'Find Customer', action: "App.navigate('appointments')" }
        ])}

        ${this.renderSection('Plan & measure', [
          { icon: 'map', label: 'Route Planner', action: "App.navigate('route')" },
          { icon: 'straighten', label: 'Measure', action: "ControlFeature.openMeasurePicker()" },
          { icon: 'document_scanner', label: 'Scan Document', action: "App.navigate('ocr')" }
        ])}

        ${this.renderSection('Account', [
          { icon: 'settings', label: 'Settings', action: "App.navigate('settings')" },
          { icon: 'cloud_download', label: 'Export Backup', action: "ExportService.exportBackup()" },
          // Only shown if the pitch-demo dataset was ever loaded on this
          // device - self-hiding once cleared, rather than a permanent
          // tile that would just be more of the noise this was meant to fix.
          ...(demoSeeded ? [{ icon: 'delete_sweep', label: 'Remove Demo Data', action: "ControlFeature.confirmClearPitchDemo()" }] : [])
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
        <div class="flex flex-col gap-sm" >
          ${visits.map(visit => `
            <button class="list-item bordered-8 text-left"  onclick="App.closeModal(); App.navigate('measure', {appointmentId: ${visit.id}})">
              <span class="material-symbols-rounded text-brand mr-12" >straighten</span>
              <span class="flex-1 min-w-0" >
                <span class="block fw-600 ellipsis" >${Utils.escapeHtml(visit.clientName || 'Unknown')}</span>
                <span class="block fs-12 text-tertiary" >${Utils.formatDate(visit.date, 'datetime')}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>`;
    App.openModal(content);
  },

  // The six phone numbers seedPitchDemo used to create its fake customers -
  // unique placeholder numbers unlikely to collide with a real customer's
  // number, so they're a safe, precise way to find and remove exactly what
  // that feature created, on a device where it was run before this tool was
  // taken out of the UI. Deliberately not a general "clear all test data"
  // button - there's no way to reliably tell a person's own manually-entered
  // test customers apart from real ones, so this only ever touches the
  // specific records this app itself seeded.
  PITCH_DEMO_PHONES: ['07494 809272', '07700 900481', '07700 900612', '07700 900734', '07700 900845', '07700 900926'],

  async confirmClearPitchDemo() {
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Remove Demo Data?</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary mb-md" >
          This removes the sample customers and visits used for demoing the app (Ayesha Khan, James Wilson, and others), along with their visits, orders, and messages. Your own customers and visits are not affected.
        </div>
        <button class="btn btn-danger btn-block" onclick="ControlFeature.clearPitchDemo()">
          <span class="material-symbols-rounded">delete_sweep</span>Remove Demo Data
        </button>
        <button class="btn btn-outline btn-block mt-sm"  onclick="App.closeModal()">Cancel</button>
      </div>`;
    App.openModal(content);
  },

  async clearPitchDemo() {
    try {
      const customers = await DB.db.customers.where('phone').anyOf(this.PITCH_DEMO_PHONES).toArray();
      for (const customer of customers) {
        await DB.deleteCustomer(customer.id);
      }
      await DB.setSetting('pitchDemoSeeded', false);
      App.closeModal();
      Toast.show(customers.length > 0 ? `Removed ${customers.length} demo customer${customers.length === 1 ? '' : 's'}` : 'Demo data already removed', 'success');
      App.navigate('control');
    } catch (e) {
      console.error('Clear demo data failed:', e);
      Toast.show('Failed to remove demo data', 'error');
    }
  }
};

App.registerFeature(ControlFeature);
