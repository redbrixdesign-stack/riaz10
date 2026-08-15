// Smoke test for the Beelo companion (js/features/companion): intent
// routing, rule handlers (real data shaping), snapshot builder and the
// My Day panel bridge — all without a browser.
// Run: node tests/companion.test.js
'use strict';

const path = require('path');
const fs = require('fs');

function loadAll(entries, tailExpr) {
  const code = entries.map(e => e.startsWith('::raw::') ? e.slice(7) : fs.readFileSync(path.join(__dirname, '..', e), 'utf8')).join('\n;\n') + (tailExpr ? '\n' + tailExpr : '');
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
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const registered = [];
global.App = {
  features: new Map(),
  registerFeature(f) { registered.push(f); this.features.set(f.id, f); },
  navigate() {},
  closeModal() {},
  openModal() {},
  lastModal: null
};

// ---- Feature stubs (the handlers only read these) ----
global.FollowupsFeature = {
  loadTasks: async () => [],
  getDueCount: async () => 0
};
global.MoneyFeature = {
  getWeekEarnings: async () => 620,
  openExpenseModal() {},
  openRecordsModal() {}
};
global.TaxCalculator = {
  getRunningEstimate: async () => null,
  calculateMileageClaim: () => 27.4
};
global.WeatherService = {
  getTodayWeather: async () => ({ tempC: 17, icon: 'wb_sunny' })
};
global.RouteFeature = {
  getBasePoint: async () => ({ latLng: [53.4, -2.2] }),
  calculateLegKm: () => 7
};
global.Geo = { geocode: async () => ({ lat: 53.5, lng: -2.3 }) };
global.TalkFeature = { sendMessage() {} };
global.AppointmentsFeature = { navigateToVisit() {} };
global.AIService = { isEnabled: () => false, assistantTurn: async () => ({ ok: false, message: 'off' }) };
global.HomeScreenController = {
  renderDynamicHomeScreen() {},
  stopDynamicHomeScreen() {}
};

// ---- In-memory DB stub ----
const APPOINTMENTS = [];
const CUSTOMERS = [];
const ORDERS = [];
const MEASUREMENTS = [];
const COMMUNICATIONS = [];
const RANGE_APPTS = { appts: [] };
function makeTableStub(rows) {
  return {
    where: key => ({ equals: value => ({ toArray: async () => rows.filter(r => r[key] === value) }) }),
    get: async id => rows.find(r => r.id === id),
    bulkGet: async ids => rows.filter(r => ids.includes(r.id)),
    toArray: async () => rows
  };
}
global.DB = {
  db: {
    appointments: makeTableStub(APPOINTMENTS),
    customers: makeTableStub(CUSTOMERS),
    orders: makeTableStub(ORDERS),
    measurements: makeTableStub(MEASUREMENTS),
    communications: makeTableStub(COMMUNICATIONS)
  },
  getAppointmentsForDate: async () => APPOINTMENTS.filter(a => a.status !== 'cancelled'),
  getWeekStats: async () => ({ sales: 1250, earnings: 620, orderedCount: 2 }),
  getAppointmentsForRange: async () => RANGE_APPTS.appts.filter(a => a.status !== 'cancelled'),
  getExpensesForPeriod: async () => [{ amount: 80.2, category: 'fuel' }, { amount: 65, category: 'fuel' }],
  getTripsForPeriod: async () => [{ distanceKm: 120 }, { distanceKm: 98 }],
  getUpcomingAppointments: async () => APPOINTMENTS.filter(a => a.status !== 'cancelled')
};

global.Search = {
  search: async query => {
    const q = String(query || '').toLowerCase();
    return CUSTOMERS
      .filter(c => `${c.fullName || ''} ${c.firstName || ''}`.toLowerCase().includes(q))
      .map(c => ({ type: 'customer', id: c.id, title: c.fullName, subtitle: c.customerNumber, detail: '', data: c }));
  }
};

loadAll([
  'js/core/config.js',
  'js/core/utils.js',
  'js/features/companion/companion.js',
  'js/features/talk/talk.js'
], 'var utilsRef = Utils; var talkRef = TalkFeature;');

const assert = (cond, msg, extra) => { if (!cond) { console.error('FAIL:', msg, extra || ''); process.exitCode = 1; } else console.log('OK:', msg); };
const iso = days => new Date(Date.now() + days * 86400000).toISOString();

const Companion = global.App.features.get('companion');

// ---------- routing ----------
const norm = t => Companion.normalizeCommand(t);
assert(!!Companion, 'CompanionFeature registered');
assert(norm('money') === 'money', 'plain key routes');
assert(norm('Money & Tax') === 'money', 'alias "Money & Tax" routes to money');
assert(norm('follow ups') === 'follow-ups', 'alias "follow ups" routes');
assert(norm('what can you do') === 'help', 'help phrasing routes');
assert(norm('good morning') === 'greeting', 'greeting routes');
assert(norm('random gibberish 123') === 'default', 'unknown routes to default');
assert(norm('') === 'default', 'empty routes to default');

(async () => {
  // ---------- week handler ----------
  const week = await Companion.answerWeek();
  assert(week.facts.length === 4 && week.facts[0].value === '£620.00', 'Week facts carry earnings/sales/target/orders', week.facts);
  assert(week.text.includes('Target hit'), 'Week text celebrates the target');
  assert(week.suggestions.every(s => Companion.ALLOWED_SUGGESTIONS.includes(s)), 'Week suggestions whitelisted', week.suggestions);

  // ---------- money handler ----------
  const tax = { tax: { taxYear: { endYear: 2026 }, weeksToJan31: 14 }, taxDue: 1860, profit: 9000, effectiveRate: '18.5%', weeklySave: 40, incomeTax: 1200, class4NIC: 660, jan31: '£1,860', jul31: '£930', weeksLeft: 14 };
  global.TaxCalculator.getRunningEstimate = async () => tax;
  const money = await Companion.answerMoney();
  assert(money.facts.some(f => f.label === 'This week earned' && f.value === '£620.00'), 'Money facts carry week earnings');
  assert(money.facts.some(f => f.label === 'Expenses this month' && f.value === '£145.20'), 'Money facts carry month expenses');
  assert(money.facts.some(f => f.label === 'Tax estimate'), 'Money facts carry tax estimate');
  assert(money.actions.some(a => a.label === 'Open Money'), 'Money actions include Open Money');
  assert(money.actions.some(a => a.label === 'Log Expense'), 'Money actions include Log Expense');

  // ---------- today handler ----------
  const today = new Date();
  today.setHours(10, 0, 0, 0);
  const tomorrow = new Date();
  tomorrow.setHours(13, 30, 0, 0);
  APPOINTMENTS.push(
    { id: 1, clientName: 'Mrs Jones', type: 'consultation', date: today.toISOString(), address: '1 Elm Road', status: 'completed', outcome: 'ordered' },
    { id: 2, customerId: 2, clientName: 'Mr Patel', type: 'consultation', date: tomorrow.toISOString(), address: '2 Oak Road', status: 'confirmed' }
  );
  const day = await Companion.answerToday();
  assert(day.facts.some(f => f.label === 'Visits today' && f.value === '2'), 'Today facts carry visit count');
  assert(day.facts.some(f => f.label === 'Done' && f.value === '1'), 'Today facts carry done count');
  assert(day.facts.some(f => f.label === 'Next up' && f.value.includes('Mr Patel')), 'Today facts carry next visit');
  assert(day.text.includes('1 visit to go'), 'Today text names remaining visits', day.text);
  assert(day.actions.some(a => a.label === 'My Day calendar'), 'Today actions include My Day');

  // ---------- next visit handler ----------
  const nv = await Companion.answerNextVisit();
  assert(nv.facts.some(f => f.label === 'Next visit' && f.value.includes('Mr Patel')), 'Next visit names the customer');
  assert(nv.facts.some(f => f.label === 'Drive' && f.value === '12 min'), 'Next visit computes an ETA from the route model', nv.facts);
  assert(nv.actions.some(a => a.label === 'Draft morning message'), 'Next visit offers the morning message draft');

  // ---------- follow-ups handler ----------
  global.FollowupsFeature.loadTasks = async () => [
    { kind: 'quote', due: true, customer: { firstName: 'Sarah' }, appointment: { clientName: 'Sarah Jones' }, action: 'Follow up on quote' },
    { kind: 'post_fit', due: true, customer: { firstName: 'Sarah' }, appointment: { clientName: 'Sarah Jones' }, action: 'Post-fit thank-you — not sent yet' },
    { kind: 'visit_tomorrow', due: false, customer: null, appointment: null, action: 'x' }
  ];
  const fu = await Companion.answerFollowUps();
  assert(fu.text.includes('2 things due today'), 'Follow-ups text counts due items', fu.text);
  assert(fu.facts.length === 2 && fu.facts[0].label === 'Sarah', 'Follow-ups facts list due customers');
  assert(fu.facts[1].value === 'Post-fit thank-you', 'Follow-up action text is trimmed of the not-sent suffix', fu.facts[1].value);
  assert(fu.actions.some(a => a.label === 'Open Follow-ups'), 'Follow-ups action present');

  // ---------- greeting + help + default ----------
  global.FollowupsFeature.getDueCount = async () => 1;
  const greet = await Companion.answerGreeting();
  assert(greet.text.includes('1 thing due today'), 'Greeting mentions the due count', greet.text);
  const help = await Companion.answerHelp();
  assert(help.suggestions.length >= 5, 'Help suggests the commands');
  const def = Companion.answerDefault();
  assert(def.text.includes("can't look that up"), 'Default answer is honest about limits');
  assert([greet, help, def].every(a => a.suggestions.every(s => Companion.ALLOWED_SUGGESTIONS.includes(s))), 'All rule suggestions stay in the whitelist');

  // ---------- snapshot ----------
  const snap = await Companion.buildSnapshot();
  assert(Array.isArray(snap.today.visits) && snap.today.visits.length === 2, 'Snapshot carries today visits');
  assert(snap.today.visits[0].name === 'Mrs Jones' && snap.today.visits[0].time, 'Snapshot visit rows carry name/time');
  assert(snap.week.earnings === 620 && typeof snap.week.target === 'number' && snap.week.target > 0, 'Snapshot carries week figures');
  assert(snap.month.expenses_total === 145.2 && snap.month.mileage_km === 218, 'Snapshot carries month money');
  assert(snap.follow_ups_due.length === 2 && snap.follow_ups_due[0].customer === 'Sarah', 'Snapshot carries due follow-ups');
  assert(snap.weather.temp_c === 17 && snap.weather.condition === 'wb_sunny', 'Snapshot carries weather');

  // ---------- my day panel ----------
  let opened = false;
  global.App.openModal = () => { opened = true; };
  let mounted = '';
  global.HomeScreenController.renderDynamicHomeScreen = id => { mounted = id; };
  Companion.openMyDay();
  assert(opened && mounted === 'companion-myday-root', 'My Day opens the weekly calendar panel in a modal');

  // ---------- deep rules: a booking far out must be findable ----------
  CUSTOMERS.push(
    { id: 1, firstName: 'Sarah', lastName: 'Jones', fullName: 'Sarah Jones', phone: '07123456789', customerNumber: 'CUS-2026-0001', address: { line1: '5 Beech Road' } },
    { id: 3, firstName: 'Amelia', lastName: 'Green', fullName: 'Amelia Green', phone: '07700900123', customerNumber: 'CUS-2026-0003', address: { line1: '9 Birch Lane' } }
  );
  ORDERS.push(
    { id: 1, customerId: 1, orderNumber: 'ORD-2026-0001', total: 900, balanceDue: 300, status: 'ordered', stage: 'fitted' },
    { id: 2, customerId: null, orderNumber: 'ORD-2026-0002', total: 120, balanceDue: 0, status: 'paid', stage: 'paid' }
  );
  const aug24 = new Date();
  aug24.setDate(aug24.getDate() + 10);
  aug24.setHours(14, 0, 0, 0);
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 20);
  // The reported bug: a booking ten days out, created today.
  APPOINTMENTS.push({ id: 3, customerId: 3, clientName: 'Amelia Green', phone: '07700900123', type: 'consultation', date: aug24.toISOString(), address: '9 Birch Lane', status: 'confirmed' });
  APPOINTMENTS.push({ id: 4, customerId: 1, clientName: 'Sarah Jones', type: 'consultation', date: pastDate.toISOString(), address: '5 Beech Road', status: 'completed', outcome: 'ordered' });
  APPOINTMENTS.push({ id: 5, customerId: 1, clientName: 'Sarah Jones', phone: '07123456789', type: 'consultation', date: iso(30), address: '5 Beech Road', status: 'confirmed' });

  assert(norm('messages') === 'messages', '"messages" routes to the message rule');
  assert(norm('who hasn\'t paid') === 'orders', '"who hasn\'t paid" routes to orders');
  const june = Companion.extractPeriod('how much in june?');
  assert(june && /^June/.test(june.label) && new Date(june.start).getMonth() === 5, 'Period extractor finds "june"', june);
  assert(Companion.extractPeriod('hello world') === null, 'Period extractor ignores non-period text');
  const tomorrowRange = Companion.extractDayRange('something tomorrow?');
  assert(tomorrowRange && /^Tomorrow/.test(tomorrowRange.label), 'Day extractor finds "tomorrow"', tomorrowRange);

  // Messages rule: the 10-day-out booking owes an intro and must surface.
  const chipsWarm = await Companion.buildWelcomeChips();
  assert(chipsWarm.some(c => c[3] === 'next visit') && chipsWarm.some(c => c[3] === 'messages'), 'Welcome chips are live: next visit + intro owed', chipsWarm);
  const msgs = await Companion.answerMessages();
  assert(msgs.text.includes('owe a message'), 'Messages rule names the owed booking', msgs.text);
  assert(msgs.facts.some(f => f.label.includes('Amelia Green') && f.value === 'Intro — not sent'), 'Messages rule reports intro-not-sent with the date', msgs.facts);
  APPOINTMENTS[2].introSent = true;
  const msgs2 = await Companion.answerMessages();
  assert(!msgs2.facts.some(f => f.label.includes('Amelia Green')), 'Messages rule clears a customer once the intro is sent', msgs2.facts);

  // Person lookup.
  const person = await Companion.answerPerson('what about sarah?');
  assert(person && person.facts.some(f => f.label === 'Next visit' && String(f.value).includes('Sep') || String(f.value).includes('Aug')),
    'Person lookup carries the next visit', person && person.facts);
  assert(person.facts.some(f => f.label === 'Outstanding' && f.value === '£300.00'), 'Person lookup carries outstanding balance', person.facts);
  assert(person.actions.some(a => a.label === 'Draft intro'), 'Person lookup offers the intro draft', person.actions);
  assert((await Companion.answerPerson('zzz nobody')) === null, 'Person lookup with no match returns null');
  CUSTOMERS.push({ id: 4, firstName: 'Sarah', lastName: 'Smith', fullName: 'Sarah Smith', customerNumber: 'CUS-2026-0004' });
  const multi = await Companion.answerPerson('sarah');
  assert(multi && multi.text.includes('people match'), 'Person lookup offers a picker for multiple matches', multi && multi.text);

  // Orders: unpaid sweep + order-number lookup.
  const unpaid = await Companion.answerOrders();
  assert(unpaid.text.includes('still owe £300.00') && unpaid.facts.length === 1, 'Unpaid sweep lists the outstanding order', unpaid.text);
  const byNum = await Companion.answerOrders('ORD-2026-0001');
  assert(byNum.facts.some(f => f.label === 'Balance due' && f.value === '£300.00'), 'Order-number lookup shows balance due', byNum.facts);

  // Money periods: earnings from real-range appointments, whole-day bounds.
  RANGE_APPTS.appts = [{ id: 99, customerId: 1, clientName: 'Sarah Jones', type: 'consultation', date: iso(5).slice(0, 10) + 'T09:00:00.000Z', status: 'completed', outcome: 'ordered', value: 500, commission: 250 }];
  global.DB.getWeekStats = async (start, end) => {
    // Faithful to DB.getWeekStats: ordered, non-cancelled, within [start, end].
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const appts = RANGE_APPTS.appts.filter(a => {
      if (a.status === 'cancelled' || a.outcome !== 'ordered') return false;
      const t = new Date(a.date).getTime();
      return t >= s && t <= e;
    });
    return {
      sales: appts.reduce((sum, a) => sum + (a.value || 0), 0),
      earnings: appts.reduce((sum, a) => sum + (typeof a.commission === 'number' && a.commission > 0 ? a.commission : 0), 0),
      orderedCount: appts.length
    };
  };
  const juneMoney = await Companion.answerMoneyPeriod({ label: 'June 2026', start: iso(5), end: iso(40) });
  assert(juneMoney.facts.some(f => f.label === 'Earned' && f.value === '£250.00'), 'Money period carries earned commission', juneMoney.facts);
  assert(juneMoney.facts.some(f => f.label === 'Sales value' && f.value === '£500.00'), 'Money period carries sales value', juneMoney.facts);
  assert(juneMoney.facts.some(f => f.label === 'Top expenses' && f.value.includes('fuel £145.20')), 'Money period breaks expenses into top categories', juneMoney.facts);

  // Date questions: tomorrow.
  RANGE_APPTS.appts = [{ id: 2, customerId: 2, clientName: 'Mr Patel', date: iso(1), status: 'confirmed' }];
  const when = await Companion.answerWhen({ start: iso(1), end: iso(2), label: 'Tomorrow' });
  assert(when.text.includes('1 visit tomorrow'), 'Date rule counts tomorrow visits', when.text);
  RANGE_APPTS.appts = [];
  const whenEmpty = await Companion.answerWhen({ start: iso(1), end: iso(2), label: 'Tomorrow' });
  assert(whenEmpty.text.includes('Nothing booked'), 'Date rule handles an empty day', whenEmpty.text);

  // Follow-ups filtered by kind.
  const fq = await Companion.answerFollowUps('who needs a quote chase');
  assert(fq.facts.length === 1 && fq.facts[0].label === 'Sarah', 'Follow-ups filter by kind (quotes)', fq.facts);

  // ---------- AI data minimisation ----------
  // Whatever goes to Claude must not carry the customer's most sensitive
  // fields (street address, postcode, lead source) — a chat reply or a
  // customer-facing draft has no use for them, so they stay on-device.
  const snapMin = await Companion.buildSnapshot();
  assert(snapMin.today.visits.every(v => !('address' in v)), 'Snapshot visits carry no street addresses', snapMin.today.visits[0]);
  assert(snapMin.today.visits[0].time === global.utilsRef.formatTimeUK(APPOINTMENTS[0].date), 'Snapshot visit times are UK wall-clock', { got: snapMin.today.visits[0].time });
  assert(snapMin.today.date === global.utilsRef.formatDateUK(new Date(), 'iso'), 'Snapshot date is the UK calendar day', snapMin.today.date);

  // Sarah Jones (id 1) has an address in the DB; her appointment (id 5)
  // has one too — neither may reach the draft context.
  const ctx = await global.talkRef.buildAiContext({ customerId: 1, appointmentId: 5, templateKey: 'follow_up.gentle' });
  assert(!('visitAddress' in ctx) && !('customerArea' in ctx) && !('leadSource' in ctx), 'Draft context carries no address/postcode/lead source', Object.keys(ctx));
  assert(ctx.customerName === 'Sarah Jones' && typeof ctx.quoteValue === 'string', 'Draft context keeps name + quote value', ctx.customerName);
  assert(ctx.orderHistory.includes('Order history: 1 order(s)'), 'Draft context keeps the order summary', ctx.orderHistory);

  console.log(process.exitCode ? '\nCOMPANION TEST FAILED' : '\nCOMPANION TEST PASSED');
})();