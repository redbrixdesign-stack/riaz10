/* ============================================
   ADVISOROS — OCR DATE EXTRACTION TESTS
   Run with: node tests/ocr.test.js

   Exercises OCRFeature.parseText() in a stubbed environment, focusing on
   appointment-date selection: real CRM screens can carry several dates
   (status-bar, "previous appointment" history), and the extractor must
   pick the actual appointment, validate the printed weekday, and still
   roll 2+ month-old dates forward to next year.
   ============================================ */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

let failures = 0;
function ok(label, cond, extra) {
  if (cond) {
    console.log('  OK ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

// ---- stub browser globals OCRFeature touches at load time ----
const sandbox = {
  console,
  window: {},
  document: { head: { appendChild() {} }, getElementById() { return null; } },
  Tesseract: undefined,
  AIService: { isEnabled: () => false, extractFromImage: async () => ({ ok: false }) },
  Toast: { show() {} },
  CONFIG: { appointmentTypes: [{ id: 'consultation' }] },
  DB: { db: {} },
  MessageScheduler: undefined,
  App: {
    navigate() {},
    registerFeature(f) { sandbox.App.feature = f; }
  },
  Utils: {
    formatDate(d, format) {
      if (format === 'iso') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      return String(d);
    },
    isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    },
    escapeHtml: s => String(s),
    escapeAttr: s => String(s)
  },
  AppointmentsFeature: {
    normalizePhone: p => String(p || '').replace(/[^0-9+]/g, ''),
    normalizeBookingText: s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  }
};
sandbox.App.feature = null;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, 'js/features/ocr/ocr.js'), 'utf8'), sandbox);
const OCRFeature = sandbox.App.feature;

function extract(lines, leftColumnText = '', at) {
  return OCRFeature.parseText(lines.join('\n'), leftColumnText, at);
}

// The date extractor anchors on "now" for year selection, closeness ranking
// and weekday validation. Injecting a fixed clock makes every assertion
// below deterministic — the suite must stay green no matter what the real
// calendar date is when it runs (11 Aug isn't always a Tuesday).
const AT = new Date(2026, 7, 12); // Wed 12 Aug 2026 — the day these fixtures were written

(async () => {

console.log('date selection');
{
  const data = extract(['Customer details', 'Mr James Wilson', 'Customer Number: HIL-0451', 'Tuesday 11 August'], '', AT);
  ok('single "Tuesday 11 August" -> 2026-08-11', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // History line BEFORE the real appointment must not win.
  const data = extract(['Previous appointment: Monday 10 August', 'Customer details', 'Mr James Wilson', 'Tuesday 11 August'], '', AT);
  ok('history date ignored; real appointment picked', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Printed weekday mismatch = noise/stale line, rejected outright.
  const data = extract(['Mr James Wilson', 'Monday 13 August', 'Tuesday 11 August'], '', AT);
  ok('weekday/date mismatch rejected ("Monday 13")', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Only a mismatched line exists -> no date rather than a wrong one.
  const data = extract(['Mr James Wilson', 'Monday 11 August'], '', AT);
  ok('lone mismatched weekday yields no date', data.appointmentDate === '', data.appointmentDate);
}
{
  // Real appointment in the past (~2+ months) rolls to next year.
  const past = new Date(AT.getFullYear(), AT.getMonth() - 3, 10);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][past.getDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][past.getMonth()];
  const data = extract([`Mr James Wilson`, `${wd} ${past.getDate()} ${mo}`], '', AT);
  const expectedYear = AT.getFullYear() + 1;
  ok(`stale date (${wd} ${past.getDate()} ${mo}) rolls to next year`,
    data.appointmentDate === `${expectedYear}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`,
    data.appointmentDate);
}
{
  // Status-bar clock lines are skipped even when they contain a date.
  const data = extract(['15:35 Sun 10 Aug', 'Mr James Wilson', 'Tuesday 11 August'], '', AT);
  ok('status-bar clock line ignored', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Date on a "visit"/"appointment"-labelled line outranks a plain one.
  const data = extract(['Mr James Wilson', '10 August', 'Appointment date: Tuesday 11 August'], '', AT);
  ok('appointment-labelled line preferred', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Real screens print weekday-less dates with an explicit year — these must
  // not silently vanish (which used to book the visit "today" instead).
  const data = extract(['Mr James Wilson', '13 August 2026'], '', AT);
  ok('year-anchored "13 August 2026" -> 2026-08-13', data.appointmentDate === '2026-08-13', data.appointmentDate);
}
{
  const data = extract(['Mr James Wilson', 'Order date: 12 Aug 2026'], '', AT);
  ok('year-anchored "12 Aug 2026" with label -> 2026-08-12', data.appointmentDate === '2026-08-12', data.appointmentDate);
}
{
  // US-style order screens print month-first.
  const data = extract(['Mr James Wilson', 'August 13, 2026'], '', AT);
  ok('US-style "August 13, 2026" -> 2026-08-13', data.appointmentDate === '2026-08-13', data.appointmentDate);
}
{
  // Status-bar clock lines stay excluded even with a year printed nearby.
  const data = extract(['15:35 Sun 10 Aug', 'Mr James Wilson', '13 August 2026'], '', AT);
  ok('status-bar clock ignored; year-anchored date picked', data.appointmentDate === '2026-08-13', data.appointmentDate);
}
{
  // History penalty applies to year-anchored dates too.
  const data = extract(['Previous appointment: 5 June 2026', 'Mr James Wilson', '13 August 2026'], '', AT);
  ok('history year-anchored date ignored', data.appointmentDate === '2026-08-13', data.appointmentDate);
}
{
  // A weekday-anchored appointment line still outranks a year-anchored decoy.
  const data = extract(['Mr James Wilson', '13 August 2026', 'Appointment date: Tuesday 11 August'], '', AT);
  ok('appointment-labelled weekday line beats year-anchored decoy', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Same logic must hold on a different calendar: Wed 11 Aug 2027. This is
  // the case the literal fixtures above would have broken on in the wild.
  const later = new Date(2027, 7, 11);
  const data = extract(['Customer details', 'Mr James Wilson', 'Wednesday 11 August'], '', later);
  ok('Wed 11 Aug 2027 -> 2027-08-11', data.appointmentDate === '2027-08-11', data.appointmentDate);
  const bad = extract(['Mr James Wilson', 'Tuesday 11 August'], '', later);
  ok('"Tuesday 11 August" rejected in 2027 (mismatch both years)', bad.appointmentDate === '', bad.appointmentDate);
}
{
  // Stale date seen across the Dec/Jan boundary still rolls to next year.
  const dec = new Date(2026, 11, 20);
  const data = extract(['Mr James Wilson', 'Friday 5 June'], '', dec);
  ok('stale date near year-end rolls to 2027', data.appointmentDate === '2027-06-05', data.appointmentDate);
}

console.log('normalizeDateField');
{
  const cases = {
    '2026-08-11': '2026-08-11',
    '2026-8-3': '2026-08-03',
    '11/08/2026': '2026-08-11',
    '11.08.26': '2026-08-11',
    '11 Aug 2026': '2026-08-11',
    'Tuesday 11 August': '2026-08-11',
    '': '',
    'not a date': ''
  };
  for (const [input, expected] of Object.entries(cases)) {
    const got = OCRFeature.normalizeDateField(input);
    ok(`normalizeDateField(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, got === expected, got);
  }
}

console.log('rollStaleYearForward');
{
  const cases = {
    '': '',
    'garbage': 'garbage',
    '2026-08-11': '2026-08-11',          // today — untouched
    '2026-08-25': '2026-08-25',          // future — untouched
    '2026-06-20': '2026-06-20',          // ~52 days back — within 60, untouched
    '2025-08-11': '2026-08-11',          // exactly one year stale → rolled
    '2024-08-11': '2026-08-11',          // two years stale → rolled
    '2020-01-01': '2025-01-01'           // five+ years stale → capped at 5 rolls
  };
  for (const [input, expected] of Object.entries(cases)) {
    const got = OCRFeature.rollStaleYearForward(input);
    ok(`rollStaleYearForward(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, got === expected, got);
  }
}

console.log('normalizeTimeField + resolveVisitIso');
{
  const cases = {
    '15:00': '15:00',
    '9:00': '09:00',
    '3:00 PM': '15:00',
    '3:00 pm': '15:00',
    '12:00 AM': '00:00',
    '12:00 PM': '12:00',
    '3pm': '15:00',
    '09:15:30': '09:15',
    '': '',
    'evening': ''
  };
  for (const [input, expected] of Object.entries(cases)) {
    const got = OCRFeature.normalizeTimeField(input);
    ok(`normalizeTimeField(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, got === expected, got);
  }

  const good = OCRFeature.resolveVisitIso('2026-08-11', '3:00 PM');
  ok('resolveVisitIso converts 3:00 PM to 15:00 same day', good.time === '15:00' && new Date(good.iso).getHours() === 15, good);
  const bad = OCRFeature.resolveVisitIso('not a date', '3:00 PM');
  ok('resolveVisitIso falls back to today when date unusable', good.time === '15:00' && bad.iso.startsWith(sandbox.Utils.formatDate(new Date(), 'iso')), bad);
  const badTime = OCRFeature.resolveVisitIso('2026-08-11', 'not a time');
  ok('resolveVisitIso falls back to 09:00 when time unusable', badTime.time === '09:00' && new Date(badTime.iso).getHours() === 9, badTime);
}

console.log('splitTimeRange');
{
  const cases = {
    '15:00-18:00': { start: '15:00', end: '18:00' },
    '3:00 PM - 6:00 PM': { start: '15:00', end: '18:00' },
    '3pm to 6pm': { start: '15:00', end: '18:00' },
    '09:00 – 12:00': { start: '09:00', end: '12:00' },
    '9:00 AM - 11:00': { start: '09:00', end: '11:00' },
    '12:00 AM - 2:00 PM': { start: '00:00', end: '14:00' },
    '15:00': null,
    '3:00 PM': null,
    '18:00-15:00': null,        // end before start
    '': null,
    'not a time': null
  };
  for (const [input, expected] of Object.entries(cases)) {
    const got = OCRFeature.splitTimeRange(input);
    const pass = expected === null ? got === null : (got && got.start === expected.start && got.end === expected.end);
    ok(`splitTimeRange(${JSON.stringify(input)}) -> ${expected ? JSON.stringify(expected) : 'null'}`, pass, got);
  }
  const anchored = OCRFeature.resolveVisitIso('2026-08-11', '3:00 PM - 6:00 PM');
  ok('resolveVisitIso anchors a range on its start (15:00)', anchored.time === '15:00' && new Date(anchored.iso).getHours() === 15, anchored);
}

console.log('appointment slot time extraction');
{
  const data = extract(['Customer details', 'Mr James Wilson', 'Arriving 3:00 PM - 6:00 PM', 'Tuesday 11 August'], '', AT);
  ok('"Arriving 3:00 PM - 6:00 PM" -> 15:00-18:00', data.appointmentTime === '15:00-18:00', data.appointmentTime);
}
{
  const data = extract(['Mr James Wilson', 'Appointment: 9:00 AM - 12:00 PM', 'Tuesday 11 August'], '', AT);
  ok('"Appointment: 9:00 AM - 12:00 PM" -> 09:00-12:00', data.appointmentTime === '09:00-12:00', data.appointmentTime);
}
{
  const data = extract(['Mr James Wilson', 'Arriving 3:00 PM', 'Tuesday 11 August'], '', AT);
  ok('single "Arriving 3:00 PM" still -> 15:00', data.appointmentTime === '15:00', data.appointmentTime);
}
{
  const data = extract(['Mr James Wilson', '15:35', 'Tuesday 11 August'], '', AT);
  ok('status-bar clock alone yields no time', data.appointmentTime === '', data.appointmentTime);
}

console.log('duplicate prevention (findExistingVisit)');
{
  const day = '2026-08-11';
  const makeAppt = (id, customerId, phone, address) => ({
    id, customerId, phone, address,
    clientName: 'James Wilson',
    status: 'confirmed',
    date: '2026-08-11T09:00:00.000Z'
  });
  const appts = [makeAppt(42, 7, '07700 900123', '1 High Street, Manchester')];

  sandbox.DB = {
    db: {
      customers: { where: () => ({ equals: () => ({ first: async () => null }) }) },
      appointments: { where: () => ({ equals: () => ({ toArray: async () => appts }) }) }
    },
    getAppointmentsForDate: async () => appts,
    getAppointmentsByCustomer: async () => appts,
    findCustomerByPhone: async phone => (phone === '07700 900123' ? { id: 7, fullName: 'James Wilson' } : null)
  };

  const sameCustomer = await OCRFeature.findExistingVisit(7, day, '07700 900123', '1 High Street, Manchester');
  ok('same customer + same day is detected', sameCustomer && sameCustomer.id === 42);

  const otherCustomer = await OCRFeature.findExistingVisit(999, day, '07700 900123', '1 High Street, Manchester');
  ok('phone/address fallback catches cross-customer duplicates', otherCustomer && otherCustomer.id === 42);

  sandbox.DB.db.appointments = { where: () => ({ equals: () => ({ toArray: async () => [] }) }) };
  sandbox.DB.getAppointmentsForDate = async () => [];
  const none = await OCRFeature.findExistingVisit(999, day, '07700 999999', '99 Nowhere Road');
  ok('no match returns null', none === null);
}

console.log('duplicate prevention (saveToCustomer)');
{
  let addAppointmentCalls = 0;
  const appts = [{ id: 42, customerId: 7, phone: '07700 900123', address: '1 High Street, Manchester', clientName: 'James Wilson', status: 'confirmed', date: '2026-08-11T09:00:00.000Z' }];
  sandbox.DB = {
    db: {
      customers: { where: () => ({ equals: () => ({ first: async () => ({ id: 7, fullName: 'James Wilson' }) }) }) },
      appointments: { where: () => ({ equals: () => ({ toArray: async () => appts }) }) }
    },
    getAppointmentsForDate: async () => appts,
    getAppointmentsByCustomer: async () => appts,
    addAppointment: async (data) => { addAppointmentCalls++; return { ...data, id: 100 }; },
    findCustomerByPhone: async phone => (phone === '07700 900123' ? { id: 7, fullName: 'James Wilson' } : null)
  };
  sandbox.lastNavigate = null;
  sandbox.lastToast = null;
  sandbox.App.navigate = (...args) => { sandbox.lastNavigate = args; };
  sandbox.Toast.show = (msg, type) => { sandbox.lastToast = { msg, type }; };
  const fields = {
    'ocr-name': 'Mr James Wilson', 'ocr-phone': '07700 900123',
    'ocr-address': '1 High Street', 'ocr-town': 'Manchester', 'ocr-city': '',
    'ocr-postcode': 'M14 7FZ', 'ocr-appointmentDate': '2026-08-11', 'ocr-appointmentTime': ''
  };
  sandbox.document = { getElementById: id => ({ value: fields[id] || '', style: {}, focus() {}, scrollIntoView() {} }) };

  await OCRFeature.saveToCustomer();
  ok('duplicate scan does NOT create a second appointment', addAppointmentCalls === 0, addAppointmentCalls);
  ok('duplicate scan navigates to the existing visit', sandbox.lastNavigate && sandbox.lastNavigate[1] && sandbox.lastNavigate[1].id === 42, sandbox.lastNavigate);
  ok('duplicate scan shows a warning toast', sandbox.lastToast && sandbox.lastToast.type === 'warning', sandbox.lastToast);

  sandbox.DB.db.appointments = { where: () => ({ equals: () => ({ toArray: async () => [] }) }) };
  sandbox.DB.getAppointmentsForDate = async () => [];
  sandbox.lastNavigate = null;
  await OCRFeature.saveToCustomer();
  ok('non-duplicate scan still creates the appointment', addAppointmentCalls === 1, addAppointmentCalls);
  ok('non-duplicate scan navigates to the new visit', sandbox.lastNavigate && sandbox.lastNavigate[1] && sandbox.lastNavigate[1].id === 100, sandbox.lastNavigate);
}

})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });