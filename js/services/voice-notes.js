/* ============================================
   BEELO — OFFLINE VOICE NOTES (STAGE 1)
   Explicit recording, local storage and playback only.
   No transcription and no network upload.
   ============================================ */

const VoiceNotes = {
  MAX_SECONDS: 180,
  MAX_BYTES: 8 * 1024 * 1024,
  recorder: null,
  stream: null,
  chunks: [],
  startedAt: 0,
  timerId: null,
  modalWatchId: null,
  context: null,
  discardOnStop: false,

  isSupported() {
    return !!(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
  },

  audioSrc(note) {
    return `data:${note.mimeType || 'audio/mp4'};base64,${note.data || ''}`;
  },

  formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  },

  renderList(notes = [], context = {}) {
    if (!notes.length) return '<div class="fs-13 text-tertiary text-center py-12">No voice notes yet.</div>';
    return `<div class="voice-note-list">${notes.map(note => `
      <article class="voice-note-card">
        <div class="flex items-start gap-10">
          <span class="material-symbols-rounded text-accent" aria-hidden="true">graphic_eq</span>
          <div class="flex-1 min-w-0">
            <div class="fw-600 text-ellipsis">${Utils.escapeHtml(note.title || 'Voice note')}</div>
            <div class="fs-11 text-tertiary mt-2">${Utils.escapeHtml(Utils.formatDate(note.createdAt, 'short'))} · ${this.formatDuration(note.durationSeconds)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" aria-label="Rename voice note" data-action="VoiceNotes.openRename" data-args='${JSON.stringify([note.id, context])}'><span class="material-symbols-rounded fs-18">edit</span></button>
          <button class="btn btn-ghost btn-sm text-danger" aria-label="Delete voice note" data-action="VoiceNotes.confirmDelete" data-args='${JSON.stringify([note.id, context])}'><span class="material-symbols-rounded fs-18">delete</span></button>
        </div>
        <audio class="voice-note-audio" controls preload="metadata" src="${this.audioSrc(note)}" aria-label="Play ${Utils.escapeHtml(note.title || 'voice note')}"></audio>
      </article>`).join('')}</div>`;
  },

  openRecorder(customerId = null, appointmentId = null, jobId = null) {
    if (this.recorder && this.recorder.state !== 'inactive') return Toast.show('A voice note is already recording', 'info');
    this.context = {
      customerId: Number(customerId) || null,
      appointmentId: Number(appointmentId) || null,
      jobId: Number(jobId) || null
    };
    App.openModal(`<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Record voice note</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="VoiceNotes.cancel"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="voice-recorder" id="voice-recorder-panel">
          <span class="material-symbols-rounded voice-recorder-icon" aria-hidden="true">mic</span>
          <div class="fw-600">Saved only on this device</div>
          <div class="fs-13 text-secondary text-center mt-4">Tap Start when you are ready. Beelo will not transcribe or upload this recording.</div>
          <div class="voice-recorder-time" id="voice-recorder-time" aria-live="polite">0:00</div>
          <div class="flex gap-sm w-full">
            <button class="btn btn-primary flex-1" id="voice-recorder-start" data-action="VoiceNotes.start"><span class="material-symbols-rounded">mic</span>Start</button>
            <button class="btn btn-danger flex-1" id="voice-recorder-stop" data-action="VoiceNotes.stop" disabled><span class="material-symbols-rounded">stop</span>Stop &amp; save</button>
          </div>
        </div>
        <p class="hint mt-md mb-0">Only record other people when you have their permission. Maximum length: 3 minutes.</p>
      </div>`);
  },

  preferredMimeType() {
    const choices = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    return choices.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
  },

  async start() {
    if (!this.isSupported()) return Toast.show('Voice recording is not supported in this browser', 'warning');
    if (this.recorder && this.recorder.state !== 'inactive') return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const mimeType = this.preferredMimeType();
      this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
      this.chunks = [];
      this.discardOnStop = false;
      this.recorder.ondataavailable = event => { if (event.data?.size) this.chunks.push(event.data); };
      this.recorder.onstop = () => this.finishRecording();
      this.recorder.start(1000);
      this.startedAt = Date.now();
      document.getElementById('voice-recorder-start')?.setAttribute('disabled', '');
      document.getElementById('voice-recorder-stop')?.removeAttribute('disabled');
      document.getElementById('voice-recorder-panel')?.classList.add('is-recording');
      this.updateTimer();
      this.timerId = setInterval(() => this.updateTimer(), 1000);
      this.modalWatchId = setInterval(() => {
        if (!document.getElementById('voice-recorder-panel')) this.cancel();
      }, 500);
    } catch (e) {
      console.error('Microphone access failed:', e);
      Toast.show(e?.name === 'NotAllowedError' ? 'Microphone access was not allowed' : 'Could not start the microphone', 'error');
    }
  },

  updateTimer() {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const el = document.getElementById('voice-recorder-time');
    if (el) el.textContent = this.formatDuration(seconds);
    if (seconds >= this.MAX_SECONDS) this.stop();
  },

  stop() {
    if (!this.recorder || this.recorder.state === 'inactive') return;
    document.getElementById('voice-recorder-stop')?.setAttribute('disabled', '');
    this.recorder.stop();
  },

  cancel() {
    this.discardOnStop = true;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    else this.cleanup();
    App.closeModal();
  },

  async finishRecording() {
    const durationSeconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const recorderMime = this.recorder?.mimeType || this.chunks[0]?.type || 'audio/mp4';
    const blob = new Blob(this.chunks, { type: recorderMime });
    const context = this.context;
    const discard = this.discardOnStop;
    this.cleanup();
    if (discard) return;
    if (!blob.size) return Toast.show('No audio was captured', 'warning');
    if (blob.size > this.MAX_BYTES) return Toast.show('That recording is too large to save. Try a shorter note.', 'error');
    try {
      const dataUrl = await this.blobToDataUrl(blob);
      const now = new Date();
      await DB.addVoiceNote({
        ...context,
        data: String(dataUrl).split(',')[1] || '',
        mimeType: recorderMime,
        durationSeconds,
        title: `Voice note · ${Utils.formatDate(now, 'short')} ${Utils.formatTimeUK(now)}`
      });
      App.closeModal();
      Toast.show('Voice note saved on this device', 'success');
      this.returnTo(context);
    } catch (e) {
      console.error('Voice note save failed:', e);
      Toast.show('Could not save the voice note', 'error');
    }
  },

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Audio encode failed'));
      reader.readAsDataURL(blob);
    });
  },

  cleanup() {
    clearInterval(this.timerId);
    clearInterval(this.modalWatchId);
    this.timerId = null;
    this.modalWatchId = null;
    this.stream?.getTracks?.().forEach(track => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
  },

  async openRename(id, context = {}) {
    const note = await DB.getVoiceNote(Number(id));
    if (!note) return Toast.show('Voice note not found', 'error');
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Rename voice note</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><label for="voice-note-title">Title</label><input class="input mt-6" id="voice-note-title" maxlength="120" value="${Utils.escapeHtml(note.title || 'Voice note')}"><button class="btn btn-primary btn-block mt-md" data-action="VoiceNotes.saveTitle" data-args='${JSON.stringify([note.id, context])}'>Save title</button></div>`);
  },

  async saveTitle(id, context = {}) {
    const title = document.getElementById('voice-note-title')?.value || '';
    try {
      await DB.updateVoiceNoteTitle(id, title);
      App.closeModal();
      Toast.show('Voice note renamed', 'success');
      this.returnTo(context);
    } catch (e) { Toast.show('Enter a title for this voice note', 'warning'); }
  },

  confirmDelete(id, context = {}) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Delete voice note?</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><p class="text-secondary">This permanently removes the recording from this device and cannot be undone.</p><button class="btn btn-danger btn-block mt-md" data-action="VoiceNotes.delete" data-args='${JSON.stringify([Number(id), context])}'><span class="material-symbols-rounded">delete</span>Delete permanently</button></div>`);
  },

  async delete(id, context = {}) {
    await DB.deleteVoiceNote(id);
    App.closeModal();
    Toast.show('Voice note deleted', 'success');
    this.returnTo(context);
  },

  returnTo(context = {}) {
    if (context.appointmentId) App.navigate('appointments', { id: Number(context.appointmentId) });
    else if (context.customerId) App.navigate('customer', { id: Number(context.customerId) });
  }
};

if (typeof window !== 'undefined') window.VoiceNotes = VoiceNotes;
if (typeof module !== 'undefined') module.exports = { VoiceNotes };
