/* ============================================
   BEELO — SUPPLIER PURCHASING
   Secondary operational workspace linked from
   orders and jobs. Supplier progress is deliberately
   independent from the commercial order pipeline.
   ============================================ */

const SuppliersFeature = {
  id: 'suppliers',
  name: 'Suppliers',
  icon: 'local_shipping',
  route: false,

  STATUS: {
    draft: ['Draft', 'edit'],
    submitted: ['Submitted', 'send'],
    acknowledged: ['Acknowledged', 'schedule'],
    part_received: ['Part received', 'inventory'],
    received: ['Received & checked', 'fact_check'],
    issue: ['Issue open', 'report_problem'],
    returned: ['Returned', 'assignment_return'],
    cancelled: ['Cancelled', 'cancel']
  },

  render(params = {}) {
    if (params.id) return this.renderDetail(Number(params.id));
    return this.renderList(params);
  },

  statusMeta(status) {
    const value = this.STATUS[status] || this.STATUS.draft;
    return { label: value[0], icon: value[1] };
  },

  async renderList(params = {}) {
    const orderId = Number(params.orderId) || null;
    const jobId = Number(params.jobId) || null;
    let records = [];
    try { records = await DB.getPurchaseOrders({ ...(orderId ? { orderId } : {}), ...(jobId ? { jobId } : {}) }); }
    catch (error) { console.error('Supplier orders load failed:', error); }
    const backHref = jobId ? `jobs?id=${jobId}` : orderId ? `orders?id=${orderId}` : 'control';
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: 'Supplier orders', showBack: true, backHref, actions: (orderId || jobId) ? `<button class="btn btn-primary btn-sm" data-action="SuppliersFeature.openCreate" data-args='${JSON.stringify([orderId, jobId])}'><span class="material-symbols-rounded">add</span>New</button>` : '' })}
      <div class="p-md">
        <div class="hint mb-md">Buying and delivery progress lives here. It never moves the customer order stage automatically.</div>
        ${records.length ? records.map(record => this.renderCard(record)).join('') : `<div class="empty-state empty-state-lg"><span class="material-symbols-rounded">local_shipping</span><div class="fw-600">No supplier orders yet</div><div class="fs-13">Create one to track submission, delivery and checks.</div>${(orderId || jobId) ? `<button class="btn btn-primary btn-sm mt-md" data-action="SuppliersFeature.openCreate" data-args='${JSON.stringify([orderId, jobId])}'>Create supplier order</button>` : ''}</div>`}
      </div>
    </div>`;
  },

  renderCard(record) {
    const meta = this.statusMeta(record.status);
    const dueAt = record.expectedAt || record.expectedDelivery;
    const due = dueAt ? Utils.formatDate(dueAt, 'short') : 'No delivery date';
    const openIssues = Number(record.openIssueCount || 0);
    return `<button class="card card-page w-full text-left" data-action="App.navigate" data-args='${JSON.stringify(['suppliers', { id: record.id }])}'>
      <div class="flex justify-between gap-sm"><div><strong>${Utils.escapeHtml(record.supplierName || record.reference || 'Supplier order')}</strong><div class="fs-12 text-tertiary">${Utils.escapeHtml(record.reference || 'Reference pending')} · ${Utils.escapeHtml(due)}</div></div><span class="badge"><span class="material-symbols-rounded fs-14">${meta.icon}</span>${Utils.escapeHtml(meta.label)}</span></div>
      ${openIssues ? `<div class="fs-13 mt-sm" style="color:var(--warning)">${openIssues} open supplier issue${openIssues === 1 ? '' : 's'}</div>` : ''}
    </button>`;
  },

  async renderDetail(id) {
    let record = null;
    let quoteDocuments = [];
    try { record = await DB.getPurchaseOrder(id); } catch (error) { console.error('Supplier order load failed:', error); }
    if (!record) return '<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Supplier order not found</div></div>';
    try { quoteDocuments = typeof DB.getDocuments === 'function' ? await DB.getDocuments({ purchaseOrderId: id, type: 'supplier_quote' }) : []; }
    catch (error) { console.error('Supplier quote documents load failed:', error); }
    const meta = this.statusMeta(record.status);
    const items = record.items || [];
    const events = record.events || [];
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: record.reference || 'Supplier order', showBack: true, backHref: record.jobId ? `suppliers?jobId=${record.jobId}` : `suppliers?orderId=${record.orderId}` })}
      <div class="p-md">
        <div class="card card-page"><div class="flex justify-between gap-sm"><div><strong>${Utils.escapeHtml(record.supplierName || 'Supplier')}</strong><div class="fs-12 text-tertiary">Expected ${(record.expectedAt || record.expectedDelivery) ? Utils.formatDate(record.expectedAt || record.expectedDelivery, 'short') : 'date not set'}</div></div><span class="badge"><span class="material-symbols-rounded fs-14">${meta.icon}</span>${Utils.escapeHtml(meta.label)}</span></div></div>
        <div class="card card-page"><div class="section-label">Items</div>${items.length ? items.map(item => `<div class="flex justify-between gap-sm mb-6"><span>${Utils.escapeHtml(item.description || 'Item')} × ${Number(item.quantity || 0)}</span><strong>${Utils.formatCurrency(Number(item.unitCost || 0) * Number(item.quantity || 0))}</strong></div>`).join('') : '<div class="fs-13 text-tertiary">No item lines recorded.</div>'}</div>
        <div class="card card-page">
          <div class="flex justify-between items-center gap-sm mb-sm"><div class="section-label mb-0">Supplier quote</div><div class="flex gap-xs"><label class="btn btn-outline btn-sm" for="supplier-quote-file-${id}"><span class="material-symbols-rounded">attach_file</span>Attach</label><label class="btn btn-primary btn-sm" for="supplier-quote-camera-${id}"><span class="material-symbols-rounded">document_scanner</span>Scan</label></div></div>
          <input class="native-file-input" type="file" id="supplier-quote-file-${id}" accept="image/*,application/pdf" data-event="change" data-action="SuppliersFeature.handleQuoteFile" data-args='${JSON.stringify([id, '__event__'])}'>
          <input class="native-file-input" type="file" id="supplier-quote-camera-${id}" accept="image/*" capture="environment" data-event="change" data-action="SuppliersFeature.handleQuoteFile" data-args='${JSON.stringify([id, '__event__'])}'>
          ${quoteDocuments.length ? quoteDocuments.map(document => `<button class="area-customer-row w-full text-left mb-6" data-action="SuppliersFeature.openQuoteDocument" data-args='${JSON.stringify([document.id])}'><span class="material-symbols-rounded">${document.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'image'}</span><span class="flex-1"><strong>${Utils.escapeHtml(document.filename || 'Supplier quote')}</strong><small>${document.quoteReference ? `Ref ${Utils.escapeHtml(document.quoteReference)} · ` : ''}${Number(document.amount) > 0 ? `${Utils.formatCurrency(document.amount)} · ` : ''}${Utils.formatDate(document.createdAt || document.generatedAt, 'short')}</small></span><span class="material-symbols-rounded">chevron_right</span></button>`).join('') : '<div class="fs-13 text-tertiary">Attach a PDF or photo, or scan a paper quote. Beelo will keep it with this supplier order and prefill the reference and total when AI scanning is available.</div>'}
          <div class="hint mt-sm">You review every extracted field before saving. Attaching a quote does not submit an order or change the customer order.</div>
        </div>
        <div class="card card-page"><div class="section-label">Delivery progress</div><div class="grid-2 gap-sm">
          ${record.status === 'draft' ? `<button class="btn btn-primary btn-sm" data-action="SuppliersFeature.setStatus" data-args='${JSON.stringify([id, 'submitted'])}'><span class="material-symbols-rounded">send</span>Mark submitted</button>` : ''}
          ${record.status === 'submitted' ? `<button class="btn btn-outline btn-sm" data-action="SuppliersFeature.setStatus" data-args='${JSON.stringify([id, 'acknowledged'])}'><span class="material-symbols-rounded">done_all</span>Acknowledged</button>` : ''}
          ${['submitted', 'acknowledged', 'part_received'].includes(record.status) ? `<button class="btn btn-primary btn-sm" data-action="SuppliersFeature.setStatus" data-args='${JSON.stringify([id, 'received'])}'><span class="material-symbols-rounded">fact_check</span>Receive &amp; check</button>` : ''}
          <button class="btn btn-outline btn-sm" data-action="SuppliersFeature.openIssue" data-args='${JSON.stringify([id])}'><span class="material-symbols-rounded">report_problem</span>Log issue</button>
        </div><div class="hint mt-sm">These controls update supplier fulfilment only. Customer-facing order stages remain a separate decision.</div></div>
        <div class="card card-page"><div class="section-label">History</div>${events.length ? events.slice().reverse().map(event => `<div class="area-customer-row mb-6"><span class="material-symbols-rounded">${this.eventIcon(event.type)}</span><span class="flex-1"><strong>${Utils.escapeHtml(this.eventLabel(event.type))}</strong><small>${event.notes ? Utils.escapeHtml(event.notes) + ' · ' : ''}${event.occurredAt ? Utils.formatDate(event.occurredAt, 'short') : ''}</small></span></div>`).join('') : '<div class="fs-13 text-tertiary">No supplier activity yet.</div>'}</div>
      </div>
    </div>`;
  },

  eventLabel(type) { return String(type || 'update').replace(/_/g, ' ').replace(/^./, value => value.toUpperCase()); },
  eventIcon(type) { return ({ shortage: 'remove_shopping_cart', damage: 'broken_image', returned: 'assignment_return', note: 'notification_important', submitted: 'send', acknowledged: 'done_all', received: 'fact_check' })[type] || 'history'; },

  async handleQuoteFile(id, event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/') && file.type !== 'application/pdf') {
      event.target.value = '';
      return Toast.show('Choose a quote photo or PDF', 'warning');
    }
    if (file.size > 4 * 1024 * 1024) {
      event.target.value = '';
      return Toast.show('Quote files must be under 4 MB', 'warning');
    }
    Toast.show(file.type === 'application/pdf' ? 'Preparing quote attachment…' : 'Reading supplier quote…', 'info');
    try {
      let contentData = '';
      if (String(file.type).startsWith('image/') && typeof AIService !== 'undefined' && typeof AIService._toBase64 === 'function') {
        const prepared = await AIService._toBase64(file);
        contentData = `data:${prepared.mediaType};base64,${prepared.base64}`;
      } else {
        contentData = await Utils.fileToBase64(file);
      }

      let fields = {};
      let extractedText = '';
      if (String(file.type).startsWith('image/') && typeof AIService !== 'undefined' && AIService.isEnabled() && typeof AIService.extractSupplierQuote === 'function') {
        const result = await AIService.extractSupplierQuote(file);
        if (result.ok) { fields = result.fields || {}; extractedText = result.rawText || ''; }
      }
      this.pendingQuote = { id, filename: file.name || `supplier-quote-${Date.now()}.jpg`, mimeType: file.type || 'image/jpeg', contentData, extractedText, fields };
      await this.openQuoteReview(id);
    } catch (error) {
      console.error('Supplier quote preparation failed:', error);
      Toast.show('Could not prepare that quote file', 'error');
    } finally {
      if (event?.target) event.target.value = '';
    }
  },

  async openQuoteReview(id) {
    const pending = this.pendingQuote;
    if (!pending || pending.id !== id) return;
    const record = await DB.getPurchaseOrder(id);
    const fields = pending.fields || {};
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Review supplier quote</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <div class="card inset-dark mb-md"><div class="fs-12 text-tertiary">Linked supplier order</div><strong>${Utils.escapeHtml(record?.supplierName || 'Supplier')}</strong><div class="fs-12 text-tertiary mt-xs">${Utils.escapeHtml(pending.filename)}</div></div>
      <div class="form-group"><label for="supplier-quote-vendor">Supplier shown on quote</label><input class="input" id="supplier-quote-vendor" value="${Utils.escapeHtml(fields.supplier || record?.supplierName || '')}"></div>
      <div class="form-group"><label for="supplier-quote-reference">Quote reference</label><input class="input" id="supplier-quote-reference" value="${Utils.escapeHtml(fields.reference || record?.reference || '')}"></div>
      <div class="form-row"><div class="form-group"><label for="supplier-quote-date">Quote date</label><input class="input" id="supplier-quote-date" type="date" value="${Utils.escapeHtml(fields.quoteDate || '')}"></div><div class="form-group"><label for="supplier-quote-valid">Valid until</label><input class="input" id="supplier-quote-valid" type="date" value="${Utils.escapeHtml(fields.validUntil || '')}"></div></div>
      <div class="form-group"><label for="supplier-quote-amount">Quote total</label><input class="input" id="supplier-quote-amount" type="number" min="0" step="0.01" inputmode="decimal" value="${Utils.escapeHtml(fields.amount || '')}"></div>
      <div class="form-group"><label for="supplier-quote-description">What is being supplied?</label><textarea class="textarea" id="supplier-quote-description" rows="3">${Utils.escapeHtml(fields.description || '')}</textarea></div>
      <div class="hint mb-md">Check the reference, dates and total against the document. Beelo never submits the supplier order automatically.</div>
      <button class="btn btn-primary btn-block" data-action="SuppliersFeature.saveQuoteDocument" data-args='${JSON.stringify([id])}'><span class="material-symbols-rounded">lock</span>Save quote to supplier order</button>
    </div>`);
  },

  async saveQuoteDocument(id) {
    const pending = this.pendingQuote;
    if (!pending || pending.id !== id) return Toast.show('Choose the quote file again', 'warning');
    const reference = (document.getElementById('supplier-quote-reference')?.value || '').trim();
    const amount = Math.max(0, Number(document.getElementById('supplier-quote-amount')?.value || 0));
    const button = document.querySelector('[data-action="SuppliersFeature.saveQuoteDocument"]');
    if (button) button.disabled = true;
    try {
      const record = await DB.getPurchaseOrder(id);
      await DB.addDocumentMetadata({
        type: 'supplier_quote', purchaseOrderId: id, orderId: record?.orderId || null, jobId: record?.jobId || null,
        filename: pending.filename, mimeType: pending.mimeType, contentData: pending.contentData, extractedText: pending.extractedText,
        documentSupplier: (document.getElementById('supplier-quote-vendor')?.value || '').trim(), quoteReference: reference,
        quoteDate: document.getElementById('supplier-quote-date')?.value || null, validUntil: document.getElementById('supplier-quote-valid')?.value || null,
        amount, description: (document.getElementById('supplier-quote-description')?.value || '').trim()
      });
      if (reference && !record?.reference) await DB.updatePurchaseOrder(id, { reference });
      this.pendingQuote = null;
      App.closeModal(); Toast.show('Supplier quote saved and linked', 'success'); App.navigate('suppliers', { id });
    } catch (error) {
      console.error('Supplier quote save failed:', error);
      Toast.show(error.message || 'Could not save supplier quote', 'error');
      if (button) button.disabled = false;
    }
  },

  async openQuoteDocument(documentId) {
    try {
      const quote = await DB.getDocument(documentId);
      if (!quote || quote.type !== 'supplier_quote') return Toast.show('Quote document not found', 'error');
      const safeContent = /^data:(?:image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,/.test(quote.contentData || '') ? quote.contentData : '';
      App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>${Utils.escapeHtml(quote.filename || 'Supplier quote')}</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
        ${safeContent && quote.mimeType !== 'application/pdf' ? `<img class="max-w-full br-8 mb-md" src="${safeContent}" alt="Supplier quote">` : '<div class="card inset-dark mb-md"><span class="material-symbols-rounded">picture_as_pdf</span> PDF quote attached</div>'}
        <div class="card inset-dark mb-md"><div class="flex justify-between"><span>Reference</span><strong>${Utils.escapeHtml(quote.quoteReference || 'Not recorded')}</strong></div><div class="flex justify-between mt-sm"><span>Total</span><strong>${Number(quote.amount) > 0 ? Utils.formatCurrency(quote.amount) : 'Not recorded'}</strong></div>${quote.description ? `<div class="fs-13 text-secondary mt-sm">${Utils.escapeHtml(quote.description)}</div>` : ''}</div>
        ${safeContent ? `<a class="btn btn-primary btn-block" href="${safeContent}" download="${Utils.escapeHtml(quote.filename || 'supplier-quote')}"><span class="material-symbols-rounded">open_in_new</span>Open attached file</a>` : ''}
      </div>`);
    } catch (error) { console.error('Supplier quote open failed:', error); Toast.show('Could not open supplier quote', 'error'); }
  },

  openCreate(orderId, jobId) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>New supplier order</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <div class="form-group"><label for="supplier-name">Supplier</label><input class="input" id="supplier-name" autocomplete="organization" required></div>
      <div class="form-group"><label for="supplier-reference">Supplier reference</label><input class="input" id="supplier-reference" placeholder="Can be added later"></div>
      <div class="form-group"><label for="supplier-expected">Expected delivery</label><input class="input" id="supplier-expected" type="date" value="${tomorrow}"></div>
      <div class="form-group"><label for="supplier-item">First item</label><input class="input" id="supplier-item" placeholder="Product or material" required></div>
      <div class="form-row"><div class="form-group"><label for="supplier-qty">Quantity</label><input class="input" id="supplier-qty" type="number" min="0.01" step="0.01" value="1"></div><div class="form-group"><label for="supplier-cost">Unit cost</label><input class="input" id="supplier-cost" type="number" min="0" step="0.01" inputmode="decimal" value="0"></div></div>
      <button class="btn btn-primary btn-block" data-action="SuppliersFeature.saveNew" data-args='${JSON.stringify([orderId, jobId])}'>Create supplier order</button>
    </div>`);
  },

  async saveNew(orderId, jobId) {
    const supplierName = (document.getElementById('supplier-name')?.value || '').trim();
    const description = (document.getElementById('supplier-item')?.value || '').trim();
    if (!supplierName || !description) return Toast.show('Supplier and first item are required', 'warning');
    const button = document.querySelector('[data-action="SuppliersFeature.saveNew"]');
    if (button) button.disabled = true;
    try {
      const supplier = await DB.addSupplier({ name: supplierName, status: 'active' });
      const product = await DB.addProduct({ supplierId: supplier.id, name: description, unitCost: Number(document.getElementById('supplier-cost')?.value || 0), active: true });
      const payload = { orderId: Number(orderId) || null, jobId: Number(jobId) || null, supplierId: supplier.id, reference: (document.getElementById('supplier-reference')?.value || '').trim(), expectedAt: document.getElementById('supplier-expected')?.value || null, status: 'draft' };
      const items = [{ productId: product.id, description, quantity: Number(document.getElementById('supplier-qty')?.value || 1), unitCost: Number(document.getElementById('supplier-cost')?.value || 0) }];
      const result = await DB.createPurchaseOrder(payload, items, `purchase-order:${Date.now()}`);
      App.closeModal(); Toast.show('Supplier order created', 'success'); App.navigate('suppliers', { id: result.purchaseOrder?.id || result.id });
    } catch (error) { console.error('Supplier order create failed:', error); Toast.show(error.message || 'Could not create supplier order', 'error'); if (button) button.disabled = false; }
  },

  async setStatus(id, status) {
    try { await DB.recordPurchaseOrderEvent(id, status, { occurredAt: new Date().toISOString(), checked: status === 'received' }, `purchase-event:${id}:${status}:${Date.now()}`); Toast.show(`Supplier order ${this.statusMeta(status).label.toLowerCase()}`, 'success'); App.navigate('suppliers', { id }); }
    catch (error) { console.error('Supplier status update failed:', error); Toast.show('Could not update supplier order', 'error'); }
  },

  openIssue(id) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Supplier issue</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <div class="form-group"><label for="supplier-issue-type">Issue</label><select class="input" id="supplier-issue-type"><option value="shortage">Shortage</option><option value="damage">Damage</option><option value="returned">Return</option><option value="note">Supplier follow-up</option></select></div>
      <div class="form-group"><label for="supplier-issue-notes">What happened?</label><textarea class="input" id="supplier-issue-notes" rows="3" required></textarea></div>
      <button class="btn btn-primary btn-block" data-action="SuppliersFeature.saveIssue" data-args='${JSON.stringify([id])}'>Save issue</button>
    </div>`);
  },

  async saveIssue(id) {
    const type = document.getElementById('supplier-issue-type')?.value || 'note';
    const notes = (document.getElementById('supplier-issue-notes')?.value || '').trim();
    if (!notes) return Toast.show('Add a short note first', 'warning');
    try { await DB.recordPurchaseOrderEvent(id, type, { notes, occurredAt: new Date().toISOString(), open: true, followUp: type === 'note' }, `purchase-issue:${id}:${Date.now()}`); App.closeModal(); Toast.show('Supplier issue added to follow-ups', 'success'); App.navigate('suppliers', { id }); }
    catch (error) { console.error('Supplier issue save failed:', error); Toast.show('Could not save issue', 'error'); }
  }
};

App.registerFeature(SuppliersFeature);
