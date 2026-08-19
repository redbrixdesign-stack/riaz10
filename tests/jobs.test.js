// Phase 3 Jobs UX: order creation, stages and diary-linked visits.
'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/features/jobs/jobs.js'), 'utf8');

global.window = global;
global.document = { getElementById: () => null };
global.CONFIG = { appointmentTypes: [{ id: 'fitting', name: 'Fitting' }, { id: 'service_call', name: 'Service call' }, { id: 'follow_up', name: 'Return visit' }] };
global.Utils = { escapeHtml: value => String(value ?? ''), formatDate: () => '20 Aug', formatTime: () => '09:00' };
global.Toast = { calls: [], show(...args) { this.calls.push(args); } };
global.App = {
  features: new Map(), navigations: [], modal: '',
  registerFeature(feature) { this.features.set(feature.id, feature); },
  renderTopHeader: ({ title }) => `<header>${title}</header>`,
  navigate(...args) { this.navigations.push(args); },
  openModal(html) { this.modal = html; }, closeModal() {}
};
global.JobFieldService = {
  async load() { return { checklist: [], issues: [] }; }, render() { return '<section>Field operations</section>'; },
  setChecklistItem() {}, openAddIssue() {}, saveIssue() {}, openResolveIssue() {}, resolveIssue() {}, openComplete() {}, confirmComplete() {}, openSignOff() {}, confirmSignOff() {}
};

const jobs = [{ id: 1, jobNumber: 'JOB-2026-0001', orderId: 4, customerId: 7, status: 'materials_ordered', summary: 'Living room shutters' }];
const visits = [{ id: 11, jobId: 1, type: 'fitting', date: '2026-08-21T09:00:00Z', arrivalStart: '09:00', arrivalEnd: '12:00' }];
const calls = [];
global.DB = {
  async getJobs(filters = {}) { return jobs.filter(job => (!filters.orderId || job.orderId === filters.orderId) && (!filters.customerId || job.customerId === filters.customerId)); },
  async getJob(id) { return jobs.find(job => job.id === id) || null; },
  async getJobAppointments() { return visits; },
  async getCustomer() { return { id: 7, fullName: 'Alice Smith' }; },
  async createJobFromOrder(orderId, data, operationId) { calls.push(['create', orderId, operationId]); return { job: jobs[0], created: true }; },
  async setJobStage(id, stage) { calls.push(['stage', id, stage]); jobs[0].status = stage; return jobs[0]; }
};

(0, eval)(source);
const Jobs = App.features.get('jobs');
const assert = (condition, message, extra) => {
  if (!condition) { console.error('FAIL:', message, extra || ''); process.exitCode = 1; }
  else console.log('OK:', message);
};

(async () => {
  assert(Jobs && Jobs.route === false, 'Jobs is secondary and does not change primary navigation');
  const list = await Jobs.renderList({ orderId: 4 });
  assert(list.includes('JOB-2026-0001') && list.includes('+ Job'), 'order job list opens existing jobs and intentionally allows another');

  const detail = await Jobs.renderJob(1);
  assert(detail.includes('Materials ordered') && detail.includes('Field operations'), 'job detail includes operational stage and field-service workspace');
  assert(detail.includes('09:00–12:00'), 'linked fitting visit preserves and displays its arrival window');
  assert(detail.includes('aria-pressed="true"'), 'current operational stage is exposed accessibly');
  assert(!detail.includes('JobsFeature.transition\" data-args=\'[1,\"completed\"]') && detail.includes('do not change payment status'), 'completion and sign-off remain explicit checked actions, separate from stage/payment');

  await Jobs.transition(1, 'materials_received');
  assert(calls.some(call => call[0] === 'stage' && call[2] === 'materials_received'), 'stage transition uses the DB domain API');
  Jobs.scheduleVisit(1, 'service_call', 'return_visit');
  const nav = App.navigations.at(-1);
  assert(nav[0] === 'appointments' && nav[1].jobId === 1 && nav[1].type === 'service_call' && nav[1].jobRole === 'return_visit', 'job visit reuses the appointment scheduler with an explicit return role');
  assert(!JSON.stringify(nav).includes('Alice'), 'job scheduling puts no customer PII in the URL');

  const apptsSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/appointments/appointments.js'), 'utf8');
  const ordersSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/orders/orders.js'), 'utf8');
  const customerSource = fs.readFileSync(path.join(__dirname, '..', 'js/features/customer/customer.js'), 'utf8');
  assert(apptsSource.includes('DB.scheduleJobVisit(jobId,') && apptsSource.includes('readArrivalWindow') && apptsSource.includes('operationId: jobOperationId'), 'job appointment save retains arrival-window validation and uses a retry-safe job domain operation');
  assert(ordersSource.includes("DB.getJobs({ orderId })") && ordersSource.includes("['jobs', { orderId: order.id }]") , 'order sheet opens its jobs without altering commercial stages');
  assert(customerSource.includes("DB.getJobs({ customerId })") && customerSource.includes('Jobs (${jobs.length})'), 'Customer 360 lists linked jobs');
  assert(ordersSource.includes('OrdersFeature.setStage') || ordersSource.includes('setStage(orderId'), 'legacy order stage workflow remains present');

  console.log(process.exitCode ? '\nJOBS TEST FAILED' : '\nJOBS TEST PASSED');
})();
