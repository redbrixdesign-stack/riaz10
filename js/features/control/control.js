/* ============================================
   BEELO — TOOLS
   Quiet home, practical tools one tap away
   ============================================ */

const ControlFeature = {
  id: 'control',
  name: 'Tools',
  icon: 'construction',
  pendingQuickCapture: null,

  async handleQuickCapture(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      event.target.value = '';
      return Toast.show('Choose or take a photo', 'warning');
    }
    this.pendingQuickCapture = { file, fields: {} };
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Quick add</h3></div><div class="sheet-body"><div class="center-box"><span class="material-symbols-rounded fs-48 text-brand">document_scanner</span><div class="fw-600 mt-sm">Reading and finding the right place…</div><div class="hint mt-sm">Nothing is saved until you review it.</div></div></div>`);
    try {
      if (typeof AIService !== 'undefined' && AIService.isEnabled() && typeof AIService.extractQuickCapture === 'function') {
        const result = await AIService.extractQuickCapture(file);
        if (result.ok && ['visit', 'expense'].includes(result.fields?.kind)) {
          this.pendingQuickCapture.fields = result.fields;
          await this.routeQuickCapture(result.fields.kind);
          return;
        }
      }
      this.openQuickCaptureChoice();
    } catch (error) {
      console.error('Quick capture routing failed:', error);
      this.openQuickCaptureChoice();
    } finally {
      if (event?.target) event.target.value = '';
    }
  },

  openQuickCaptureChoice() {
    if (!this.pendingQuickCapture?.file) return;
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>What are you adding?</h3><button class="btn btn-ghost btn-sm" data-action="ControlFeature.cancelQuickCapture" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <div class="hint mb-md">Beelo could not identify the document confidently. Choose where it belongs.</div>
      <button class="btn btn-primary btn-block" data-action="ControlFeature.routeQuickCapture" data-args='${JSON.stringify(["visit"])}'><span class="material-symbols-rounded">event</span>Customer / visit</button>
      <button class="btn btn-outline btn-block mt-sm" data-action="ControlFeature.routeQuickCapture" data-args='${JSON.stringify(["expense"])}'><span class="material-symbols-rounded">receipt_long</span>Expense receipt</button>
    </div>`);
  },

  cancelQuickCapture() { this.pendingQuickCapture = null; App.closeModal(); },

  async routeQuickCapture(kind) {
    const pending = this.pendingQuickCapture;
    if (!pending?.file) return Toast.show('Take the photo again', 'warning');
    const fields = pending.fields || {};
    if (kind === 'expense') {
      App.closeModal();
      MoneyFeature.openExpenseModal();
      await MoneyFeature.applyQuickCapture(pending.file, fields);
      this.pendingQuickCapture = null;
      return;
    }
    if (kind === 'visit') {
      const hasUsefulDetails = fields.kind === 'visit' && (fields.name || fields.address || fields.postcode);
      this.pendingQuickCapture = null;
      App.closeModal();
      if (hasUsefulDetails) {
        const address = [fields.address, fields.town, fields.city, fields.postcode].filter(Boolean).join(', ');
        const time = String(fields.appointmentTime || '').split(/\s*(?:-|–|—|to)\s*/)[0];
        App.navigate('appointments', { action: 'add', name: fields.name || '', phone: fields.phone || '', address, date: fields.appointmentDate || '', time });
        Toast.show('Visit details found — review, then save', 'success');
      } else {
        App.navigate('ocr');
        setTimeout(() => OCRFeature.processImage({ target: { files: [pending.file] } }), 50);
      }
    }
  },

  async render() {
    const demoSeeded = await DB.getSetting('pitchDemoSeeded', false);

    // One .card per category — the same dark-canvas/cream-card pattern as
    // every other screen (Settings, Money, Orders…). No full-screen surface.
    const card = (title, tiles) => `
      <div class="card mb-md">
        <div class="fw-600 fs-16 mb-sm" >${title}</div>
        <div class="control-grid">${tiles}</div>
      </div>`;

    return `
      <div class="fade-in">
        ${App.renderTopHeader({ title: 'Tools' })}

        <div class="p-md" >
          ${card('Today', `
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {action: "add"}])}'>
              <span class="material-symbols-rounded">add</span>
              <span>Add Visit</span>
            </button>
            <button class="control-tile" type="button" data-action="MoneyFeature.openMileageModal">
              <span class="material-symbols-rounded">route</span>
              <span>Log Mileage</span>
            </button>
            <button class="control-tile" type="button" data-action="MoneyFeature.openExpenseModal">
              <span class="material-symbols-rounded">receipt_long</span>
              <span>Log Expense</span>
            </button>
            <button class="control-tile" type="button" data-action="TodayFeature.openEODModal">
              <span class="material-symbols-rounded">fact_check</span>
              <span>End of Day</span>
            </button>
          `)}

          ${card('Customer', `
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["jobs"])}'>
              <span class="material-symbols-rounded">construction</span>
              <span>Jobs</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["leads"])}'>
              <span class="material-symbols-rounded">person_add</span>
              <span>Lead Inbox</span>
            </button>
            <button class="control-tile" type="button" data-action="AppointmentsFeature.openCustomerSearch" data-args='${JSON.stringify([true])}'>
              <span class="material-symbols-rounded">person_search</span>
              <span>Find Customer</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["orders"])}'>
              <span class="material-symbols-rounded">view_kanban</span>
              <span>Orders Board</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["followups"])}'>
              <span class="material-symbols-rounded">campaign</span>
              <span>Follow-ups</span>
            </button>
          `)}

          ${card('Money & Route', `
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["suppliers"])}'>
              <span class="material-symbols-rounded">local_shipping</span>
              <span>Suppliers</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["capacity"])}'>
              <span class="material-symbols-rounded">event_busy</span>
              <span>Availability</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["profitability"])}'>
              <span class="material-symbols-rounded">monitoring</span>
              <span>Profitability</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["invoices"])}'>
              <span class="material-symbols-rounded">receipt_long</span>
              <span>Invoices</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["route"])}'>
              <span class="material-symbols-rounded">map</span>
              <span>Route Planner</span>
            </button>
            <button class="control-tile" type="button" data-action="ControlFeature.openMeasurePicker">
              <span class="material-symbols-rounded">straighten</span>
              <span>Measure</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["ocr"])}'>
              <span class="material-symbols-rounded">document_scanner</span>
              <span>Scan Document</span>
            </button>
          `)}

          ${card('Data & Settings', `
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["communications"])}'>
              <span class="material-symbols-rounded">hub</span>
              <span>Integrations</span>
            </button>
            <button class="control-tile" type="button" data-action="App.navigate" data-args='${JSON.stringify(["settings"])}'>
              <span class="material-symbols-rounded">settings</span>
              <span>Settings</span>
            </button>
            <button class="control-tile" type="button" data-action="ExportService.exportBackup">
              <span class="material-symbols-rounded">backup</span>
              <span>Export Backup</span>
            </button>
            ${demoSeeded ? `
            <button class="control-tile" type="button" data-action="ControlFeature.confirmClearPitchDemo">
              <span class="material-symbols-rounded text-danger">delete_sweep</span>
              <span>Remove Demo Data</span>
            </button>
            ` : ''}
          `)}
        </div>
      </div>
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
      <div class="sheet-header"><h3>Measure for which visit?</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="flex flex-col gap-sm" >
          ${visits.map(visit => `
            <button class="list-item bordered-8 text-left"  data-close="1" data-action="App.navigate" data-args='${JSON.stringify(["measure", {appointmentId: (visit.id)}])}'>
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
      <div class="sheet-header"><h3>Remove Demo Data?</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary mb-md" >
          This removes the sample customers and visits used for demoing the app (Ayesha Khan, James Wilson, and others), along with their visits, orders, and messages. Your own customers and visits are not affected.
        </div>
        <button class="btn btn-danger btn-block" data-action="ControlFeature.clearPitchDemo">
          <span class="material-symbols-rounded">delete_sweep</span>Remove Demo Data
        </button>
        <button class="btn btn-outline btn-block mt-sm"  data-action="App.closeModal">Cancel</button>
      </div>`;
    App.openModal(content);
  },

  async clearPitchDemo() {
    try {
      const customers = (await DB.getAllCustomers()).filter(c => this.PITCH_DEMO_PHONES.includes(c.phone));
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
