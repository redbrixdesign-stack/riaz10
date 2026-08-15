/* ============================================
   ADVISOROS — FOREIGN-TIMEZONE TEST RUNNER
   Run with: npm run test:tz

   The app's date contract is the UK wall clock regardless of the
   device's timezone (see js/core/utils.js ukParts). These suites are
   the UK-calendar-sensitive ones; this runner executes each under a
   UTC-5 and a UTC+14 device timezone to prove the whole chain — day
   windows, week/month money windows, scheduler UK-day tiers, tax-year
   cutover, backups, weather and geocode caches — holds on a foreign
   device, not just on a UK machine.
   ============================================ */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const REPO = path.join(__dirname, '..');
const SUITES = [
  'datetime', 'storage', 'money', 'companion', 'scheduler',
  'followups', 'weather', 'geoprovider'
];
const ZONES = [
  { name: 'UTC-5 (America/New_York)', tz: 'America/New_York' },
  { name: 'UTC+14 (Pacific/Kiritimati)', tz: 'Pacific/Kiritimati' }
];

let failed = 0;
for (const zone of ZONES) {
  console.log(`\n=== ${zone.name} ===`);
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, [path.join(REPO, `tests/${s}.test.js`)], {
      env: { ...process.env, TZ: zone.tz },
      stdio: 'inherit'
    });
    if (r.status !== 0) {
      failed++;
      console.error(`  ✗ ${s}.test.js FAILED under TZ=${zone.tz}`);
    } else {
      console.log(`  ✓ ${s}.test.js`);
    }
  }
}

console.log(failed === 0 ? '\nALL TZ RUNS PASSED' : `\n${failed} TZ RUN(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);