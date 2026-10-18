// Local mock only. No provider SDK, network, persistence or messaging dependency.
export const sections = {
  requirements: 'Customer requirements',
  observations: 'Measurements / observations',
  promises: 'Promised actions',
  missing: 'Missing information',
  next: 'Proposed next action'
};
const tags = { requirement: 'requirements', observation: 'observations', promise: 'promises', missing: 'missing', next: 'next' };
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export function validateAudio(file) {
  const allowed = ['audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav'];
  if (!file || !allowed.includes(file.type.split(';')[0])) throw new Error('Select a supported audio file (WAV, MP3, M4A, WebM or Ogg).');
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error('Audio must be non-empty and at most 10 MB.');
}
export function validateSummary(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 5) throw new Error('Invalid summary fields.');
  for (const key of Object.keys(sections)) {
    if (typeof value[key] !== 'string' || value[key].length > 12000) throw new Error('Invalid summary text.');
  }
  if (!Object.values(value).some(text => text.trim())) throw new Error('Review must contain some text.');
  return Object.fromEntries(Object.keys(sections).map(key => [key, value[key].trim()]));
}
export class VisitReview {
  constructor() { this.discard(); }
  discard() { this.file = null; this.draft = null; this.state = 'empty'; }
  select(file) {
    // A failed replacement must never leave the previous draft approvable.
    this.discard();
    validateAudio(file);
    this.file = file;
    this.state = 'selected';
  }
  prepare(transcript) {
    if (!this.file) throw new Error('Select audio first.');
    this.draft = null;
    this.state = 'selected';
    if (typeof transcript !== 'string' || !transcript.trim() || transcript.length > 12000) throw new Error('Enter a mock transcript of 1–12000 characters.');
    const summary = Object.fromEntries(Object.keys(sections).map(key => [key, '']));
    for (const line of transcript.split('\n').map(text => text.trim()).filter(Boolean)) {
      const match = /^(Requirement|Observation|Promise|Missing|Next):\s*(.*)$/i.exec(line);
      const key = match ? tags[match[1].toLowerCase()] : 'observations';
      summary[key] += (summary[key] ? '\n' : '') + (match ? match[2] : line);
    }
    this.draft = { schemaVersion: 1, mode: 'local-mock', source: { name: this.file.name, mediaType: this.file.type, bytes: this.file.size }, transcript: transcript.trim(), summary: validateSummary(summary) };
    this.state = 'review';
    return structuredClone(this.draft);
  }
  approve(edited, confirmed) {
    if (this.state !== 'review' || !this.draft) throw new Error('Prepare a new review first.');
    if (confirmed !== true) throw new Error('Confirm you reviewed every section.');
    const summary = validateSummary(edited);
    const record = { ...structuredClone(this.draft), summary, approval: { status: 'approved', at: new Date().toISOString(), destination: 'local-json-export' } };
    this.state = 'approved';
    return record;
  }
}
