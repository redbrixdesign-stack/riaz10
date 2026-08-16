#!/usr/bin/env node
/* ============================================
   ADVISOROS — HOME SCREEN VIEWPORT CHECK
   Boots the real app in headless Chrome at 320/375/390/430px widths and
   asserts the Home (companion feed) has no horizontal overflow, renders
   its sections in the right order (Greeting → Next → Today →
   Attention → This Week → Ask Beelo), and shows real visit times.
   Run: node tests/browser/home-viewport.check.js   (needs :8000 + Chrome)
   ============================================ */
'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_PORT = 9555;
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
  let res;
  try { res = await fetch(BASE + '/index.html'); if (!res.ok) throw new Error(res.status); }
  catch (e) { console.error(`Can't reach ${BASE} — start the dev server first.`); process.exit(1); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'advisoros-vp-'));
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

    // Seed the realistic sales scenario (Sarah Johnson + today's visits).
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/tests/browser/seed-features.html' });
    const seedDeadline = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const t = String(await evaluate(ws, 'document.body.textContent'));
      if (t === 'SEEDED_OK') break;
      if (t.startsWith('SEED_FAILED')) throw new Error('seed failed: ' + t);
      if (Date.now() > seedDeadline) throw new Error('seed timed out');
    }
    await evaluate(ws, `localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true, advisorName: 'Riaz Ahmed' }))`);
    await evaluate(ws, `localStorage.setItem('advisoros_enc_test', '1')`);

    const widths = [320, 375, 390, 430];
    for (const w of widths) {
      await cdpCall(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 700, deviceScaleFactor: 2, mobile: true });
      await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?vp=' + w });
      const bootDeadline = Date.now() + 30000;
      while (true) {
        await sleep(500);
        const ready = await evaluate(ws, `(typeof App !== 'undefined') && App.currentHash === 'today' && !!document.querySelector('#comp-scroll')`);
        if (ready) break;
        if (Date.now() > bootDeadline) throw new Error(`boot timed out at ${w}px`);
      }
      await sleep(1800); // let buildHomeData settle

      const report = await evaluate(ws, `(() => {
        const doc = document.documentElement;
        const main = document.getElementById('main');
        const labels = Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim());
        const times = Array.from(document.querySelectorAll('.comp-home-visit-time')).map(e => e.textContent.trim());
        const now = new Date();
        const nowT = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        return {
          overflowX: doc.scrollWidth - doc.clientWidth,
          mainOverflowX: main ? main.scrollWidth - main.clientWidth : null,
          labels,
          times,
          hasAvatar: !!document.querySelector('.comp-home-avatar'),
          hasGoldenDot: !!document.querySelector('.comp-home-greeting-dot'),
          hasGreetingHeading: !!document.querySelector('.comp-home-greeting-main[role="heading"]'),
          hasStatePills: Array.from(document.querySelectorAll('.comp-home-visit-state')).map(e => e.textContent.trim()),
          visitCount: document.querySelectorAll('.comp-home-visit').length,
          anyTimeIsNow: times.some(t => t === nowT)
        };
      })()`);

      const p = w + 'px';
      ok(`${p}: no horizontal overflow`, report.overflowX <= 0 && (report.mainOverflowX === null || report.mainOverflowX <= 0), { overflowX: report.overflowX, main: report.mainOverflowX });
      ok(`${p}: name heading + golden dot render, no B avatar`, report.hasGreetingHeading && report.hasGoldenDot && !report.hasAvatar);
      // Section order: Greeting has no label, so the labelled order is
      // THIS WEEK (week strip) → NEXT → TODAY → TOMORROW → ATTENTION → ASK BEELO.
      const labelled = report.labels;
      const iWeek = labelled.indexOf('THIS WEEK');
      const iRight = labelled.indexOf('NEXT');
      const iToday = labelled.indexOf('TODAY');
      const iTomorrow = labelled.indexOf('TOMORROW');
      const iAtt = labelled.indexOf('NEEDS YOUR ATTENTION');
      const iAsk = labelled.indexOf('ASK BEELO');
      ok(`${p}: labelled sections present`, iWeek >= 0 && iRight > iWeek && iToday > iRight && iAsk > iToday, labelled);
      ok(`${p}: tomorrow sits between today and attention`, iTomorrow < 0 || (iTomorrow > iToday && (iAtt < 0 || iTomorrow < iAtt)), { iToday, iTomorrow, iAtt });
      ok(`${p}: this-week strip sits above attention`, iAtt < 0 || iWeek < iAtt, { iWeek, iAtt });
      ok(`${p}: visit rows show real times (not the live clock)`, report.visitCount > 0 && !report.anyTimeIsNow, { times: report.times });
      ok(`${p}: state labels are textual (not colour alone)`, report.hasStatePills.every(s => ['Done', 'Next', 'Overdue'].includes(s)), report.hasStatePills);
      console.log(`  ${p} feed:`, JSON.stringify({ labels: labelled, states: report.hasStatePills, times: report.times }));
    }

    // Sanity: fresh boot with NO data — the calm empty state.
    await cdpCall(ws, 'Emulation.setDeviceMetricsOverride', { width: 375, height: 700, deviceScaleFactor: 2, mobile: true });
    await evaluate(ws, `DB.deleteAllData()`);
    await evaluate(ws, `localStorage.clear()`);
    await evaluate(ws, `localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }))`);
    await evaluate(ws, `localStorage.setItem('advisoros_enc_test', '1')`);
    await cdpCall(ws, 'Page.navigate', { url: BASE + '/index.html?empty=1' });
    const d2 = Date.now() + 30000;
    while (true) {
      await sleep(500);
      const ready = await evaluate(ws, `(typeof App !== 'undefined') && App.currentHash === 'today' && !!document.querySelector('#comp-scroll')`);
      if (ready) break;
      if (Date.now() > d2) throw new Error('empty boot timed out');
    }
    await sleep(1800);
    const empty = await evaluate(ws, `(() => ({
      labels: Array.from(document.querySelectorAll('.comp-home-section-label')).map(e => e.textContent.trim()),
      text: document.getElementById('comp-scroll') ? document.getElementById('comp-scroll').textContent.slice(0, 200) : '',
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    ok('empty state: no visits → calm "No visits" + Ask Beelo chips', empty.labels.includes('TODAY') && empty.labels.includes('ASK BEELO') && /No visits booked today/.test(empty.text), { labels: empty.labels, text: empty.text.slice(0, 120) });
    ok('empty state: no horizontal overflow', empty.overflowX <= 0, empty.overflowX);
  } catch (e) {
    failures++;
    console.error('VIEWPORT CHECK FAILED:', e.message);
  } finally {
    if (ws) { try { ws.close(); } catch (e) {} }
    chromeProc.kill('SIGKILL');
    try { execSync(`pkill -f "user-data-dir=${profile}"`); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(failures === 0 ? '\nALL VIEWPORT CHECKS PASSED' : `\n${failures} VIEWPORT CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
