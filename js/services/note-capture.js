/* ============================================
   BEELO — UNIFIED NOTE CAPTURE
   Text stays in the existing notes field. Audio
   is retained locally with the owning record and
   is transmitted only after an explicit Transcribe tap.
   ============================================ */

const NoteCapture = {
  recordings: new Map(),
  playbackUrls: new Map(),
  active: null,
  maxDurationMs: 3 * 60 * 1000,
  maxAudioBytes: 10 * 1024 * 1024,

  setRecordings(fieldId, recordings = []) {
    this.releasePlaybackUrls(fieldId);
    this.recordings.set(fieldId, Array.isArray(recordings) ? recordings.map(item => ({ ...item })) : []);
  },

  getRecordings(fieldId) {
    return (this.recordings.get(fieldId) || []).map(item => ({ ...item }));
  },

  render(fieldId) {
    return `<div class="note-capture mt-sm" data-note-field="${Utils.escapeHtml(fieldId)}">
      <div class="flex gap-sm wrap">
        <button type="button" class="btn btn-outline btn-sm" id="${Utils.escapeHtml(fieldId)}-record" data-action="NoteCapture.toggleRecording" data-args='${JSON.stringify([fieldId])}'>
          <span class="material-symbols-rounded fs-18">mic</span><span>Record voice</span>
        </button>
      </div>
      <div class="fs-11 text-tertiary mt-6">Audio stays on this device. It is sent for transcription only when you choose Transcribe.</div>
      <div id="${Utils.escapeHtml(fieldId)}-audio-list" class="mt-sm">${this.renderList(fieldId)}</div>
    </div>`;
  },

  renderList(fieldId) {
    const rows = this.recordings.get(fieldId) || [];
    if (!rows.length) return '';
    return rows.map(item => `<div class="card inset-dark mb-sm" data-audio-id="${Utils.escapeHtml(item.id)}">
      <audio controls preload="metadata" class="w-full" src="${Utils.escapeHtml(this.playbackUrl(fieldId, item))}"></audio>
      <div class="flex gap-sm mt-sm">
        <button type="button" class="btn btn-outline btn-sm flex-1" data-action="NoteCapture.transcribe" data-args='${JSON.stringify([fieldId, item.id])}'><span class="material-symbols-rounded fs-16">text_snippet</span>${item.transcript ? 'Transcribe again' : 'Transcribe'}</button>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Delete saved audio" data-action="NoteCapture.askDelete" data-args='${JSON.stringify([fieldId, item.id])}'><span class="material-symbols-rounded fs-16">delete</span></button>
      </div>
      ${item.transcript ? '<div class="fs-11 text-success mt-6">Transcript added to Notes — review it before saving.</div>' : ''}
    </div>`).join('');
  },

  // Read-only playback for profile/detail screens. Editing, transcription and
  // deletion stay together in the owning Notes editor.
  renderPlaybackList(fieldId, recordings = []) {
    this.setRecordings(fieldId, recordings);
    const rows = this.recordings.get(fieldId) || [];
    if (!rows.length) return '';
    return `<div class="note-capture-playback mt-sm">${rows.map(item => `<div class="card inset-dark mb-sm">
      <audio controls preload="metadata" class="w-full" src="${Utils.escapeHtml(this.playbackUrl(fieldId, item))}" aria-label="Play saved note audio"></audio>
    </div>`).join('')}</div>`;
  },

  refresh(fieldId) {
    this.releasePlaybackUrls(fieldId);
    const list = document.getElementById(`${fieldId}-audio-list`);
    if (list) list.innerHTML = this.renderList(fieldId);
  },

  playbackUrl(fieldId, item) {
    const key = `${fieldId}:${item.id}`;
    const existing = this.playbackUrls.get(key);
    if (existing) return existing;
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof atob !== 'function') return item.dataUrl || '';
    try {
      const comma = String(item.dataUrl || '').indexOf(',');
      if (comma < 0) return item.dataUrl || '';
      const bytes = atob(item.dataUrl.slice(comma + 1));
      const buffer = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buffer], { type: item.mediaType || 'audio/mp4' }));
      this.playbackUrls.set(key, url);
      return url;
    } catch (error) {
      return item.dataUrl || '';
    }
  },

  releasePlaybackUrls(fieldId) {
    if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
    const prefix = `${fieldId}:`;
    for (const [key, url] of this.playbackUrls.entries()) {
      if (!key.startsWith(prefix)) continue;
      URL.revokeObjectURL(url);
      this.playbackUrls.delete(key);
    }
  },

  supportedMimeType() {
    const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return candidates.find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) || '';
  },

  async toggleRecording(fieldId) {
    if (this.active) {
      if (this.active.fieldId !== fieldId) return Toast.show('Stop the current recording first', 'warning');
      return this.stopRecording();
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return Toast.show('Voice recording is not supported in this browser', 'warning');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.supportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      const startedAt = Date.now();
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearTimeout(this.active?.timer);
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        this.active = null;
        this.setRecordButton(fieldId, false);
        if (!blob.size) return Toast.show('No audio was captured', 'warning');
        if (blob.size > this.maxAudioBytes) return Toast.show('Recording is too large — keep voice notes under 3 minutes', 'warning');
        const dataUrl = await this.blobToDataUrl(blob);
        const rows = this.recordings.get(fieldId) || [];
        rows.push({ id: Utils.generateId('audio-note'), dataUrl, mediaType: blob.type || 'audio/webm', durationMs: Date.now() - startedAt, transcript: '', createdAt: new Date().toISOString() });
        this.recordings.set(fieldId, rows);
        this.refresh(fieldId);
        Toast.show('Audio saved with this note', 'success');
      };
      recorder.onerror = () => { stream.getTracks().forEach(track => track.stop()); this.active = null; this.setRecordButton(fieldId, false); Toast.show('Could not record audio', 'error'); };
      // A single complete recording is more reliable than concatenating timed
      // MP4 fragments on iPhone Safari. Duration and size guards still cap it.
      recorder.start();
      this.active = { fieldId, recorder, stream, timer: setTimeout(() => this.stopRecording(), this.maxDurationMs) };
      this.setRecordButton(fieldId, true);
      Toast.show('Recording — tap Stop when finished', 'info');
    } catch (error) {
      Toast.show(error?.name === 'NotAllowedError' ? 'Microphone permission was not allowed' : 'Could not start recording', 'error');
    }
  },

  stopRecording() {
    if (this.active?.recorder?.state === 'recording') this.active.recorder.stop();
  },

  setRecordButton(fieldId, recording) {
    const button = document.getElementById(`${fieldId}-record`);
    if (!button) return;
    button.classList.toggle('btn-danger', recording);
    button.innerHTML = recording ? '<span class="material-symbols-rounded fs-18">stop_circle</span><span>Stop recording</span>' : '<span class="material-symbols-rounded fs-18">mic</span><span>Record voice</span>';
  },

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  async transcribe(fieldId, audioId) {
    if (!navigator.onLine) return Toast.show('Transcription needs an internet connection; the audio remains saved', 'warning');
    const item = (this.recordings.get(fieldId) || []).find(row => row.id === audioId);
    if (!item) return Toast.show('Audio note not found', 'error');
    const comma = item.dataUrl.indexOf(',');
    const audio = comma >= 0 ? item.dataUrl.slice(comma + 1) : '';
    Toast.show('Transcribing — your audio remains saved', 'info', 5000);
    try {
      let secret = typeof AIService !== 'undefined' ? AIService.config().secret : '';
      const request = credential => fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(credential ? { 'x-ai-key': credential } : {}) },
          body: JSON.stringify({ audio, mediaType: item.mediaType || 'audio/webm' })
        });
      let response = await request(secret);
      // CONFIG/session state can be evicted independently of IndexedDB on an
      // installed iPhone PWA. Recover the encrypted device credential and retry
      // exactly once before asking the adviser to register the device again.
      if (response.status === 403 && typeof DB !== 'undefined' && typeof DB.getDeviceAISecret === 'function') {
        const deviceSecret = await DB.getDeviceAISecret().catch(() => '');
        if (deviceSecret && deviceSecret !== secret) {
          secret = deviceSecret;
          CONFIG.ai = { ...(CONFIG.ai || {}), secret };
          try { sessionStorage.setItem('advisoros_ai_secret', secret); } catch (e) {}
          response = await request(secret);
        }
      }
      const result = await response.json().catch(() => null);
      if (response.status === 403) throw new Error('This device needs registering again in Settings → Claude AI');
      if (!response.ok || !result?.ok || !result.text) throw new Error(result?.message || 'Transcription failed');
      const field = document.getElementById(fieldId);
      if (!field) throw new Error('Notes field is no longer open');
      const before = field.value.trim();
      field.value = [before, result.text.trim()].filter(Boolean).join(before ? '\n\n' : '');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      item.transcript = result.text.trim();
      item.transcribedAt = new Date().toISOString();
      this.refresh(fieldId);
      Toast.show('Transcript added — review and edit before saving', 'success', 6000);
    } catch (error) {
      Toast.show(error?.message || 'Could not transcribe; the audio remains saved', 'error', 6000);
    }
  },

  askDelete(fieldId, audioId) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Delete this audio?</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><p class="text-secondary mb-md">The text already added to Notes will stay. Only the saved recording will be removed when you save this record.</p><button class="btn btn-danger btn-block" data-action="NoteCapture.confirmDelete" data-args='${JSON.stringify([fieldId, audioId])}'>Delete audio</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Keep audio</button></div>`);
  },

  confirmDelete(fieldId, audioId) {
    this.recordings.set(fieldId, (this.recordings.get(fieldId) || []).filter(row => row.id !== audioId));
    App.closeModal();
    this.refresh(fieldId);
    Toast.show('Audio removed — save the record to confirm', 'success');
  }
};
