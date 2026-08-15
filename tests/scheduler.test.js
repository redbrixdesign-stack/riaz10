/* ============================================
   ADVISOROS — MESSAGE SCHEDULER TESTS
   Run with: node tests/scheduler.test.js

   Covers the automated message cadence (js/services/message-scheduler.js):
   UK-time scheduling math, timer placement from upcoming appointments,
   single-fire flags, the static-template fallback when AI is off, the AI
   draft path, and the on-my-way departure trigger.

   Runs in a vm sandbox with a frozen UK clock (Utils.ukParts is stubbed so
   the scheduling math is deterministic), a captured setTimeout, and stub
   DB/TalkFeature/AIService collaborators.
   ============================================ */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

let failures = 0;
function ok(label, cond, extra) {
  if (cond) {
    console.log('  OK ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

function makeLocalStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

// Build a sandbox with a controllable UK clock and captured timers.
// uk: {year, month, day, hour, minute, second} wall-clock values for now.
// nowMs: optional frozen "new Date()" instant (all Date-constructed "now"
// calls return this instant; parsed dates still work normally).
function loadScheduler({ uk, aiEnabled = false, autoMessages, appointments = [], apptById = {}, nowMs } = {}) {
  const sandbox = {
    console, Math, JSON, Date, Promise, Map, Set, Array, Object,
    Number, String, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
    AbortController, URL, localStorage: makeLocalStorage()
  };
  if (nowMs !== undefined) {
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [nowMs])); }
    }
    sandbox.Date = FakeDate;
  }
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.Toast = { show() {} };

  // Captured timers: tests fire them manually by index.
  sandbox.timers = [];
  sandbox.clearTimeout = t => { sandbox.timers.splice(sandbox.timers.indexOf(t), 1); };
  sandbox.setTimeout = (fn, ms) => { const t = { fn, ms }; sandbox.timers.push(t); return t; };

  vm.createContext(sandbox);
  const CONFIG = vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/config.js'), 'utf8') + ';CONFIG;', sandbox);
  CONFIG.ai = { enabled: aiEnabled, proxyUrl: aiEnabled ? 'https://proxy.test/claude' : '', draftModel: 'claude-haiku-4-5' };
  CONFIG.autoMessages = { enabled: true, eveningHour: 18, morningHour: 8, ...autoMessages };
  if (autoMessages && autoMessages.enabled === false) CONFIG.autoMessages.enabled = false;

  const Utils = vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/utils.js'), 'utf8') + ';Utils;', sandbox);
  const realUkParts = Utils.ukParts.bind(Utils);
  Utils.ukParts = (d) => d === undefined
    ? { year: uk.year, month: uk.month, day: uk.day, hour: uk.hour, minute: uk.minute, second: uk.second }
    : realUkParts(d);

  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/services/notification.js'), 'utf8'), sandbox);

  // Stub collaborators.
  sandbox.DB = {
    getUpcomingAppointments: async () => appointments,
    db: { appointments: { get: async id => apptById[id] } }
  };
  sandbox.TalkFeature = {
    pendingMessage: null,
    lastSheet: null,
    getLiveEta: async appt => appt._liveEta !== undefined ? appt._liveEta : { etaMin: 12 },
    buildAiContext: async pending => ({
      customerName: 'Alice Smith',
      firstName: 'Alice Smith',
      appointmentTime: '14:00',
      visitAddress: '12 Example Street, M14 7FZ',
      advisorName: 'Tom Advisor',
      ...pending
    }),
    buildMessageContext: async pending => ({
      customer_name: 'Alice Smith',
      address: '12 Example Street, M14 7FZ',
      advisor_name: 'Tom Advisor',
      time_start: '14:00',
      stage: 'day_before',
      ...pending
    }),
    openPreviewSheet: function (message, pending, hint) { this.lastSheet = { message, pending, hint }; }
  };
  sandbox.AIService = {
    isEnabled: () => CONFIG.ai.enabled,
    draftMessage: async context => {
      sandbox.draftContexts = sandbox.draftContexts || [];
      sandbox.draftContexts.push(context);
      return { ok: true, text: 'AI DRAFT: ' + (context.eta || 'no eta') };
    }
  };

  const MessageScheduler = vm.runInContext(
    fs.readFileSync(path.join(REPO, 'js/services/message-scheduler.js'), 'utf8') + '\n;MessageScheduler;',
    sandbox
  );
  MessageScheduler.sandbox = sandbox;
  return MessageScheduler;
}

// Frozen "now" for every scheduler test: 2026-08-11 12:00 UK (BST, UTC+1).
// Visit dates are UTC instants whose UK calendar day is unambiguous on any
// host timezone (e.g. 10:00 UTC = 11:00 BST = the same UK day).
function ukDay(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 10)).toISOString(); // 11:00 BST that day
}

function appt(id, dateISO, phone = '07700123456') {
  return { id, customerId: 1, phone, address: '12 Example Street, M14 7FZ', date: dateISO };
}

(async () => {
  console.log('\nTest A: Utils.firstNameFrom (honorific handling)');
  {
    const sandbox = { console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, RegExp, Error, parseInt, parseFloat, isNaN, AbortController, URL, localStorage: makeLocalStorage() };
    sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/utils.js'), 'utf8'), sandbox);
    const Utils = vm.runInContext('Utils;', sandbox);
    ok('plain name keeps first word', Utils.firstNameFrom('Bob Smith') === 'Bob');
    ok('Dr title skipped', Utils.firstNameFrom('Dr Sarah Jones') === 'Sarah');
    ok('Mrs title skipped', Utils.firstNameFrom('Mrs Jane Doe') === 'Jane');
    ok('Mr title skipped', Utils.firstNameFrom('Mr. John Doe') === 'John');
    ok('empty falls back to "there"', Utils.firstNameFrom('') === 'there');
    ok('missing falls back to "there"', Utils.firstNameFrom(null) === 'there');
  }

  console.log('\nTest B: UK-time scheduling math');
  {
    const s = loadScheduler({ uk: { year: 2026, month: 8, day: 11, hour: 12, minute: 0, second: 0 } });
    ok('evening today at 18:00 is 6h out', s._msUntilUKTime(0, 18, 0) === 6 * 3600 * 1000);
    ok('morning tomorrow at 08:00 is 20h out', s._msUntilUKTime(1, 8, 0) === 20 * 3600 * 1000);
    ok('a passed slot fires immediately (catch-up)', s._msUntilUKTime(0, 8, 0) === 0);
    ok('day distance: tomorrow visit is 1', s._daysFromNowUK(ukDay(2026, 8, 12)) === 1);
    ok('day distance: today visit is 0', s._daysFromNowUK(ukDay(2026, 8, 11)) === 0);
    ok('day distance: yesterday visit is -1', s._daysFromNowUK(ukDay(2026, 8, 10)) === -1);
  }

  console.log('\nTest C: reschedule places timers from upcoming appointments');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 12, minute: 0, second: 0 },
      appointments: [
        appt(1, ukDay(2026, 8, 12)), // tomorrow → evening + morning drafts
        appt(2, ukDay(2026, 8, 11)), // today → morning draft only
        appt(3, ukDay(2026, 8, 16))  // 5 days out → no draft
      ]
    });
    await s.reschedule();
    const timers = s.sandbox.timers;
    ok('three timers scheduled', timers.length === 3, timers.map(t => t.ms));
    const evening = timers.find(t => t.ms === 6 * 3600 * 1000);
    const morningTomorrow = timers.find(t => t.ms === 20 * 3600 * 1000);
    const morningToday = timers.find(t => t.ms === 0);
    ok('evening-before fires today at 18:00', !!evening);
    ok('morning-of fires tomorrow at 08:00', !!morningTomorrow);
    ok('morning-of for today fires now (past 08:00 catch-up)', !!morningToday);
  }

  console.log('\nTest D: disabled config schedules nothing');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 12, minute: 0, second: 0 },
      autoMessages: { enabled: false },
      appointments: [appt(1, ukDay(2026, 8, 12))]
    });
    await s.reschedule();
    ok('no timers when disabled', s.sandbox.timers.length === 0);
    ok('settings() reports disabled', s.isEnabled() === false);
  }

  console.log('\nTest E: evening-before fires a reviewed draft (static template, AI off)');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 18, minute: 30, second: 0 }, // past 18:00 → catch-up fires now
      appointments: [appt(1, ukDay(2026, 8, 12))]
    });
    await s.reschedule();
    await s.sandbox.timers[0].fn();
    const sheet = s.sandbox.TalkFeature.lastSheet;
    ok('sheet opened', !!sheet);
    ok('draft names the customer', sheet.message.includes('Alice'), sheet.message);
    ok('draft names the visit day', /tomorrow/.test(sheet.message), sheet.message);
    ok('draft carries review hint', sheet.hint.includes('review before sending'), sheet.hint);
    ok('pending ties to the appointment', sheet.pending.appointmentId === 1 && sheet.pending.templateKey === 'evening_before');
    ok('flag set after fire', s.sandbox.localStorage.getItem(s._flag('evening_before', 1)) === '1');
    ok('re-fire blocked by flag', s.sandbox.timers[0].fn ? await (async () => { const before = s.sandbox.TalkFeature.lastSheet.message; await s.sandbox.timers[0].fn(); return s.sandbox.TalkFeature.lastSheet.message === before; })() : false);
  }

  console.log('\nTest F: AI draft path (AI on)');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 7, minute: 0, second: 0 },
      aiEnabled: true,
      appointments: [appt(2, ukDay(2026, 8, 11))]
    });
    await s.reschedule();
    await s.sandbox.timers[0].fn();
    const sheet = s.sandbox.TalkFeature.lastSheet;
    ok('AI text used', sheet && sheet.message === 'AI DRAFT: no eta', sheet && sheet.message);
    ok('AI got appointment context', s.sandbox.draftContexts && s.sandbox.draftContexts[0].appointmentId === 2);
  }

  console.log('\nTest G: on-departure (on my way) trigger');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 12, minute: 0, second: 0 },
      aiEnabled: true,
      apptById: { 7: { id: 7, customerId: 1, phone: '07700123456', _liveEta: { etaMin: 12 } } }
    });
    await s.onDeparture(7);
    const sheet = s.sandbox.TalkFeature.lastSheet;
    ok('on-my-way sheet opened', !!sheet && sheet.pending.templateKey === 'on_my_way');
    ok('AI draft includes the live ETA', sheet.message === 'AI DRAFT: 12 minutes', sheet.message);
    ok('ETA hint explains the estimate', sheet.hint.includes('about 12 minutes'), sheet.hint);
    ok('departure fires once', (await s.onDeparture(7), s.sandbox.TalkFeature.lastSheet) === sheet);
  }

  console.log('\nTest H: departure without a live ETA flags it as a placeholder');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 12, minute: 0, second: 0 },
      aiEnabled: true,
      apptById: { 9: { id: 9, customerId: 1, phone: '07700123456', _liveEta: null } }
    });
    await s.onDeparture(9);
    ok('placeholder hint when no live ETA', s.sandbox.TalkFeature.lastSheet.hint.includes("Couldn't work out a live ETA"), s.sandbox.TalkFeature.lastSheet.hint);
  }

  console.log('\nTest I: a failed fire retries instead of burning the stage');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 18, minute: 30, second: 0 },
      appointments: [appt(1, ukDay(2026, 8, 12))]
    });
    await s.reschedule();
    // Break the static template: the draft cannot be built, so nothing
    // should be flagged — the next boot's catch-up can retry the stage.
    vm.runInContext('CONFIG.templates.evening_before = undefined;', s.sandbox);
    await s.sandbox.timers[0].fn();
    ok('failed draft opens no sheet', !s.sandbox.TalkFeature.lastSheet);
    ok('failed draft leaves the flag unset', s.sandbox.localStorage.getItem(s._flag('evening_before', 1)) === null);
    // Template restored: the same stage (simulating the next boot) fires and flags.
    vm.runInContext('CONFIG.templates.evening_before = "See you tomorrow {{firstName}} — {{advisorName}}";', s.sandbox);
    await s.sandbox.timers[0].fn();
    ok('retry fires the draft once the template exists', !!s.sandbox.TalkFeature.lastSheet && s.sandbox.TalkFeature.lastSheet.message.includes('Alice'), s.sandbox.TalkFeature.lastSheet);
    ok('retry sets the flag', s.sandbox.localStorage.getItem(s._flag('evening_before', 1)) === '1');
  }

  console.log('\nTest J: notification service reliability (popup fallback + UK-day tiers)');
  {
    const s = loadScheduler({
      uk: { year: 2026, month: 8, day: 11, hour: 13, minute: 0, second: 0 },
      nowMs: Date.UTC(2026, 7, 11, 12, 0, 0)
    });
    const NotificationService = vm.runInContext('NotificationService;', s.sandbox);
    // Popup-blocked window.open falls back to navigating the tab.
    vm.runInContext('window.open = () => null;', s.sandbox);
    vm.runInContext('window.location = { href: null };', s.sandbox);
    const sent = vm.runInContext('NotificationService.sendWhatsApp("07700 900123", "Hi");', s.sandbox);
    ok('popup-blocked send falls back to tab navigation', sent === true && String(vm.runInContext('window.location.href', s.sandbox)).includes('wa.me/447700900123'), vm.runInContext('window.location.href', s.sandbox));
    // UK-day tiers: visit on 12 Aug (frozen now 11 Aug, UK clock) = tomorrow.
    const tomorrowMsg = vm.runInContext('NotificationService.buildBookingConfirmationMessage({ firstName: "Sam", dateLabel: "12 Aug", time: "at 09:00", address: "", type: "measure", advisorName: "Tom", date: new Date("2026-08-12T08:00:00Z") });', s.sandbox);
    ok('booking confirmation tiers tomorrow correctly', tomorrowMsg.includes('tomorrow') && tomorrowMsg.includes('measurement'), tomorrowMsg);
    // Visit four UK days out = the "later" tier with the reminder promise.
    const laterMsg = vm.runInContext('NotificationService.buildBookingConfirmationMessage({ firstName: "Sam", dateLabel: "15 Aug", time: "at 09:00", address: "", type: "consultation", advisorName: "Tom", date: new Date("2026-08-15T08:00:00Z") });', s.sandbox);
    ok('booking confirmation tiers later with the reminder promise', laterMsg.includes("little way off") && laterMsg.includes('reminder'), laterMsg);
    // DST boundary: 23:30Z on 24 Oct 2026 is 00:30 BST on the 25th in the UK,
    // so a visit booked for 25 Oct is TODAY's visit, not tomorrow's.
    const s2 = loadScheduler({
      uk: { year: 2026, month: 10, day: 25, hour: 0, minute: 30, second: 0 },
      nowMs: Date.UTC(2026, 9, 24, 23, 30, 0)
    });
    const N2 = vm.runInContext('NotificationService;', s2.sandbox);
    const boundaryMsg = vm.runInContext('NotificationService.buildBookingConfirmationMessage({ firstName: "Sam", dateLabel: "25 Oct", time: "at 09:00", address: "", type: "measure", advisorName: "Tom", date: new Date("2026-10-25T08:00:00Z") });', s2.sandbox);
    ok('booking confirmation follows the UK day across the autumn DST jump', boundaryMsg.includes('with you today'), boundaryMsg);
  }

  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });
