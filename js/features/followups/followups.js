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

  async loadTasks() {
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
    // getUpcomingAppointments starts at "now", so a visit earlier today would
    // never surface — pull the full day separately for the outcome tasks.
    try { todayAppts = await DB.getAppointmentsForDate(now.toISOString()); } catch (e) {}
    try { allAppts = await DB.getAllAppointments(); } catch (e) {}
    // Intro messages apply to ANY distance of booking, not just the next few
    // days — otherwise a visit booked 2-3 weeks out (common for renovations)
    // gets no intro task and its customer is never messaged.
    try { futureAppts = await DB.getUpcomingAppointments(60); } catch (e) {}

    const customerIds = [...new Set([
      ...pipeline.map(a => a.customerId).filter(Boolean),
      ...orders.map(o => o.customerId).filter(Boolean),
      ...upcoming.map(a => a.customerId).filter(Boolean),
      ...todayAppts.map(a => a.customerId).filter(Boolean)
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
    // UK-anchored tomorrow: building a Date from the UK wall-clock fields
    // with new Date(y, m-1, d+1) uses the DEVICE's local midnight, so on an
    // east-of-UTC device (e.g. UTC+14) that instant still lands on today's
    // UK day and every visit_tomorrow task silently vanishes. getTomorrow()
    // returns tomorrow's UK midnight instant regardless of the device TZ.
    const tomorrowKey = ukDayKey(Utils.getTomorrow());

    const tasks = [];

    // 1. Quote chases from visit outcomes (Talk's timing rules).
    const skippableIds = new Set([...upcoming, ...todayAppts].map(a => a.id));
    for (const appt of pipeline) {
      if (skippableIds.has(appt.id)) continue;
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

    // 3. Today's visits still needing an outcome logged — from the full-day
    //    list, not "upcoming" (that window starts at now).
    for (const appt of todayAppts) {
      if (appt.status !== 'confirmed' || appt.outcome) continue;
      if (ukDayKey(appt.date) !== todayKey) continue;
      tasks.push({
        kind: 'visit_today',
        due: true,
        daysLabel: Utils.formatTime(appt.date),
        appointment: appt,
        customer: appt.customerId ? customerMap.get(appt.customerId) : null,
        action: 'Outcome not logged yet',
        priority: 'normal',
        inDays: 0
      });
    }

    // 4. Tomorrow's visits needing their day-before message.
    for (const appt of upcoming) {
      if (appt.status !== 'confirmed' || appt.dayBeforeSent) continue;
      if (ukDayKey(appt.date) !== tomorrowKey) continue;
      if (!appt.phone && !appt.customerId) continue;
      tasks.push({
        kind: 'visit_tomorrow',
        due: true,
        daysLabel: Utils.formatTime(appt.date),
        appointment: appt,
        customer: appt.customerId ? customerMap.get(appt.customerId) : null,
        action: 'Day-before reminder not sent',
        priority: 'normal',
        inDays: 0
      });
    }

    // 5. Intro messages (communication spec): first-time customers' upcoming
    //    bookings — no prior non-cancelled visit at this address — that
    //    haven't had their intro sent. One task per customer, for the
    //    earliest booking. appts without a customerId (e.g. phone conversions
    //    typed straight onto the visit) are treated as first-time too.
    const firstVisitByCustomer = {};
    try {
      for (const a of allAppts) {
        if (!a.customerId || !a.date) continue;
        if (a.status === 'cancelled') continue;
        if (new Date(a.date) >= now) continue;
        const key = Utils.formatDate(a.date, 'iso');
        (firstVisitByCustomer[a.customerId] = firstVisitByCustomer[a.customerId] || new Set()).add(key);
      }
    } catch (e) { /* treat everyone as first-time */ }
    const isFirstVisit = id => !(id && firstVisitByCustomer[id]?.size);

    const introCandidates = [...futureAppts, ...todayAppts]
      .filter(a => a.status === 'confirmed' && !a.introSent && (a.phone || a.customerId))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const introSeen = new Set();
    for (const appt of introCandidates) {
      if (appt.customerId) {
        if (introSeen.has(appt.customerId)) continue;
        introSeen.add(appt.customerId);
      }
      if (!isFirstVisit(appt.customerId)) continue;
      tasks.push({
        kind: 'intro',
        due: true,
        // Time only: the card's meta line already prefixes the date, so a
        // date here too would render "16 Aug · 16 Aug · 04:02".
        daysLabel: TalkFeature.apptTimeText(appt),
        appointment: appt,
        customer: appt.customerId ? customerMap.get(appt.customerId) : null,
        template: 'pre_intro',
        action: 'Intro message for first visit — not sent yet',
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
    const coveredIds = new Set([...upcoming, ...todayAppts].map(a => a.id));
    for (const appt of allAppts) {
      const daysAgo = Utils.daysBetween(now, new Date(appt.date));
      if (daysAgo < 0 || daysAgo > 14) continue;
      if (coveredIds.has(appt.id)) continue;
      if (appt.status === 'cancelled') continue;
      if (appt.type === 'fitting' && appt.outcome === 'completed' && !appt.postFitSent) {
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
      } else if ((appt.type === 'fitting' || appt.type === 'service_call') && serviceFailures.has(appt.outcome) && !appt.serviceSent) {
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
    const due = tasks.filter(t => t.due);
    const later = tasks.filter(t => !t.due);

    due.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));

    return `
      <div class="fade-in">
        ${App.renderTopHeader({ title: 'Follow-ups' })}
        <div class="px-md pb-lg" >
          ${due.length === 0 && later.length === 0 ? `
            <div class="empty-state empty-state-lg" >
              <span class="material-symbols-rounded">mark_email_read</span>
              <div class="fw-600 mb-xs" >All caught up.</div>
              <div class="fs-13" >Quotes to chase, payments to collect and visit reminders will all land here when they're due.</div>
            </div>
          ` : ''}

          ${due.length ? `
            <div class="section-label" >Due now (${due.length})</div>
            ${due.map(t => this.renderTaskCard(t)).join('')}
          ` : ''}

          ${later.length ? `
            <div class="section-label" >Not due yet (${later.length})</div>
            ${later.map(t => this.renderTaskCard(t, true)).join('')}
          ` : ''}

          <div class="mt-20" >
            <div class="divider-text">Quick opens</div>
            <div class="grid-2 gap-sm" >
              <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(["orders"])}'><span class="material-symbols-rounded">view_kanban</span>Orders board</button>
              <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(["talk"])}'><span class="material-symbols-rounded">chat</span>Messages</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderTaskCard(task, muted = false) {
    const customer = task.customer;
    const name = Utils.escapeHtml(
      customer?.fullName ||
      (customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : '') ||
      (task.appointment?.clientName ? String(task.appointment.clientName) : '') ||
      'Unknown'
    );

    // When a task isn't due yet, say when it becomes due - the muted list
    // previously showed only "Xd ago", which hid the actual trigger date
    // (e.g. "chase in 2d" for a quote gated by Talk's timing rules).
    const dueIn = (muted && task.inDays > 0) ? ` · due in ${task.inDays}d` : '';
    const meta = task.appointment
      ? `${Utils.formatDate(task.appointment.date, 'short')} · ${task.daysLabel}${dueIn}`
      : (task.order ? `${Utils.escapeHtml(task.order.orderNumber || 'Order')} · ${task.daysLabel}${dueIn}` : task.daysLabel);

    const icons = { quote: 'receipt_long', payment: 'payments', visit_today: 'event_available', visit_tomorrow: 'event', intro: 'waving_hand', post_fit: 'handyman', service: 'build', };
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
      <div class="fup-card" style="border-left:3px solid ${accent};opacity:${muted ? '0.65' : '1'};">
        <div class="flex items-start gap-12" >
          <span class="material-symbols-rounded" style="color:${accent};margin-top:2px;">${icons[task.kind] || 'campaign'}</span>
          <div class="flex-1 min-w-0" >
            <div class="flex items-center gap-sm" >
              <span class="fw-600 fs-15 ellipsis" >${name}</span>
              ${task.kind === 'payment' ? '<span class="badge badge-warning fs-10 shrink-0" >Payment</span>' : ''}
              ${task.kind === 'visit_today' ? '<span class="badge badge-primary fs-10 shrink-0" >Today</span>' : ''}
              ${task.kind === 'intro' ? '<span class="badge badge-primary fs-10 shrink-0" >First visit</span>' : ''}
              ${task.kind === 'post_fit' ? '<span class="badge badge-success fs-10 shrink-0" >Post-fit</span>' : ''}
              ${task.kind === 'service' ? '<span class="badge badge-danger fs-10 shrink-0" >Service</span>' : ''}
              ${task.priority === 'high' ? '<span class="badge badge-danger fs-10 shrink-0" >High</span>' : ''}
            </div>
            <div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(task.action)}</div>
            <div class="fs-12 text-tertiary mt-2" >${meta}</div>
          </div>
        </div>
        <div class="flex gap-sm mt-10" >
          ${this.renderPrimaryAction(task)}
          ${task.customer ? `<button class="btn btn-ghost btn-sm" aria-label="Open customer profile" data-action="App.navigate" data-args='${JSON.stringify(["customer", {id: (task.customer.id)}])}'><span class="material-symbols-rounded fs-18" >person</span></button>` : ''}
        </div>
      </div>
    `;
  },

  renderPrimaryAction(task) {
    if (task.kind === 'quote') {
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="TalkFeature.sendMessage" data-args='${JSON.stringify([(task.appointment.id), Utils.escapeJsString(task.template)])}'>
          <span class="material-symbols-rounded fs-16" >send</span>Follow up
        </button>
        <button class="btn btn-sm btn-outline flex-1"  data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (task.appointment.id)}])}'>Visit</button>
      `;
    }
    if (task.kind === 'payment') {
      const order = task.order;
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="OrdersFeature.openOrderSheet" data-args='${JSON.stringify([(order.id)])}'>
          <span class="material-symbols-rounded fs-16" >payments</span>Collect
        </button>
        ${order.appointmentId ? `
          <button class="btn btn-sm btn-outline flex-1"  data-action="OrdersFeature.paymentMessage" data-args='${JSON.stringify([(order.id)])}'>
            <span class="material-symbols-rounded fs-16" >send</span>Message
          </button>
        ` : ''}
      `;
    }
    if (task.kind === 'visit_today') {
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (task.appointment.id)}])}'>
          <span class="material-symbols-rounded fs-16" >fact_check</span>Log outcome
        </button>
      `;
    }
    if (task.kind === 'intro' || task.kind === 'post_fit' || task.kind === 'service') {
      const labels = { intro: 'Send intro', post_fit: 'Send thank-you', service: 'Acknowledge' };
      return `
        <button class="btn btn-sm btn-primary flex-1"  data-action="TalkFeature.sendMessage" data-args='${JSON.stringify([(task.appointment.id), Utils.escapeJsString(task.template)])}'>
          <span class="material-symbols-rounded fs-16" >send</span>${labels[task.kind]}
        </button>
        <button class="btn btn-sm btn-outline flex-1"  data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (task.appointment.id)}])}'>Visit</button>
      `;
    }
    return `
      <button class="btn btn-sm btn-primary flex-1"  data-action="TalkFeature.sendDayBefore" data-args='${JSON.stringify([(task.appointment.id)])}'>
        <span class="material-symbols-rounded fs-16" >send</span>Send reminder
      </button>
    `;
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
    `;
    document.head.appendChild(style);
  }
};

App.registerFeature(FollowupsFeature);