/* ============================================
   BEELO — TOOLS
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
        ${App.renderTopHeader({ title: 'Tools' })}

        <div class="p-md" >

          <!-- TODAY (most frequent) -->
          <section class="notebook-section control-section">
            <div class="notebook-title">
              <h2>Today</h2>
            </div>
            <div class="control-grid">
              <button class="control-tile" type="button" onclick="App.navigate('appointments', {action: 'add'})">
                <span class="material-symbols-rounded">add</span>
                <span>Add Visit</span>
              </button>
              <button class="control-tile" type="button" onclick="MoneyFeature.openMileageModal()">
                <span class="material-symbols-rounded">route</span>
                <span>Log Mileage</span>
              </button>
              <button class="control-tile" type="button" onclick="MoneyFeature.openExpenseModal()">
                <span class="material-symbols-rounded">receipt_long</span>
                <span>Log Expense</span>
              </button>
              <button class="control-tile" type="button" onclick="TodayFeature.openEODModal()">
                <span class="material-symbols-rounded">fact_check</span>
                <span>End of Day</span>
              </button>
            </div>
          </section>

          <!-- CUSTOMER -->
          <section class="notebook-section control-section">
            <div class="notebook-title">
              <h2>Customer</h2>
            </div>
            <div class="control-grid">
              <button class="control-tile" type="button" onclick="App.navigate('appointments')">
                <span class="material-symbols-rounded">person_search</span>
                <span>Find Customer</span>
              </button>
              <button class="control-tile" type="button" onclick="App.navigate('orders')">
                <span class="material-symbols-rounded">view_kanban</span>
                <span>Orders Board</span>
              </button>
              <button class="control-tile" type="button" onclick="App.navigate('followups')">
                <span class="material-symbols-rounded">campaign</span>
                <span>Follow-ups</span>
              </button>
            </div>
          </section>

          <!-- MONEY & ROUTE -->
          <section class="notebook-section control-section">
            <div class="notebook-title">
              <h2>Money & Route</h2>
            </div>
            <div class="control-grid">
              <button class="control-tile" type="button" onclick="App.navigate('route')">
                <span class="material-symbols-rounded">map</span>
                <span>Route Planner</span>
              </button>
              <button class="control-tile" type="button" onclick="ControlFeature.openMeasurePicker()">
                <span class="material-symbols-rounded">straighten</span>
                <span>Measure</span>
              </button>
              <button class="control-tile" type="button" onclick="App.navigate('ocr')">
                <span class="material-symbols-rounded">document_scanner</span>
                <span>Scan Document</span>
              </button>
            </div>
          </section>

          <!-- DATA & SETTINGS -->
          <section class="notebook-section control-section">
            <div class="notebook-title">
              <h2>Data & Settings</h2>
            </div>
            <div class="control-grid">
              <button class="control-tile" type="button" onclick="App.navigate('settings')">
                <span class="material-symbols-rounded">settings</span>
                <span>Settings</span>
              </button>
              <button class="control-tile" type="button" onclick="ExportService.exportBackup()">
                <span class="material-symbols-rounded">backup</span>
                <span>Export Backup</span>
              </button>
              ${demoSeeded ? `
              <button class="control-tile" type="button" onclick="ControlFeature.confirmClearPitchDemo()">
                <span class="material-symbols-rounded text-danger">delete_sweep</span>
                <span>Remove Demo Data</span>
              </button>
              ` : ''}
            </div>
          </section>

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
