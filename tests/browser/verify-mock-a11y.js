#!/usr/bin/env node
/* ============================================
   ADVISOROS — MOCK HOME A11Y VERIFICATION
   Proves the Phase 1 accessibility fixes on
   reference/home-screen-mock-v2.html:
   - no inline onclick handlers
   - chips + attention rows are real <button>s
   - calendar day buttons carry aria-label/aria-selected
   - chevrons aria-hidden
   - burger aria-expanded toggles
   - contrast of corrected tokens (measured)
   - behaviour preserved (day select, alerts)
   Run: node tests/browser/verify-mock-a11y.js   (needs :8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000/reference/home-screen-mock-v2.html';

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  const alerts = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('dialog', d => { alerts.push(d.message()); d.accept(); });

  await page.goto(BASE);
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => {
    const lum = c => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      const lin = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
    };
    const contrast = (fg, bg) => {
      const a = lum(fg), b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const cs = sel => getComputedStyle(document.querySelector(sel));
    return {
      inlineHandlers: document.querySelectorAll('[onclick], [onchange], [oninput]').length,
      chipsAreButtons: Array.from(document.querySelectorAll('.chip')).every(el => el.tagName === 'BUTTON'),
      attnAreButtons: Array.from(document.querySelectorAll('.attn-row')).every(el => el.tagName === 'BUTTON'),
      dayButtons: Array.from(document.querySelectorAll('.day-item')).map(b => ({
        tag: b.tagName, label: b.getAttribute('aria-label'), selected: b.getAttribute('aria-selected'), current: b.getAttribute('aria-current')
      })),
      chevHidden: Array.from(document.querySelectorAll('.chev')).every(el => el.getAttribute('aria-hidden') === 'true'),
      burgerExpanded: document.querySelector('.burger-btn').getAttribute('aria-expanded'),
      summaryExpanded: Array.from(document.querySelectorAll('.appt-more summary')).map(s => s.getAttribute('aria-expanded')),
      // Contrast on canvas #050505
      textSecondary: contrast(cs('.section-meta').color, 'rgb(5, 5, 5)'),
      textMuted: contrast(cs('.day-label').color, 'rgb(5, 5, 5)'),
      textDisabled: contrast(cs('.nav-label').color, 'rgb(5, 5, 5)'),
      featuredButtons: Array.from(document.querySelectorAll('.appointment--featured .appt-actions .button')).map(b => b.dataset.action)
    };
  });

  console.log('\n=== Phase 1 checks ===');
  ok('zero inline event handlers', r.inlineHandlers === 0, r.inlineHandlers);
  ok('chips are real buttons', r.chipsAreButtons);
  ok('attention rows are real buttons', r.attnAreButtons);
  ok('all 7 day buttons are <button> with aria-label + aria-selected', r.dayButtons.length === 7 && r.dayButtons.every(d => d.tag === 'BUTTON' && d.label && d.selected !== null), r.dayButtons);
  ok('active day carries aria-current="date"', r.dayButtons.some(d => d.current === 'date'));
  ok('chevrons aria-hidden', r.chevHidden);
  ok('burger starts aria-expanded="false"', r.burgerExpanded === 'false');
  ok('featured buttons use data-action (no inline handlers)', r.featuredButtons.includes('navigate') && r.featuredButtons.includes('call'), r.featuredButtons);
  ok('--text-secondary ≥ 4.5:1 on canvas', r.textSecondary >= 4.5, r.textSecondary.toFixed(2));
  ok('--text-muted ≥ 4.5:1 on canvas', r.textMuted >= 4.5, r.textMuted.toFixed(2));
  ok('--text-disabled ≥ 3:1 on canvas (de-emphasised tier)', r.textDisabled >= 3, r.textDisabled.toFixed(2));
  ok('week indicator rendered from data ("This week · …–…")', /This week · .+–.+/.test(await page.evaluate(() => document.getElementById('weekTitle').textContent)));
  ok('aria-live on feed + calendar strip', (await page.evaluate(() => !!document.getElementById('appointmentFeed').getAttribute('aria-live') && !!document.getElementById('calendarStrip').getAttribute('aria-live'))));
  ok('featured card context falls back to "Visit"', (await page.evaluate(() => document.querySelector('.appointment--featured .appt-context')?.textContent)) === 'Visit');
  ok('weekend tint applied to Sat/Sun', (await page.evaluate(() => document.querySelectorAll('.day-item.weekend').length)) === 2);

  console.log('\n=== Behaviour preservation ===');
  // Navigate alert (preserved)
  await page.click('.appointment--featured .button--primary');
  ok('Navigate still alerts (preserved)', alerts[alerts.length - 1].startsWith('Navigating to'), alerts);
  // Day selection (preserved)
  await page.click('.day-item:nth-child(2)');
  await page.waitForTimeout(400);
  const title = await page.evaluate(() => document.getElementById('daySummaryTitle').textContent);
  ok('day selection still works', title === 'Completed', title);
  // Burger toggles aria-expanded
  await page.click('.burger-btn');
  const exp = await page.evaluate(() => document.querySelector('.burger-btn').getAttribute('aria-expanded'));
  ok('burger toggles aria-expanded', exp === 'true', exp);
  // Chip populates input
  await page.click('.chip:first-child');
  const inputVal = await page.evaluate(() => document.querySelector('.ask-input-wrap input').value);
  ok('chip populates the Ask Beelo input', inputVal.length > 0, inputVal);
  // Add visit alert (preserved)
  await page.click('[data-action="add-visit"]');
  ok('Add visit still alerts (preserved)', alerts[alerts.length - 1] === 'Add new visit', alerts);
  // details/summary aria-expanded sync (featured card only exists on Friday)
  await page.click('.day-item:nth-child(5)'); // back to Friday 16
  await page.waitForTimeout(400);
  await page.click('.appt-more summary');
  await page.waitForTimeout(300);
  const open = await page.evaluate(() => document.querySelector('.appt-more summary').getAttribute('aria-expanded'));
  ok('details summary aria-expanded syncs to open', open === 'true', open);

  console.log('\n=== Week navigation (was static, now moves ±7 days) ===');
  // Previous week from Fri 16 → Fri 9, week 5–11 Aug, honest empty state.
  await page.click('[data-action="shiftWeek"][data-direction="-1"]');
  await page.waitForTimeout(400);
  const prevWeek = await page.evaluate(() => ({
    title: document.getElementById('weekTitle').textContent,
    nums: Array.from(document.querySelectorAll('.day-item .day-number')).map(e => e.textContent),
    active: document.querySelector('.day-item[aria-current="date"] .day-number').textContent,
    empty: !!document.querySelector('.feed-empty')
  }));
  ok('previous week renders 5–11 Aug', /5–11 Aug/.test(prevWeek.title) && prevWeek.nums[0] === '5' && prevWeek.nums[6] === '11', prevWeek);
  ok('previous week keeps the same weekday selected (Fri 9)', prevWeek.active === '9', prevWeek);
  ok('previous week shows the honest empty state (no fabricated visits)', prevWeek.empty, prevWeek);

  // Back to the seed week → featured card returns.
  await page.click('[data-action="shiftWeek"][data-direction="1"]');
  await page.waitForTimeout(400);
  const seedWeek = await page.evaluate(() => ({
    title: document.getElementById('weekTitle').textContent,
    nums: Array.from(document.querySelectorAll('.day-item .day-number')).map(e => e.textContent),
    featured: !!document.querySelector('.appointment--featured')
  }));
  ok('back to seed week restores 12–18 Aug + featured card', /12–18 Aug/.test(seedWeek.title) && seedWeek.nums[0] === '12' && seedWeek.featured, seedWeek);

  // Next week from Fri 16 → Fri 23, week 19–25 Aug.
  await page.click('[data-action="shiftWeek"][data-direction="1"]');
  await page.waitForTimeout(400);
  const nextWeek = await page.evaluate(() => ({
    title: document.getElementById('weekTitle').textContent,
    nums: Array.from(document.querySelectorAll('.day-item .day-number')).map(e => e.textContent),
    active: document.querySelector('.day-item[aria-current="date"] .day-number').textContent
  }));
  ok('next week renders 19–25 Aug', /19–25 Aug/.test(nextWeek.title) && nextWeek.nums[0] === '19' && nextWeek.nums[6] === '25', nextWeek);
  ok('next week keeps the same weekday selected (Fri 23)', nextWeek.active === '23', nextWeek);

  // Back to the seed week for a clean exit.
  await page.click('[data-action="shiftWeek"][data-direction="-1"]');
  await page.waitForTimeout(400);

  ok('zero page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures === 0 ? '\nALL MOCK A11Y CHECKS PASSED' : `\n${failures} MOCK A11Y CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('VERIFY FAILED:', e); process.exit(1); });
