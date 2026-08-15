#!/usr/bin/env node
/* ============================================
   ADVISOROS — OCR SAVE → DIARY END-TO-END TEST
   Run with: npm run test:browser:ocr

   Regression test for "scanned visits missing from the diary". Boots the
   REAL app (the actual index.html + minified feature files) in headless
   Chrome, simulates a completed scan by filling the exact DOM fields
   OCRFeature.saveToCustomer() reads, then presses save for real and
   asserts the visit shows up in:
     1. DB.getAppointmentsForDate(today)   (what the Home screen uses)
     2. the rendered Visits diary           (App.navigate('appointments'))

   Needs: repo served over HTTP (npm run serve → :8000) and Google Chrome
   at the default macOS path. Node >= 22 (global WebSocket).
   ============================================ */

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_PORT = 9333;
const BASE = 'http://localhost:8000';
const BASE_DIR = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
function ok(label, cond, extra) {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
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

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('Google Chrome not found (set CHROME_BIN to override).'); process.exit(1); }

  try {
    const res = await fetch(BASE + '/index.html');
    if (!res.ok) throw new Error(res.status);
  } catch (e) {
    console.error(`Can't reach ${BASE} — start the dev server first (npm run serve).`);
    process.exit(1);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'advisoros-ocr-e2e-'));
  const chromeProc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--disable-component-update', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    await waitForCdp(15000);
    const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    await cdpCall(ws, 'Runtime.enable');
    await cdpCall(ws, 'Page.enable');

    // Capture runtime exceptions for the whole run.
    const exceptions = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
      }
    });

    console.log('STEP1 loading the real app…');
    // Establish the http origin first (about:blank has none — localStorage
    // is denied there), then set up the profile and do a real boot.
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?preboot=1' });
    const preDeadline = Date.now() + 20000;
    while (true) {
      await sleep(500);
      try { await evaluate(ws, `localStorage.setItem('__probe', '1')`); break; } catch (e) { /* not there yet */ }
      if (Date.now() > preDeadline) throw new Error('pre-boot origin never became ready');
    }
    // Encryption test mode: the passphrase modal would block App.init() on
    // a fresh profile; the test passphrase is derived instead (see app.js).
    await evaluate(ws, `localStorage.setItem('advisoros_enc_test', '1')`);
    await evaluate(ws, `localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }))`);
    // Distinct ?boot=N query strings force Chrome to create a real new
    // document (same-URL navigations can be silently deduplicated here).
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?boot=2' });
    const bootDeadline2 = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const settled = await evaluate(ws, `typeof App !== 'undefined' && App.currentHash === 'today'`);
      if (settled) break;
      if (Date.now() > bootDeadline2) {
        console.error('app never settled on the daily screen. Exceptions so far:', exceptions.slice(-10));
        throw new Error('app never settled on today');
      }
    }
    console.log('STEP2 app booted');

    // Simulate a completed scan: fill the exact fields saveToCustomer reads.
    // No date extracted (business-card case) → must default to today 09:00.
    const customer = 'OCR E2E ' + Date.now();
    const phone = '0700' + String(Math.floor(Math.random() * 900000) + 100000);
    const mk = (id, val) => `(() => { const el = document.getElementById('${id}'); if (el) { el.value = '${val}'; } else { const i = document.createElement('input'); i.id = '${id}'; i.type = 'text'; i.value = '${val}'; document.body.appendChild(i); } })();`;
    await evaluate(ws, [
      mk('ocr-name', customer),
      mk('ocr-phone', phone),
      mk('ocr-address', '12 OCR Test Road'),
      mk('ocr-town', 'Manchester'),
      mk('ocr-city', 'Manchester'),
      mk('ocr-postcode', 'M1 1AB'),
      mk('ocr-appointmentDate', ''),
      mk('ocr-appointmentTime', '')
    ].join('\n'));

    console.log('STEP3 pressing Save Customer & Visit (real saveToCustomer)…');
    const saveResult = await evaluate(ws, `(async () => {
      try {
        await OCRFeature.saveToCustomer();
        return { saved: true };
      } catch (e) {
        return { saved: false, error: String(e && e.stack || e), toasts: Array.from(document.querySelectorAll('.toast')).map(t => t.textContent) };
      }
    })()`);
    ok('saveToCustomer() ran without throwing', saveResult.saved, saveResult);

    console.log('STEP4 checking DB state…');
    const dbState = await evaluate(ws, `(async () => {
      const today = new Date();
      const dayAppts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
      const raw = await DB.db.appointments.toArray();
      return {
        homeQueryCount: dayAppts.length,
        homeQueryNames: dayAppts.map(a => a.clientName),
        totalRows: raw.length,
        savedRow: raw.length ? { date: raw[raw.length - 1].date, dateType: typeof raw[raw.length - 1].date, status: raw[raw.length - 1].status, clientName: raw[raw.length - 1].clientName } : null
      };
    })()`);
    console.log('       DB state:', JSON.stringify(dbState));
    ok('Home query (getAppointmentsForDate today) finds the OCR visit', dbState.homeQueryCount >= 1 && dbState.homeQueryNames.includes(customer), dbState);
    const saved = dbState.savedRow;
    ok('saved row date is a string ISO value', saved && typeof saved.date === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(saved.date), saved);
    ok('saved row status is confirmed', saved && saved.status === 'confirmed', saved);

    console.log('STEP5 rendering the Visits diary…');
    await evaluate(ws, `App.navigate('appointments')`);
    await sleep(1200);
    const diaryText = await evaluate(ws, `document.querySelector('#main')?.textContent || ''`);
    ok('diary screen renders the OCR customer name', diaryText.includes(customer), diaryText.slice(0, 300));
    ok('diary screen shows today agenda (Today heading)', /Today/i.test(diaryText), diaryText.slice(0, 300));

    const errors = exceptions.filter(l => /error|failed|exception/i.test(l));
    if (errors.length) console.log('       JS exceptions observed:', errors.slice(0, 10));
    ok('no runtime exceptions during the save', errors.length === 0, errors.slice(0, 5));
  } catch (e) {
    failures++;
    console.error('E2E FAILED:', e.message);
  } finally {
    if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
    chromeProc.kill('SIGKILL');
    try { execSync(`pkill -f "user-data-dir=${profile}"`); } catch (e) { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  console.log(failures === 0 ? '\nALL OCR E2E CHECKS PASSED' : `\n${failures} OCR E2E CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
