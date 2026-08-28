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
  openModal() {},
  actionAttrs(callString) {
    const s = String(callString || '').trim();
    if (!s || s.includes(';')) return '';
    const m = s.match(/^([A-Za-z_][\w.]*)\((.*)\)$/s);
    if (!m) return '';
    const objpath = m[1];
    const arglist = m[2].trim();
    const KNOWN = ['App', 'AppointmentsFeature', 'SettingsFeature', 'MoneyFeature', 'TalkFeature', 'MeasureFeature', 'OnboardingFeature', 'RouteFeature', 'OrdersFeature', 'ContactFeature', 'HomeScreenController', 'CompanionFeature', 'ExportService', 'OCRFeature', 'ControlFeature', 'TodayFeature', 'Geo', 'CustomerFeature'];
    if (!KNOWN.includes(objpath.split('.')[0])) return '';
    let jsonArgs = arglist.replace(/'([^']*)'/g, '"$1"');
    if (jsonArgs === '') return `data-action="${objpath}"`;
    return `data-action="${objpath}" data-args='${jsonArgs}'`;
  },
  renderTopHeader({ title = '', showBack = false, backHref = '#today', actions = '' } = {}) {
    let leftHtml = '';
    if (showBack && title) {
      leftHtml = `<button class="btn btn-ghost btn-sm" onclick="App.navigate('${backHref}')"><span class="material-symbols-rounded">arrow_back</span></button><h1 class="page-heading">${title}</h1>`;
    } else if (showBack) {
      leftHtml = `<button class="btn btn-ghost btn-sm" onclick="App.navigate('${backHref}')"><span class="material-symbols-rounded">arrow_back</span></button>`;
    } else if (title) {
      leftHtml = `<h1 class="page-heading">${title}</h1>`;
    }
    return `
      <div class="top-header">
        <div class="flex items-center gap-md" style="flex:1;">${leftHtml}</div>
        <div class="header-actions flex items-center gap-sm">${actions}</div>
      </div>`;
  }
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
  // Mirrors the real DB: the day window is the appointment's UK calendar
  // day [UK midnight, +24h) — the app's date contract everywhere — not the
  // device-local day, or a UTC+X device seeds/reads a different "today".
  getAppointmentsForDate: async () => {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const parts = {};
    for (const x of fmt.formatToParts(new Date())) if (x.type !== 'literal') parts[x.type] = parseInt(x.value, 10);
    const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const g = {};
    for (const x of fmt.formatToParts(guess)) if (x.type !== 'literal') g[x.type] = parseInt(x.value, 10);
    const start = new Date(guess.getTime() - (g.hour * 3600 + g.minute * 60 + g.second) * 1000);
    const end = new Date(start.getTime() + 86400000);
    return TABLES.appointments.filter(a => a.status !== 'cancelled' && new Date(a.date) >= start && new Date(a.date) < end);
  },
  getPhotosForCustomer: async () => [],
  getCustomer: async id => TABLES.customers.find(c => c.id === id) || null,
  getCustomersByIds: async ids => TABLES.customers.filter(c => ids.includes(c.id)),
  findCustomerByPhone: async phone => TABLES.customers.find(c => c.phone === phone) || null,
  getAppointment: async id => TABLES.appointments.find(a => a.id === id) || null,
  getAllAppointments: async () => TABLES.appointments,
  getAppointmentsByCustomer: async customerId => TABLES.appointments.filter(a => a.customerId === customerId)
};
global.ContactFeature = { open() {} };
global.OCRFeature = {};
global.NotificationService = { processTemplate: (t, v) => t.replace(/{{(\w+)}}/g, (_, k) => v[k] || '') };
global.AIService = { isEnabled: () => false, draftMessage: async () => ({ ok: false, message: 'off' }) };
global.Geo = {};

const now = new Date();
const iso = days => new Date(now.getTime() + days * 86400000).toISOString();

// UK calendar-day seeding (followups/talk match days via Utils.ukParts, the
// UK wall clock — not the device's local day). Near UK midnight on a non-UK
// device, "today" in device time is a different UK day, so seeding appts
// with device-local setHours made visit_today/visit_tomorrow vanish under
// TZ=UTC (the UK day was a day ahead). These helpers build an instant at
// `hour` UK wall-clock on the UK calendar day (today + offset), so the UK
// day always lines up with followups' todayKey/tomorrowKey.
const ukFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const ukPartsOf = d => { const p = {}; for (const x of ukFmt.formatToParts(d)) if (x.type !== 'literal') p[x.type] = parseInt(x.value, 10); return p; };
const ukMidnight = (year, month, day) => {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const p = ukPartsOf(guess);
  return new Date(guess.getTime() - (p.hour * 3600 + p.minute * 60 + p.second) * 1000);
};
const ukDay = (offsetDays, hour) => {
  const p = ukPartsOf(new Date());
  const base = ukMidnight(p.year, p.month, p.day);
  base.setDate(base.getDate() + offsetDays);
  base.setTime(base.getTime() + hour * 3600000);
  return base.toISOString();
};

// Seed: 1 customer, quoted 5d ago, order placed 10d ago (balance due), visit today unlogged, visit tomorrow confirmed
TABLES.customers.push({ id: 1, firstName: 'Sarah', lastName: 'Johnson', phone: '07700 900123', fullName: 'Sarah Johnson', customerNumber: 'CUS-2026-0001' });
TABLES.appointments.push(
  { id: 11, customerId: 1, clientName: 'Sarah Johnson', type: 'consultation', outcome: 'quoted', value: 1250, status: 'completed', date: iso(-5) },
  // Today's unlogged visit at 00:00 UK: still "today" for the follow-ups
  // visit_today task (UK day matches), but always a past visit from the
  // message-context's point of view — a midday time would make
  // customer_visit_count flip as the day goes on.
  { id: 12, customerId: 1, clientName: 'Sarah Johnson', type: 'fitting', outcome: null, status: 'confirmed', date: ukDay(0, 0) },
  { id: 13, customerId: 1, clientName: 'Sarah Johnson', type: 'consultation', outcome: null, status: 'confirmed', date: ukDay(1, 14) }
);
TABLES.orders.push({ id: 21, customerId: 1, appointmentId: 11, orderNumber: 'ORD-2026-0001', total: 1250, depositRequired: 625, depositPaid: 0, balanceDue: 1250, stage: 'ordered', createdAt: iso(-10) });
TABLES.measurements.push({ id: 31, appointmentId: 11, windowName: 'Lounge Bay', widthUsed: 2100, dropUsed: 1800, fittingType: 'recess' });
// The message context counts windows from PRIOR visits (the current one is
// excluded), so today's visit carries its own measurement.
TABLES.measurements.push({ id: 32, appointmentId: 12, windowName: 'Lounge Bay', widthUsed: 2100, dropUsed: 1800, fittingType: 'recess' });
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
  'js/services/voice-notes.js',
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

  // Communication spec: buildMessageContext produces the snake_case
  // message_context from REAL data (first-visit, visit count, windows,
  // order, outcome, history) and maps templates onto the spec stages.
  const mctx = await Talk.buildMessageContext({ customerId: 1, appointmentId: 11, templateKey: 'follow_up.quote' });
  assert(mctx.customer_name === 'Sarah', 'Spec context carries customer first name');
  assert(mctx.customer_is_first_visit_at_address === false && mctx.customer_visit_count === 1, 'Repeat customer flagged with correct visit count');
  assert(mctx.blind_count === 1 && mctx.window_history_summary.includes('Lounge Bay'), 'Window history + blind count in spec context');
  assert(mctx.stage === 'outcome_needs_to_think', 'follow_up.* maps to outcome_needs_to_think stage');
  assert(mctx.outcome === 'quoted' && mctx.outcome_label === 'Quoted', 'Outcome + label reach the spec context');
  assert(mctx.quote_amount.includes('1,250'), 'Quote amount in spec context');
  assert(mctx.order_summary.includes('ORD-2026-0001') && mctx.order_summary.includes('deposit'), 'Order summary in spec context');
  assert(mctx.days_since_last_visit === 5, 'days_since_last_visit counted');
  assert(mctx.recent_messages.some(m => m.includes('Hi')) && mctx.total_messages_sent === 1, 'Message history in spec context');
  assert(mctx.template_key === 'follow_up.quote' && mctx.template_text.includes('quote'), 'Template key/text in spec context');

  // Parking/access convention: "Access: …" lines folded into visit notes
  // surface as structured fields (appointments.js folds them in).
  const noteAppt = TABLES.appointments.find(a => a.id === 11);
  noteAppt.notes = 'Parking: side street near the gate\nAccess: side gate, please keep the dog inside';
  const mctxNotes = await Talk.buildMessageContext({ customerId: 1, appointmentId: 11, templateKey: 'follow_up.quote' });
  assert(mctxNotes.access_notes === 'side gate, please keep the dog inside', 'Access note parsed from the convention');
  assert(mctxNotes.parking_notes === 'side street near the gate', 'Parking note parsed from the convention');
  assert(Talk._parseNoteField('', 'access') === '', 'Empty notes yield empty field');

  // First-time customer: flag flips, stage follows the template.
  TABLES.customers.push({ id: 2, firstName: 'David', lastName: 'Lee', phone: '07700 900456', fullName: 'David Lee' });
  TABLES.appointments.push({ id: 14, customerId: 2, clientName: 'David Lee', type: 'consultation', outcome: null, status: 'confirmed', date: ukDay(2, 9) });
  const mctxNew = await Talk.buildMessageContext({ customerId: 2, appointmentId: 14, templateKey: 'pre_intro' });
  assert(mctxNew.customer_is_first_visit_at_address === true && mctxNew.customer_visit_count === 0, 'First-time customer flagged');
  assert(mctxNew.stage === 'pre_intro', 'pre_intro template maps to pre_intro stage');
  assert(Talk.stageForTemplateKey('day_before') === 'day_before' && Talk.stageForTemplateKey('evening_before') === 'day_before', 'Reminder stages map');
  assert(Talk.stageForTemplateKey('on_my_way') === 'on_the_way' && Talk.stageForTemplateKey('running_late') === 'late', 'ETA stages map');

  // Follow-ups: intro task for the first-time customer (auto-due), and
  // post-fit / service tasks from fitting/service_call outcomes — each
  // dropping out once its send flag is set.
  let tasksSpec = await Followups.loadTasks();
  const introTask = tasksSpec.find(t => t.kind === 'intro');
  assert(!!introTask && introTask.template === 'pre_intro' && introTask.due && introTask.appointment.id === 14, 'Intro task auto-due for first-time customer');
  assert(!tasksSpec.find(t => t.kind === 'post_fit'), 'No post-fit task without a completed fitting');

  TABLES.appointments.push(
    { id: 15, customerId: 1, clientName: 'Sarah Johnson', type: 'fitting', outcome: 'completed', status: 'completed', date: iso(-2) },
    { id: 16, customerId: 1, clientName: 'Sarah Johnson', type: 'service_call', outcome: 'parts_needed', status: 'completed', date: iso(-1) }
  );
  tasksSpec = await Followups.loadTasks();
  const pfTask = tasksSpec.find(t => t.kind === 'post_fit');
  const svcTask = tasksSpec.find(t => t.kind === 'service');
  assert(!!pfTask && pfTask.template === 'post_fit_followup', 'Post-fit task for completed fitting');
  assert(!!svcTask && svcTask.template === 'service_or_issue_followup' && svcTask.priority === 'high', 'Service task for parts_needed, high priority');

  TABLES.appointments.find(a => a.id === 15).postFitSent = true;
  TABLES.appointments.find(a => a.id === 16).serviceSent = true;
  tasksSpec = await Followups.loadTasks();
  assert(!tasksSpec.find(t => t.kind === 'post_fit') && !tasksSpec.find(t => t.kind === 'service'), 'Send flags remove post-fit + service tasks');

  // Preview sheet v2: carries the facts, history and outcome alternatives so
  // the advisor composes with context, not in a vacuum.
  global.App.lastModal = null;
  const prevOpenModal = global.App.openModal;
  global.App.openModal = html => { global.App.lastModal = html; };
  await Talk.openPreviewSheet('Hi Sarah, the quoting thing', { customerId: 1, appointmentId: 11, phone: '07700 900123', templateKey: 'follow_up.quote' });
  const sheet = global.App.lastModal || '';
  global.App.openModal = prevOpenModal;
  assert(sheet.includes('Quote £1,250.00'), 'Sheet shows the quote amount');
  assert(sheet.includes('Lounge Bay'), 'Sheet shows the measured window');
  assert(sheet.includes('Visited 5d ago'), 'Sheet shows days since visit');
  assert(sheet.includes('Previously sent') && sheet.includes('Hi'), 'Sheet shows recent message history');
  assert(!sheet.includes('duplicate nudge'), 'No duplicate warning at 2 days since last message');
  assert(sheet.includes('Gentle follow-up') && sheet.includes('Consider controlled discount'), 'Outcome alternatives offered for quoted');

  console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED');
})();
