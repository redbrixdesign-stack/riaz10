// Lead inbox UX: enquiry-only capture and privacy-safe appointment conversion.
'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/features/leads/leads.js'), 'utf8');

const elements = new Map();
const el = (id, value = '') => ({ id, value, disabled: false });
global.document = { getElementById: id => elements.get(id) || null };
global.window = global;
global.CONFIG = { leadSources: ['Self Generated', 'Company System'] };
global.Utils = {
  escapeHtml: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  formatDate: (value, mode) => mode === 'iso' ? new Date(value).toISOString().slice(0, 10) : '19 Aug'
};
global.Toast = { calls: [], show(...args) { this.calls.push(args); } };
global.App = {
  features: new Map(), navigations: [], modal: '',
  registerFeature(feature) { this.features.set(feature.id, feature); },
  renderTopHeader: ({ title }) => `<header>${title}</header>`,
  openModal(html) { this.modal = html; }, closeModal() {},
  navigate(...args) { this.navigations.push(args); }
};

const leads = [];
global.DB = {
  async getLeads() { return leads; },
  async getLead(id) { return leads.find(lead => lead.id === id) || null; },
  async addLead(data) { const lead = { ...data, id: leads.length + 1 }; leads.push(lead); return lead; },
  async updateLead(id, fields) { Object.assign(leads.find(lead => lead.id === id), fields); },
  async convertLeadToCustomer(id) { return { lead: leads.find(lead => lead.id === id), customer: { id: 91 } }; }
};

(0, eval)(source);
const feature = App.features.get('leads');
const assert = (condition, message, extra) => {
  if (!condition) { console.error('FAIL:', message, extra || ''); process.exitCode = 1; }
  else console.log('OK:', message);
};

(async () => {
  assert(feature && feature.route === false, 'lead inbox is a secondary route, not primary navigation');
  const empty = await feature.renderInbox();
  assert(empty.includes('No enquiries yet') && empty.includes('Add enquiry'), 'empty inbox has an enquiry CTA');

  elements.set('lead-name', el('lead-name', 'Alice Smith'));
  elements.set('lead-phone', el('lead-phone', '07700900123'));
  elements.set('lead-address', el('lead-address', '1 Test Road'));
  elements.set('lead-source', el('lead-source', 'self_generated'));
  elements.set('lead-next-action', el('lead-next-action', '2026-08-20'));
  elements.set('lead-notes', el('lead-notes', 'Asked about shutters'));
  elements.set('lead-save-btn', el('lead-save-btn'));
  await feature.saveLead();
  assert(leads.length === 1 && leads[0].status === 'new', 'manual enquiry saves without a customer or appointment');
  assert(!('customerId' in leads[0]) && !('appointmentId' in leads[0]), 'enquiry safely exists before conversion');

  const inbox = await feature.renderInbox();
  assert(inbox.includes('Alice Smith') && inbox.includes('Book visit'), 'active enquiry renders in the inbox');
  feature.bookVisit(1);
  const navigation = App.navigations.at(-1);
  assert(navigation[0] === 'appointments' && navigation[1].leadId === 1, 'book visit passes leadId to existing appointment flow');
  assert(!JSON.stringify(navigation).includes('Alice') && !JSON.stringify(navigation).includes('07700'), 'lead PII is not serialized into navigation');

  await feature.convertCustomer(1);
  assert(App.navigations.at(-1)[0] === 'customer' && App.navigations.at(-1)[1].id === 91, 'customer-only conversion opens Customer 360');

  elements.set('lead-loss-reason', el('lead-loss-reason', 'No longer proceeding'));
  await feature.saveLost(1);
  assert(leads[0].status === 'lost' && leads[0].lossReason, 'mark lost requires and stores a reason');

  const appointmentsSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/appointments/appointments.js'), 'utf8');
  assert(appointmentsSource.includes("DB.convertLeadToVisit(leadId, appointmentData)"), 'appointment save delegates atomic conversion to the DB domain API');
  assert(appointmentsSource.includes("DB.getLead(leadId)"), 'appointment form hydrates PII locally from leadId');

  console.log(process.exitCode ? '\nLEADS TEST FAILED' : '\nLEADS TEST PASSED');
})();
