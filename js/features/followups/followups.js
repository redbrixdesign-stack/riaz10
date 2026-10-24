/* ============================================
   ADVISOROS v5.0 — FOLLOW-UPS / TASK INBOX
   A single "due today" inbox so the follow-up
   scheduler has a visible home:
     · quote chases  (visit outcomes, gated by Talk's
       learned/configured timing)
     · payment reminders (orders with balance due)
     · today's visits still needing an outcome
     · tomorrow's visits needing their day-before message
     · intro messages (first-time customers' bookings,
       per the communication spec)
     · post-fit thank-yous and service/issue acknowledgements
   ============================================ */

const FollowupsFeature = {
  id: 'followups',
  name: 'Follow-ups',
  icon: 'campaign',

  // How many days after an order is created before its deposit reminder
  // becomes "due". Orders keep no due-date field, so this is the trigger.
  paymentReminderDays() {
    return (CONFIG.followups && CONFIG.followups.paymentReminderDays) || 3;
  },

  preVisitPlan(appt, introduced, now = new Date()) {
    const visitAt = new Date(appt.date);
    if (appt.status !== 'confirmed' || appt.outcome || isNaN(visitAt) || visitAt <= now) return null;
    const contact = typeof TaskService !== 'undefined' ? TaskService.contactEvidence(appt) : {};
    introduced = introduced || contact.introduced;
    const confirmed = appt.dayBeforeSent || contact.agreed;
    const p = Utils.ukParts(now), v = Utils.ukParts(visitAt);
    const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    const isTomorrow = v.year === tomorrow.getUTCFullYear() && v.month === tomorrow.getUTCMonth() + 1 && v.day === tomorrow.getUTCDate();
    const reminderWindow = visitAt - now <= 86400000 || isTomorrow;
    if (!introduced && !appt.introSent) {
      return reminderWindow && !confirmed
        ? { kind: 'intro_confirmation', template: 'intro_day_before', action: 'Introduce yourself and confirm this visit' }
        : { kind: 'intro', template: 'pre_intro', action: 'Introduce yourself before this visit' };
    }
    if (reminderWindow && !confirmed) return { kind: 'visit_tomorrow', template: 'day_before', action: 'Confirm the upcoming visit' };
    return null;
  },

  async archiveMissedCommunication(appt, type, dueAt, reason) {
    const archive = Array.isArray(appt.communicationArchive) ? [...appt.communicationArchive] : [];
    const key = `${type}:${new Date(dueAt).toISOString()}`;
    if (archive.some(item => item.key === key)) return false;
    archive.push({ key, type, status: 'missed', dueAt: new Date(dueAt).toISOString(), archivedAt: new Date().toISOString(), reason });
    if (typeof DB.updateAppointment === 'function') await DB.updateAppointment(appt.id, { communicationArchive: archive });
    appt.communicationArchive = archive;
    return true;
  },

  async reconcileCommunicationDeadlines(appointments, isFirstVisit, now = new Date()) {
    const serviceFailures = new Set([...(TalkFeature.SERVICE_OUTCOMES?.fitting || []), ...(TalkFeature.SERVICE_OUTCOMES?.service_call || [])]);
    for (const appt of appointments) {
      if (!appt?.date || appt.status === 'cancelled') continue;
      const visitAt = new Date(appt.date);
      if (isNaN(visitAt)) continue;
      const introDeadline = new Date(visitAt.getTime() - 24 * 60 * 60 * 1000);
      const bookedAt = new Date(appt.createdAt || appt.date);
      const first = isFirstVisit(appt.customerId, appt);
      const contact = typeof TaskService !== 'undefined' ? TaskService.contactEvidence(appt) : {};
      // A booking received before T-24 owed a standalone introduction. Once
      // missed, that obligation is archived and the active task becomes the
      // combined recovery message until the visit starts.
      if (!appt.outcome && appt.status !== 'completed' && first && !appt.introSent && !contact.introduced && bookedAt < introDeadline && now >= introDeadline) {
        await this.archiveMissedCommunication(appt, 'introduction', introDeadline, 'Introduction was not confirmed sent before the 24-hour appointment deadline');
      }
      if (!appt.outcome && appt.status !== 'completed' && now >= visitAt && !appt.dayBeforeSent && !contact.agreed) {
        const hadStandaloneWindow = bookedAt < introDeadline;
        const type = first && !appt.introSent ? (hadStandaloneWindow ? 'intro_confirmation_recovery' : 'intro_confirmation') : 'day_before_confirmation';
        await this.archiveMissedCommunication(appt, type, visitAt, 'The appointment started before sending was confirmed');
      }
      if (appt.type === 'fitting' && appt.outcome === 'completed' && !appt.postFitSent && now >= new Date(visitAt.getTime() + 7 * 86400000)) {
        await this.archiveMissedCommunication(appt, 'post_fit_followup', new Date(visitAt.getTime() + 7 * 86400000), 'Post-fitting follow-up was not confirmed within 7 days');
      }
      if ((appt.type === 'fitting' || appt.type === 'service_call') && serviceFailures.has(appt.outcome) && !appt.serviceSent && now >= new Date(visitAt.getTime() + 48 * 3600000)) {
        await this.archiveMissedCommunication(appt, 'service_acknowledgement', new Date(visitAt.getTime() + 48 * 3600000), 'Service acknowledgement was not confirmed within 48 hours');
      }
    }
  },

  async communicationMetrics() {
    let appointments = [];
    try { appointments = await DB.getAllAppointments(); } catch (e) { return { missed: 0, recovered: 0, obligations: 0, missedRate: 0, archive: [] }; }
    const archive = appointments.flatMap(appt => (appt.communicationArchive || []).map(item => ({ ...item, appointment: appt })));
    const recovered = archive.filter(item => item.type === 'introduction' && item.appointment.introSent && item.appointment.dayBeforeSent).length;
    const sent = appointments.reduce((count, appt) => count + ['introSent', 'dayBeforeSent', 'postFitSent', 'serviceSent'].filter(flag => appt[flag]).length, 0);
    const obligations = sent + archive.length;
    return { missed: archive.length, recovered, obligations, missedRate: obligations ? Math.round(archive.length / obligations * 100) : 0, archive: archive.sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt)) };
  },

  async loadDerivedTasks() {
    const now = new Date();
    let pipeline = [];
    let orders = [];
    let upcoming = [];
    let futureAppts = [];
    let todayAppts = [];
    let allAppts = [];
    try { pipeline = await DB.getPipeline(); } catch (e) {}
    try { orders = await DB.db.orders.toArray(); } catch (e) {}
    try { upcoming = await DB.getUpcomingAppointments(5); } catch (e) {}
    // getUpcomingAppointments now starts at today's UK midnight, so it already
    // includes earlier-today visits; the separate full-day pull stays as a
    // harmless redundant guard for the outcome tasks.
    try { todayAppts = await DB.getAppointmentsForDate(now.toISOString()); } catch (e) {}
    try { allAppts = await DB.getAllAppointments(); } catch (e) {}
    // Intro messages apply to ANY distance of booking, not just the next few
    // days — otherwise a visit booked 2-3 weeks out (common for renovations)
    // gets no intro task and its customer is never messaged.
    try { futureAppts = await DB.getUpcomingAppointments(60); } catch (e) {}

    // A confirmed outbound message is stronger evidence than the legacy
    // appointment flag. If the advisor has already contacted the customer,
    // never surface a second "first contact" task after a reload/import.
    const contactedCustomerIds = new Set();
    try {
      let communications = await DB.db.communications.toArray();
      if (typeof CommunicationService !== 'undefined') communications = await CommunicationService.decorate(communications);
      for (const row of communications) {
        const confirmed = typeof CommunicationService !== 'undefined'
          ? CommunicationService.isConfirmed(row)
          : !!row.sentAt;
        if (confirmed && row.direction !== 'inbound' && row.customerId) contactedCustomerIds.add(Number(row.customerId));
      }
    } catch (e) { /* retain the appointment-flag fallback */ }

    const customerIds = [...new Set([
      ...pipeline.map(a => a.customerId).filter(Boolean),
      ...orders.map(o => o.customerId).filter(Boolean),
      ...upcoming.map(a => a.customerId).filter(Boolean),
      ...todayAppts.map(a => a.customerId).filter(Boolean),
      ...futureAppts.map(a => a.customerId).filter(Boolean)
    ])];
    const customerMap = new Map();
    if (customerIds.length) {
      try {
        const fetched = await DB.getCustomersByIds(customerIds);
        for (const c of fetched) if (c) customerMap.set(c.id, c);
      } catch (e) {}
    }

    // UK calendar-day matching (same convention as MessageScheduler): the
    // day a visit happens for the advisor is its UK wall-clock day, not the
    // device-local one — a UTC+X device would otherwise classify "today" /
    // "tomorrow" differently from the scheduler's evening-before drafts.
    const ukDayKey = d => {
      const p = Utils.ukParts(d ? new Date(d) : undefined);
      return p.year * 10000 + p.month * 100 + p.day;
    };
    const todayKey = ukDayKey();
    const tasks = [];

    // 1. Quote chases from visit outcomes (Talk's timing rules).
    // Only visits STILL awaiting an outcome are covered by the visit_today /
    // visit_tomorrow tasks below — a quoted (or otherwise concluded) visit
    // today would otherwise be skipped by its own guard and never get its
    // chase (quote logged this morning = no follow-up: a real gap found by
    // the end-to-end journey audit).
    const skippableIds = new Set([...upcoming, ...todayAppts].filter(a => !a.outcome && a.status !== 'completed').map(a => a.id));
    for (const appt of pipeline) {
      if (skippableIds.has(appt.id)) continue;
      if (appt.status === 'cancelled' || ['ordered', 'lost', 'not_interested', 'not_looking_for', 'other_no_sale', 'cancelled'].includes(appt.outcome)) continue;
      if (orders.some(o => String(o.appointmentId) === String(appt.id) && o.status !== 'cancelled' && o.status !== 'cancelled_order' && o.stage !== 'cancelled')) continue;
      const match = (typeof TalkFeature !== 'undefined') ? TalkFeature.getTemplateForOutcome(appt.outcome) : null;
      if (!match) continue;
      const daysSince = Utils.daysBetween(now, new Date(appt.date));
      tasks.push({
        kind: 'quote',
        due: daysSince >= match.minDays,
        daysLabel: daysSince <= 0 ? 'today' : `${daysSince}d ago`,
        appointment: appt,
        customer: appt.customerId ? customerMap.get(appt.customerId) : null,
        template: match.template,
        action: match.action,
        priority: (match.priority === 'high' || (appt.outcome === 'quoted' && daysSince >= 7)) ? 'high' : 'normal',
        inDays: match.minDays - daysSince
      });
    }

    // 2. Payment reminders: live orders with a balance to collect.
    const paymentDays = this.paymentReminderDays();
    for (const order of orders) {
      const balanceDue = order.balanceDue || 0;
      if (balanceDue <= 0) continue;
      const stage = order.stage || 'ordered';
      if (stage !== 'ordered' && stage !== 'delivered') continue;
      const created = order.createdAt ? new Date(order.createdAt) : new Date();
      const daysSince = Utils.daysBetween(now, created);
      tasks.push({
        kind: 'payment',
        due: daysSince >= paymentDays,
        daysLabel: daysSince <= 0 ? 'today' : `${daysSince}d`,
        order,
        customer: order.customerId ? customerMap.get(order.customerId) : null,
        action: `Collect ${Utils.formatCurrency(balanceDue)} (deposit ${Utils.formatCurrency(order.depositPaid || 0)} of ${Utils.formatCurrency(order.depositRequired || 0)})`,
        priority: 'high',
        inDays: paymentDays - daysSince
      });
    }

    // 3. Today's unresolved visits become due only at their scheduled finish.
    // Keep future/ongoing visits in Not due yet; never infer completion.
    for (const appt of todayAppts) {
      if (appt.status !== 'confirmed' || appt.outcome) continue;
      if (ukDayKey(appt.date) !== todayKey) continue;
      const outcomeDueAt = Utils.visitOutcomeDueAt(appt);
      if (!outcomeDueAt) continue;
      tasks.push({
        kind: 'visit_today',
        due: outcomeDueAt <= now,
        effectiveDue: outcomeDueAt.toISOString(),
        daysLabel: Utils.formatTime(appt.date),
        appointment: appt,
        customer: appt.customerId ? customerMap.get(appt.customerId) : null,
        action: 'Outcome not logged yet',
        priority: 'normal',
        inDays: 0
      });
    }

    // One current communication purpose per visit. The visit itself and a
    // no-show are not evidence that the adviser previously met the customer.
    const isFirstVisit = (id, current) => !contactedCustomerIds.has(Number(id)) && !allAppts.some(a =>
      id && String(a.customerId) === String(id) && a.id !== current?.id &&
      a.status !== 'cancelled' && a.outcome &&
      !['cancelled', 'customer_no_show', 'advisor_unavailable'].includes(a.outcome) && new Date(a.date) < now);

    await this.reconcileCommunicationDeadlines(allAppts, isFirstVisit, now);

    const candidates = [...new Map([...futureAppts, ...upcoming, ...todayAppts].map(a => [a.id, a])).values()]
      .filter(a => a.phone || a.customerId)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const introSeen = new Set();
    for (const appt of candidates) {
      const introduced = !isFirstVisit(appt.customerId, appt) || appt.introSent;
      const plan = this.preVisitPlan(appt, introduced, now);
      if (!plan) continue;
      if (plan.kind === 'intro' && appt.customerId && introSeen.has(appt.customerId)) continue;
      if (appt.customerId && plan.kind !== 'visit_tomorrow') introSeen.add(appt.customerId);
      tasks.push({
        ...plan,
        due: true,
        // Time only: the card's meta line already prefixes the date, so a
        // date here too would render "16 Aug · 16 Aug · 04:02".
        daysLabel: TalkFeature.apptTimeText(appt),
        appointment: appt,
        customer: appt.customerId ? customerMap.get(appt.customerId) : null,
        priority: 'normal',
        inDays: 0
      });
    }

    // 6. Post-fit thank-yous and 7. service/issue acknowledgements: recent
    //    fittings completed (postFitSent) or fittings/service calls that
    //    ended with something to acknowledge (serviceSent). Window: the last
    //    14 days, and never for visits already on today's/upcoming lists
    //    (those are handled by the outcome tasks above).
    const serviceOutcomes = TalkFeature.SERVICE_OUTCOMES
      ? [...(TalkFeature.SERVICE_OUTCOMES.fitting || []), ...(TalkFeature.SERVICE_OUTCOMES.service_call || [])]
      : [];
    const serviceFailures = new Set(serviceOutcomes);
    // Same guard shape as the quote chases: only visits still awaiting an
    // outcome are "covered" by today's outcome tasks. A fitting completed
    // TODAY must still get its post-fit thank-you — before this fix the
    // completed visit sat on today's list and its thank-you vanished.
    const coveredIds = new Set([...upcoming, ...todayAppts].filter(a => !a.outcome && a.status !== 'completed').map(a => a.id));
    for (const appt of allAppts) {
      const daysAgo = Utils.daysBetween(now, new Date(appt.date));
      if (daysAgo < 0 || daysAgo > 14) continue;
      if (coveredIds.has(appt.id)) continue;
      if (appt.status === 'cancelled') continue;
      const archivedTypes = new Set((appt.communicationArchive || []).map(item => item.type));
      if (appt.type === 'fitting' && appt.outcome === 'completed' && !appt.postFitSent && !archivedTypes.has('post_fit_followup')) {
        tasks.push({
          kind: 'post_fit',
          due: true,
          daysLabel: `${Utils.formatDate(appt.date, 'short')} · ${appt.outcome ? 'fitted' : ''}`,
          appointment: appt,
          customer: appt.customerId ? customerMap.get(appt.customerId) : null,
          template: 'post_fit_followup',
          action: 'Post-fit thank-you + review ask — not sent yet',
          priority: 'normal',
          inDays: 0
        });
      } else if ((appt.type === 'fitting' || appt.type === 'service_call') && serviceFailures.has(appt.outcome) && !appt.serviceSent && !archivedTypes.has('service_acknowledgement')) {
        tasks.push({
          kind: 'service',
          due: true,
          daysLabel: `${Utils.formatDate(appt.date, 'short')} · ${appt.outcome}`,
          appointment: appt,
          customer: appt.customerId ? customerMap.get(appt.customerId) : null,
          template: 'service_or_issue_followup',
          action: 'Service/issue acknowledgement — not sent yet',
          priority: 'high',
          inDays: 0
        });
      }
    }

    return tasks;
  },

  async reviewPreVisit(appointmentId) {
    const task = (await this.loadDerivedTasks()).find(t => t.appointment?.id === appointmentId && ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(t.kind));
    if (!task) { Toast.show('This pre-visit message is no longer due', 'info'); return App.navigate('followups'); }
    return TalkFeature.sendMessage(appointmentId, task.template);
  },

  async openContactOutcome(appointmentId) {
    const visit = await DB.getAppointment(appointmentId);
    if (!visit) return Toast.show('Visit not found', 'error');
    this.pendingContact = { id: appointmentId, snapshot: DB.visitContactSnapshot(visit), operationId: TaskService.operationId('phone-contact', appointmentId) };
    const labels = { introduced: 'Introduced myself', visit_agreed: 'Visit date/time agreed', introduced_and_agreed: 'Introduced myself and agreed the visit', no_answer: 'No answer / voicemail only' };
    const history = Array.isArray(visit.contactOutcomes) ? visit.contactOutcomes : [];
    const retracted = new Set(history.filter(e => e.outcome === 'retracted' && e.provenance === 'advisor_recorded' && e.channel === 'phone').map(e => e.targetId));
    const historyHtml = history.slice().reverse().map(e => {
      const target = e.outcome === 'retracted' ? history.find(t => t.id === e.targetId) : null;
      const label = target ? `Correction: ${labels[target.outcome] || 'Phone record'} retracted` : labels[e.outcome] || 'Contact recorded';
      const correctable = !!labels[e.outcome] && e.id && !retracted.has(e.id) && e.provenance === 'advisor_recorded' && e.channel === 'phone';
      return `<div class="mt-sm fs-13"><div>${Utils.escapeHtml(label)} · ${Utils.formatDate(e.recordedAt, 'short')}${retracted.has(e.id) ? ' · Retracted (history retained)' : ''}</div>${correctable ? `<button class="btn btn-outline btn-sm mt-sm" aria-label="Correct record: ${Utils.escapeHtml(label)}" data-action="FollowupsFeature.openContactCorrection" data-args='${Utils.escapeHtml(JSON.stringify([appointmentId, e.id]))}'>Correct record</button>` : ''}</div>`;
    }).join('');
    App.openModal(`<div class="sheet-header"><h3>Record phone contact</h3><button class="btn btn-ghost" aria-label="Close phone contact" data-action="App.closeModal">Close</button></div><div class="sheet-body phone-contact-recording"><p>${Utils.escapeHtml(visit.clientName || 'Customer')} · ${Utils.formatDate(visit.date, 'long')} · ${TalkFeature.apptTimeText(visit)}</p><p class="fs-13 text-secondary">Record only what happened. An unanswered call does not clear a reminder. This does not place a call or send a message.</p><label for="contact-outcome">What happened?</label><select id="contact-outcome" class="select"><option value="">Choose an outcome</option>${Object.entries(labels).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select><p id="phone-contact-error" role="alert"></p><button class="btn btn-primary btn-block mt-md" data-action="FollowupsFeature.saveContactOutcome">Save contact outcome</button>${history.length ? `<details class="mt-md"><summary>Recorded phone contact</summary>${historyHtml}</details>` : ''}</div>`);
  },

  async openContactCorrection(appointmentId, targetId) {
    const visit = await DB.getAppointment(appointmentId);
    const target = visit?.contactOutcomes?.find(e => e.id === targetId);
    if (!target) return Toast.show('Phone record not found', 'error');
    this.pendingContactCorrection = { appointmentId, targetId, operationId: TaskService.operationId('retract-phone', appointmentId) };
    App.openModal(`<div class="sheet-header"><h3>Correct phone record?</h3><button class="btn btn-ghost" aria-label="Cancel phone correction" data-action="App.closeModal">Cancel</button></div><div class="sheet-body phone-contact-correction"><p>${Utils.escapeHtml(visit.clientName || 'Customer')} · ${Utils.escapeHtml(target.outcome.replace(/_/g, ' '))} · ${Utils.formatDate(target.recordedAt, 'short')}</p><p>This retracts this adviser-recorded outcome, not the real call. The original stays in history. Any still-needed reminder can return; sent messages and other contact records are unchanged.</p><p>If a different outcome is correct, record it separately afterwards.</p><p id="phone-correction-error" role="alert"></p><button class="btn btn-primary btn-block" data-action="FollowupsFeature.confirmContactCorrection">Retract incorrect record</button></div>`);
  },

  async confirmContactCorrection() {
    if (!this.pendingContactCorrection || this.savingContactCorrection) return;
    this.savingContactCorrection = true;
    try {
      const pending = this.pendingContactCorrection;
      await DB.retractVisitContact(pending.appointmentId, pending.targetId, pending.operationId);
      this.pendingContactCorrection = null; App.closeModal();
      Toast.show('Correction saved; original history retained', 'success'); App.navigate('followups');
    } catch (e) {
      const error = document.getElementById('phone-correction-error');
      if (error) error.textContent = e.message || 'Could not save correction';
      else Toast.show(e.message || 'Could not save correction', 'error');
    }
    finally { this.savingContactCorrection = false; }
  },

  async saveContactOutcome() {
    if (!this.pendingContact || this.savingContact) return;
    this.savingContact = true;
    const errorEl = document.getElementById('phone-contact-error');
    if (errorEl) errorEl.textContent = '';
    try {
      const pending = this.pendingContact;
      await DB.recordVisitContact(pending.id, document.getElementById('contact-outcome')?.value, pending.snapshot, pending.operationId);
      this.pendingContact = null; App.closeModal(); Toast.show('Phone contact recorded — no message marked sent', 'success'); App.navigate('followups');
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message || 'Could not record contact';
      else Toast.show(e.message || 'Could not record contact', 'error');
    }
    finally { this.savingContact = false; }
  },

  async loadTasks() {
    const derived = await this.loadDerivedTasks();
    const structured = await this.loadStructuredQuoteTasks(derived);
    const jobTasks = await this.loadJobTasks(derived);
    const invoiceTasks = await this.loadInvoiceTasks(derived);
    const supplierTasks = await this.loadSupplierTasks();
    const retentionTasks = await this.loadRetentionTasks();
    const combined = [...derived, ...structured, ...jobTasks, ...invoiceTasks, ...supplierTasks, ...retentionTasks];
    const tasks = await (typeof TaskService !== 'undefined' ? TaskService.merge(combined) : combined);
    if (typeof CommunicationService === 'undefined' || typeof CommunicationService.pendingHandoffs !== 'function') return tasks;
    for (const row of await CommunicationService.pendingHandoffs()) {
      const index = tasks.findIndex(task => task.appointment?.id === row.appointmentId && (task.template === row.template || (['intro','intro_confirmation','visit_tomorrow'].includes(task.kind) && ['pre_intro','intro_day_before','day_before','evening_before'].includes(row.template))));
      const visit = row.appointmentId ? await DB.getAppointment(Number(row.appointmentId)) : null;
      const customer = row.customerId ? await DB.getCustomer(Number(row.customerId)) : null;
      const task = { kind: 'send_confirmation', due: true, communicationId: row.id, template: row.template, appointment: visit, customer, action: `${CommunicationService.purposeLabel(row.template)} — send status not recorded`, daysLabel: 'Record what happened', priority:'normal' };
      if (index >= 0) tasks[index] = task; else tasks.unshift(task);
    }
    return tasks;
  },

  async loadStructuredQuoteTasks(existing = []) {
    if (typeof DB.getQuotes !== 'function') return [];
    let quotes = [];
    try { quotes = await DB.getQuotes(); } catch (e) { return []; }
    const appointmentQuoteIds = new Set(existing.filter(t => t.kind === 'quote').map(t => t.appointment?.id).filter(Boolean));
    const customerIds = [...new Set(quotes.map(q => q.customerId).filter(Boolean))];
    const customers = new Map();
    try {
      const rows = customerIds.length && typeof DB.getCustomersByIds === 'function' ? await DB.getCustomersByIds(customerIds) : [];
      for (const customer of rows) customers.set(customer.id, customer);
    } catch (e) {}
    const now = new Date();
    const tasks = [];
    for (const quote of quotes) {
      if (quote.status === 'accepted' && !quote.convertedOrderId) {
        tasks.push({
          kind: 'quote_accepted', derivedKey: `structured-quote:accepted:${quote.id}`, quote,
          customer: customers.get(quote.customerId) || null, due: true, inDays: 0,
          daysLabel: quote.acceptedAt ? Utils.formatDate(quote.acceptedAt, 'short') : 'Accepted',
          action: `Accepted ${quote.quoteNumber || 'quote'} — create order`, priority: 'high'
        });
        continue;
      }
      if (quote.status !== 'issued' || (quote.appointmentId && appointmentQuoteIds.has(quote.appointmentId))) continue;
      const expiry = quote.expiryDate ? new Date(quote.expiryDate) : null;
      const daysToExpiry = expiry && !isNaN(expiry) ? Utils.daysBetween(expiry, now) : null;
      const issued = quote.issueDate || quote.createdAt;
      const daysSinceIssue = issued ? Utils.daysBetween(now, new Date(issued)) : 0;
      if (daysToExpiry !== null && daysToExpiry <= 3) {
        tasks.push({
          kind: 'quote_expiring', derivedKey: `structured-quote:expiry:${quote.id}`, quote,
          customer: customers.get(quote.customerId) || null, due: true, inDays: 0,
          daysLabel: daysToExpiry < 0 ? 'Expired' : (daysToExpiry === 0 ? 'Expires today' : `Expires in ${daysToExpiry}d`),
          action: `${quote.quoteNumber || 'Quote'} needs attention before expiry`, priority: daysToExpiry <= 0 ? 'high' : 'normal'
        });
      } else if (daysSinceIssue >= 3) {
        tasks.push({
          kind: 'structured_quote', derivedKey: `structured-quote:issued:${quote.id}`, quote,
          customer: customers.get(quote.customerId) || null, due: true, inDays: 0,
          daysLabel: `${daysSinceIssue}d since issue`, action: `Follow up ${quote.quoteNumber || 'issued quote'}`, priority: 'normal'
        });
      }
    }
    return tasks;
  },

  async loadJobTasks(existing = []) {
    if (typeof DB.getJobs !== 'function' || typeof DB.getJobIssues !== 'function') return [];
    let jobs = [];
    try { jobs = await DB.getJobs(); } catch (e) { return []; }
    const serviceAppointmentIds = new Set(existing.filter(t => t.kind === 'service').map(t => t.appointment?.id).filter(Boolean));
    const customerIds = [...new Set(jobs.map(j => j.customerId).filter(Boolean))];
    const customers = new Map();
    try {
      const rows = customerIds.length && typeof DB.getCustomersByIds === 'function' ? await DB.getCustomersByIds(customerIds) : [];
      for (const customer of rows) customers.set(customer.id, customer);
    } catch (e) {}
    const tasks = [];
    for (const job of jobs) {
      let issues = [];
      try { issues = await DB.getJobIssues(job.id); } catch (e) {}
      const openIssues = issues.filter(issue => !issue.resolvedAt && issue.status !== 'resolved');
      if (job.appointmentId && serviceAppointmentIds.has(job.appointmentId)) continue;
      const status = job.status || job.stage;
      if (!openIssues.length && !['blocked', 'return_visit_required'].includes(status)) continue;
      const returnNeeded = status === 'return_visit_required' || openIssues.some(issue => issue.requiresReturnVisit);
      tasks.push({
        kind: 'job_issue', derivedKey: `job:attention:${job.id}`, job, customer: customers.get(job.customerId) || null,
        due: true, inDays: 0, daysLabel: returnNeeded ? 'Return visit needed' : `${openIssues.length} open issue${openIssues.length === 1 ? '' : 's'}`,
        action: returnNeeded ? 'Arrange the return visit and resolve the issue' : 'Resolve the blocked job issue', priority: 'high'
      });
    }
    return tasks;
  },

  async loadInvoiceTasks(existing = []) {
    if (typeof DB.getInvoices !== 'function') return [];
    let invoices = [];
    try { invoices = await DB.getInvoices(); } catch (e) { return []; }
    const representedOrders = new Set(existing.filter(t => t.kind === 'payment').map(t => t.order?.id).filter(Boolean));
    const customerIds = [...new Set(invoices.map(i => i.customerId).filter(Boolean))];
    const customers = new Map();
    try {
      const rows = customerIds.length && typeof DB.getCustomersByIds === 'function' ? await DB.getCustomersByIds(customerIds) : [];
      for (const customer of rows) customers.set(customer.id, customer);
    } catch (e) {}
    const now = new Date();
    const tasks = [];
    for (const invoice of invoices) {
      if (!['issued', 'overdue'].includes(invoice.status) || !invoice.dueDate) continue;
      if (invoice.orderId && representedOrders.has(invoice.orderId)) continue;
      const daysOverdue = Utils.daysBetween(now, new Date(invoice.dueDate));
      if (daysOverdue <= 0) continue;
      let balanceDue = Number(invoice.balanceDue ?? invoice.total ?? 0);
      if (typeof DB.getInvoiceBalance === 'function') {
        try { balanceDue = Number((await DB.getInvoiceBalance(invoice.id)).balanceDue) || 0; } catch (e) {}
      }
      if (balanceDue <= 0) continue;
      tasks.push({
        kind: 'invoice_overdue', derivedKey: `invoice:overdue:${invoice.id}`, invoice,
        customer: customers.get(invoice.customerId) || null, due: true, inDays: 0,
        daysLabel: `${daysOverdue}d overdue`, action: `Collect ${Utils.formatCurrency(balanceDue)} for ${invoice.invoiceNumber || 'invoice'}`,
        priority: 'high'
      });
    }
    return tasks;
  },

  async loadSupplierTasks() {
    if (typeof DB.getPurchaseOrders !== 'function') return [];
    let records = [];
    try { records = await DB.getPurchaseOrders({}); } catch (e) { return []; }
    const now = new Date();
    const tasks = [];
    for (const summary of records) {
      let record = summary;
      try { if (typeof DB.getPurchaseOrder === 'function') record = await DB.getPurchaseOrder(summary.id) || summary; } catch (e) {}
      const openEvents = (record.events || []).filter(event => (['shortage', 'damage', 'returned'].includes(event.type) || (event.type === 'note' && event.followUp)) && event.open !== false && !event.resolvedAt);
      if (record.status === 'cancelled' || (record.status === 'received' && !openEvents.length)) continue;
      const expectedAt = record.expectedAt || record.expectedDelivery;
      const lateDays = expectedAt ? Utils.daysBetween(now, new Date(expectedAt)) : 0;
      if (!openEvents.length && lateDays <= 0) continue;
      const latest = openEvents[openEvents.length - 1];
      tasks.push({
        kind: 'supplier_issue', derivedKey: `supplier:attention:${record.id}`, purchaseOrder: record,
        due: true, inDays: 0, daysLabel: latest ? this.supplierIssueLabel(latest.type) : `${lateDays}d late`,
        action: latest ? `${record.supplierName || 'Supplier'}: ${latest.notes || this.supplierIssueLabel(latest.type)}` : `Chase ${record.supplierName || 'supplier'} for overdue delivery`,
        priority: 'high'
      });
    }
    return tasks;
  },

  supplierIssueLabel(type) {
    return ({ shortage: 'Shortage', damage: 'Damage', returned: 'Return pending', note: 'Follow-up needed' })[type] || 'Supplier issue';
  },

  async loadRetentionTasks() {
    if (typeof DB.getRetentionRecords !== 'function') return [];
    let records = [];
    try { records = await DB.getRetentionRecords({}); } catch (e) { return []; }
    const today = new Date();
    const dueRecords = records.filter(record => !['completed', 'cancelled'].includes(record.status) && record.dueAt && new Date(record.dueAt) <= today);
    const customerIds = [...new Set(dueRecords.map(record => record.customerId).filter(Boolean))];
    const customers = new Map();
    try { for (const customer of await DB.getCustomersByIds(customerIds)) customers.set(customer.id, customer); } catch (e) {}
    return dueRecords.map(record => ({
      kind: 'retention', derivedKey: `retention:due:${record.id}`, retentionRecord: record,
      customer: customers.get(record.customerId) || null, due: true, inDays: 0,
      daysLabel: Utils.formatDate(record.dueAt, 'short'), action: this.retentionActionLabel(record.type), priority: 'normal'
    }));
  },

  retentionActionLabel(type) {
    return ({ satisfaction_check: 'Check customer satisfaction', review_request: 'Request a review', referral: 'Follow up a referral', warranty: 'Warranty action due', service: 'Service reminder due', repeat_opportunity: 'Repeat-work opportunity due' })[type] || 'Aftercare action due';
  },

  async getDueCount() {
    try {
      const tasks = (await this.loadTasks()).filter(t => t.due);
      return tasks.length;
    } catch (e) {
      console.warn('Followups: due count failed', e);
      return 0;
    }
  },

  render() {
    this.renderStylesOnce();
    return this.renderAsync();
  },

  async renderAsync() {
    const tasks = await this.loadTasks();
    const metrics = await this.communicationMetrics();
    const due = tasks.filter(t => t.due);
    const snoozed = tasks.filter(t => t.snoozed);
    const later = tasks.filter(t => !t.due && !t.snoozed);

    due.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));

    return `
      <div class="fade-in">
        ${App.renderTopHeader({ title: 'Follow-ups', actions: `<button class="btn btn-outline btn-sm followups-header-action" title="Open leads" aria-label="Open leads" data-action="App.navigate" data-args='${JSON.stringify(["leads"])}'><span aria-hidden="true" class="material-symbols-rounded fs-18">inbox</span><span class="header-action-text">Leads</span></button><button class="btn btn-primary btn-sm followups-header-action" title="Create new task" aria-label="Create new task" data-action="FollowupsFeature.openNewTask"><span aria-hidden="true" class="material-symbols-rounded fs-18">add</span><span class="header-action-text">New task</span></button>` })}
        <div class="px-md pb-lg" >
          <p class="fs-13 text-secondary mb-md">Choose the next action. Messages stay drafts until you review and send them.</p>
          <button class="btn btn-outline btn-sm mb-md" data-action="TalkFeature.openSavedDrafts">Resume saved messages</button>
          ${due.length === 0 && later.length === 0 && snoozed.length === 0 ? `
            <div class="empty-state empty-state-lg" >
              <span aria-hidden="true" class="material-symbols-rounded">mark_email_read</span>
              <div class="fw-600 mb-xs" >All caught up.</div>
              <div class="fs-13" >No pending follow-ups. New visit reminders and tasks will appear here.</div>
            </div>
          ` : ''}

          ${due.length ? `
            <div class="section-label" >Due now (${due.length})</div>
            ${due.map(t => this.renderTaskCard(t)).join('')}
          ` : ''}

          ${!due.length && (later.length || snoozed.length) ? '<p class="fw-600 mb-md">Nothing needs attention now. Your later and snoozed tasks are below.</p>' : ''}

          ${later.length ? `
            <details class="fup-group"><summary>Not due yet (${later.length})</summary>
            ${later.map(t => this.renderTaskCard(t, true)).join('')}
            </details>
          ` : ''}

          ${snoozed.length ? `
            <details class="fup-group"><summary>Snoozed (${snoozed.length})</summary>
            ${snoozed.map(t => this.renderTaskCard(t, true)).join('')}
            </details>
          ` : ''}

          ${metrics.obligations ? `<details class="fup-group"><summary>Communication history · ${metrics.missed} unconfirmed by deadline</summary><p class="fs-13 text-secondary">${metrics.missedRate}% lacked a recorded send by the deadline${metrics.recovered ? ` · ${metrics.recovered} recovered before the visit` : ''}. Historical records, not current tasks or proof that a message was never sent.</p>${metrics.archive.slice(0, 5).map(item => `<div class="fs-12 text-secondary mt-6">${Utils.escapeHtml(item.appointment.clientName || 'Customer')} · ${Utils.escapeHtml(item.type.replace(/_/g, ' '))} · ${Utils.formatDate(item.dueAt, 'short')}</div>`).join('')}</details>` : ''}

          <div class="mt-20" >
            <div class="divider-text">Quick opens</div>
            <div class="grid-2 gap-sm" >
              <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(["orders"])}'><span aria-hidden="true" class="material-symbols-rounded">view_kanban</span>Orders board</button>
              <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(["talk"])}'><span aria-hidden="true" class="material-symbols-rounded">chat</span>Messages</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderTaskCard(task, muted = false) {
    const customer = task.customer;
    const name = Utils.escapeHtml(
      (task.durable && !task.sourceSuggestion ? task.title : '') ||
      customer?.fullName ||
      (customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : '') ||
      (task.appointment?.clientName ? String(task.appointment.clientName) : '') ||
      (task.durable ? 'Task' : 'Unknown')
    );

    // When a task isn't due yet, say when it becomes due - the muted list
    // previously showed only "Xd ago", which hid the actual trigger date
    // (e.g. "chase in 2d" for a quote gated by Talk's timing rules).
    const dueIn = (muted && task.inDays > 0) ? ` · due in ${task.inDays}d` : '';
    const meta = task.appointment
      ? `${Utils.formatDate(task.appointment.date, 'short')} · ${task.daysLabel}${dueIn}`
      : (task.order ? `${Utils.escapeHtml(task.order.orderNumber || 'Order')} · ${task.daysLabel}${dueIn}` : `${task.daysLabel || ''}${dueIn}`);

    const icons = { quote: 'receipt_long', structured_quote: 'request_quote', quote_expiring: 'event_busy', quote_accepted: 'task_alt', job_issue: 'construction', supplier_issue: 'local_shipping', retention: 'handshake', invoice_overdue: 'request_quote', payment: 'payments', visit_today: 'event_available', visit_tomorrow: 'event', intro: 'waving_hand', intro_confirmation: 'mark_chat_unread', post_fit: 'handyman', service: 'build', };
    // Border colour = what the task needs from you. Payment and service issues
    // are urgent (warning/danger); today's visits and intros are primary
    // actions; everything else (quote chases, post-fit thank-yous,
    // tomorrow's reminders) is routine and renders neutral - previously the
    // final ternary collapsed to danger, so routine tasks screamed "urgent".
    const accent = task.kind === 'payment' ? 'var(--warning)'
      : (task.kind === 'visit_today' || task.kind === 'intro') ? 'var(--accent)'
      : task.kind === 'service' ? 'var(--danger)'
      : 'var(--text-secondary)';

    return `
      <article class="fup-card${muted ? ' fup-card--muted' : ''}" style="border-left:3px solid ${accent};" aria-label="Follow-up: ${name}">
        <div class="flex items-start gap-12" >
          <span aria-hidden="true" class="material-symbols-rounded" style="color:${accent};margin-top:2px;">${icons[task.kind] || 'campaign'}</span>
          <div class="flex-1 min-w-0" >
            <div class="flex items-center gap-sm" >
              <span class="fw-600 fs-15 fup-name" >${name}</span>
              ${task.kind === 'payment' ? '<span class="badge badge-warning fs-10 shrink-0" >Payment</span>' : ''}
              ${task.kind === 'visit_today' ? '<span class="badge badge-primary fs-10 shrink-0" >Today</span>' : ''}
              ${task.kind === 'intro' ? '<span class="badge badge-primary fs-10 shrink-0" >First visit</span>' : ''}
              ${task.kind === 'post_fit' ? '<span class="badge badge-success fs-10 shrink-0" >Post-fit</span>' : ''}
              ${task.kind === 'service' ? '<span class="badge badge-danger fs-10 shrink-0" >Service</span>' : ''}
              ${task.priority === 'high' ? '<span class="badge badge-danger fs-10 shrink-0" >High</span>' : ''}
            </div>
            <div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(task.durable && !task.sourceSuggestion ? (task.notes || 'Personal reminder') : task.action)}</div>
            <div class="fs-12 text-tertiary mt-2" >${meta}</div>
          </div>
        </div>
        <div class="fup-primary mt-10">
          ${task.durable && !task.sourceSuggestion ? `<button class="btn btn-sm btn-primary" aria-label="Complete ${name}" data-action="FollowupsFeature.completeDurableTask" data-args='${JSON.stringify([task.id])}'><span aria-hidden="true" class="material-symbols-rounded fs-16">done</span>Mark done</button>` : this.renderPrimaryAction(task.sourceSuggestion || task)}
        </div>
        ${task.appointment && ['intro','intro_confirmation','visit_tomorrow','post_fit','service'].includes(task.kind) ? `<button class="btn btn-outline btn-block mt-sm" data-action="FollowupsFeature.openAlreadySent" data-args='${Utils.escapeHtml(JSON.stringify([task.appointment.id,task.template]))}'>Already sent…</button>` : ''}
        <details class="fup-options"><summary aria-label="More options for ${name}">More options</summary><div class="flex gap-sm mt-10">
          ${task.appointment && ['intro', 'intro_confirmation', 'visit_tomorrow'].includes(task.kind) ? `<button class="btn btn-sm btn-outline" data-action="FollowupsFeature.openContactOutcome" data-args='${JSON.stringify([task.appointment.id])}'>Record phone contact</button>` : ''}
          ${task.appointment ? `<button class="btn btn-sm btn-outline" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: task.appointment.id}])}'>Open visit</button>` : ''}
          ${task.kind === 'payment' && task.order?.appointmentId ? `<button class="btn btn-sm btn-outline" data-action="OrdersFeature.paymentMessage" data-args='${JSON.stringify([task.order.id])}'>Review payment message</button>` : ''}
          ${task.durable && task.sourceSuggestion ? `<button class="btn btn-sm btn-outline" aria-label="Complete ${name}" data-action="FollowupsFeature.completeDurableTask" data-args='${JSON.stringify([task.id])}'>Mark task done</button>` : ''}
          <button class="btn btn-sm btn-outline" aria-label="Snooze ${name}" data-action="FollowupsFeature.openSnooze" data-args='${JSON.stringify([task.durable ? task.id : null, task.derivedKey])}'><span aria-hidden="true" class="material-symbols-rounded fs-16">snooze</span>Snooze</button>
          ${task.customer ? `<button class="btn btn-ghost btn-sm" aria-label="Open customer profile" data-action="App.navigate" data-args='${JSON.stringify(["customer", {id: (task.customer.id)}])}'><span aria-hidden="true" class="material-symbols-rounded fs-18" >person</span></button>` : ''}
        </div></details>
      </article>
    `;
  },

  renderPrimaryAction(task) {
    if (task.kind === 'send_confirmation') return `<button class="btn btn-primary btn-block" data-action="TalkFeature.openSentConfirmation" data-args='${JSON.stringify([task.communicationId])}'>Record whether sent</button>`;
    if (task.retentionRecord) {
      return `<button class="btn btn-sm btn-primary flex-1" data-action="App.navigate" data-args='${JSON.stringify(["retention", {customerId: task.retentionRecord.customerId}])}'><span aria-hidden="true" class="material-symbols-rounded fs-16">handshake</span>Open aftercare</button>`;
    }
    if (task.purchaseOrder) {
      return `<button class="btn btn-sm btn-primary flex-1" data-action="App.navigate" data-args='${JSON.stringify(["suppliers", {id: task.purchaseOrder.id}])}'><span aria-hidden="true" class="material-symbols-rounded fs-16">local_shipping</span>Open supplier order</button>`;
    }
    if (task.invoice) {
      return `<button class="btn btn-sm btn-primary flex-1" data-action="App.navigate" data-args='${JSON.stringify(["invoices", {id: task.invoice.id}])}'><span aria-hidden="true" class="material-symbols-rounded fs-16">request_quote</span>Open invoice</button>`;
    }
    if (task.job) {
      return `<button class="btn btn-sm btn-primary flex-1" data-action="App.navigate" data-args='${JSON.stringify(["jobs", {id: task.job.id}])}'><span aria-hidden="true" class="material-symbols-rounded fs-16">construction</span>Open job</button>`;
    }
    if (task.quote) {
      return `<button class="btn btn-sm btn-primary flex-1" data-action="App.navigate" data-args='${JSON.stringify(["quotes", {id: task.quote.id}])}'><span aria-hidden="true" class="material-symbols-rounded fs-16">${task.kind === 'quote_accepted' ? 'shopping_cart' : 'visibility'}</span>${task.kind === 'quote_accepted' ? 'Review & convert' : 'Review quote'}</button>`;
    }
    if (task.kind === 'quote') {
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="TalkFeature.sendMessage" data-args='${Utils.escapeHtml(JSON.stringify([(task.appointment.id), task.template]))}'>
          <span aria-hidden="true" class="material-symbols-rounded fs-16" >edit_note</span>Review follow-up
        </button>
      `;
    }
    if (task.kind === 'payment') {
      const order = task.order;
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="OrdersFeature.openOrderSheet" data-args='${JSON.stringify([(order.id)])}'>
          <span aria-hidden="true" class="material-symbols-rounded fs-16" >payments</span>Review payment
        </button>
      `;
    }
    if (task.kind === 'visit_today') {
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (task.appointment.id)}])}'>
          <span aria-hidden="true" class="material-symbols-rounded fs-16" >fact_check</span>Log outcome
        </button>
      `;
    }
    if (task.kind === 'intro' || task.kind === 'intro_confirmation' || task.kind === 'post_fit' || task.kind === 'service') {
      const labels = { intro: 'Review introduction', intro_confirmation: 'Review introduction & confirmation', post_fit: 'Review thank-you', service: 'Review acknowledgement' };
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="${['intro', 'intro_confirmation'].includes(task.kind) ? 'FollowupsFeature.reviewPreVisit' : 'TalkFeature.sendMessage'}" data-args='${Utils.escapeHtml(JSON.stringify(['intro', 'intro_confirmation'].includes(task.kind) ? [task.appointment.id] : [task.appointment.id, task.template]))}'>
          <span aria-hidden="true" class="material-symbols-rounded fs-16" >edit_note</span>${labels[task.kind]}
        </button>
      `;
    }
    return `
      <button class="btn btn-sm btn-primary flex-1"  data-action="FollowupsFeature.reviewPreVisit" data-args='${JSON.stringify([(task.appointment.id)])}'>
        <span aria-hidden="true" class="material-symbols-rounded fs-16" >edit_note</span>Review reminder
      </button>
    `;
  },

  async openAlreadySent(appointmentId, template) {
    const revision = App._navigationRevision;
    const visit = await DB.getAppointment(Number(appointmentId));
    if (App._navigationRevision !== revision) return;
    if (!visit) return Toast.show('Visit no longer available','error');
    const choices = template === 'intro_day_before' ? ['pre_intro','intro_day_before','day_before'] : [template];
    if (choices.some(key=>!DB.communicationSendFlags(key).length)) return Toast.show('This message purpose is unavailable','error');
    this.pendingAlreadySent = { appointmentId:visit.id, choices, snapshot:DB.visitContactSnapshot(visit), operationId:TaskService.operationId('already-sent',visit.id) };
    App.openModal(`<div class="sheet-header"><h3>Record an already-sent message</h3><button class="btn btn-ghost" aria-label="Close already-sent form" data-action="App.closeModal">Close</button></div><div class="sheet-body"><p>${Utils.escapeHtml(visit.clientName || 'Customer')} · ${Utils.escapeHtml(Utils.formatDate(visit.date,'long'))} · ${Utils.escapeHtml(TalkFeature.apptTimeText(visit))}</p><p>Record only what you actually sent. This sends nothing and does not mean the customer confirmed the appointment.</p><label for="already-sent-purpose">Which message did you send?</label><select id="already-sent-purpose" class="select">${choices.map(key=>`<option value="${key}">${Utils.escapeHtml(CommunicationService.purposeLabel(key))}</option>`).join('')}</select><p class="fs-13 text-secondary">Introduction only leaves any needed visit reminder available. Recorded now as your confirmation; original message text is not captured.</p><p id="already-sent-error" role="alert"></p><button class="btn btn-primary btn-block" data-action="FollowupsFeature.saveAlreadySent">Yes, I already sent this</button></div>`);
    this._alreadySentOwner = { pending:this.pendingAlreadySent, revision, element:document.getElementById('already-sent-error') };
  },

  async saveAlreadySent() {
    const pending = this.pendingAlreadySent;
    if (!pending || this._savingAlreadySent || !this.ownsAlreadySent(pending)) return;
    const template = document.getElementById('already-sent-purpose')?.value;
    if (!pending.choices.includes(template)) return;
    this._savingAlreadySent = true;
    try {
      await DB.recordPreviouslySent(pending.appointmentId,template,pending.snapshot,pending.operationId);
      if (this.ownsAlreadySent(pending)) {
        this.pendingAlreadySent = null;App.closeModal();Toast.show('Recorded as sent by you','success');
        if (['followups','today'].includes(App.currentFeature?.id)) App.navigate(App.currentHash || App.currentFeature.id);
      }
    } catch(error) {if(this.ownsAlreadySent(pending))this._alreadySentOwner.element.textContent=error.message;Toast.show('Not updated. Please retry.','error');}
    finally {this._savingAlreadySent=false;}
  },

  ownsAlreadySent(pending) {
    const owner = this._alreadySentOwner;
    return owner?.pending === pending && this.pendingAlreadySent === pending &&
      owner.revision === App._navigationRevision && owner.element &&
      owner.element === document.getElementById('already-sent-error');
  },

  openNewTask() {
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('task-notes', []);
    App.openModal(`
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h3>New task</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span aria-hidden="true" class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="form-group"><label for="task-title">What needs doing?</label><input class="input" id="task-title" maxlength="160" autocomplete="off" required></div>
        <div class="form-group"><label for="task-due">Due</label><input class="input" id="task-due" type="datetime-local" value="${tomorrow.toISOString().slice(0, 16)}" required></div>
        <div class="form-group"><label for="task-priority">Priority</label><select class="select" id="task-priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></div>
        <div class="form-group"><label for="task-notes">Notes (optional)</label><textarea class="textarea" id="task-notes" maxlength="500"></textarea>${typeof NoteCapture !== 'undefined' ? NoteCapture.render('task-notes') : ''}</div>
        <button class="btn btn-primary btn-block" data-action="FollowupsFeature.saveNewTask">Save task</button>
      </div>`);
  },

  async saveNewTask() {
    const button = document.querySelector('[data-action="FollowupsFeature.saveNewTask"]');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      await TaskService.create({
        title: document.getElementById('task-title')?.value,
        dueAt: document.getElementById('task-due')?.value,
        priority: document.getElementById('task-priority')?.value,
        notes: document.getElementById('task-notes')?.value || '',
        audioNotes: typeof NoteCapture !== 'undefined' ? NoteCapture.getRecordings('task-notes') : [],
        type: 'other'
      });
      App.closeModal(); Toast.show('Task saved', 'success'); App.navigate('followups');
    } catch (e) { Toast.show(e.message || 'Could not save task', 'error'); if (button) button.disabled = false; }
  },

  async completeDurableTask(id) {
    this.pendingMutations = this.pendingMutations || new Set();
    if (this.pendingMutations.has(`complete:${id}`)) return;
    this.pendingMutations.add(`complete:${id}`);
    try { await TaskService.complete(id); Toast.show('Task completed', 'success'); App.navigate('followups'); }
    catch (e) { Toast.show(e.message || 'Could not complete task', 'error'); }
    finally { this.pendingMutations.delete(`complete:${id}`); }
  },

  async openSnooze(id, derivedKey) {
    const tasks = await this.loadTasks();
    const task = id ? tasks.find(t => t.id === id && t.durable) : tasks.find(t => t.derivedKey === derivedKey && !t.durable);
    if (!task) return Toast.show('Task is no longer available', 'info');
    this.pendingSnoozeTask = task;
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    App.openModal(`
      <div class="sheet-handle"></div><div class="sheet-header"><h3>Snooze task</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span aria-hidden="true" class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body"><div class="form-group"><label for="task-snooze-until">Remind me</label><input class="input" id="task-snooze-until" type="datetime-local" value="${tomorrow.toISOString().slice(0, 16)}" required></div><button class="btn btn-primary btn-block" data-action="FollowupsFeature.confirmSnooze">Snooze</button></div>`);
  },

  async confirmSnooze() {
    const task = this.pendingSnoozeTask;
    if (!task) return;
    this.pendingMutations = this.pendingMutations || new Set();
    const key = `snooze:${task.id || task.derivedKey}`;
    if (this.pendingMutations.has(key)) return;
    this.pendingMutations.add(key);
    try {
      await TaskService.snooze(task, document.getElementById('task-snooze-until')?.value);
      this.pendingSnoozeTask = null; App.closeModal(); Toast.show('Task snoozed', 'success'); App.navigate('followups');
    } catch (e) { Toast.show(e.message || 'Could not snooze task', 'error'); }
    finally { this.pendingMutations.delete(key); }
  },

  renderStylesOnce() {
    if (document.getElementById('fup-styles')) return;
    const style = document.createElement('style');
    style.id = 'fup-styles';
    style.textContent = `
      .fup-card {
        background: var(--surface);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        padding: 12px 14px;
        margin-bottom: 8px;
      }
      .fup-primary > .btn { width: 100%; white-space: normal; min-height: 44px; }
      .fup-name { overflow-wrap: anywhere; }
      .fup-options summary { cursor: pointer; padding: 12px 0 2px; font-size: 13px; color: var(--text-secondary); }
      .fup-options > div { flex-wrap: wrap; }
      .fup-group { margin: 16px 0; }
      .fup-group > summary { cursor: pointer; padding: 12px 0; font-weight: 600; }
    `;
    document.head.appendChild(style);
  }
};

App.registerFeature(FollowupsFeature);
