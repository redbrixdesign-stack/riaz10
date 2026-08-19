const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('js/features/suppliers/suppliers.js', 'utf8');
const state = { suppliers: [], products: [], records: [], events: [], orderStageCalls: 0, navigations: [] };
const elements = {};
const sandbox = {
  console,
  Date,
  document: {
    getElementById: id => elements[id] || null,
    querySelector: () => ({ disabled: false })
  },
  Utils: {
    escapeHtml: value => String(value ?? ''),
    formatDate: value => String(value).slice(0, 10),
    formatCurrency: value => `£${Number(value).toFixed(2)}`
  },
  Toast: { show() {} },
  App: {
    registerFeature(feature) { sandbox.SuppliersFeature = feature; },
    renderTopHeader: ({ title }) => `<header>${title}</header>`,
    openModal(html) { sandbox.modal = html; },
    closeModal() {},
    navigate(feature, params) { state.navigations.push({ feature, params }); }
  },
  DB: {
    async getPurchaseOrders(filter) { return state.records.filter(record => (!filter.orderId || record.orderId === filter.orderId) && (!filter.jobId || record.jobId === filter.jobId)); },
    async getPurchaseOrder(id) { return state.records.find(record => record.id === id) || null; },
    async addSupplier(data) { const supplier = { ...data, id: state.suppliers.length + 1 }; state.suppliers.push(supplier); return supplier; },
    async addProduct(data) { const product = { ...data, id: state.products.length + 1 }; state.products.push(product); return product; },
    async createPurchaseOrder(data, items, operationId) { const purchaseOrder = { ...data, items, events: [], operationId, id: state.records.length + 1 }; state.records.push(purchaseOrder); return { purchaseOrder }; },
    async updatePurchaseOrder(id, patch) { Object.assign(state.records.find(record => record.id === id), patch); },
    async recordPurchaseOrderEvent(id, type, data, operationId) { const event = { purchaseOrderId: id, type, ...data, operationId }; state.events.push(event); const record = state.records.find(row => row.id === id); record.events.push(event); if (['submitted', 'acknowledged', 'received', 'returned'].includes(type)) record.status = type; if (['shortage', 'damage'].includes(type)) record.status = 'issue'; return record; },
    async setOrderStage() { state.orderStageCalls += 1; }
  }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const feature = sandbox.SuppliersFeature;

(async () => {
  elements['supplier-name'] = { value: 'North Fabrication' };
  elements['supplier-reference'] = { value: 'NF-142' };
  elements['supplier-expected'] = { value: '2026-09-02' };
  elements['supplier-item'] = { value: 'Timber-look frame' };
  elements['supplier-qty'] = { value: '2' };
  elements['supplier-cost'] = { value: '125.50' };
  await feature.saveNew(41, 8);
  assert.equal(state.suppliers.length, 1, 'creates a supplier record');
  assert.equal(state.records[0].supplierId, 1, 'links the supplier, not a duplicated name');
  assert.equal(state.records[0].items[0].productId, 1, 'links a reusable supplier product');
  assert.equal(state.records[0].expectedAt, '2026-09-02', 'stores expected delivery contract field');
  assert.equal(state.records[0].items[0].quantity, 2, 'creates the first purchase-order item');

  await feature.setStatus(1, 'submitted');
  assert.equal(state.records[0].status, 'submitted', 'updates supplier fulfilment status');
  assert.equal(state.events[0].type, 'submitted', 'adds append-only supplier history');
  assert.equal(state.orderStageCalls, 0, 'never changes the commercial order stage');

  elements['supplier-issue-type'] = { value: 'damage' };
  elements['supplier-issue-notes'] = { value: 'Two rails scratched in transit' };
  await feature.saveIssue(1);
  assert.equal(state.events[1].type, 'damage', 'tracks delivery damage');
  assert.equal(state.events[1].open, true, 'supplier issue remains actionable');

  state.records[0].supplierName = 'North Fabrication';
  const list = await feature.renderList({ orderId: 41 });
  const detail = await feature.renderDetail(1);
  assert.match(list, /never moves the customer order stage automatically/i);
  assert.match(detail, /Customer-facing order stages remain a separate decision/i);
  assert.match(detail, /Two rails scratched in transit/);
  console.log('✓ supplier purchase workflow is additive and order-stage safe');
})().catch(error => { console.error(error); process.exit(1); });
