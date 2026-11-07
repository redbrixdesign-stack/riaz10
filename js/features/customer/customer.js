/* ============================================
   ADVISOROS v5.0 — CUSTOMER 360
   One page per customer: contact details, outstanding
   quotes, orders, measurements, full history, photos.
   The hub every other screen links to.
   ============================================ */

const CustomerFeature = {
  id: 'customer',
  name: 'Customer',
  icon: 'person',
  route: false,

  render(params = {}) {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return `<div class="empty-state"><span class="material-symbols-rounded">person_off</span><div>Customer not found</div></div>`;
    }
    this._lastId = id;
    return this.renderProfile(id, params);
  },

  async renderProfile(customerId, params = {}) {
    let customer = null;
    try {
      customer = await DB.getCustomer(customerId);
    } catch (e) {
      console.error('Failed to load customer:', e);
    }

    if (!customer) {
      return `<div class="empty-state"><span class="material-symbols-rounded">person_off</span><div>Customer not found</div></div>`;
    }

    let appts = [];
    let orders = [];
    let comms = [];
    let communicationLoadFailed = false;
    const readErrors=[];
    let photos = [];
    let voiceNotes = [];
    let structuredQuotes = [];
    let importedDocuments = [];
    let jobs = [];
    let invoices = [];
    let payments = [];
    let retention = [];
    let linkedExpenses = null;
    try { appts = await DB.getAppointmentsByCustomer(customerId); } catch (e) {readErrors.push('visits');}
    try { orders = await DB.db.orders.where('customerId').equals(customerId).toArray(); } catch (e) {readErrors.push('orders');}
    try { comms = await DB.db.communications.where('customerId').equals(customerId).toArray(); } catch (e) { communicationLoadFailed = true; }
    try { if (typeof CommunicationService !== 'undefined') comms = await CommunicationService.decorate(comms); } catch (e) { communicationLoadFailed = true; }
    try { photos = await DB.getPhotosForCustomer(customerId); } catch (e) {}
    try { voiceNotes = await DB.getVoiceNotes({ customerId }); } catch (e) {}
    try { if(typeof DB.getCustomerImportedDocuments==='function')importedDocuments=await DB.getCustomerImportedDocuments(customerId); } catch(_){readErrors.push('documents');}
    try { if (typeof DB.getQuotes === 'function') structuredQuotes = await DB.getQuotes({ customerId }); } catch (e) {}
    try { if (typeof DB.getJobs === 'function') jobs = await DB.getJobs({ customerId }); } catch (e) {}
    try { if (typeof DB.getInvoices === 'function') invoices = await DB.getInvoices({ customerId }); } catch (e) {}
    try { if (typeof DB.getLedgerEntries === 'function') payments = await DB.getLedgerEntries({ customerId }); } catch (e) {}
    try { if (typeof DB.getRetentionRecords === 'function') retention = await DB.getRetentionRecords({ customerId }); } catch (e) {}
    try { linkedExpenses = await DB.getExpensesByCustomer(customerId); } catch (e) { /* Show a read failure, not a false empty state. */ }

    appts.sort((a, b) => new Date(a.date) - new Date(b.date));
    // Measurements live per-visit; batch them across every visit of this
    // customer in one query instead of one round-trip per appointment.
    let measurements = [];
    if (appts.length) {
      try {
        measurements = await DB.getMeasurementsForAppointments(appts.map(a => a.id));
      } catch (e) {}
    }
    if(typeof CustomerWorkspace!=='undefined')return CustomerWorkspace.render({readErrors,customerId,customer,appts,orders,comms,communicationLoadFailed,photos,voiceNotes,structuredQuotes,importedDocuments,jobs,invoices,payments,retention,linkedExpenses,measurements,params});

    return '<div class="empty-state" role="alert"><p>Customer workspace could not load. Your saved records have not been changed.</p><button class="btn btn-primary" data-action="App.reloadPage">Reload Beelo</button></div>';
  },

  renderVisitPhoneHistory(visits, customerId) {
    const labels={introduced:'Introduced myself',visit_agreed:'Visit date/time agreed',introduced_and_agreed:'Introduced myself and agreed the visit',no_answer:'No answer / voicemail only',retracted:'Phone record retracted'};
    const rows=[];
    for (const visit of visits) {
      const records=(Array.isArray(visit.contactOutcomes)?visit.contactOutcomes:[]).filter(row=>row?.provenance==='advisor_recorded'&&row.channel==='phone'&&Number(row.customerId)===Number(customerId));
      const retracted=new Set(records.filter(row=>row.outcome==='retracted'&&row.targetId).map(row=>row.targetId));
      for (const row of records) rows.push({...row,visitId:visit.id,retracted:retracted.has(row.id)});
    }
    if (!rows.length) return '';
    rows.sort((a,b)=>(Date.parse(b.recordedAt)||0)-(Date.parse(a.recordedAt)||0));
    const dateLabel=value=>Number.isFinite(Date.parse(value))?Utils.formatDate(value,'short'):'Date not recorded';
    const visitIds=[...new Set(rows.map(row=>row.visitId))];
    return `<details id="customer-phone-history"><summary>Recorded visit phone contact (${rows.length})</summary><p class="hint">Adviser-recorded outcomes, not imported call logs or proof that a message was sent.</p>${rows.map(row=>`<div class="py-8"><strong>${Utils.escapeHtml(labels[row.outcome]||'Phone contact recorded')}${row.retracted?' · Retracted (history retained)':''}</strong><div class="hint">${Utils.escapeHtml(dateLabel(row.recordedAt))}</div></div>`).join('')}${visitIds.map(id=>`<button class="btn btn-outline btn-sm" data-action="FollowupsFeature.openContactOutcome" data-args='${Utils.escapeHtml(JSON.stringify([id]))}'>Review or correct phone history · ${Utils.escapeHtml(dateLabel(visits.find(visit=>visit.id===id)?.date))}</button>`).join('')}</details>`;
  },

  refreshProfile(customerId) {
    if(typeof VisitCommunication!=='undefined' && VisitCommunication.active(customerId))return VisitCommunication.refresh();
    if(typeof CustomerWorkspace!=='undefined' && document.getElementById('customer-workspace'))this._workspaceRestore={customerId:Number(customerId),scroll:App._inlineOriginScroll??Math.max(document.getElementById('main')?.scrollTop||0,window.scrollY||0,document.scrollingElement?.scrollTop||0),open:[...document.querySelectorAll('#customer-workspace details[open][id]')].map(el=>el.id)};
    const params=new URLSearchParams((App.currentHash||'').split('?')[1]);
    if (App.currentFeature?.id==='customer' && Number(params.get('id'))===Number(customerId)) return App.navigate(App.currentHash);
    return App.navigate('customer',{id:Number(customerId)});
  },

  openContactAttempt(customerId) {
    App.openModal(`<div class="sheet-header"><h3>Log contact attempt</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal">Close</button></div><div class="sheet-body"><p class="hint">Record what happened, not a judgement about the customer. This does not mark a message sent, a reply received or a visit cancelled.</p><label for="customer-attempt-text">Contact attempt</label><textarea id="customer-attempt-text" class="textarea" rows="4" placeholder="For example: Called before departure; no answer. Left voicemail."></textarea><button class="btn btn-primary btn-block" data-action="CustomerFeature.saveContactAttempt" data-args='${JSON.stringify([Number(customerId)])}'>Save contact attempt</button></div>`);
  },

  async saveContactAttempt(customerId) {
    const content = document.getElementById('customer-attempt-text')?.value.trim() || '';
    if (!content) return Toast.show('Describe the contact attempt first', 'warning');
    try {
      if (!Number.isInteger(Number(customerId)) || Number(customerId) <= 0 || !await DB.getCustomer(Number(customerId))) throw new Error('Customer not found');
      await DB.addCommunication({ customerId: Number(customerId), type: 'note', channel: 'manual', direction: 'internal', content: `Contact attempt: ${content}`, createdAt: new Date().toISOString() });
      App.closeModal(); Toast.show('Contact attempt saved', 'success'); this.refreshProfile(customerId);
    } catch (_) { Toast.show('Could not save the contact attempt', 'error'); }
  },

  openReplyModal(customerId) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Log customer reply</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><div class="form-group"><label for="customer-reply-channel">Channel</label><select class="select" id="customer-reply-channel"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="phone">Phone call</option><option value="email">Email</option></select></div><div class="form-group"><label for="customer-reply-text">What did the customer say?</label><textarea class="textarea" id="customer-reply-text" rows="5" placeholder="Short factual summary"></textarea></div><button class="btn btn-primary btn-block" data-action="CustomerFeature.saveReply" data-args='${JSON.stringify([Number(customerId)])}'>Save reply</button></div>`);
  },

  async saveReply(customerId) {
    const text = document.getElementById('customer-reply-text')?.value.trim() || '';
    const channel = document.getElementById('customer-reply-channel')?.value || 'whatsapp';
    if (!text) return Toast.show('Add the customer reply first', 'warning');
    try {
      await CommunicationService.recordReply(Number(customerId), text, channel);
      App.closeModal(); Toast.show('Customer reply added to history', 'success'); this.refreshProfile(customerId);
    } catch (e) { Toast.show('Could not save the reply', 'error'); }
  },

  orderStageLabel(order) {
    if (order.paymentManagedExternally || ['company','external'].includes(order.paymentResponsibility) || order.source === 'survey_referral') return `${order.source==='survey_referral'?'Referred':'Company-managed'} · ${['ordered', 'delivered', 'fitted'].includes(order.stage) ? order.stage : 'ordered'} · payment managed externally`;
    if ((order.balanceDue || 0) <= 0) return 'Paid';
    return (order.stage || 'ordered').replace(/_/g, ' ');
  },

  activate(params = {}) {
    if(this._workspaceRestore && Number(params.id)===this._workspaceRestore.customerId){const restore=this._workspaceRestore;this._workspaceRestore=null;restore.open.forEach(id=>{const el=document.getElementById(id);if(el)el.open=true;});App._workspaceNavigationScroll={revision:App._navigationRevision,scroll:restore.scroll};return;}
    if (params.section === 'documents' && typeof this.showWorkspaceSection === 'function') { const section=document.getElementById('customer-documents');if(section)section.open=true;return; }
    if (params.section !== 'followups') return;
    const revision = App._navigationRevision;
    const panel = document.getElementById('customer-followups');
    setTimeout(() => {
      if (!panel?.isConnected || revision !== App._navigationRevision) return;
      if (document.visibilityState === 'hidden' || App._inlineSurface?.isConnected || document.getElementById('modal-overlay')?.classList?.contains('active') || document.getElementById('modal-full')?.classList?.contains('active')) return;
      const title = panel.querySelector('h2');
      title?.setAttribute('tabindex', '-1');
      title?.focus({preventScroll:true});
      panel.scrollIntoView({block:'start'});
    }, 240);
  },

  renderPhotoThumb(p) {
    return `<div class="photo-tile"  role="button" tabindex="0" aria-label="View photo" data-action="AppointmentsFeature.openPhotoViewer" data-args='${JSON.stringify([(p.id), (p.customerId)])}' data-key="Enter, space">
      <img class="img-cover" src="${Utils.photoDataUrl(p)}" alt="" >
    </div>`;
  }
};

App.registerFeature(CustomerFeature);
