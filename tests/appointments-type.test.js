// Regression coverage for editing an existing visit's type.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appointmentTypes = [
  { id: 'consultation', name: 'Consultation' },
  { id: 'measure', name: 'Measure' },
  { id: 'fitting', name: 'Fitting' },
  { id: 'service_call', name: 'Service Call' }
];
const appt = {
  id: 7, clientName: 'Demo Daniel', phone: '07700 900123',
  address: '7 Test Street, M1 1AA', date: '2026-08-21T09:30:00.000Z',
  durationSlots: 4, type: 'consultation', status: 'confirmed'
};
let modal = '';
let updated = null;
const context = {
  console,
  CONFIG: {
    appointmentTypes,
    leadSources: ['Self Generated'],
    workingWeek: { salesDays: [1, 2, 4], fittingDays: [3, 5], slotMinutes: 15, blocks: [
      { id: 'morning', name: '09:00-12:00', start: '09:00', end: '12:00' },
      { id: 'midday', name: '12:00-15:00', start: '12:00', end: '15:00' }
    ] },
    arrivalWindowPresets: []
  },
  Utils: {
    escapeHtml: value => String(value ?? ''),
    formatDate: (_value, format) => format === 'iso' ? '2026-08-21' : '21 Aug 2026',
    formatTime: () => '09:30',
    ukParts: date => ({ weekday: date.getUTCDay() })
  },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  App: {
    registerFeature(feature) { context.AppointmentsFeature = feature; },
    openModal(html) { modal = html; }, closeModal() {}, navigate() {}, renderTopHeader: () => ''
  },
  Toast: { show() {} },
  DB: {
    getAppointment: async () => ({ ...appt }),
    getAppointmentsForDate: async () => [],
    updateAppointment: async (_id, changes) => { updated = changes; }
  },
  OCRFeature: {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/features/appointments/appointments.js'), 'utf8'), context);
const feature = context.AppointmentsFeature;

(async () => {
  await feature.openEditDetailsModal(appt.id);
  assert.match(modal, /id="edit-detail-type"/);
  assert.match(modal, /value="consultation" selected/);
  assert.match(modal, /value="fitting"/);

  await feature.openRescheduleModal(appt.id);
  assert.match(modal, /id="move-type"/);
  assert.match(modal, /value="consultation" selected/);
  assert.match(modal, /value="fitting"/);

  feature.hasScheduleConflict = () => false;
  feature.findTravelWarnings = () => [];
  await feature.saveReschedule(appt.id, true, {
    date: '2026-08-21', time: '09:30', durationSlots: 4, type: 'fitting',
    reason: '', address: appt.address, arrivalStart: '', arrivalEnd: '', arrivalError: ''
  });
  assert.equal(updated.type, 'fitting');

  await feature.saveEditDetails(appt.id, true, {
    name: appt.clientName, phone: appt.phone, address: appt.address,
    date: '2026-08-21', time: '09:30', durationSlots: 4, type: 'service_call',
    arrivalStart: '', arrivalEnd: '', arrivalError: ''
  });
  assert.equal(updated.type, 'service_call');

  const fittingDayForm = feature.renderAddForm({ date: '2026-08-21' });
  assert.doesNotMatch(fittingDayForm, /value="consultation"/);
  assert.match(fittingDayForm, /value="fitting" selected/);
  assert.match(fittingDayForm, /Diary time \*/);
  assert.match(fittingDayForm, /Used for diary order, route planning and travel gaps/);
  assert.match(fittingDayForm, /value="morning" selected/);
  assert.match(fittingDayForm, /Exact time — no arrival window/);
  assert.equal(feature.validateArrivalWindowContainsTime('10:00', '09:00', '12:00'), '');
  assert.match(feature.validateArrivalWindowContainsTime('10:00', '12:00', '15:00'), /must sit inside/);
  console.log('appointments: editable existing type and new-visit weekday defaults OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
