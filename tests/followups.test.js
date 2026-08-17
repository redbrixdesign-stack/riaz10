// Follow-ups feature: intro tasks must appear for ANY upcoming booking
// (including one 10 days out, created today), and drop once introSent.
'use strict';

const path = require('path');
const fs = require('fs');

function loadAll(entries) {
  const code = entries.map(e => fs.readFileSync(path.join(__dirname, '..', e), 'utf8')).join('\n;\n');
  (0, eval)(code);
}

global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild() {}, remove() {} }),
  head: { appendChild() {} },
  addEventListener() {},
  body: { appendChild() {} }
};
global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.App = {
  features: new Map(),
  registerFeature(f) { this.features.set(f.id, f); },
  navigate() {},
  closeModal() {},
  openModal() {}
};

global.TalkFeature = {
  getTemplateForOutcome: () => null,
  apptTimeText: () => '14:00',
  SERVICE_OUTCOMES: { fitting: [], service_call: [] }
};

const FAR_APPTS = [];
const NEXT5 = [];
const TODAY_APPTS = [];
const ALL_APPTS = [];

global.DB = {
  getPipeline: async () => [],
  getUpcomingAppointments: async days => (days >= 60 ? FAR_APPTS : NEXT5),
  getAppointmentsForDate: async () => TODAY_APPTS,
  db: {
    orders: { toArray: async () => [] },
    customers: { bulkGet: async ids => [] },
    appointments: { toArray: async () => ALL_APPTS }
  },
  getAllAppointments: async () => ALL_APPTS
};

loadAll([
  'js/core/config.js',
  'js/core/utils.js',
  'js/features/followups/followups.js'
]);

const assert = (cond, msg, extra) => { if (!cond) { console.error('FAIL:', msg, extra || ''); process.exitCode = 1; } else console.log('OK:', msg); };
const iso = days => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(11, 0, 0, 0); return d.toISOString(); };

const Followups = global.App.features.get('followups');

(async () => {
  // Far-out booking (10 days), brand-new customer with a phone.
  FAR_APPTS.push({
    id: 101, customerId: 9, clientName: 'Amelia Green', phone: '07700900123',
    type: 'consultation', date: iso(10), address: '9 Birch Lane', status: 'confirmed'
  });
  let tasks = await Followups.loadTasks();
  const intro = tasks.find(t => t.kind === 'intro');
  assert(!!intro, 'A booking 10 days out gets an intro task');
  assert(intro && intro.appointment && intro.appointment.id === 101, 'The intro task points at the far-out booking', intro && intro.appointment);
  assert(intro && intro.due === true && intro.template === 'pre_intro', 'The intro task is due with the pre_intro template', intro);

  // Once the intro is sent it disappears.
  FAR_APPTS[0].introSent = true;
  tasks = await Followups.loadTasks();
  assert(!tasks.some(t => t.kind === 'intro'), 'Intro task drops once introSent is set');
  FAR_APPTS[0].introSent = false;

  // Existing customer with a prior completed visit: not first-time.
  ALL_APPTS.push({ id: 900, customerId: 9, date: iso(-40), status: 'completed', outcome: 'ordered' });
  tasks = await Followups.loadTasks();
  assert(!tasks.some(t => t.kind === 'intro'), 'Returning customers get no intro task');

  console.log(process.exitCode ? '\nFOLLOWUPS TEST FAILED' : '\nFOLLOWUPS TEST PASSED');
})();