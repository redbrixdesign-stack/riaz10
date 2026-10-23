'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let clock = new Date('2026-10-23T08:00:00Z').getTime();
const appointments = new Map();
let saved = [];
const context = vm.createContext({ console,
  Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
  document: {}, window: {}, localStorage: { getItem: () => null },
  App: { registerFeature() {} }, TalkFeature: { SERVICE_OUTCOMES: {}, getTemplateForOutcome: () => null },
  DB: {
    getPipeline: async () => [], getUpcomingAppointments: async () => [...appointments.values()],
    getAppointmentsForDate: async () => [...appointments.values()], getAllAppointments: async () => [...appointments.values()],
    getCustomersByIds: async () => [], getAppointment: async id => appointments.get(id), getTasks: async () => saved,
    db: { orders: { toArray: async () => [] }, communications: { toArray: async () => [] } }
  }
});
for (const file of ['js/core/config.js', 'js/core/utils.js', 'js/services/tasks.js', 'js/features/followups/followups.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const { Utils, FollowupsFeature, TaskService } = vm.runInContext('({ Utils, FollowupsFeature, TaskService })', context);
const base = { id: 1, date: '2026-10-23T09:00:00Z', durationSlots: 4, status: 'confirmed', introSent: true, dayBeforeSent: true };
(async () => {
  appointments.set(1, { ...base });
  let task = (await FollowupsFeature.loadTasks()).find(t => t.kind === 'visit_today');
  assert.equal(task?.due, false, 'Future visits are not due outcomes');
  clock = Date.parse('2026-10-23T09:30:00Z');
  task = (await FollowupsFeature.loadTasks()).find(t => t.kind === 'visit_today');
  assert.equal(task?.due, false, 'Ongoing scheduled duration is not due');
  clock = Date.parse('2026-10-23T10:00:00Z');
  task = (await FollowupsFeature.loadTasks()).find(t => t.kind === 'visit_today');
  assert.equal(task?.due, true, 'Outcome due exactly at planned end');
  clock += 3600000;
  assert.equal((await FollowupsFeature.loadTasks()).find(t => t.kind === 'visit_today')?.due, true, 'Earlier-today overdue visit retained');
  for (const visit of [{ ...base, status: 'cancelled' }, { ...base, status: 'completed' }, { ...base, outcome: 'fitted' }]) {
    appointments.set(1, visit);
    assert(!(await FollowupsFeature.loadTasks()).some(t => t.kind === 'visit_today'), 'Concluded/cancelled visit excluded');
  }
  assert.equal(Utils.visitOutcomeDueAt({ date: base.date }).toISOString(), '2026-10-23T09:15:00.000Z', 'Legacy visits use existing one-slot default');
  for (const durationSlots of [0, -1, 'invalid', Infinity]) assert.equal(Utils.visitOutcomeDueAt({ ...base, durationSlots }).toISOString(), '2026-10-23T09:15:00.000Z');
  assert.equal(Utils.visitOutcomeDueAt({ ...base, arrivalEnd: '17:00' }).toISOString(), '2026-10-23T10:00:00.000Z', 'Arrival window is not visit duration');
  assert.equal(Utils.visitOutcomeDueAt({ date: 'invalid' }), null);
  for (const [date, end] of [['2026-03-29T00:45:00Z', '2026-03-29T01:45:00.000Z'], ['2026-10-25T00:45:00Z', '2026-10-25T01:45:00.000Z']]) {
    assert.equal(Utils.visitOutcomeDueAt({ date, durationSlots: 4 }).toISOString(), end, 'Duration uses elapsed time across DST');
  }
  // An old snooze must not make an outcome due after moving its visit later.
  appointments.set(1, { ...base, date: '2026-10-24T09:00:00Z' });
  saved = [{ id: 9, status: 'snoozed', type: 'visit_today', appointmentId: 1, sourceKey: 'visit-outcome:appointment:1', dueAt: '2026-10-23T08:00:00Z', snoozedUntil: '2026-10-23T09:00:00Z', title: 'Outcome' }];
  task = (await TaskService.merge([], new Date(clock)))[0];
  assert.equal(task.due, false, 'Persisted outcome follows moved visit even outside derived list');
  assert.equal(task.effectiveDue, '2026-10-24T10:00:00.000Z');
  saved[0].snoozedUntil = '2026-10-24T12:00:00Z';
  task = (await TaskService.merge([], new Date(clock)))[0];
  assert.equal(task.effectiveDue, '2026-10-24T12:00:00.000Z', 'Later adviser snooze preserved');
  assert.equal(saved[0].dueAt, '2026-10-23T08:00:00Z', 'Rendering does not rewrite stored task');
  console.log('PASS outcome timing: future/ongoing/end/overdue, excluded states, legacy/invalid durations, arrival-window independence, DST, reschedule and snooze');
})().catch(error => { console.error(error); process.exitCode = 1; });
