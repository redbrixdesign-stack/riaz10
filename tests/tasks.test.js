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
})();
