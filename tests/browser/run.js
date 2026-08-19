#!/usr/bin/env node
/* ============================================
   ADVISOROS — BROWSER END-TO-END TEST
   Run with: npm run test:browser

   Boots the REAL app in headless Chrome over the DevTools Protocol and
   proves the legacy-data story end to end:
     1. seeds a legacy 'advisoros_v5' database (tests/browser/seed.html)
     2. loads the actual index.html — DB.init() runs, Dexie opens
        'advisoros_v6' and migrates the legacy records
     3. reads 'advisoros_v6' back (tests/browser/verify.html) and asserts
        on the migrated state

   Needs: the repo served over HTTP (npm run serve → :8000), and Google
   Chrome installed at the default macOS path. Requires Node >= 22 (global
   WebSocket). IndexedDB needs REAL time, so no virtual-time tricks here.
   ============================================ */

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Use a runner-specific port so sequential suites cannot attach to a Chrome
// process that is still shutting down from the preceding suite.
const CDP_PORT = 10000 + (process.pid % 40000);
const BASE = 'http://localhost:8000';
const BASE_DIR = path.join(__dirname, '..', '..');
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
    if (last.startsWith('SEED_FAILED')) throw new Error('seed page failed');
  }
  throw new Error(`Timed out waiting for "${label}" on ${url}; last=${last}`);
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

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'advisoros-e2e-'));
  const chromeArgs = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--disable-component-update', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    // TZ_BROWSER runs the whole app on a foreign device timezone — the
    // UK-calendar contract must hold there, not just on a UK machine.
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

    // Step 1: seed the legacy database
    await loadAndWait(ws, BASE + '/tests/browser/seed.html', 'SEEDED_OK', 'seed', 30000);
    console.log('STEP1 legacy v5 seeded');

    // Step 2: boot the real app and wait for it to finish initialising.
    // A fresh profile lands in onboarding — bypass it so the app settles on
    // the daily screen (the same hash the real first-time user sees).
    // Distinct query strings force Chrome to create a real new document on
    // each boot (same-URL navigations can be silently deduplicated).
    await evaluate(ws, `localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }))`);
    // Encryption test mode: the passphrase modal would block App.init() on a
    // fresh profile; the test passphrase is derived instead (see app.js).
    await evaluate(ws, `localStorage.setItem('advisoros_enc_test', '1')`);
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?boot=1' });
    const bootDeadline = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const ready = await evaluate(ws, `typeof App !== 'undefined' && !!App.currentHash && !!document.querySelector('#main')`);
      if (ready) break;
      if (Date.now() > bootDeadline) throw new Error('app never became ready');
    }
    await sleep(1000); // let DB init/migration promises and views settle
    console.log('STEP2 app booted');

    // Step 3: read the migrated database back
    const state = await loadAndWait(ws, BASE + '/tests/browser/verify.html', '{', 'verify', 30000);
    const v = JSON.parse(state);
    console.log('STEP3 migrated state:', state);

    const year = new Date().getFullYear();
    ok('customers migrated (2)', v.customers === 2, v);
    ok('customer numbering intact', v.customerNumbers === `CUS-${year}-0003,CUS-${year}-0007`, v.customerNumbers);
    ok('appointments migrated (2)', v.appts === 2, v);
    ok('legacy outcome renamed to ordered', v.apptOutcomes === 'ordered,ordered', v.apptOutcomes);
    // One legacy order is migrated directly; the second sold appointment is
    // intentionally backfilled into an order so the Orders board cannot hide
    // sales recorded by older app versions.
    ok('legacy order migrated + sold appointment backfilled (2)', v.orders === 2, v);
    ok('localStorage fallback rows migrated (expenses)', v.expenses === 1 && v.expenseAmounts === '42', v);
    ok('sequence guard bumped 0 → 7', v.seqCustomer === 7, v.seqCustomer);
    ok('migration flag set', v.flag === true, v.flag);
    ok('settings migrated', v.configWeekly === 600, v.configWeekly);

    // Step 4: boot the app AGAIN — the migration flag must make the copy a
    // no-op (no duplicates, no re-guarding). This is the real user path:
    // nobody migrates once; they boot the new build dozens of times.
    // Distinct ?boot=2 URL forces a genuine new document.
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?boot=2' });
    const deadline2 = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const booted = await evaluate(ws, `typeof App !== 'undefined' && !!App.currentHash && DB.db && DB.db.isOpen()`);
      if (booted) break;
      if (Date.now() > deadline2) throw new Error('second boot never became ready');
    }
    await sleep(1000);
    const state2 = await loadAndWait(ws, BASE + '/tests/browser/verify.html', '{', 'verify after second boot', 30000);
    const v2 = JSON.parse(state2);
    console.log('STEP4 second-boot state:', state2);
    ok('second boot: no duplicate customers', v2.customers === 2 && v2.customers === v.customers, v2);
    ok('second boot: no duplicate appointments', v2.appts === 2 && v2.appts === v.appts, v2);
    ok('second boot: no duplicate orders', v2.orders === 2 && v2.orders === v.orders, v2);
    ok('second boot: no duplicate localStorage rows', v2.expenses === 1 && v2.expenses === v.expenses, v2);
    ok('second boot: sequence not re-guarded', v2.seqCustomer === 7 && v2.seqCustomer === v.seqCustomer, v2.seqCustomer);

    // Step 5: AI feature end-to-end — the REAL client service (js/services/ai.js)
    // against a mock proxy on :8001. Covers ping, the full image pipeline
    // (canvas -> File -> downscale -> base64 -> fields), drafts, error and
    // timeout degradation, and usage recording. The timeout case takes ~15s.
    const mockProxy = spawn('node', [path.join(__dirname, 'mock-proxy.js')], { stdio: 'ignore' });
    try {
      await sleep(500);
      let aiResult = '';
      try {
        aiResult = await loadAndWait(ws, BASE + '/tests/browser/ai.html', 'AI_', 'AI e2e', 60000);
      } catch (e) {
        if (!aiResult) aiResult = 'AI_FAILED:<' + e.message + '>';
      }
      console.log('STEP5 AI e2e result:', aiResult);
      if (aiResult.startsWith('AI_FAILED:')) {
        try { console.log('DETAIL:', JSON.stringify(JSON.parse(aiResult.slice(10)), null, 2)); } catch (e) { /* raw */ }
      }
      ok('AI e2e: client <-> proxy contract (ping/ocr/draft/fail/timeout)', aiResult.startsWith('AI_OK'), aiResult);
    } finally {
      mockProxy.kill('SIGKILL');
    }
  } catch (e) {
    failures++;
    console.error('E2E FAILED:', e.message);
  } finally {
    if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
    chromeProc.kill('SIGKILL');
    try { execSync(`pkill -f "user-data-dir=${profile}"`); } catch (e) { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  console.log(failures === 0 ? '\nALL BROWSER TESTS PASSED' : `\n${failures} BROWSER TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
