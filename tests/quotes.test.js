// Structured quote UX and DB-domain integration.
'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/features/quotes/quotes.js'), 'utf8');

global.window = global;
global.document = { getElementById: () => null, querySelectorAll: () => [] };
global.Utils = {
  escapeHtml: value => String(value ?? ''),
  formatCurrency: value => `£${Number(value || 0).toFixed(2)}`,
  formatDate: () => '19 Aug'
};
global.Toast = { calls: [], show(...args) { this.calls.push(args); } };
global.App = {
  features: new Map(), navigations: [],
  registerFeature(feature) { this.features.set(feature.id, feature); },
  renderTopHeader: ({ title }) => `<header>${title}</header>`,
  navigate(...args) { this.navigations.push(args); },
  openModal() {}, closeModal() {}
};

const calls = [];
global.DB = {
  async getQuotes() { return []; },
  async getQuote(id) { return { quote: { id, customerId: 7, quoteNumber: 'QUO-2026-0001', version: 1, status: 'issued', total: 120 }, items: [{ description: 'Blind', quantity: 2, unit: 'each', unitPrice: 60, lineTotal: 120 }] }; },
  async getCustomer() { return { id: 7, fullName: 'Alice Smith' }; },
  async issueQuote(id) { calls.push(['issue', id]); return { id, status: 'issued' }; },
  async acceptQuote(id, metadata) { calls.push(['accept', id, metadata]); return { id, status: 'accepted' }; },
  async rejectQuote(id, reason) { calls.push(['reject', id, reason]); return { id, status: 'rejected' }; },
  async expireQuote(id) { calls.push(['expire', id]); return { id, status: 'expired' }; },
  async createQuoteVersion(id) { calls.push(['version', id]); return { quote: { id: 8, version: 2, status: 'draft' }, items: [] }; },
  async convertAcceptedQuoteToOrder(id) { calls.push(['order', id]); return { quote: { id }, order: { id: 90 }, created: true }; }
};

(0, eval)(source);
const Quotes = App.features.get('quotes');
const assert = (condition, message, extra) => {
  if (!condition) { console.error('FAIL:', message, extra || ''); process.exitCode = 1; }
  else console.log('OK:', message);
};

(async () => {
  assert(Quotes && Quotes.route === false, 'quotes is a secondary workflow, not a new primary nav item');
  const totals = Quotes.calculatePreview([
    { quantity: 3, unitPrice: 19.99 },
    { quantity: 1.5, unitPrice: 10 }
  ], 10, 20);
  assert(totals.subtotal === 74.97, 'subtotal derives from line items with currency rounding', totals);
  assert(totals.discountAmount === 7.5 && totals.taxAmount === 13.49 && totals.total === 80.96, 'discount, tax and total are derived deterministically', totals);

  const detail = await Quotes.renderQuote(1);
  assert(detail.includes('QUO-2026-0001') && detail.includes('Blind') && detail.includes('Create new version'), 'issued quote detail shows number, items and version action');
  assert(!detail.includes('Edit draft'), 'issued quote cannot be edited in place');

  await Quotes.issue(1);
  await Quotes.accept(1);
  await Quotes.expire(1);
  await Quotes.createVersion(1);
  assert(calls.some(call => call[0] === 'issue') && calls.some(call => call[0] === 'accept') && calls.some(call => call[0] === 'expire') && calls.some(call => call[0] === 'version'), 'status and version actions use DB domain APIs');
  assert(source.includes("taxTreatment: Number(document.getElementById('quote-tax-rate')") && source.includes("? 'exclusive' : 'none'"), 'saved tax treatment matches the live tax-inclusive preview');
  assert(App.navigations.some(nav => nav[0] === 'quotes' && nav[1]?.id === 8), 'new version opens as a separate draft');

  const appointmentSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/appointments/appointments.js'), 'utf8');
  const customerSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/customer/customer.js'), 'utf8');
  const ordersSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/orders/orders.js'), 'utf8');
  assert(appointmentSource.includes("'quotes', { action: 'add', customerId: appt.customerId, appointmentId: appt.id }"), 'visit detail can create a linked structured quote');
  assert(customerSource.includes("DB.getQuotes({ customerId })") && customerSource.includes('Structured quotes'), 'Customer 360 lists and creates structured quotes');
  assert(ordersSource.includes('liveStructuredQuotes') && ordersSource.includes('renderStructuredQuoteCard'), 'Orders board merges structured and legacy quoted cards');
  assert(ordersSource.includes('QUOTE_OUTCOMES'), 'legacy appointment quote pipeline remains intact');

  console.log(process.exitCode ? '\nQUOTES TEST FAILED' : '\nQUOTES TEST PASSED');
})();
