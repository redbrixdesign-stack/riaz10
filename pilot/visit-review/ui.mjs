import { VisitReview, sections } from './contract.mjs';
const session = new VisitReview();
const $ = id => document.getElementById(id);
let audioUrl;
for (const [key, name] of Object.entries(sections)) {
  const label = document.createElement('label'); label.htmlFor = key; label.textContent = name;
  const field = document.createElement('textarea'); field.id = key; field.maxLength = 12000;
  field.addEventListener('input', () => { $('confirm').checked = false; });
  $('fields').append(label, field);
}
function invalidate() { $('review').hidden = true; $('confirm').checked = false; }
function releaseAudio() {
  $('playback').pause(); $('playback').removeAttribute('src'); $('playback').hidden = true;
  if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = null;
}
function attempt(action) { try { action(); } catch (error) { $('status').textContent = error.message; } }
$('audio').addEventListener('change', () => {
  invalidate(); releaseAudio(); $('transcript').value = '';
  attempt(() => {
    session.select($('audio').files[0]);
    audioUrl = URL.createObjectURL(session.file); $('playback').src = audioUrl; $('playback').hidden = false;
    $('status').textContent = 'Audio selected locally. Enter the mock transcript; no speech recognition will run.';
  });
});
$('transcript').addEventListener('input', () => {
  invalidate(); session.draft = null; session.state = session.file ? 'selected' : 'empty';
});
$('prepare').addEventListener('click', () => {
  invalidate(); attempt(() => {
    const draft = session.prepare($('transcript').value);
    for (const key of Object.keys(sections)) $(key).value = draft.summary[key];
    $('review').hidden = false; $('status').textContent = 'Mock draft ready. Review before approving; nothing saved or sent.';
    $('requirements').focus();
  });
});
$('discard').addEventListener('click', () => {
  session.discard(); invalidate(); releaseAudio(); $('audio').value = ''; $('transcript').value = '';
  for (const key of Object.keys(sections)) $(key).value = '';
  $('status').textContent = 'Session discarded. No customer records changed.';
});
$('approve').addEventListener('click', () => attempt(() => {
  const record = session.approve(Object.fromEntries(Object.keys(sections).map(key => [key, $(key).value])), $('confirm').checked);
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'beelo-local-mock-review.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  invalidate(); $('status').textContent = 'Approved mock JSON download requested. No audio included; no visit saved or message sent.';
}));
window.addEventListener('pagehide', releaseAudio);
