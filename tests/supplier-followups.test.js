'use strict';
const fs = require('fs');
const path = require('path');
global.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
global.App = { registerFeature: feature => { global.FollowupsFeature = feature; }, renderTopHeader: () => '' };
global.CONFIG = { followups: {} };
global.Utils = { escapeHtml: String, formatCurrency: String, formatDate: String, formatTime: String, getTomorrow: () => new Date(), ukParts: () => ({ year: 2026, month: 8, day: 19 }), daysBetween: (a, b) => Math.floor((new Date(a) - new Date(b)) / 86400000) };
global.TalkFeature = { getTemplateForOutcome: () => null, SERVICE_OUTCOMES: {}, apptTimeText: () => '' };
const ago = days => new Date(Date.now() - days * 86400000).toISOString();
global.DB = {
  getPurchaseOrders: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
  getPurchaseOrder: async id => ({
    1: { id: 1, supplierName: 'North', status: 'submitted', expectedAt: ago(3), events: [] },
    2: { id: 2, supplierName: 'West', status: 'received', expectedAt: ago(1), events: [{ type: 'damage', notes: 'Bent track', open: true }] },
    3: { id: 3, supplierName: 'South', status: 'received', expectedAt: ago(5), events: [] }
  })[id]
};
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js/features/followups/followups.js'), 'utf8'));
(async () => {
  const tasks = await FollowupsFeature.loadSupplierTasks();
  if (tasks.length !== 2) throw new Error('expected overdue and damaged supplier tasks only');
  if (!tasks.some(task => task.action.includes('overdue delivery'))) throw new Error('missing overdue delivery chase');
  if (!tasks.some(task => task.action.includes('Bent track'))) throw new Error('missing damage follow-up');
  if (tasks.some(task => task.purchaseOrder.id === 3)) throw new Error('checked supplier order must not remain due');
  console.log('✓ supplier delays and issues appear in follow-ups');
})().catch(error => { console.error(error); process.exit(1); });
