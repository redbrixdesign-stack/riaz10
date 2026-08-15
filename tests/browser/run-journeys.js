#!/usr/bin/env node
/* ============================================
   ADVISOROS — REAL ADVISOR JOURNEY E2E TESTS
   Run with: node tests/browser/run-journeys.js

   Tests complete real-world advisor workflows:
   A. Morning: Companion → visits → customer → route → comms
   B. Visit: Customer → history → interests → comms → measure → outcome
   C. Post-Visit: Outcome → follow-up → communication
   D. Driving: Route → navigation → trip tracking → arrival → distance
   E. End of Day: Missing outcomes → earnings → follow-ups
   E2. Evening: Day-before comms → evening review → outstanding money/tasks
   F. Backup: Full data → export → clear → restore → verify

   NOTE: journeys run SEQUENTIALLY in one browser profile sharing one
   IndexedDB — they are NOT isolated browser contexts. Each journey page
   resets the database itself through the production factory reset
   (DB.deleteAllData) and seeds its own data, so ordering matters:
   F (backup) must stay last, since it exercises export/clear/restore.
   ============================================ */

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_PORT = 9222;
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
function ok(label, cond, extra) {
  console.log((cond ? '  OK ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
}

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  process.env.CHROME_BIN
].filter(Boolean);

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* ignore */ }
  }
  return null;
}

async function waitForCdp(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return;
    } catch (e) { /* not up yet */ }
    await sleep(300);
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

let seq = 1;
async function cdpCall(ws, method, params) {
  const id = seq++;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const onMsg = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg);
        msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMsg);
  });
}

async function evaluate(ws, expression) {
  const r = await cdpCall(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + expression + ' — ' + JSON.stringify(r.exceptionDetails));
  return r.result ? r.result.value : undefined;
}

async function loadAndWait(ws, url, markerStarts, label, timeoutMs) {
  await cdpCall(ws, 'Page.navigate', { url });
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    await sleep(500);
    try { last = String(await evaluate(ws, 'document.body.textContent')); } catch (e) { last = 'ERR:' + e.message; }
    if (last.startsWith(markerStarts)) return last;
    if (last.startsWith('SEED_FAILED')) throw new Error('seed page failed: ' + last);
  }
  throw new Error(`Timed out waiting for "${label}" on ${url}; last=${last}`);
}

async function runJourney(ws, journeyName, url, markerStarts, timeoutMs = 30000) {
  console.log(`\n=== JOURNEY ${journeyName} ===`);
  const result = await loadAndWait(ws, url, markerStarts, journeyName, timeoutMs);
  const data = JSON.parse(result);
  
  let journeyFailures = 0;
  for (const test of data.results) {
    const label = `JOURNEY ${journeyName}: ${test.label}`;
    console.log((test.pass ? '  OK ' : '  FAIL ') + label + (test.extra && !test.pass ? ' — ' + JSON.stringify(test.extra) : ''));
    if (!test.pass) journeyFailures++;
  }
  failures += journeyFailures;
  console.log(`Journey ${journeyName}: ${journeyFailures === 0 ? 'PASSED' : journeyFailures + ' FAILED'}`);
  return journeyFailures === 0;
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('Google Chrome not found (set CHROME_BIN to override).'); process.exit(1); }

  // Sanity: is the server up?
  try {
    const res = await fetch(BASE + '/index.html');
    if (!res.ok) throw new Error(res.status);
  } catch (e) {
    console.error(`Can't reach ${BASE} — start the dev server first (npm run serve).`);
    process.exit(1);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'advisoros-journey-'));
  const chromeArgs = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--disable-component-update', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    // TZ_BROWSER: run the journeys on a foreign device timezone (see run.js).
    ...(process.env.TZ_BROWSER ? [`--timezone=${process.env.TZ_BROWSER}`] : []),
    'about:blank'
  ];
  const chromeProc = spawn(chrome, chromeArgs, { stdio: 'ignore' });

  let ws = null;
  try {
    await waitForCdp(15000);
    const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    await cdpCall(ws, 'Runtime.enable');
    await cdpCall(ws, 'Page.enable');

    // Run each journey in sequence
    const journeys = [
      { name: 'A', file: 'journey-a-morning.html', marker: '{' },
      { name: 'B', file: 'journey-b-visit.html', marker: '{' },
      { name: 'C', file: 'journey-c-postvisit.html', marker: '{' },
      { name: 'D', file: 'journey-d-driving.html', marker: '{' },
      { name: 'E', file: 'journey-e-eod.html', marker: '{' },
      { name: 'E2', file: 'journey-e-evening.html', marker: '{' },
      { name: 'F', file: 'journey-f-backup.html', marker: '{' },
    ];

    for (const j of journeys) {
      await runJourney(ws, j.name, BASE + '/tests/browser/' + j.file, j.marker);
    }

  } catch (e) {
    failures++;
    console.error('JOURNEY E2E FAILED:', e.message);
  } finally {
    if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
    chromeProc.kill('SIGKILL');
    try { execSync(`pkill -f "user-data-dir=${profile}"`); } catch (e) { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  console.log(failures === 0 ? '\nALL JOURNEY TESTS PASSED' : `\n${failures} JOURNEY TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });