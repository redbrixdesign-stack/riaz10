const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem('advisoros_enc_test', '1');
      localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
      localStorage.setItem('advisoros_consent', JSON.stringify({ v: 2 }));
    });
    const page = await context.newPage();
    await page.goto('http://localhost:8022');
    await page.waitForFunction(() => App.currentHash === 'today');
    const result = await page.evaluate(async () => {
      const date = new Date(Utils.getTomorrow().getTime() + 12 * 3600000).toISOString();
      const visit = await DB.addAppointment({ clientName: 'SYNTHETIC Scheduler', phone: '07700900111', date, type: 'consultation' });
      const scheduler = MessageScheduler;
      scheduler._clearTimers();
      CONFIG.autoMessages = { enabled: true };
      const calls = [];
      scheduler._schedule = (a, stage) => calls.push([a.id, stage, a.date]);
      scheduler._scheduleMorningOf = a => calls.push([a.id, 'morning_of', a.date]);
      const flag = scheduler._flag('morning_of', visit.id);
      localStorage.setItem(flag, '1');
      const moved = new Date(Date.parse(date) + 3600000).toISOString();
      await DB.updateAppointment(visit.id, { date: moved });
      const changed = await DB.getAppointment(visit.id);
      const cleared = localStorage.getItem(flag) === null;
      const retimed = calls.some(c => c[1] === 'morning_of' && c[2] === moved);
      localStorage.setItem(flag, '1');
      await DB.updateAppointment(visit.id, { notes: 'SYNTHETIC note only' });
      const unchanged = localStorage.getItem(flag) === '1';
      calls.length = 0;
      await DB.updateAppointment(visit.id, { status: 'cancelled' });
      return { cleared, retimed, unchanged, timestamp: !!changed.scheduleChangedAt, cancelledTimers: calls.length };
    });
    assert.deepEqual(result, { cleared: true, retimed: true, unchanged: true, timestamp: true, cancelledTimers: 0 });
    console.log('PASS DB time-change refresh, fired flag reset, note-only preservation, timestamp and cancellation');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
