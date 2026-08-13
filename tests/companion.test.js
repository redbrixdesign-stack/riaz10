// Smoke test for the Beelo companion (js/features/companion): intent
// routing, rule handlers (real data shaping), snapshot builder and the
// My Day panel bridge — all without a browser.
// Run: node tests/companion.test.js
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
global.DB = {
  db: { appointments: {} },
  getAppointmentsForDate: async () => APPOINTMENTS.filter(a => a.status !== 'cancelled'),
  getWeekStats: async () => ({ sales: 1250, earnings: 620, orderedCount: 2 }),
  getExpensesForPeriod: async () => [{ amount: 80.2 }, { amount: 65 }],
  getTripsForPeriod: async () => [{ distanceKm: 120 }, { distanceKm: 98 }],
  getUpcomingAppointments: async () => APPOINTMENTS.filter(a => a.status !== 'cancelled')
};

loadAll([
  'js/core/config.js',
  'js/core/utils.js',
  'js/features/companion/companion.js'
]);

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

  console.log(process.exitCode ? '\nCOMPANION TEST FAILED' : '\nCOMPANION TEST PASSED');
})();