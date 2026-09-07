'use strict';
const fs = require('fs');
const path = require('path');
const events = [];
const comms = [];
global.Utils = { escapeHtml: String };
global.App = { registerFeature: f => { global.CommunicationsFeature = f; } };
global.DB = {
  getContactPreferences: async () => ({ current: { whatsapp: { customerId: 1, channel: 'whatsapp', status: 'opted_out' } } }),
  setContactPreference: async x => x,
  addCommunication: async x => { const r = { id: comms.length + 1, sentAt: null, createdAt: new Date().toISOString(), ...x }; comms.push(r); return r; },
  updateCommunication: async (id, patch) => Object.assign(comms.find(c => c.id === id), patch),
  recordCommunicationEvent: async (id, state, data, op) => { const x = { communicationId: id, state, ...data, operationId: op }; events.push(x); return x; },
  getCommunicationEvents: async id => events.filter(e => e.communicationId === id),
  enqueueIntegrationOutbox: async x => x,
  getIntegrationLinks: async () => [{ id: 1 }]
};
const code = fs.readFileSync(path.join(__dirname, '..', 'js/services/communications.js'), 'utf8');
(0, eval)(`${code}\nglobal.CommunicationService=CommunicationService;global.IntegrationAdapterRegistry=IntegrationAdapterRegistry;`);
const ok = (name, condition) => { if (!condition) { console.error('FAIL:', name); process.exitCode = 1; } else console.log('OK:', name); };

(async () => {
  const pref = await CommunicationService.preference(1);
  ok('opt-out preference blocks contact', !CommunicationService.canContact(pref));
  const comm = await CommunicationService.recordHandoff({ customerId: 1, content: 'Hi' });
  ok('app handoff records handed_off only', events.length === 1 && events[0].lifecycleState === 'handed_off' && !events.some(e => e.state === 'delivered'));
  ok('handoff has no sent timestamp', comm.sentAt === null);
  let decorated = await CommunicationService.lifecycle(comm);
  ok('handoff lifecycle remains unconfirmed', decorated.lifecycleState === 'handed_off' && !CommunicationService.isConfirmed(decorated));
  await CommunicationService.advisorConfirmSent(comm.id, 1);
  ok('advisor confirmation is separate explicit state', events[1].lifecycleState === 'advisor_confirmed_sent');
  ok('confirmation adds the sent timestamp', !!comms[0].sentAt);
  decorated = await CommunicationService.lifecycle(comms[0]);
  ok('confirmed lifecycle is safe for sent history', CommunicationService.isConfirmed(decorated));
  const reply = await CommunicationService.recordReply(1, 'Tuesday works well', 'whatsapp');
  ok('manual inbound reply is recorded with provenance', reply.direction === 'inbound' && reply.receivedAt && events.at(-1).provenance === 'advisor_recorded_reply');
  let failed = false;
  try { await IntegrationAdapterRegistry.enqueue('manual', 'customer', 1, 'push', {}); } catch (e) { failed = /disconnected/.test(e.message); }
  ok('built-in manual adapter is disabled by default', failed);
  const adapter = IntegrationAdapterRegistry.get('manual');
  await adapter.connect();
  const queued = await IntegrationAdapterRegistry.enqueue('manual', 'customer', 1, 'push', {});
  ok('enabled adapter queues local-first outbox with provenance', queued.status === 'pending' && queued.provenance === 'local');
  const result = await IntegrationAdapterRegistry.disconnect('manual');
  ok('disconnect preserves local data and provenance links', result.localDataPreserved && result.retainedLinks === 1);
})();
