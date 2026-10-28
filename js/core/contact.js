/* ============================================
   ADVISOROS v5.0 — CONTACT ACTIONS
   Safer customer contact sheet for file/browser builds
   ============================================ */

const ContactFeature = {
  open({ name = 'Customer', phone = '', message = '', customerId = null } = {}) {
    const cleanedPhone = String(phone || '').trim();
    if (!cleanedPhone) {
      Toast.show('No phone number added yet', 'warning');
      return;
    }

    // web.whatsapp.com is the desktop-pairing URL - it doesn't reliably
    // deep-link into the WhatsApp app on a phone, which is why this button
    // "wasn't going through" on mobile even though the number itself was
    // fine. wa.me is the one WhatsApp documents for opening the app
    // directly on any platform - reuse the same builder Talk already uses,
    // so both places agree on one correct link format.
    const whatsappUrl = message ? Utils.buildWhatsAppUrl(cleanedPhone, message) : Utils.buildWhatsAppUrl(cleanedPhone);
    // Normalize to +44... regardless of how the number is stored locally
    // (07..., 0044..., with stray spaces/dashes) - a bare national number
    // can fail silently on some devices, and this keeps Call and WhatsApp
    // agreeing on the same underlying number.
    const e164Phone = Utils.toE164Phone(cleanedPhone);
    const telUrl = e164Phone ? `tel:${e164Phone}` : `tel:${cleanedPhone.replace(/[^\d+]/g, '')}`;

    if (Number(customerId) > 0) {
      App.openModal(`<div class="sheet-header"><h3>Contact ${Utils.escapeHtml(name)}</h3><button class="btn btn-ghost" data-action="App.closeModal">Close</button></div><div class="sheet-body"><label for="contact-message">Message (optional)</label><textarea class="textarea" id="contact-message">${Utils.escapeHtml(message)}</textarea><p class="hint">Beelo records the handoff, not delivery. You choose whether to send in the destination app. SMS prefill depends on your phone; copy the text first if needed.</p><button class="btn btn-outline btn-sm" data-action="ContactFeature.copyDraft">Copy message</button>${[['whatsapp','WhatsApp'],['sms','Text message'],['phone','Call']].map(([channel,label])=>`<button class="btn btn-outline btn-block mt-sm" data-action="ContactFeature.start" data-args='${JSON.stringify([Number(customerId),channel])}'>${label}</button>`).join('')}</div>`);
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Contact ${Utils.escapeHtml(name || 'Customer')}</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="contact-sheet-number">${Utils.escapeHtml(Utils.formatPhone(cleanedPhone))}</div>
        <div class="contact-sheet-actions">
          ${whatsappUrl ? `
            <button class="btn contact-sheet-primary" data-action="ContactFeature.openWhatsApp" data-args='${Utils.escapeHtml(JSON.stringify([(whatsappUrl)]))}'>
              <span class="material-symbols-rounded">chat</span>
              WhatsApp
            </button>
          ` : ''}
          <button class="btn contact-sheet-secondary" data-action="ContactFeature.openCall" data-args='${Utils.escapeHtml(JSON.stringify([(telUrl)]))}'>
            <span class="material-symbols-rounded">phone</span>
            Call
          </button>
          <button class="btn contact-sheet-secondary" data-action="ContactFeature.copyNumber" data-args='${Utils.escapeHtml(JSON.stringify([(cleanedPhone)]))}'>
            <span class="material-symbols-rounded">content_copy</span>
            Copy Number
          </button>
        </div>
      </div>
    `;

    App.openModal(content);
  },

  init() {
    if (this._listening) return;
    this._listening = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.returnAction) return;
      if (document.visibilityState === 'hidden') this.returnAction.left = true;
      else if (this.returnAction.left) this.onReturn().catch(() => Toast.show('Outcome remains available in the customer profile', 'info'));
    });
  },

  armReturn(row) {
    this.init();
    // Only this explicit handoff can prompt, once. Never scan older customers.
    this.returnAction = row?.id ? { id:Number(row.id), customerId:Number(row.customerId), route:App.currentHash, expiresAt:Date.now()+15*60*1000, left:false } : null;
  },

  async onReturn() {
    const pending = this.returnAction;
    this.returnAction = null;
    if (!pending || document.visibilityState === 'hidden' || Date.now()>pending.expiresAt || App.currentHash!==pending.route) return;
    const params = new URLSearchParams((App.currentHash || '').split('?')[1]);
    if (App.currentFeature?.id === 'customer' && Number(params.get('id')) !== pending.customerId) return;
    if (document.getElementById('modal-overlay')?.classList.contains('active') || document.getElementById('modal-full')?.classList.contains('active')) return;
    return this.review(pending.id);
  },

  async start(customerId, channel) {
    if (this._starting || !['phone','whatsapp','sms'].includes(channel)) return;
    const revision = App._navigationRevision;
    const field = document.getElementById('contact-message');
    const text = channel === 'phone' ? '' : (field?.value || '').trim();
    this._starting = true;
    try {
      const customer = await DB.getCustomer(Number(customerId));
      const phone = Utils.toE164Phone(customer?.phone || '');
      if (!customer || !phone) throw new Error('Add a valid customer phone number first');
      const preference = await CommunicationService.preference(customer.id, channel);
      if (!CommunicationService.canContact(preference)) throw new Error('This channel is blocked by the customer’s contact preference');
      if (App._navigationRevision !== revision || (field && field !== document.getElementById('contact-message'))) return;
      const row = await CommunicationService.recordHandoff({customerId:customer.id, type:channel+'_handoff', channel, direction:'outbound', content:text});
      if (App._navigationRevision !== revision || (field && field !== document.getElementById('contact-message'))) {
        await DB.updateCommunication(row.id,{status:'cancelled'}); return;
      }
      this.armReturn(row);
      App.closeModal();
      if (channel === 'phone') this.launch('tel:'+phone);
      else if (channel === 'sms') this.launch('sms:'+phone+(text?'?body='+encodeURIComponent(text):''));
      else NotificationService.sendWhatsApp(phone,text);
      if (App.currentFeature?.id === 'customer') CustomerFeature.refreshProfile(customer.id);
    } catch (error) { Toast.show(error.message || 'Could not record contact. Nothing was opened.', 'error'); }
    finally { this._starting = false; }
  },

  launch(url) { window.location.href = url; },

  askDeleteAudio(id, customerId) {
    App.openModal(`<div class="sheet-header"><h3>Delete saved call audio?</h3></div><div class="sheet-body"><p>This removes this call’s saved audio. Written notes and the recorded outcome remain.</p><button class="btn btn-danger btn-block" data-action="ContactFeature.deleteAudio" data-args='${JSON.stringify([id,customerId])}'>Delete audio</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Keep audio</button><p id="delete-call-audio-error" role="alert"></p></div>`);
    this._audioOwner={id,customerId,revision:App._navigationRevision,element:document.getElementById('delete-call-audio-error')};
  },

  async deleteAudio(id, customerId) {
    const owner=this._audioOwner;
    if(this._deletingAudio || !owner || owner.id!==id || owner.customerId!==customerId || owner.revision!==App._navigationRevision || owner.element!==document.getElementById('delete-call-audio-error'))return;
    this._deletingAudio=true;
    try {
      await CommunicationService.deleteCallAudio(Number(id),Number(customerId));
      if(owner.element!==document.getElementById('delete-call-audio-error') || owner.revision!==App._navigationRevision)return;
      App.closeModal();CustomerFeature.refreshProfile(customerId);Toast.show('Saved call audio deleted; notes retained','success');
    }catch(error){if(owner.element===document.getElementById('delete-call-audio-error'))owner.element.textContent=error.message||'Audio could not be deleted. Please retry.';}
    finally{this._deletingAudio=false;}
  },

  async copyDraft() {
    const text=document.getElementById('contact-message')?.value || '';
    if (!text.trim()) return Toast.show('Write a message first','info');
    try { await navigator.clipboard.writeText(text); Toast.show('Message copied','success'); }
    catch (_) { Toast.show('Could not copy. Select and copy the message text above.','warning'); }
  },

  async review(id) {
    const revision = App._navigationRevision;
    const row = await DB.db.communications.get(Number(id));
    if (!row || !await DB.getCustomer(Number(row.customerId)) || revision !== App._navigationRevision) return;
    if (row.type !== 'phone_handoff') return TalkFeature.openSentConfirmation(id);
    if (row.status && row.status !== 'handed_off') return;
    const customer = await DB.getCustomer(row.customerId);
    if (revision !== App._navigationRevision) return;
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('call-outcome-notes',[]);
    App.openModal(`<div class="sheet-header"><h3>How did the call go?</h3><button class="btn btn-ghost" data-action="App.closeModal">Later</button></div><div class="sheet-body"><p>${Utils.escapeHtml(customer.fullName || [customer.firstName,customer.lastName].filter(Boolean).join(' '))}</p><p class="hint">Call action initiated at ${Utils.escapeHtml(new Date(row.createdAt).toLocaleString())}. Beelo cannot detect connection, end time or duration.</p><label for="call-outcome">Outcome you observed</label><select class="select" id="call-outcome"><option value="">Choose outcome</option><option value="answered">Answered</option><option value="no_answer">No answer / voicemail</option><option value="cancelled">Cancelled / did not call</option></select><label for="call-outcome-notes">Notes / agreed next action</label><textarea class="textarea" id="call-outcome-notes"></textarea>${typeof NoteCapture !== 'undefined'?NoteCapture.render('call-outcome-notes'):''}<p class="hint">Notes do not mark an introduction, visit agreement or reminder complete. Record those explicitly in Next actions.</p><p id="call-outcome-error" role="alert"></p><button class="btn btn-primary btn-block" data-action="ContactFeature.saveCall" data-args='${JSON.stringify([row.id,row.customerId])}'>Save call outcome</button></div>`);
    this._owner = {id:row.id,customerId:row.customerId,revision,element:document.getElementById('call-outcome-error')};
  },

  async saveCall(id, customerId) {
    const owner = this._owner;
    if (this._saving || !owner || owner.id !== Number(id) || owner.customerId !== Number(customerId) || owner.revision !== App._navigationRevision || owner.element !== document.getElementById('call-outcome-error')) return;
    const outcome = document.getElementById('call-outcome')?.value;
    if (!['answered','no_answer','cancelled'].includes(outcome)) { owner.element.textContent='Choose what happened first'; return; }
    if (typeof NoteCapture !== 'undefined' && (NoteCapture.active?.fieldId === 'call-outcome-notes' || NoteCapture.finalizing.has('call-outcome-notes'))) { owner.element.textContent='Stop recording and wait for the audio to save first'; return; }
    this._saving = true;
    try {
      const notes = document.getElementById('call-outcome-notes')?.value.trim() || '';
      const audioNotes = typeof NoteCapture !== 'undefined' ? NoteCapture.getRecordings('call-outcome-notes') : [];
      await CommunicationService.recordCallOutcome(Number(id),Number(customerId),outcome,{notes,audioNotes});
      if (owner !== this._owner || owner.element !== document.getElementById('call-outcome-error') || owner.revision !== App._navigationRevision) return;
      App.closeModal(); CustomerFeature.refreshProfile(customerId); Toast.show('Call outcome saved','success');
    } catch (error) { if(owner.element === document.getElementById('call-outcome-error'))owner.element.textContent=error.message || 'Not saved. Please retry.'; }
    finally { this._saving=false; }
  },

  async renderActivity(rows) {
    const calls=rows.filter(row=>row.type==='phone_handoff');

    const labels={answered:'Answered',no_answer:'No answer / voicemail',cancelled:'Cancelled / did not call'};
    return `<div id="customer-contact-handoffs">${calls.length?`<details><summary>Call actions initiated from Beelo (${calls.length})</summary>${(await Promise.all(calls.slice().reverse().map(async row=>{const event=(row.events||[]).find(e=>e.provenance==='advisor_call_outcome');let detail={};try{detail=JSON.parse(event?.detail||'{}')}catch(_){}const field='call-history-'+row.id;return `<div class="py-8"><strong>${Utils.escapeHtml(labels[row.status?.replace('call_','')]||'Outcome not recorded')}</strong><p class="hint">Call action initiated: ${Utils.escapeHtml(new Date(row.createdAt).toLocaleString())}${event?' · Outcome recorded: '+Utils.escapeHtml(new Date(event.occurredAt).toLocaleString()):''}. Not a measured call duration.</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${Utils.escapeHtml(detail.notes||'')}</p>${typeof NoteCapture!=='undefined'?`<div id="${field}-audio-list">${NoteCapture.renderPlaybackList(field,detail.audioNotes||[])}</div>`:''}${(detail.audioNotes||[]).length?`<button class="btn btn-outline btn-sm" data-action="ContactFeature.askDeleteAudio" data-args='${JSON.stringify([row.id,row.customerId])}'>Delete saved call audio</button>`:''}${!event&&!row.status?`<button class="btn btn-outline" data-action="ContactFeature.review" data-args='${JSON.stringify([row.id])}'>Record call outcome</button>`:''}</div>`;}))).join('')}</details>`:''}</div>`;
  },

  openWhatsApp(url) {
    if (!url) {
      Toast.show('This number needs a valid WhatsApp format', 'warning');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    App.closeModal();
  },

  openCall(url) {
    window.location.href = url;
    App.closeModal();
  },

  async copyNumber(phone) {
    try {
      await navigator.clipboard.writeText(phone);
      Toast.show('Number copied', 'success');
    } catch (error) {
      Toast.show(phone, 'info');
    }
  }
};

window.ContactFeature = ContactFeature;
