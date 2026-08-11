// Smoke test for the Customer 360 / Orders / Follow-ups features: seeds
// realistic records and asserts the inbox/board logic without a browser.
// Run: node tests/features.test.js
'use strict';

const path = require('path');
const fs = require('fs');

function loadAll(entries) {
  const code = entries.map(e => e.startsWith('::raw::') ? e.slice(7) : fs.readFileSync(path.join(__dirname, '..', e), 'utf8')).join('\n;\n');
  (0, eval)(code);
}

// ---- Minimal DOM/global stubs ----
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild() {}, remove() {} }),
  head: { appendChild() {} },
  addEventListener() {},
  body: { appendChild() {} }
};
global.window = global;

const registered = [];
global.App = {
  features: new Map(),
  registerFeature(f) { registered.push(f); this.features.set(f.id, f); },
  navigate() {},
  closeModal() {},
  openModal() {}
};
global.Toast = { show() {} };

// ---- In-memory DB stub ----
const TABLES = {
  customers: [], appointments: [], orders: [], measurements: [], communications: [], photos: [], settings: []
};
const table = name => {
  const rows = TABLES[name];
  return {
    toArray: async () => rows,
    get: async id => rows.find(r => r.id === id) || null,
    bulkGet: async ids => ids.map(id => rows.find(r => r.id === id) || null),
    where: idx => ({
      equals: v => ({ toArray: async () => rows.filter(r => r[idx] === v) }),
      anyOf: vs => ({ toArray: async () => rows.filter(r => vs.includes(r[idx])) })
    })
  };
};
global.DB = {
  db: {
    customers: table('customers'),
    appointments: table('appointments'),
    orders: table('orders'),
    measurements: table('measurements'),
    communications: table('communications'),
    photos: table('photos')
  },
  getPipeline: async () => TABLES.appointments.filter(a =>
    ['quoted', 'thinking', 'partner', 'compare_quotes', 'expensive', 'customer_no_show', 'advisor_unavailable'].includes(a.outcome)
  ),
  // Mirrors the real DB: starts at NOW (a 10:00 visit invisible after 10:00).
  getUpcomingAppointments: async () => TABLES.appointments.filter(a => a.status !== 'cancelled' && new Date(a.date) >= new Date()),
  // Mirrors the real DB: full day — this is what followups relies on to find
  // this morning's unlogged visit.
  getAppointmentsForDate: async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return TABLES.appointments.filter(a => a.status !== 'cancelled' && new Date(a.date) >= start && new Date(a.date) <= end);
  },
  getPhotosForCustomer: async () => []
};
global.ContactFeature = { open() {} };
global.OCRFeature = {};
global.NotificationService = { processTemplate: (t, v) => t.replace(/{{(\w+)}}/g, (_, k) => v[k] || '') };
global.Geo = {};

const now = new Date();
const iso = days => new Date(now.getTime() + days * 86400000).toISOString();
const isoAt = (days, h) => {
  const d = new Date(now.getTime() + days * 86400000);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

// Seed: 1 customer, quoted 5d ago, order placed 10d ago (balance due), visit today unlogged, visit tomorrow confirmed
TABLES.customers.push({ id: 1, firstName: 'Sarah', lastName: 'Johnson', phone: '07700 900123', fullName: 'Sarah Johnson', customerNumber: 'CUS-2026-0001' });
TABLES.appointments.push(
  { id: 11, customerId: 1, clientName: 'Sarah Johnson', type: 'consultation', outcome: 'quoted', value: 1250, status: 'completed', date: iso(-5) },
  { id: 12, customerId: 1, clientName: 'Sarah Johnson', type: 'fitting', outcome: null, status: 'confirmed', date: isoAt(0, 10) },
  { id: 13, customerId: 1, clientName: 'Sarah Johnson', type: 'consultation', outcome: null, status: 'confirmed', date: isoAt(1, 14) }
);
TABLES.orders.push({ id: 21, customerId: 1, appointmentId: 11, orderNumber: 'ORD-2026-0001', total: 1250, depositRequired: 625, depositPaid: 0, balanceDue: 1250, stage: 'ordered', createdAt: iso(-10) });
TABLES.measurements.push({ id: 31, appointmentId: 11, windowName: 'Lounge Bay', widthUsed: 2100, dropUsed: 1800, fittingType: 'recess' });
TABLES.communications.push({ id: 41, customerId: 1, type: 'whatsapp_attempted', content: 'Hi', sentAt: iso(-2) });

loadAll([
  `::raw::const AppointmentsFeature = {
    extractBuyingInterests: (appts) => {
      const m = {};
      for (const a of appts || []) if (a.buyingInterests) for (const k of a.buyingInterests) m[k] = (m[k] || 0) + 1;
      return m;
    },
    openEditCustomerModal() {}, captureCustomerPhoto() {}, confirmDeleteCustomer() {},
    getOutcomeName: (id) => id ? String(id).replace(/_/g, ' ') : '',
    openPhotoViewer() {}
  };`,
  'js/core/config.js',
  'js/core/utils.js',
  'js/features/talk/talk.js',
  'js/features/followups/followups.js',
  'js/features/orders/orders.js',
  'js/features/customer/customer.js'
]);

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('OK:', msg); };

(async () => {
  const Followups = global.App.features.get('followups');
  const Orders = global.App.features.get('orders');
  const Customer = global.App.features.get('customer');
  assert(!!Followups, 'FollowupsFeature registered');
  assert(!!Orders && !!Customer, 'Orders + Customer features registered');
  assert(Followups.route !== false && Orders.route !== false, 'Both are bottom-nav tabs');

  const tasks = await Followups.loadTasks();
  const kinds = tasks.map(t => t.kind).sort();
  assert(tasks.length === 4, `loadTasks returns 4 tasks (got ${tasks.length})`);
  assert(kinds.join(',') === ['payment', 'quote', 'visit_today', 'visit_tomorrow'].join(','), 'All four task kinds present');
  const due = tasks.filter(t => t.due);
  assert(due.length === 4, 'All four tasks are due');
  assert(tasks.find(t => t.kind === 'quote').template === 'follow_up.quote', 'Quote chase carries Talk template');
  assert(tasks.find(t => t.kind === 'payment').order.id === 21, 'Payment task references order');
  const count = await Followups.getDueCount();
  assert(count === 4, `getDueCount() === 4 (got ${count})`);

  // Orders: stage derivation — balanceDue <= 0 forces Paid column.
  TABLES.orders[0].balanceDue = 0;
  const countAfterPaid = await Followups.getDueCount();
  assert(countAfterPaid === 3, `Paid order drops out of the inbox (got ${countAfterPaid})`);

  // Customer profile renders without throwing (renderProfile returns HTML).
  const html = await Customer.renderProfile(1);
  assert(typeof html === 'string' && html.includes('Customer 360'), 'Customer 360 profile renders');
  assert(html.includes('Outstanding quotes (1)'), 'Outstanding quotes section present');
  assert(html.includes('ORD-2026-0001'), 'Order row present in profile');
  assert(html.includes('Lounge Bay'), 'Measurement row present in profile');
  assert(html.includes('Sarah Johnson'), 'Customer name present');
  assert(!html.includes('<script'), 'No raw script injection in profile');

  // Talk: buildAiContext feeds the AI the real facts (quote value, measured
  // windows, order/deposit figures, timings, history) — not generic filler.
  TABLES.orders[0].balanceDue = 1250; // restore what the paid-column check mutated
  const Talk = global.App.features.get('talk');
  const ctx = await Talk.buildAiContext({ customerId: 1, appointmentId: 11, templateKey: 'follow_up.quote' });
  assert(ctx.firstName === 'Sarah', 'Context carries first name');
  assert(ctx.daysSince === 5, `daysSince counted from visit (got ${ctx.daysSince})`);
  assert(ctx.quoteValue.includes('1,250'), 'Quote value reaches the context');
  assert(ctx.windowScope.includes('Lounge Bay'), 'Measured window reaches the context');
  assert(ctx.outcomeAction === 'Follow up on quote', 'Outcome action label reaches the context');
  assert(ctx.depositLabel === 'deposit' && ctx.depositAmount.includes('625'), 'Deposit figure reaches the context');
  assert(ctx.orderHistory.includes('due'), 'Order balance in history');
  assert(ctx.lastSentDaysAgo === 2, `Days since last message counted (got ${ctx.lastSentDaysAgo})`);
  assert(ctx.totalMessagesSent === 1, 'Message count reaches the context');
  assert(ctx.recentMessages.includes('Hi'), 'Recent message content in context');

  // Live ETA and running-late delay must survive into any AI draft.
  const ctxEta = await Talk.buildAiContext({ customerId: 1, appointmentId: 12, templateKey: 'on_my_way', extraVars: { eta: '9 minutes', delay: '15' } });
  assert(ctxEta.eta === '9 minutes' && ctxEta.delay === '15', 'Live ETA/delay thread into context');

  console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED');
})();
