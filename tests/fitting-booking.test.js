'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fields = new Map();
const messages = [];
const app = {
  features: new Map(),
  registerFeature(feature) { this.features.set(feature.id, feature); },
  openModal(html) { this.modal = html; },
  closeModal() { this.modal = ''; },
  navigate(feature, params) { this.navigation = { feature, params }; },
  async setActiveVisitUnlock() {},
  calculateDeposit() { return { amount: 0 }; }
};
const customer = { id: 5, fullName: 'Mock Test Customer', phone: '07700 900111', address: { line1: '1 Fictional Way' } };
const order = { id: 77, customerId: 5, appointmentId: 11, orderNumber: 'ORD-MOCK-77' };
const saleVisit = { id: 11, customerId: 5, clientName: customer.fullName, phone: customer.phone, address: '1 Fictional Way', source: 'self_generated' };
const visits = [saleVisit];
const context = vm.createContext({
  App: app,
  CONFIG: {
    workingWeek: { salesDays: [1, 2, 4], fittingDays: [3, 5], slotMinutes: 15,
      blocks: [{ id: 'morning', name: '09:00-12:00', start: '09:00', end: '12:00' }] },
    appointmentTypes: [{ id: 'consultation', name: 'Consultation' }, { id: 'fitting', name: 'Fitting' }]
  },
  DB: {
    db: { orders: { get: async id => id === 77 ? order : null } },
    getCustomer: async id => id === 5 ? customer : null,
    getAppointment: async id => id === 11 ? saleVisit : visits.find(visit => visit.id === id),
    getAppointmentsByCustomer: async id => id === 5 ? visits : [],
    getAppointmentsForDate: async () => [],
    completeVisitOutcome: async () => ({ order, payment: null }),
    addAppointment: async data => { const visit = { ...data, id: 12 }; visits.push(visit); return visit; },
    findCustomerByPhone: async () => { throw new Error('A linked fitting must reuse its order customer'); }
  },
  Utils: {
    ukParts: date => ({ weekday: date.getDay() }),
    formatDate: date => date.toISOString().slice(0, 10),
    formatDateUK: date => new Date(date).toLocaleDateString('en-GB'),
    formatTime: date => new Date(date).toTimeString().slice(0, 5),
    formatCurrency: amount => `£${Number(amount).toFixed(2)}`,
    escapeHtml: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  },
  TaxCalculator: { estimateCommission: amount => amount / 10 },
  Toast: { show: (message, level) => messages.push({ message, level }) },
  document: { getElementById: id => fields.get(id) || null },
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Promise,
  setTimeout
});

for (const file of ['js/features/appointments/appointments.js', 'js/features/orders/orders.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}

(async () => {
  const appointments = app.features.get('appointments');
  const orders = app.features.get('orders');
  context.Utils.generateId = () => 'mock-payment';
  fields.set('outcome-value', { value: '900' });
  fields.set('outcome-payment', { value: '' });
  await appointments.saveOutcome(11, 'ordered');
  assert.match(app.modal, /When is the fitting\?/, 'logging an order opens the fitting prompt');
  assert.equal(visits.length, 1, 'the prompt alone does not book a visit');

  await appointments.offerFittingBooking(77);
  assert.match(app.modal, /When is the fitting\?/);
  assert.match(app.modal, /Fitting date/);
  assert.match(app.modal, /Arrival time slot/);
  assert.match(app.modal, /Custom slot/);
  assert.match(app.modal, /Date not agreed yet/);
  assert.match(app.modal, /Nothing is sent to the customer automatically/);

  appointments.deferFittingBooking(77);
  assert.equal(visits.length, 1, 'deferring does not create a fitting visit');
  assert.equal(app.navigation.feature, 'orders');
  await orders.openOrderSheet(77);
  assert.match(app.modal, /Date not agreed yet/);
  assert.match(app.modal, /Schedule fitting/);

  fields.set('fitting-date', { value: '' });
  fields.set('fitting-slot', { value: '' });
  fields.set('fitting-time', { value: '' });
  await appointments.saveFittingBooking(77);
  assert.equal(visits.length, 1, 'missing fitting date and slot cannot create a visit');
  assert.match(messages.at(-1).message, /Choose a future fitting date and time slot/);

  const date = new Date();
  do { date.setDate(date.getDate() + 1); } while (date.getDay() !== 1);
  fields.set('fitting-date', { value: date.toISOString().slice(0, 10) }); // a sales day, deliberately
  fields.set('fitting-slot', { value: 'custom' });
  fields.set('fitting-slot-start', { value: '14:00' });
  fields.set('fitting-slot-end', { value: '13:00' });
  fields.set('fitting-time', { value: '14:00' });
  await appointments.saveFittingBooking(77);
  assert.equal(visits.length, 1, 'invalid custom slot cannot create a visit');
  assert.match(messages.at(-1).message, /valid start and end/);

  fields.set('fitting-slot', { value: 'morning' });
  fields.set('fitting-time', { value: '09:00' });
  fields.set('fitting-duration', { value: '4' });
  appointments.findTravelWarnings = () => [];
  appointments.findBookingWarnings = async () => [];
  appointments.offerBookingConfirmation = async () => { app.confirmationOffered = true; };
  await appointments.saveFittingBooking(77);
  assert.equal(visits.length, 2, 'fitting is saved once');
  assert.equal(visits[1].customerId, 5, 'linked order customer is reused');
  assert.equal(visits[1].orderId, 77, 'fitting links to the order');
  assert.equal(visits[1].type, 'fitting');
  assert.equal(visits[1].arrivalStart, '09:00');
  assert.equal(visits[1].arrivalEnd, '12:00');
  assert.equal(visits[1].durationSlots, 4);
  assert.equal(app.confirmationOffered, true, 'customer communication remains a reviewed offer');

  await appointments.offerFittingBooking(77);
  assert.equal(app.navigation.params.id, 12, 'reopening the order goes to the existing fitting');
  await orders.openOrderSheet(77);
  assert.match(app.modal, /Open fitting visit/);
  assert.doesNotMatch(app.modal, /Schedule fitting/);

  console.log('Fitting booking prompt tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
