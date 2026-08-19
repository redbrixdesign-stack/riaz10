/* Offline formal financial documents. Rendering and message drafting are
   local; print and WhatsApp require a separate, explicit advisor action. */
const FinanceDocumentService = {
  escape(value) { return Utils.escapeHtml(String(value ?? '')); },
  money(value) { return Utils.formatCurrency(Math.abs(Number(value) || 0)); },
  date(value) { return value ? Utils.formatDate(value, 'long') : 'Not set'; },
  customerName(customer) { return customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Customer'; },
  address(customer) { const a = customer?.address || {}; return typeof a === 'string' ? a : [a.line1, a.town || a.city, a.postcode].filter(Boolean).join(', '); },

  async customer(id) { return id && typeof DB.getCustomer === 'function' ? DB.getCustomer(id) : null; },

  async loadInvoice(id) {
    const result = await DB.getInvoice(id); if (!result) throw new Error('Invoice not found');
    const invoice = result.invoice || result; const items = result.items || [];
    return { type: 'invoice', record: invoice, items, customer: await this.customer(invoice.customerId), number: invoice.invoiceNumber || `Invoice ${invoice.id}`, status: invoice.status || 'draft', date: invoice.issueDate || invoice.createdAt, dueDate: invoice.dueDate, subtotal: Number(invoice.subtotal)||0, tax: Number(invoice.taxAmount)||0, total: Number(invoice.total)||0, notes: invoice.notes || '', terms: invoice.terms || '' };
  },

  async loadReceipt(paymentId) {
    const result = await DB.getReceipt(paymentId); if (!result) throw new Error('Receipt not found');
    const payment = result.payment || result; const customer = result.customer || await this.customer(payment.customerId);
    return { type: 'receipt', record: payment, items: [], customer, number: result.receiptNumber || result.document?.documentNumber || result.document?.number || payment.receiptNumber || `Receipt ${payment.id}`, status: payment.status || 'cleared', date: payment.date || payment.createdAt, total: Number(payment.amount)||0, reference: payment.reference || '', method: payment.method || '', notes: payment.notes || '' };
  },

  async loadCredit(id) {
    if (typeof DB.getCreditNote !== 'function') throw new Error('Credit-note preview is not available');
    const result = await DB.getCreditNote(id); if (!result) throw new Error('Credit note not found');
    const credit = result.creditNote || result.credit || result; const items = result.items || credit.itemSnapshot || [];
    return { type: 'credit', record: credit, items: Array.isArray(items) ? items : [], customer: await this.customer(credit.customerId), number: credit.creditNumber || `Credit ${credit.id}`, status: credit.status || 'issued', date: credit.issueDate || credit.createdAt, total: Number(credit.amount)||0, notes: credit.reason || '' };
  },

  title(model) {
    if (model.type === 'invoice') return 'Invoice';
    if (model.type === 'credit') return 'Credit note';
    if (model.record?.kind === 'refund') return 'Refund confirmation';
    if (model.record?.kind === 'reversal') return 'Payment reversal';
    return 'Payment receipt';
  },
  itemRows(model) {
    if (!model.items.length) return '';
    return `<table class="fin-lines"><caption>${this.escape(this.title(model))} items</caption><thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col" class="num">Amount</th></tr></thead><tbody>${model.items.map(item => `<tr><td>${this.escape(item.description || item.name || 'Item')}</td><td>${this.escape(item.quantity || 1)} ${this.escape(item.unit || '')}</td><td class="num">${this.money(item.lineTotal ?? (Number(item.quantity || 1) * Number(item.unitPrice || 0)))}</td></tr>`).join('')}</tbody></table>`;
  },
  body(model) {
    const customerName = this.customerName(model.customer), address = this.address(model.customer);
    const watermark = model.type === 'invoice' && model.status === 'draft' ? '<div class="fin-watermark" role="note">DRAFT — NOT ISSUED</div>' : '';
    const meta = model.type === 'invoice' ? `<div><dt>Issued</dt><dd>${this.escape(this.date(model.date))}</dd></div><div><dt>Due</dt><dd>${this.escape(this.date(model.dueDate))}</dd></div>` : `<div><dt>Date</dt><dd>${this.escape(this.date(model.date))}</dd></div>`;
    return `${watermark}<header class="fin-head"><div><h1>${this.title(model)}</h1><strong>${this.escape(CONFIG.companyName || CONFIG.advisorName || 'Beelo advisor')}</strong>${CONFIG.businessAddress ? `<div>${this.escape(CONFIG.businessAddress)}</div>` : ''}</div><dl><div><dt>Number</dt><dd>${this.escape(model.number)}</dd></div>${meta}</dl></header><section><h2>${model.type === 'receipt' ? 'Received from' : 'For'}</h2><strong>${this.escape(customerName)}</strong>${address ? `<div>${this.escape(address)}</div>` : ''}</section>${this.itemRows(model)}${model.type === 'invoice' ? `<dl class="fin-total"><div><dt>Subtotal</dt><dd>${this.money(model.subtotal)}</dd></div>${model.tax ? `<div><dt>Tax</dt><dd>${this.money(model.tax)}</dd></div>` : ''}<div class="grand"><dt>Total due</dt><dd>${this.money(model.total)}</dd></div></dl>` : `<dl class="fin-total"><div class="grand"><dt>${model.type === 'credit' ? 'Credit total' : 'Amount received'}</dt><dd>${this.money(model.total)}</dd></div>${model.method ? `<div><dt>Method</dt><dd>${this.escape(model.method)}</dd></div>` : ''}${model.reference ? `<div><dt>Reference</dt><dd>${this.escape(model.reference)}</dd></div>` : ''}</dl>`}${model.notes ? `<section><h2>${model.type === 'credit' ? 'Reason' : 'Notes'}</h2><p>${this.escape(model.notes)}</p></section>` : ''}${model.terms ? `<section><h2>Terms</h2><p>${this.escape(model.terms)}</p></section>` : ''}`;
  },
  styles() { return `.finance-document{font:15px/1.5 system-ui,-apple-system,sans-serif;color:#171717;background:#fff;max-width:800px;margin:auto;padding:32px}.finance-document h1,.finance-document h2{color:#171717}.fin-head{display:flex;justify-content:space-between;gap:28px;border-bottom:2px solid;padding-bottom:20px}.fin-head h1{font-size:32px;margin:0}.fin-head dl,.fin-total{margin:0}.fin-head dl div,.fin-total div{display:flex;justify-content:space-between;gap:24px}.fin-head dd,.fin-total dd{margin:0}.finance-document section{margin-top:26px}.finance-document h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em}.fin-lines{width:100%;border-collapse:collapse;margin-top:26px}.fin-lines caption{position:absolute;width:1px;height:1px;overflow:hidden}.fin-lines th,.fin-lines td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.fin-lines .num{text-align:right}.fin-total{max-width:320px;margin:22px 0 0 auto}.fin-total .grand{font-size:19px;font-weight:700;border-top:2px solid;padding-top:8px}.fin-watermark{border:2px solid #9a6700;color:#6b4900;padding:8px;text-align:center;font-weight:700;margin-bottom:20px}@media print{.finance-document{max-width:none;padding:0}}`; },
  html(model) { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${this.escape(model.number)}</title><style>${this.styles()}</style></head><body><main class="finance-document">${this.body(model)}</main></body></html>`; },

  async openInvoicePreview(id) { return this.open(await this.loadInvoice(id)); },
  async openReceiptPreview(id) { return this.open(await this.loadReceipt(id)); },
  async openCreditPreview(id) { return this.open(await this.loadCredit(id)); },
  open(model) {
    this.pending = model;
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Review ${this.escape(this.title(model).toLowerCase())}</h3><button class="btn btn-ghost btn-sm" aria-label="Close document preview" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><div class="finance-document" aria-label="${this.escape(this.title(model))} preview"><style>${this.styles()}</style>${this.body(model)}</div><div class="flex gap-sm mt-lg"><button class="btn btn-primary flex-1" data-action="InvoicesFeature.printDocument"><span class="material-symbols-rounded">print</span>Print or save PDF</button><button class="btn btn-outline flex-1" data-action="InvoicesFeature.reviewDocumentMessage"><span class="material-symbols-rounded">chat</span>Review message</button></div><p class="hint mt-sm">Nothing is sent and no payment is processed automatically.</p></div>`);
  },
  printPending() { if (!this.pending) return Toast.show('Open a document first','info'); const popup=window.open('','_blank'); if(!popup)return Toast.show('Allow pop-ups to print this document','error'); popup.document.open();popup.document.write(this.html(this.pending));popup.document.close();popup.focus();setTimeout(()=>popup.print(),100); },
  reviewMessage() {
    const m=this.pending;if(!m)return Toast.show('Open a document first','info');
    const first=this.customerName(m.customer).split(/\s+/)[0];
    const text=m.type==='invoice'?`Hi ${first}, invoice ${m.number} is ready for ${this.money(m.total)}${m.dueDate?`, due ${this.date(m.dueDate)}`:''}. Please reply if you have any questions.`:m.type==='receipt'?`Hi ${first}, here is confirmation of your ${this.money(m.total)} payment (${m.number}). Thank you.`:`Hi ${first}, credit note ${m.number} has been raised for ${this.money(m.total)}.`;
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Review WhatsApp message</h3></div><div class="sheet-body"><label for="finance-document-message">Message</label><textarea class="textarea" id="finance-document-message" rows="7">${this.escape(text)}</textarea><p class="hint">This opens WhatsApp only. Confirm the recipient and attach the saved document yourself.</p><button class="btn btn-primary btn-block" data-action="InvoicesFeature.openDocumentWhatsApp">Open WhatsApp</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`);
  },
  async openWhatsApp() {
    const message=document.getElementById('finance-document-message')?.value.trim();if(!this.pending||!message)return Toast.show('Message cannot be empty','error');
    const customer=this.pending.customer;if(!customer?.phone)return Toast.show('Customer has no phone number','error');
    const opened=NotificationService.sendWhatsApp(customer.phone,message);
    if(opened&&customer.id&&typeof DB.addCommunication==='function')await DB.addCommunication({customerId:customer.id,type:'whatsapp_attempted',template:null,content:message});
    if(opened)Toast.show('Opened WhatsApp — check it sent','info');
  }
};
