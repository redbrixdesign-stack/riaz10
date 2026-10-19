const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const c = { App: { registerFeature(f) { c[f.id] = f; } }, Utils: { escapeHtml: String, formatCurrency: n => `£${n}` } };
vm.createContext(c);
for (const f of ['orders/orders', 'customer/customer']) vm.runInContext(fs.readFileSync(`js/features/${f}.js`, 'utf8'), c);
for (const stage of ['ordered', 'delivered', 'fitted']) {
 const order = { source: 'survey_referral', stage, balanceDue: 0 };
 assert.equal(c.orders.displayStage(order), stage);
 assert.match(c.customer.orderStageLabel(order), /payment managed externally/);
 assert.doesNotMatch(c.orders.renderOrderCard(order, new Map()), />Paid</);
}
assert.equal(c.orders.displayStage({ source: 'survey_referral', stage: 'paid', balanceDue: 0 }), 'ordered');
assert.equal(c.orders.displayStage({ stage: 'ordered', balanceDue: 0 }), 'paid');
assert.equal(c.orders.displayStage({ stage: 'delivered', balanceDue: 100 }), 'delivered');
assert.equal(c.customer.orderStageLabel({ balanceDue: 0 }), 'Paid');
console.log('PASS referral fulfilment separated from payment; ordinary orders unchanged');
