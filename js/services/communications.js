/* Explicit communication lifecycle and optional integration boundary.
   Opening another app is only a hand-off; delivery/reply states require an
   advisor confirmation or a trusted provider event. */
const CommunicationService = {
  STATES: ['drafted', 'handed_off', 'advisor_confirmed_sent', 'delivered', 'replied'],

  async preference(customerId, channel = 'whatsapp') {
    if (typeof DB.getContactPreferences !== 'function') return null;
    const result = await DB.getContactPreferences(Number(customerId));
    if (result?.current) return result.current[channel] || null;
    return Array.isArray(result) ? (result.find(row => row.channel === channel) || null) : result;
  },

  canContact(preference) {
    return !preference || !['opted_out', 'blocked', 'do_not_contact'].includes(preference.status);
  },

  async savePreference(customerId, channel, status, notes = '', audioNotes = []) {
    if (!Number.isInteger(Number(customerId)) || !channel) throw new Error('Customer and channel are required');
    if (!['unknown', 'opted_in', 'opted_out'].includes(status)) throw new Error('Invalid contact preference');
    if (typeof DB.setContactPreference !== 'function') throw new Error('Contact preference storage is unavailable');
    const operationId = this.operationId('preference', customerId);
    return DB.setContactPreference({ customerId: Number(customerId), channel, status, notes, audioNotes, effectiveAt: new Date().toISOString(), operationId }, operationId);
  },

  async recordState(communicationId, customerId, state, provenance = 'advisor') {
    if (!this.STATES.includes(state)) throw new Error('Invalid communication state');
    if (typeof DB.recordCommunicationEvent !== 'function') return null;
    const storedState = { drafted: 'queued', handed_off: 'attempted', advisor_confirmed_sent: 'sent', delivered: 'delivered', replied: 'read' }[state];
    const operationId = this.operationId(state, communicationId);
    return DB.recordCommunicationEvent(communicationId, storedState, { customerId: customerId || null, lifecycleState: state, provenance, occurredAt: new Date().toISOString() }, operationId);
  },

  async recordHandoff(data) {
    const communication = await DB.addCommunication({ ...data, type: data.type || 'whatsapp_handoff' });
    await this.recordState(communication.id, communication.customerId, 'handed_off', 'local_app_handoff');
    return communication;
  },

  async advisorConfirmSent(communicationId, customerId) {
    return this.recordState(communicationId, customerId, 'advisor_confirmed_sent', 'advisor_confirmation');
  },

  async timeline(communicationId) {
    if (typeof DB.getCommunicationEvents !== 'function') return [];
    const events = await DB.getCommunicationEvents(communicationId);
    return events.map(event => ({ ...event, lifecycleState: event.lifecycleState || ({ queued: 'drafted', attempted: 'handed_off', sent: 'advisor_confirmed_sent', delivered: 'delivered', read: 'replied' }[event.state] || event.state) }));
  },

  operationId(action, id) { return `comm:${action}:${id || 'new'}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
};

class ManualIntegrationAdapter {
  constructor() { this.id = 'manual'; this.name = 'Manual hand-off'; this.enabled = false; }
  async connect() { this.enabled = true; return { connected: true, provider: this.id }; }
  async disconnect() { this.enabled = false; return { connected: false, localDataPreserved: true }; }
  async push() { return { status: 'manual', message: 'Open the destination app and confirm the result yourself.' }; }
}

const IntegrationAdapterRegistry = {
  adapters: new Map(),
  register(adapter) { if (!adapter?.id) throw new Error('Adapter id is required'); this.adapters.set(adapter.id, adapter); return adapter; },
  get(id) { return this.adapters.get(id) || null; },
  list() { return [...this.adapters.values()]; },
  async enqueue(provider, entityType, localId, action, payload = {}) {
    const adapter = this.get(provider);
    if (!adapter || !adapter.enabled) throw new Error('Integration is disconnected');
    if (typeof DB.enqueueIntegrationOutbox !== 'function') throw new Error('Integration outbox is unavailable');
    const operationId = CommunicationService.operationId('outbox', localId);
    return DB.enqueueIntegrationOutbox({ provider, entityType, localId, action, payload, status: 'pending', provenance: 'local', operationId }, operationId);
  },
  async disconnect(provider) {
    const adapter = this.get(provider); if (!adapter) throw new Error('Integration not found');
    const result = await adapter.disconnect();
    if (typeof DB.getIntegrationLinks === 'function') {
      const links = await DB.getIntegrationLinks({ provider });
      // Links remain as provenance; disconnection never deletes local rows.
      return { ...result, retainedLinks: Array.isArray(links) ? links.length : 0 };
    }
    return result;
  }
};
IntegrationAdapterRegistry.register(new ManualIntegrationAdapter());

const CommunicationsFeature = {
  id: 'communications', name: 'Communications', icon: 'forum', route: false,
  async render() {
    const outbox = typeof DB.getIntegrationOutbox === 'function' ? await DB.getIntegrationOutbox({}) : [];
    const conflicts = typeof DB.getIntegrationConflicts === 'function' ? await DB.getIntegrationConflicts({ status: 'open' }) : [];
    const adapters = IntegrationAdapterRegistry.list();
    return `<div class="fade-in">${App.renderTopHeader({ title: 'Communications & integrations', showBack: true, backHref: 'settings' })}<div class="p-md"><div class="card card-page"><div class="section-label">Providers</div>${adapters.map(adapter => `<div class="flex justify-between items-center py-8"><div><strong>${Utils.escapeHtml(adapter.name)}</strong><div class="fs-12 text-tertiary">${adapter.enabled ? 'Connected' : 'Off by default'} · local records remain available</div></div>${adapter.enabled ? `<button class="btn btn-outline btn-sm" data-action="CommunicationsFeature.disconnect" data-args='${JSON.stringify([adapter.id])}'>Disconnect</button>` : `<button class="btn btn-outline btn-sm" data-action="CommunicationsFeature.connect" data-args='${JSON.stringify([adapter.id])}'>Enable</button>`}</div>`).join('')}</div><div class="card card-page"><div class="flex justify-between"><span>Outbox</span><strong>${outbox.filter(row => !['completed', 'cancelled'].includes(row.status)).length}</strong></div>${outbox.filter(row => !['completed', 'cancelled'].includes(row.status)).slice(0,5).map(row => `<div class="fs-12 text-secondary mt-4">${Utils.escapeHtml(row.action)} · ${Utils.escapeHtml(row.status)}</div>`).join('')}<div class="flex justify-between mt-sm"><span>Conflicts needing review</span><strong>${conflicts.length}</strong></div>${conflicts.map(row => `<div class="inset-dark p-sm mt-sm"><div class="fs-13">Local and provider versions differ.</div><div class="flex gap-sm mt-sm"><button class="btn btn-outline btn-sm" data-action="CommunicationsFeature.resolveConflict" data-args='${JSON.stringify([row.id, "keep_local"])}'>Keep local</button><button class="btn btn-outline btn-sm" data-action="CommunicationsFeature.resolveConflict" data-args='${JSON.stringify([row.id, "accept_remote"])}'>Use provider copy</button></div></div>`).join('')}<p class="hint mt-sm">Changes are saved locally first. A provider connection never becomes the only copy.</p></div></div></div>`;
  },
  async connect(provider) {
    const adapter = IntegrationAdapterRegistry.get(provider); if (!adapter) return Toast.show('Integration not found', 'error');
    await adapter.connect(); Toast.show('Manual integration enabled — no automatic sync', 'success'); App.navigate('communications');
  },
  async disconnect(provider) {
    const result = await IntegrationAdapterRegistry.disconnect(provider);
    Toast.show(`Disconnected — local data preserved${result.retainedLinks ? ` (${result.retainedLinks} linked record${result.retainedLinks === 1 ? '' : 's'})` : ''}`, 'success');
    App.navigate('communications');
  },
  async resolveConflict(id, resolution) {
    if (typeof DB.resolveIntegrationConflict !== 'function') return Toast.show('Conflict storage is unavailable', 'error');
    await DB.resolveIntegrationConflict(id, resolution, { notes: 'Resolved explicitly by advisor' });
    Toast.show(resolution === 'keep_local' ? 'Kept local version' : 'Accepted provider version', 'success'); App.navigate('communications');
  },
  async openPreferences(customerId) {
    const pref = await CommunicationService.preference(Number(customerId), 'whatsapp');
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('contact-pref-notes', pref?.audioNotes || []);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Contact preference</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><div class="form-group"><label for="contact-pref-status">WhatsApp</label><select class="select" id="contact-pref-status"><option value="unknown" ${!pref || pref.status === 'unknown' ? 'selected' : ''}>Not recorded</option><option value="opted_in" ${pref?.status === 'opted_in' ? 'selected' : ''}>Customer agrees</option><option value="opted_out" ${pref?.status === 'opted_out' ? 'selected' : ''}>Do not contact</option></select></div><div class="form-group"><label for="contact-pref-notes">Evidence or notes</label><textarea class="textarea" id="contact-pref-notes">${Utils.escapeHtml(pref?.notes || '')}</textarea>${typeof NoteCapture !== 'undefined' ? NoteCapture.render('contact-pref-notes') : ''}</div><button class="btn btn-primary btn-block" data-action="CommunicationsFeature.savePreference" data-args='${JSON.stringify([Number(customerId)])}'>Save preference</button></div>`);
  },
  async savePreference(customerId) {
    await CommunicationService.savePreference(Number(customerId), 'whatsapp', document.getElementById('contact-pref-status')?.value || 'unknown', document.getElementById('contact-pref-notes')?.value.trim() || '', typeof NoteCapture !== 'undefined' ? NoteCapture.getRecordings('contact-pref-notes') : []);
    App.closeModal(); Toast.show('Contact preference saved', 'success');
  },
  async confirmSent(communicationId, customerId) {
    await CommunicationService.advisorConfirmSent(communicationId, customerId); Toast.show('Marked as sent by advisor', 'success');
  }
};
App.registerFeature(CommunicationsFeature);
