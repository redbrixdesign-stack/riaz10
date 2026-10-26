/* ============================================
   ADVISOROS v5.0 — TALK FEATURE
   Communication queue, templates, WhatsApp
   ============================================ */

const TalkFeature = {
  id: 'talk',
  name: 'Messages',
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
    quoted: 'outcome_quoted',
    thinking: 'outcome_needs_to_think',
    partner: 'outcome_talk_to_partner',
    compare_quotes: 'outcome_comparing_quotes',
    expensive: 'outcome_too_expensive',
    spec_mismatch: 'outcome_spec_mismatch',
    not_looking_for: 'outcome_not_what_they_wanted',
    out_of_range: 'outcome_not_in_range',
    other_no_sale: 'outcome_other_no_sale',
    windows_too_high: 'outcome_windows_too_high',
    customer_no_show: 'outcome_customer_no_show',
    advisor_unavailable: 'outcome_advisor_could_not_attend'
  },

  // Fitting/service-call outcomes that mean "something is wrong and the
  // customer deserves an acknowledgement" — the basis of the Follow-ups
  // 'service' task (and post-fit, anchored on fitted+completed).
  SERVICE_OUTCOMES: {
    fitting: ['spec_mismatch', 'missing_parts', 'access_issue', 'issues', 'revisit'],
    service_call: ['parts_needed', 'revisit_needed', 'access_issue']
  },

  stageForTemplateKey(key, outcome = '') {
    if (key === 'outcome_ordered') return 'outcome_ordered';
    if (key === 'pre_intro' || key === 'intro_day_before') return 'pre_intro';
    if (key === 'day_before' || key === 'evening_before') return 'day_before';
    if (key === 'morning_of') return 'morning_of';
    if (key === 'on_my_way') return 'on_the_way';
    if (key === 'running_late') return 'late';
    if (key === 'post_fit_followup') return 'post_fit_followup';
    if (key === 'service_or_issue_followup') return 'service_or_issue_followup';
    if (key.startsWith('confirmation.')) return 'new_booking';
    if (key.startsWith('follow_up.')) return this.OUTCOME_STAGE_MAP[outcome] || 'outcome_needs_to_think';
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

  customerGivenName(customer, appt) {
    const candidates = [customer?.fullName, appt?.clientName, [customer?.firstName, customer?.lastName].filter(Boolean).join(' '), customer?.firstName, customer?.lastName];
    for (const candidate of candidates) {
      const first = Utils.firstNameFrom(candidate || '');
      if (first && first !== 'there') return first;
    }
    return 'there';
  },

  isIntroductionTemplate(key = '') {
    return ['pre_intro', 'intro_day_before'].includes(key) || key.startsWith('confirmation.');
  },

  socialLinkLines() {
    return ['facebook', 'instagram'].flatMap(network => {
      const value = String(CONFIG.socialLinks?.[network] || '').trim();
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || /[\r\n]/.test(value)) return [];
        return [`${network === 'facebook' ? 'Facebook' : 'Instagram'}: ${value}`];
      } catch (_) { return []; }
    }).join('\n');
  },

  async introductionAlreadyRecorded(appt, visits = null, messages = null) {
    const introduced = visit => !!visit && (!!visit.introSent || (typeof TaskService !== 'undefined' && !!TaskService.contactEvidence(visit).introduced));
    if (introduced(appt)) return true;
    if (!appt?.customerId) return false;
    try {
      visits = visits || await DB.getAppointmentsByCustomer(appt.customerId);
      if (visits.some(v => String(v.customerId) === String(appt.customerId) && introduced(v))) return true;
      if (visits.some(v => v.status !== 'cancelled' && v.outcome && !['cancelled', 'customer_no_show', 'advisor_unavailable'].includes(v.outcome) && new Date(v.date) < new Date())) return true;
    } catch (_) { /* no inferred contact when history cannot be read */ }
    try {
      if (!messages) {
        messages = await DB.db.communications.where('customerId').equals(appt.customerId).toArray();
        if (typeof CommunicationService !== 'undefined') messages = await CommunicationService.decorate(messages);
      }
      return messages.some(m => String(m.customerId) === String(appt.customerId) && m.direction !== 'inbound' && this.isIntroductionTemplate(m.confirmedTemplate || m.template || '') && (typeof CommunicationService === 'undefined' ? !!m.sentAt : CommunicationService.isConfirmed(m)));
    } catch (_) { return false; }
  },

  journeyMessage(context) {
    const name = context.customer_name || 'there';
    if (context.stage === 'late') return `Hi ${name}, I'm sorry, I'm running late.${context.eta ? ` I expect to be with you in about ${context.eta}.` : context.delay_reason ? ` I'm delayed by about ${context.delay_reason} minutes.` : " I'll update you when I have a reliable arrival estimate."} Thanks for your patience.`;
    return `Hi ${name}, I'm on my way${context.eta ? ` and should be with you in about ${context.eta}` : ''}. See you soon!`;
  },

  applyCommunicationPolicy(text, context) {
    if (['on_the_way', 'late'].includes(context.stage)) return this.journeyMessage(context);
    const fallback = context.safe_template_text || text;
    const selfIntro = /\b(?:my name is|let me introduce|introducing myself|your (?:independent )?(?:advi[sz]or|fitter|window coverings expert))\b/i.test(text) || /\bI(?:'|’)?m\s+/i.test(text) && [context.advisor_name, context.advisor_role].some(value => value && text.toLowerCase().includes(value.toLowerCase()));
    if (!context.introduction_required && selfIntro) text = fallback;
    if (context.introduction_required && (!text.includes(context.advisor_name) || context.advisor_role && !text.includes(context.advisor_role) || !/clear[^.!?]*window|window[^.!?]*clear/i.test(text) || (!context.parking_notes && !/parking/i.test(text)))) text = fallback;
    if (context.include_social_links) {
      const links = this.socialLinkLines();
      if (!links && /https?:\/\/|(?:Facebook|Instagram):/i.test(text)) text = fallback;
      if (links) {
        const urls = links.split('\n').map(link => link.slice(link.indexOf(': ') + 2));
        const unexpectedURL = (text.match(/https?:\/\/\S+/gi) || []).some(url => !urls.includes(url));
        const inlineURL = text.split('\n').some(line => urls.some(url => line.includes(url)) && !links.split('\n').includes(line.trim()));
        if ((unexpectedURL || inlineURL) && context.safe_template_text) text = context.safe_template_text;
        // Canonical footer once; do not repeat model-added links or invent one.
        text = text.split('\n').filter(line => !/^\s*(Facebook|Instagram):/i.test(line) && !links.split('\n').some(link => line.includes(link.slice(link.indexOf(': ') + 2)))).join('\n').trim();
        text += `\n\n${links}`;
      }
    } else text = text.split('\n').filter(line => !/^\s*(Facebook|Instagram):/i.test(line) && !/https?:\/\/(?:[^/]+\.)?(?:facebook|instagram)\.com\//i.test(line)).join('\n').trim();
    return text;
  },

  // The actual job for a customer, from their order → quote line items
  // (the delivery note): "5 blinds — 2 roman, 3 vertical — about 33 minutes
  // each (around 2h45 in total)". Falls back to the number of windows
  // measured. Returns '' when nothing is known (callers must not invent a
  // job). Used by the fitting/service messages and the AI's job_summary so
  // the advisor sounds like they know the customer's job before contacting.
  async buildJobSummary(customerId) {
    if (!customerId) return '';
    try {
      const orders = (await DB.db.orders.where('customerId').equals(customerId).toArray())
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const order = orders.find(o => o.quoteId) || orders[0];
      if (order && order.quoteId) {
        let quote = null;
        try { quote = await DB.getQuote(order.quoteId); } catch (e) { /* ignore */ }
        if (quote && quote.items && quote.items.length) {
          const total = quote.items.reduce((s, i) => s + (i.quantity || 0), 0);
          const labels = quote.items.map(i => {
            const qty = i.quantity || 0;
            const label = String(i.description || '').toLowerCase().replace(/\s*blind(s)?\b/g, '').trim();
            return `${qty} ${label || 'blind'}`;
          });
          const perMin = CONFIG.jobEstimates?.minutesPerBlind || 33;
          const totalMin = Math.round(total * perMin);
          const hrs = Math.floor(totalMin / 60);
          const mins = totalMin % 60;
          const duration = hrs > 0 ? (mins ? `${hrs}h${String(mins).padStart(2, '0')}` : `${hrs}h`) : `${mins} min`;
          const plural = total === 1 ? 'blind' : 'blinds';
          return `You've got ${total} ${plural} to install — ${labels.join(', ')} — about ${perMin} minutes each${total > 1 ? ` (around ${duration} in total)` : ''}.`;
        }
      }
      // Fallback: windows measured for this customer.
      try {
        const appts = await DB.getAppointmentsByCustomer(customerId);
        const ids = appts.map(a => a.id).filter(Boolean);
        const measurements = ids.length ? await DB.db.measurements.where('appointmentId').anyOf(ids).toArray() : [];
        if (measurements.length) {
          return `You've got ${measurements.length} window${measurements.length === 1 ? '' : 's'} to cover.`;
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* no job data */ }
    return '';
  },

  // First-visit intro message, built from the customer 360 profile. For
  // consultation / measure the advisor introduces themselves with their
  // title ("an Independent Hillarys Window Coverings Expert") and asks only
  // what the profile doesn't already hold. For fitting / service / review /
  // follow-up the advisor ALREADY KNOWS the customer: no introduction, no
  // parking/basic questions — the message confirms the actual job (blinds,
  // types, timing from the order/delivery note) so the customer feels known.
  async buildIntroMessage(appt, customer) {
    try {
      const name = Utils.customerFirstName(customer, appt?.clientName);
      const advisor = CONFIG.advisorName || 'Your Advisor';
      const dayPart = `${Utils.formatDateUK(appt.date, 'weekday-short')} ${Utils.formatDateUK(appt.date, 'short')}`;
      const timePart = this.apptTimeText(appt);
      const addressPart = appt?.address ? ` at ${appt.address}` : '';
      const when = timePart ? ` on ${dayPart} at ${timePart}` : ` on ${dayPart}`;
      const introduced = await this.introductionAlreadyRecorded(appt);
      const footer = !introduced && this.socialLinkLines() ? `\n\n${this.socialLinkLines()}` : '';
      if (introduced) {
        const purpose = { consultation: 'for your consultation', measure: 'for your survey and final measurements', fitting: 'for your fitting', service_call: 'to look at the issue you reported', review: 'for your review visit', follow_up: 'to follow up on your visit' }[appt?.type] || 'for your visit';
        const job = ['fitting', 'service_call'].includes(appt?.type) ? await this.buildJobSummary(appt.customerId) : '';
        const prep = ['consultation', 'measure', 'fitting', 'service_call'].includes(appt?.type) ? ' Please keep the area around the windows clear for safe access.' : '';
        return `Hi ${name}, just to confirm — I'll be with you${when}${addressPart} ${purpose}.${job ? ` ${job}` : ''}${prep} If anything has changed with parking or access, or you have a question, just reply here.`;
      }

      // Known-customer stages: the advisor knows this customer and their
      // property — confirm the job, never re-introduce or re-ask basics.
      if (['fitting', 'service_call', 'review', 'follow_up'].includes(appt?.type)) {
        const job = (await this.buildJobSummary(appt.customerId) || '').replace(/\.+$/, '');
        const jobLine = job ? ` ${job}.` : '';
        if (appt.type === 'fitting') {
          return `Hi ${name}, just to confirm — I'll be with you${when}${addressPart} to fit your new blinds.${jobLine} Please clear the area around the windows so I can work safely. If anything's changed with parking or access, just reply here.${footer}`;
        }
        if (appt.type === 'service_call') {
          return `Hi ${name}, just to confirm — I'll be with you${when}${addressPart} to look at the issue you reported.${jobLine} Please keep the window area accessible and let me know about any parking or access changes.${footer}`;
        }
        if (appt.type === 'review') {
          return `Hi ${name}, just to confirm — I'll be with you${when}${addressPart} to see how everything's looking.${jobLine} If anything's come up since the fitting, just reply here and I'll take a look.${footer}`;
        }
        return `Hi ${name}, just to confirm — I'll be with you${when}${addressPart} to follow up.${jobLine} If anything's changed since we last spoke, just reply here.${footer}`;
      }

      // New-customer stages: introduction with the title + profile-aware asks.
      const title = CONFIG.advisorTitle || 'independent window coverings expert';
      const TYPE = {
        consultation: {
          verb: 'for a consultation',
          ask: 'Please clear the area around the windows so I can access them safely.'
        },
        measure: {
          verb: 'to measure up',
          ask: 'Before the survey, please clear the area around each window we\'re measuring so I can take accurate sizes.'
        }
      };
      const t = TYPE[appt?.type] || TYPE.consultation;
      // Customer 360 awareness — the notes convention ("Parking: …" /
      // "Access: …" lines): acknowledge what's known, ask only for gaps.
      // Strip trailing periods so a note ending in "." never produces "..".
      const parking = (this._parseNoteField(appt?.notes || '', 'parking') || '').replace(/\.+$/, '');
      const access = (this._parseNoteField(appt?.notes || '', 'access') || '').replace(/\.+$/, '');
      const rooms = (this._parseNoteField(appt?.notes || '', 'rooms') || '').replace(/\.+$/, '');
      const windows = (this._parseNoteField(appt?.notes || '', 'windows') || this._parseNoteField(appt?.notes || '', 'blinds') || '').replace(/\.+$/, '');
      const inspiration = (this._parseNoteField(appt?.notes || '', 'inspiration') || this._parseNoteField(appt?.notes || '', 'style') || '').replace(/\.+$/, '');
      let profile = '';
      if (parking && access) profile = ` I've noted parking: ${parking}; access: ${access}. Please let me know if those arrangements change.`;
      else if (parking) profile = ` I've noted parking: ${parking}. Please let me know about any access arrangements, such as gates, stairs or pets.`;
      else if (access) profile = ` I've noted access: ${access}. Please let me know about parking restrictions, permits or where it is best to park.`;
      else profile = ' Please let me know about parking restrictions, permits and any access arrangements, such as gates, stairs or pets.';

      let ask = t.ask;
      if (appt?.type !== 'measure') {
        const gaps = [];
        if (!windows) gaps.push('roughly how many windows or blinds you are considering');
        if (!rooms) gaps.push('which rooms they are in');
        if (!inspiration) gaps.push('any styles, colours or inspiration photos you like');
        const gapList = gaps.length > 2
          ? `${gaps.slice(0, -1).join(', ')}, and ${gaps[gaps.length - 1]}`
          : gaps.join(' and ');
        ask += ' ' + (gaps.length
          ? `To help me bring the right ideas and make our time useful, could you send me ${gapList}?`
          : `I've noted the windows, rooms and look you have in mind, so I can come prepared.`);
      }
      const opening = introduced ? `Hi ${name}, just to confirm — I'll be with you` : `Hi ${name}, I'm ${advisor}, an ${title}, and I'll be with you`;
      return `${opening}${when}${addressPart} ${t.verb}.\n\n${ask}${profile}\n\nIf anything changes or you have a question before the visit, just reply here.${footer}`;
    } catch (e) {
      return null; // caller falls back to the static template
    }
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
      const upcoming = await DB.getFutureAppointmentsUntil(new Date(Date.now() + 3 * 86400000));
      nextVisit = upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && (a.phone || a.customerId)) || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome) || null;
    } catch (e) {}

    const now = new Date();
    const queue = [];

    // Use the same current purposes and explicit snoozes as Follow-ups.
    // Do not recreate a separate tomorrow-only queue with different rules.
    let dayBeforeQueue = [];
    try {
      if (typeof FollowupsFeature !== 'undefined') {
        dayBeforeQueue = (await FollowupsFeature.loadTasks()).filter(t => t.due && t.appointment && ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind));
      }
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
      ${App.renderTopHeader({ title: 'Messages' })}
      <div class="px-md" >
        ${this.renderUrgentActions(nextId, nextName)}

        ${dayBeforeQueue.length > 0 ? `
        <div class="section-label" >Before visits (${dayBeforeQueue.length})</div>
        ${dayBeforeQueue.map(task => `
        <div class="card mb-sm accent-left" >
          <div class="flex items-center gap-12" >
            <div class="flex-1 min-w-0" >
              <span class="fw-600 fs-15" >${Utils.escapeHtml(task.appointment.clientName || 'Unknown')}</span>
              <div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(task.action)} · ${Utils.formatDate(task.appointment.date, 'short')} ${this.apptTimeText(task.appointment)}</div>
            </div>
            <button class="btn btn-sm btn-primary shrink-0" aria-label="Review pre-visit message for ${Utils.escapeHtml(task.appointment.clientName || 'customer')}" data-action="TalkFeature.sendDayBefore" data-args='${JSON.stringify([task.appointment.id])}'>
              <span aria-hidden="true" class="material-symbols-rounded fs-18">edit_note</span>Review
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
            <button class="btn btn-sm btn-primary shrink-0"  data-action="TalkFeature.sendMessage" data-args='${JSON.stringify([(item.appointment.id), item.template])}'>
              <span class="material-symbols-rounded fs-18" >send</span>
            </button>
          </div>
        </div>`).join('')}`}
      </div>

      <div class="p-md" >
        <div class="divider-text">Templates</div>
        <div class="grid-2 gap-sm" >
          <button class="btn btn-outline btn-sm" data-action="TalkFeature.pickTemplateCustomer" data-args='${JSON.stringify(["follow_up.quote"])}'><span class="material-symbols-rounded">replay</span>Quote Follow-up</button>
          <button class="btn btn-outline btn-sm" data-action="TalkFeature.pickTemplateCustomer" data-args='${JSON.stringify(["post_sale.review"])}'><span class="material-symbols-rounded">star</span>Review Request</button>
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
        <button class="btn btn-primary btn-sm" data-action="TalkFeature.sendMessage" data-args='${JSON.stringify([(nextId), "on_my_way"])}'>
          <span class="material-symbols-rounded fs-18" >directions_walk</span>
          On My Way
        </button>
        <button class="btn btn-outline btn-sm" data-action="TalkFeature.sendMessage" data-args='${JSON.stringify([(nextId), "running_late"])}'>
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
      appt = await DB.getAppointment(appointmentId);
    } catch (e) {
      Toast.show('Visit not found', 'error');
      return;
    }

    try {
      customer = appt?.customerId ? await DB.getCustomer(appt.customerId) : null;
    } catch (e) {}

    if (customer?.id && typeof CommunicationService !== 'undefined') {
      const preference = await CommunicationService.preference(customer.id, 'whatsapp');
      if (!CommunicationService.canContact(preference)) {
        Toast.show('WhatsApp is blocked by this customer’s contact preference', 'warning');
        return;
      }
    }

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
    const keys = (templateKey === 'intro_day_before' ? 'pre_intro' : templateKey).split('.');
    let template = CONFIG.templates;
    for (const k of keys) {
      template = template?.[k];
    }

    // Per-type templates (evening_before / morning_of / pre_intro /
    // confirmation.*): an object that carries a 'consultation' key is a
    // per-appointment-type map — select the copy for THIS visit's type,
    // consultation as the fallback. Outcome-keyed maps (follow_up.quote,
    // post_sale.review) never have a 'consultation' key and are left alone.
    if (template && typeof template === 'object' && 'consultation' in template) {
      template = template[appt?.type] || template.consultation;
    }

    if (!template) {
      Toast.show('Template not found', 'error');
      return;
    }

    let eta = '';
    let delay = '';
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

    // The first-visit intro is built dynamically from the customer 360
    // profile (title + type-aware prep + known parking/access acknowledged)
    // — falls back to the static pre_intro template if that ever fails.
    let message = null;
    if (this.isIntroductionTemplate(templateKey)) {
      message = await this.buildIntroMessage(appt, customer);
    }
    if (['on_my_way', 'running_late'].includes(templateKey)) message = this.journeyMessage({ stage: this.stageForTemplateKey(templateKey), customer_name: Utils.customerFirstName(customer, appt?.clientName), eta: extraVars.eta || eta, delay_reason: extraVars.delay || delay });
    if (!message) {
      // {{jobSummary}} names the actual job (blinds, types, timing) for
      // fitting/service reminders — leading space so the sentence reads the
      // same when the profile has no order data yet.
      let jobSummary = '';
      if (['fitting', 'service_call'].includes(appt?.type) && appt?.customerId) {
        try { jobSummary = (await this.buildJobSummary(appt.customerId) || '').replace(/\.+$/, ''); } catch (e) {}
        jobSummary = jobSummary ? ' ' + jobSummary : '';
      }
      message = NotificationService.processTemplate(template, {
        firstName: Utils.customerFirstName(customer, appt?.clientName),
        productType: 'window coverings',
        time: this.apptTimeText(appt),
        address: appt?.address || '',
        advisorName: CONFIG.advisorName || 'Your Advisor',
        advisorTitle: CONFIG.advisorTitle || '',
        jobSummary,
        eta,
        delay,
        ...extraVars
      });
    }
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
      ? (etaIsEstimateOnly ? "Couldn't work out a live ETA — no arrival estimate has been invented. Edit before sending." : "Time estimated from your current distance to this visit - double-check before sending.")
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
    let currentBooking = null;
    try { currentBooking = pending.appointmentId ? await this.draftBookingSnapshot(pending.appointmentId) : null; }
    catch (_) { return Toast.show('Could not check the booking. Please try again.', 'error'); }
    this._draftBookingSnapshot = currentBooking;
    this._previewBookingSnapshot = currentBooking;
    let needsBookingReview = false;
    if (pending.appointmentId && typeof DB.getPrivateSetting === 'function') {
      const raw = await DB.getPrivateSetting(this.draftStorageKey(pending), null);
      let saved = null;
      try { saved = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
      if (saved && typeof saved.text === 'string') {
        message = saved.text;
        this._draftBookingSnapshot = saved.bookingSnapshot || null;
        needsBookingReview = this._draftBookingSnapshot !== currentBooking;
        hint = 'Saved unsent draft restored. Check the appointment details before sending.';
        if (['on_my_way', 'running_late'].includes(templateKey)) hint = 'Saved wording preserved. It may repeat an old introduction or ETA. Edit it, or choose Use short journey update to rebuild from the visit details; nothing is sent automatically.';
      }
    }
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
      <div class="sheet-header"><h3>Preview Message</h3><button class="btn btn-ghost btn-sm" aria-label="Close message preview" data-action="TalkFeature.dismissPreview"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div id="draft-booking-review" class="card mb-md" ${needsBookingReview ? '' : 'hidden'}>
          <p role="alert">This draft may contain old booking details. Your wording has been preserved. Check and edit it against the current booking before sharing.</p>
          <p id="draft-booking-current">${Utils.escapeHtml(this.bookingSnapshotLabel(currentBooking))}</p>
          <label><input type="checkbox" id="draft-booking-checked"> I have checked the date, time, visit details and recipient in this draft</label>
        </div>
        <div class="fs-12 text-secondary mt-6" id="talk-nudge" style="display:none"></div>
        <textarea class="textarea" id="talk-message-preview" aria-label="Message preview (editable)" data-action="TalkFeature.savePreviewDraft" data-event="input" style="min-height:110px;">${Utils.escapeHtml(message)}</textarea>

        <div class="flex items-center gap-sm mt-sm wrap" >
          ${['on_my_way', 'running_late'].includes(templateKey) ? '<button class="btn btn-sm btn-outline" data-action="TalkFeature.refreshJourneyDraft">Use short journey update</button><span class="fs-12 text-secondary">No repeated introduction, preparation requests or social links. Edit freely above.</span>' : `<button class="btn btn-sm ${AIService.isEnabled() ? 'btn-outline' : 'btn-ghost'}" data-action="TalkFeature.aiDraft">
            <span class="material-symbols-rounded fs-16" aria-hidden="true">auto_awesome</span>Rewrite with AI
          </button>`}
          <div id="talk-ai-actions" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-ghost" data-action="TalkFeature.regenerateDraft">
              <span class="material-symbols-rounded fs-16" >refresh</span>Regenerate
            </button>
            <button class="btn btn-sm btn-ghost" data-action="TalkFeature.undoAiDraft">
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
              return `<button class="btn btn-outline btn-sm" data-action="TalkFeature.switchTemplate" data-args='${Utils.escapeHtml(JSON.stringify([key]))}'>${Utils.escapeHtml(label)}</button>`;
            }).join('')}
          </div>
        ` : ''}

        <div class="fs-13 text-secondary mt-12 mb-md" >Sending to: ${Utils.escapeHtml(Utils.formatPhone(phone))}</div>
        <button class="btn btn-primary btn-block" data-action="TalkFeature.confirmSend">
          <span class="material-symbols-rounded">chat</span>Open WhatsApp
        </button>
      </div>`;
    this._reviewBookingCandidate = currentBooking;
    App.openModal(content);
  },

  // Different angle, same customer: close the current sheet and re-draft with
  // the alternative template. The follow-up outcomes only get alternatives
  // that make sense for their situation (defined in openPreviewSheet).
  async switchTemplate(key) {
    if (await this.savePreviewDraft() === false) return;
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
    if (['on_my_way', 'running_late'].includes(this.pendingMessage?.templateKey)) return this.refreshJourneyDraft();
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
    const original = textarea.value;
    const request = this._aiDraftRequest = (this._aiDraftRequest || 0) + 1;

    Toast.show('Drafting with AI…', 'info');
    try {
      const context = await this.buildMessageContext(pending);
      const result = await AIService.draftMessage(context);
      if (request !== this._aiDraftRequest || this.pendingMessage !== pending || !textarea.isConnected) return;
      if (textarea.value !== original) {
        Toast.show('Your wording changed while drafting — it has been kept. Rewrite again only if wanted.', 'info');
        return;
      }
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

  async refreshJourneyDraft() {
    const pending = this.pendingMessage, field = document.getElementById('talk-message-preview');
    if (!pending || !field || !['on_my_way', 'running_late'].includes(pending.templateKey)) return;
    const original = field.value;
    try {
      const context = await this.buildMessageContext(pending);
      if (this.pendingMessage !== pending || !field.isConnected || field.value !== original) return;
      field.value = this.journeyMessage(context);
      await this.savePreviewDraft();
      Toast.show('Short journey update ready — check the ETA and edit before sending', 'success');
    } catch (_) { Toast.show('Could not refresh the message. Your wording is unchanged.', 'error'); }
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
    const appt = appointmentId ? await DB.getAppointment(appointmentId) : null;

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
      if (appt?.id) measurements = await DB.getMeasurementsForAppointments([appt.id]);
    } catch (e) { /* draft without measurements */ }

    // Last confirmed outbound messages, for continuity and duplicate checks.
    // Unconfirmed hand-offs are deliberately excluded; manually recorded
    // inbound replies join the richer AI conversation context below.
    let allMessages = [];
    let recentMessages = [];
    try {
      if (customerId) {
        allMessages = await DB.db.communications.where('customerId').equals(customerId).toArray();
        if (typeof CommunicationService !== 'undefined') allMessages = await CommunicationService.decorate(allMessages);
        allMessages = allMessages.filter(c => typeof CommunicationService === 'undefined' ? !!c.sentAt : CommunicationService.isConfirmed(c));
        allMessages.sort((a, b) => new Date(b.sentAt || b.receivedAt || b.createdAt || 0) - new Date(a.sentAt || a.receivedAt || a.createdAt || 0));
        recentMessages = allMessages.filter(c => c.direction !== 'inbound').slice(0, 4)
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
      // Per-type templates (evening_before/morning_of/pre_intro/confirmation.*):
      // select the copy for THIS appointment's type, consultation as fallback —
      // same selection sendMessage and the message scheduler use.
      if (t && typeof t === 'object' && 'consultation' in t) {
        t = t[appt?.type] || t.consultation;
      }
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
      firstName: Utils.customerFirstName(customer, appt?.clientName),
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
      totalMessagesSent: allMessages.filter(c => c.direction !== 'inbound').length
    };
  },

  // Interpolate a resolved template for the AI's template_text — guarded so
  // sandboxed tests without NotificationService still get the raw string.
  _interpolateTemplateText(templateText, customer, appt, advisorName, visitTypeLabel) {
    if (!templateText) return '';
    try {
      return NotificationService.processTemplate(templateText, {
        firstName: Utils.customerFirstName(customer, appt?.clientName),
        time: this.apptTimeText(appt),
        address: appt?.address || '',
        advisorName,
        advisorTitle: CONFIG.advisorTitle || '',
        visitType: visitTypeLabel || 'visit'
      });
    } catch (e) {
      return templateText;
    }
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
    const appt = appointmentId ? await DB.getAppointment(appointmentId) : null;

    // First-visit at this address = no prior non-cancelled appointment
    // (cancel/reshuffle ≠ having actually visited). Date-compare with
    // toDateString so multiple appointments on the same day aren't counted
    // twice.
    let pastVisits = [];
    let customerVisits = [];
    let measuresByAppt = {};
    try {
      if (customerId) {
        const all = await DB.getAppointmentsByCustomer(customerId);
        customerVisits = all;
        all.sort((a, b) => new Date(a.date) - new Date(b.date));
        pastVisits = all.filter(a => a.date && new Date(a.date) < new Date() && a.status !== 'cancelled' && a.outcome && !['cancelled', 'customer_no_show', 'advisor_unavailable'].includes(a.outcome) && a.id !== appointmentId);
        const seen = new Set();
        pastVisits = pastVisits.filter(a => {
          const key = new Date(a.date).toDateString();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Saved measurements are real context even if the visit's outcome has
        // not been logged; they are not proof that a visit actually happened.
        const ids = all.filter(a => a.date && new Date(a.date) < new Date() && a.status !== 'cancelled' && a.id !== appointmentId).map(a => a.id).filter(Boolean);
        if (ids.length) {
          const measures = await DB.getMeasurementsForAppointments(ids);
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
        if (typeof CommunicationService !== 'undefined') allMessages = await CommunicationService.decorate(allMessages);
        allMessages = allMessages.filter(c => typeof CommunicationService === 'undefined' ? !!c.sentAt : CommunicationService.isConfirmed(c));
      }
    } catch (e) { /* draft without order/message history */ }
    orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    allMessages.sort((a, b) => new Date(b.sentAt || b.receivedAt || b.createdAt || 0) - new Date(a.sentAt || a.receivedAt || a.createdAt || 0));
    const outboundMessages = allMessages.filter(c => c.direction !== 'inbound');
    recentMessages = allMessages.slice(0, 4)
      .map(c => ({ content: String(c.content || '').trim(), sentAt: c.sentAt || c.receivedAt || null, direction: c.direction === 'inbound' ? 'customer' : 'advisor' }))
      .filter(c => c.content);
    const latestOrder = orders[0] || null;
    const depositPaid = latestOrder?.depositPaid || 0;

    let templateText = '';
    try {
      const keys = (templateKey === 'intro_day_before' ? 'pre_intro' : templateKey).split('.');
      let t = CONFIG.templates;
      for (const k of keys) t = t?.[k];
      if (t && typeof t === 'object' && 'consultation' in t) t = t[appt?.type] || t.consultation;
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
      : 'Order details not supplied.';

    const alreadyIntroduced = await this.introductionAlreadyRecorded(appt, customerVisits, allMessages);
    const introStage = this.isIntroductionTemplate(templateKey);
    const safeTemplate = introStage ? await this.buildIntroMessage(appt, customer) : this._interpolateTemplateText(templateText, customer, appt, advisorName, visitTypeLabel);

    return {
      advisor_name: advisorName,
      advisor_role: CONFIG.advisorTitle || 'window coverings advisor',
      facebook_url: introStage && !alreadyIntroduced ? (this.socialLinkLines().split('\n').find(l => l.startsWith('Facebook: ')) || '').slice(10) : '',
      instagram_url: introStage && !alreadyIntroduced ? (this.socialLinkLines().split('\n').find(l => l.startsWith('Instagram: ')) || '').slice(11) : '',
      advisor_already_introduced: alreadyIntroduced,
      introduction_required: introStage && !alreadyIntroduced && !['fitting', 'service_call', 'review', 'follow_up'].includes(appt?.type),
      include_social_links: introStage && !alreadyIntroduced,
      safe_template_text: safeTemplate || '',
      customer_name: Utils.customerFirstName(customer, appt?.clientName),
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
      stage: this.stageForTemplateKey(templateKey, appt?.outcome),
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
      job_summary: await this.buildJobSummary(customerId),
      template_key: templateKey,
      // Interpolated so the AI never sees literal "{{firstName}}" braces.
      template_text: this._interpolateTemplateText(templateText, customer, appt, advisorName, visitTypeLabel),
      days_since_last_visit: daysSince,
      lead_source: customer?.source || '',
      recent_messages: recentMessages.map(m => `[${m.sentAt ? Utils.formatDate(m.sentAt, 'short') : 'sometime'}] ${m.direction}: "${m.content}"`),
      total_messages_sent: outboundMessages.length,
      last_sent_days_ago: outboundMessages[0]?.sentAt
        ? Utils.daysBetween(new Date(), new Date(outboundMessages[0].sentAt))
        : null
    };
  },

  async confirmSend() {
    if (this._sending) return;
    this._sending = true;
    try { return await this._confirmSend(); }
    catch (error) { Toast.show('Could not prepare the hand-off. Your draft is retained; nothing is marked sent.', 'error'); }
    finally { this._sending = false; }
  },

  async _confirmSend() {
    const pending = this.pendingMessage;
    const revision = App._navigationRevision;
    if (!pending) {
      Toast.show('No message ready', 'error');
      return;
    }
    const preview = document.getElementById('talk-message-preview');
    const message = preview?.value.trim();
    if (!message) {
      Toast.show('Message cannot be empty', 'error');
      return;
    }
    if (pending.appointmentId) {
      let current;
      try { current = await this.draftBookingSnapshot(pending.appointmentId); }
      catch (_) { return Toast.show('Could not verify current booking details. Nothing opened.', 'error'); }
      if (!current || JSON.parse(current).status === 'cancelled') return Toast.show('This visit is missing or cancelled. Review it before contacting the customer.', 'warning');
      if (current !== this._draftBookingSnapshot) {
        const checked = document.getElementById('draft-booking-checked');
        if (this._reviewBookingCandidate !== current || !checked?.checked) {
          this._reviewBookingCandidate = current;
          const warning = document.getElementById('draft-booking-review');
          if (warning) warning.hidden = false;
          const details = document.getElementById('draft-booking-current');
          if (details) details.textContent = this.bookingSnapshotLabel(current);
          if (checked) checked.checked = false;
          return Toast.show('Booking details changed. Review the draft and tick the confirmation before sharing.', 'warning');
        }
        // Recipient changes require reopening so the normal contact/consent flow
        // resolves the current recipient; a checkbox cannot authorize an old one.
        const old = this._previewBookingSnapshot ? JSON.parse(this._previewBookingSnapshot) : null;
        const fresh = JSON.parse(current);
        if (old && (old.phone !== fresh.phone || old.customerId !== fresh.customerId)) return Toast.show('Recipient changed. Close and reopen the message to refresh the recipient.', 'warning');
        this._draftBookingSnapshot = current;
      }
    }
    if (await this.savePreviewDraft() === false) return;
    const { customerId, phone, appointmentId, templateKey } = pending;
    if (customerId > 0 && typeof CommunicationService !== 'undefined') {
      const preference = await CommunicationService.preference(customerId, 'whatsapp');
      if (!CommunicationService.canContact(preference)) {
        Toast.show('WhatsApp is blocked by this customer’s contact preference', 'warning');
        return;
      }
    }
    // Record the attempt honestly. We can't confirm WhatsApp actually loaded
    // (window.open only tells us the call was made), so log it as an attempt,
    // not a confirmed send — the user verifies in WhatsApp itself.
    let communication = null;
    if (customerId > 0) communication = typeof CommunicationService !== 'undefined'
      ? await CommunicationService.recordHandoff({ customerId, appointmentId, type: 'whatsapp_handoff', template: templateKey || null, content: message })
      : await DB.addCommunication({ customerId, type: 'whatsapp_attempted', template: templateKey || null, content: message });
    // Persist the requested hand-off BEFORE iOS can suspend/navigate away.
    if (this.pendingMessage !== pending || App._navigationRevision !== revision || preview !== document.getElementById('talk-message-preview')) {
      if (communication) await DB.updateCommunication(communication.id, { status: 'cancelled' });
      return;
    }
    this.beginSentConfirmation(communication, { customerId, appointmentId, templateKey });
    App.closeModal();
    const opened = NotificationService.sendWhatsApp(phone, message);
    if (!opened && communication) await DB.updateCommunication(communication.id, { status: 'cancelled' });
    if (opened) Toast.show('When you return, record whether it sent in Follow-ups.', 'info');
  },

  confirmationStorageKey: 'advisoros_pending_message_confirmation',

  beginSentConfirmation(communication, details = {}) {
    this.pendingSentConfirmation = { communicationId: communication?.id || null, ...details, handedOffAt: new Date().toISOString() };
    this.persistSentConfirmation();
    return this.pendingSentConfirmation;
  },

  persistSentConfirmation() {
    try {
      if (this.pendingSentConfirmation) localStorage.setItem(this.confirmationStorageKey, JSON.stringify(this.pendingSentConfirmation));
      else localStorage.removeItem(this.confirmationStorageKey);
    } catch (e) { /* storage warning is handled globally */ }
  },

  restoreSentConfirmation() {
    if (this.pendingSentConfirmation) return this.pendingSentConfirmation;
    try {
      const value = JSON.parse(localStorage.getItem(this.confirmationStorageKey) || 'null');
      if (value?.communicationId) this.pendingSentConfirmation = value;
    } catch (e) { localStorage.removeItem(this.confirmationStorageKey); }
    return this.pendingSentConfirmation;
  },

  async openSentConfirmation(communicationId = null) {
    const revision = App._navigationRevision;
    const rows = await CommunicationService.pendingHandoffs({ includeInactive: !!communicationId });
    const row = communicationId ? rows.find(row => row.id === Number(communicationId)) : rows[0];
    if (!row) return Toast.show('This message no longer needs confirmation', 'info');
    const visit = row.appointmentId ? await DB.getAppointment(Number(row.appointmentId)) : null;
    const customer = row.customerId ? await DB.getCustomer(Number(row.customerId)) : null;
    if (App._navigationRevision !== revision) return;
    this.pendingSentConfirmation = { communicationId: row.id, customerId: row.customerId, appointmentId: row.appointmentId, templateKey: row.template, reviewedSnapshot: visit ? DB.visitContactSnapshot(visit) : null };
    const name = customer?.fullName || [customer?.firstName,customer?.lastName].filter(Boolean).join(' ') || visit?.clientName || 'Customer';
    App.openModal(`<div class="sheet-header"><h3>Did you send this message?</h3><button class="btn btn-ghost btn-sm" aria-label="Close confirmation" data-action="App.closeModal">Close</button></div><div class="sheet-body"><p><strong>${Utils.escapeHtml(name)}</strong> · ${Utils.escapeHtml(CommunicationService.purposeLabel(row.template))}</p>${visit ? `<p>${Utils.escapeHtml(Utils.formatDate(visit.date,'long'))} · ${Utils.escapeHtml(this.apptTimeText(visit))}</p>` : ''}<p class="text-secondary">Opening WhatsApp is not proof of sending. Confirm only what you actually sent. This does not mean the customer agreed or read it.</p>${row.bookingSnapshot && visit && row.bookingSnapshot !== DB.visitContactSnapshot(visit) ? '<p class="text-warning">The booking changed since this draft. This records the old message only; the current visit reminder will remain.</p>' : ''}<p class="fs-13">${Utils.escapeHtml(row.content || 'Message text not captured')}</p>${row.template === 'intro_day_before' ? '<label for="sent-message-purpose">Which part did you send?</label><select class="select" id="sent-message-purpose"><option value="">Choose what you sent</option><option value="pre_intro">Introduction only</option><option value="intro_day_before">Introduction and visit reminder</option><option value="day_before">Visit reminder only</option></select>' : ''}<p id="send-confirmation-error" role="alert"></p><button class="btn btn-primary btn-block" data-action="TalkFeature.confirmHandoffSent">Yes, I sent it</button><button class="btn btn-outline btn-block mt-sm" data-action="TalkFeature.leaveHandoffUnconfirmed">Not sent — keep reminder</button></div>`);
    this._sentConfirmationOwner = { pending:this.pendingSentConfirmation, revision, element:document.getElementById('send-confirmation-error') };
  },

  ownsSentConfirmation(pending) {
    const owner = this._sentConfirmationOwner;
    return owner?.pending === pending && this.pendingSentConfirmation === pending &&
      owner.revision === App._navigationRevision && owner.element &&
      owner.element === document.getElementById('send-confirmation-error');
  },

  draftStorageKey(pending) {
    return `communication-draft:${pending.appointmentId}:${pending.templateKey}`;
  },

  async draftBookingSnapshot(id) {
    const visit = await DB.getAppointment(id);
    if (!visit) return null;
    const customer = visit.customerId ? await DB.getCustomer(visit.customerId) : null;
    return JSON.stringify({ date: visit.date || '', type: visit.type || '', arrivalStart: visit.arrivalStart || '', arrivalEnd: visit.arrivalEnd || '', address: visit.address || '', customerAddress: customer?.address || '', name: visit.clientName || '', customerName: [customer?.firstName, customer?.lastName].filter(Boolean).join(' '), phone: customer?.phone || visit.phone || '', customerId: visit.customerId || null, status: visit.status || '', outcome: visit.outcome || '' });
  },

  bookingSnapshotLabel(snapshot) {
    if (!snapshot) return 'Booking unavailable — review the visit.';
    const booking = JSON.parse(snapshot);
    const address = booking.address || (typeof booking.customerAddress === 'string' ? booking.customerAddress : Object.values(booking.customerAddress || {}).filter(v => typeof v === 'string').join(', '));
    return `Current booking: ${booking.customerName || booking.name} · ${booking.date ? Utils.formatDate(booking.date, 'short') + ' ' + Utils.formatTime(booking.date) : 'No time'} · ${booking.type}${booking.arrivalStart ? ' · ' + booking.arrivalStart + '–' + booking.arrivalEnd : ''} · ${address} · ${booking.phone}`;
  },

  async openSavedDrafts(appointmentId = null) {
    await (this._draftSave || Promise.resolve()).catch(() => {});
    const settings = await DB.db.settings.toArray();
    const rows = [];
    for (const setting of settings.filter(s => s.key.startsWith('communication-draft:'))) {
      const [, id, templateKey] = setting.key.split(':');
      if (appointmentId && Number(id) !== Number(appointmentId)) continue;
      const appt = await DB.getAppointment(Number(id));
      if (!appt) continue;
      rows.push(`<button class="btn btn-outline btn-block mb-sm" data-action="TalkFeature.sendMessage" data-args='${Utils.escapeHtml(JSON.stringify([Number(id), templateKey]))}'>Resume draft · ${Utils.escapeHtml(appt.clientName || 'Customer')} · ${Utils.escapeHtml(templateKey.replace(/_/g, ' '))}</button>`);
    }
    App.openModal(`<div class="sheet-header"><h3>Saved unsent drafts</h3><button class="btn btn-ghost" data-action="App.closeModal">Close</button></div><div class="sheet-body"><p>Check dates and details before sending. Drafts are not confirmed messages.</p>${rows.join('') || '<p>No saved drafts.</p>'}</div>`);
  },

  async savePreviewDraft() {
    const pending = this.pendingMessage;
    const field = document.getElementById('talk-message-preview');
    if (!pending?.appointmentId || !field || typeof DB.setPrivateSetting !== 'function') return;
    const key = this.draftStorageKey(pending);
    const value = { text: field.value, updatedAt: new Date().toISOString(), bookingSnapshot: this._draftBookingSnapshot || null };
    this._draftSave = (this._draftSave || Promise.resolve()).catch(() => {}).then(() => DB.setPrivateSetting(key, JSON.stringify(value)));
    try { await this._draftSave; return true; } catch (e) { Toast.show('Draft could not be saved. Keep this screen open and copy your text.', 'error'); return false; }
  },

  async dismissPreview() {
    if (await this.savePreviewDraft() === false) return;
    // Keep the saved draft without re-arming a scheduled popup.
    this.pendingMessage = null;
    App.closeModal();
  },

  async confirmHandoffSent() {
    const pending = this.pendingSentConfirmation;
    if (!pending?.communicationId || this._confirmingSend || !this.ownsSentConfirmation(pending)) return;
    let purpose = pending.templateKey;
    if (purpose === 'intro_day_before') {
      purpose = document.getElementById('sent-message-purpose')?.value;
      if (!['pre_intro','intro_day_before','day_before'].includes(purpose)) {
        const field=document.getElementById('send-confirmation-error');if(field)field.textContent='Choose which message you actually sent.';return;
      }
    }
    this._confirmingSend = true;
    try {
      await CommunicationService.advisorConfirmSent(pending.communicationId, pending.customerId, pending.reviewedSnapshot, purpose);
      await this.finishSendDecision(pending, 'Message marked as sent by you');
    } catch (error) { if(this.ownsSentConfirmation(pending))this._sentConfirmationOwner.element.textContent=error.message;Toast.show('Not updated. Your confirmation remains available to retry.', 'error'); }
    finally { this._confirmingSend = false; }
  },

  async leaveHandoffUnconfirmed() {
    const pending = this.pendingSentConfirmation;
    if (!pending?.communicationId || this._confirmingSend || !this.ownsSentConfirmation(pending)) return;
    this._confirmingSend = true;
    try {
    await DB.resolveCommunicationSend(pending.communicationId, pending.customerId, 'not_sent');
    if (pending?.appointmentId && pending?.templateKey && typeof MessageScheduler !== 'undefined') {
      try { localStorage.removeItem(MessageScheduler._flag(pending.templateKey, pending.appointmentId)); } catch (e) {}
    }
    await this.finishSendDecision(pending, 'Not marked sent — the reminder stays available', false);
    } catch(error) { if(this.ownsSentConfirmation(pending))this._sentConfirmationOwner.element.textContent=error.message;Toast.show('Not updated. Please retry.', 'error'); }
    finally { this._confirmingSend = false; }
  },

  async finishSendDecision(pending, message, clearDraft = true) {
    // Clear only the draft of this confirmed purpose, never another editor.
    if (clearDraft && pending.appointmentId && typeof DB.setPrivateSetting === 'function') {
      try { await (this._draftSave || Promise.resolve()).catch(()=>{});await DB.setPrivateSetting(this.draftStorageKey(pending), null); } catch(error) { console.warn('Sent state saved; draft cleanup deferred',error); }
    }
    if (this.pendingSentConfirmation !== pending) return;
    const ownsModal = this.ownsSentConfirmation(pending);
    this.pendingSentConfirmation = null; this.persistSentConfirmation();
    if (ownsModal) App.closeModal();
    Toast.show(message,'success');
    if (ownsModal && ['followups','today'].includes(App.currentFeature?.id)) App.navigate(App.currentHash || App.currentFeature.id);
  },

  async sendDayBefore(appointmentId) {
    // Historical action name retained for saved routes and existing buttons.
    // Recheck the shared purpose at the moment of review, not at render time.
    if (typeof FollowupsFeature !== 'undefined') return FollowupsFeature.reviewPreVisit(appointmentId);
    Toast.show('Pre-visit messages are unavailable. Please reload Beelo.', 'info');
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
      <div class="sheet-header"><h3>Choose Customer</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="flex flex-col gap-sm" >
          ${visits.map(visit => `
            <button class="list-item bordered-8 text-left"  data-close="1" data-action="TalkFeature.sendMessage" data-args='${Utils.escapeHtml(JSON.stringify([(visit.id), key]))}'>
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
