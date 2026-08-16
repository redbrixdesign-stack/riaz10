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
  CONFIG: {
    advisorName: 'Riaz', weeklyTarget: 600, companyName: '', businessAddress: '',
    advisorMode: 'independent', trades: [{ id: 'blinds', name: 'Window Coverings' }], trade: 'blinds',
    distanceUnit: 'miles', measurementUnit: 'mm', country: 'GB', currency: 'GBP',
    ai: {}, commission: { mode: 'two_stage' }, autoMessages: { enabled: false }
  },
  Utils: { escapeHtml: s => String(s), formatCurrency: v => '£' + v },
  Toast: { show() {} },
  DB: { setSetting() {} },
  AIService: { lastUsage: null, isEnabled: () => false, testConnection: async () => ({}) },
  NotificationService: { isMorningBriefEnabled: () => false },
  TaxCalculator: {
    getEffectiveCommissionRate: () => 0.122,
    getRequiredWeeklySales: () => 4918,
    estimateCommission: () => 122,
    getMinHourlyRate: () => ({ rate: 28 })
  },
  ExportService: { getLastBackupMeta: () => null, isBackupStale: () => false, getBackupAgeLabel: () => '', exportBackup() {}, importBackup() {}, exportCSV() {} },
  App: {
    state: {},
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
}

})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); })
  .finally(() => process.exit(failures ? 1 : 0));