'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function run(file) {
  let resolveFetch, requests = 0, modalChanges = 0;
  let field = { value: 'Original context', dispatchEvent() {} };
  const list = { innerHTML: '' };
  const context = vm.createContext({ console, Map, Set, Date, JSON, Event,
    Utils: { escapeHtml: String }, navigator: { onLine: true },
    document: { getElementById: id => id === 'notes' ? field : list },
    App: { openModal() { modalChanges++; }, closeModal() { modalChanges++; } },
    Toast: { show() {} },
    fetch: () => { requests++; return new Promise(resolve => { resolveFetch = resolve; }); }
  });
  const notes = vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + '\n;NoteCapture;', context);
  const audio = { id: 'mock', dataUrl: 'data:audio/webm;base64,AAAA' };
  notes.setRecordings('notes', [audio]);
  notes.askDelete('notes', 'mock');
  assert.match(list.innerHTML, /Keep audio/);
  notes.confirmDelete('notes', 'mock');
  assert.equal(modalChanges, 0, 'deletion preserves the parent editor');
  assert.equal(field.value, 'Original context');
  assert.equal(notes.getRecordings('notes').length, 0);
  notes.setRecordings('notes', [audio]);
  const pending = notes.transcribe('notes', 'mock');
  await notes.transcribe('notes', 'mock');
  assert.equal(requests, 1, 'repeated taps make one request');
  field = { value: 'Another customer', dispatchEvent() {} };
  notes.setRecordings('notes', [audio]);
  resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true, text: 'Old customer transcript' }) });
  await pending;
  assert.equal(field.value, 'Another customer', 'late response cannot alter another editor');
  assert.equal(notes.transcribing.size, 0);
  console.log('PASS notes lifecycle:', file);
}
(async () => { await run('js/services/note-capture.js'); await run('js/services/note-capture.min.js'); })().catch(error => { console.error(error); process.exitCode = 1; });
