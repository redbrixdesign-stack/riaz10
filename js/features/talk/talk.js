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
    ordered: { template: 'outcome_ordered', action: 'Confirm order placed', minDays: 0, priority: 'normal' },
    quoted: { template: 'follow_up.quote', action: 'Follow up on quote', minDays: 3, priority: 'normal' },
    thinking: { template: 'follow_up.gentle', action: 'Gentle follow-up', minDays: 5, priority: 'high' },
    partner: { template: 'follow_up.partner', action: 'Offer joint visit', minDays: 2, priority: 'normal' },
    compare_quotes: { template: 'follow_up.compare', action: 'Help compare quotes', minDays: 2, priority: 'normal' },
    expensive: { template: 'follow_up.discount', action: 'Consider controlled discount', minDays: 3, priority: 'normal' },
    spec_mismatch: { template: 'follow_up.spec', action: 'Adjust specification', minDays: 2, priority: 'normal' },
    customer_no_show: { template: 'follow_up.rebook', action: 'Rebook missed visit', minDays: 1, priority: 'normal' },
    advisor_unavailable: { template: 'follow_up.apology', action: 'Apologise and rebook', minDays: 0, priority: 'high' }
  },

  // Communication-spec stages (docs/Communication.md §2.1): every message the
  // app can send maps to a stage, so a manual template pick or an automated
  // task still lands on the staged context shape. Close-lost outcomes aren't
  // in OUTCOME_TEMPLATE_MAP (no daily nudge), but they DO map onto a stage so
  // an ad-hoc draft is still honest about the state.
  OUTCOME_STAGE_MAP: {
    ordered: 'outcome_ordered',
    quoted: 'outcome_needs_to_think',
    thinking: 'outcome_needs_to_think',
    partner: 'outcome_needs_to_think',
    compare_quotes: 'outcome_needs_to_think',
    expensive: 'outcome_needs_to_think',
    spec_mismatch: 'outcome_needs_to_think',
    not_looking_for: 'outcome_closed_lost',
    out_of_range: 'outcome_closed_lost',
    other_no_sale: 'outcome_closed_lost',
    customer_no_show: 'outcome_closed_lost',
    advisor_unavailable: 'outcome_closed_lost'
  },

  // Fitting/service-call outcomes that mean "something is wrong and the
  // customer deserves an acknowledgement" — the basis of the Follow-ups
  // 'service' task (and post-fit, anchored on fitted+completed).
  SERVICE_OUTCOMES: {
    fitting: ['spec_mismatch', 'missing_parts', 'access_issue', 'issues', 'revisit'],
    service_call: ['parts_needed', 'revisit_needed', 'access_issue']
  },

  stageForTemplateKey(key) {
    if (key === 'outcome_ordered') return 'outcome_ordered';
    if (key === 'pre_intro') return 'pre_intro';
    if (key === 'day_before' || key === 'evening_before') return 'day_before';
    if (key === 'morning_of') return 'morning_of';
    if (key === 'on_my_way') return 'on_the_way';
    if (key === 'running_late') return 'late';
    if (key === 'post_fit_followup') return 'post_fit_followup';
    if (key === 'service_or_issue_followup') return 'service_or_issue_followup';
    if (key.startsWith('confirmation.')) return 'new_booking';
    if (key.startsWith('follow_up.')) return 'outcome_needs_to_think';
    if (key.startsWith('post_sale.')) return 'outcome_ordered';
    return key;
  },

  // "Access: side gate, dog in kitchen" — the parked-notes convention the
  // appointment editor folds into visit notes (appointments.js). AI drafts
  // get these fields without needing a new form control.
  _parseNoteField(notes, prefix) {
    if (!notes) return '';
    try {
      const re = new RegExp(`^\\s*${prefix}\\s*[:\\-]\\s*(.+?)\\s*$`, 'im');
      const m = notes.match(re);
      return m ? m[1].trim() : '';
    } catch (e) { return ''; }
  },

  MIN_LEARNED_SAMPLE: 3,
  effectiveTemplateMap: null,

  // "09:00" for an exact slot, "09:00–11:00" when the visit carries an
  // arrival window — templates already say "at", so the compact form keeps
  // every sentence grammatical ("at 09:00–11:00" reads fine, "at between
  // 09:00 and 11:00" does not).
  apptTimeText(appt) {
    if (appt?.arrivalStart && appt?.arrivalEnd) return `${appt.arrivalStart}–${appt.arrivalEnd}`;
    return appt?.date ? Utils.formatTime(appt.date) : '';
  },

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
      nextVisit = upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && (a.phone || a.customerId)) || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome) || null;
    } catch (e) {}

    const now = new Date();
    const queue = [];

    // Day-before reminders: confirmed visits happening tomorrow that haven't
    // had a reminder sent yet. Kept separate from the outcome-driven nudge
    // queue below since these aren't about following up on an outcome.
    let dayBeforeQueue = [];
    try {
      // UK wall-clock "tomorrow", matching Follow-ups / the message scheduler
      // (Utils.ukParts) — a device in another timezone must see the same
      // reminders, or the queue disagrees with what the scheduler drafted.
      const dayKey = (d) => {
        const p = Utils.ukParts(d ? new Date(d) : undefined);
        return p.year * 10000 + p.month * 100 + p.day;
      };
      const tomorrowKey = dayKey(Utils.getTomorrow());
      const upcoming2 = await DB.getUpcomingAppointments(5);
      dayBeforeQueue = upcoming2.filter(a =>
        a.status === 'confirmed' &&
        !a.dayBeforeSent &&
        dayKey(a.date) === tomorrowKey &&
        (a.phone || a.customerId)
      );
    } catch (e) {}

    for (const appt of pipeline) {
      const daysSince = Utils.daysBetween(now, new Date(appt.date));
      let customer = null;
      try {
        customer = appt.customerId ? await DB.getCustomer(appt.customerId) : null;
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
      ${App.renderTopHeader({ title: 'Talk' })}
      <div class="px-md" >
        ${this.renderUrgentActions(nextId, nextName)}

        ${dayBeforeQueue.length > 0 ? `
        <div class="section-label" >Tomorrow's reminders (${dayBeforeQueue.length})</div>
        ${dayBeforeQueue.map(appt => `
        <div class="card mb-sm accent-left" >
          <div class="flex items-center gap-12" >
            <div class="flex-1 min-w-0" >
              <span class="fw-600 fs-15" >${Utils.escapeHtml(appt.clientName || 'Unknown')}</span>
              <div class="fs-13 text-secondary mt-2" >Visit tomorrow at ${this.apptTimeText(appt)}</div>
            </div>
            <button class="btn btn-sm btn-primary shrink-0"  onclick="TalkFeature.sendDayBefore(${appt.id})">
              <span class="material-symbols-rounded fs-18" >send</span>
            </button>
          </div>
        </div>`).join('')}` : ''}

        ${queue.length === 0 && dayBeforeQueue.length === 0 ? `
        <div class="empty-state empty-state-lg" >
          <span class="material-symbols-rounded">mark_email_read</span>
	          <div class="fw-600 mb-xs" >All quiet for now.</div>
	          <div class="fs-13" >Nothing pressing. A friendly check-in never hurts if you have a spare minute.</div>
	        </div>` : `
	        <div class="section-label" >Worth a nudge (${queue.length})</div>
        ${queue.map(item => `
        <div class="card" style="margin-bottom:8px;border-left:3px solid ${item.priority === 'high' ? 'var(--danger)' : 'var(--text-secondary)'};">
          <div class="flex items-center gap-12" >
            <div class="flex-1 min-w-0" >
              <div class="flex items-center gap-sm" >
                <span class="fw-600 fs-15 ellipsis" >${Utils.escapeHtml(item.appointment.clientName || 'Unknown')}</span>
                ${item.priority === 'high' ? `<span class="badge badge-danger fs-10 shrink-0" >High</span>` : ''}
                <span class="badge badge-warning fs-10 shrink-0" >${item.daysSince}d ago</span>
              </div>
              <div class="fs-13 text-secondary mt-2" >${item.action} · ${this.getReasonText(item.appointment.outcome, item.daysSince)}</div>
              ${item.learned ? `
                <div class="fs-11 text-success mt-2" >
                  <span class="material-symbols-rounded fs-12 vtext-bottom" >insights</span>
                  Learned from ${item.sampleSize} past deals - typically closed in ${item.medianDaysToConversion}d
                </div>
              ` : ''}
            </div>
            <button class="btn btn-sm btn-primary shrink-0"  onclick="TalkFeature.sendMessage(${item.appointment.id}, '${item.template}')">
              <span class="material-symbols-rounded fs-18" >send</span>
            </button>
          </div>
        </div>`).join('')}`}
      </div>

      <div class="p-md" >
        <div class="divider-text">Templates</div>
        <div class="grid-2 gap-sm" >
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
        <div class="card mt-12 mb-xs" >
          <div class="fs-13 text-secondary" >Add a visit to enable one-tap "On my way" and "Running late" messages.</div>
        </div>
      `;
    }
    return `
      <div class="grid-2 gap-sm mt-12 mb-xs" >
        <button class="btn btn-primary btn-sm" onclick="TalkFeature.sendMessage(${nextId}, 'on_my_way')">
          <span class="material-symbols-rounded fs-18" >directions_walk</span>
          On My Way
        </button>
        <button class="btn btn-outline btn-sm" onclick="TalkFeature.sendMessage(${nextId}, 'running_late')">
          <span class="material-symbols-rounded fs-18" >timer</span>
          Running Late
        </button>
      </div>
      <div class="fs-11 text-tertiary mt-xs mx-2 mb-0" >To ${Utils.escapeHtml(nextName)}</div>
    `;
  },

  getReasonText(outcome, daysSince) {
    if (outcome === 'quoted') return `quote left ${daysSince} days ago`;
    if (outcome === 'thinking') return `thinking time started ${daysSince} days ago`;
    if (outcome === 'partner') return `partner decision pending`;
    if (outcome === 'compare_quotes') return `customer comparing quotes`;
    if (outcome === 'expensive') return `price concern logged`;
    if (outcome === 'spec_mismatch') return 'spec mismatch — adjust offer';
    if (outcome === 'ordered') return 'order confirmed — confirm on its way';
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
      const pos = await Utils.withTimeout(Geo.getCurrentPosition(), 4000, { resolveOnTimeout: null });
      if (pos) {
        fromLatLng = [pos.lat, pos.lng];
        usedLiveGPS = true;
      }
    } catch (e) {}

    if (!fromLatLng) {
      try {
        const base = await Utils.withTimeout(RouteFeature.getBasePoint(), 2500, { resolveOnTimeout: null });
        if (Array.isArray(base?.latLng)) fromLatLng = base.latLng;
      } catch (e) {}
    }

    if (!fromLatLng) return null;

    let toLatLng = Array.isArray(appt.latLng) ? appt.latLng : null;
    if (!toLatLng && appt.address) {
      try {
        const geo = await Utils.withTimeout(Geo.geocode(appt.address), 2500, { resolveOnTimeout: null });
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

  async sendMessage(appointmentId, templateKey, extraVars = {}) {
    let appt = null;
    let customer = null;

    try {
      appt = await DB.db.appointments.get(appointmentId);
    } catch (e) {
      Toast.show('Visit not found', 'error');
      return;
    }

    try {
      customer = appt?.customerId ? await DB.getCustomer(appt.customerId) : null;
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
      time: this.apptTimeText(appt),
      address: appt?.address || '',
      advisorName: CONFIG.advisorName || 'Your Advisor',
      eta,
      delay,
      ...extraVars
    });
    this.pendingMessage = {
      customerId: customer?.id || 0,
      phone: whatsappPhone,
      appointmentId,
      templateKey,
      // Computed facts (live ETA, running-late delay, order/deposit values)
      // must survive into an AI draft too — an AI rewrite that drops "20
      // minutes" or the deposit amount is worse than the template it replaced.
      extraVars: { eta, delay, ...extraVars }
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
  //
  // The sheet gathers the same context an AI draft would use (quote value,
  // measured windows, order figures, conversation history) so the advisor
  // sees WHY this message was written, WHAT was last said to the customer,
  // and whether this is a duplicate nudge — compose with continuity, not in
  // a vacuum.
  async openPreviewSheet(message, pending, hint = null) {
    const { phone, templateKey } = pending;
    this._aiDraftPrev = null;

    let context = null;
    try { context = await this.buildAiContext(pending); } catch (e) { /* sheet works without facts */ }

    const facts = [
      context?.quoteValue ? `Quote ${context.quoteValue}` : null,
      context?.windowScope ? context.windowScope : null,
      (context?.daysSince !== null && context?.daysSince !== undefined && context.daysSince >= 0) ? `Visited ${context.daysSince}d ago` : null,
      context?.balanceDue && context.balanceDue !== '£0.00' ? `Balance ${context.balanceDue}` : null,
      context?.depositAmount && context.depositLabel === 'deposit' && context.depositAmount !== '£0.00' ? `Deposit ${context.depositAmount}` : null
    ].filter(Boolean).join(' · ');

    // Same-customer messages ARE logged (sentAt), so a "you already nudged
    // them" guard is honest — customer replies aren't tracked, so the hint
    // never claims to know whether they answered.
    const sentRecently = context?.lastSentDaysAgo !== null && context?.lastSentDaysAgo !== undefined
      && context.lastSentDaysAgo >= 0 && context.lastSentDaysAgo <= 1;

    // Same "what if" alternatives shown for outcome-driven nudges — switch
    // the angle without losing the customer/visit context.
    const ALTERNATIVES = {
      quoted: ['follow_up.gentle', 'follow_up.discount'],
      thinking: ['follow_up.quote', 'follow_up.partner'],
      partner: ['follow_up.gentle', 'follow_up.quote'],
      compare_quotes: ['follow_up.quote', 'follow_up.discount'],
      expensive: ['follow_up.quote', 'follow_up.partner'],
      customer_no_show: ['follow_up.apology'],
      advisor_unavailable: ['follow_up.rebook']
    };
    const altKeys = context?.outcome ? (ALTERNATIVES[context.outcome] || []) : [];
    // OUTCOME_TEMPLATE_MAP is keyed by outcome ("quoted"), but the chips
    // above carry template keys ("follow_up.discount") — reverse-lookup so
    // each chip gets its human action label.
    const templateToOutcome = Object.entries(this.OUTCOME_TEMPLATE_MAP)
      .reduce((m, [outcome, meta]) => { m[meta.template] = outcome; return m; }, {});

    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Preview Message</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="fs-12 text-secondary mt-6" id="talk-nudge" style="display:none"></div>
        <textarea class="textarea" id="talk-message-preview" style="min-height:110px;">${Utils.escapeHtml(message)}</textarea>

        <div class="flex items-center gap-sm mt-sm wrap" >
          <button class="btn btn-sm ${AIService.isEnabled() ? 'btn-outline' : 'btn-ghost'}" onclick="TalkFeature.aiDraft()">
            <span class="material-symbols-rounded fs-16" >auto_awesome</span>Rewrite with AI
          </button>
          <div id="talk-ai-actions" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-ghost" onclick="TalkFeature.regenerateDraft()">
              <span class="material-symbols-rounded fs-16" >refresh</span>Regenerate
            </button>
            <button class="btn btn-sm btn-ghost" onclick="TalkFeature.undoAiDraft()">
              <span class="material-symbols-rounded fs-16" >undo</span>Undo
            </button>
          </div>
        </div>

        ${hint ? `
          <div class="fs-12 text-tertiary mt-6" >${Utils.escapeHtml(hint)}</div>
        ` : ''}

        ${facts ? `
          <div class="fs-12 text-secondary mt-10" >${Utils.escapeHtml(facts)}</div>
        ` : ''}

        ${sentRecently ? `
          <div class="fs-12 text-warning mt-6" >You already messaged this customer ${context.lastSentDaysAgo === 0 ? 'today' : 'yesterday'} — check this isn't a duplicate nudge.</div>
        ` : ''}

        ${context?.lastMessages?.length ? `
          <div class="card bg-surface-elevated pad-8-10 mt-10" >
            <div class="fs-11 fw-700 text-uppercase ls-em04 text-tertiary mb-xs" >Previously sent</div>
            ${context.lastMessages.map(m => `
              <div class="fs-12 text-secondary mb-xs" >${Utils.escapeHtml(m.when)} — ${Utils.escapeHtml(Utils.truncate(m.text, 90))}</div>
            `).join('')}
          </div>
        ` : ''}

        ${altKeys.length ? `
          <div class="flex gap-6 mt-10 wrap" >
            ${altKeys.map(key => {
              const label = this.OUTCOME_TEMPLATE_MAP[templateToOutcome[key]]?.action || key;
              return `<button class="btn btn-outline btn-sm" onclick="TalkFeature.switchTemplate('${Utils.escapeJsString(key)}')">${Utils.escapeHtml(label)}</button>`;
            }).join('')}
          </div>
        ` : ''}

        <div class="fs-13 text-secondary mt-12 mb-md" >Sending to: ${Utils.escapeHtml(Utils.formatPhone(phone))}</div>
        <button class="btn btn-primary btn-block" onclick="TalkFeature.confirmSend()">
          <span class="material-symbols-rounded">chat</span>Open WhatsApp
        </button>
      </div>`;
    App.openModal(content);
  },

  // Different angle, same customer: close the current sheet and re-draft with
  // the alternative template. The follow-up outcomes only get alternatives
  // that make sense for their situation (defined in openPreviewSheet).
  async switchTemplate(key) {
    const pending = this.pendingMessage;
    App.closeModal();
    if (pending?.appointmentId) this.sendMessage(pending.appointmentId, key);
  },

  // Replaces the preview textarea contents with a Claude-drafted message
  // written from the spec message_context (docs/Communication.md). The
  // template remains the starting point; the draft is a suggestion the user
  // reviews and edits. The nudge Claude returns lands in the #talk-nudge
  // slot above the textarea.
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
      const context = await this.buildMessageContext(pending);
      const result = await AIService.draftMessage(context);
      if (!result.ok) {
        Toast.show(result.reason === 'timeout' ? 'AI draft timed out — try again' : result.message || 'AI draft unavailable', 'error');
        return;
      }
      if (!result.text) {
        Toast.show('AI returned an empty draft — try again', 'error');
        return;
      }
      // Keep the first pre-AI text so "Undo" restores what the user had,
      // not whatever the previous regenerate produced.
      if (this._aiDraftPrev === null) {
        this._aiDraftPrev = textarea.value;
      }
      textarea.value = result.text;
      const actions = document.getElementById('talk-ai-actions');
      if (actions) actions.style.display = 'flex';
      const nudgeEl = document.getElementById('talk-nudge');
      if (nudgeEl) {
        if (result.nudge) {
          nudgeEl.textContent = result.nudge;
          nudgeEl.style.display = 'block';
        } else {
          nudgeEl.style.display = 'none';
        }
      }
      Toast.show('Draft ready — review before sending', 'success');
    } catch (err) {
      console.warn('AI draft failed:', err);
      Toast.show('AI draft failed — try again', 'error');
    }
  },

  async regenerateDraft() {
    await this.aiDraft();
  },

  // Restores the text that was in the box before the first AI rewrite.
  undoAiDraft() {
    const textarea = document.getElementById('talk-message-preview');
    if (textarea && this._aiDraftPrev !== null) textarea.value = this._aiDraftPrev;
    this._aiDraftPrev = null;
    const actions = document.getElementById('talk-ai-actions');
    if (actions) actions.style.display = 'none';
    const nudgeEl = document.getElementById('talk-nudge');
    if (nudgeEl) nudgeEl.style.display = 'none';
  },

  async buildAiContext(pending) {
    const { customerId, appointmentId, templateKey } = pending;
    const customer = customerId ? await DB.getCustomer(customerId) : null;
    const appt = appointmentId ? await DB.db.appointments.get(appointmentId) : null;

    // Order history supports "your order is on its way" style draft contexts,
    // and the deposit/balance figures make a payment reminder (or a
    // post-fitting nudge) specific instead of generic.
    let orders = [];
    try {
      if (customerId) orders = await DB.db.orders.where('customerId').equals(customerId).toArray();
    } catch (e) { /* storage read failed — draft without it */ }

    // What was actually measured at this visit ("Lounge", "Bay window") —
    // the real scope being quoted or fitted, so a follow-up can say
    // "the blinds for your lounge" instead of "your window coverings".
    let measurements = [];
    try {
      if (appt?.id) measurements = await DB.db.measurements.where('appointmentId').equals(appt.id).toArray();
    } catch (e) { /* draft without measurements */ }

    // Last few messages, for continuity ("following up on our last chat…").
    // Each carries its sentAt date so a draft can honestly say "messaged you
    // a few days back" — the customer reply itself isn't tracked, so the
    // summary stays factual about what WE sent, never claims to know what
    // happened on the customer's side.
    let allMessages = [];
    let recentMessages = [];
    try {
      if (customerId) {
        allMessages = await DB.db.communications.where('customerId').equals(customerId).toArray();
        allMessages.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
        recentMessages = allMessages.slice(0, 4)
          .map(c => ({ content: String(c.content || '').trim(), sentAt: c.sentAt || null }))
          .filter(c => c.content);
      }
    } catch (e) { /* ignore */ }

    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const latestOrder = orders[0] || null;
    const orderTotal = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    // The resolved template text (same lookup sendMessage uses) so the draft
    // can keep its goal while sounding human.
    let templateText = '';
    try {
      const keys = templateKey.split('.');
      let t = CONFIG.templates;
      for (const k of keys) t = t?.[k];
      templateText = typeof t === 'string' ? t : '';
    } catch (e) { /* ignore */ }

    const advisorName = CONFIG.advisorName || 'Your Advisor';
    const advisorIntro = CONFIG.companyName ? `${advisorName} from ${CONFIG.companyName}` : advisorName;
    const visitTypeLabel = appt?.type
      ? (CONFIG.appointmentTypes.find(t => t.id === appt.type)?.name || appt.type)
      : 'visit';
    const daysSince = appt?.date ? Utils.daysBetween(new Date(), new Date(appt.date)) : null;
    const quoteValue = appt?.value && appt.value > 0 ? Utils.formatCurrency(appt.value) : '';
    const windowScope = measurements.map(m => m.windowName).filter(Boolean).slice(0, 6).join(', ');
    const outcomeAction = appt?.outcome ? (this.getTemplateForOutcome(appt.outcome)?.action || '') : '';
    const lastSentDaysAgo = recentMessages[0]?.sentAt
      ? Utils.daysBetween(new Date(), new Date(recentMessages[0].sentAt))
      : null;

    // Facts the caller computed for the static template (live ETA, running
    // late delay, payment_reminder order/deposit) must reach the AI too, or
    // an AI draft silently drops them — sending "I'm on my way" with no ETA.
    const extra = pending.extraVars || {};
    const depositPaid = latestOrder?.depositPaid || 0;

    return {
      customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') : (appt?.clientName || 'there'),
      firstName: Utils.firstNameFrom(customer?.firstName || appt?.clientName),
      appointmentDate: appt?.date ? Utils.formatDate(appt.date) : '',
      appointmentDay: appt?.date ? Utils.formatDate(appt.date, 'long') : '',
      appointmentTime: this.apptTimeText(appt),
      visitType: visitTypeLabel,
      // Data minimisation: street addresses, postcodes and lead source are
      // never sent to the AI — a customer-facing draft has no use for them,
      // and they are exactly the fields the customer should not need to
      // hear repeated. The customer's OWN order reference (supplierOrderNumber)
      // is kept because the payment_reminder template puts it in the message.
      templateKey,
      templateText,
      advisorName,
      advisorIntro,
      quoteValue,
      visitNotes: appt?.notes || '',
      windowScope,
      daysSince,
      outcome: appt?.outcome || '',
      outcomeAction,
      eta: String(extra.eta || '').trim(),
      delay: String(extra.delay || '').trim(),
      supplierOrderNumber: String(latestOrder?.supplierOrderNumber || '').trim(),
      depositAmount: Utils.formatCurrency(depositPaid > 0 ? (latestOrder?.balanceDue || 0) : (latestOrder?.depositRequired || 0)),
      depositLabel: depositPaid > 0 ? 'balance' : 'deposit',
      balanceDue: Utils.formatCurrency(latestOrder?.balanceDue || 0),
      orderHistory: orders.length
        ? `Order history: ${orders.length} order(s)${latestOrder?.supplierOrderNumber ? `, supplier ref ${latestOrder.supplierOrderNumber}` : ''}, latest total ${Utils.formatCurrency(latestOrder?.total || orderTotal)}${depositPaid > 0 ? `, ${Utils.formatCurrency(depositPaid)} paid` : ''}${latestOrder?.balanceDue > 0 ? `, ${Utils.formatCurrency(latestOrder.balanceDue)} due` : ''}.`
        : 'Order history: none.',
      recentMessages: recentMessages.length
        ? `Recent messages sent to this customer: ${recentMessages.map(m => `[${m.sentAt ? Utils.formatDate(m.sentAt, 'short') : 'sometime'}] "${m.content}"`).join(' | ')}`
        : 'No previous messages.',
      lastMessages: recentMessages.slice(0, 3).map(m => ({
        text: m.content,
        when: m.sentAt ? Utils.formatDate(m.sentAt, 'short') : ''
      })),
      lastSentDaysAgo,
      totalMessagesSent: allMessages.length
    };
  },

  // Spec-shaped snake_case context sent to Claude (docs/Communication.md §3):
  // this is the JSON the proxy prompt calls message_context. Same real-data
  // sources as buildAiContext (which stays for the preview UI's fact chips),
  // plus the staged fields the AI needs: first-visit flag, visit count,
  // parking/access notes, window history, outcome, order summary, and notes
  // from the customer's last visit.
  async buildMessageContext(pending) {
    const { customerId, appointmentId, templateKey } = pending;
    const customer = customerId ? await DB.getCustomer(customerId) : null;
    const appt = appointmentId ? await DB.db.appointments.get(appointmentId) : null;

    // First-visit at this address = no prior non-cancelled appointment
    // (cancel/reshuffle ≠ having actually visited). Date-compare with
    // toDateString so multiple appointments on the same day aren't counted
    // twice.
    let pastVisits = [];
    let measuresByAppt = {};
    try {
      if (customerId) {
        const all = await DB.db.appointments.where('customerId').equals(customerId).toArray();
        all.sort((a, b) => new Date(a.date) - new Date(b.date));
        pastVisits = all.filter(a => a.date && new Date(a.date) < new Date() && a.status !== 'cancelled' && a.id !== appointmentId);
        const seen = new Set();
        pastVisits = pastVisits.filter(a => {
          const key = new Date(a.date).toDateString();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const ids = pastVisits.map(a => a.id).filter(Boolean);
        if (ids.length) {
          const measures = await DB.db.measurements.where('appointmentId').anyOf(ids).toArray();
          for (const m of measures) {
            (measuresByAppt[m.appointmentId] = measuresByAppt[m.appointmentId] || []).push(m);
          }
        }
      }
    } catch (e) { /* context works without history */ }

    const windowHistory = Object.values(measuresByAppt).flat();
    const windowHistorySummary = windowHistory.map(m => m.windowName).filter(Boolean).slice(0, 12).join(', ');
    const blindCount = windowHistory.filter(m => m.windowName).length;
    const lastVisitNotes = pastVisits[pastVisits.length - 1]?.notes || '';

    let orders = [];
    let allMessages = [];
    let recentMessages = [];
    try {
      if (customerId) {
        orders = await DB.db.orders.where('customerId').equals(customerId).toArray();
        allMessages = await DB.db.communications.where('customerId').equals(customerId).toArray();
      }
    } catch (e) { /* draft without order/message history */ }
    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    allMessages.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
    recentMessages = allMessages.slice(0, 4)
      .map(c => ({ content: String(c.content || '').trim(), sentAt: c.sentAt || null }))
      .filter(c => c.content);
    const latestOrder = orders[0] || null;
    const depositPaid = latestOrder?.depositPaid || 0;

    let templateText = '';
    try {
      const keys = templateKey.split('.');
      let t = CONFIG.templates;
      for (const k of keys) t = t?.[k];
      templateText = typeof t === 'string' ? t : '';
    } catch (e) { /* ignore */ }

    const advisorName = CONFIG.advisorName || 'Your Advisor';
    const visitTypeLabel = appt?.type
      ? (CONFIG.appointmentTypes.find(t => t.id === appt.type)?.name || appt.type)
      : 'visit';
    const daysSince = appt?.date ? Utils.daysBetween(new Date(), new Date(appt.date)) : null;
    const outcomeLabel = appt?.outcome
      ? ((CONFIG.outcomes[appt.type] || []).find(o => o.id === appt.outcome)?.name || appt.outcome)
      : '';
    const windowScope = (measuresByAppt[appt?.id] || []).map(m => m.windowName).filter(Boolean).slice(0, 6).join(', ');
    const extra = pending.extraVars || {};

    // Note-field conventions: the appointment editor folds "Access: …"
    // lines into visit notes; parking notes follow the same convention.
    const notes = appt?.notes || '';
    const parkingNotes = this._parseNoteField(notes, 'parking');
    const accessNotes = this._parseNoteField(notes, 'access');

    const orderSummary = latestOrder
      ? `Order ${latestOrder.orderNumber || ''}${latestOrder.supplierOrderNumber ? ` (supplier ref ${latestOrder.supplierOrderNumber})` : ''}, total ${Utils.formatCurrency(latestOrder.total || 0)}${depositPaid > 0 ? `, deposit paid ${Utils.formatCurrency(depositPaid)}` : latestOrder.depositRequired > 0 ? `, deposit due ${Utils.formatCurrency(latestOrder.depositRequired)}` : ''}${latestOrder.balanceDue > 0 ? `, ${Utils.formatCurrency(latestOrder.balanceDue)} remaining` : ''}`
      : 'no order yet';

    return {
      advisor_name: advisorName,
      advisor_role: 'window coverings advisor',
      customer_name: customer ? customer.firstName || customer.lastName : (appt?.clientName || 'there'),
      customer_is_first_visit_at_address: pastVisits.length === 0,
      customer_visit_count: pastVisits.length,
      address: appt?.address || customer?.address?.line1 || '',
      appointment_type: visitTypeLabel,
      appointment_date: appt?.date ? Utils.formatDate(appt.date) : '',
      appointment_date_long: appt?.date ? Utils.formatDate(appt.date, 'long') : '',
      time_start: appt?.arrivalStart || (appt?.date ? Utils.formatTime(appt.date) : ''),
      time_end: appt?.arrivalEnd || '',
      parking_notes: parkingNotes,
      access_notes: accessNotes,
      blind_count: blindCount,
      window_history_summary: windowHistorySummary,
      window_scope: windowScope,
      stage: this.stageForTemplateKey(templateKey),
      eta: String(extra.eta || '').trim(),
      delay_reason: String(extra.delay || '').trim(),
      outcome: appt?.outcome || '',
      outcome_label: outcomeLabel,
      quote_amount: appt?.value && appt.value > 0 ? Utils.formatCurrency(appt.value) : '',
      order_summary: orderSummary,
      order_history: orders.length
        ? `Order history: ${orders.length} order(s)${latestOrder?.supplierOrderNumber ? `, supplier ref ${latestOrder.supplierOrderNumber}` : ''}, latest total ${Utils.formatCurrency(latestOrder?.total || 0)}${depositPaid > 0 ? `, ${Utils.formatCurrency(depositPaid)} paid` : ''}${latestOrder?.balanceDue > 0 ? `, ${Utils.formatCurrency(latestOrder.balanceDue)} due` : ''}.`
        : 'Order history: none.',
      notes_from_last_visit: lastVisitNotes,
      visit_notes: notes,
      template_key: templateKey,
      template_text: templateText,
      days_since_last_visit: daysSince,
      lead_source: customer?.source || '',
      recent_messages: recentMessages.map(m => `[${m.sentAt ? Utils.formatDate(m.sentAt, 'short') : 'sometime'}] "${m.content}"`),
      total_messages_sent: allMessages.length,
      last_sent_days_ago: recentMessages[0]?.sentAt
        ? Utils.daysBetween(new Date(), new Date(recentMessages[0].sentAt))
        : null
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
    // Same-template send flags: each automated follow-up kind marks the
    // appointment so it drops out of the Follow-ups queue. (day_before
    // predates the others — kept for the Talk tomorrow-reminders.)
    const SENT_FLAGS = { day_before: 'dayBeforeSent', pre_intro: 'introSent', post_fit_followup: 'postFitSent', service_or_issue_followup: 'serviceSent' };
    const flag = SENT_FLAGS[templateKey];
    if (flag && appointmentId) {
      try { await DB.db.appointments.update(appointmentId, { [flag]: true }); } catch (e) {}
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
        <div class="flex flex-col gap-sm" >
          ${visits.map(visit => `
            <button class="list-item bordered-8 text-left"  onclick="App.closeModal(); TalkFeature.sendMessage(${visit.id}, '${Utils.escapeJsString(key)}')">
              <span class="material-symbols-rounded text-brand mr-12" >person</span>
              <span class="flex-1 min-w-0" >
                <span class="block fw-600 ellipsis" >${Utils.escapeHtml(visit.clientName || 'Unknown')}</span>
                <span class="block fs-12 text-tertiary" >${Utils.formatDate(visit.date, 'datetime')}</span>
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
