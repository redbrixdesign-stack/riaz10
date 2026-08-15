// Phase 12 — COMPANION DATE/TIME CORRECTNESS.
// The app anchors calendar days, scheduling hours and the tax year to the
// UK wall clock (Europe/London, GMT/BST) — see the utils.js contract — so
// Companion visit times, the home-screen clock and Morning/Afternoon/Evening
// bucketing must render in UK time too, not the device's local timezone.
// These tests pin ukParts/getToday/formatTimeUK/formatDateUK/hourUK to known
// instants (Node ships full ICU, so the Europe/London conversion is exact
// on any machine), including both DST transitions.
// Run: node tests/datetime.test.js
'use strict';

const vm = require('vm');
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');

function baseSandbox(extra) {
  const sandbox = { console, Date, Math, Intl, JSON, String, Number, Array, Object, Set, Map, Promise, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  return sandbox;
}

function loadScript(sandbox, file, expr) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  return vm.runInContext(src + '\n' + expr + ';', sandbox);
}

const sandbox = baseSandbox();
const CONFIG = loadScript(sandbox, 'js/core/config.js', 'CONFIG;');
const Utils = loadScript(sandbox, 'js/core/utils.js', 'Utils;');

let ok = 0, failed = 0;
function t(label, cond, extra) {
  console.log((cond ? '  OK ' : '  FAIL ') + label + (!cond && extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  cond ? ok++ : failed++;
}

// Fixed instants with known UK wall-clock results:
//   2026-08-15T10:00:00Z -> BST (UTC+1) -> 11:00 UK, Saturday 15 Aug 2026
//   2026-01-15T10:00:00Z -> GMT         -> 10:00 UK, Thursday 15 Jan 2026
const bstInstant = new Date('2026-08-15T10:00:00Z');
const gmtInstant = new Date('2026-01-15T10:00:00Z');

// ---- ukParts: UK wall-clock fields + weekday derived from the UK date ----
const bst = Utils.ukParts(bstInstant);
t('ukParts reads the instant through BST (UTC+1)', bst.hour === 11, { hour: bst.hour });
t('ukParts keeps the UK calendar date in BST', bst.year === 2026 && bst.month === 8 && bst.day === 15);
t('ukParts weekday follows the UK date (Sat)', bst.weekday === 6, { weekday: bst.weekday });

const gmt = Utils.ukParts(gmtInstant);
t('ukParts reads the instant through GMT', gmt.hour === 10, { hour: gmt.hour });
t('ukParts weekday follows the UK date (Thu)', gmt.weekday === 4, { weekday: gmt.weekday });

// ---- DST spring transition (2026-03-29: 01:00 GMT -> 02:00 BST) ----
const beforeSpring = Utils.ukParts(new Date('2026-03-29T00:30:00Z'));
t('00:30Z on 29 Mar is still GMT (00:30)', beforeSpring.hour === 0, { hour: beforeSpring.hour });
const afterSpring = Utils.ukParts(new Date('2026-03-29T01:30:00Z'));
t('01:30Z on 29 Mar has already jumped to 02:30 BST', afterSpring.hour === 2 && afterSpring.day === 29, { hour: afterSpring.hour });

// ---- DST autumn transition (2026-10-25: 02:00 BST -> 01:00 GMT) ----
const afterAutumn = Utils.ukParts(new Date('2026-10-25T02:30:00Z'));
t('02:30Z on 25 Oct fell back to 02:30 GMT (not 03:30 BST)', afterAutumn.hour === 2 && afterAutumn.day === 25, { hour: afterAutumn.hour });

// ---- getToday follows the UK calendar day regardless of device ----
const todayParts = Utils.ukParts(Utils.getToday());
const nowParts = Utils.ukParts();
t('getToday is the UK calendar day', todayParts.year === nowParts.year && todayParts.month === nowParts.month && todayParts.day === nowParts.day);

// ---- UK wall-clock rendering ----
t('formatTimeUK renders BST hour', Utils.formatTimeUK(bstInstant) === '11:00', { got: Utils.formatTimeUK(bstInstant) });
t('formatTimeUK renders GMT hour', Utils.formatTimeUK(gmtInstant) === '10:00', { got: Utils.formatTimeUK(gmtInstant) });
t('formatTimeUK pads minutes', Utils.formatTimeUK(new Date('2026-01-15T09:05:00Z')) === '09:05', { got: Utils.formatTimeUK(new Date('2026-01-15T09:05:00Z')) });
t('formatDateUK short is UK day + month', Utils.formatDateUK(bstInstant, 'short') === '15 Aug', { got: Utils.formatDateUK(bstInstant, 'short') });
t('formatDateUK long includes the UK weekday', Utils.formatDateUK(bstInstant, 'long') === 'Saturday 15 August 2026', { got: Utils.formatDateUK(bstInstant, 'long') });
t('formatDateUK medium includes the year', Utils.formatDateUK(gmtInstant, 'medium') === '15 Jan 2026', { got: Utils.formatDateUK(gmtInstant, 'medium') });
t('formatDateUK iso is the UK calendar date', Utils.formatDateUK(bstInstant, 'iso') === '2026-08-15', { got: Utils.formatDateUK(bstInstant, 'iso') });
t('formatDateUK datetime carries the UK time', Utils.formatDateUK(bstInstant, 'datetime') === '15 Aug, 11:00', { got: Utils.formatDateUK(bstInstant, 'datetime') });
t('hourUK returns the UK hour', Utils.hourUK(bstInstant) === 11, { got: Utils.hourUK(bstInstant) });

// ---- A late-evening UK instant must not bleed into the next UK day ----
const lateEvening = Utils.ukParts(new Date('2026-08-15T23:30:00Z')); // 00:30 BST on the 16th
t('23:30Z on 15 Aug is 00:30 BST on the 16th', lateEvening.day === 16 && lateEvening.hour === 0, { day: lateEvening.day, hour: lateEvening.hour });

// ---- Week window covers all seven UK days (regression: Sunday used to be
//      dropped during BST when the end bound went through UTC) ----
const sunday = new Date('2026-08-16T12:00:00Z'); // Sunday 16 Aug, BST
const weekStart = Utils.getStartOfWeek(sunday);  // Monday 10 Aug
const weekEnd = Utils.getEndOfWeek(sunday);      // Monday 17 Aug 00:00
const inWeek = d => d >= weekStart && d < weekEnd;
t('Sunday sits inside the week window', inWeek(sunday), { start: weekStart.toISOString(), end: weekEnd.toISOString(), sunday: sunday.toISOString() });
t('Monday of that week sits inside the window', inWeek(new Date('2026-08-10T12:00:00Z')));
t('following Monday is outside the window', !inWeek(new Date('2026-08-17T12:00:00Z')));

console.log(failed === 0 ? '\nALL DATE/TIME TESTS PASSED' : `\n${failed} DATE/TIME TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);