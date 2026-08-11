/* ============================================
   ADVISOROS v5.0 — TALK FEATURE
   Communication queue, templates, WhatsApp
   ============================================ */

const TalkFeature = {
  id: 'talk',
  name: 'Talk',
  icon: 'chat',
  // No longer a bottom-nav tab (see the Home screen redesign) - the
  // follow-up queue this screen builds is now surfaced as a badge on Home
  // instead of needing its own persistent icon. Still fully navigable with
  // App.navigate('talk') from anywhere; this only controls the nav icon.
  route: false,
  pendingMessage: null,

  render(params = {}) {
    return this.renderAsync(params);
  },

  // Single source of truth for "which template fits which outcome" - used by
  // both the follow-up queue below (with day-since gating) and the Follow Up
  // detail screen in appointments.js (no gating - if you're already looking
  // at a specific follow-up's detail, you want the recommended template
  // regardless of exactly how many days have passed).
  OUTCOME_TEMPLATE_MAP: {
    quoted: { template: 'follow_up.quote', action: 'Follow up on quote', minDays: 3, priority: 'normal' },
    thinking: { template: 'follow_up.gentle', action: 'Gentle follow-up', minDays: 5, priority: 'high' },
    partner: { template: 'follow_up.partner', action: 'Offer joint visit', minDays: 2, priority: 'normal' },
    compare_quotes: { template: 'follow_up.compare', action: 'Help compare quotes', minDays: 2, priority: 'normal' },
    expensive: { template: 'follow_up.discount', action: 'Consider controlled discount', minDays: 3, priority: 'normal' },
    customer_no_show: { template: 'follow_up.rebook', action: 'Rebook missed visit', minDays: 1, priority: 'normal' },
    advisor_unavailable: { template: 'follow_up.apology', action: 'Apologise and rebook', minDays: 0, priority: 'high' }
  },

  MIN_LEARNED_SAMPLE: 3,
  effectiveTemplateMap: null,

  // Real signal available from existing data: every appointment is linked to
  // a customerId, so for any customer who had a "needs follow-up" outcome
  // (quoted, thinking, partner, etc.), we can check whether that SAME
  // customer later shows up with an 'ordered' outcome, and how many days
  // that took. This is honest about what it actually measures - it's "how
  // long this kind of deal has taken to close", not "which specific message
  // caused the conversion" (we don't track that, and won't pretend to).
  async computeLearnedTiming() {
    let appts = [];
    try { appts = await DB.db.appointments.toArray(); } catch (e) { return {}; }

    const byCustomer = {};
    for (const a of appts) {
      if (!a.customerId) continue;
      (byCustomer[a.customerId] = byCustomer[a.customerId] || []).push(a);
    }
    for (const list of Object.values(byCustomer)) {
      list.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    const samples = {}; // outcome -> [daysToConversion, ...]
    for (const list of Object.values(byCustomer)) {
      for (let i = 0; i < list.length; i++) {
        const outcome = list[i].outcome;
        if (!this.OUTCOME_TEMPLATE_MAP[outcome]) continue;
        const converted = list.slice(i + 1).find(a => a.outcome === 'ordered');
        if (converted) {
          const days = Utils.daysBetween(new Date(converted.date), new Date(list[i].date));
          if (days >= 0) {
            samples[outcome] = samples[outcome] || [];
            samples[outcome].push(days);
          }
        }
      }
    }

    const learned = {};
    for (const [outcome, days] of Object.entries(samples)) {
      if (days.length < this.MIN_LEARNED_SAMPLE) continue;
      const sorted = [...days].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      // Nudge the advisor meaningfully before the typical conversion point,
      // not at it or after it - following up only once deals have historically
      // already closed would be useless. Clamped to a sane 1-10 day range so
      // one slow outlier customer can't push this somewhere absurd.
      const learnedMinDays = Math.max(1, Math.min(10, Math.round(median / 2)));
      learned[outcome] = { medianDaysToConversion: median, sampleSize: days.length, learnedMinDays };
    }
    return learned;
  },

  async refreshLearnedTiming() {
    const learned = await this.computeLearnedTiming();
    const merged = {};
    for (const [outcome, defaults] of Object.entries(this.OUTCOME_TEMPLATE_MAP)) {
      const l = learned[outcome];
      merged[outcome] = l
        ? { ...defaults, minDays: l.learnedMinDays, learned: true, sampleSize: l.sampleSize, medianDaysToConversion: l.medianDaysToConversion }
        : { ...defaults, learned: false };
    }
    this.effectiveTemplateMap = merged;
    return merged;
  },

  getTemplateForOutcome(outcome) {
    const map = this.effectiveTemplateMap || this.OUTCOME_TEMPLATE_MAP;
    return map[outcome] || null;
  },

  async getDueFollowUpCount() {
    let pipeline = [];
    try { pipeline = await DB.getPipeline(); } catch (e) { return 0; }
    const now = new Date();
    let count = 0;
    for (const appt of pipeline) {
      const daysSince = Utils.daysBetween(now, new Date(appt.date));
      const match = this.getTemplateForOutcome(appt.outcome);
      if (match && daysSince >= match.minDays) count++;
    }
    return count;
  },

  async renderAsync(params = {}) {
    let pipeline = [];
    try {
      pipeline = await DB.getPipeline();
    } catch (e) {
      console.error('Pipeline load failed:', e);
    }

    try { await this.refreshLearnedTiming(); } catch (e) { console.log('Learned timing refresh skipped:', e); }

    // The next upcoming visit, used to default the urgent "On My Way" / "Running
    // Late" quick actions so they're one tap instead of a 5-tap customer picker.
    let nextVisit = null;
    try {
      const upcoming = await DB.getUpcomingAppointments(3);
      nextVisit = upcoming.find(a => a.status !== 'cancelled' && (a.phone || a.customerId)) || upcoming.find(a => a.status !== 'cancelled') || null;
    } catch (e) {}

    const now = new Date();
    const queue = [];

    // Day-before reminders: confirmed visits happening tomorrow that haven't
    // had a reminder sent yet. Kept separate from the outcome-driven nudge
    // queue below since these aren't about following up on an outcome.
    let dayBeforeQueue = [];
    try {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const upcoming2 = await DB.getUpcomingAppointments(5);
      dayBeforeQueue = upcoming2.filter(a =>
        a.status === 'confirmed' &&
        !a.dayBeforeSent &&
        new Date(a.date).toDateString() === tomorrow.toDateString() &&
        (a.phone || a.customerId)
      );
    } catch (e) {}

    for (const appt of pipeline) {
      const daysSince = Utils.daysBetween(now, new Date(appt.date));
      let customer = null;
      try {
        customer = appt.customerId ? await DB.db.customers.get(appt.customerId) : null;
      } catch (e) {}

      const match = this.getTemplateForOutcome(appt.outcome);
      const action = match && daysSince >= match.minDays ? match.action : null;
      const template = action ? match.template : null;
      let priority = action ? match.priority : 'normal';
      if (action && appt.outcome === 'quoted') priority = daysSince >= 7 ? 'high' : 'normal';

      if (action) queue.push({ appointment: appt, customer, action, template, priority, daysSince, learned: match.learned, sampleSize: match.sampleSize, medianDaysToConversion: match.medianDaysToConversion });
    }

    queue.sort((a, b) => ({ high: 0, normal: 1, low: 2 })[a.priority] - ({ high: 0, normal: 1, low: 2 })[b.priority]);

    const nextId = nextVisit ? nextVisit.id : null;
    const nextName = nextVisit ? (nextVisit.clientName || 'next visit') : null;

    return `<div class="fade-in">
      <div class="top-header"><h1>Talk</h1></div>

      <div style="padding:0 16px;">
        ${this.renderUrgentActions(nextId, nextName)}

        ${dayBeforeQueue.length > 0 ? `
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">Tomorrow's reminders (${dayBeforeQueue.length})</div>
        ${dayBeforeQueue.map(appt => `
        <div class="card" style="margin-bottom:8px;border-left:3px solid var(--primary);">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;min-width:0;">
              <span style="font-weight:600;font-size:15px;">${Utils.escapeHtml(appt.clientName || 'Unknown')}</span>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">Visit tomorrow at ${Utils.formatTime(appt.date)}</div>
            </div>
            <button class="btn btn-sm btn-primary" style="flex-shrink:0;" onclick="TalkFeature.sendDayBefore(${appt.id})">
              <span class="material-symbols-rounded" style="font-size:18px;">send</span>
            </button>
          </div>
        </div>`).join('')}` : ''}

        ${queue.length === 0 && dayBeforeQueue.length === 0 ? `
        <div class="empty-state" style="padding:48px 24px;">
          <span class="material-symbols-rounded">mark_email_read</span>
	          <div style="font-weight:600;margin-bottom:4px;">All quiet for now.</div>
	          <div style="font-size:13px;">Nothing pressing. A friendly check-in never hurts if you have a spare minute.</div>
	        </div>` : `
	        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">Worth a nudge (${queue.length})</div>
        ${queue.map(item => `
        <div class="card" style="margin-bottom:8px;border-left:3px solid ${item.priority === 'high' ? 'var(--danger)' : 'var(--warning)'};">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(item.appointment.clientName || 'Unknown')}</span>
                ${item.priority === 'high' ? `<span class="badge badge-danger" style="font-size:10px;flex-shrink:0;">High</span>` : ''}
                <span class="badge badge-warning" style="font-size:10px;flex-shrink:0;">${item.daysSince}d ago</span>
              </div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${item.action} · ${this.getReasonText(item.appointment.outcome, item.daysSince)}</div>
              ${item.learned ? `
                <div style="font-size:11px;color:var(--secondary);margin-top:2px;">
                  <span class="material-symbols-rounded" style="font-size:12px;vertical-align:text-bottom;">insights</span>
                  Learned from ${item.sampleSize} past deals - typically closed in ${item.medianDaysToConversion}d
                </div>
              ` : ''}
            </div>
            <button class="btn btn-sm btn-primary" style="flex-shrink:0;" onclick="TalkFeature.sendMessage(${item.appointment.id}, '${item.template}')">
              <span class="material-symbols-rounded" style="font-size:18px;">send</span>
            </button>
          </div>
        </div>`).join('')}`}
      </div>

      <div style="padding:16px;">
        <div class="divider-text">Templates</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="TalkFeature.pickTemplateCustomer('follow_up.quote')"><span class="material-symbols-rounded">replay</span>Quote Follow-up</button>
          <button class="btn btn-outline btn-sm" onclick="TalkFeature.pickTemplateCustomer('post_sale.review')"><span class="material-symbols-rounded">star</span>Review Request</button>
        </div>
      </div>
    </div>`;
  },

  // Persistent one-tap urgent actions at the top of Talk. These default to the
  // next upcoming visit (no customer picker) because "I'm on my way" / "running
  // late" are the most time-sensitive messages, often sent while walking/driving.
  renderUrgentActions(nextId, nextName) {
    if (!nextId) {
      return `
        <div class="card" style="margin-top:12px;margin-bottom:4px;">
          <div style="font-size:13px;color:var(--text-secondary);">Add a visit to enable one-tap "On my way" and "Running late" messages.</div>
        </div>
      `;
    }
    return `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px;margin-bottom:4px;">
        <button class="btn btn-primary btn-sm" onclick="TalkFeature.sendMessage(${nextId}, 'on_my_way')">
          <span class="material-symbols-rounded" style="font-size:18px;">directions_walk</span>
          On My Way
        </button>
        <button class="btn btn-outline btn-sm" onclick="TalkFeature.sendMessage(${nextId}, 'running_late')">
          <span class="material-symbols-rounded" style="font-size:18px;">timer</span>
          Running Late
        </button>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin:4px 2px 0;">To ${Utils.escapeHtml(nextName)}</div>
    `;
  },

  getReasonText(outcome, daysSince) {
    if (outcome === 'quoted') return `quote left ${daysSince} days ago`;
    if (outcome === 'thinking') return `thinking time started ${daysSince} days ago`;
    if (outcome === 'partner') return `partner decision pending`;
    if (outcome === 'compare_quotes') return `customer comparing quotes`;
    if (outcome === 'expensive') return `price concern logged`;
    if (outcome === 'customer_no_show') return `missed visit needs rebooking`;
    if (outcome === 'advisor_unavailable') return `relationship repair needed`;
    return `${daysSince} days since visit`;
  },

  // "On my way" / "Running late" used to send a hardcoded "20 minutes" / "15
  // minutes" regardless of where the advisor actually was - which is dishonest
  // the moment the real drive is 5 minutes or 45. This computes a real ETA
  // from an actual distance: live GPS position if the advisor grants it
  // (most accurate - this is "I'm leaving now"), falling back to the
  // configured business base if GPS is denied/unavailable, using the same
  // distance/speed model as the Route feature so the number here matches
  // what the advisor sees on their route plan.
  async getLiveEta(appt) {
    let fromLatLng = null;
    let usedLiveGPS = false;

    try {
      const pos = await this.withTimeout(Geo.getCurrentPosition(), 4000);
      if (pos) {
        fromLatLng = [pos.lat, pos.lng];
        usedLiveGPS = true;
      }
    } catch (e) {}

    if (!fromLatLng) {
      try {
        const base = await this.withTimeout(RouteFeature.getBasePoint(), 2500);
        if (Array.isArray(base?.latLng)) fromLatLng = base.latLng;
      } catch (e) {}
    }

    if (!fromLatLng) return null;

    let toLatLng = Array.isArray(appt.latLng) ? appt.latLng : null;
    if (!toLatLng && appt.address) {
      try {
        const geo = await this.withTimeout(Geo.geocode(appt.address), 2500);
        if (geo) {
          toLatLng = [geo.lat, geo.lng];
          try { await DB.db.appointments.update(appt.id, { latLng: toLatLng }); } catch (e) {}
        }
      } catch (e) {}
    }
    if (!toLatLng) return null;

    const distanceKm = RouteFeature.calculateLegKm(fromLatLng, toLatLng);
    if (!distanceKm || distanceKm <= 0) return null;
    const etaMin = Math.max(1, Math.round((distanceKm / 35) * 60));
    return { etaMin, distanceKm, usedLiveGPS };
  },

  withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), ms))
    ]);
  },

  async sendMessage(appointmentId, templateKey) {
    let appt = null;
    let customer = null;

    try {
      appt = await DB.db.appointments.get(appointmentId);
    } catch (e) {
      Toast.show('Visit not found', 'error');
      return;
    }

    try {
      customer = appt?.customerId ? await DB.db.customers.get(appt.customerId) : null;
    } catch (e) {}

    if (!customer?.phone && !appt?.phone) {
      Toast.show('No phone number available', 'error');
      return;
    }

    const phone = customer?.phone || appt?.phone;
    const whatsappPhone = Utils.toWhatsAppPhone(phone);
    if (!whatsappPhone) {
      Toast.show('That phone number needs a valid WhatsApp format', 'error');
      return;
    }

    // Resolve template
    const keys = templateKey.split('.');
    let template = CONFIG.templates;
    for (const k of keys) {
      template = template?.[k];
    }

    if (!template) {
      Toast.show('Template not found', 'error');
      return;
    }

    let eta = '15-20 minutes';
    let delay = '10-15';
    let etaIsEstimateOnly = true;

    if (templateKey === 'on_my_way' || templateKey === 'running_late') {
      Toast.show('Working out your ETA…', 'info');
      const live = await this.getLiveEta(appt);
      if (live) {
        etaIsEstimateOnly = false;
        eta = `${live.etaMin} minute${live.etaMin === 1 ? '' : 's'}`;
        if (templateKey === 'running_late') {
          const minutesUntil = appt?.date ? (new Date(appt.date) - new Date()) / 60000 : 0;
          const overrun = Math.round(live.etaMin - minutesUntil);
          delay = overrun > 0 ? String(overrun) : '5-10';
        }
      }
    }

    const message = NotificationService.processTemplate(template, {
      firstName: Utils.firstNameFrom(customer?.firstName || appt?.clientName),
      productType: 'window coverings',
      time: appt ? Utils.formatTime(appt.date) : '',
      address: appt?.address || '',
      advisorName: CONFIG.advisorName || 'Your Advisor',
      eta,
      delay
    });
    this.pendingMessage = {
      customerId: customer?.id || 0,
      phone: whatsappPhone,
      appointmentId,
      templateKey
    };

    const etaHint = (templateKey === 'on_my_way' || templateKey === 'running_late')
      ? (etaIsEstimateOnly ? "Couldn't work out a live ETA (location unavailable) - this is a placeholder, edit before sending." : "Time estimated from your current distance to this visit - double-check before sending.")
      : null;
    this.openPreviewSheet(message, this.pendingMessage, etaHint);
  },

  // Shared preview sheet for the Talk flow AND the automated message
  // scheduler (js/services/message-scheduler.js): both draft a message,
  // set this.pendingMessage, and hand the text over here. hint is optional
  // footer text (ETA caveats, auto-draft notes).
  openPreviewSheet(message, pending, hint = null) {
    const { phone, templateKey } = pending;
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Preview Message</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <textarea class="textarea" id="talk-message-preview" style="min-height:110px;">${Utils.escapeHtml(message)}</textarea>
        <button class="btn btn-sm ${AIService.isEnabled() ? 'btn-outline' : 'btn-ghost'}" style="margin-top:8px;" onclick="TalkFeature.aiDraft()">
          <span class="material-symbols-rounded" style="font-size:16px;">auto_awesome</span>AI draft
        </button>
        ${hint ? `
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px;">${Utils.escapeHtml(hint)}</div>
        ` : ''}
        <div style="font-size:13px;color:var(--text-secondary);margin:12px 0 16px;">Sending to: ${Utils.escapeHtml(Utils.formatPhone(phone))}</div>
        <button class="btn btn-primary btn-block" onclick="TalkFeature.confirmSend()">
          <span class="material-symbols-rounded">chat</span>Open WhatsApp
        </button>
      </div>`;
    App.openModal(content);
  },

  // Replaces the preview textarea contents with a Claude-drafted message
  // written from the customer/visit context. The template remains the
  // starting point; the draft is a suggestion the user reviews and edits.
  async aiDraft() {
    if (!AIService.isEnabled()) {
      Toast.show('AI drafting is off — enable it in Settings first', 'warning');
      return;
    }
    const pending = this.pendingMessage;
    if (!pending) {
      Toast.show('No message ready', 'error');
      return;
    }
    const textarea = document.getElementById('talk-message-preview');
    if (!textarea) return;

    Toast.show('Drafting with AI…', 'info');
    try {
      const context = await this.buildAiContext(pending);
      const result = await AIService.draftMessage(context);
      if (!result.ok) {
        Toast.show(result.reason === 'timeout' ? 'AI draft timed out — try again' : result.message || 'AI draft unavailable', 'error');
        return;
      }
      if (!result.text) {
        Toast.show('AI returned an empty draft — try again', 'error');
        return;
      }
      textarea.value = result.text;
      Toast.show('Draft ready — review before sending', 'success');
    } catch (err) {
      console.warn('AI draft failed:', err);
      Toast.show('AI draft failed — try again', 'error');
    }
  },

  async buildAiContext(pending) {
    const { customerId, appointmentId, templateKey } = pending;
    const customer = customerId ? await DB.db.customers.get(customerId) : null;
    const appt = appointmentId ? await DB.db.appointments.get(appointmentId) : null;

    // Order history supports "your order is on its way" style draft contexts.
    let orders = [];
    try {
      if (customerId) orders = await DB.db.orders.where('customerId').equals(customerId).toArray();
    } catch (e) { /* storage read failed — draft without it */ }

    // Last two messages, for continuity ("following up on our last chat…").
    let recentMessages = [];
    try {
      if (customerId) {
        const all = await DB.db.communications.where('customerId').equals(customerId).toArray();
        all.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
        recentMessages = all.slice(0, 2).map(c => c.content || '').filter(Boolean);
      }
    } catch (e) { /* ignore */ }

    // The resolved template text (same lookup sendMessage uses) so the draft
    // can keep its goal while sounding human.
    let templateText = '';
    try {
      const keys = templateKey.split('.');
      let t = CONFIG.templates;
      for (const k of keys) t = t?.[k];
      templateText = typeof t === 'string' ? t : '';
    } catch (e) { /* ignore */ }

    const orderTotal = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const advisorName = CONFIG.advisorName || 'Your Advisor';
    const advisorIntro = CONFIG.companyName ? `${advisorName} from ${CONFIG.companyName}` : advisorName;
    const visitTypeLabel = appt?.type
      ? (CONFIG.appointmentTypes.find(t => t.id === appt.type)?.name || appt.type)
      : 'visit';
    return {
      customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') : (appt?.clientName || 'there'),
      firstName: Utils.firstNameFrom(customer?.firstName || appt?.clientName),
      appointmentDate: appt?.date ? Utils.formatDate(appt.date) : '',
      appointmentDay: appt?.date ? Utils.formatDate(appt.date, 'long') : '',
      appointmentTime: appt?.date ? Utils.formatTime(appt.date) : '',
      visitType: visitTypeLabel,
      visitAddress: appt?.address || customer?.address || '',
      templateKey,
      templateText,
      advisorName,
      advisorIntro,
      orderHistory: orders.length
        ? `Order history: ${orders.length} order(s), latest total £${orderTotal.toFixed(2)}.`
        : 'Order history: none.',
      recentMessages: recentMessages.length ? `Recent messages sent to this customer: ${recentMessages.join(' | ')}` : 'No previous messages.'
    };
  },

  async confirmSend() {
    const pending = this.pendingMessage;
    if (!pending) {
      Toast.show('No message ready', 'error');
      return;
    }
    const message = document.getElementById('talk-message-preview')?.value.trim();
    if (!message) {
      Toast.show('Message cannot be empty', 'error');
      return;
    }
    const { customerId, phone, appointmentId, templateKey } = pending;
    const opened = NotificationService.sendWhatsApp(phone, message);
    if (!opened) return;
    // Record the attempt honestly. We can't confirm WhatsApp actually loaded
    // (window.open only tells us the call was made), so log it as an attempt,
    // not a confirmed send — the user verifies in WhatsApp itself.
    if (customerId > 0) {
      DB.addCommunication({ customerId, type: 'whatsapp_attempted', template: null, content: message });
    }
    if (templateKey === 'day_before' && appointmentId) {
      try { await DB.db.appointments.update(appointmentId, { dayBeforeSent: true }); } catch (e) {}
    }
    App.closeModal();
    Toast.show('Opened WhatsApp — check it sent', 'info');
  },

  sendDayBefore(appointmentId) {
    return this.sendMessage(appointmentId, 'day_before');
  },

  async pickTemplateCustomer(key) {
    let visits = [];
    try {
      const upcoming = await DB.getUpcomingAppointments(14);
      const pipeline = await DB.getPipeline();
      visits = [...upcoming, ...pipeline]
        .filter((visit, index, all) => all.findIndex(v => v.id === visit.id) === index)
        .slice(0, 12);
    } catch (e) {
      console.error('Customer picker failed:', e);
    }

    if (visits.length === 0) {
      Toast.show('Add a visit first, then choose a message', 'info');
      App.navigate('appointments', {action: 'add'});
      return;
    }

    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Choose Customer</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${visits.map(visit => `
            <button class="list-item" style="border:1px solid var(--border-light);border-radius:8px;text-align:left;" onclick="App.closeModal(); TalkFeature.sendMessage(${visit.id}, '${Utils.escapeJsString(key)}')">
              <span class="material-symbols-rounded" style="color:var(--primary);margin-right:12px;">person</span>
              <span style="flex:1;min-width:0;">
                <span style="display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(visit.clientName || 'Unknown')}</span>
                <span style="display:block;font-size:12px;color:var(--text-tertiary);">${Utils.formatDate(visit.date, 'datetime')}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>`;
    App.openModal(content);
  },

  activate(params = {}) {
    if (params.appointmentId) {
      const template = params.action === 'discount' ? 'follow_up.discount' : 'follow_up.quote';
      setTimeout(() => this.sendMessage(Number(params.appointmentId), template), 100);
    }
  },
  async refresh() {
    const main = document.getElementById('main');
    if (main && App.currentFeature?.id === 'talk') {
      main.innerHTML = await this.renderAsync();
    }
  }
};

App.registerFeature(TalkFeature);
