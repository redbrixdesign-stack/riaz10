#!/usr/bin/env node
/* ============================================
   ADVISOROS — SEED VERIFICATION
   Seeds seed-review.html into a fresh profile, boots the real app and
   asserts the demo data surfaces where it should (Home feed states,
   follow-ups inbox, orders kanban, money figures). No screenshots.
   Run: node tests/browser/verify-seed.check.js   (needs :8000 + Chrome)
   ============================================ */
'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_PORT = 9666;
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
function ok(label, cond, extra) {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
  if (!fs.existsSync(CHROME)) { console.error('Chrome not found'); process.exit(1); }
  try { const res = await fetch(BASE + '/index.html'); if (!res.ok) throw new Error(res.status); }
  catch (e) { console.error(`Can't reach ${BASE} — start the dev server first.`); process.exit(1); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'advisoros-seedcheck-'));
  const chromeProc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--disable-component-update', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break; } catch (e) {}
      await sleep(300);
    }
    const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res2, rej) => { ws.addEventListener('open', res2); ws.addEventListener('error', rej); });
    await cdpCall(ws, 'Runtime.enable');
    await cdpCall(ws, 'Page.enable');

    const scriptErrors = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        scriptErrors.push((msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      }
    });

    // 1. Seed
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/tests/browser/seed-review.html' });
    const seedDeadline = Date.now() + 30000;
    let seeded = '';
    while (true) {
      await sleep(500);
      seeded = String(await evaluate(ws, 'document.body.textContent'));
      if (seeded === 'SEEDED_OK') break;
      if (seeded.startsWith('SEED_FAILED')) throw new Error('seed failed: ' + seeded);
      if (Date.now() > seedDeadline) throw new Error('seed timed out: ' + seeded);
    }
    ok('seed page ran clean', seeded === 'SEEDED_OK', seeded);

    // 2. Boot app (encryption test mode bypasses the passphrase modal)
    await evaluate(ws, `localStorage.setItem('advisoros_enc_test', '1')`);
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?seedcheck=1' });
    const bootDeadline = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const ready = await evaluate(ws, `(typeof App !== 'undefined') && App.currentHash === 'today' && !!document.querySelector('#comp-scroll')`);
      if (ready) break;
      if (Date.now() > bootDeadline) throw new Error('app never became ready');
    }
    await sleep(2200); // let buildHomeData + data settle

    const home = await evaluate(ws, `(() => {
      const t = document.getElementById('comp-scroll') ? document.getElementById('comp-scroll').textContent : '';
      const labels = Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim());
      const states = Array.from(document.querySelectorAll('.comp-home-visit-state')).map(e => e.textContent.trim());
      const times = Array.from(document.querySelectorAll('.comp-home-visit-time')).map(e => e.textContent.trim());
      const names = Array.from(document.querySelectorAll('.comp-home-visit-name')).map(e => e.textContent.trim());
      return { labels, states, times, names, hasSmith: /John Smith/.test(t), hasTarget: /£1,800/.test(t), hasAttention: /NEEDS YOUR ATTENTION/.test(t), hasOverdueWord: /Overdue/.test(t) };
    })()`);
    ok('Home feed: NEXT → TODAY → ATTENTION → WEEK → ASK BEELO order', JSON.stringify(home.labels) === JSON.stringify(['NEXT', 'TODAY', 'NEEDS YOUR ATTENTION', 'THIS WEEK', 'ASK BEELO']), home.labels);
    ok('Home day strip: Done + Overdue + Next states present', ['Done', 'Overdue', 'Next'].every(s => home.states.includes(s)), home.states);
    ok('Home day strip: real visit names + times', home.names.includes('John Smith') && home.times.length >= 5, { names: home.names, times: home.times });
    ok('Home greeting/attention: John Smith is next; target £1,800 visible', home.hasSmith && home.hasTarget && home.hasAttention, { hasSmith: home.hasSmith, hasTarget: home.hasTarget });

    // 3. Follow-ups inbox
    const dueCount = await evaluate(ws, `(async () => await App.features.get('followups').getDueCount())()`);
    ok('follow-ups due count > 0 (mixed inbox)', dueCount > 0, dueCount);
    await evaluate(ws, `App.navigate('followups')`); await sleep(1500);
    const fup = await evaluate(ws, `document.getElementById('main').textContent`);
    ok('inbox shows payment + quote + outcome tasks', /Collect|Follow up|Outcome not logged|Intro message/i.test(fup), fup.slice(0, 400));

    // 4. Orders kanban
    await evaluate(ws, `App.navigate('orders')`); await sleep(1500);
    const kan = await evaluate(ws, `document.getElementById('main').textContent`);
    ok('kanban: all five columns present', ['Quoted', 'Ordered', 'Delivered', 'Fitted', 'Paid'].every(c => kan.includes(c)), kan.slice(0, 300));
    ok('kanban: balance figures visible', /£1,850|£925|£625/.test(kan), kan.slice(0, 300));

    // 5. Money
    await evaluate(ws, `App.navigate('money')`); await sleep(1500);
    const money = await evaluate(ws, `document.getElementById('main').textContent`);
    ok('money: expenses + mileage figures render', /£58\.40|£62\.10|mi/.test(money), money.slice(0, 300));

    // 6. Appointments diary + pipeline
    await evaluate(ws, `App.navigate('appointments', {tab: 'diary'})`); await sleep(1500);
    const diary = await evaluate(ws, `document.getElementById('main').textContent`);
    ok('diary renders today’s visits', /John Smith|O'Leary|Amelia Green/i.test(diary), diary.slice(0, 300));
    await evaluate(ws, `App.navigate('appointments', {tab: 'pipeline'})`); await sleep(1200);
    const pipe = await evaluate(ws, `document.getElementById('main').textContent`);
    ok('pipeline tab lists quoted/thinking leads', /Quote given|Needs to think|O'Leary|Khan/i.test(pipe), pipe.slice(0, 400));

    ok('boot + whole run: no JS exceptions', scriptErrors.length === 0, scriptErrors.slice(0, 5));
  } catch (e) {
    failures++;
    console.error('SEED CHECK FAILED:', e.message);
  } finally {
    if (ws) { try { ws.close(); } catch (e) {} }
    chromeProc.kill('SIGKILL');
    try { execSync(`pkill -f "user-data-dir=${profile}"`); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(failures === 0 ? '\nALL SEED CHECKS PASSED' : `\n${failures} SEED CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
