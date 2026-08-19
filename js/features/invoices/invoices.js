/* ============================================
   BEELO — INVOICES & PAYMENT LEDGER
   Formal finance documents and append-only payment
   corrections. Existing Order payment buttons remain
   compatibility entry points into the same ledger.
   ============================================ */

const InvoicesFeature = {
  id: 'invoices',
  name: 'Invoices',
  icon: 'receipt_long',
  route: false,

  render(params = {}) {
    if (params.action === 'add') return this.renderEditor(params);
    if (params.id) return this.renderInvoice(Number(params.id));
    return this.renderList(params);
  },

  async renderList(params = {}) {
    const orderId = Number(params.orderId) || null;
    const customerId = Number(params.customerId) || null;
    let invoices = [], payments = [];
    try { invoices = await DB.getInvoices({ ...(orderId ? { orderId } : {}), ...(customerId ? { customerId } : {}) }); } catch (error) { console.error('Invoice load failed:', error); }
    try { payments = await DB.getLedgerEntries({ ...(orderId ? { orderId } : {}), ...(customerId ? { customerId } : {}) }); } catch (error) { console.error('Ledger load failed:', error); }
    let order = null;
    try { if (orderId) order = await DB.db.orders.get(orderId); } catch (error) {}
    const invoiceForPayment = invoices.find(invoice => ['issued', 'part_paid'].includes(invoice.status)) || null;
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: 'Invoices & payments', showBack: true, backHref: orderId ? `orders?id=${orderId}` : customerId ? `customer?id=${customerId}` : 'money', actions: orderId ? `<button class="btn btn-sm btn-primary" data-action="App.navigate" data-args='${JSON.stringify(['invoices', { action: 'add', orderId }])}'><span class="material-symbols-rounded">add</span>Invoice</button>` : '' })}
      <div class="px-md pb-lg">
        ${orderId ? `<button class="btn btn-primary btn-block mb-md" data-action="InvoicesFeature.openPayment" data-args='${JSON.stringify([orderId, customerId || order?.customerId || null, invoiceForPayment?.id || null])}'><span class="material-symbols-rounded">payments</span>Record payment</button>` : ''}
        <div class="section-label">Invoices (${invoices.length})</div>
        ${invoices.length ? invoices.map(invoice => this.renderInvoiceCard(invoice)).join('') : `<div class="empty-state"><span class="material-symbols-rounded">receipt_long</span><div>No invoices yet</div>${orderId ? '<div class="fs-13">Create one from this order when you are ready to bill.</div>' : ''}</div>`}
        <div class="section-label mt-lg">Payment ledger (${payments.length})</div>
        ${payments.length ? (() => { const corrected = new Set(payments.map(payment => payment.reversesPaymentId).filter(Boolean)); return payments.map(payment => this.renderPaymentCard(payment, corrected.has(payment.id))).join(''); })() : '<div class="fs-13 text-tertiary">No payment entries yet.</div>'}
      </div>
    </div>`;
  },

  renderInvoiceCard(invoice) {
    return `<button class="card mb-sm w-full text-left" data-action="App.navigate" data-args='${JSON.stringify(['invoices', { id: invoice.id }])}'>
      <div class="flex justify-between gap-sm"><strong>${Utils.escapeHtml(invoice.invoiceNumber || 'Draft invoice')}</strong><strong>${Utils.formatCurrency(invoice.total || 0)}</strong></div>
      <div class="fs-12 text-tertiary mt-4">${Utils.escapeHtml(invoice.status || 'draft')}${invoice.dueDate ? ` · due ${Utils.formatDate(invoice.dueDate, 'short')}` : ''}</div>
    </button>`;
  },

  renderPaymentCard(payment, corrected = false) {
    const kind = payment.kind || payment.type || 'payment';
    const isNegative = payment.direction === 'out' || kind === 'refund' || kind === 'reversal';
    return `<article class="card mb-sm"><div class="flex justify-between gap-sm"><div><strong>${Utils.escapeHtml(kind.replace(/_/g, ' '))}</strong>${corrected ? '<span class="badge ml-sm">Corrected</span>' : ''}<div class="fs-12 text-tertiary">${Utils.formatDate(payment.date || payment.createdAt, 'short')} · ${Utils.escapeHtml(payment.method || 'not specified')}${payment.reference ? ` · ${Utils.escapeHtml(payment.reference)}` : ''}</div></div><strong class="${isNegative ? 'text-danger' : 'text-success'}">${isNegative ? '−' : '+'}${Utils.formatCurrency(Math.abs(payment.amount || 0))}</strong></div>
      <div class="flex gap-sm mt-10"><button class="btn btn-outline btn-sm flex-1" data-action="InvoicesFeature.previewReceipt" data-args='${JSON.stringify([payment.id])}'><span class="material-symbols-rounded">receipt</span>Receipt</button>${!isNegative && !corrected ? `<button class="btn btn-ghost btn-sm" data-action="InvoicesFeature.openRefund" data-args='${JSON.stringify([payment.id])}'>Refund</button><button class="btn btn-ghost btn-sm text-danger" data-action="InvoicesFeature.openReversal" data-args='${JSON.stringify([payment.id])}'>Reverse</button>` : ''}</div></article>`;
  },

  async renderEditor(params = {}) {
    const orderId = Number(params.orderId) || null;
    if (!orderId) return `<div class="empty-state"><span class="material-symbols-rounded">receipt_long</span><div>Create an invoice from an order so totals and customer links remain consistent.</div></div>`;
    const order = await DB.db.orders.get(orderId);
    if (!order) return `<div class="empty-state"><div>Order not found</div></div>`;
    const customer = order.customerId ? await DB.getCustomer(order.customerId) : null;
    const name = customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Customer';
    const due = new Date(); due.setDate(due.getDate() + 14);
    return `<div class="fade-in">${App.renderTopHeader({ title: 'New invoice', showBack: true, backHref: `invoices?orderId=${orderId}` })}<div class="p-md">
      <input type="hidden" id="invoice-order-id" value="${orderId}"><input type="hidden" id="invoice-customer-id" value="${order.customerId}">
      <div class="card inset-dark mb-md"><strong>${Utils.escapeHtml(name)}</strong><div class="fs-12 text-tertiary">${Utils.escapeHtml(order.orderNumber || 'Order')} · ${Utils.formatCurrency(order.total || 0)}</div></div>
      <div class="section-label">Invoice items</div><div id="invoice-items">${this.renderItem({ description: `Order ${order.orderNumber || order.id}`, quantity: 1, unitPrice: order.total || 0 }, 0)}</div>
      <button class="btn btn-outline btn-sm mb-md" data-action="InvoicesFeature.addItem"><span class="material-symbols-rounded">add</span>Add item</button>
      <div class="form-group"><label for="invoice-due-date">Due date</label><input class="input" id="invoice-due-date" type="date" value="${Utils.formatDate(due, 'iso')}"></div>
      <div class="form-group"><label for="invoice-notes">Notes</label><textarea class="textarea" id="invoice-notes"></textarea></div>
      <div class="form-group"><label for="invoice-terms">Payment terms</label><textarea class="textarea" id="invoice-terms">Payment due within 14 days.</textarea></div>
      <button class="btn btn-primary btn-block" id="invoice-save" data-action="InvoicesFeature.saveDraft">Save invoice draft</button>
    </div></div>`;
  },

  renderItem(item, index) {
    return `<div class="card mb-sm invoice-item" data-index="${index}"><div class="form-group"><label for="invoice-description-${index}">Description</label><input class="input invoice-description" id="invoice-description-${index}" value="${Utils.escapeHtml(item.description || '')}"></div><div class="form-row"><div class="form-group"><label for="invoice-quantity-${index}">Quantity</label><input class="input invoice-quantity" id="invoice-quantity-${index}" type="number" inputmode="decimal" min="0.01" step="0.01" value="${item.quantity || 1}"></div><div class="form-group"><label for="invoice-unit-price-${index}">Unit price</label><input class="input invoice-unit-price" id="invoice-unit-price-${index}" type="number" inputmode="decimal" min="0" step="0.01" value="${Number(item.unitPrice || 0).toFixed(2)}"></div></div><button class="btn btn-ghost btn-sm text-danger" aria-label="Remove invoice item ${index + 1}" data-action="InvoicesFeature.removeItem" data-args='${JSON.stringify([index])}'><span class="material-symbols-rounded">delete</span></button></div>`;
  },
  addItem() { const box = document.getElementById('invoice-items'); if (!box) return; box.insertAdjacentHTML('beforeend', this.renderItem({ quantity: 1, unitPrice: 0 }, box.querySelectorAll('.invoice-item').length)); this.reindex(); },
  removeItem(index) { const rows = [...document.querySelectorAll('.invoice-item')]; if (rows.length <= 1) return Toast.show('An invoice needs at least one item', 'warning'); rows.find(row => Number(row.dataset.index) === Number(index))?.remove(); this.reindex(); },
  reindex() { document.querySelectorAll('.invoice-item').forEach((row, index) => { row.dataset.index = index; for (const [selector, prefix] of [['.invoice-description', 'invoice-description'], ['.invoice-quantity', 'invoice-quantity'], ['.invoice-unit-price', 'invoice-unit-price']]) { const input = row.querySelector(selector); if (!input) continue; input.id = `${prefix}-${index}`; const label = input.previousElementSibling; if (label?.tagName === 'LABEL') label.setAttribute('for', input.id); } const button = row.querySelector('[data-action="InvoicesFeature.removeItem"]'); if (button) { button.dataset.args = JSON.stringify([index]); button.setAttribute('aria-label', `Remove invoice item ${index + 1}`); } }); },
  readItems() { return [...document.querySelectorAll('.invoice-item')].map((row, displayOrder) => ({ description: row.querySelector('.invoice-description')?.value.trim() || '', quantity: Number(row.querySelector('.invoice-quantity')?.value || 0), unitPrice: Number(row.querySelector('.invoice-unit-price')?.value || 0), displayOrder })); },

  async saveDraft() {
    const button = document.getElementById('invoice-save'); if (button?.disabled) return;
    const items = this.readItems();
    if (!items.length || items.some(item => !item.description || item.quantity <= 0 || item.unitPrice < 0)) return Toast.show('Complete every invoice item', 'warning');
    if (button) button.disabled = true;
    try {
      const result = await DB.createInvoice({ customerId: Number(document.getElementById('invoice-customer-id').value), orderId: Number(document.getElementById('invoice-order-id').value), dueDate: document.getElementById('invoice-due-date')?.value || null, notes: document.getElementById('invoice-notes')?.value.trim() || '', termsSnapshot: document.getElementById('invoice-terms')?.value.trim() || '' }, items);
      Toast.show('Invoice draft saved', 'success'); App.navigate('invoices', { id: result.invoice.id });
    } catch (error) { if (button) button.disabled = false; console.error(error); Toast.show('Could not save invoice', 'error'); }
  },

  async renderInvoice(id) {
    const result = await DB.getInvoice(id);
    if (!result) return `<div class="empty-state"><div>Invoice not found</div></div>`;
    const { invoice, items } = result;
    const payments = await DB.getLedgerEntries({ invoiceId: id });
    const balance = typeof DB.getInvoiceBalance === 'function' ? await DB.getInvoiceBalance(id) : { paid: invoice.amountPaid || 0, balanceDue: invoice.balanceDue ?? invoice.total ?? 0 };
    return `<div class="fade-in">${App.renderTopHeader({ title: invoice.invoiceNumber || 'Draft invoice', showBack: true, backHref: invoice.orderId ? `invoices?orderId=${invoice.orderId}` : 'invoices' })}<div class="p-md">
      <div class="card card-page"><div class="flex justify-between"><div><strong>${Utils.escapeHtml(invoice.status || 'draft')}</strong><div class="fs-12 text-tertiary">${invoice.issueDate ? `Issued ${Utils.formatDate(invoice.issueDate, 'short')}` : 'Not issued'}</div></div><strong class="fs-20">${Utils.formatCurrency(invoice.total || 0)}</strong></div></div>
      <div class="card card-page"><div class="section-label">Items</div>${items.map(item => `<div class="flex justify-between gap-sm mb-8"><span>${Utils.escapeHtml(item.description)}<small class="block text-tertiary">${item.quantity} × ${Utils.formatCurrency(item.unitPrice)}</small></span><strong>${Utils.formatCurrency(item.lineTotal ?? item.quantity * item.unitPrice)}</strong></div>`).join('')}</div>
      <div class="card card-page"><div class="flex justify-between"><span>Paid</span><strong>${Utils.formatCurrency(balance.paid || 0)}</strong></div>${balance.credits ? `<div class="flex justify-between"><span>Credits</span><strong>${Utils.formatCurrency(balance.credits)}</strong></div>` : ''}<div class="flex justify-between"><span>Balance</span><strong>${Utils.formatCurrency(Math.max(0, balance.balanceDue || 0))}</strong></div></div>
      <div class="flex flex-col gap-sm">${invoice.status === 'draft' ? `<button class="btn btn-primary btn-block" data-action="InvoicesFeature.issue" data-args='${JSON.stringify([id])}'>Issue invoice</button>` : `<button class="btn btn-outline btn-block" data-action="InvoicesFeature.previewInvoice" data-args='${JSON.stringify([id])}'><span class="material-symbols-rounded">preview</span>Preview invoice</button><button class="btn btn-outline btn-block" data-action="InvoicesFeature.openCreditNote" data-args='${JSON.stringify([id])}'>Create credit note</button>`}</div>
      ${payments.length ? `<div class="section-label mt-lg">Payments</div>${(() => { const corrected = new Set(payments.map(payment => payment.reversesPaymentId).filter(Boolean)); return payments.map(payment => this.renderPaymentCard(payment, corrected.has(payment.id))).join(''); })()}` : ''}
    </div></div>`;
  },

  async issue(id) { await DB.issueInvoice(id); Toast.show('Invoice issued', 'success'); App.navigate('invoices', { id }); },
  previewInvoice(id) { if (typeof FinanceDocumentService !== 'undefined') return FinanceDocumentService.openInvoicePreview(id); Toast.show('Invoice preview unavailable', 'error'); },
  async previewReceipt(paymentId) { if (typeof FinanceDocumentService !== 'undefined') return FinanceDocumentService.openReceiptPreview(paymentId); const receipt = await DB.getReceipt(paymentId); if (receipt) Toast.show('Receipt is recorded', 'info'); },
  previewCredit(id) { if (typeof FinanceDocumentService !== 'undefined') return FinanceDocumentService.openCreditPreview(id); Toast.show('Credit note preview unavailable', 'error'); },
  printDocument() { return FinanceDocumentService.printPending(); },
  reviewDocumentMessage() { return FinanceDocumentService.reviewMessage(); },
  openDocumentWhatsApp() { return FinanceDocumentService.openWhatsApp(); },

  openPayment(orderId, customerId, invoiceId = null) { App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Record payment</h3></div><div class="sheet-body"><div class="form-group"><label for="ledger-payment-amount">Amount</label><input class="input" id="ledger-payment-amount" type="number" inputmode="decimal" min="0.01" step="0.01"></div><div class="form-group"><label for="ledger-payment-method">Method</label><select class="select" id="ledger-payment-method"><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></div><div class="form-group"><label for="ledger-payment-reference">Reference</label><input class="input" id="ledger-payment-reference"></div><div class="hint mb-md">This records money received; it does not process a payment.</div><button class="btn btn-primary btn-block" id="ledger-payment-save" data-action="InvoicesFeature.recordPayment" data-args='${JSON.stringify([orderId, customerId, invoiceId])}'>Record payment</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`); },
  async recordPayment(orderId, customerId, invoiceId = null) { const amount = Number(document.getElementById('ledger-payment-amount')?.value || 0); if (!(amount > 0)) return Toast.show('Enter a payment amount', 'warning'); const button = document.getElementById('ledger-payment-save'); if (button?.disabled) return; if (button) button.disabled = true; try { await DB.recordLedgerPayment({ orderId, customerId, invoiceId: invoiceId || null, amount, direction: 'in', date: new Date().toISOString(), method: document.getElementById('ledger-payment-method')?.value || 'other', reference: document.getElementById('ledger-payment-reference')?.value.trim() || '', operationId: Utils.generateId('payment') }); await DB.reconcileOrderBalance(orderId); App.closeModal(); Toast.show('Payment recorded', 'success'); App.navigate('invoices', { orderId, customerId }); } catch (error) { if (button) button.disabled = false; console.error(error); Toast.show('Could not record payment', 'error'); } },

  openCreditNote(id) { App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Create credit note</h3></div><div class="sheet-body"><div class="form-group"><label for="credit-amount">Amount</label><input class="input" id="credit-amount" type="number" inputmode="decimal" min="0.01" step="0.01"></div><div class="form-group"><label for="credit-reason">Reason</label><textarea class="textarea" id="credit-reason"></textarea></div><button class="btn btn-primary btn-block" data-action="InvoicesFeature.createCreditNote" data-args='${JSON.stringify([id])}'>Create credit note</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`); },
  async createCreditNote(id) { const amount = Number(document.getElementById('credit-amount')?.value || 0), reason = document.getElementById('credit-reason')?.value.trim() || ''; if (!(amount > 0) || !reason) return Toast.show('Add an amount and reason', 'warning'); const result = await DB.createCreditNote(id, { amount, reason, operationId: Utils.generateId('credit-note') }); App.closeModal(); Toast.show('Credit note created', 'success'); const credit = result?.creditNote || result; if (credit?.id) return this.previewCredit(credit.id); App.navigate('invoices', { id }); },

  openRefund(paymentId) { this.openCorrection(paymentId, 'refund'); },
  openReversal(paymentId) { this.openCorrection(paymentId, 'reversal'); },
  openCorrection(paymentId, kind) { App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>${kind === 'refund' ? 'Record refund' : 'Reverse payment'}</h3></div><div class="sheet-body">${kind === 'refund' ? '<div class="form-group"><label for="correction-amount">Amount</label><input class="input" id="correction-amount" type="number" inputmode="decimal" min="0.01" step="0.01"></div>' : ''}<div class="form-group"><label for="correction-reason">Reason</label><textarea class="textarea" id="correction-reason"></textarea></div><div class="hint mb-md">The original ledger entry remains in history.</div><button class="btn btn-danger btn-block" data-action="InvoicesFeature.${kind === 'refund' ? 'refund' : 'reverse'}" data-args='${JSON.stringify([paymentId])}'>${kind === 'refund' ? 'Record refund' : 'Reverse payment'}</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`); },
  async refund(paymentId) { const amount = Number(document.getElementById('correction-amount')?.value || 0), reason = document.getElementById('correction-reason')?.value.trim() || ''; if (!(amount > 0) || !reason) return Toast.show('Add an amount and reason', 'warning'); await DB.refundPayment(paymentId, { amount, reason, notes: reason, reference: reason, operationId: Utils.generateId('refund') }); App.closeModal(); Toast.show('Refund recorded', 'success'); App.navigate('invoices'); },
  async reverse(paymentId) { const reason = document.getElementById('correction-reason')?.value.trim() || ''; if (!reason) return Toast.show('Add a reason', 'warning'); await DB.reverseLedgerEntry(paymentId, { reason, operationId: Utils.generateId('reversal') }); App.closeModal(); Toast.show('Payment reversed', 'success'); App.navigate('invoices'); }
};

App.registerFeature(InvoicesFeature);
