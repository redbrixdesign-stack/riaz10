'use strict';
const fs = require('fs');
const path = require('path');

global.Utils = {
  formatDate(value) { return new Date(value).toISOString().slice(0, 10); }
};

let rows = [];
let nextId = 1;
const events = new Map();
global.DB = {
  async getTasks() { return rows.map(r => ({ ...r })); },
  async addTask(data) {
    const row = { id: nextId++, status: 'open', createdAt: new Date().toISOString(), ...data };
    rows.push(row); return { ...row };
  },
  async createTaskFromSuggestion(sourceKey, data) {
    let row = rows.find(r => r.sourceKey === sourceKey);
    if (!row) { row = { id: nextId++, status: 'open', sourceKey, ...data }; rows.push(row); }
    return { ...row };
  },
  async completeTask(id, operationId) {
    if (events.has(operationId)) return { ...events.get(operationId) };
    const row = rows.find(r => r.id === id);
    row.status = 'completed'; row.completedAt = new Date().toISOString();
    events.set(operationId, row); return { ...row };
  },
  async snoozeTask(id, until, operationId) {
    if (events.has(operationId)) return { ...events.get(operationId) };
    const row = rows.find(r => r.id === id);
    row.status = 'snoozed'; row.snoozedUntil = until;
    events.set(operationId, row); return { ...row };
  }
};

const code = fs.readFileSync(path.join(__dirname, '..', 'js/services/tasks.js'), 'utf8');
(0, eval)(`${code}\nglobal.TaskService = TaskService;`);
const ok = (name, condition, detail) => {
  if (!condition) { console.error('FAIL:', name, detail || ''); process.exitCode = 1; }
  else console.log('OK:', name);
};

(async () => {
  const derived = {
    kind: 'quote', action: 'Call about quote', template: 'follow_up.quote',
    appointment: { id: 42, outcome: 'quoted' }, due: true
  };
  const key = TaskService.derivedKey(derived);
  ok('stable quote natural key', key === 'quote:appointment:42:follow_up.quote', key);

  rows = [];
  let merged = await TaskService.merge([derived]);
  ok('unlinked derived suggestion is preserved', merged.length === 1 && !merged[0].durable && merged[0].due);

  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const linked = await TaskService.createFromSuggestion(derived, { snoozedUntil: tomorrow });
  merged = await TaskService.merge([derived]);
  ok('linked durable task replaces derived duplicate', merged.length === 1 && merged[0].durable && merged[0].id === linked.id);
  ok('future snooze is not due', merged[0].snoozed && !merged[0].due);

  rows.push({ id: nextId++, title: 'Call supplier', type: 'call', status: 'open', dueAt: new Date(Date.now() - 1000).toISOString(), priority: 'high' });
  merged = await TaskService.merge([derived]);
  ok('manual task merges alongside source-linked suggestion', merged.length === 2 && merged.some(t => t.title === 'Call supplier' && t.due));

  let rejected = false;
  try { await TaskService.create({ title: ' ', dueAt: tomorrow }); } catch (e) { rejected = /title/i.test(e.message); }
  ok('blank title rejected', rejected);
  rejected = false;
  try { await TaskService.create({ title: 'Valid', dueAt: 'bad-date' }); } catch (e) { rejected = /due date/i.test(e.message); }
  ok('invalid due date rejected', rejected);

  const created = await TaskService.create({ title: 'Prepare samples', dueAt: tomorrow });
  ok('manual task created with normalized defaults', created.type === 'other' && created.priority === 'normal');
  const op = 'complete-once';
  const first = await TaskService.complete(created.id, op);
  const second = await TaskService.complete(created.id, op);
  ok('completion operation is idempotent', first.id === second.id && events.size === 1);

  rows = rows.filter(r => r.id !== linked.id);
  merged = await TaskService.merge([derived]);
  ok('unresolved source suggestion returns after linked record resolves/disappears', merged.some(t => !t.durable && t.derivedKey === key));

  const appointments = new Map([[10, { id: 10, status: 'completed', outcome: 'measured' }], [11, { id: 11, status: 'cancelled' }], [12, { id: 12, outcome: 'quoted' }]]);
  DB.getAppointment = async id => appointments.get(id);
  DB.db = { orders: { toArray: async () => [{ id: 99, appointmentId: 12, status: 'deposit_pending' }] } };
  DB.resolveTask = async (id, reason, op) => {
    const row = rows.find(r => r.id === id);
    row.resolutionReason = reason;
    return DB.completeTask(id, op);
  };
  rows = [
    { id: 201, appointmentId: 10, sourceKey: 'message:intro-day-before:appointment:10', status: 'open', snoozedUntil: tomorrow },
    { id: 202, appointmentId: 11, sourceKey: 'visit-outcome:appointment:11', status: 'open' },
    { id: 203, appointmentId: 12, sourceKey: 'quote:appointment:12:follow_up.quote', status: 'open' },
    { id: 204, appointmentId: 10, title: 'Submit final measurements', status: 'open' },
    { id: 205, appointmentId: 10, sourceKey: 'message:service:appointment:10', status: 'open' },
    { id: 206, appointmentId: 10, sourceKey: 'message:post-fit:appointment:10', status: 'open' },
    { id: 207, appointmentId: 999, sourceKey: 'message:intro:appointment:999', status: 'open' }
  ];
  merged = await TaskService.merge([]);
  ok('completed, cancelled and linked order resolve snoozed/source reminders', [201, 202, 203].every(id => !merged.some(t => t.id === id) && rows.find(t => t.id === id).resolutionReason));
  ok('manual, service, postfit and missing source reminders preserved', [204, 205, 206, 207].every(id => merged.some(t => t.id === id)));
  ok('resolution never invents sent flags', !appointments.get(10).introSent && !appointments.get(10).dayBeforeSent);
  const count = events.size;
  await TaskService.merge([]);
  ok('automatic resolution is idempotent', events.size === count);
  ok('other customer order does not clear a quote', !TaskService.appointmentResolution(key, { id: 42, outcome: 'quoted' }, [{ appointmentId: 43, customerId: 1 }]));
  ok('cancelled order does not clear a quote', !TaskService.appointmentResolution(key, { id: 42, outcome: 'quoted' }, [{ appointmentId: 42, status: 'cancelled' }]));
  DB.getAppointment = async () => { throw new Error('Synthetic read failure'); };
  merged = await TaskService.merge([]);
  ok('read failure never clears reminders', merged.some(t => t.id === 207));

  DB.getAppointment = async id => ({ id, status: 'confirmed', date: tomorrow });
  rows = [
    { id: 301, appointmentId: 30, sourceKey: 'message:intro:appointment:30', status: 'open', snoozedUntil: tomorrow },
    { id: 302, appointmentId: 30, sourceKey: 'message:day-before:appointment:30', status: 'open', dueAt: new Date().toISOString() }
  ];
  const combined = { kind: 'intro_confirmation', appointment: { id: 30 }, template: 'intro_day_before', due: true };
  merged = await TaskService.merge([combined]);
  ok('old intro and reminder consolidate into current combined purpose', merged.length === 1 && merged[0].kind === 'intro_confirmation' && merged[0].template === 'intro_day_before');
  ok('latest explicit snooze survives purpose transition', merged[0].id === 301 && merged[0].snoozed && !merged[0].due);
  ok('duplicate history retained with consolidation reason', rows.find(r => r.id === 302).resolutionReason === 'previsit_purpose_consolidated');
  ok('expired saved previsit reminder is resolved without pretending sent', TaskService.appointmentResolution('message:intro:appointment:30', { date: '2000-01-01', status: 'confirmed' }) === 'previsit_window_closed');
})();
