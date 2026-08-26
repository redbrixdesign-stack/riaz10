/* ============================================
   ADVISOROS — SETTINGS FEATURE TESTS
   Run with: node tests/settings.test.js

   The Settings index must never claim the AI is "Connected" when it is only
   enabled — without a proxy URL every AI feature silently falls back, so the
   summary has to say "Needs setup" instead. Also guards that the vestigial
   duplicate render paths (renderCommissionCard / renderAutoMessagesCard /
   renderAICard) stay gone — one render path per screen, not two to drift.
   ============================================ */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const stored = new Map();
const sessionStored = new Map();
const privateStored = new Map();

let failures = 0;
function ok(label, cond, extra) {
  if (cond) {
    console.log('  OK ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

const sandbox = {
  console,
  window: { location: { href: 'http://localhost' } },
  document: { head: { appendChild() {} }, getElementById() { return null; } },
  localStorage: {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); }
  },
  sessionStorage: {
    getItem(key) { return sessionStored.has(key) ? sessionStored.get(key) : null; },
    setItem(key, value) { sessionStored.set(key, String(value)); },
    removeItem(key) { sessionStored.delete(key); }
  },
  CONFIG: {
    advisorName: 'Riaz', weeklyTarget: 600, companyName: '', businessAddress: '',
    advisorMode: 'independent', trades: [{ id: 'blinds', name: 'Window Coverings' }], trade: 'blinds',
    distanceUnit: 'miles', measurementUnit: 'mm', navigationApp: 'ask', unlockTimeoutMinutes: 60, country: 'GB', currency: 'GBP',
    ai: {}, commission: { mode: 'two_stage' }, autoMessages: { enabled: false }
  },
  Utils: { escapeHtml: s => String(s), formatCurrency: v => '£' + v },
  Toast: { show() {} },
  DB: {
    setSetting() {},
    async setPrivateSetting(key, value) { privateStored.set(key, value); },
    async deletePrivateSetting(key) { privateStored.delete(key); }
  },
  AIService: { lastUsage: null, isEnabled: () => false, testConnection: async () => ({}) },
  NotificationService: {
    isMorningBriefEnabled: () => false,
    isVisitReminderEnabled: () => true,
    setVisitReminderEnabled() {},
    requestPushPermission: async () => true
  },
  TaxCalculator: {
    getEffectiveCommissionRate: () => 0.122,
    getRequiredWeeklySales: () => 4918,
    estimateCommission: () => 122,
    getMinHourlyRate: () => ({ rate: 28 })
  },
  ExportService: { getLastBackupMeta: () => null, isBackupStale: () => false, getBackupAgeLabel: () => '', exportBackup() {}, importBackup() {}, exportCSV() {} },
  App: {
    state: {},
    unlockUpdates: [],
    setActiveVisitUnlock(active) { this.unlockUpdates.push(active); },
    renderTopHeader: () => '',
    navigate() {},
    openModal() {},
    closeModal() {},
    registerFeature(f) { sandbox.App.feature = f; }
  }
};
sandbox.App.feature = null;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, 'js/features/settings/settings.js'), 'utf8'), sandbox);
const SettingsFeature = sandbox.App.feature;

(async () => {

console.log('AI index summary (never claim a connection that is not there)');
{
  sandbox.CONFIG.ai = { enabled: false, proxyUrl: '' };
  const html = SettingsFeature.renderIndex();
  ok('disabled -> Off', html.includes('>Off</div>') && html.includes('Claude AI'), html.match(/Claude AI.{0,60}/s)?.[0]);
}

console.log('commission index summary (decimal rate rendered as a percentage)');
{
  const html = SettingsFeature.renderIndex();
  ok('0.122 effective rate -> 12.2%', html.includes('12.2% effective · two_stage'), html.match(/Commission Rate[\s\S]{0,240}/)?.[0]);
  ok('does not display the decimal as 0.122%', !html.includes('0.122% effective'), html.match(/Commission Rate[\s\S]{0,240}/)?.[0]);
}
{
  sandbox.CONFIG.ai = { enabled: true, proxyUrl: '' };
  const html = SettingsFeature.renderIndex();
  ok('enabled without proxy URL -> Needs setup', html.includes('Needs setup'), html.match(/Claude AI.{0,60}/s)?.[0]);
}
{
  sandbox.CONFIG.ai = { enabled: true, proxyUrl: 'https://x.vercel.app/api/claude' };
  const html = SettingsFeature.renderIndex();
  ok('enabled with proxy URL -> Connected', html.includes('Connected'), html.match(/Claude AI.{0,60}/s)?.[0]);
}

console.log('single render path per screen (vestigial duplicates removed)');
{
  ok('renderCommissionDetail exists', typeof SettingsFeature.renderCommissionDetail === 'function');
  ok('renderAutoMessagesDetail exists', typeof SettingsFeature.renderAutoMessagesDetail === 'function');
  ok('renderAIDetail exists', typeof SettingsFeature.renderAIDetail === 'function');
  ok('renderCommissionCard gone', SettingsFeature.renderCommissionCard === undefined);
  ok('renderAutoMessagesCard gone', SettingsFeature.renderAutoMessagesCard === undefined);
  ok('renderAICard gone', SettingsFeature.renderAICard === undefined);
}

console.log('detail screens render');
{
  const html = SettingsFeature.render({ section: 'commission' });
  ok('commission detail renders example line', html.includes('Example:') && html.includes('commission'), html.slice(0, 80));
  const units = SettingsFeature.render({ section: 'units' });
  ok('units detail renders HMRC mileage hint for GB', units.includes('HMRC pays mileage relief in miles'), units.slice(0, 80));

  const navigation = SettingsFeature.render({ section: 'navigation' });
  ok('navigation detail offers ask + three map apps', ['Ask every time', 'Apple Maps', 'Google Maps', 'Waze'].every(label => navigation.includes(label)), navigation.slice(0, 120));
  ok('ask every time is selected by default', navigation.includes('data-args=\'["ask"]\'') && navigation.includes('aria-checked="true"'), navigation.slice(0, 180));

  const security = SettingsFeature.render({ section: 'security' });
  ok('app lock offers minute and hour choices', ['After 15 minutes', 'After 1 hour', 'After 24 hours'].every(label => security.includes(label)), security.slice(0, 160));
  ok('app lock explains the active-visit exception', security.includes('Active visits stay unlocked') && security.includes('Leaving the customer restarts'), security.slice(0, 220));
}

console.log('navigation preference persists');
{
  SettingsFeature.setNavigationApp('waze');
  const saved = JSON.parse(stored.get('advisoros_config'));
  ok('Waze becomes the active preference', sandbox.CONFIG.navigationApp === 'waze');
  ok('navigation preference is saved locally', saved.navigationApp === 'waze', saved.navigationApp);
  ok('settings index reflects saved map', SettingsFeature.renderIndex().includes('Waze'));
  SettingsFeature.setNavigationApp('ask');
}

console.log('app-lock timeout persists');
{
  await SettingsFeature.setUnlockTimeout('30');
  const saved = JSON.parse(stored.get('advisoros_config'));
  ok('30-minute timeout becomes active', sandbox.CONFIG.unlockTimeoutMinutes === 30);
  ok('unlock timeout is saved locally', saved.unlockTimeoutMinutes === 30, saved.unlockTimeoutMinutes);
  ok('changing timeout refreshes the current grace window', sandbox.App.unlockUpdates.at(-1) === false);
}

console.log('AI shared secret persists as a device-only credential');
{
  await SettingsFeature.setAISecret('device-secret');
  ok('secret reaches encrypted-device storage API', privateStored.get('__device_ai_secret__') === 'device-secret');
  ok('secret remains available to the current session', sessionStored.get('advisoros_ai_secret') === 'device-secret' && sandbox.CONFIG.ai.secret === 'device-secret');
  ok('ordinary saved config excludes the secret', !JSON.parse(stored.get('advisoros_config')).ai.secret);
  ok('AI settings explains device-only encrypted storage', SettingsFeature.renderAIDetail().includes('Saved securely on this device') && SettingsFeature.renderAIDetail().includes('never included in Beelo backups'));
  await SettingsFeature.clearAISecret();
  ok('forget secret clears device and session copies', !privateStored.has('__device_ai_secret__') && !sessionStored.has('advisoros_ai_secret') && sandbox.CONFIG.ai.secret === '');
}

})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); })
  .finally(() => process.exit(failures ? 1 : 0));
