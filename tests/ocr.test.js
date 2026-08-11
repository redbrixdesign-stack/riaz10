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

function extract(lines, leftColumnText = '') {
  return OCRFeature.parseText(lines.join('\n'), leftColumnText);
}

(async () => {

const today = new Date();

console.log('date selection');
{
  const data = extract(['Customer details', 'Mr James Wilson', 'Customer Number: HIL-0451', 'Tuesday 11 August']);
  ok('single "Tuesday 11 August" -> 2026-08-11', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // History line BEFORE the real appointment must not win.
  const data = extract(['Previous appointment: Monday 10 August', 'Customer details', 'Mr James Wilson', 'Tuesday 11 August']);
  ok('history date ignored; real appointment picked', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Printed weekday mismatch = noise/stale line, rejected outright.
  const data = extract(['Mr James Wilson', 'Monday 13 August', 'Tuesday 11 August']);
  ok('weekday/date mismatch rejected ("Monday 13")', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Only a mismatched line exists -> no date rather than a wrong one.
  const data = extract(['Mr James Wilson', 'Monday 11 August']);
  ok('lone mismatched weekday yields no date', data.appointmentDate === '', data.appointmentDate);
}
{
  // Real appointment in the past (~2+ months) rolls to next year.
  const past = new Date(today.getFullYear(), today.getMonth() - 3, 10);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][past.getDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][past.getMonth()];
  const data = extract([`Mr James Wilson`, `${wd} ${past.getDate()} ${mo}`]);
  const expectedYear = today.getFullYear() + 1;
  ok(`stale date (${wd} ${past.getDate()} ${mo}) rolls to next year`,
    data.appointmentDate === `${expectedYear}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`,
    data.appointmentDate);
}
{
  // Status-bar clock lines are skipped even when they contain a date.
  const data = extract(['15:35 Sun 10 Aug', 'Mr James Wilson', 'Tuesday 11 August']);
  ok('status-bar clock line ignored', data.appointmentDate === '2026-08-11', data.appointmentDate);
}
{
  // Date on a "visit"/"appointment"-labelled line outranks a plain one.
  const data = extract(['Mr James Wilson', '10 August', 'Appointment date: Tuesday 11 August']);
  ok('appointment-labelled line preferred', data.appointmentDate === '2026-08-11', data.appointmentDate);
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
    getAppointmentsForDate: async () => appts
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
    addAppointment: async (data) => { addAppointmentCalls++; return { ...data, id: 100 }; }
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