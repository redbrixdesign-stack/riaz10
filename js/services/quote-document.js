/* Offline quote document rendering. No network call, auto-send or automatic
   print occurs: the advisor reviews the document before an explicit handoff. */
const QuoteDocumentService = {
  escape(value) { return Utils.escapeHtml(String(value ?? '')); },

  money(value) { return Utils.formatCurrency(Number(value) || 0); },

  addressText(customer) {
    const address = customer?.address || {};
    if (typeof address === 'string') return address;
    return [address.line1, address.town || address.city, address.postcode].filter(Boolean).join(', ');
  },

  model(quote, items, customer, config = CONFIG) {
    const rows = (items || []).map((item, index) => ({
      description: String(item.description || item.name || `Item ${index + 1}`),
      quantity: Number(item.quantity) || 0,
      unit: String(item.unit || 'each'),
      unitPrice: Number(item.unitPrice) || 0,
      lineTotal: Number.isFinite(Number(item.lineTotal)) ? Number(item.lineTotal) : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
    }));
    const itemSubtotal = rows.reduce((sum, item) => sum + item.lineTotal, 0);
    const subtotal = Number.isFinite(Number(quote.subtotal)) ? Number(quote.subtotal) : itemSubtotal;
    const discount = Math.max(0, Number(quote.discountAmount) || 0);
    const tax = Math.max(0, Number(quote.taxAmount) || 0);
    const total = Number.isFinite(Number(quote.total)) ? Number(quote.total) : Math.max(0, subtotal - discount + tax);
    return {
      quote, rows, subtotal, discount, tax, total,
      businessName: config.companyName || config.advisorName || 'Beelo advisor',
      businessAddress: config.businessAddress || '',
      customerName: customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Customer',
      customerAddress: this.addressText(customer),
      number: quote.quoteNumber || `Quote ${quote.id || ''}`.trim(),
      version: Number(quote.version) || 1,
      status: String(quote.status || 'draft'),
      issueDate: quote.issueDate || quote.createdAt || null,
      expiryDate: quote.expiryDate || null,
      notes: quote.notes || '',
      terms: quote.termsSnapshot || ''
    };
  },

  async load(quoteId) {
    const result = await DB.getQuote(quoteId);
    if (!result) throw new Error('Quote not found');
    const quote = result.quote || result;
    let items = result.items;
    if (!items && typeof DB.getQuoteItems === 'function') items = await DB.getQuoteItems(quote.id);
    const customer = quote.customerId && typeof DB.getCustomer === 'function' ? await DB.getCustomer(quote.customerId) : null;
    return this.model(quote, items || [], customer);
  },

  date(value) { return value ? Utils.formatDate(value, 'long') : 'Not set'; },

  rowsHtml(model) {
    if (!model.rows.length) return '<tr><td colspan="4">No line items</td></tr>';
    return model.rows.map(item => `<tr><td>${this.escape(item.description)}</td><td>${this.escape(item.quantity)}</td><td>${this.escape(item.unit)}</td><td class="num">${this.money(item.lineTotal)}</td></tr>`).join('');
  },

  documentBody(model) {
    const draft = model.status === 'draft' ? '<div class="quote-watermark" role="note">DRAFT — NOT ISSUED</div>' : '';
    return `${draft}<header class="quote-doc-head"><div><h1>Quote</h1><div class="quote-business">${this.escape(model.businessName)}</div>${model.businessAddress ? `<div>${this.escape(model.businessAddress)}</div>` : ''}</div><dl><div><dt>Quote</dt><dd>${this.escape(model.number)}</dd></div><div><dt>Version</dt><dd>${model.version}</dd></div><div><dt>Issued</dt><dd>${this.escape(this.date(model.issueDate))}</dd></div><div><dt>Valid until</dt><dd>${this.escape(this.date(model.expiryDate))}</dd></div></dl></header>
      <section aria-labelledby="quote-for"><h2 id="quote-for">Prepared for</h2><strong>${this.escape(model.customerName)}</strong>${model.customerAddress ? `<div>${this.escape(model.customerAddress)}</div>` : ''}</section>
      <table class="quote-lines"><caption>Quoted items</caption><thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Unit</th><th scope="col" class="num">Amount</th></tr></thead><tbody>${this.rowsHtml(model)}</tbody></table>
      <dl class="quote-totals"><div><dt>Subtotal</dt><dd>${this.money(model.subtotal)}</dd></div>${model.discount ? `<div><dt>Discount</dt><dd>−${this.money(model.discount)}</dd></div>` : ''}${model.tax ? `<div><dt>Tax</dt><dd>${this.money(model.tax)}</dd></div>` : ''}<div class="total"><dt>Total</dt><dd>${this.money(model.total)}</dd></div></dl>
      ${model.notes ? `<section><h2>Notes</h2><p>${this.escape(model.notes)}</p></section>` : ''}${model.terms ? `<section><h2>Terms</h2><p>${this.escape(model.terms)}</p></section>` : ''}`;
  },

  styles() {
    return `.quote-document{font:15px/1.5 system-ui,-apple-system,sans-serif;color:#171717;background:#fff;max-width:800px;margin:auto;padding:32px}.quote-document h1,.quote-document h2{color:#171717}.quote-doc-head{display:flex;justify-content:space-between;gap:32px;border-bottom:2px solid #171717;padding-bottom:20px}.quote-doc-head h1{font-size:34px;margin:0}.quote-doc-head dl,.quote-totals{margin:0}.quote-doc-head dl div,.quote-totals div{display:flex;justify-content:space-between;gap:24px}.quote-doc-head dt{font-weight:600}.quote-doc-head dd,.quote-totals dd{margin:0}.quote-business{font-weight:700}.quote-document section{margin-top:28px}.quote-document h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em}.quote-lines{width:100%;border-collapse:collapse;margin-top:28px}.quote-lines caption{position:absolute;width:1px;height:1px;overflow:hidden}.quote-lines th,.quote-lines td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.quote-lines .num{text-align:right}.quote-totals{margin:20px 0 0 auto;max-width:300px}.quote-totals .total{font-size:20px;font-weight:700;border-top:2px solid;padding-top:8px}.quote-watermark{border:2px solid #9a6700;color:#6b4900;padding:8px;text-align:center;font-weight:700;margin-bottom:20px}@media print{.quote-document{max-width:none;padding:0}.quote-watermark{break-inside:avoid}}`;
  },

  printableHtml(model) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${this.escape(model.number)}</title><style>${this.styles()}</style></head><body><main class="quote-document">${this.documentBody(model)}</main></body></html>`;
  },

  async openPreview(quoteId) {
    const model = await this.load(quoteId);
    this.pending = model;
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Review quote</h3><button class="btn btn-ghost btn-sm" aria-label="Close quote preview" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><div class="quote-document" aria-label="Quote preview"><style>${this.styles()}</style>${this.documentBody(model)}</div><div class="flex gap-sm mt-lg"><button class="btn btn-primary flex-1" data-action="QuotesFeature.printDocument"><span class="material-symbols-rounded">print</span>Print or save PDF</button><button class="btn btn-outline flex-1" data-action="QuotesFeature.reviewQuoteMessage"><span class="material-symbols-rounded">chat</span>Review message</button></div><p class="hint mt-sm">Nothing is sent automatically. Check the quote before printing or opening WhatsApp.</p></div>`);
  },

  printPending() {
    if (!this.pending) return Toast.show('Open a quote preview first', 'info');
    const popup = window.open('', '_blank');
    if (!popup) return Toast.show('Allow pop-ups to print this quote', 'error');
    popup.document.open(); popup.document.write(this.printableHtml(this.pending)); popup.document.close();
    popup.focus(); setTimeout(() => popup.print(), 100);
  },

  reviewWhatsApp() {
    const model = this.pending;
    if (!model) return Toast.show('Open a quote preview first', 'info');
    const text = `Hi ${Utils.firstNameFrom(model.customerName)}, your quote ${model.number} is ready. Total: ${this.money(model.total)}${model.expiryDate ? `. Valid until ${this.date(model.expiryDate)}` : ''}. Please reply if you would like to discuss anything.`;
    this.pendingMessage = text;
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Review WhatsApp message</h3><button class="btn btn-ghost btn-sm" aria-label="Close message review" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><label for="quote-whatsapp-message">Message</label><textarea class="textarea" id="quote-whatsapp-message" rows="7">${this.escape(text)}</textarea><p class="hint">This opens WhatsApp only. Confirm the recipient and attach the saved quote yourself.</p><button class="btn btn-primary btn-block mt-md" data-action="QuotesFeature.openQuoteWhatsApp">Open WhatsApp</button></div>`);
  },

  async openWhatsApp() {
    const model = this.pending;
    const message = document.getElementById('quote-whatsapp-message')?.value.trim();
    if (!model || !message) return Toast.show('Message cannot be empty', 'error');
    try {
      const customer = await DB.getCustomer(model.quote.customerId);
      if (!customer?.phone) return Toast.show('Customer has no phone number', 'error');
      const opened = NotificationService.sendWhatsApp(customer.phone, message);
      if (opened && customer.id && typeof DB.addCommunication === 'function') {
        await DB.addCommunication({ customerId: customer.id, type: 'whatsapp_attempted', template: null, content: message });
      }
      if (opened) Toast.show('Opened WhatsApp — check it sent', 'info');
    } catch (e) { Toast.show('Could not open customer message', 'error'); }
  }
};
