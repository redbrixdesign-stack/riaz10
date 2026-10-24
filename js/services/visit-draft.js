/* Beelo: one encrypted, device-local unfinished New Visit. Not a booking.
   Completed audio is included; capture/transcription must finish before leaving.
   No plaintext fallback, remote upload, or claim of guaranteed OS crash flush. */
const VisitDraft = {
  fields: ['appt-name', 'appt-phone', 'appt-address', 'appt-date', 'appt-time', 'appt-duration', 'appt-type', 'appt-source', 'appt-access', 'appt-notes', 'arrival-window', 'arrival-window-start', 'arrival-window-end', 'appt-lead-id', 'appt-job-id', 'appt-job-role', 'appt-job-operation-id'],
  current: null,
  queue: Promise.resolve(),

  init() {
    if (this.initialized) return;
    this.initialized = true;
    const changed = event => {
      const s = this.current;
      if (s?.ready && s.form.contains(event.target)) this.changed();
    };
    document.addEventListener('input', changed);
    document.addEventListener('change', changed);
    document.addEventListener('beelo:note-change', event => {
      if (event.detail?.fieldId === 'appt-notes' && this.current?.ready && !this.current.restoring) this.changed();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.isEditing()) this.flush().catch(() => {});
    });
    window.addEventListener('pagehide', () => { if (this.isEditing()) this.flush().catch(() => {}); });
    window.addEventListener('beforeunload', event => {
      if (!this.isEditing() || !this.hasWork()) return;
      // Browser confirmation is best-effort on iOS; durable autosave is primary.
      this.flush().catch(() => {});
      event.preventDefault(); event.returnValue = '';
    });
  },

  isEditing() { return !!this.current?.form?.isConnected; },
  busy() {
    if (typeof NoteCapture === 'undefined') return false;
    return NoteCapture.active?.fieldId === 'appt-notes' || NoteCapture.finalizing?.has('appt-notes') ||
      NoteCapture.getRecordings('appt-notes').some(item => [...NoteCapture.transcribing].some(pending => pending.id === item.id));
  },
  read() {
    const values = {};
    for (const id of this.fields) {
      const field = this.current?.form.querySelector('#' + id);
      if (field) values[id] = field.value;
    }
    return { values, audio: typeof NoteCapture === 'undefined' ? [] : NoteCapture.getRecordings('appt-notes') };
  },
  hasWork() {
    const s = this.current;
    if (!s?.ready) return false;
    const data = this.read();
    return ['appt-name', 'appt-phone', 'appt-address', 'appt-access', 'appt-notes', 'appt-lead-id', 'appt-job-id'].some(id => !!data.values[id]?.trim()) ||
      data.audio.length > 0 || JSON.stringify(data) !== s.initial;
  },
  status(text) {
    const el = this.current?.form.querySelector('#visit-draft-status');
    if (el) el.textContent = text;
  },
  error(error) {
    this.status(error?.message === 'draft_conflict'
      ? 'Draft changed in another tab. Keep this page open; do not overwrite the other draft.'
      : 'Draft not saved. Keep this page open and retry, or copy your notes.');
  },
  valid(draft) {
    return draft?.v === 1 && typeof draft.id === 'string' && draft.id.length > 0 && draft.id.length < 100 && draft.params?.action === 'add' &&
      Object.entries(draft.params).every(([key, value]) => ['action', 'date', 'time', 'type', 'scannedType', 'leadId', 'jobId', 'jobRole'].includes(key) && typeof value === 'string') &&
      (!draft.values?.['appt-lead-id'] || draft.values['appt-lead-id'] === draft.params.leadId) &&
      (!draft.values?.['appt-job-id'] || draft.values['appt-job-id'] === draft.params.jobId) && draft.values &&
      Object.entries(draft.values).every(([key, value]) => this.fields.includes(key) && typeof value === 'string') &&
      Array.isArray(draft.audio) && draft.audio.every(item => typeof item.id === 'string' && typeof item.dataUrl === 'string' && /^data:audio\//.test(item.dataUrl));
  },

  async start(params = {}) {
    this.init();
    const form = document.getElementById('new-visit-form');
    if (!form) return;
    const savedParams = { action: 'add' };
    for (const key of ['date', 'time', 'type', 'scannedType', 'leadId', 'jobId', 'jobRole']) {
      if (params[key] != null) savedParams[key] = String(params[key]);
    }
    const s = this.current = { form, params: savedParams, id: crypto.randomUUID(), revision: null, ready: false, saving: false };
    const panel = document.createElement('div');
    panel.className = 'card card-page'; panel.id = 'visit-draft-panel';
    panel.innerHTML = '<p id="visit-draft-status" role="status" aria-live="polite">Checking for an unfinished visit…</p><div id="visit-draft-actions"></div>';
    form.insertBefore(panel, form.querySelector('.p-md'));
    form.querySelector('.p-md').inert = true;
    try {
      const stored = await DB.getVisitDraft();
      if (this.current !== s || !form.isConnected) return;
      s.pending = stored;
      if (stored) {
        if (!this.valid(stored.draft)) throw new Error('draft_unreadable');
        // A committed booking can outlive a crash/failed draft cleanup. Never
        // offer it for a second Save; its random identity contains no PII.
        const booked = (await DB.db.appointments.toArray()).find(a => a.entryDraftId === stored.draft.id);
        if (this.current !== s || !form.isConnected) return;
        if (booked) {
          s.bookedId = booked.id;
          this.status('This unfinished entry was already saved as a visit.');
          form.querySelector('#visit-draft-actions').innerHTML = '<button type="button" class="btn btn-primary" data-action="VisitDraft.openSaved">Open saved visit</button>';
          return;
        }
        if (this.resumeRevision === stored.revision) {
          this.resumeRevision = null;
          s.id = stored.draft.id; s.revision = stored.revision;
          this.restore(stored.draft);
        } else {
          this.resumeRevision = null;
          this.status('Unfinished visit available on this device. Resume replaces this new form; nothing is booked automatically.');
          form.querySelector('#visit-draft-actions').innerHTML = '<button type="button" class="btn btn-primary" data-action="VisitDraft.resume">Resume draft</button><button type="button" class="btn btn-outline" data-action="VisitDraft.requestDiscard">Discard saved draft</button>';
          return;
        }
      } else {
        this.resumeRevision = null;
        if (params.leadId) await AppointmentsFeature.hydrateLeadBooking(Number(params.leadId));
        if (params.jobId) await AppointmentsFeature.hydrateJobBooking(Number(params.jobId));
      }
      if (this.current !== s || !form.isConnected) return;
      s.pending = null; s.initial = JSON.stringify(this.read()); s.ready = true;
      form.querySelector('.p-md').inert = false;
      form.querySelector('#visit-draft-actions').innerHTML = '<button type="button" class="btn btn-ghost" data-action="VisitDraft.requestDiscard">Discard unfinished visit</button>';
      this.status(s.revision ? 'Draft restored. Review the visit before Save.' : 'Unfinished details are saved encrypted on this device, not booked.');
      if (this.hasWork()) this.changed();
    } catch (error) {
      if (this.current !== s || !form.isConnected) return;
      this.status('Could not read the saved draft. It has not been replaced. Retry before entering another visit.');
      form.querySelector('#visit-draft-actions').innerHTML = '<button type="button" class="btn btn-outline" data-action="VisitDraft.retry">Retry draft recovery</button>';
      // Even an unreadable draft may be explicitly discarded, but only after
      // reading its revision; never delete an unknown/newer entry blindly.
      try {
        const raw = await DB.db.settings.get('__new_visit_draft_v1__');
        if (this.current === s && raw?.revision) {
          s.pending = { revision: raw.revision };
          form.querySelector('#visit-draft-actions').insertAdjacentHTML('beforeend', '<button type="button" class="btn btn-ghost" data-action="VisitDraft.requestDiscard">Discard saved draft</button>');
        }
      } catch (_) { /* storage is unavailable: retain and retry */ }
    }
  },

  restore(draft) {
    const s = this.current; s.restoring = true;
    for (const [id, value] of Object.entries(draft.values)) {
      const el = s.form.querySelector('#' + id);
      if (!el) continue;
      if (el.tagName === 'SELECT' && ![...el.options].some(option => option.value === value)) {
        const option = document.createElement('option'); option.value = value; option.textContent = value + ' — review'; el.appendChild(option);
      }
      el.value = value;
    }
    AppointmentsFeature.toggleArrivalWindowCustom(draft.values['arrival-window']);
    if (typeof NoteCapture !== 'undefined') { NoteCapture.setRecordings('appt-notes', draft.audio); NoteCapture.refresh('appt-notes'); }
    s.restoring = false;
  },
  retry() { App.navigate('appointments', this.current?.params || { action: 'add' }); },
  resume() {
    const stored = this.current?.pending;
    if (!stored) return;
    this.resumeRevision = stored.revision;
    const values = stored.draft.values;
    App.navigate('appointments', { ...stored.draft.params, date: values['appt-date'], time: values['appt-time'], type: values['appt-type'], duration: values['appt-duration'] });
  },
  changed() {
    const s = this.current;
    if (!s?.ready || s.closing || s.saving) return;
    clearTimeout(s.timer);
    this.status('Saving unfinished visit…');
    s.timer = setTimeout(() => this.flush().catch(() => {}), 300);
  },
  flush(force = false) {
    const s = this.current;
    if (!s?.ready || !s.form.isConnected || s.closing) return Promise.resolve();
    clearTimeout(s.timer);
    if (!this.hasWork() && !s.revision) return Promise.resolve();
    const snapshot = this.read();
    const signature = JSON.stringify(snapshot);
    const draft = { v: 1, id: s.id, params: s.params, ...snapshot, updatedAt: new Date().toISOString() };
    const task = this.queue.catch(() => {}).then(async () => {
      if (s.closing) return;
      if (!force && s.persisted === signature) return;
      s.revision = await DB.writeVisitDraft(draft, s.revision);
      s.persisted = signature;
      if (this.current === s && JSON.stringify(this.read()) === signature) this.status('Draft saved encrypted on this device. Not booked until Save Visit.');
    });
    this.queue = task;
    return task.catch(error => { if (this.current === s) this.error(error); throw error; });
  },

  guardNavigation(featureId, params) {
    const s = this.current;
    if (!this.isEditing()) return false;
    if (!s.ready) { this.detach(); return false; }
    if (!this.hasWork() && !s.revision) { this.detach(); return false; }
    if (window.location.hash.slice(1) !== App.currentHash) window.history.replaceState(null, '', '#' + App.currentHash);
    if (s.saving || this.busy()) { Toast.show('Finish saving, recording or transcription before leaving this visit.', 'warning'); return true; }
    this.target = { featureId, params };
    App.openModal('<div class="sheet-header"><h3>Leave unfinished visit?</h3></div><div class="sheet-body"><p>This is not a booked visit. Keep editing, or leave after keeping an encrypted draft on this device.</p><button type="button" class="btn btn-primary btn-block" data-action="App.closeModal">Keep editing</button><button type="button" class="btn btn-outline btn-block" data-action="VisitDraft.leaveKept">Leave and keep draft</button><button type="button" class="btn btn-ghost btn-block" data-action="VisitDraft.discardLeave">Discard draft and leave</button></div>');
    return true;
  },
  requestDiscard() {
    if (this.busy() || this.current?.saving) { Toast.show('Finish recording, transcription or saving first.', 'warning'); return; }
    this.target = { featureId: 'appointments', params: {} };
    App.openModal('<div class="sheet-header"><h3>Discard unfinished visit?</h3></div><div class="sheet-body"><p>This removes the unfinished draft, including its audio. Saved visits are not affected.</p><button type="button" class="btn btn-primary btn-block" data-action="App.closeModal">Keep draft</button><button type="button" class="btn btn-danger btn-block" data-action="VisitDraft.discardLeave">Discard unfinished visit</button></div>');
  },
  async leaveKept() {
    if (!this.current || this.current.closing || this.current.saving || this.busy()) return;
    const s = this.current;
    this.setSaving(true);
    try { await this.flush(true); this.leave(); } catch (_) { Toast.show('Could not keep the draft. Stay here and retry or copy your notes.', 'error'); }
    finally { if (this.current === s) this.setSaving(false); }
  },
  async discardLeave() {
    const s = this.current;
    if (!s || s.closing || s.saving || this.busy()) return;
    s.closing = true; clearTimeout(s.timer);
    try {
      await this.queue.catch(() => {});
      await DB.deleteVisitDraft(s.pending?.revision || s.revision);
      this.leave();
    } catch (error) { s.closing = false; this.error(error); Toast.show('Draft was not discarded. Keep this page open and retry.', 'error'); }
  },
  leave() {
    const target = this.target || { featureId: 'appointments', params: {} };
    this.detach(); App.closeModal({ all: true }); App.navigate(target.featureId, target.params);
  },
  detach() {
    clearTimeout(this.current?.timer); this.current = null; this.target = null;
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('appt-notes', []);
  },
  async prepareSave() {
    if (!this.isEditing()) return null;
    if (!this.current.ready || this.busy()) throw new Error('Stop recording or wait for draft recovery/transcription before saving.');
    // Always claim the current revision before booking, including unchanged
    // resumed drafts. A second tab with the old revision must fail closed.
    await this.flush(true);
    return this.current.id;
  },
  setSaving(value) {
    if (!this.isEditing()) return;
    this.current.saving = value;
    this.current.form.querySelector('.p-md').inert = value;
  },
  async saved() {
    const s = this.current;
    if (!this.isEditing()) return;
    s.closing = true; clearTimeout(s.timer);
    try { await this.queue.catch(() => {}); await DB.deleteVisitDraft(s.revision); }
    catch (_) { Toast.show('Visit saved. Its recovery draft will open the saved visit, not book it again.', 'info', 6000); }
    this.detach();
  },
  async openSaved() {
    const s = this.current;
    if (!s?.bookedId) return;
    try { await DB.deleteVisitDraft(s.pending.revision); } catch (_) { /* preserve newer draft */ }
    const id = s.bookedId; this.detach(); App.navigate('appointments', { id });
  },
  async beforeReload() {
    if (!this.isEditing()) return;
    if (this.busy() || this.current.saving) throw new Error('Finish recording, transcription or saving before updating.');
    if (this.current.ready) {
      this.setSaving(true);
      try { await this.flush(true); } finally { this.setSaving(false); }
    }
  }
};
