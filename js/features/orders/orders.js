/* ============================================
   ADVISOROS v5.0 — ORDERS / PIPELINE
   A kanban sales board: Quoted → Ordered → Delivered
   → Fitted → Paid. "Quoted" is driven by visit outcomes
   (a quote given, no order yet); every later column is
   an order record moved along by the advisor (or
   automatically when the balance is fully paid).
   ============================================ */

const OrdersFeature = {
  id: 'orders',
  name: 'Orders',
  icon: 'view_kanban',

  STAGES: [
    { id: 'ordered', name: 'Ordered', icon: 'shopping_cart' },
    { id: 'delivered', name: 'Delivered', icon: 'local_shipping' },
    { id: 'fitted', name: 'Fitted', icon: 'handyman' },
    { id: 'paid', name: 'Paid', icon: 'payments' }
  ],

  QUOTE_OUTCOMES: ['quoted', 'thinking', 'partner', 'compare_quotes', 'expensive', 'customer_no_show', 'advisor_unavailable'],

  render(params = {}) {
    return this.renderAsync(params);
  },

  async renderAsync() {
    let pipeline = [];
    let orders = [];
    try { pipeline = await DB.getPipeline(); } catch (e) {}
    try { orders = await DB.db.orders.toArray(); } catch (e) {}

    const now = new Date();
    const orderAppointmentIds = new Set(orders.map(o => o.appointmentId).filter(Boolean));
    const quoteCards = pipeline.filter(a => this.QUOTE_OUTCOMES.includes(a.outcome) && !orderAppointmentIds.has(a.id));

    const customerIds = [...new Set(orders.map(o => o.customerId).filter(Boolean))];
    const customerMap = new Map();
    if (customerIds.length) {
      try {
        const fetched = await DB.getCustomersByIds(customerIds);
        for (const c of fetched) if (c) customerMap.set(c.id, c);
      } catch (e) {}
    }

    const orderByStage = { ordered: [], delivered: [], fitted: [], paid: [] };
    for (const o of orders) {
      const stage = (o.balanceDue || 0) <= 0 ? 'paid' : (o.stage || 'ordered');
      if (orderByStage[stage]) orderByStage[stage].push(o);
    }

    const quotedValue = quoteCards.reduce((s, a) => s + (a.value || 0), 0);
    const orderValue = stage => orderByStage[stage].reduce((s, o) => s + (o.total || 0), 0);

    const columns = [
      { id: 'quoted', name: 'Quoted', icon: 'receipt_long', count: quoteCards.length, total: quotedValue },
      { id: 'ordered', name: 'Ordered', icon: 'shopping_cart', count: orderByStage.ordered.length, total: orderValue('ordered') },
      { id: 'delivered', name: 'Delivered', icon: 'local_shipping', count: orderByStage.delivered.length, total: orderValue('delivered') },
      { id: 'fitted', name: 'Fitted', icon: 'handyman', count: orderByStage.fitted.length, total: orderValue('fitted') },
      { id: 'paid', name: 'Paid', icon: 'payments', count: orderByStage.paid.length, total: orderValue('paid') }
    ];

    const totalLive = columns.slice(0, 4).reduce((s, c) => s + c.count, 0);
    const totalLiveValue = columns.slice(0, 4).reduce((s, c) => s + c.total, 0);

    return `
      <div class="fade-in">
        ${App.renderTopHeader({ title: 'Orders' })}

        <div class="kanban-summary">
          <div class="kanban-summary-item">
            <div class="kanban-summary-value">${totalLive}</div>
            <div class="kanban-summary-label">Live</div>
          </div>
          <div class="kanban-summary-item">
            <div class="kanban-summary-value">${Utils.formatCurrency(totalLiveValue)}</div>
            <div class="kanban-summary-label">In play</div>
          </div>
          <div class="kanban-summary-item">
            <div class="kanban-summary-value">${Utils.formatCurrency(orders.reduce((s, o) => s + (o.depositPaid || 0), 0))}</div>
            <div class="kanban-summary-label">Deposits in</div>
          </div>
          <div class="kanban-summary-item">
            <div class="kanban-summary-value">${Utils.formatCurrency(orders.reduce((s, o) => s + ((o.balanceDue || 0) > 0 ? (o.balanceDue || 0) : 0), 0))}</div>
            <div class="kanban-summary-label">Owed</div>
          </div>
        </div>

        ${quoteCards.length === 0 && orders.length === 0 ? `
          <div class="empty-state empty-state-lg" >
            <span class="material-symbols-rounded">view_kanban</span>
            <div class="fw-600 mb-xs" >No orders yet.</div>
            <div class="fs-13" >Log an "Ordered" outcome on a visit and the sale appears here.</div>
          </div>
        ` : `
          <div class="kanban-scroll">
            ${columns.map(col => `
              <div class="kanban-col kanban-col--${col.id}">
                <div class="kanban-col-header">
                  <span class="material-symbols-rounded">${col.icon}</span>
                  <span class="kanban-col-name">${col.name}</span>
                  <span class="kanban-col-count">${col.count}</span>
                  ${col.total > 0 ? `<span class="kanban-col-total">${Utils.formatCurrency(col.total)}</span>` : ''}
                </div>
                <div class="kanban-col-body">
                  ${col.id === 'quoted'
                    ? (quoteCards.length ? quoteCards.sort((a, b) => new Date(a.date) - new Date(b.date)).map(a => this.renderQuoteCard(a, customerMap, now)).join('') : `<div class="kanban-empty">Nothing quoted</div>`)
                    : (orderByStage[col.id].length ? orderByStage[col.id].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(o => this.renderOrderCard(o, customerMap)).join('') : `<div class="kanban-empty">Nothing here</div>`)}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  renderQuoteCard(appt, customerMap, now) {
    const name = Utils.escapeHtml(appt.clientName || (appt.customerId && customerMap.get(appt.customerId))?.fullName || 'Unknown');
    const daysSince = Utils.daysBetween(now, new Date(appt.date));
    const tpl = (typeof TalkFeature !== 'undefined') ? TalkFeature.getTemplateForOutcome(appt.outcome) : null;
    return `
      <button class="kanban-card" type="button" onclick="App.navigate('appointments', {id: ${appt.id}})">
        <div class="kanban-card-top">
          <span class="kanban-card-name">${name}</span>
          <span class="kanban-card-value">${Utils.formatCurrency(appt.value || 0)}</span>
        </div>
        <div class="kanban-card-sub">${Utils.escapeHtml(this.outcomeLabel(appt.outcome))} · ${daysSince <= 0 ? 'today' : daysSince + 'd ago'}</div>
        <div class="kanban-card-actions">
          ${tpl ? `<span class="kanban-card-action" role="button" tabindex="0" aria-label="Send follow-up" onclick="event.stopPropagation();TalkFeature.sendMessage(${appt.id}, '${Utils.escapeJsString(tpl.template)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();TalkFeature.sendMessage(${appt.id}, '${Utils.escapeJsString(tpl.template)}');}"><span class="material-symbols-rounded">send</span>Follow up</span>` : ''}
          <span class="kanban-card-action" role="button" tabindex="0" aria-label="Open visit" onclick="event.stopPropagation();App.navigate('appointments', {id: ${appt.id}})"><span class="material-symbols-rounded">open_in_new</span>Visit</span>
        </div>
      </button>
    `;
  },

  renderOrderCard(order, customerMap) {
    const customer = order.customerId ? customerMap.get(order.customerId) : null;
    const name = Utils.escapeHtml(customer?.fullName || (customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : '') || 'Unknown');
    const isPaid = (order.balanceDue || 0) <= 0;
    return `
      <button class="kanban-card" type="button" onclick="OrdersFeature.openOrderSheet(${order.id})">
        <div class="kanban-card-top">
          <span class="kanban-card-name">${name}</span>
          <span class="kanban-card-value">${Utils.formatCurrency(order.total || 0)}</span>
        </div>
        <div class="kanban-card-sub">${Utils.escapeHtml(order.orderNumber || 'Order')}${order.supplierOrderNumber ? ` · ${Utils.escapeHtml(order.supplierOrderNumber)}` : ''}</div>
        <div class="kanban-card-actions">
          ${isPaid
            ? `<span class="kanban-card-action"><span class="material-symbols-rounded">check_circle</span>Paid</span>`
            : `<span class="kanban-card-action"><span class="material-symbols-rounded">payments</span>Owes ${Utils.formatCurrency(order.balanceDue || 0)}</span>`}
          <span class="kanban-card-action"><span class="material-symbols-rounded">chevron_right</span></span>
        </div>
      </button>
    `;
  },

  outcomeLabel(outcome) {
    return String(outcome || '').replace(/_/g, ' ');
  },

  /* ---------- Order detail sheet ---------- */

  async openOrderSheet(orderId) {
    let order = null;
    try { order = await DB.db.orders.get(orderId); } catch (e) {}
    if (!order) { Toast.show('Order not found', 'error'); return; }

    let customer = null;
    try { customer = order.customerId ? await DB.getCustomer(order.customerId) : null; } catch (e) {}
    const name = customer?.fullName || (customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : '') || 'Unknown';
    const phone = customer?.phone || '';
    const isPaid = (order.balanceDue || 0) <= 0;
    const stage = isPaid ? 'paid' : (order.stage || 'ordered');
    const stageIndex = this.STAGES.findIndex(s => s.id === stage);
    const commission = typeof order.commission === 'number' && order.commission > 0
      ? order.commission
      : (typeof TaxCalculator !== 'undefined' ? TaxCalculator.estimateCommission(order.total || 0) : 0);

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Order ${Utils.escapeHtml(order.orderNumber || '')}</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="sheet-body kanban-sheet-body">
        <div class="kanban-sheet-customer" role="button" tabindex="0" onclick="App.navigate('customer', {id: ${order.customerId}})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('customer', {id: ${order.customerId}});}">
          <div class="kanban-avatar">${Utils.escapeHtml(name.charAt(0).toUpperCase())}</div>
          <div class="kanban-sheet-customer-body">
            <div class="kanban-sheet-customer-name">${Utils.escapeHtml(name)}</div>
            <div class="kanban-sheet-customer-meta">${customer ? Utils.escapeHtml(customer.customerNumber || '') : ''} ${customer ? '· tap for full profile' : ''}</div>
          </div>
          ${phone ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();OrdersFeature.paymentMessage(${order.id})"><span class="material-symbols-rounded">chat</span>Message</button>` : ''}
        </div>

        <div class="kanban-stage-tracker">
          ${this.STAGES.map((s, i) => `
            <div class="kanban-stage-step ${i <= stageIndex ? 'done' : ''}">
              <span class="material-symbols-rounded">${i < stageIndex ? 'check' : s.icon}</span>
            </div>
            ${i < this.STAGES.length - 1 ? '<div class="kanban-stage-line"></div>' : ''}
          `).join('')}
        </div>

        <div class="kanban-sheet-grid">
          <div class="kanban-sheet-cell"><div class="kanban-sheet-label">Total</div><div class="kanban-sheet-value">${Utils.formatCurrency(order.total || 0)}</div></div>
          <div class="kanban-sheet-cell"><div class="kanban-sheet-label">Deposit</div><div class="kanban-sheet-value">${Utils.formatCurrency(order.depositRequired || 0)}</div></div>
          <div class="kanban-sheet-cell"><div class="kanban-sheet-label">Deposit paid</div><div class="kanban-sheet-value">${Utils.formatCurrency(order.depositPaid || 0)}</div></div>
          <div class="kanban-sheet-cell"><div class="kanban-sheet-label">Balance due</div><div class="kanban-sheet-value" style="color:${isPaid ? 'var(--secondary)' : 'var(--warning)'};">${Utils.formatCurrency(order.balanceDue || 0)}</div></div>
          <div class="kanban-sheet-cell"><div class="kanban-sheet-label">Commission</div><div class="kanban-sheet-value">${Utils.formatCurrency(commission)}</div></div>
          <div class="kanban-sheet-cell"><div class="kanban-sheet-label">Stage</div><div class="kanban-sheet-value">${Utils.escapeHtml(this.STAGES.find(s => s.id === stage)?.name || stage)}</div></div>
        </div>

        <div class="form-group">
          <label>Supplier order no.</label>
          <input type="text" class="input" id="order-supplier-number" value="${Utils.escapeHtml(order.supplierOrderNumber || '')}" placeholder="e.g. SUP-2026-0042">
          <button class="btn btn-outline btn-sm btn-block mt-6"  onclick="OrdersFeature.saveSupplierNumber(${order.id})"><span class="material-symbols-rounded fs-16" >save</span>Save</button>
        </div>

        <div class="divider-text">Move along</div>
        <div class="kanban-btn-grid">
          ${this.STAGES.filter(s => s.id !== 'paid').map(s => `
            <button class="btn ${stage === s.id ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="OrdersFeature.setStage(${order.id}, '${s.id}')">${Utils.escapeHtml(s.name)}</button>
          `).join('')}
        </div>

        ${!isPaid ? `
          <div class="divider-text">Record payment</div>
          <div class="form-row mb-12" >
            <div class="form-group mb-0" >
              <input type="number" class="input" inputmode="decimal" id="order-payment-amount" step="0.01" min="0" placeholder="${Utils.escapeHtml(String((order.balanceDue || 0).toFixed(2)))}">
            </div>
            <div class="form-group mb-0" >
              <button class="btn btn-primary btn-block" onclick="OrdersFeature.recordPayment(${order.id})"><span class="material-symbols-rounded fs-18" >payments</span>Pay ${Utils.formatCurrency(Math.min(order.depositPaid === 0 ? (order.depositRequired || 0) : (order.balanceDue || 0), order.balanceDue || 0))}</button>
            </div>
          </div>
          <button class="btn btn-outline btn-sm btn-block mb-12"  onclick="OrdersFeature.recordFullPayment(${order.id})"><span class="material-symbols-rounded">task_alt</span>Mark fully paid (${Utils.formatCurrency(order.balanceDue || 0)})</button>
        ` : `
          <div class="card kanban-paid-card">
            <strong><span class="material-symbols-rounded">check_circle</span> Fully paid</strong>
            <div class="kanban-paid-card-note">No balance remaining on this order.</div>
          </div>
        `}

        <div class="divider-text">Links</div>
        <div class="kanban-btn-grid">
          ${order.appointmentId ? `<button class="btn btn-outline btn-sm" onclick="App.closeModal();App.navigate('appointments', {id: ${order.appointmentId}})"><span class="material-symbols-rounded">event</span>Linked visit</button>` : ''}
          ${order.customerId ? `<button class="btn btn-outline btn-sm" onclick="App.closeModal();App.navigate('customer', {id: ${order.customerId}})"><span class="material-symbols-rounded">person</span>Customer 360</button>` : ''}
        </div>
      </div>
    `;
    App.openModal(content);
  },

  async setStage(orderId, stage) {
    try {
      await DB.db.orders.update(orderId, { stage });
      Toast.show('Order moved to ' + stage, 'success');
      this.refreshAfterEdit(orderId);
    } catch (e) {
      console.error('Stage update failed:', e);
      Toast.show('Failed to move order', 'error');
    }
  },

  async saveSupplierNumber(orderId) {
    const value = (document.getElementById('order-supplier-number')?.value || '').trim();
    try {
      await DB.db.orders.update(orderId, { supplierOrderNumber: value || null });
      Toast.show('Supplier number saved', 'success');
      this.refreshAfterEdit(orderId);
    } catch (e) {
      console.error('Supplier number save failed:', e);
      Toast.show('Failed to save', 'error');
    }
  },

  async recordPayment(orderId) {
    const order = await DB.db.orders.get(orderId);
    if (!order) return;
    const amount = parseFloat(document.getElementById('order-payment-amount')?.value);
    if (!(amount > 0)) {
      Toast.show('Enter an amount first', 'warning');
      return;
    }
    const depositPaid = Math.min((order.depositPaid || 0) + amount, order.total || 0);
    const balanceDue = Math.max(0, (order.balanceDue || 0) - amount);
    try {
      await DB.db.orders.update(orderId, {
        depositPaid,
        balanceDue,
        stage: balanceDue <= 0 ? 'paid' : (order.stage || 'ordered')
      });
      Toast.show(balanceDue <= 0 ? 'Order fully paid' : `Payment recorded · ${Utils.formatCurrency(balanceDue)} to go`, 'success');
      this.refreshAfterEdit(orderId);
    } catch (e) {
      console.error('Payment record failed:', e);
      Toast.show('Failed to record payment', 'error');
    }
  },

  // Deposit/balance reminder for a live order: drafts the payment_reminder
  // template through Talk (with the order number + amount filled in) when the
  // order has a linked visit, otherwise falls back to the contact picker.
  async paymentMessage(orderId) {
    let order = null;
    try { order = await DB.db.orders.get(orderId); } catch (e) {}
    if (!order) { Toast.show('Order not found', 'error'); return; }
    if (!order.appointmentId) {
      let customer = null;
      try { customer = order.customerId ? await DB.getCustomer(order.customerId) : null; } catch (e) {}
      if (!customer?.phone) { Toast.show('No phone number available', 'error'); return; }
      const name = customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer';
      ContactFeature.open({ name, phone: customer.phone });
      return;
    }
    const depositPaid = order.depositPaid || 0;
    const vars = {
      supplierOrderNumber: order.supplierOrderNumber ? ` (${order.supplierOrderNumber})` : '',
      depositLabel: depositPaid > 0 ? 'balance' : 'deposit',
      depositAmount: Utils.formatCurrency(depositPaid > 0 ? (order.balanceDue || 0) : (order.depositRequired || 0))
    };
    TalkFeature.sendMessage(order.appointmentId, 'payment_reminder', vars);
  },

  async recordFullPayment(orderId) {
    const order = await DB.db.orders.get(orderId);
    if (!order) return;
    try {
      await DB.db.orders.update(orderId, {
        depositPaid: order.total || 0,
        balanceDue: 0,
        stage: 'paid'
      });
      Toast.show('Order marked fully paid', 'success');
      this.refreshAfterEdit(orderId);
    } catch (e) {
      console.error('Full payment failed:', e);
      Toast.show('Failed to record payment', 'error');
    }
  },

  refreshAfterEdit(orderId) {
    App.closeModal();
    if (App.currentFeature?.id === 'customer' && typeof CustomerFeature !== 'undefined' && CustomerFeature._lastId) {
      const main = document.getElementById('main');
      if (main) main.innerHTML = `<div class="fade-in progress-bar"><div class="fill"></div></div>`;
      CustomerFeature.renderProfile(CustomerFeature._lastId).then(html => {
        const main = document.getElementById('main');
        if (main && App.currentFeature?.id === 'customer') main.innerHTML = html;
      });
      return;
    }
    if (App.currentFeature?.id === 'orders') {
      this.renderAsync().then(html => {
        const main = document.getElementById('main');
        if (main && App.currentFeature?.id === 'orders') main.innerHTML = html;
      });
      return;
    }
    App.navigate('orders', { id: orderId });
  },

  activate(params = {}) {
    if (params.id) {
      const id = Number(params.id);
      if (Number.isInteger(id) && id > 0) {
        setTimeout(() => this.openOrderSheet(id), 120);
      }
    }
  }
};

App.registerFeature(OrdersFeature);
