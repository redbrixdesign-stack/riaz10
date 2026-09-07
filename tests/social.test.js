'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const nodes = {
  'social-consent': { checked: true },
  'social-privacy': { checked: true },
  'social-room': { value: 'living room' },
  'social-product': { value: 'warm neutral Roman blinds' },
  'social-benefit': { value: 'privacy without losing natural light' },
  'social-area': { value: 'Stockport' },
  'social-results': { innerHTML: '', scrollIntoView() {} }
};
let updated = null;
const context = {
  console,
  document: { getElementById: id => nodes[id] || null },
  navigator: {},
  App: { registerFeature(feature) { context.SocialFeature = feature; }, renderTopHeader: () => '', navigate() {} },
  DB: { getAppointment: async id => ({ id, type: 'fitting', clientName: 'Private Customer' }), updateAppointment: async (id, fields) => { updated = { id, fields }; } },
  AIService: { isEnabled: () => false },
  Utils: { escapeHtml: value => String(value ?? '') },
  Toast: { show() {} }, Date, Math
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/features/social/social.js', 'utf8'), context);

(async () => {
  const feature = context.SocialFeature;
  const html = await feature.render({ appointmentId: 7 });
  assert.match(html, /customer has agreed/i);
  assert.match(html, /Nothing is published automatically/);
  assert.match(html, /faces or children/);
  feature.appointmentId = 7;
  feature.mediaFile = { name: 'finished-room.jpg', type: 'image/jpeg', size: 1000 };
  await feature.generate();
  assert(updated && updated.id === 7);
  assert(updated.fields.socialMediaConsentAt);
  assert.equal(updated.fields.socialMediaConsentMethod, 'advisor_confirmed');
  assert.match(updated.fields.socialDrafts.warm, /warm neutral Roman blinds/);
  assert.doesNotMatch(JSON.stringify(updated.fields.socialDrafts), /Private Customer/);
  assert.match(nodes['social-results'].innerHTML, /Warm and personal/);
  await feature.withdrawConsent();
  assert.equal(updated.fields.socialMediaConsentAt, null);
  assert.equal(updated.fields.socialDrafts, null);
  console.log('social assistant: consent, privacy, safe context and editable drafts OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
