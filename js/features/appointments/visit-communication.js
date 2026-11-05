/* Communication belongs to the visit being worked, with customer-wide history. */
const VisitCommunication = {
  active(customerId = null) {
    const root=document.getElementById('visit-communication');
    return App.currentFeature?.id==='appointments' && !!root?.isConnected && (customerId===null || Number(root.dataset.customerId)===Number(customerId));
  },
  refresh() {
    if(!this.active())return;
    const root=document.getElementById('visit-communication');
    this._restore={id:Number(root.dataset.appointmentId),scroll:App._inlineOriginScroll??Math.max(document.getElementById('main')?.scrollTop||0,window.scrollY||0,document.scrollingElement?.scrollTop||0),open:[...document.querySelectorAll('#main details[open][id]')].map(el=>el.id)};
    return App.navigate(App.currentHash);
  },
  restore(id) {
    const state=this._restore;this._restore=null;
    if(!state || Number(id)!==state.id)return;
    state.open.forEach(id=>{const el=document.getElementById(id);if(el)el.open=true;});
    App._workspaceNavigationScroll={revision:App._navigationRevision,scroll:state.scroll};
  },
  async openReply(appointmentId) {
    const revision=App._navigationRevision,visit=await DB.getAppointment(Number(appointmentId));
    if(!visit || revision!==App._navigationRevision || !this.active(visit.customerId))return;
    await CustomerFeature.openReplyModal(visit.customerId);
    if(revision!==App._navigationRevision)return;
    const select=document.getElementById('workspace-agreement-visit');
    if(select && CustomerFeature._replySnapshots?.has(visit.id))select.value=String(visit.id);
  },
  async render(visit,customer) {
    const esc=Utils.escapeHtml,args=value=>esc(JSON.stringify(value));
    if(!customer)return `<section class="card card-page" role="alert"><h2 class="fs-18">Communication &amp; follow-ups</h2><p>The linked customer record is unavailable. Reopen this visit to retry; saved visit details have not been cleared.</p>${visit.phone?`<button class="btn btn-outline" data-action="ContactFeature.open" data-args='${args([{name:visit.clientName||'Customer',phone:visit.phone}])}'>Contact visit number</button><p class="hint">This contact is not linked to a customer history.</p>`:''}</section>`;
    let rows=[],visits=[],failed=false;
    try {rows=await CommunicationService.decorate(await DB.db.communications.where('customerId').equals(customer.id).toArray());visits=await DB.getAppointmentsByCustomer(customer.id);}catch(_){failed=true;}
    const evidence=CommunicationService.visitEvidence(visit),introduced=failed?null:CommunicationService.introductionEvidence(customer.id,visits,rows).introduced;
    const messages=rows.filter(r=>r.type!=='phone_handoff').sort((a,b)=>new Date(b.receivedAt||b.createdAt)-new Date(a.receivedAt||a.createdAt));
    const renderRow=r=>`<article class="visit-comm-event"><strong>${esc(CommunicationService.activityLabel(r))}</strong><p class="hint">${esc(Utils.formatDate(r.receivedAt||r.createdAt,'short'))} · ${esc(r.channel||r.type||'Recorded activity')}${Number(r.appointmentId)===Number(visit.id)?' · This visit':r.appointmentId?' · Another visit':' · Customer record'}</p><p class="prewrap">${esc(Utils.truncate(r.content||'No draft text captured',180))}</p>${String(r.content||'').length>180?`<details><summary>Read saved text</summary><p class="prewrap">${esc(r.content)}</p></details>`:''}</article>`;
    return `<section id="visit-communication" class="card card-page visit-communication" data-appointment-id="${visit.id}" data-customer-id="${customer.id}" aria-labelledby="visit-communication-title">
      <h2 id="visit-communication-title" class="fs-18">Communication &amp; follow-ups</h2>
      <p class="hint">Next action for this visit, with the customer's saved communication history.</p>
      <div class="visit-comm-status" aria-label="Visit communication status"><span>Introduction: ${introduced===null?'unavailable':introduced?'recorded / known relationship':'not recorded'}</span><span>Reminder: ${evidence.reminderSent?'confirmed sent':'not recorded sent'}</span><span>Window agreement: ${evidence.agreed?'recorded for this window':'not recorded'}</span></div>
      <div class="visit-comm-actions"><button class="btn btn-outline btn-sm" data-action="ContactFeature.start" data-args='${args([customer.id,'phone',visit.id])}'>Call</button><button class="btn btn-outline btn-sm" data-action="ContactFeature.open" data-args='${args([{name:visit.clientName||customer.fullName||'Customer',phone:customer.phone||visit.phone||'',customerId:customer.id,appointmentId:visit.id}])}'>Message</button><button class="btn btn-outline btn-sm" data-action="VisitCommunication.openReply" data-args='${args([visit.id])}'>Log reply</button></div>
      ${await FollowupsFeature.renderCustomerPanel(customer.id,{appointmentId:visit.id})}
      <section id="customer-action-host" class="cw-inline" aria-label="Visit communication action" hidden></section>
      <details id="visit-communication-history" class="mt-md"><summary>Customer messages &amp; contact history (${rows.length})</summary>${failed?'<p role="alert">Communication history could not be loaded. Reopen this visit to retry.</p>':messages.length?messages.slice(0,3).map(renderRow).join(''):'<p class="hint">No messages or replies recorded yet.</p>'}${messages.length>3?`<details><summary>Earlier messages (${messages.length-3})</summary>${messages.slice(3).map(renderRow).join('')}</details>`:''}${await ContactFeature.renderActivity(rows.filter(r=>Number(r.appointmentId)===Number(visit.id)))}${CustomerFeature.renderVisitPhoneHistory([visit],customer.id)}<div class="visit-comm-actions"><button class="btn btn-outline btn-sm" data-action="TalkFeature.openSavedDrafts" data-args='${args([visit.id])}'>Saved message drafts</button><button class="btn btn-outline btn-sm" data-action="FollowupsFeature.openContactOutcome" data-args='${args([visit.id])}'>Phone contact history</button></div><p class="hint">Opening WhatsApp or Messages is not proof of sending. Replies and agreements are recorded by you; nothing sends automatically.</p></details>
    </section>`;
  }
};
