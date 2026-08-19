/* ============================================
   BEELO — LEAD INBOX
   Enquiries that can exist before a customer or
   visit. The Follow-ups screen may mount
   renderInbox(); the feature also works as a
   secondary route from Tools.
   ============================================ */

const LeadsFeature = {
  id: 'leads',
  name: 'Leads',
  icon: 'person_add',
  route: false,

  render() {
    return this.renderScreen();
  },

  async renderScreen() {
    return `<div class="fade-in">
      ${App.renderTopHeader({
        title: 'Lead inbox',
        showBack: true,
        backHref: 'followups',
        actions: `<button class="btn btn-sm btn-primary" data-action="LeadsFeature.openAddLead">
          <span class="material-symbols-rounded">add</span> Enquiry
        </button>`
      })}
      <div class="px-md pb-lg">${await this.renderInbox()}</div>
    </div>`;
  },

  async renderInbox() {
    let leads = [];
    try { leads = await DB.getLeads(); } catch (error) {
      console.error('Lead inbox failed:', error);
      return `<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Could not load enquiries</div></div>`;
    }

    const active = leads.filter(lead => !['converted', 'lost'].includes(lead.status));
    const closed = leads.filter(lead => ['converted', 'lost'].includes(lead.status));
    const now = Date.now();
    const due = active.filter(lead => !lead.nextActionAt || new Date(lead.nextActionAt).getTime() <= now);
    const upcoming = active.filter(lead => lead.nextActionAt && new Date(lead.nextActionAt).getTime() > now);

    if (!leads.length) return `<div class="empty-state empty-state-lg">
      <span class="material-symbols-rounded">person_add</span>
      <div class="fw-600 mb-xs">No enquiries yet</div>
      <div class="fs-13">Save a new lead before a visit has been arranged.</div>
      <button class="btn btn-primary btn-sm mt-md" data-action="LeadsFeature.openAddLead"><span class="material-symbols-rounded">add</span>Add enquiry</button>
    </div>`;

    return `${this.renderGroup('Needs action', due)}
      ${this.renderGroup('Upcoming', upcoming)}
      ${closed.length ? `<details class="mt-md"><summary class="section-label">Closed (${closed.length})</summary>${closed.map(lead => this.renderLeadCard(lead)).join('')}</details>` : ''}`;
  },

  renderGroup(label, leads) {
    if (!leads.length) return '';
    return `<div class="section-label">${label} (${leads.length})</div>${leads.map(lead => this.renderLeadCard(lead)).join('')}`;
  },

  renderLeadCard(lead) {
    const name = lead.name || lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed enquiry';
    const phone = lead.phone || '';
    const status = lead.status || 'new';
    const date = lead.nextActionAt ? Utils.formatDate(lead.nextActionAt, 'short') : 'Action needed';
    const canBook = !['converted', 'lost'].includes(status);
    return `<article class="card mb-sm" data-lead-id="${lead.id}">
      <div class="flex items-start justify-between gap-sm">
        <div class="min-w-0">
          <div class="fw-600 ellipsis">${Utils.escapeHtml(name)}</div>
          <div class="fs-12 text-tertiary">${Utils.escapeHtml(lead.source || 'Manual')} · ${Utils.escapeHtml(date)}</div>
        </div>
        <span class="badge">${Utils.escapeHtml(status.replace(/_/g, ' '))}</span>
      </div>
      ${lead.notes ? `<div class="fs-13 text-secondary mt-8">${Utils.escapeHtml(lead.notes)}</div>` : ''}
      <div class="flex gap-sm mt-10">
        ${phone ? `<a class="btn btn-outline btn-sm" href="tel:${Utils.escapeHtml(phone)}" aria-label="Call ${Utils.escapeHtml(name)}"><span class="material-symbols-rounded fs-16">call</span>Call</a>` : ''}
        ${canBook ? `<button class="btn btn-primary btn-sm flex-1" data-action="LeadsFeature.bookVisit" data-args='${JSON.stringify([lead.id])}'><span class="material-symbols-rounded fs-16">event</span>Book visit</button>` : ''}
        <button class="btn btn-ghost btn-sm" aria-label="Lead actions" data-action="LeadsFeature.openLead" data-args='${JSON.stringify([lead.id])}'><span class="material-symbols-rounded">more_horiz</span></button>
      </div>
    </article>`;
  },

  openAddLead() {
    const today = Utils.formatDate(new Date(), 'iso');
    App.openModal(`<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>New enquiry</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="form-group"><label for="lead-name">Name</label><input class="input" id="lead-name" autocomplete="name"></div>
        <div class="form-group"><label for="lead-phone">Phone</label><input class="input" id="lead-phone" type="tel" inputmode="tel" autocomplete="tel"></div>
        <div class="form-group"><label for="lead-address">Address</label><input class="input" id="lead-address" autocomplete="street-address"></div>
        <div class="form-group"><label for="lead-source">Source</label><select class="select" id="lead-source">${CONFIG.leadSources.map(source => `<option value="${source.toLowerCase().replace(/\s+/g, '_')}">${Utils.escapeHtml(source)}</option>`).join('')}</select></div>
        <div class="form-group"><label for="lead-next-action">Next action</label><input class="input" id="lead-next-action" type="date" value="${today}"></div>
        <div class="form-group"><label for="lead-notes">Notes</label><textarea class="textarea" id="lead-notes" placeholder="What did they ask about?"></textarea></div>
        <div class="hint mb-md">Add a name or phone number. You can book the visit later.</div>
        <button class="btn btn-primary btn-block" id="lead-save-btn" data-action="LeadsFeature.saveLead">Save enquiry</button>
      </div>`);
  },

  async saveLead() {
    const name = document.getElementById('lead-name')?.value.trim() || '';
    const phone = document.getElementById('lead-phone')?.value.trim() || '';
    if (!name && !phone) return Toast.show('Add a name or phone number', 'warning');
    const button = document.getElementById('lead-save-btn');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      const address = document.getElementById('lead-address')?.value.trim() || '';
      const nextDate = document.getElementById('lead-next-action')?.value || '';
      await DB.addLead({
        name,
        phone,
        address: address ? { line1: address } : null,
        source: document.getElementById('lead-source')?.value || 'manual',
        status: 'new',
        receivedAt: new Date().toISOString(),
        nextActionAt: nextDate ? new Date(`${nextDate}T09:00:00`).toISOString() : null,
        notes: document.getElementById('lead-notes')?.value.trim() || ''
      });
      App.closeModal();
      Toast.show('Enquiry saved', 'success');
      App.navigate('leads');
    } catch (error) {
      console.error('Save lead failed:', error);
      if (button) button.disabled = false;
      Toast.show('Could not save enquiry', 'error');
    }
  },

  bookVisit(leadId) {
    App.navigate('appointments', { action: 'add', leadId });
  },

  async openLead(leadId) {
    const lead = await DB.getLead(leadId);
    if (!lead) return Toast.show('Enquiry not found', 'error');
    const converted = lead.status === 'converted';
    App.openModal(`<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>${Utils.escapeHtml(lead.name || lead.fullName || 'Enquiry')}</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        ${lead.phone ? `<div class="fs-14 text-secondary mb-sm">${Utils.escapeHtml(lead.phone)}</div>` : ''}
        ${lead.notes ? `<div class="card inset-dark mb-md">${Utils.escapeHtml(lead.notes)}</div>` : ''}
        ${converted && lead.appointmentId ? `<button class="btn btn-primary btn-block" data-close="1" data-action="App.navigate" data-args='${JSON.stringify(['appointments', { id: lead.appointmentId }])}'>Open visit</button>` : ''}
        ${!converted ? `<button class="btn btn-primary btn-block" data-close="1" data-action="LeadsFeature.bookVisit" data-args='${JSON.stringify([lead.id])}'><span class="material-symbols-rounded">event</span>Book visit</button>
          <button class="btn btn-outline btn-block mt-sm" data-action="LeadsFeature.convertCustomer" data-args='${JSON.stringify([lead.id])}'>Create customer only</button>
          <button class="btn btn-outline btn-block mt-sm" data-action="LeadsFeature.markContacted" data-args='${JSON.stringify([lead.id])}'>Mark contacted</button>
          <button class="btn btn-outline btn-block mt-sm" data-action="LeadsFeature.openSnooze" data-args='${JSON.stringify([lead.id])}'>Choose next action</button>
          <button class="btn btn-ghost btn-block mt-sm text-danger" data-action="LeadsFeature.markLost" data-args='${JSON.stringify([lead.id])}'>Mark lost</button>` : ''}
      </div>`);
  },

  async convertCustomer(leadId) {
    try {
      const result = await DB.convertLeadToCustomer(leadId);
      App.closeModal();
      Toast.show('Customer created', 'success');
      App.navigate('customer', { id: result.customer.id });
    } catch (error) {
      console.error('Lead conversion failed:', error);
      Toast.show('Could not create customer', 'error');
    }
  },

  async markContacted(leadId) {
    await DB.updateLead(leadId, { status: 'contacted', contactedAt: new Date().toISOString() });
    App.closeModal();
    Toast.show('Marked contacted', 'success');
    App.navigate('leads');
  },

  openSnooze(leadId) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Next action</h3></div><div class="sheet-body">
      <div class="form-group"><label for="lead-snooze-date">Remind me on</label><input class="input" id="lead-snooze-date" type="date" value="${Utils.formatDate(tomorrow, 'iso')}"></div>
      <button class="btn btn-primary btn-block" data-action="LeadsFeature.saveSnooze" data-args='${JSON.stringify([leadId])}'>Save next action</button>
      <button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button>
    </div>`);
  },

  async saveSnooze(leadId) {
    const value = document.getElementById('lead-snooze-date')?.value || '';
    if (!value) return Toast.show('Choose a date', 'warning');
    await DB.updateLead(leadId, { nextActionAt: new Date(`${value}T09:00:00`).toISOString() });
    App.closeModal();
    Toast.show('Next action saved', 'success');
    App.navigate('leads');
  },

  markLost(leadId) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Why was it lost?</h3></div><div class="sheet-body">
      <div class="form-group"><label for="lead-loss-reason">Reason</label><textarea class="textarea" id="lead-loss-reason"></textarea></div>
      <button class="btn btn-danger btn-block" data-action="LeadsFeature.saveLost" data-args='${JSON.stringify([leadId])}'>Mark lost</button>
      <button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button>
    </div>`);
  },

  async saveLost(leadId) {
    const reason = document.getElementById('lead-loss-reason')?.value.trim() || '';
    if (!reason) return Toast.show('Add a reason', 'warning');
    await DB.updateLead(leadId, { status: 'lost', lossReason: reason, lostAt: new Date().toISOString() });
    App.closeModal();
    Toast.show('Enquiry closed', 'success');
    App.navigate('leads');
  }
};

App.registerFeature(LeadsFeature);
