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
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Quick add</h3></div><div class="sheet-body"><div class="center-box"><span aria-hidden="true" class="material-symbols-rounded fs-48 text-brand">document_scanner</span><div class="fw-600 mt-sm">Reading and finding the right place…</div><div class="hint mt-sm">Nothing is saved until you review it.</div></div></div>`);
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
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>What are you adding?</h3><button class="btn btn-ghost btn-sm" data-action="ControlFeature.cancelQuickCapture" aria-label="Close"><span aria-hidden="true" class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <div class="hint mb-md">Beelo could not identify the document confidently. Choose where it belongs.</div>
      <button class="btn btn-primary btn-block" data-action="ControlFeature.routeQuickCapture" data-args='${JSON.stringify(["visit"])}'><span aria-hidden="true" class="material-symbols-rounded">event</span>Customer / visit</button>
      <button class="btn btn-outline btn-block mt-sm" data-action="ControlFeature.routeQuickCapture" data-args='${JSON.stringify(["expense"])}'><span aria-hidden="true" class="material-symbols-rounded">receipt_long</span>Expense receipt</button>
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
        App.navigate('appointments', { action: 'add', name: fields.name || '', phone: fields.phone || '', address, date: fields.appointmentDate || '', time, scannedType: fields.appointmentType || '' });
        Toast.show(fields.appointmentType ? 'Visit details and type found — review, then save' : 'Visit details found — choose the type, then save', 'success');
      } else {
        App.navigate('ocr');
        setTimeout(() => OCRFeature.processImage({ target: { files: [pending.file] } }), 50);
      }
    }
  },

  async render() {
    const tile = (label,icon,action,args=[]) => `<button class="control-tile" type="button" data-action="${action}" data-args='${Utils.escapeHtml(JSON.stringify(args))}'><span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
    const route = (label,icon,id,params) => tile(label,icon,'App.navigate',params?[id,params]:[id]);
    const card = (title,content) => `<section class="card mb-md" aria-label="${title}"><h2 class="fw-600 fs-16 mb-sm">${title}</h2><div class="control-grid">${content}</div></section>`;
    return `<div class="fade-in">${App.renderTopHeader({title:'Tools'})}<div class="p-md"><p class="hint mb-md">Find customers on Home. Open their visit for measurements, notes and messages.</p>
      ${card('Add & capture',route('Add Visit','add','appointments',{action:'add'})+tile('Log Expense','receipt_long','MoneyFeature.openExpenseModal')+tile('Log Mileage','route','MoneyFeature.openMileageModal')+tile('Import customer document','upload_file','CustomerFeature.openDocumentImport'))}
      ${card('Plan & review',route('Route Planner','map','route')+tile('End of Day','fact_check','TodayFeature.openEODModal')+route('Follow-ups','campaign','followups'))}
      ${card('Money & settings',route('Money','account_balance_wallet','money')+route('Backup & restore','backup','settings',{section:'data'})+route('Settings','settings','settings'))}
      <details class="card mb-md control-more" id="tools-more"><summary class="fw-600 fs-16">More tools &amp; saved records</summary><p class="hint mt-sm">Optional workflows and business setup. Your existing records stay available.</p><div class="control-grid mt-sm">
        ${route('Orders overview','view_kanban','orders')}${route('Jobs','construction','jobs')}${route('Lead Inbox','person_add','leads')}${route('Availability','event_busy','capacity')}${route('Invoices','receipt_long','invoices')}${route('Suppliers','local_shipping','suppliers')}${route('Job costing setup','monitoring','profitability')}
      </div></details>
    </div></div>`;
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
      <div class="sheet-header"><h3>Measure for which visit?</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal"><span aria-hidden="true" class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="flex flex-col gap-sm" >
          ${visits.map(visit => `
            <button class="list-item bordered-8 text-left"  data-close="1" data-action="App.navigate" data-args='${JSON.stringify(["measure", {appointmentId: (visit.id)}])}'>
              <span aria-hidden="true" class="material-symbols-rounded text-brand mr-12" >straighten</span>
              <span class="flex-1 min-w-0" >
                <span class="block fw-600 ellipsis" >${Utils.escapeHtml(visit.clientName || 'Unknown')}</span>
                <span class="block fs-12 text-tertiary" >${Utils.formatDate(visit.date, 'datetime')}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>`;
    App.openModal(content);
  }
};

App.registerFeature(ControlFeature);
