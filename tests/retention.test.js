const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const source = fs.readFileSync('js/features/retention/retention.js', 'utf8');
const state = { records: [], preferences: [], navigations: [] }; const elements = {};
const sandbox = { console, Date, document: { getElementById: id => elements[id] || null }, Utils: { escapeHtml: String, formatDate: value => String(value).slice(0, 10) }, Toast: { show() {} }, App: { registerFeature(feature) { sandbox.RetentionFeature = feature; }, renderTopHeader: ({ title }) => title, openModal() {}, closeModal() {}, navigate(feature, params) { state.navigations.push({ feature, params }); } }, DB: {
  async getCustomer() { return { id: 7, fullName: 'Mrs Smith' }; }, async getRetentionRecords() { return state.records; }, async addRetentionRecord(data) { const row = { ...data, id: state.records.length + 1 }; state.records.push(row); return row; }, async updateRetentionRecord(id, patch) { Object.assign(state.records.find(row => row.id === id), patch); }, async getContactPreferences() { return state.preferences; }, async setContactPreference(data, operationId) { state.preferences = state.preferences.filter(row => row.channel !== data.channel); state.preferences.push({ ...data, operationId }); }
} };
vm.createContext(sandbox); vm.runInContext(source, sandbox); const feature = sandbox.RetentionFeature;
(async () => {
  elements['retention-type'] = { value: 'review_request' }; elements['retention-due'] = { value: '2026-09-01' }; elements['retention-notes'] = { value: 'Ask only after satisfaction check' };
  await feature.saveNew(7); assert.equal(state.records[0].status, 'planned'); assert.equal(state.records[0].type, 'review_request');
  await feature.togglePreference(7, 'whatsapp', 'opted_in'); assert.equal(state.preferences[0].status, 'opted_in'); assert.equal(state.preferences[0].consentSource, 'advisor_recorded');
  elements['retention-outcome'] = { value: 'Review left' }; await feature.saveCompletion(1, 7, 'review_request'); assert.equal(state.records[0].status, 'completed'); assert.ok(state.records[0].completedAt); assert.equal(state.records[0].outcome, 'Review left');
  const html = await feature.renderCustomer(7); assert.match(html, /Opening a messaging app never counts as consent or delivery/); assert.match(html, /Review request/);
  console.log('✓ retention lifecycle and explicit contact preference workflow');
})().catch(error => { console.error(error); process.exit(1); });
