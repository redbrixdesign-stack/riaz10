'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let failures = 0;
function ok(label, value) { console.log((value ? '  OK ' : '  FAIL ') + label); if (!value) failures++; }

const sandbox = {
  console, Map, Array, String, Date, JSON, Promise, Blob,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  URL: { createObjectURL: blob => `blob:test-${blob.type}`, revokeObjectURL() {} },
  Utils: { escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'), generateId: () => 'audio-test-1' },
  Toast: { show() {} }, App: { openModal() {}, closeModal() {} },
  navigator: { onLine: true }, document: {}, fetch: async () => ({ ok: true, json: async () => ({ ok: true, text: 'Synthetic transcript' }) })
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const NoteCapture = vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/services/note-capture.js'), 'utf8') + '\n;NoteCapture;', sandbox);

NoteCapture.setRecordings('notes', [{ id: 'one', dataUrl: 'data:audio/webm;base64,AAAA', mediaType: 'audio/webm' }]);
ok('audio is retained against the existing notes field', NoteCapture.getRecordings('notes').length === 1);
ok('capture UI offers recording', NoteCapture.render('notes').includes('Record voice'));
ok('saved audio offers explicit transcription', NoteCapture.render('notes').includes('Transcribe'));
ok('saved audio offers deliberate deletion', NoteCapture.render('notes').includes('Delete saved audio'));
ok('saved audio uses a Blob URL for iPhone-compatible playback', NoteCapture.render('notes').includes('src="blob:test-audio/webm"'));
ok('saved audio does not embed the full data URL in the player', !NoteCapture.render('notes').includes('src="data:audio/webm'));
ok('detail screens can render saved audio inside the owning notes section', NoteCapture.renderPlaybackList('saved-notes', NoteCapture.getRecordings('notes')).includes('<audio'));
const copy = NoteCapture.getRecordings('notes'); copy[0].id = 'changed';
ok('callers receive copies rather than mutating stored metadata', NoteCapture.getRecordings('notes')[0].id === 'one');
const noteCaptureSource = fs.readFileSync(path.join(__dirname, '../js/services/note-capture.js'), 'utf8');
ok('authorisation failure reloads encrypted device credential before retrying', noteCaptureSource.includes('response.status === 403') && noteCaptureSource.includes('DB.getDeviceAISecret()') && noteCaptureSource.includes('response = await request(secret)'));
ok('persistent authorisation failure gives an actionable registration message', noteCaptureSource.includes('Settings → Claude AI'));

const appointmentsSource = fs.readFileSync(path.join(__dirname, '../js/features/appointments/appointments.js'), 'utf8');
const customerSource = fs.readFileSync(path.join(__dirname, '../js/features/customer/customer.js'), 'utf8');
const leadsSource = fs.readFileSync(path.join(__dirname, '../js/features/leads/leads.js'), 'utf8');
const followupsSource = fs.readFileSync(path.join(__dirname, '../js/features/followups/followups.js'), 'utf8');
const quotesSource = fs.readFileSync(path.join(__dirname, '../js/features/quotes/quotes.js'), 'utf8');
const invoicesSource = fs.readFileSync(path.join(__dirname, '../js/features/invoices/invoices.js'), 'utf8');
const retentionSource = fs.readFileSync(path.join(__dirname, '../js/features/retention/retention.js'), 'utf8');
const communicationsSource = fs.readFileSync(path.join(__dirname, '../js/services/communications.js'), 'utf8');
const jobFieldSource = fs.readFileSync(path.join(__dirname, '../js/services/job-field-service.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(__dirname, '../js/core/db.js'), 'utf8');
ok('visit Notes uses unified capture', appointmentsSource.includes("NoteCapture.render('edit-appt-notes')") && appointmentsSource.includes("NoteCapture.getRecordings('edit-appt-notes')"));
ok('customer context uses unified capture', appointmentsSource.includes("NoteCapture.render('edit-cust-notes')") && appointmentsSource.includes("NoteCapture.getRecordings('edit-cust-notes')"));
ok('visit detail nests embedded and legacy audio inside Notes', appointmentsSource.includes('NoteCapture.renderPlaybackList(`visit-notes-${appt.id}`') && !appointmentsSource.includes('>Voice notes ${voiceNotes.length'));
ok('customer profile nests embedded and legacy audio inside Customer context', customerSource.includes('NoteCapture.renderPlaybackList(`customer-context-${customerId}`') && customerSource.includes('VoiceNotes.renderList(voiceNotes, { customerId })') && !customerSource.includes('>Voice notes ${voiceNotes.length'));
ok('new visits and visit lifecycle context use unified capture', ['appt-notes', 'move-note', 'cancel-note', 'outcome-notes'].every(id => appointmentsSource.includes(`NoteCapture.render('${id}')`) && appointmentsSource.includes(`NoteCapture.getRecordings('${id}')`)));
ok('lead and follow-up context use unified capture', leadsSource.includes("NoteCapture.getRecordings('lead-notes')") && followupsSource.includes("NoteCapture.getRecordings('task-notes')"));
ok('quote and invoice notes use unified capture', quotesSource.includes("NoteCapture.getRecordings('quote-notes')") && invoicesSource.includes("NoteCapture.getRecordings('invoice-notes')"));
ok('job issue and resolution context use unified capture', ['job-issue-notes', 'job-issue-resolution'].every(id => jobFieldSource.includes(`NoteCapture.getRecordings('${id}')`)));
ok('aftercare and contact-preference context use unified capture', ['retention-notes', 'retention-outcome'].every(id => retentionSource.includes(`NoteCapture.getRecordings('${id}')`)) && communicationsSource.includes("NoteCapture.getRecordings('contact-pref-notes')"));
ok('expanded record types encrypt retained audio', ['encryptLead', 'encryptTask', 'encryptQuote', 'encryptJobIssue', 'encryptInvoice', 'encryptRetentionRecord', 'encryptContactPreference'].every(name => dbSource.includes(name)) && dbSource.includes('encryptRecordWithAudio'));

console.log(failures ? `\n${failures} NOTE CAPTURE TEST(S) FAILED` : '\nALL NOTE CAPTURE TESTS PASSED');
process.exit(failures ? 1 : 0);
