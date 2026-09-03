/* ============================================
   BEELO — RETENTION
   Local post-job relationship actions. This is a
   secondary customer workflow, never a primary tab.
   ============================================ */

const RetentionFeature = {
  id: 'retention', name: 'Retention', icon: 'handshake', route: false,
  TYPES: {
    satisfaction_check: ['Satisfaction check', 'sentiment_satisfied'],
    review_request: ['Review request', 'star'],
    referral: ['Referral', 'group_add'],
    warranty: ['Warranty', 'verified_user'],
    service: ['Service reminder', 'build'],
    repeat_opportunity: ['Repeat opportunity', 'repeat']
  },

  render(params = {}) { return this.renderCustomer(Number(params.customerId), params); },
  meta(type) { const value = this.TYPES[type] || ['Retention action', 'handshake']; return { label: value[0], icon: value[1] }; },

  async renderCustomer(customerId, params = {}) {
    if (!Number.isInteger(customerId) || customerId <= 0) return '<div class="empty-state"><span class="material-symbols-rounded">person_off</span><div>Choose a customer first</div></div>';
    let customer = null, records = [], preferences = {};
    try { customer = await DB.getCustomer(customerId); } catch (e) {}
    try { records = await DB.getRetentionRecords({ customerId }); } catch (e) { console.error('Retention load failed:', e); }
    try { preferences = await DB.getContactPreferences(customerId) || {}; } catch (e) {}
    const name = customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Customer';
    const open = records.filter(record => !['completed', 'cancelled'].includes(record.status));
    const preferenceStatus = channel => Array.isArray(preferences) ? preferences.find(item => item.channel === channel)?.status : preferences[channel]?.status || preferences[channel] || 'unknown';
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: 'Aftercare', showBack: true, backHref: params.jobId ? `jobs?id=${params.jobId}` : `customer?id=${customerId}`, actions: `<button class="btn btn-primary btn-sm" data-action="RetentionFeature.openAdd" data-args='${JSON.stringify([customerId, Number(params.orderId) || null, Number(params.jobId) || null])}'><span class="material-symbols-rounded">add</span>Action</button>` })}
      <div class="p-md">
        <div class="card card-page"><strong>${Utils.escapeHtml(name)}</strong><div class="fs-13 text-secondary mt-6">${open.length} open aftercare action${open.length === 1 ? '' : 's'}</div></div>
        <div class="card card-page"><div class="section-label">Contact preferences</div><div class="grid-2 gap-sm">
          ${this.preferenceButton(customerId, 'phone', 'Phone', preferenceStatus('phone'))}
          ${this.preferenceButton(customerId, 'email', 'Email', preferenceStatus('email'))}
          ${this.preferenceButton(customerId, 'sms', 'SMS', preferenceStatus('sms'))}
          ${this.preferenceButton(customerId, 'whatsapp', 'WhatsApp', preferenceStatus('whatsapp'))}
        </div><div class="hint mt-sm">Preferences are explicit. Opening a messaging app never counts as consent or delivery.</div></div>
        <div class="section-label">Aftercare timeline</div>
        ${records.length ? records.sort((a, b) => new Date(a.dueAt || a.createdAt) - new Date(b.dueAt || b.createdAt)).map(record => this.renderRecord(record)).join('') : '<div class="empty-state"><span class="material-symbols-rounded">handshake</span><div>No aftercare actions yet</div></div>'}
      </div>
    </div>`;
  },

  preferenceButton(customerId, channel, label, status) {
    const enabled = status === 'opted_in';
    return `<button class="btn ${enabled ? 'btn-primary' : 'btn-outline'} btn-sm" aria-pressed="${enabled}" data-action="RetentionFeature.togglePreference" data-args='${JSON.stringify([customerId, channel, enabled ? 'opted_out' : 'opted_in'])}'>${Utils.escapeHtml(label)} · ${Utils.escapeHtml(String(status || 'unknown').replace('_', ' '))}</button>`;
  },

  renderRecord(record) {
    const meta = this.meta(record.type);
    const done = record.status === 'completed';
    return `<div class="card card-page"><div class="flex items-start gap-sm"><span class="material-symbols-rounded">${meta.icon}</span><div class="flex-1"><div class="flex justify-between gap-sm"><strong>${Utils.escapeHtml(meta.label)}</strong><span class="badge">${Utils.escapeHtml(record.status || 'planned')}</span></div><div class="fs-12 text-tertiary mt-2">${record.dueAt ? `Due ${Utils.formatDate(record.dueAt, 'short')}` : 'No due date'}${record.notes ? ` · ${Utils.escapeHtml(record.notes)}` : ''}</div>${record.score ? `<div class="fs-13 mt-6">Satisfaction ${record.score}/5</div>` : ''}${record.outcome ? `<div class="fs-13 mt-6">${Utils.escapeHtml(record.outcome)}</div>` : ''}</div></div>${!done ? `<button class="btn btn-outline btn-sm btn-block mt-sm" data-action="RetentionFeature.openComplete" data-args='${JSON.stringify([record.id, record.customerId, record.type])}'><span class="material-symbols-rounded">done</span>Complete</button>` : ''}</div>`;
  },

  openAdd(customerId, orderId = null, jobId = null) {
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('retention-notes', []);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>New aftercare action</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <div class="form-group"><label for="retention-type">Action</label><select class="input" id="retention-type">${Object.entries(this.TYPES).map(([type, value]) => `<option value="${type}">${value[0]}</option>`).join('')}</select></div>
      <div class="form-group"><label for="retention-due">Due date</label><input class="input" id="retention-due" type="date" value="${due}" required></div>
      <div class="form-group"><label for="retention-notes">Notes</label><textarea class="input" id="retention-notes" rows="3" placeholder="Facts or context only"></textarea>${typeof NoteCapture !== 'undefined' ? NoteCapture.render('retention-notes') : ''}</div>
      <button class="btn btn-primary btn-block" data-action="RetentionFeature.saveNew" data-args='${JSON.stringify([customerId, orderId, jobId])}'>Save action</button>
    </div>`);
  },

  async saveNew(customerId, orderId = null, jobId = null) {
    const type = document.getElementById('retention-type')?.value;
    const dueAt = document.getElementById('retention-due')?.value;
    const notes = (document.getElementById('retention-notes')?.value || '').trim();
    if (!this.TYPES[type] || !dueAt) return Toast.show('Choose an action and due date', 'warning');
    try { await DB.addRetentionRecord({ customerId, type, dueAt, notes, audioNotes: typeof NoteCapture !== 'undefined' ? NoteCapture.getRecordings('retention-notes') : [], status: 'planned', ...(Number(orderId) ? { orderId: Number(orderId) } : {}), ...(Number(jobId) ? { jobId: Number(jobId) } : {}) }); App.closeModal(); Toast.show('Aftercare action saved', 'success'); App.navigate('retention', { customerId }); }
    catch (error) { console.error('Retention save failed:', error); Toast.show('Could not save aftercare action', 'error'); }
  },

  async openComplete(id, customerId, type) {
    const existing = (await DB.getRetentionRecords({ customerId })).find(row => row.id === Number(id));
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('retention-outcome', existing?.audioNotes || []);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Complete aftercare</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">${type === 'satisfaction_check' ? '<div class="form-group"><label for="retention-score">Satisfaction</label><select class="input" id="retention-score"><option value="">Choose score</option><option value="1">1 — very unhappy</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 — very happy</option></select></div>' : ''}<div class="form-group"><label for="retention-outcome">Outcome</label><textarea class="input" id="retention-outcome" rows="3" placeholder="What happened?"></textarea>${typeof NoteCapture !== 'undefined' ? NoteCapture.render('retention-outcome') : ''}</div><button class="btn btn-primary btn-block" data-action="RetentionFeature.saveCompletion" data-args='${JSON.stringify([id, customerId, type])}'>Complete action</button></div>`);
  },

  async saveCompletion(id, customerId, type) {
    const score = Number(document.getElementById('retention-score')?.value || 0);
    const outcome = (document.getElementById('retention-outcome')?.value || '').trim();
    if (type === 'satisfaction_check' && !(score >= 1 && score <= 5)) return Toast.show('Choose a satisfaction score', 'warning');
    try { await DB.updateRetentionRecord(id, { status: 'completed', completedAt: new Date().toISOString(), audioNotes: typeof NoteCapture !== 'undefined' ? NoteCapture.getRecordings('retention-outcome') : [], ...(score ? { score } : {}), ...(outcome ? { outcome } : {}) }); App.closeModal(); Toast.show('Aftercare action completed', 'success'); App.navigate('retention', { customerId }); }
    catch (error) { console.error('Retention completion failed:', error); Toast.show('Could not complete action', 'error'); }
  },

  async togglePreference(customerId, channel, status) {
    try {
      await DB.setContactPreference({ customerId, channel, status, effectiveAt: new Date().toISOString(), consentSource: 'advisor_recorded' }, `contact-preference:${customerId}:${channel}:${Date.now()}`);
      Toast.show(`${channel} ${status.replace('_', ' ')}`, 'success'); App.navigate('retention', { customerId });
    } catch (error) { console.error('Preference update failed:', error); Toast.show('Could not update preference', 'error'); }
  }
};

App.registerFeature(RetentionFeature);
