/* Explicit communication lifecycle and optional integration boundary.
   Opening another app is only a hand-off; delivery/reply states require an
   advisor confirmation or a trusted provider event. */
const CommunicationService = {
  STATES: ['drafted', 'handed_off', 'advisor_confirmed_sent', 'delivered', 'replied', 'cancelled'],

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
    const storedState = { drafted: 'queued', handed_off: 'attempted', advisor_confirmed_sent: 'sent', delivered: 'delivered', replied: 'read', cancelled: 'cancelled' }[state];
    const operationId = this.operationId(state, communicationId);
    return DB.recordCommunicationEvent(communicationId, storedState, { customerId: customerId || null, lifecycleState: state, provenance, occurredAt: new Date().toISOString() }, operationId);
  },

  async recordHandoff(data) {
    if (data.appointmentId && typeof DB.visitContactSnapshot === 'function') {
      const visit = await DB.getAppointment(data.appointmentId);
      if (visit) data = { ...data, bookingSnapshot: DB.visitContactSnapshot(visit) };
    }
    const communication = await DB.addCommunication({ ...data, type: data.type || 'whatsapp_handoff' });
    await this.recordState(communication.id, communication.customerId, 'handed_off', 'local_app_handoff');
    return communication;
  },

  async advisorConfirmSent(communicationId, customerId, reviewedSnapshot = null, confirmedTemplate = null) {
    if (typeof DB.resolveCommunicationSend !== 'function') throw new Error('Message confirmation needs an app update. Reload Beelo and review this message again.');
    return DB.resolveCommunicationSend(communicationId, customerId, 'sent', reviewedSnapshot, confirmedTemplate);
  },

  async recordCallOutcome(id, customerId, outcome, detail = {}) {
    if (!['answered','no_answer','cancelled'].includes(outcome)) throw new Error('Choose a call outcome');
    if (typeof DB.db.transaction !== 'function') throw new Error('Safe call saving is unavailable. Please reload and retry.');
    // Encrypt potentially sensitive notes/audio BEFORE entering the atomic write.
    const now = new Date().toISOString();
    const event = await encryptCommunicationEvent({communicationId:id,customerId,state:'attempted',lifecycleState:'call_'+outcome,provenance:'advisor_call_outcome',occurredAt:now,createdAt:now,detail:JSON.stringify(detail)});
    return DB._runWrite(['communications','communicationEvents','customers'],async()=>{
      const row=await DB.db.communications.get(id);
      if (!row || row.type!=='phone_handoff' || Number(row.customerId)!==customerId || !await DB.db.customers.get(customerId)) throw new Error('This customer call is no longer available');
      if (row.status) throw new Error('This call outcome is already recorded. Reopen the profile.');
      await DB.db.communicationEvents.add(event);
      await DB.db.communications.update(id,{status:'call_'+outcome});
    });
  },

  async deleteCallAudio(id, customerId) {
    const call=await DB.db.communications.get(id);
    if(!call || call.type!=='phone_handoff' || Number(call.customerId)!==customerId)throw new Error('Call not found');
    const event=(await DB.getCommunicationEvents(id)).find(e=>e.provenance==='advisor_call_outcome');
    if(!event)return;
    const raw=await DB.db.communicationEvents.get(event.id);
    const detail=JSON.parse(event.detail||'{}');
    const encrypted=await encryptCommunicationEvent({detail:JSON.stringify({...detail,audioNotes:[]})});
    return DB._runWrite(['communications','communicationEvents'],async()=>{
      const current=await DB.db.communications.get(id),latest=await DB.db.communicationEvents.get(event.id);
      if(!current || Number(current.customerId)!==customerId || !latest || JSON.stringify(latest.detail)!==JSON.stringify(raw.detail))throw new Error('Call changed. Reopen the profile and retry.');
      await DB.db.communicationEvents.update(event.id,{detail:encrypted.detail});
    });
  },

  async lifecycle(communication) {
    const events = communication?.id && typeof DB.getCommunicationEvents === 'function'
      ? await DB.getCommunicationEvents(communication.id)
      : [];
    const latest = events[events.length - 1];
    let state = latest?.lifecycleState || ({ queued: 'drafted', attempted: 'handed_off', sent: 'advisor_confirmed_sent', delivered: 'delivered', read: 'replied' }[latest?.state]);
    if (!state) state = communication?.type === 'note' ? 'note' : communication?.direction === 'inbound' ? 'replied' : (communication?.sentAt ? 'advisor_confirmed_sent' : 'handed_off');
    if (communication?.type === 'phone_handoff') state = communication.status || 'call_opened';
    else if (['advisor_confirmed_sent', 'cancelled', 'superseded'].includes(communication?.status)) state = communication.status === 'superseded' ? 'cancelled' : communication.status;
    return { ...communication, lifecycleState: state, events };
  },

  async decorate(rows = []) {
    return Promise.all(rows.map(row => this.lifecycle(row)));
  },

  isConfirmed(communication) {
    return ['advisor_confirmed_sent', 'delivered', 'replied'].includes(communication?.lifecycleState);
  },

  introductionEvidence(customerId, visits = [], messages = []) {
    const own = visits.filter(v => Number(v.customerId) === Number(customerId));
    const explicit = own.some(v => v.introSent || (typeof TaskService !== 'undefined' && TaskService.contactEvidence(v).introduced)) || messages.some(m => Number(m.customerId) === Number(customerId) && m.direction !== 'inbound' && ['pre_intro','intro_day_before'].includes(m.confirmedTemplate || m.template) && this.isConfirmed(m));
    const knownRelationship = own.some(v => v.status !== 'cancelled' && v.outcome && !['cancelled','customer_no_show','advisor_unavailable'].includes(v.outcome) && new Date(v.date) < new Date());
    return { explicit, knownRelationship, introduced: explicit || knownRelationship };
  },

  visitEvidence(visit) {
    const contact = typeof TaskService !== 'undefined' ? TaskService.contactEvidence(visit) : {};
    return { introduced:!!(visit.introSent || contact.introduced), reminderSent:!!visit.dayBeforeSent, agreed:!!contact.agreed, inactive:visit.status==='cancelled'||!!visit.outcome||visit.status==='completed' };
  },

  collectionResponsibility(order) {
    if (order.source==='survey_referral' || order.paymentManagedExternally || ['company','external'].includes(order.paymentResponsibility)) return 'external';
    return order.paymentResponsibility==='advisor' ? 'advisor' : 'unknown';
  },

  async pendingHandoffs({ includeInactive = false } = {}) {
    const rows = await this.decorate(await DB.db.communications.toArray());
    const groups = new Map();
    for (const row of rows.filter(row => row.lifecycleState === 'handed_off' && row.direction !== 'inbound' && ['whatsapp_handoff', 'whatsapp_attempted','sms_handoff'].includes(row.type)).sort((a,b) => Number(b.id) - Number(a.id))) {
      if (!includeInactive && row.appointmentId) {
        const visit = await DB.getAppointment(Number(row.appointmentId));
        if (!visit || Number(visit.customerId) !== Number(row.customerId) || visit.status === 'cancelled') continue;
        const at = new Date(visit.date), now = new Date();
        if (['pre_intro','intro_day_before','day_before','evening_before'].includes(row.template) && (visit.status !== 'confirmed' || visit.outcome || isNaN(at) || at <= now)) continue;
        if (row.template === 'post_fit_followup' && now - at >= 7*86400000) continue;
        if (row.template === 'service_or_issue_followup' && now - at >= 48*3600000) continue;
      }
      const key = JSON.stringify([row.customerId, row.appointmentId || null, row.template || '', row.bookingSnapshot || null,row.channel || 'whatsapp']);
      if (!groups.has(key)) groups.set(key, row);
    }
    return [...groups.values()];
  },

  purposeLabel(template) {
    return ({ pre_intro: 'Introduction', intro_day_before: 'Introduction and visit reminder', day_before: 'Visit reminder', evening_before: 'Visit reminder', post_fit_followup: 'Post-fitting thank-you', service_or_issue_followup: 'Service follow-up' })[template] || 'Outgoing message';
  },

  activityLabel(row) {
    return ({call_opened:'Call action initiated — outcome not recorded',call_answered:'Call answered (adviser recorded)',call_no_answer:'Call: no answer / voicemail (adviser recorded)',call_cancelled:'Call cancelled / not made (adviser recorded)',cancelled:'Not sent',drafted:'Message drafted',advisor_confirmed_sent:'Message confirmed sent',delivered:'Message delivered',replied:'Customer reply',note:'Internal note'})[row.lifecycleState] || (row.lifecycleState==='handed_off' ? (row.channel==='sms'?'Text message handoff — sending unconfirmed':'WhatsApp handoff — sending unconfirmed') : 'Recorded activity');
  },

  async recordReply(customerId, content, channel = 'whatsapp', agreement = null) {
    const text = String(content || '').trim();
    if (!Number.isInteger(Number(customerId)) || Number(customerId)<=0 || !text || !['whatsapp','sms','email','phone'].includes(channel)) throw new Error('Customer, channel and reply are required');
    if (agreement) {
      if (!DB.db.transaction) throw new Error('Safe agreement saving is unavailable. Reload and retry.');
      return DB._runWrite(['communications','communicationEvents','appointments','customers'],async()=>{
        const visit=await DB.db.appointments.get(Number(agreement.appointmentId));
        if (!visit || Number(visit.customerId)!==Number(customerId) || !await DB.db.customers.get(Number(customerId))) throw new Error('This visit does not belong to this customer');
        const prior=(await DB.db.communications.toArray()).find(row=>row.operationId===agreement.operationId);
        if(prior){if(prior.customerId!==Number(customerId)||prior.content!==text||prior.appointmentId!==visit.id)throw new Error('This reply operation changed. Reopen the form.');return prior;}
        await DB.recordVisitContact(visit.id,'visit_agreed',agreement.snapshot,agreement.operationId,channel);
        const row=await DB.addCommunication({customerId:Number(customerId),appointmentId:visit.id,type:channel+'_reply',channel,direction:'inbound',content:text,receivedAt:new Date().toISOString(),status:'replied',operationId:agreement.operationId});
        await this.recordState(row.id,Number(customerId),'replied','advisor_recorded_reply');return row;
      });
    }
    const receivedAt = new Date().toISOString();
    const communication = await DB.addCommunication({ customerId: Number(customerId), type: `${channel}_reply`, channel, direction: 'inbound', content: text, receivedAt, status: 'replied' });
    await this.recordState(communication.id, Number(customerId), 'replied', 'advisor_recorded_reply');
    return communication;
  },

  async reviewEligibility(visit) {
    try {
      if (!visit || visit.outcome!=='completed' || visit.status==='cancelled') return {eligible:false,reason:'Fitting not completed'};
      if (typeof DB.getJobs!=='function' || typeof DB.getJobIssues!=='function') return {eligible:true};
      const jobs=(await DB.getJobs({customerId:visit.customerId})).filter(j=>j.id===visit.jobId || (visit.orderId && j.orderId===visit.orderId));
      for(const job of jobs) if ((await DB.getJobIssues(job.id)).some(issue=>!['resolved','cancelled'].includes(issue.status))) return {eligible:false,reason:'A linked issue remains unresolved'};
      return {eligible:true};
    } catch (_) {return {eligible:false,reason:'Could not check linked issues'};}
  },

  async timeline(communicationId) {
    if (typeof DB.getCommunicationEvents !== 'function') return [];
    const events = await DB.getCommunicationEvents(communicationId);
    return events.map(event => ({ ...event, lifecycleState: event.lifecycleState || ({ queued: 'drafted', attempted: 'handed_off', sent: 'advisor_confirmed_sent', delivered: 'delivered', read: 'replied' }[event.state] || event.state) }));
  },

  operationId(action, id) { return `comm:${action}:${id || 'new'}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
};

const CommunicationsFeature = {
  id: 'communications', name: 'Communication history', icon: 'forum', route: false,
  async render() {
    let outbox=[],conflicts=[],communications=[];const errors=[];
    try { outbox=typeof DB.getIntegrationOutbox==='function'?await DB.getIntegrationOutbox({}):[]; } catch(_){errors.push('pending local records');}
    try { conflicts=typeof DB.getIntegrationConflicts==='function'?await DB.getIntegrationConflicts({status:'open'}):[]; } catch(_){errors.push('legacy conflicts');}
    try { communications=await CommunicationService.decorate((await DB.db.communications.toArray()).sort((a,b)=>new Date(b.createdAt||b.sentAt||0)-new Date(a.createdAt||a.sentAt||0)).slice(0,20)); } catch(_){errors.push('communication activity');}
    const e=Utils.escapeHtml,labels={handed_off:'Opened — confirmation needed',advisor_confirmed_sent:'Confirmed sent',delivered:'Delivered',replied:'Customer reply',cancelled:'Not sent',note:'Internal note'},pending=outbox.filter(r=>!['completed','cancelled'].includes(r.status));
    return `<div class="fade-in">${App.renderTopHeader({title:'Communication history',showBack:true,backHref:'settings'})}<div class="p-md">
      <p class="hint mb-md">Recent records saved in Beelo. Review each customer’s full context in their profile. Opening another app does not prove sending or delivery.</p>
      ${errors.length?`<p role="alert">Could not load ${e(errors.join(', '))}. Reopen this screen to retry.</p>`:''}
      <section class="card card-page"><h2 class="fs-16">Recent activity · latest 20</h2>${communications.length?communications.map(row=>`<div class="py-8"><strong class="fs-13">${e(labels[row.lifecycleState]||row.lifecycleState||'Message')}</strong><div class="fs-12 text-tertiary prewrap">${e(row.content||row.type||'')}</div>${row.lifecycleState==='handed_off'?`<button class="btn btn-primary btn-sm" data-action="CommunicationsFeature.confirmSent" data-args='${JSON.stringify([row.id,row.customerId||0])}'>Record whether sent</button>`:''}</div>`).join(''):errors.includes('communication activity')?'':'<p class="hint">No communication activity recorded yet.</p>'}</section>
      ${pending.length||conflicts.length||errors.some(r=>r!=='communication activity')?`<details class="card card-page"><summary>Saved legacy exchange records</summary><p class="hint">Local pending records and conflicts retained from the prototype. These entries do not establish a live provider connection.</p><p>Pending: ${errors.includes('pending local records')?'Unavailable':pending.length}</p>${pending.slice(0,5).map(r=>`<p class="hint">${e(r.action)} · ${e(r.status)}</p>`).join('')}<p>Conflicts: ${errors.includes('legacy conflicts')?'Unavailable':conflicts.length}</p>${conflicts.map(r=>`<div class="inset-dark p-sm"><p>Saved local and provider-labelled copies differ. Review before choosing.</p><button class="btn btn-outline btn-sm" data-action="CommunicationsFeature.resolveConflict" data-args='${JSON.stringify([r.id,'keep_local'])}'>Keep local</button><button class="btn btn-outline btn-sm" data-action="CommunicationsFeature.resolveConflict" data-args='${JSON.stringify([r.id,'accept_remote'])}'>Use saved provider copy</button></div>`).join('')}</details>`:''}
    </div></div>`;
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
    return TalkFeature.openSentConfirmation(communicationId);
  }
};
App.registerFeature(CommunicationsFeature);
