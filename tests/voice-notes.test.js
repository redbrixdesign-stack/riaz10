'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
const ok = (label, condition, extra) => {
  if (condition) console.log('OK:', label);
  else { failures++; console.error('FAIL:', label, extra || ''); }
};

const saved = [];
const navigations = [];
const toasts = [];
const elements = new Map();
const sandbox = {
  console, Date, Math, JSON, Number, String, Blob, Promise,
  setInterval: () => 1, clearInterval() {},
  navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
  MediaRecorder: class { static isTypeSupported(type) { return type === 'audio/mp4'; } },
  document: { getElementById: id => elements.get(id) || null },
  Utils: {
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    formatDate: () => '28 Aug', formatTimeUK: () => '10:30'
  },
  DB: {
    addVoiceNote: async row => { saved.push(row); return { ...row, id: 1 }; },
    deleteVoiceNote: async () => {}, updateVoiceNoteTitle: async () => {},
    getVoiceNote: async () => ({ id: 1, title: 'Test' })
  },
  App: {
    modal: '', openModal(html) { this.modal = html; }, closeModal() {},
    navigate(route, params) { navigations.push({ route, params }); }
  },
  Toast: { show(message, type) { toasts.push({ message, type }); } },
  module: { exports: {} }, exports: {}
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/services/voice-notes.js'), 'utf8'), sandbox);
const VoiceNotes = sandbox.module.exports.VoiceNotes;

(async () => {
  ok('feature detects microphone recording support', VoiceNotes.isSupported());
  VoiceNotes.openRecorder(4, 9, null);
  ok('opening recorder does not request or start recording automatically', !VoiceNotes.recorder && sandbox.App.modal.includes('Tap Start when you are ready'));
  ok('recorder clearly states local-only and no upload', sandbox.App.modal.includes('Saved only on this device') && sandbox.App.modal.includes('will not transcribe or upload'));
  ok('recorder exposes explicit Start and Stop controls', sandbox.App.modal.includes('VoiceNotes.start') && sandbox.App.modal.includes('VoiceNotes.stop'));

  const list = VoiceNotes.renderList([{ id: 2, title: '<Synthetic>', data: 'YWJj', mimeType: 'audio/mp4', durationSeconds: 65, createdAt: new Date().toISOString() }], { appointmentId: 9 });
  ok('voice-note list renders playback and duration', list.includes('<audio') && list.includes('1:05'));
  ok('voice-note title is escaped', list.includes('&lt;Synthetic>') && !list.includes('<Synthetic>'));
  ok('voice-note list exposes rename and permanent-delete paths', list.includes('VoiceNotes.openRename') && list.includes('VoiceNotes.confirmDelete'));

  VoiceNotes.context = { customerId: 4, appointmentId: 9, jobId: null };
  VoiceNotes.startedAt = Date.now() - 12000;
  VoiceNotes.recorder = { mimeType: 'audio/mp4' };
  VoiceNotes.chunks = [new Blob(['synthetic audio'], { type: 'audio/mp4' })];
  VoiceNotes.blobToDataUrl = async () => 'data:audio/mp4;base64,c3ludGhldGlj';
  await VoiceNotes.finishRecording();
  ok('finished recording saves local audio with record links', saved.length === 1 && saved[0].customerId === 4 && saved[0].appointmentId === 9 && saved[0].data === 'c3ludGhldGlj', saved[0]);
  ok('finished recording returns to linked visit', navigations.at(-1)?.route === 'appointments' && navigations.at(-1)?.params.id === 9, navigations);
  ok('save confirmation is local-only', toasts.some(t => t.message.includes('saved on this device')));

  console.log(failures ? `\n${failures} VOICE NOTE TEST(S) FAILED` : '\nVOICE NOTE TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
