#!/usr/bin/env node
/* ============================================
   ADVISOROS — CUSTOMER 360 / ORDERS / FOLLOW-UPS E2E TEST
   Run with: npm run test:browser:features

   Boots the REAL app (actual index.html + minified feature files) in
   headless Chrome over the DevTools Protocol, seeds a realistic sales
   scenario into 'advisoros_v6' (seed-features.html), then asserts:
     1. the app boots clean (no error/exception console lines)
     2. bottom nav order: Home, Follow-ups, Orders, Money, Tools
     3. Follow-ups inbox: all four task kinds due, badge count = 4
     4. Orders kanban: five columns, order card with balance, auto-paid
     5. Customer 360: profile renders quotes, order, measurement, name

   Needs: the repo served over HTTP (npm run serve → :8000), Google Chrome
   at the default macOS path, Node >= 22 (global WebSocket).
   ============================================ */

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_PORT = 9444;
const BASE = 'http://localhost:8000';
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

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'advisoros-feat-e2e-'));
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

    const consoleLines = [];
    const scriptErrors = [];
    const http404s = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const line = (msg.params.args || []).map(a => a.value !== undefined ? a.value : a.description || a.type).join(' ');
        consoleLines.push(line);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        scriptErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
      } else if (msg.method === 'Network.responseReceived' && msg.params.response.status === 404) {
        http404s.push(msg.params.response.url);
      }
    });
    await cdpCall(ws, 'Network.enable').catch(() => {});

    console.log('STEP1 seeding advisoros_v6…');
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/tests/browser/seed-features.html' });
    const seedDeadline = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const t = String(await evaluate(ws, 'document.body.textContent'));
      if (t === 'SEEDED_OK') break;
      if (t.startsWith('SEED_FAILED')) throw new Error('seed failed: ' + t);
      if (Date.now() > seedDeadline) throw new Error('seed timed out; body=' + t);
    }
    console.log('STEP1 seeded');

    console.log('STEP2 booting the real app…');
    // Skip onboarding (fresh profile) — the boot marker in minified builds is
    // dropped (pure_funcs strips console.log), so poll app state instead.
    await evaluate(ws, `localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }))`);
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html' });
    const bootDeadline = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const ready = await evaluate(ws, `(typeof App !== 'undefined') && App.currentHash === 'today' && App.features.has('orders')`);
      if (ready) break;
      if (Date.now() > bootDeadline) {
        console.error('app never became ready. Script errors:', scriptErrors.slice(-10));
        throw new Error('app never became ready');
      }
    }
    console.log('STEP2 booted');

    const mainText = () => evaluate(ws, `document.querySelector('#main')?.textContent || ''`);
    const navigateTo = async id => { await evaluate(ws, `App.navigate('${id}')`); await sleep(1200); };

    const bad404 = http404s.filter(u => !/favicon\.ico$/i.test(u));
    ok('boot: no JS exceptions', scriptErrors.length === 0, scriptErrors.slice(0, 5));
    ok('boot: no resource 404s (favicon exempt)', bad404.length === 0, http404s.slice(0, 5));

    const navOrder = await evaluate(ws, `Array.from(document.querySelectorAll('#bottom-nav .nav-item')).map(b => b.dataset.feature)`);
    ok('nav order Home, Follow-ups, Orders, Money, Tools', JSON.stringify(navOrder) === JSON.stringify(['today', 'followups', 'orders', 'money', 'control']), navOrder);

    console.log('STEP3 Follow-ups inbox…');
    await navigateTo('followups');
    const fup = await mainText();
    ok('inbox renders "Due now" section', /Due now/i.test(fup), fup.slice(0, 300));
    ok('inbox shows customer name (Sarah)', fup.includes('Sarah'), fup.slice(0, 300));
    ok('inbox shows payment reminder amount (£1,250.00)', fup.includes('£1,250.00'), fup.slice(0, 400));
    ok('inbox shows quote chase + visit task labels', /Quote|Outcome|Collect/i.test(fup), fup.slice(0, 400));
    const dueCount = await evaluate(ws, `(async () => await App.features.get('followups').getDueCount())()`);
    ok('getDueCount() === 4', dueCount === 4, dueCount);

    console.log('STEP4 Orders kanban…');
    await navigateTo('orders');
    const kanban = await mainText();
    for (const col of ['Quoted', 'Ordered', 'Delivered', 'Fitted', 'Paid']) {
      ok(`kanban column "${col}"`, kanban.includes(col), kanban.slice(0, 400));
    }
    ok('kanban shows the order number', kanban.includes('ORD-2026-0001'), kanban.slice(0, 400));
    ok('kanban shows balance due', kanban.includes('£1,250.00'), kanban.slice(0, 400));

    console.log('STEP5 Customer 360…');
    await evaluate(ws, `App.navigate('customer', { id: 1 })`);
    await sleep(1200);
    const profile = await mainText();
    ok('profile renders "Customer 360" header', profile.includes('Customer 360'), profile.slice(0, 300));
    ok('profile shows customer name', profile.includes('Sarah Johnson'), profile.slice(0, 300));
    ok('profile lists outstanding quotes', /Outstanding quotes \(1\)/.test(profile), profile.slice(0, 400));
    ok('profile shows the order row', profile.includes('ORD-2026-0001'), profile.slice(0, 400));
    ok('profile shows measurements (Lounge Bay)', profile.includes('Lounge Bay'), profile.slice(0, 400));

    const bad404End = http404s.filter(u => !/favicon\.ico$/i.test(u));
    ok('whole run: no JS exceptions', scriptErrors.length === 0, scriptErrors.slice(0, 5));
    ok('whole run: no resource 404s (favicon exempt)', bad404End.length === 0, http404s.slice(0, 5));
  } catch (e) {
    failures++;
    console.error('E2E FAILED:', e.message);
  } finally {
    if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
    chromeProc.kill('SIGKILL');
    try { execSync(`pkill -f "user-data-dir=${profile}"`); } catch (e) { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  console.log(failures === 0 ? '\nALL FEATURE E2E CHECKS PASSED' : `\n${failures} FEATURE E2E CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
