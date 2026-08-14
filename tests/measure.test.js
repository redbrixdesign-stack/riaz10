/* ============================================
   ADVISOROS — MEASURE FEATURE DATA-INTEGRITY TESTS
   Run with: node tests/measure.test.js

   Audits every measurement input state:
     missing / empty / invalid / zero / valid positive
   and verifies the derived fields (widthLeast, dropLeast,
   widthUsed, dropUsed, diagonal variance, squareness) never
   turn incomplete entries into valid zeros.

   The MeasureFeature is loaded in a vm sandbox; the pure
   helpers (displayToMm, computeGroupLeast, computeDiagCheck,
   firstInvalidMeasurement, formatMeasurement) are exercised
   directly for each unit (mm / cm / inches).
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

function loadMeasure(unit) {
  const sandbox = {
    console, Math, JSON, Number, String, Boolean, RegExp, Error,
    parseInt, parseFloat, isNaN, Infinity,
    App: { registerFeature() {}, navigate() {} },
    CONFIG: { measurementUnit: unit },
    Utils: { formatMeasurement: (mm) => `${mm} mm`, escapeHtml: (s) => String(s) },
    Toast: { show() {} }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return vm.runInContext(
    fs.readFileSync(path.join(REPO, 'js/features/measure/measure.js'), 'utf8') + '\n;MeasureFeature;',
    sandbox
  );
}

async function run() {
  // ---- parsing: mm ----
  console.log('\nparsing (mm)');
  const mm = loadMeasure('mm');
  ok('mm: valid positive parsed', mm.displayToMm('500') === 500);
  ok('mm: decimal parsed', mm.displayToMm('12.75') === 12.75);
  ok('mm: sub-millimetre parsed', mm.displayToMm('0.5') === 0.5);
  ok('mm: empty string is missing (null)', mm.displayToMm('') === null);
  ok('mm: whitespace is missing (null)', mm.displayToMm('   ') === null);
  ok('mm: unparseable is invalid (null)', mm.displayToMm('abc') === null);
  ok('mm: undefined is missing (null)', mm.displayToMm(undefined) === null);
  ok('mm: null is missing (null)', mm.displayToMm(null) === null);
  ok('mm: explicit zero stays zero, NOT missing', mm.displayToMm('0') === 0);
  ok('mm: negative stays negative, NOT missing', mm.displayToMm('-5') === -5);
  ok('mm: negative decimal parsed', mm.displayToMm('-0.5') === -0.5);

  // ---- parsing: unit conversion ----
  console.log('\nunit conversion');
  const cm = loadMeasure('cm');
  ok('cm: 50 cm -> 500 mm', cm.displayToMm('50') === 500);
  ok('cm: decimal 12.5 cm -> 125 mm', cm.displayToMm('12.5') === 125);
  ok('cm: empty is missing (null)', cm.displayToMm('') === null);
  ok('cm: zero stays zero', cm.displayToMm('0') === 0);
  ok('cm: mmToDisplay 125 mm -> 12.5 cm', cm.mmToDisplay(125) === 12.5);
  ok('cm: mmToDisplay round-trips 250 mm -> 25 cm', cm.mmToDisplay(250) === 25);

  const inches = loadMeasure('inches');
  ok('inches: 2 in -> 50.8 mm', inches.displayToMm('2') === 50.8);
  ok('inches: 1.5 in -> 38.1 mm', Math.abs(inches.displayToMm('1.5') - 38.1) < 1e-9);
  ok('inches: 0.125 in (1/8) -> 3.175 mm', inches.displayToMm('0.125') === 3.175);
  ok('inches: empty is missing (null)', inches.displayToMm('') === null);
  ok('inches: mmToDisplay 50.8 mm -> 2 in', inches.mmToDisplay(50.8) === 2);
  ok('inches: mmToDisplay 38.1 mm -> 1.5 in', inches.mmToDisplay(38.1) === 1.5);

  // ---- least/used computation ----
  console.log('\nwidthLeast / widthUsed / dropLeast / dropUsed');
  const g = loadMeasure('mm');
  let r = g.computeGroupLeast(500, 520, 510, 10, true);
  ok('group: complete recess uses least', r.least === 500 && r.used === 490, r);
  r = g.computeGroupLeast(500, 520, 510, 10, false);
  ok('group: complete exact/vertical uses least as-is', r.least === 500 && r.used === 500, r);
  r = g.computeGroupLeast(500, 500, 500, 10, true);
  ok('group: equal measurements', r.least === 500 && r.used === 490, r);
  r = g.computeGroupLeast(500.5, 501, 500.25, 10, true);
  ok('group: decimals keep precision', r.least === 500.25 && r.used === 490.25, r);
  r = g.computeGroupLeast(500, null, 510, 10, true);
  ok('group: one missing -> least null (never 0)', r.least === null && r.used === null, r);
  r = g.computeGroupLeast(null, null, null, 10, true);
  ok('group: all missing -> nulls', r.least === null && r.used === null, r);
  r = g.computeGroupLeast(0, 500, 510, 10, true);
  ok('group: explicit zero -> nulls (never 0 or negative used)', r.least === null && r.used === null, r);
  r = g.computeGroupLeast(-5, 500, 510, 10, true);
  ok('group: negative -> nulls (never negative used)', r.least === null && r.used === null, r);
  r = g.computeGroupLeast(500, 520, 510, 10, false);
  ok('group: drop never has tolerance subtracted', r.used === 500, r);

  // ---- diagonal / squareness ----
  console.log('\ndiagonal variance / squareness');
  r = g.computeDiagCheck(1200, 1200);
  ok('diag: equal diagonals -> variance 0, square', r.variance === 0 && r.isSquare === true, r);
  r = g.computeDiagCheck(1205, 1200);
  ok('diag: exactly 5 mm variance -> square (5 <= 5)', r.variance === 5 && r.isSquare === true, r);
  r = g.computeDiagCheck(1206, 1200);
  ok('diag: 6 mm variance -> not square', r.variance === 6 && r.isSquare === false, r);
  r = g.computeDiagCheck(1200, 1195);
  ok('diag: exactly 5 mm (reversed) -> square', r.variance === 5 && r.isSquare === true, r);
  r = g.computeDiagCheck(null, 1200);
  ok('diag: missing one diagonal -> variance null, isSquare null', r.variance === null && r.isSquare === null, r);
  r = g.computeDiagCheck(1200, null);
  ok('diag: missing the other diagonal -> nulls', r.variance === null && r.isSquare === null, r);
  r = g.computeDiagCheck(null, null);
  ok('diag: both missing -> nulls (never "square")', r.variance === null && r.isSquare === null, r);
  r = g.computeDiagCheck(0, 1200);
  ok('diag: zero diagonal -> nulls (check never happened)', r.variance === null && r.isSquare === null, r);
  r = g.computeDiagCheck(-10, 1200);
  ok('diag: negative diagonal -> nulls', r.variance === null && r.isSquare === null, r);

  // ---- save validation gate ----
  console.log('\nsave validation (zero / negative / missing)');
  let invalid = g.firstInvalidMeasurement({ widthTop: 0, widthMiddle: 500, widthBottom: 500 });
  ok('save: explicit zero width rejected', invalid === 'Width (top)', invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: 500, widthMiddle: 500, widthBottom: -1 });
  ok('save: negative width rejected', invalid === 'Width (bottom)', invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: 500, widthMiddle: 500, widthBottom: 500, dropLeft: 0 });
  ok('save: zero drop rejected', invalid === 'Drop (left)', invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: 500, widthMiddle: 500, widthBottom: 500, diagonalTlBr: 0 });
  ok('save: zero diagonal rejected', invalid === 'Diagonal (TL → BR)', invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: 500, widthMiddle: 500, widthBottom: 500, tolerance: 0 });
  ok('save: zero tolerance rejected', invalid === 'Tolerance', invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: 500, widthMiddle: 500, widthBottom: 500, tolerance: -10 });
  ok('save: negative tolerance rejected', invalid === 'Tolerance', invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: null, widthMiddle: 500, widthBottom: 500 });
  ok('save: missing (null) is allowed, not rejected', invalid === null, invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: null, widthMiddle: null, widthBottom: null, dropLeft: null, dropCentre: null, dropRight: null, diagonalTlBr: null, diagonalTrBl: null, tolerance: null });
  ok('save: fully empty measurement is allowed (stays missing)', invalid === null, invalid);
  invalid = g.firstInvalidMeasurement({ widthTop: 500, widthMiddle: 520, widthBottom: 510, dropLeft: 1500, dropCentre: 1490, dropRight: 1505, diagonalTlBr: 1200, diagonalTrBl: 1205, tolerance: 10 });
  ok('save: all valid positives pass', invalid === null, invalid);

  // ---- display helper ----
  console.log('\nformatMeasurement');
  ok('display: null -> --', g.formatMeasurement(null) === '--');
  ok('display: zero -> --', g.formatMeasurement(0) === '--');
  ok('display: negative -> --', g.formatMeasurement(-5) === '--');
  ok('display: valid -> formatted', g.formatMeasurement(500.4) === '500.4 mm');
  ok('display: rounds to 0.1 mm', g.formatMeasurement(500.44) === '500.4 mm');

  // ---- end-to-end gate: what the save path sees ----
  console.log('\nsave path (read values -> validation gate)');
  const readTopZero = g.displayToMm('0');
  const readMid = g.displayToMm('500');
  const readBot = g.displayToMm('500');
  invalid = g.firstInvalidMeasurement({ widthTop: readTopZero, widthMiddle: readMid, widthBottom: readBot });
  ok('save: typed "0" is rejected before storage', invalid === 'Width (top)', invalid);
  const readEmpty = g.displayToMm('');
  invalid = g.firstInvalidMeasurement({ widthTop: readEmpty, widthMiddle: readMid, widthBottom: readBot });
  ok('save: blank field is missing, not rejected', invalid === null, invalid);
  const group = g.computeGroupLeast(readEmpty, readMid, readBot, 10, true);
  ok('save: incomplete group stores nulls, not 0/-10', group.least === null && group.used === null, group);

  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });