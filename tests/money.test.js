const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const Dexie = require('dexie');

const REPO = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function loadScript(sandbox, rel, expr) {
  let src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  if (expr) src += '\n' + expr;
  return vm.runInContext(src, sandbox);
}

function makeLocalStorage() {
  const store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
  };
}

function baseSandbox(extra) {
  const sandbox = {
    indexedDB,
    IDBKeyRange,
    localStorage: makeLocalStorage(),
    console, Math, JSON, Date, Promise, Map, Set, Array, Object,
    Number, String, Boolean, RegExp, Error, parseInt, parseFloat,
    isNaN, isFinite, setTimeout, clearTimeout,
    App: { calculateDeposit: total => ({ amount: Math.round(total * 0.2) }) },
    window: {}
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  return sandbox;
}

function loadDbJs(sandbox, dbName) {
  let src = fs.readFileSync(path.join(REPO, 'js/core/db.js'), 'utf8');
  if (dbName) src = src.replace("new Dexie('advisoros_v6')", `new Dexie('${dbName}')`);
  return vm.runInContext(src + '\nDB;', sandbox);
}

// ---------- Section A: pure calculator sandbox (CONFIG + Utils + Tax) ----------

function calcSandbox() {
  const sandbox = baseSandbox();
  const CONFIG = loadScript(sandbox, 'js/core/config.js', 'CONFIG;');
  const Utils = loadScript(sandbox, 'js/core/utils.js', 'Utils;');
  const Tax = loadScript(sandbox, 'js/core/tax.js', 'TaxCalculator;');
  return { sandbox, CONFIG, Utils, Tax };
}

async function sectionA() {
  const { sandbox, CONFIG, Utils, Tax } = calcSandbox();

  // Tax-year boundary: the cutover is April 6, checked in UK wall clock.
  const withUK = parts => {
    const prev = Utils.ukParts;
    Utils.ukParts = () => parts;
    const year = Tax.getCurrentTaxYear();
    Utils.ukParts = prev;
    return year;
  };
  ok('tax year: April 5 is previous year', JSON.stringify(withUK({ year: 2026, month: 4, day: 5 })) === JSON.stringify({ startYear: 2025, endYear: 2026, label: '2025-26' }), withUK({ year: 2026, month: 4, day: 5 }));
  ok('tax year: April 6 is new year', withUK({ year: 2026, month: 4, day: 6 }).label === '2026-27', withUK({ year: 2026, month: 4, day: 6 }));
  ok('tax year: January is previous-year start', withUK({ year: 2027, month: 1, day: 15 }).label === '2026-27', withUK({ year: 2027, month: 1, day: 15 }));

  // Zero income, negative profit, zero expenses.
  const zero = Tax.calculate(0);
  ok('calculate: zero profit -> all zeros', zero.incomeTax === 0 && zero.class4NIC === 0 && zero.totalLiability === 0 && zero.amountDueJan31 === 0 && zero.recommendedWeeklySave === 0 && zero.effectiveRate === 0, zero);
  const neg = Tax.calculate(-5000);
  ok('calculate: negative profit -> no liability', neg.incomeTax === 0 && neg.class4NIC === 0 && neg.totalLiability === 0, neg);

  // Tax bands are WIDTHS (documented in config.js): 0-37700 @20%, 37700-112570 @40%, rest @45%.
  const banded = Tax.calculate(90000);
  ok('calculate: taxable profit after allowance', banded.personalAllowance === 12570 && banded.taxableProfit === 77430, banded);
  const expectedTax = 37700 * 0.20 + 39730 * 0.40; // 7540 + 15892 = 23432
  ok('calculate: widths produce 23432 at 77430 taxable', Math.abs(banded.incomeTax - expectedTax) < 1e-9, banded.incomeTax);
  ok('calculate: total liability = incomeTax + class4NIC', Math.abs(banded.totalLiability - (banded.incomeTax + banded.class4NIC)) < 1e-9, banded.totalLiability);
  const high = Tax.calculate(130000);
  const expectedHigh = 37700 * 0.20 + 74870 * 0.40 + 17430 * 0.45; // allowance fully tapered: taxable = 130000
  ok('calculate: 45% band applies above 112570 taxable', Math.abs(high.incomeTax - expectedHigh) < 1e-9, high.incomeTax);

  // Personal allowance taper: £1 for every £2 above £100,000.
  const tapered = Tax.calculate(110000);
  ok('calculate: allowance tapers above 100k', tapered.personalAllowance === 7570, tapered.personalAllowance);

  // Class 4 NIC: 6% on 12570-50270, 2% above.
  const nic = Tax.calculate(60000);
  const expectedNIC = 37700 * 0.06 + 9730 * 0.02; // 2262 + 194.6 = 2456.6
  ok('calculate: class 4 NIC 2456.6 at 60000 profit', Math.abs(nic.class4NIC - expectedNIC) < 1e-9, nic.class4NIC);

  // Payment on account: due dates, amounts, first year.
  const poa = Tax.calculate(30000, { taxYear: { startYear: 2025, endYear: 2026 }, firstYear: false });
  ok('POA: jan 31 of year after tax year end', poa.dueDates.jan31.getFullYear() === 2027 && poa.dueDates.jan31.getMonth() === 0 && poa.dueDates.jan31.getDate() === 31, poa.dueDates);
  ok('POA: jul 31 of year after tax year end', poa.dueDates.jul31.getFullYear() === 2027 && poa.dueDates.jul31.getMonth() === 6 && poa.dueDates.jul31.getDate() === 31, poa.dueDates);
  ok('POA: non-first-year splits 1.5x / 0.5x', Math.abs(poa.amountDueJan31 - poa.totalLiability * 1.5) < 1e-9 && Math.abs(poa.amountDueJul31 - poa.totalLiability * 0.5) < 1e-9, poa);
  const firstYear = Tax.calculate(30000, { taxYear: { startYear: 2025, endYear: 2026 }, firstYear: true });
  ok('POA: first year has no July instalment', firstYear.amountDueJul31 === 0 && Math.abs(firstYear.amountDueJan31 - firstYear.totalLiability) < 1e-9, firstYear);
  ok('POA: weekly saving recommendation is finite and positive', poa.recommendedWeeklySave > 0 && poa.weeksToJan31 >= 1, poa);

  // estimateCommission: all config shapes, negative/invalid values, rate clamps.
  const setCommission = c => { CONFIG.commission = c; };
  setCommission({ mode: 'two_stage', saleReductionRate: 20, netCommissionRate: 15.25 });
  ok('commission: two_stage 20%/15.25% on 2000 -> 244', Math.abs(Tax.estimateCommission(2000) - 244) < 1e-9, Tax.estimateCommission(2000));
  setCommission({ mode: 'simple', simpleRate: 10 });
  ok('commission: simple 10% on 1500 -> 150', Tax.estimateCommission(1500) === 150, Tax.estimateCommission(1500));
  setCommission({ type: 'percentage', rate: 10 });
  ok('commission: legacy percentage 10% on 1500 -> 150', Tax.estimateCommission(1500) === 150, Tax.estimateCommission(1500));
  setCommission({});
  ok('commission: no config -> full sale value', Tax.estimateCommission(1234) === 1234, Tax.estimateCommission(1234));
  ok('commission: zero value -> 0', Tax.estimateCommission(0) === 0, Tax.estimateCommission(0));
  ok('commission: negative value -> 0', Tax.estimateCommission(-500) === 0, Tax.estimateCommission(-500));
  ok('commission: NaN value -> 0', Tax.estimateCommission(NaN) === 0, Tax.estimateCommission(NaN));
  setCommission({ mode: 'two_stage', saleReductionRate: 20, netCommissionRate: -15 });
  ok('commission: negative rate clamped to 0', Tax.estimateCommission(2000) === 0, Tax.estimateCommission(2000));
  setCommission({ mode: 'simple', simpleRate: 15 });
  ok('commission: estimate matches effective rate', Math.abs(Tax.estimateCommission(1000) - 1000 * Tax.getEffectiveCommissionRate()) < 1e-9, Tax.getEffectiveCommissionRate());

  // getRequiredWeeklySales: target derivation + invalid inputs.
  setCommission({ mode: 'simple', simpleRate: 15 });
  ok('sales target: 600 earnings at 15% -> 4000', Math.abs(Tax.getRequiredWeeklySales(600) - 4000) < 1e-9, Tax.getRequiredWeeklySales(600));
  ok('sales target: zero target -> 0', Tax.getRequiredWeeklySales(0) === 0, Tax.getRequiredWeeklySales(0));
  ok('sales target: negative target -> 0', Tax.getRequiredWeeklySales(-100) === 0, Tax.getRequiredWeeklySales(-100));
  setCommission({});
  ok('sales target: zero effective rate -> 0', Tax.getRequiredWeeklySales(600) === 0, Tax.getRequiredWeeklySales(600));

  // Mileage: 0.45/mile up to 10,000 miles (HMRC approved car rate), 0.25
  // above; negatives clamp. The 0.55 default was corrected to 0.45 — a 55p
  // first band overclaimed the relief by 22%, understating the tax bill.
  ok('mileage: zero km -> 0', Tax.calculateMileageClaim(0) === 0, Tax.calculateMileageClaim(0));
  ok('mileage: negative km -> 0', Tax.calculateMileageClaim(-100) === 0, Tax.calculateMileageClaim(-100));
  const exactly = Tax.calculateMileageClaim(10000 / 0.621371);
  ok('mileage: exactly 10,000 miles -> 4500', Math.abs(exactly - 4500) < 0.01, exactly);
  const above = Tax.calculateMileageClaim(18000);
  const miles = 18000 * 0.621371;
  const expectedAbove = 10000 * 0.45 + (miles - 10000) * 0.25;
  ok('mileage: above 10,000 miles uses second band', Math.abs(above - expectedAbove) < 0.01, above);

  // UK-midnight instants: hard legal boundaries (the April 6 tax-year
  // cutover) must be anchored to the UK clock, not the device timezone.
  const apr6 = Utils.ukMidnightInstant(2026, 4, 6);
  ok('ukMidnightInstant: 6 Apr 2026 (BST) is 2026-04-05T23:00:00Z', apr6.toISOString() === '2026-04-05T23:00:00.000Z', apr6.toISOString());
  const jan6 = Utils.ukMidnightInstant(2027, 1, 6);
  ok('ukMidnightInstant: 6 Jan 2027 (GMT) is 2027-01-06T00:00:00Z', jan6.toISOString() === '2027-01-06T00:00:00.000Z', jan6.toISOString());
  const dstDay = Utils.ukMidnightInstant(2026, 10, 25); // autumn jump day
  ok('ukMidnightInstant: the DST jump day still starts at 23:00Z', dstDay.toISOString() === '2026-10-24T23:00:00.000Z', dstDay.toISOString());
  const p6 = Utils.ukParts(apr6);
  const p6round = Utils.ukParts(new Date(apr6.getTime() + 3600e3)); // one hour later
  ok('ukMidnightInstant: UK day fields resolve to the boundary day', p6.hour === 0 && p6.year === 2026 && p6.month === 4 && p6.day === 6, p6);
  ok('ukMidnightInstant: the next hour is still the same UK day', p6round.hour === 1 && p6round.day === 6, p6round);
}

// ---------- Section B: DB-backed stats (real Dexie + real TaxCalculator) ----------

async function sectionB() {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  const sandbox = baseSandbox({ Dexie });
  const CONFIG = loadScript(sandbox, 'js/core/config.js', 'CONFIG;');
  loadScript(sandbox, 'js/core/utils.js', 'Utils;');
  const Tax = loadScript(sandbox, 'js/core/tax.js', 'TaxCalculator;');
  const DB = loadDbJs(sandbox, 'advisoros_money_test');
  await DB.init();

  const iso = (y, m, d, h) => new Date(y, m - 1, d, h === undefined ? 12 : h, 0, 0, 0).toISOString();
  const appt = a => DB.db.appointments.add(a);
  await appt({ date: iso(2026, 7, 1), outcome: 'ordered', status: 'completed', commission: 600, value: 1000 });
  await appt({ date: iso(2026, 7, 2), outcome: 'ordered', status: 'completed', commission: 500, value: 900 });
  await appt({ date: iso(2026, 7, 3), outcome: 'ordered', status: 'completed', commission: 900, value: 1500 });
  await appt({ date: iso(2026, 7, 4), outcome: 'quoted', status: 'completed', commission: 600, value: 600 });
  await appt({ date: iso(2026, 7, 5), outcome: 'ordered', status: 'cancelled', commission: 999, value: 9999 });
  await appt({ date: iso(2026, 7, 12), outcome: 'ordered', status: 'completed', commission: 700, value: 1200 });
  await appt({ date: iso(2026, 7, 14, 10), outcome: 'ordered', status: 'completed', commission: 500, value: 1000 });
  await appt({ date: iso(2026, 7, 15, 9), outcome: 'ordered', status: 'completed', commission: 100, value: 400 });
  await appt({ date: iso(2026, 7, 16, 11), outcome: 'ordered', status: 'completed', value: 2000 });
  await appt({ date: iso(2026, 7, 17, 12), outcome: 'ordered', status: 'cancelled', commission: 9999, value: 9000 });
  await appt({ date: iso(2026, 7, 18, 10), outcome: 'quoted', status: 'completed', commission: 50, value: 500 });
  await appt({ date: iso(2026, 7, 20, 10), outcome: 'ordered', status: 'completed', commission: 700, value: 1200 });
  await DB.addExpense({ date: iso(2026, 7, 10), category: 'fuel', amount: 200 });
  await DB.addExpense({ date: iso(2026, 7, 15), category: 'materials', amount: 300 });
  await DB.addExpense({ date: iso(2026, 8, 1), category: 'fuel', amount: 40 });
  await DB.addTrip({ date: iso(2026, 7, 11), distanceKm: 16093.44 });
  await DB.addTrip({ date: iso(2026, 7, 21), distanceKm: 2000 });

  // Week window: Mon 13 - Sun 19 July 2026.
  const week = await DB.getWeekStats(iso(2026, 7, 13, 0), iso(2026, 7, 19, 23));
  ok('week: earnings = recorded + estimated commission', week.earnings === 500 + 100 + 2000 * 0.8 * 0.1525, week.earnings);
  ok('week: sales sum ordered values only', week.sales === 1000 + 400 + 2000, week.sales);
  ok('week: ordered count', week.orderedCount === 3, week.orderedCount);
  ok('week: cancelled visits excluded', !week.sales.toString().includes('9999'), week);

  const exactly = await DB.getWeekStats(iso(2026, 7, 1, 0), iso(2026, 7, 1, 23));
  ok('week: earnings exactly at weekly target (600)', exactly.earnings === 600 && CONFIG.weeklyTarget === 600, exactly);
  const below = await DB.getWeekStats(iso(2026, 7, 2, 0), iso(2026, 7, 2, 23));
  ok('week: earnings below target (500)', below.earnings === 500 && below.earnings < CONFIG.weeklyTarget, below);
  const above = await DB.getWeekStats(iso(2026, 7, 3, 0), iso(2026, 7, 3, 23));
  ok('week: earnings above target (900)', above.earnings === 900 && above.earnings > CONFIG.weeklyTarget, above);
  const quotedOnly = await DB.getWeekStats(iso(2026, 7, 4, 0), iso(2026, 7, 4, 23));
  ok('week: quoted-only day -> zero stats', quotedOnly.earnings === 0 && quotedOnly.sales === 0 && quotedOnly.orderedCount === 0, quotedOnly);
  const cancelledOnly = await DB.getWeekStats(iso(2026, 7, 5, 0), iso(2026, 7, 5, 23));
  ok('week: cancelled-only day -> zero stats', cancelledOnly.earnings === 0 && cancelledOnly.sales === 0 && cancelledOnly.orderedCount === 0, cancelledOnly);

  // calculateFromData: same canonical filters (cancelled excluded), expenses and mileage deducted.
  const period = await Tax.calculateFromData(iso(2026, 7, 1, 0), iso(2026, 7, 31, 23));
  const expectedIncome = 500 + 100 + 2000 * 0.8 * 0.1525 + 700 + 700 + 600 + 500 + 900;
  ok('data: income excludes cancelled and non-ordered', Math.abs(period.totalIncome - expectedIncome) < 1e-9, period.totalIncome);
  ok('data: expenses in period summed', period.totalExpenses === 500, period.totalExpenses);
  ok('data: mileage claim from trips', Math.abs(period.mileageClaim - Tax.calculateMileageClaim(16093.44 + 2000)) < 1e-9, period.mileageClaim);
  ok('data: expenses > income -> zero liability', period.profit < 0 && period.tax.totalLiability === 0, period);

  const profitable = await Tax.calculateFromData(iso(2026, 7, 1, 0), iso(2026, 7, 5, 23));
  ok('data: profit from ordered commissions', profitable.totalIncome === 2000 && profitable.profit === 2000, profitable);
  ok('data: profit below personal allowance -> zero liability', profitable.tax.taxableProfit === 0 && profitable.tax.totalLiability === 0, profitable.tax);

  const empty = await Tax.calculateFromData(iso(2026, 8, 10, 0), iso(2026, 8, 15, 23));
  ok('data: empty period -> all zeros', empty.totalIncome === 0 && empty.totalExpenses === 0 && empty.profit === 0 && empty.tax.totalLiability === 0, empty);

  // Companion period answers normalize to whole days; the raw noon bounds
  // would silently drop morning visits on day 1 and afternoon visits on the
  // last day.
  await appt({ date: iso(2026, 6, 1, 9), outcome: 'ordered', status: 'completed', commission: 100, value: 300 });
  await appt({ date: iso(2026, 6, 30, 18), outcome: 'ordered', status: 'completed', commission: 200, value: 600 });
  await DB.addExpense({ date: iso(2026, 6, 1, 7), category: 'fuel', amount: 50 });
  const dayStart = new Date(iso(2026, 6, 1, 12));
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(iso(2026, 6, 30, 12));
  dayEnd.setHours(23, 59, 59, 999);
  const june = await DB.getWeekStats(dayStart.toISOString(), dayEnd.toISOString());
  ok('period: whole-day window covers first and last day', june.orderedCount === 2 && june.earnings === 300, june);
  const rawEnd = new Date(iso(2026, 6, 30, 12));
  const raw = await DB.getWeekStats(iso(2026, 6, 1, 12), rawEnd.toISOString());
  ok('period: raw noon bounds drop both day-1 morning and last-day afternoon visits', raw.orderedCount === 0, raw);
  const juneExpenses = await DB.getExpensesForPeriod(dayStart.toISOString(), dayEnd.toISOString());
  ok('period: expenses use the same whole-day window', juneExpenses.length === 1 && juneExpenses[0].amount === 50, juneExpenses);
}

(async () => {
  await sectionA();
  await sectionB();
  console.log(`money.test.js: ${passed} OK` + (failed ? `, ${failed} FAILED` : ''));
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('money.test.js crashed:', e);
  process.exit(1);
});