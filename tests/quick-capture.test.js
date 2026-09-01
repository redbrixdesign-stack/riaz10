'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = { navigations: [], expenseApplied: null, expenseOpened: false, modal: '' };
const sandbox = {
  console,
  setTimeout: fn => fn(),
  JSON,
  DB: { getSetting: async () => false },
  Utils: { escapeHtml: value => String(value ?? ''), formatDate: value => String(value), formatCurrency: value => String(value) },
  Toast: { show() {} },
  AIService: { isEnabled: () => false },
  OCRFeature: { processImage() {} },
  MoneyFeature: {
    openExpenseModal() { state.expenseOpened = true; },
    async applyQuickCapture(file, fields) { state.expenseApplied = { file, fields }; }
  },
  App: {
    registerFeature(feature) { sandbox.ControlFeature = feature; },
    navigate(feature, params) { state.navigations.push({ feature, params }); },
    openModal(html) { state.modal = html; },
    closeModal() {},
    renderTopHeader: () => ''
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/features/control/control.js', 'utf8'), sandbox);
const feature = sandbox.ControlFeature;

(async () => {
  const visitFile = { name: 'visit.jpg', type: 'image/jpeg' };
  feature.pendingQuickCapture = { file: visitFile, fields: { kind: 'visit', name: 'Sarah Jones', phone: '07700 900123', address: '1 Test Street', postcode: 'M1 1AA', appointmentDate: '2026-08-27', appointmentTime: '15:00-18:00' } };
  await feature.routeQuickCapture('visit');
  assert.equal(state.navigations.at(-1).feature, 'appointments');
  assert.equal(state.navigations.at(-1).params.name, 'Sarah Jones');
  assert.equal(state.navigations.at(-1).params.time, '15:00');

  const receiptFile = { name: 'receipt.jpg', type: 'image/jpeg' };
  feature.pendingQuickCapture = { file: receiptFile, fields: { kind: 'expense', amount: '18.40', vendor: 'Shell', category: 'fuel' } };
  await feature.routeQuickCapture('expense');
  assert.equal(state.expenseOpened, true);
  assert.equal(state.expenseApplied.file, receiptFile);
  assert.equal(state.expenseApplied.fields.amount, '18.40');

  feature.pendingQuickCapture = { file: visitFile, fields: {} };
  feature.openQuickCaptureChoice();
  assert.match(state.modal, /What are you adding/);
  assert.match(state.modal, /Customer \/ visit/);
  assert.match(state.modal, /Expense receipt/);
  console.log('quick capture routes visits and expenses safely');
})().catch(error => { console.error(error); process.exitCode = 1; });
