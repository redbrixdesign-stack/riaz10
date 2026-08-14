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
      customer = await DB.db.customers.get(customerId);
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
    try { appts = await DB.db.appointments.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { orders = await DB.db.orders.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { comms = await DB.db.communications.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { photos = await DB.getPhotosForCustomer(customerId); } catch (e) {}

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
        <div class="top-header">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('appointments')">
            <span class="material-symbols-rounded">arrow_back</span>
          </button>
          <h1 class="page-heading" >Customer 360</h1>
          <div class="w-40" ></div>
        </div>

        <div class="card card-page-gap" >
          <div class="flex items-center gap-md" >
            <div class="avatar-56" >
              ${Utils.escapeHtml(name.charAt(0).toUpperCase())}
            </div>
            <div class="flex-1" >
              <div class="fs-20 fw-600" >${Utils.escapeHtml(name)}</div>
              <div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(customer.customerNumber || '')}</div>
            </div>
            <button class="btn btn-ghost btn-sm" aria-label="Edit customer details" onclick="AppointmentsFeature.openEditCustomerModal(${customer.id})">
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
              <button class="btn btn-outline btn-sm flex-1 gap-6"  onclick="ContactFeature.open({name: '${Utils.escapeJsString(name)}', phone: '${Utils.escapeJsString(phone)}'})">
                <span class="material-symbols-rounded fs-18" >chat</span>
                Message
              </button>
            ` : ''}
            ${address ? `
              <button class="btn btn-outline btn-sm flex-1 gap-6"  onclick="window.open('${Utils.escapeJsString(Geo.buildNavigationUrl(address))}', '_blank')">
                <span class="material-symbols-rounded fs-18" >navigation</span>
                Navigate
              </button>
            ` : ''}
            <button class="btn btn-outline btn-sm flex-1 gap-6"  onclick="App.navigate('appointments', {action: 'add', name: '${Utils.escapeJsString(name)}', phone: '${Utils.escapeJsString(phone)}', address: '${Utils.escapeJsString(address)}'})">
              <span class="material-symbols-rounded fs-18" >add</span>
              Visit
            </button>
          </div>
        </div>

        <div class="card card-page" >
          <div class="hsc-stat-row">
            <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View visit history" onclick="CustomerFeature.scrollToHistory()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();CustomerFeature.scrollToHistory();}">
              <div class="hsc-stat-value">${appts.length}</div>
              <div class="hsc-stat-label">Visits</div>
            </div>
            <div class="hsc-stat">
              <div class="hsc-stat-value">${Utils.formatCurrency(totalValue)}</div>
              <div class="hsc-stat-label">Total Ordered</div>
            </div>
            <div class="hsc-stat">
              <div class="hsc-stat-value">${outstandingQuotes.length}</div>
              <div class="hsc-stat-label">Open Quotes</div>
            </div>
            <div class="hsc-stat">
              <div class="hsc-stat-value">${Utils.formatCurrency(orders.reduce((s, o) => s + ((o.balanceDue || 0) > 0 ? (o.balanceDue || 0) : 0), 0))}</div>
              <div class="hsc-stat-label">Owed</div>
            </div>
          </div>
          ${firstVisit ? `<div class="fs-12 text-tertiary mt-10 text-center" >Customer since ${Utils.formatDate(firstVisit.date, 'long')}${lastVisit ? ` · Last visit ${Utils.formatDate(lastVisit.date, 'short')}` : ''}</div>` : ''}
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
                  ${tpl ? `<button class="btn btn-outline btn-sm" onclick="TalkFeature.sendMessage(${a.id}, '${Utils.escapeJsString(tpl.template)}')"><span class="material-symbols-rounded fs-16" >send</span></button>` : ''}
                  <button class="btn btn-ghost btn-sm" onclick="App.navigate('appointments', {id: ${a.id}})"><span class="material-symbols-rounded fs-18" >chevron_right</span></button>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        ${orders.length ? `
          <div class="card card-page" >
            <div class="flex items-center justify-between mb-sm" >
              <div class="fs-13 fw-600 text-secondary" >Orders (${orders.length})</div>
              <button class="btn btn-ghost btn-sm" aria-label="Open orders board" onclick="App.navigate('orders')">
                <span class="material-symbols-rounded">view_kanban</span>
              </button>
            </div>
            ${orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(o => `
              <button class="area-customer-row w-full text-left mb-6"  onclick="OrdersFeature.openOrderSheet(${o.id})">
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

        ${measurements.length ? `
          <div class="card card-page" >
            <div class="fs-13 fw-600 text-secondary mb-sm" >Measurements (${measurements.length})</div>
            ${measurements.map(m => {
              const visit = apptById.get(m.appointmentId);
              return `
                <button class="area-customer-row w-full text-left mb-6"  onclick="App.navigate('measure', {appointmentId: ${m.appointmentId}, measurementId: ${m.id}})">
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
            <div class="hsc-appt-row cursor-pointer cursor-default" ${item.onclick ? `onclick="${item.onclick}" ` : ''}>
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
            <button class="btn btn-outline btn-sm" style="gap:6px;" aria-label="Add photo" onclick="document.getElementById('customer-photo-input').click()">
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
          <input type="file" id="customer-photo-input" accept="image/*" style="display:none;" onchange="AppointmentsFeature.captureCustomerPhoto(event, ${customerId})">
        </div>

        <div class="card-page" >
          <button class="btn btn-danger btn-block btn-sm" onclick="AppointmentsFeature.confirmDeleteCustomer(${customer.id})">
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
    return `<div class="photo-tile"  role="button" tabindex="0" aria-label="View photo" onclick="AppointmentsFeature.openPhotoViewer(${p.id}, ${p.customerId})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AppointmentsFeature.openPhotoViewer(${p.id}, ${p.customerId});}">
      <img class="img-cover" src="data:${p.mimeType || 'image/jpeg'};base64,${p.data}" alt="" >
    </div>`;
  }
};

App.registerFeature(CustomerFeature);
