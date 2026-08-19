// Phase 4 invoices and append-only payment ledger UX.
'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/features/invoices/invoices.js'), 'utf8');

const elements = new Map();
global.window = global;
global.document = { getElementById: id => elements.get(id) || null, querySelectorAll: () => [] };
global.Utils = { escapeHtml: value => String(value ?? ''), formatCurrency: value => `£${Number(value || 0).toFixed(2)}`, formatDate: (value, mode) => mode === 'iso' ? '2026-09-02' : '19 Aug', generateId: prefix => `${prefix}-op-1` };
global.Toast = { calls: [], show(...args) { this.calls.push(args); } };
global.App = { features: new Map(), navigations: [], modal: '', registerFeature(feature) { this.features.set(feature.id, feature); }, renderTopHeader: ({ title }) => `<header>${title}</header>`, navigate(...args) { this.navigations.push(args); }, openModal(html) { this.modal = html; }, closeModal() {} };

const invoices = [{ id: 2, invoiceNumber: 'INV-2026-0001', orderId: 5, customerId: 7, status: 'issued', total: 500, amountPaid: 200, balanceDue: 300 }];
const payments = [{ id: 9, orderId: 5, invoiceId: 2, customerId: 7, type: 'payment', direction: 'in', amount: 200, method: 'bank_transfer', reference: 'ABC', createdAt: '2026-08-19T10:00:00Z' }];
const calls = [];
global.DB = {
  db: { orders: { async get() { return { id: 5, customerId: 7, orderNumber: 'ORD-5', total: 500 }; } } },
  async getInvoices() { return invoices; }, async getLedgerEntries() { return payments; },
  async getInvoice() { return { invoice: invoices[0], items: [{ description: 'Shutters', quantity: 1, unitPrice: 500, lineTotal: 500 }] }; },
  async issueInvoice(id) { calls.push(['issue', id]); },
  async recordLedgerPayment(data) { calls.push(['payment', data]); return { id: 10, ...data }; },
  async reconcileOrderBalance(id) { calls.push(['reconcile', id]); return { balanceDue: 200 }; },
  async refundPayment(id, options) { calls.push(['refund', id, options]); },
  async reverseLedgerEntry(id, options) { calls.push(['reverse', id, options]); },
  async createCreditNote(id, data) { calls.push(['credit', id, data]); return { id: 12 }; }
};
global.FinanceDocumentService = { openInvoicePreview() {}, openReceiptPreview() {}, openCreditPreview() {}, printPending() {}, reviewMessage() {}, openWhatsApp() {} };

(0, eval)(source);
const Invoices = App.features.get('invoices');
const assert = (condition, message, extra) => { if (!condition) { console.error('FAIL:', message, extra || ''); process.exitCode = 1; } else console.log('OK:', message); };

(async () => {
  assert(Invoices && Invoices.route === false, 'Invoices is secondary and does not alter primary navigation');
  const itemMarkup = Invoices.renderItem({ description: 'Blind', quantity: 1, unitPrice: 50 }, 3);
  assert(itemMarkup.includes('for="invoice-description-3"') && itemMarkup.includes('id="invoice-description-3"') && itemMarkup.includes('for="invoice-quantity-3"') && itemMarkup.includes('for="invoice-unit-price-3"'), 'dynamic invoice item controls have unique associated labels');
  const list = await Invoices.renderList({ orderId: 5, customerId: 7 });
  assert(list.includes('INV-2026-0001') && list.includes('Record payment'), 'order finance view lists invoices and records payments');
  assert(list.includes('Refund') && list.includes('Reverse') && list.includes('Receipt'), 'payment ledger exposes append-only corrections and receipt');
  assert(list.includes('aria-label') || Invoices.renderPaymentCard(payments[0]).includes('btn'), 'finance actions use native accessible controls');

  const detail = await Invoices.renderInvoice(2);
  assert(detail.includes('Shutters') && detail.includes('£300.00') && detail.includes('Preview invoice'), 'issued invoice shows items, reconciled balance and document action');
  await Invoices.issue(2);
  assert(calls.some(call => call[0] === 'issue'), 'issue uses invoice domain API');

  elements.set('ledger-payment-amount', { value: '100' }); elements.set('ledger-payment-method', { value: 'card' }); elements.set('ledger-payment-reference', { value: 'CARD-1' }); elements.set('ledger-payment-save', { disabled: false });
  await Invoices.recordPayment(5, 7, 2);
  const recorded = calls.find(call => call[0] === 'payment');
  assert(recorded && recorded[1].amount === 100 && recorded[1].operationId === 'payment-op-1', 'payment write is explicit and retry-keyed');
  assert(calls.some(call => call[0] === 'reconcile' && call[1] === 5), 'order balance is reconciled from the ledger');

  elements.set('correction-amount', { value: '25' }); elements.set('correction-reason', { value: 'Customer overpaid' });
  await Invoices.refund(9);
  await Invoices.reverse(9);
  assert(calls.some(call => call[0] === 'refund') && calls.some(call => call[0] === 'reverse'), 'refund and reversal append domain records rather than editing history');

  const ordersSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/orders/orders.js'), 'utf8');
  const customerSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/customer/customer.js'), 'utf8');
  assert(ordersSource.includes("['invoices', { orderId: order.id, customerId: order.customerId }]") && ordersSource.includes('DB.recordOrderPayment'), 'Orders links finance documents while preserving compatibility payment UX');
  assert(customerSource.includes('DB.getInvoices({ customerId })') && customerSource.includes('DB.getLedgerEntries({ customerId })'), 'Customer 360 includes invoices and immutable ledger history');

  console.log(process.exitCode ? '\nINVOICES TEST FAILED' : '\nINVOICES TEST PASSED');
})();
