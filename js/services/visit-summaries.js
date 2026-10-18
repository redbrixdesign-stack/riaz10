/* Local review pilot. No network, speech recognition, AI model or messaging. */
const VisitSummaries = {
  labels: { requirements: 'Customer requirements', observations: 'Measurements / observations', promises: 'Promised actions', missing: 'Missing information', next: 'Proposed next action' },
  session: null,
  render(appt) {
    if (!appt.approvedVisitSummary) return '';
    try {
      const record = JSON.parse(appt.approvedVisitSummary);
      if (record.schemaVersion !== 1 || record.appointmentId !== appt.id || !record.summary) return '';
      return `<section class="card mt-sm"><h3>Approved visit summary</h3><p class="fs-13">Local pilot — adviser-reviewed, not Azure-generated</p>${Object.entries(this.labels).map(([key, label]) => `<h4>${label}</h4><p class="prewrap">${Utils.escapeHtml(record.summary[key] || 'Not captured')}</p>`).join('')}</section>`;
    } catch { return '<p>Saved summary could not be read. Original notes remain available.</p>'; }
  },
  async open(id) {
    const appt = await DB.getAppointment(Number(id));
    if (!appt) return Toast.show('Appointment not found', 'warning');
    const legacy = await DB.getVoiceNotes({ appointmentId: appt.id });
    const audio = [
      ...(appt.audioNotes || []).map(row => ({ id: `embedded:${row.id}`, title: row.title || 'Visit note audio', transcript: row.transcript || '' })),
      ...legacy.map(row => ({ id: `voice:${row.id}`, title: row.title || 'Voice note', transcript: row.transcript || '' }))
    ];
    this.session = { id: appt.id, audio, saving: false, prepared: false };
    App.openModal(`<div class="sheet-header"><h3>Review visit summary — local pilot</h3><button class="btn btn-ghost" data-action="App.closeModal">Cancel</button></div><div class="sheet-body visit-summary-body">
      <p>No Azure processing. Select a saved recording, then review its existing transcript or type a manual transcript. No audio is uploaded.</p>
      ${appt.approvedVisitSummary ? '<p role="note">Approval will replace this appointment’s existing summary. Original notes and audio stay unchanged.</p>' : ''}
      <label for="summary-audio">Saved visit audio</label><select id="summary-audio" class="input" data-action="VisitSummaries.select"><option value="">Choose one recording</option>${audio.map((row, i) => `<option value="${i}">${Utils.escapeHtml(row.title)}</option>`).join('')}</select>
      ${audio.length ? '' : '<p>Record and save a voice note in this visit’s Notes first.</p>'}
      <label for="summary-transcript">Review transcript</label><textarea id="summary-transcript" class="textarea" maxlength="12000" data-action="VisitSummaries.invalidate" data-event="input"></textarea>
      <p>Mock grouping uses Requirement:, Observation:, Promise:, Missing:, Next:. Other text stays under observations. Check all dimensions and units yourself.</p>
      <button class="btn btn-outline" data-action="VisitSummaries.prepare">Prepare local review</button>
      <div id="summary-review" hidden>${Object.entries(this.labels).map(([key, label]) => `<label for="summary-${key}">${label}</label><textarea id="summary-${key}" class="textarea" maxlength="12000" data-action="VisitSummaries.uncheck" data-event="input"></textarea>`).join('')}
      <label><input type="checkbox" id="summary-approved"> I reviewed every section and approve saving to this appointment.</label>
      <button id="summary-save" class="btn btn-primary" data-action="VisitSummaries.save">Approve and save locally</button></div></div>`);
  },
  invalidate() {
    if (this.session) this.session.prepared = false;
    const review = document.getElementById('summary-review'); if (review) review.hidden = true;
    this.uncheck();
  },
  uncheck() { const box = document.getElementById('summary-approved'); if (box) box.checked = false; },
  select() {
    this.invalidate();
    const value = document.getElementById('summary-audio').value;
    const row = value === '' ? null : this.session?.audio[Number(value)];
    document.getElementById('summary-transcript').value = row?.transcript || '';
  },
  prepare() {
    const value = document.getElementById('summary-audio').value;
    const row = value === '' ? null : this.session?.audio[Number(value)];
    this.invalidate();
    const text = document.getElementById('summary-transcript').value.trim();
    if (!row || !text || text.length > 12000) return Toast.show('Choose saved audio and enter a transcript first', 'warning');
    const tags = { requirement: 'requirements', observation: 'observations', promise: 'promises', missing: 'missing', next: 'next' };
    const summary = Object.fromEntries(Object.keys(this.labels).map(key => [key, '']));
    for (const line of text.split('\n').map(row => row.trim()).filter(Boolean)) {
      const match = /^(Requirement|Observation|Promise|Missing|Next):\s*(.*)$/i.exec(line);
      const key = match ? tags[match[1].toLowerCase()] : 'observations';
      summary[key] += (summary[key] ? '\n' : '') + (match ? match[2] : line);
    }
    for (const key of Object.keys(this.labels)) document.getElementById(`summary-${key}`).value = summary[key];
    this.session.sourceAudioId = row.id; this.session.prepared = true;
    document.getElementById('summary-review').hidden = false;
  },
  async save() {
    const session = this.session;
    if (!session?.prepared || session.saving) return;
    if (!document.getElementById('summary-approved')?.checked) return Toast.show('Confirm you reviewed every section', 'warning');
    const summary = Object.fromEntries(Object.keys(this.labels).map(key => [key, document.getElementById(`summary-${key}`).value]));
    const button = document.getElementById('summary-save');
    session.saving = true; button.disabled = true;
    try {
      await DB.saveApprovedVisitSummary(session.id, { mode: 'local-mock', sourceAudioId: session.sourceAudioId, summary }, true);
      if (this.session === session) { this.session = null; App.closeModal(); App.navigate('appointments', { id: session.id }); }
      Toast.show('Approved summary saved locally; original audio unchanged', 'success');
    } catch (error) { Toast.show(error.message || 'Could not save; review remains open', 'error'); }
    finally { session.saving = false; button.disabled = false; }
  }
};
