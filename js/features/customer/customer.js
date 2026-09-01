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
    return this.renderProfile(id);
  },

  async renderProfile(customerId) {
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
    let photos = [];
    let voiceNotes = [];
    let structuredQuotes = [];
    let jobs = [];
    let invoices = [];
    let payments = [];
    let retention = [];
    try { appts = await DB.getAppointmentsByCustomer(customerId); } catch (e) {}
    try { orders = await DB.db.orders.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { comms = await DB.db.communications.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { photos = await DB.getPhotosForCustomer(customerId); } catch (e) {}
    try { voiceNotes = await DB.getVoiceNotes({ customerId }); } catch (e) {}
    try { if (typeof DB.getQuotes === 'function') structuredQuotes = await DB.getQuotes({ customerId }); } catch (e) {}
    try { if (typeof DB.getJobs === 'function') jobs = await DB.getJobs({ customerId }); } catch (e) {}
    try { if (typeof DB.getInvoices === 'function') invoices = await DB.getInvoices({ customerId }); } catch (e) {}
    try { if (typeof DB.getLedgerEntries === 'function') payments = await DB.getLedgerEntries({ customerId }); } catch (e) {}
    try { if (typeof DB.getRetentionRecords === 'function') retention = await DB.getRetentionRecords({ customerId }); } catch (e) {}

    appts.sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstVisit = appts[0];
    const lastVisit = appts[appts.length - 1];
    const totalValue = appts.reduce((sum, a) => sum + (a.outcome === 'ordered' ? (a.value || 0) : 0), 0);
    const interests = Object.entries(AppointmentsFeature.extractBuyingInterests(appts)).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Follow-up-able appointments (quote chases) still open for this customer.
    const quoteOutcomes = (typeof TalkFeature !== 'undefined') ? Object.keys(TalkFeature.OUTCOME_TEMPLATE_MAP) : ['quoted', 'thinking', 'partner', 'compare_quotes', 'expensive', 'customer_no_show', 'advisor_unavailable'];
    const outstandingQuotes = appts.filter(a => a.status !== 'cancelled' && quoteOutcomes.includes(a.outcome));
    const now = new Date();

    // Measurements live per-visit; batch them across every visit of this
    // customer in one query instead of one round-trip per appointment.
    let measurements = [];
    if (appts.length) {
      try {
        measurements = await DB.db.measurements.where('appointmentId').anyOf(appts.map(a => a.id)).toArray();
      } catch (e) {}
    }
    const apptById = new Map(appts.map(a => [a.id, a]));

    // One merged, chronological "everything that's happened with this
    // person" timeline - visits, orders, and follow-up messages together.
    const timeline = [
      ...appts.map(a => ({
        date: a.date,
        icon: CONFIG.appointmentTypes.find(t => t.id === a.type)?.icon || 'event',
        title: CONFIG.appointmentTypes.find(t => t.id === a.type)?.name || a.type || 'Visit',
        subtitle: a.outcome ? `Outcome: ${Utils.escapeHtml(a.outcome.replace(/_/g, ' '))}${a.value > 0 ? ` · ${Utils.formatCurrency(a.value)}` : ''}` : 'No outcome logged',
        onclick: `App.navigate('appointments', {id: ${a.id}})`
      })),
      ...orders.map(o => ({
        date: o.createdAt || o.date,
        icon: 'receipt',
        title: `Order ${Utils.escapeHtml(o.orderNumber || '')}`,
        subtitle: `${this.orderStageLabel(o)} · ${Utils.formatCurrency(o.total || 0)}`,
        onclick: `OrdersFeature.openOrderSheet(${o.id})`
      })),
      ...comms.map(c => ({
        date: c.sentAt,
        icon: 'chat',
        title: 'Follow-up sent',
        subtitle: Utils.escapeHtml((c.template || c.type || '').replace(/_/g, ' ')),
        onclick: ''
      }))
    ].filter(item => item.date).sort((a, b) => new Date(b.date) - new Date(a.date));

    const phone = customer.phone || '';
    const address = customer.address?.line1 || '';
    const name = customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer';

    return `
      <div class="fade-in">
        ${App.renderTopHeader({ 
          title: 'Customer 360', 
          showBack: true, 
          backHref: 'appointments' 
        })}

        <div class="card card-page-gap" >
          <div class="flex items-center gap-md" >
            <div class="avatar-56" >
              ${Utils.escapeHtml(name.charAt(0).toUpperCase())}
            </div>
            <div class="flex-1" >
              <div class="fs-20 fw-600" >${Utils.escapeHtml(name)}</div>
              <div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(customer.customerNumber || '')}</div>
            </div>
            <button class="btn btn-ghost btn-sm" aria-label="Edit customer details" data-action="AppointmentsFeature.openEditCustomerModal" data-args='${JSON.stringify([(customer.id)])}'>
              <span class="material-symbols-rounded">edit</span>
            </button>
          </div>

          ${address ? `<div class="mt-12 fs-13 text-secondary flex items-center gap-sm" ><span class="material-symbols-rounded fs-16" >location_on</span>${Utils.escapeHtml(address)}</div>` : ''}
          ${customer.email ? `<div class="mt-6 fs-13 text-secondary flex items-center gap-sm" ><span class="material-symbols-rounded fs-16" >mail</span>${Utils.escapeHtml(customer.email)}</div>` : ''}

          <div class="flex gap-sm mt-md" >
            ${phone ? `
              <a class="btn btn-outline btn-sm flex-1 gap-6"  href="tel:${Utils.escapeHtml(Utils.toE164Phone(phone) || phone)}">
                <span class="material-symbols-rounded fs-18" >call</span>
                Call
              </a>
              <button class="btn btn-outline btn-sm flex-1 gap-6"  data-action="ContactFeature.open" data-args='${Utils.escapeHtml(JSON.stringify([{name: (name), phone: (phone)}]))}'>
                <span class="material-symbols-rounded fs-18" >chat</span>
                Message
              </button>
            ` : ''}
            ${address ? `
              <button class="btn btn-outline btn-sm flex-1 gap-6"  data-action="Geo.openNavigation" data-args='${Utils.escapeHtml(JSON.stringify([(address)]))}'>
                <span class="material-symbols-rounded fs-18" >navigation</span>
                Navigate
              </button>
            ` : ''}
            <button class="btn btn-outline btn-sm flex-1 gap-6"  data-action="App.navigate" data-args='${Utils.escapeHtml(JSON.stringify(["appointments", {action: "add", name: (name), phone: (phone), address: (address)}]))}'>
              <span class="material-symbols-rounded fs-18" >add</span>
              Visit
            </button>
          </div>
        </div>

        <div class="card card-page">
          <div class="flex items-center justify-between mb-sm">
            <div class="fs-13 fw-600 text-secondary">Voice notes ${voiceNotes.length ? `(${voiceNotes.length})` : ''}</div>
            <button class="btn btn-outline btn-sm" data-action="VoiceNotes.openRecorder" data-args='${JSON.stringify([customerId, null, null])}'><span class="material-symbols-rounded fs-16">mic</span>Record</button>
          </div>
          ${VoiceNotes.renderList(voiceNotes, { customerId })}
        </div>

        <div class="card card-page" >
          <div class="hsc-stat-row">
            <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View visit history" data-action="CustomerFeature.scrollToHistory" data-key="Enter, space">
              <div class="hsc-stat-value">${appts.length}</div>
              <div class="hsc-stat-label">Visits</div>
            </div>
            <div class="hsc-stat">
              <div class="hsc-stat-value">${Utils.formatCurrency(totalValue)}</div>
              <div class="hsc-stat-label">Total Ordered</div>
            </div>
            <div class="hsc-stat">
              <div class="hsc-stat-value">${outstandingQuotes.length + structuredQuotes.filter(q => ['draft', 'issued'].includes(q.status)).length}</div>
              <div class="hsc-stat-label">Open Quotes</div>
            </div>
            <div class="hsc-stat">
              <div class="hsc-stat-value">${Utils.formatCurrency(orders.reduce((s, o) => s + ((o.balanceDue || 0) > 0 ? (o.balanceDue || 0) : 0), 0))}</div>
              <div class="hsc-stat-label">Owed</div>
            </div>
          </div>
          ${firstVisit ? `<div class="fs-12 text-tertiary mt-10 text-center" >Customer since ${Utils.formatDate(firstVisit.date, 'long')}${lastVisit ? ` · Last visit ${Utils.formatDate(lastVisit.date, 'short')}` : ''}</div>` : ''}
        </div>

        <div class="card card-page">
          <div class="flex items-center justify-between mb-sm"><div class="fs-13 fw-600 text-secondary">Structured quotes (${structuredQuotes.length})</div><button class="btn btn-primary btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['quotes', { action: 'add', customerId }])}'><span class="material-symbols-rounded">add</span>Quote</button></div>
          ${structuredQuotes.length ? structuredQuotes.map(q => `<button class="area-customer-row w-full text-left mb-6" data-action="App.navigate" data-args='${JSON.stringify(['quotes', { id: q.id }])}'><span class="material-symbols-rounded">request_quote</span><span class="flex-1 min-w-0"><strong>${Utils.escapeHtml(q.quoteNumber || 'Draft quote')} · v${q.version || 1}</strong><small>${Utils.formatCurrency(q.total || 0)} · ${Utils.escapeHtml(q.status || 'draft')}</small></span><span class="material-symbols-rounded">chevron_right</span></button>`).join('') : '<div class="fs-13 text-tertiary">No itemised quotes yet.</div>'}
        </div>

        ${outstandingQuotes.length ? `
          <div class="card card-page" >
            <div class="fs-13 fw-600 text-secondary mb-sm" >Outstanding quotes (${outstandingQuotes.length})</div>
            ${outstandingQuotes.map(a => {
              const daysSince = Utils.daysBetween(now, new Date(a.date));
              const tpl = (typeof TalkFeature !== 'undefined') ? TalkFeature.getTemplateForOutcome(a.outcome) : null;
              return `
                <div class="area-customer-row w-full text-left mb-6" >
                  <span class="material-symbols-rounded text-warning" >receipt_long</span>
                  <span class="flex-1 min-w-0" >
                    <strong>${Utils.escapeHtml(a.clientName || 'Customer')} · ${Utils.formatCurrency(a.value || 0)}</strong>
                    <small>${Utils.formatDate(a.date, 'short')} · ${daysSince <= 0 ? 'today' : daysSince + 'd ago'} · ${Utils.escapeHtml(this.getOutcomeName(a.outcome))}</small>
                  </span>
                  ${tpl ? `<button class="btn btn-outline btn-sm" data-action="TalkFeature.sendMessage" data-args='${Utils.escapeHtml(JSON.stringify([(a.id), (tpl.template)]))}'><span class="material-symbols-rounded fs-16" >send</span></button>` : ''}
                  <button class="btn btn-ghost btn-sm" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (a.id)}])}'><span class="material-symbols-rounded fs-18" >chevron_right</span></button>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        ${orders.length ? `
          <div class="card card-page" >
            <div class="flex items-center justify-between mb-sm" >
              <div class="fs-13 fw-600 text-secondary" >Orders (${orders.length})</div>
              <button class="btn btn-ghost btn-sm" aria-label="Open orders board" data-action="App.navigate" data-args='${JSON.stringify(["orders"])}'>
                <span class="material-symbols-rounded">view_kanban</span>
              </button>
            </div>
            ${orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(o => `
              <button class="area-customer-row w-full text-left mb-6"  data-action="OrdersFeature.openOrderSheet" data-args='${JSON.stringify([(o.id)])}'>
                <span class="material-symbols-rounded text-success" >receipt</span>
                <span class="flex-1 min-w-0" >
                  <strong>${Utils.escapeHtml(o.orderNumber || 'Order')}</strong>
                  <small>${Utils.formatCurrency(o.total || 0)} · ${Utils.escapeHtml(this.orderStageLabel(o))}${(o.balanceDue || 0) > 0 ? ` · owes ${Utils.formatCurrency(o.balanceDue)}` : ''}</small>
                </span>
                <span class="material-symbols-rounded text-tertiary" >chevron_right</span>
              </button>
            `).join('')}
          </div>
        ` : ''}

        ${jobs.length ? `<div class="card card-page"><div class="flex items-center justify-between mb-sm"><div class="fs-13 fw-600 text-secondary">Jobs (${jobs.length})</div><button class="btn btn-ghost btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['jobs', { customerId }])}' aria-label="Open all customer jobs"><span class="material-symbols-rounded">construction</span></button></div>${jobs.map(job => `<button class="area-customer-row w-full text-left mb-6" data-action="App.navigate" data-args='${JSON.stringify(['jobs', { id: job.id }])}'><span class="material-symbols-rounded">construction</span><span class="flex-1"><strong>${Utils.escapeHtml(job.jobNumber || `Job ${job.id}`)}</strong><small>${Utils.escapeHtml((job.status || 'materials_ordered').replace(/_/g, ' '))}</small></span><span class="material-symbols-rounded">chevron_right</span></button>`).join('')}</div>` : ''}

        <div class="card card-page"><div class="flex items-center justify-between"><div><div class="fs-13 fw-600 text-secondary">Aftercare</div><div class="fs-12 text-tertiary mt-2">${retention.filter(item => !['completed', 'cancelled'].includes(item.status)).length} open · reviews, referrals, warranty and repeat work</div></div><button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['retention', { customerId }])}'><span class="material-symbols-rounded">handshake</span>Open</button></div></div>

        ${(invoices.length || payments.length) ? `<div class="card card-page"><div class="flex items-center justify-between mb-sm"><div class="fs-13 fw-600 text-secondary">Invoices &amp; payments</div><button class="btn btn-ghost btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['invoices', { customerId }])}' aria-label="Open customer invoices and payments"><span class="material-symbols-rounded">receipt_long</span></button></div>${invoices.slice(0, 3).map(invoice => `<button class="area-customer-row w-full text-left mb-6" data-action="App.navigate" data-args='${JSON.stringify(['invoices', { id: invoice.id }])}'><span class="material-symbols-rounded">receipt_long</span><span class="flex-1"><strong>${Utils.escapeHtml(invoice.invoiceNumber || 'Draft invoice')}</strong><small>${Utils.formatCurrency(invoice.total || 0)} · ${Utils.escapeHtml(invoice.status || 'draft')}</small></span><span class="material-symbols-rounded">chevron_right</span></button>`).join('')}<div class="fs-12 text-tertiary">${payments.length} ledger entr${payments.length === 1 ? 'y' : 'ies'} · corrections remain in history</div></div>` : ''}

        ${measurements.length ? `
          <div class="card card-page" >
            <div class="fs-13 fw-600 text-secondary mb-sm" >Measurements (${measurements.length})</div>
            ${measurements.map(m => {
              const visit = apptById.get(m.appointmentId);
              return `
                <button class="area-customer-row w-full text-left mb-6"  data-action="App.navigate" data-args='${JSON.stringify(["measure", {appointmentId: (m.appointmentId), measurementId: (m.id)}])}'>
                  <span class="material-symbols-rounded">straighten</span>
                  <span class="flex-1 min-w-0" >
                    <strong>${Utils.escapeHtml(m.windowName || 'Window')}</strong>
                    <small>${m.widthUsed ? Utils.formatMeasurement(m.widthUsed) : '--'} × ${m.dropUsed ? Utils.formatMeasurement(m.dropUsed) : '--'} · ${m.fittingType === 'exact' ? 'Exact' : 'Recess'}${visit ? ` · ${Utils.formatDate(visit.date, 'short')}` : ''}</small>
                  </span>
                  <span class="material-symbols-rounded text-tertiary" >chevron_right</span>
                </button>
              `;
            }).join('')}
          </div>
        ` : ''}

        ${interests.length ? `
          <div class="card card-page" >
            <div class="fs-13 fw-600 text-secondary mb-sm" >Buying Interest</div>
            <div class="flex wrap gap-6" >
              ${interests.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(label)} · ${count}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="card card-page" id="customer-history-anchor" >
          <div class="fs-13 fw-600 text-secondary mb-sm" >History</div>
          ${timeline.length === 0 ? `
            <div class="fs-13 text-tertiary text-center py-16" >No visits, orders, or messages recorded yet</div>
          ` : timeline.map(item => `
            <div class="hsc-appt-row cursor-pointer cursor-default" ${item.onclick ? App.actionAttrs(item.onclick) + ' ' : ''}>
              <span class="material-symbols-rounded text-tertiary" >${item.icon}</span>
              <span class="hsc-appt-details">
                <span class="hsc-appt-name">${item.title}</span>
                <span class="hsc-appt-address">${Utils.formatDate(item.date, 'short')} · ${item.subtitle}</span>
              </span>
              ${item.onclick ? '<span class="material-symbols-rounded hsc-appt-chevron">chevron_right</span>' : ''}
            </div>
          `).join('')}
        </div>

        <div class="card card-page" >
          <div class="flex items-center justify-between mb-sm" >
            <div class="fs-13 fw-600 text-secondary" >Photos ${photos.length ? `(${photos.length})` : ''}</div>
            <button class="btn btn-outline btn-sm" style="gap:6px;" aria-label="Add photo" data-file="customer-photo-input">
              <span class="material-symbols-rounded fs-16" >photo_camera</span>Add Photo
            </button>
          </div>
          ${photos.length === 0 ? `
            <div class="fs-13 text-tertiary text-center pt-12 pb-4" >No photos yet — windows, fronts, damage notes, anything useful to remember.</div>
          ` : `
            <div class="grid-3 gap-6" >
              ${photos.map(p => this.renderPhotoThumb(p)).join('')}
            </div>
          `}
          <input type="file" id="customer-photo-input" accept="image/*,.heic,.heif" style="display:none;" data-action="AppointmentsFeature.captureCustomerPhoto" data-args='${JSON.stringify(["__event__", (customerId)])}'>
        </div>

        <div class="card-page" >
          <button class="btn btn-danger btn-block btn-sm" data-action="AppointmentsFeature.confirmDeleteCustomer" data-args='${JSON.stringify([(customer.id)])}'>
            <span class="material-symbols-rounded">delete</span>
            Delete Customer
          </button>
        </div>
      </div>
    `;
  },

  scrollToHistory() {
    document.getElementById('customer-history-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  orderStageLabel(order) {
    if ((order.balanceDue || 0) <= 0) return 'Paid';
    return (order.stage || 'ordered').replace(/_/g, ' ');
  },

  getOutcomeName(outcomeId) {
    if (typeof AppointmentsFeature.getOutcomeName === 'function') {
      return AppointmentsFeature.getOutcomeName(outcomeId, 'consultation');
    }
    return String(outcomeId || '').replace(/_/g, ' ');
  },

  renderPhotoThumb(p) {
    return `<div class="photo-tile"  role="button" tabindex="0" aria-label="View photo" data-action="AppointmentsFeature.openPhotoViewer" data-args='${JSON.stringify([(p.id), (p.customerId)])}' data-key="Enter, space">
      <img class="img-cover" src="${Utils.photoDataUrl(p)}" alt="" >
    </div>`;
  }
};

App.registerFeature(CustomerFeature);
