#!/usr/bin/env node
/* ============================================
   ADVISOROS — COMPANION HOME NAVIGATION E2E
   Run with: node tests/browser/companion-nav.e2e.js

   Boots the REAL app in headless Chrome and reproduces the report that the
   Beelo companion home screen breaks *after* navigating to another screen
   and back (fresh-load is fine):

     1. loads the app, waits for the companion home to mount
     2. snapshots layout: page/scroll heights, comp-root rect vs #main rect
     3. navigates to another screen (appointments)
     4. navigates back home
     5. snapshots again and compares — any drift (page taller than the
        viewport, comp-root overflowing #main) is a failure

   Needs: repo served over HTTP (npm run serve → :8000), Google Chrome,
   Node >= 22. Fresh profile — service worker included, like a real user.
   ============================================ */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_PORT = 9223;
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 1;
function cdpCall(ws, method, params) {
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

let failures = 0;
function ok(label, cond, extra) {
  console.log((cond ? '  OK ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
}

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  process.env.CHROME_BIN
].filter(Boolean);

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

const SNAPSHOT = `(() => {
  const root = document.getElementById('companion-root');
  const comp = root && root.firstElementChild;
  const main = document.getElementById('main');
  const nav = document.getElementById('bottom-nav');
  const mr = main ? main.getBoundingClientRect() : null;
  const cr = comp ? comp.getBoundingClientRect() : null;
  const nr = nav ? nav.getBoundingClientRect() : null;
  return {
    hash: location.hash,
    innerHeight, innerWidth,
    bodyScroll: document.body.scrollHeight,
    mainScroll: main ? main.scrollHeight : null,
    mainHeight: mr ? mr.height : null,
    mainTop: mr ? mr.top : null,
    mainBottom: mr ? mr.bottom : null,
    compHeight: cr ? cr.height : null,
    compBottom: cr ? cr.bottom : null,
    compTop: cr ? cr.top : null,
    compLeft: cr ? cr.left : null,
    compWidth: cr ? cr.width : null,
    navVisible: nr ? nr.height > 0 : false,
    navBottom: nr ? nr.bottom : null,
    compCount: root ? root.children.length : 0,
    overflowX: document.documentElement.scrollWidth > innerWidth
  };
})()`;

async function screenshot(ws, file) {
  const shot = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('  screenshot →', file);
}

(async () => {
  const chrome = CHROME_CANDIDATES.find(c => c && fs.existsSync(c));
  if (!chrome) { console.error('Google Chrome not found (set CHROME_BIN to override).'); process.exit(1); }

  try {
    const res = await fetch(BASE + '/index.html');
    if (!res.ok) throw new Error(res.status);
  } catch (e) {
    console.error(`Can't reach ${BASE} — start the dev server first (npm run serve).`);
    process.exit(1);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'advisoros-nav-e2e-'));
  const chromeProc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--disable-component-update', `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=430,932',
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
    // Phone-like viewport: mobile metrics + touch + iOS-ish UA. The report
    // comes from a phone PWA, and dynamic viewport units behave differently
    // under mobile emulation (URL-bar collapse etc).
    await cdpCall(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 }
    });
    await cdpCall(ws, 'Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    });

    // Establish the http origin first (about:blank has none — localStorage
    // is denied there), then set up the profile and do a real boot.
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?preboot=1' });
    const preDeadline = Date.now() + 20000;
    while (true) {
      await sleep(500);
      try { await evaluate(ws, `localStorage.setItem('__probe', '1')`); break; } catch (e) { /* not there yet */ }
      if (Date.now() > preDeadline) throw new Error('pre-boot origin never became ready');
    }
    await evaluate(ws, `localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }))`);
    await evaluate(ws, `localStorage.setItem('advisoros_companion_ai', '0')`);
    await evaluate(ws, `localStorage.setItem('advisoros_v6', '{}')`);
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?navboot=1' });

    const bootDeadline = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const ready = await evaluate(ws, `typeof App !== 'undefined' && !!App.currentHash && !!document.querySelector('.comp-root')`);
      if (ready) break;
      if (Date.now() > bootDeadline) throw new Error('app never became ready');
    }
    await sleep(1200);

    console.log('--- fresh load (home) ---');
    const first = await evaluate(ws, SNAPSHOT);
    console.log(JSON.stringify(first, null, 2));
    await screenshot(ws, path.join(__dirname, 'companion-1-fresh.png'));
    ok('fresh load: comp-root mounted exactly once', first.compCount === 1, first);
    ok('fresh load: nav bar visible', first.navVisible, first);
    ok('fresh load: page not taller than viewport', first.bodyScroll <= first.innerHeight + 1, first);
    ok('fresh load: comp-root ends above nav bar', first.navVisible && first.compBottom <= first.navBottom + 1, first);
    ok('fresh load: comp-root height fits the main area', first.compHeight <= first.mainHeight + 1, first);

    // Have a conversation first — the report comes from a user who chatted,
    // then left home and came back. Rule answer + suggestion chips, focus the
    // input (as a phone user does after a message), open and close My Day.
    await evaluate(ws, `CompanionFeature.send('today')`);
    const convDeadline = Date.now() + 15000;
    while (true) {
      await sleep(300);
      const done = await evaluate(ws, `!CompanionFeature._busy && document.querySelectorAll('.comp-msg').length >= 2`);
      if (done) break;
      if (Date.now() > convDeadline) throw new Error('rule answer never rendered');
    }
    await evaluate(ws, `(() => { const i = document.getElementById('comp-input'); if (i) i.focus(); })()`);
    await evaluate(ws, `CompanionFeature.openMyDay()`);
    await sleep(800);
    await evaluate(ws, `App.closeModal({ all: true, silent: true })`);
    await sleep(400);
    console.log('--- home with transcript + My Day used ---');
    const usedState = await evaluate(ws, SNAPSHOT);
    console.log(JSON.stringify(usedState, null, 2));
    ok('used home: comp-root still single', usedState.compCount === 1, usedState);
    ok('used home: page fits viewport', usedState.bodyScroll <= usedState.innerHeight + 1, usedState);
    ok('used home: page not overflowing horizontally', !usedState.overflowX, usedState);

    // A booking made today for ~10 days out must owe an intro message — the
    // surfaced rule (not some closed-book stub) has to name it.
    await evaluate(ws, `(async () => {
      const mk = new Date(); mk.setDate(mk.getDate() + 10); mk.setHours(14, 0, 0, 0);
      const cid = await DB.db.customers.add({
        firstName: 'Amelia', lastName: 'Green', fullName: 'Amelia Green',
        phone: '07700900123', customerNumber: 'CUS-E2E-001', createdAt: new Date().toISOString()
      });
      await DB.db.appointments.add({
        customerId: cid, clientName: 'Amelia Green', phone: '07700900123',
        type: 'consultation', date: mk.toISOString(), address: '9 Birch Lane',
        status: 'confirmed', createdAt: new Date().toISOString()
      });
      return cid;
    })()`);
    await evaluate(ws, `CompanionFeature.send('messages')`);
    const msgDeadline = Date.now() + 15000;
    while (true) {
      await sleep(300);
      const done = await evaluate(ws, `!CompanionFeature._busy`);
      if (done) break;
      if (Date.now() > msgDeadline) throw new Error('messages rule never answered');
    }
    await sleep(400);
    const owedText = await evaluate(ws, `[...document.querySelectorAll('.comp-msg')].slice(-2).map(m => m.textContent).join(' | ')`);
    ok('messages rule names the booking ten days out', owedText.includes('owe a message') && owedText.includes('Intro — not sent'), owedText);

// leave home
    await evaluate(ws, `App.navigate('appointments')`);
    while (true) {
      await sleep(300);
      if (await evaluate(ws, `App.currentFeature && App.currentFeature.id === 'appointments' && !document.querySelector('.comp-root')`)) break;
    }
    await sleep(500);
    console.log('--- on appointments ---');
    const away = await evaluate(ws, SNAPSHOT);
    console.log(JSON.stringify(away, null, 2));
    await screenshot(ws, path.join(__dirname, 'companion-2-away.png'));
    ok('away screen: companion DOM fully removed', away.compCount === 0, away);

    async function backHome(label) {
      await evaluate(ws, `App.navigate('today')`);
      const backDeadline = Date.now() + 15000;
      while (true) {
        await sleep(300);
        if (await evaluate(ws, `!!document.querySelector('.comp-root')`)) break;
        if (Date.now() > backDeadline) throw new Error('home did not remount');
      }
      await sleep(600);
      const back = await evaluate(ws, SNAPSHOT);
      console.log('--- ' + label + ' ---');
      console.log(JSON.stringify(back, null, 2));
      ok(label + ': comp-root mounted exactly once', back.compCount === 1, back);
      ok(label + ': nav bar still visible', back.navVisible, back);
      ok(label + ': page not taller than viewport', back.bodyScroll <= back.innerHeight + 1, back);
      ok(label + ': comp-root ends above nav bar', back.navVisible && back.compBottom <= back.navBottom + 1, back);
      ok(label + ': comp-root height fits the main area', back.compHeight <= back.mainHeight + 1, back);
      ok(label + ': comp-root fills the main content box', await evaluate(ws, `(() => {
        const main = document.getElementById('main');
        const comp = document.querySelector('.comp-root');
        const pad = parseFloat(getComputedStyle(main).paddingBottom) || 0;
        const want = main.getBoundingClientRect().height - pad;
        const got = comp.getBoundingClientRect().height;
        return Math.abs(got - want) <= 1;
      })()`), { mainHeight: back.mainHeight, compHeight: back.compHeight });
      ok(label + ': no horizontal overflow', !back.overflowX, back);
      ok(label + ': transcript preserved', await evaluate(ws, `document.querySelectorAll('.comp-msg').length >= 2`), {});
      ok(label + ': no double render state', await evaluate(ws, `document.querySelectorAll('#comp-ai-toggle').length === 1 && !CompanionFeature._busy`), {});
      ok(label + ': no modal layers left in DOM', await evaluate(ws, `document.querySelectorAll('.modal-overlay.active, .sheet-input-mask.active, .overlay.active').length === 0`), {});
      return back;
    }

    // Return home under the full-height viewport (as the phone user does).
    const back = await backHome('return (844px viewport)');
    await screenshot(ws, path.join(__dirname, 'companion-3-back.png'));
    ok('return: comp-height unchanged vs fresh load', back.compHeight === first.compHeight, { first: first.compHeight, back: back.compHeight });
    ok('return: comp-top unchanged', back.compTop === first.compTop, { first: first.compTop, back: back.compTop });

    // Viewport drift drill: resize the viewport (simulating URL-bar hide and
    // the keyboard shrinking the visual area around a navigation), then go
    // away and back. The chat must recover into whatever #main gives it —
    // never overflow the page ("across the whole space") nor underfill.
    for (const h of [620, 740, 900]) {
      await cdpCall(ws, 'Emulation.setDeviceMetricsOverride', {
        width: 390, height: h, deviceScaleFactor: 3, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 }
      });
      await sleep(400);
      await evaluate(ws, `App.navigate('appointments')`);
      while (true) {
        await sleep(300);
        if (await evaluate(ws, `!document.querySelector('.comp-root')`)) break;
      }
      await sleep(400);
      await backHome(`return after viewport ${h}px`);
    }

    console.log(failures ? `\nCOMPANION-NAV TEST FAILED (${failures})` : '\nCOMPANION-NAV TEST PASSED');
    process.exitCode = failures ? 1 : 0;
  } finally {
    if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
    try { chromeProc.kill(); } catch (e) { /* ignore */ }
  }
})();