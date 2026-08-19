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
    try { record = await DB.getPurchaseOrder(id); } catch (error) { console.error('Supplier order load failed:', error); }
    if (!record) return '<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Supplier order not found</div></div>';
    const meta = this.statusMeta(record.status);
    const items = record.items || [];
    const events = record.events || [];
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: record.reference || 'Supplier order', showBack: true, backHref: record.jobId ? `suppliers?jobId=${record.jobId}` : `suppliers?orderId=${record.orderId}` })}
      <div class="p-md">
        <div class="card card-page"><div class="flex justify-between gap-sm"><div><strong>${Utils.escapeHtml(record.supplierName || 'Supplier')}</strong><div class="fs-12 text-tertiary">Expected ${(record.expectedAt || record.expectedDelivery) ? Utils.formatDate(record.expectedAt || record.expectedDelivery, 'short') : 'date not set'}</div></div><span class="badge"><span class="material-symbols-rounded fs-14">${meta.icon}</span>${Utils.escapeHtml(meta.label)}</span></div></div>
        <div class="card card-page"><div class="section-label">Items</div>${items.length ? items.map(item => `<div class="flex justify-between gap-sm mb-6"><span>${Utils.escapeHtml(item.description || 'Item')} × ${Number(item.quantity || 0)}</span><strong>${Utils.formatCurrency(Number(item.unitCost || 0) * Number(item.quantity || 0))}</strong></div>`).join('') : '<div class="fs-13 text-tertiary">No item lines recorded.</div>'}</div>
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
