'use strict';

// Regression: two dispatches of the same Save Visit activation must share one
// in-flight write. This models duplicate delegated listeners without needing a
// browser or IndexedDB.
const fs = require('fs');
const path = require('path');

let feature;
const button = { disabled: false, dataset: {}, innerHTML: 'Save Visit' };
global.document = { getElementById: id => id === 'appt-save-btn' ? button : null };
global.window = global;
global.CONFIG = {
  workingWeek: {
    salesDays: [1, 2, 4],
    fittingDays: [3, 5],
    slotMinutes: 15,
    blocks: [{ id: 'morning', name: '09:00-12:00', start: '09:00', end: '12:00' }]
  },
  appointmentTypes: [{ id: 'consultation', name: 'Consultation' }, { id: 'fitting', name: 'Fitting' }]
};
global.App = {
  registerFeature(value) { feature = value; },
  navigate() {}, openModal() {}, closeModal() {}
};
const toasts = [];
global.Toast = { show(message, type) { toasts.push({ message, type }); } };
global.Utils = { ukParts() { return { weekday: 3 }; } };
global.OCRFeature = {};
global.MessageScheduler = { reschedule() {} };

let releaseRead;
const firstRead = new Promise(resolve => { releaseRead = resolve; });
let reads = 0;
let customerWrites = 0;
let appointmentWrites = 0;
global.DB = {
  async getAppointmentsForDate() {
    reads += 1;
    if (reads === 1) await firstRead;
    return [];
  },
  async findCustomerByPhone() { return null; },
  async addCustomer(customer) { customerWrites += 1; return { ...customer, id: customerWrites }; },
  async addAppointment(appointment) { appointmentWrites += 1; return { ...appointment, id: appointmentWrites }; }
};

const source = fs.readFileSync(path.join(__dirname, '..', 'js/features/appointments/appointments.js'), 'utf8');
(0, eval)(source);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const draft = {
    name: 'Demo Alice', phone: '', address: '1 Test Street',
    date: '2026-08-19', time: '10:00', durationSlots: 1, type: 'fitting',
    source: 'self_generated', access: '', notes: '', arrivalStart: '',
    arrivalEnd: '', arrivalError: ''
  };

  const first = feature.saveAppointment(true, draft);
  const duplicateDispatch = feature.saveAppointment(true, draft);
  releaseRead();
  await Promise.all([first, duplicateDispatch]);

  assert(reads === 1, `expected one scheduling read, got ${reads}`);
  assert(customerWrites === 1, `expected one customer, got ${customerWrites}`);
  assert(appointmentWrites === 1, `expected one appointment, got ${appointmentWrites}`);
  assert(toasts.filter(t => t.message === 'Visit saved').length === 1, 'expected one success toast');
  assert(feature._saveAppointmentInFlight === false, 'single-flight guard should release after save');

  await feature.saveAppointment(true, { ...draft, arrivalStart: '12:00', arrivalEnd: '15:00' });
  assert(customerWrites === 1 && appointmentWrites === 1, 'mismatched arrival window must block all writes');
  assert(toasts.some(t => /Diary time 10:00 must sit inside/.test(t.message)), 'mismatched window should explain how to correct it');

  console.log('APPOINTMENT SAVE TEST PASSED');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
