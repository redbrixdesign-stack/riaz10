/* ============================================
   BEELO — STRUCTURED QUOTES
   Versioned, itemised quote workflow. Legacy
   visit outcomes remain independent and visible.
   ============================================ */

const QuotesFeature = {
  id: 'quotes',
  name: 'Quotes',
  icon: 'request_quote',
  route: false,

  render(params = {}) {
    if (params.action === 'add') return this.renderEditor(params);
    if (params.id) return this.renderQuote(Number(params.id));
    return this.renderList();
  },

  async renderList() {
    let quotes = [];
    try { quotes = await DB.getQuotes({}); } catch (error) { console.error('Quotes load failed:', error); }
    const live = quotes.filter(quote => !['superseded', 'rejected', 'expired'].includes(quote.status));
    const closed = quotes.filter(quote => ['superseded', 'rejected', 'expired'].includes(quote.status));
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: 'Quotes', showBack: true, backHref: 'orders' })}
      <div class="px-md pb-lg">
        ${live.length ? `<div class="section-label">Live (${live.length})</div>${live.map(quote => this.renderListCard(quote)).join('')}` : `<div class="empty-state empty-state-lg"><span class="material-symbols-rounded">request_quote</span><div class="fw-600">No structured quotes yet</div><div class="fs-13">Create one from a visit or Customer 360.</div></div>`}
        ${closed.length ? `<details class="mt-md"><summary class="section-label">Closed (${closed.length})</summary>${closed.map(quote => this.renderListCard(quote)).join('')}</details>` : ''}
      </div>
    </div>`;
  },

  renderListCard(quote) {
    return `<button class="card mb-sm w-full text-left" data-action="App.navigate" data-args='${JSON.stringify(['quotes', { id: quote.id }])}'>
      <div class="flex justify-between gap-sm"><strong>${Utils.escapeHtml(quote.quoteNumber || 'Draft quote')} <span class="text-tertiary">v${quote.version || 1}</span></strong><strong>${Utils.formatCurrency(quote.total || 0)}</strong></div>
      <div class="fs-12 text-tertiary mt-4">${Utils.escapeHtml(quote.status || 'draft')}${quote.expiryDate ? ` · expires ${Utils.formatDate(quote.expiryDate, 'short')}` : ''}</div>
    </button>`;
  },

  async resolveContext(params) {
    let customerId = Number(params.customerId) || null;
    let appointmentId = Number(params.appointmentId) || null;
    let customer = null;
    let appointment = null;
    if (appointmentId) {
      appointment = await DB.getAppointment(appointmentId);
      customerId = customerId || appointment?.customerId || null;
    }
    if (customerId) customer = await DB.getCustomer(customerId);
    return { customerId, appointmentId, customer, appointment };
  },

  async renderEditor(params = {}) {
    const quoteId = Number(params.id) || null;
    let existing = null;
    let items = [];
    let context = await this.resolveContext(params);
    if (quoteId) {
      existing = await DB.getQuote(quoteId);
      if (!existing) throw new Error('Quote not found');
      items = existing.items || [];
      context = await this.resolveContext({ customerId: existing.quote.customerId, appointmentId: existing.quote.appointmentId });
    }
    if (!context.customerId) return `<div class="fade-in">${App.renderTopHeader({ title: 'New quote', showBack: true, backHref: 'orders' })}<div class="empty-state"><span class="material-symbols-rounded">person_search</span><div>Create a quote from a visit or Customer 360 so it stays linked to the right customer.</div></div></div>`;
    const quote = existing?.quote || {};
    const customerName = context.customer?.fullName || [context.customer?.firstName, context.customer?.lastName].filter(Boolean).join(' ') || context.appointment?.clientName || 'Customer';
    const rows = items.length ? items : [{ description: '', quantity: 1, unit: 'each', unitPrice: 0 }];
    setTimeout(() => this.recalculate(), 0);
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: quoteId ? 'Edit quote' : 'New quote', showBack: true, backHref: quoteId ? `quotes?id=${quoteId}` : (context.appointmentId ? `appointments?id=${context.appointmentId}` : `customer?id=${context.customerId}`) })}
      <div class="p-md">
        <input type="hidden" id="quote-id" value="${quoteId || ''}"><input type="hidden" id="quote-customer-id" value="${context.customerId}"><input type="hidden" id="quote-appointment-id" value="${context.appointmentId || ''}">
        <div class="card inset-dark mb-md"><strong>${Utils.escapeHtml(customerName)}</strong><div class="fs-12 text-tertiary">${context.appointmentId ? 'Linked to visit' : 'Customer quote'}</div></div>
        <div class="flex items-center justify-between mb-sm"><div class="section-label mb-0">Line items</div><button class="btn btn-outline btn-sm" data-action="QuotesFeature.addItem"><span class="material-symbols-rounded">add</span>Item</button></div>
        <div id="quote-items">${rows.map((item, index) => this.renderItem(item, index)).join('')}</div>
        <div class="form-row">
          <div class="form-group"><label for="quote-discount-percent">Discount %</label><input class="input" id="quote-discount-percent" type="number" inputmode="decimal" min="0" max="100" step="0.01" value="${quote.discountPercent || ''}" data-action="QuotesFeature.recalculate"></div>
          <div class="form-group"><label for="quote-tax-rate">Tax %</label><input class="input" id="quote-tax-rate" type="number" inputmode="decimal" min="0" step="0.01" value="${quote.taxRate || 0}" data-action="QuotesFeature.recalculate"></div>
        </div>
        <div class="card inset-dark mb-md" id="quote-totals" aria-live="polite"></div>
        <div class="form-group"><label for="quote-expiry">Expiry date</label><input class="input" id="quote-expiry" type="date" value="${quote.expiryDate ? String(quote.expiryDate).slice(0, 10) : ''}"></div>
        <div class="form-group"><label for="quote-notes">Notes</label><textarea class="textarea" id="quote-notes">${Utils.escapeHtml(quote.notes || '')}</textarea></div>
        <div class="form-group"><label for="quote-terms">Terms</label><textarea class="textarea" id="quote-terms">${Utils.escapeHtml(quote.termsSnapshot || '')}</textarea></div>
        <button class="btn btn-primary btn-block" id="quote-save" data-action="QuotesFeature.saveDraft">Save draft</button>
      </div>
    </div>`;
  },

  renderItem(item, index) {
    return `<div class="card mb-sm quote-item" data-index="${index}">
      <div class="form-group"><label for="quote-description-${index}">Description</label><input class="input quote-description" id="quote-description-${index}" value="${Utils.escapeHtml(item.description || '')}" placeholder="Product or service"></div>
      <div class="form-row"><div class="form-group"><label for="quote-quantity-${index}">Quantity</label><input class="input quote-quantity" id="quote-quantity-${index}" type="number" inputmode="decimal" min="0.01" step="0.01" value="${item.quantity || 1}" data-action="QuotesFeature.recalculate"></div><div class="form-group"><label for="quote-unit-${index}">Unit</label><input class="input quote-unit" id="quote-unit-${index}" value="${Utils.escapeHtml(item.unit || 'each')}"></div></div>
      <div class="form-group"><label for="quote-unit-price-${index}">Unit price</label><input class="input quote-unit-price" id="quote-unit-price-${index}" type="number" inputmode="decimal" min="0" step="0.01" value="${Number(item.unitPrice || 0).toFixed(2)}" data-action="QuotesFeature.recalculate"></div>
      <div class="flex justify-between items-center"><span class="quote-line-total fw-600">${Utils.formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}</span><button class="btn btn-ghost btn-sm text-danger" aria-label="Remove item" data-action="QuotesFeature.removeItem" data-args='${JSON.stringify([index])}'><span class="material-symbols-rounded">delete</span></button></div>
    </div>`;
  },

  addItem() {
    const container = document.getElementById('quote-items');
    if (!container) return;
    const index = container.querySelectorAll('.quote-item').length;
    container.insertAdjacentHTML('beforeend', this.renderItem({ quantity: 1, unit: 'each', unitPrice: 0 }, index));
    this.reindexItems();
    this.recalculate();
  },

  removeItem(index) {
    const rows = document.querySelectorAll('.quote-item');
    if (rows.length <= 1) return Toast.show('A quote needs at least one item', 'warning');
    [...rows].find(row => Number(row.dataset.index) === Number(index))?.remove();
    this.reindexItems();
    this.recalculate();
  },

  reindexItems() {
    document.querySelectorAll('.quote-item').forEach((row, index) => {
      row.dataset.index = index;
      for (const [className, prefix] of [['quote-description', 'quote-description'], ['quote-quantity', 'quote-quantity'], ['quote-unit', 'quote-unit'], ['quote-unit-price', 'quote-unit-price']]) {
        const input = row.querySelector(`.${className}`);
        if (input) input.id = `${prefix}-${index}`;
        const label = input ? row.querySelector(`label[for^="${prefix}-"]`) : null;
        if (label) label.htmlFor = `${prefix}-${index}`;
      }
      const button = row.querySelector('[data-action="QuotesFeature.removeItem"]');
      if (button) button.dataset.args = JSON.stringify([index]);
    });
  },

  readItems() {
    return [...document.querySelectorAll('.quote-item')].map((row, displayOrder) => ({
      description: row.querySelector('.quote-description')?.value.trim() || '',
      quantity: Number(row.querySelector('.quote-quantity')?.value || 0),
      unit: row.querySelector('.quote-unit')?.value.trim() || 'each',
      unitPrice: Number(row.querySelector('.quote-unit-price')?.value || 0),
      displayOrder
    }));
  },

  calculatePreview(items, discountPercent = 0, taxRate = 0) {
    const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const subtotal = money(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const discountAmount = money(subtotal * Math.min(100, Math.max(0, discountPercent)) / 100);
    const net = money(subtotal - discountAmount);
    const taxAmount = money(net * Math.max(0, taxRate) / 100);
    return { subtotal, discountAmount, taxAmount, total: money(net + taxAmount) };
  },

  recalculate() {
    const items = this.readItems();
    const totals = this.calculatePreview(items, Number(document.getElementById('quote-discount-percent')?.value || 0), Number(document.getElementById('quote-tax-rate')?.value || 0));
    document.querySelectorAll('.quote-item').forEach((row, index) => { const item = items[index]; const output = row.querySelector('.quote-line-total'); if (output) output.textContent = Utils.formatCurrency(item.quantity * item.unitPrice); });
    const box = document.getElementById('quote-totals');
    if (box) box.innerHTML = `<div class="flex justify-between"><span>Subtotal</span><strong>${Utils.formatCurrency(totals.subtotal)}</strong></div>${totals.discountAmount ? `<div class="flex justify-between"><span>Discount</span><strong>−${Utils.formatCurrency(totals.discountAmount)}</strong></div>` : ''}${totals.taxAmount ? `<div class="flex justify-between"><span>Tax</span><strong>${Utils.formatCurrency(totals.taxAmount)}</strong></div>` : ''}<div class="divider"></div><div class="flex justify-between fs-18"><strong>Total</strong><strong>${Utils.formatCurrency(totals.total)}</strong></div>`;
    return totals;
  },

  readDraft() {
    const items = this.readItems();
    if (!items.length || items.some(item => !item.description || item.quantity <= 0 || item.unitPrice < 0)) throw new Error('Complete every line item');
    return {
      customerId: Number(document.getElementById('quote-customer-id')?.value),
      appointmentId: Number(document.getElementById('quote-appointment-id')?.value) || null,
      items,
      discountPercent: Number(document.getElementById('quote-discount-percent')?.value || 0),
      taxTreatment: Number(document.getElementById('quote-tax-rate')?.value || 0) > 0 ? 'exclusive' : 'none',
      taxRate: Number(document.getElementById('quote-tax-rate')?.value || 0),
      expiryDate: document.getElementById('quote-expiry')?.value || null,
      notes: document.getElementById('quote-notes')?.value.trim() || '',
      termsSnapshot: document.getElementById('quote-terms')?.value.trim() || ''
    };
  },

  async saveDraft() {
    const button = document.getElementById('quote-save');
    if (button?.disabled) return;
    try {
      const data = this.readDraft();
      if (button) button.disabled = true;
      const id = Number(document.getElementById('quote-id')?.value) || null;
      const { items, ...changes } = data;
      const result = id ? await DB.updateQuote(id, changes, items) : await DB.createQuote(data);
      Toast.show('Quote draft saved', 'success');
      App.navigate('quotes', { id: result.quote.id });
    } catch (error) {
      if (button) button.disabled = false;
      Toast.show(error.message || 'Could not save quote', 'error');
    }
  },

  async renderQuote(id) {
    const result = await DB.getQuote(id);
    if (!result) return `<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Quote not found</div></div>`;
    const { quote, items } = result;
    const customer = quote.customerId ? await DB.getCustomer(quote.customerId) : null;
    const name = customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Customer';
    const mutable = quote.status === 'draft';
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: quote.quoteNumber || 'Draft quote', showBack: true, backHref: 'quotes' })}
      <div class="p-md">
        <div class="card card-page"><div class="flex justify-between"><div><strong>${Utils.escapeHtml(name)}</strong><div class="fs-12 text-tertiary">Version ${quote.version || 1} · ${Utils.escapeHtml(quote.status)}</div></div><strong class="fs-20">${Utils.formatCurrency(quote.total || 0)}</strong></div></div>
        <div class="card card-page"><div class="section-label">Items</div>${items.map(item => `<div class="flex justify-between gap-sm mb-8"><span>${Utils.escapeHtml(item.description)}<small class="block text-tertiary">${item.quantity} ${Utils.escapeHtml(item.unit || 'each')} × ${Utils.formatCurrency(item.unitPrice)}</small></span><strong>${Utils.formatCurrency(item.lineTotal ?? item.quantity * item.unitPrice)}</strong></div>`).join('')}<div class="divider"></div><div class="flex justify-between"><span>Total</span><strong>${Utils.formatCurrency(quote.total || 0)}</strong></div></div>
        ${quote.notes ? `<div class="card card-page"><div class="section-label">Notes</div><div class="prewrap">${Utils.escapeHtml(quote.notes)}</div></div>` : ''}
        <div class="flex flex-col gap-sm">
          <button class="btn btn-outline btn-block" data-action="QuotesFeature.preview" data-args='${JSON.stringify([quote.id])}'><span class="material-symbols-rounded">preview</span>Preview document</button>
          ${mutable ? `<button class="btn btn-outline btn-block" data-action="App.navigate" data-args='${JSON.stringify(['quotes', { action: 'add', id: quote.id }])}'><span class="material-symbols-rounded">edit</span>Edit draft</button><button class="btn btn-primary btn-block" data-action="QuotesFeature.issue" data-args='${JSON.stringify([quote.id])}'>Issue quote</button>` : ''}
          ${quote.status === 'issued' ? `<button class="btn btn-primary btn-block" data-action="QuotesFeature.accept" data-args='${JSON.stringify([quote.id])}'>Accept</button><button class="btn btn-outline btn-block" data-action="QuotesFeature.createVersion" data-args='${JSON.stringify([quote.id])}'>Create new version</button><button class="btn btn-ghost btn-block" data-action="QuotesFeature.expire" data-args='${JSON.stringify([quote.id])}'>Mark expired</button><button class="btn btn-ghost btn-block text-danger" data-action="QuotesFeature.openReject" data-args='${JSON.stringify([quote.id])}'>Reject</button>` : ''}
          ${quote.status === 'accepted' ? `<button class="btn btn-primary btn-block" data-action="QuotesFeature.convertToOrder" data-args='${JSON.stringify([quote.id])}'><span class="material-symbols-rounded">shopping_cart</span>Create order</button>` : ''}
          ${quote.customerId ? `<button class="btn btn-outline btn-block" data-action="App.navigate" data-args='${JSON.stringify(['customer', { id: quote.customerId }])}'>Customer 360</button>` : ''}
          ${quote.appointmentId ? `<button class="btn btn-outline btn-block" data-action="App.navigate" data-args='${JSON.stringify(['appointments', { id: quote.appointmentId }])}'>Source visit</button>` : ''}
        </div>
      </div>
    </div>`;
  },

  async issue(id) { await DB.issueQuote(id); Toast.show('Quote issued', 'success'); App.navigate('quotes', { id }); },
  async accept(id) { await DB.acceptQuote(id, { acceptedAt: new Date().toISOString() }); Toast.show('Quote accepted', 'success'); App.navigate('quotes', { id }); },
  async createVersion(id) { const result = await DB.createQuoteVersion(id); Toast.show('New draft version created', 'success'); App.navigate('quotes', { action: 'add', id: result.quote.id }); },
  openReject(id) { App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Reject quote</h3></div><div class="sheet-body"><div class="form-group"><label for="quote-reject-reason">Reason</label><textarea class="textarea" id="quote-reject-reason"></textarea></div><button class="btn btn-danger btn-block" data-action="QuotesFeature.reject" data-args='${JSON.stringify([id])}'>Reject quote</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`); },
  async reject(id) { const reason = document.getElementById('quote-reject-reason')?.value.trim() || ''; if (!reason) return Toast.show('Add a reason', 'warning'); await DB.rejectQuote(id, reason); App.closeModal(); Toast.show('Quote rejected', 'success'); App.navigate('quotes', { id }); },
  async expire(id) { await DB.expireQuote(id); Toast.show('Quote marked expired', 'success'); App.navigate('quotes', { id }); },
  async convertToOrder(id) { const result = await DB.convertAcceptedQuoteToOrder(id); Toast.show(result.created ? 'Order created' : 'Order already exists', 'success'); if (typeof OrdersFeature !== 'undefined' && OrdersFeature.openOrderSheet) { App.navigate('orders'); setTimeout(() => OrdersFeature.openOrderSheet(result.order.id), 100); } else App.navigate('orders'); },
  preview(id) {
    if (typeof QuoteDocumentService === 'undefined') return Toast.show('Quote preview is unavailable', 'error');
    return QuoteDocumentService.openPreview(id);
  },
  openDocument(id) { return this.preview(id); },
  printDocument() { return QuoteDocumentService.printPending(); },
  reviewQuoteMessage() { return QuoteDocumentService.reviewWhatsApp(); },
  openQuoteWhatsApp() { return QuoteDocumentService.openWhatsApp(); }
};

App.registerFeature(QuotesFeature);
