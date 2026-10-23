'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let calls = 0;
let responseStatus = 200;
let lastBody;
const messages = [];
const field = { value: 'Original notes', dispatchEvent() {} };
const sandbox = { console, Blob, Map, Set, Date, JSON, String, Promise, Event,
  navigator: { onLine: true }, document: { getElementById: () => field },
  Toast: { show: message => messages.push(message) },
  fetch: async (url, options) => {
    calls++; lastBody = options.body;
    return { status: responseStatus, ok: responseStatus === 200, json: async () => {
      if (responseStatus === 413) throw new Error('Non-JSON platform response');
      return { ok: true, text: 'Synthetic transcript' };
    } };
  }
};
vm.createContext(sandbox);
const capture = vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/services/note-capture.js'), 'utf8') + '\nNoteCapture;', sandbox);
capture.refresh = () => {};
const seed = bytes => {
  capture.setRecordings('notes', [{ id: 'size-test', mediaType: 'audio/webm', dataUrl: 'data:audio/webm;base64,' + Buffer.alloc(bytes).toString('base64') }]);
  return capture.recordings.get('notes')[0];
};
(async () => {
  let item = seed(3_000_001);
  const original = item.dataUrl;
  await capture.transcribe('notes', item.id);
  assert.equal(calls, 0, 'Oversized audio never reaches fetch');
  assert.equal(item.dataUrl, original, 'Oversized audio retained');
  assert.equal(field.value, 'Original notes');
  assert(messages.at(-1).includes('too large'));
  assert.equal(capture.transcribing.size, 0, 'Preflight releases busy state');
  assert.equal(capture.maxAudioBytes, 10 * 1024 * 1024, 'Local recording limit unchanged');
  for (const bytes of [2_999_999, 3_000_000]) {
    item = seed(bytes);
    await capture.transcribe('notes', item.id);
    assert.equal(item.transcript, 'Synthetic transcript');
    assert(new Blob([lastBody]).size < 4_100_000, 'Encoded accepted audio fits conservative transport limit');
  }
  item = seed(3);
  item.mediaType = '🧪'.repeat(1_100_000); // UTF-8 JSON envelope, not audio bytes.
  const before = calls;
  await capture.transcribe('notes', item.id);
  assert.equal(calls, before, 'Exact UTF-8 envelope size checked before fetch');
  item = seed(3);
  responseStatus = 413;
  const notesBefore = field.value;
  await capture.transcribe('notes', item.id);
  assert(messages.at(-1).includes('too large'), 'Non-JSON 413 has actionable size guidance');
  assert(!item.transcript && item.dataUrl);
  assert.equal(field.value, notesBefore);
  assert.equal(capture.transcribing.size, 0);
  responseStatus = 200;
  await capture.transcribe('notes', item.id);
  assert.equal(item.transcript, 'Synthetic transcript', 'Later retry still works');
  console.log('PASS transcription size: preflight/no upload, boundary sizes, UTF-8 envelope, local audio/notes retained, non-JSON 413 and retry');
})().catch(error => { console.error(error); process.exitCode = 1; });
