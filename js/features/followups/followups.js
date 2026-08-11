/* ============================================
   ADVISOROS v5.0 — FOLLOW-UPS / TASK INBOX
   A single "due today" inbox so the follow-up
   scheduler has a visible home:
     · quote chases  (visit outcomes, gated by Talk's
       learned/configured timing)
     · payment reminders (orders with balance due)
     · today's visits still needing an outcome
     · tomorrow's visits needing their day-before message
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
    try { pipeline = await DB.getPipeline(); } catch (e) {}
    try { orders = await DB.db.orders.toArray(); } catch (e) {}
    try { upcoming = await DB.getUpcomingAppointments(5); } catch (e) {}

    const customerIds = [...new Set([
      ...pipeline.map(a => a.customerId).filter(Boolean),
      ...orders.map(o => o.customerId).filter(Boolean),
      ...upcoming.map(a => a.customerId).filter(Boolean)
    ])];
    const customerMap = new Map();
    if (customerIds.length) {
      try {
        const fetched = await DB.db.customers.bulkGet(customerIds);
        for (const c of fetched) if (c) customerMap.set(c.id, c);
      } catch (e) {}
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayKey = d => new Date(d).toDateString();

    const tasks = [];

    // 1. Quote chases from visit outcomes (Talk's timing rules).
    const upcomingIds = new Set(upcoming.map(a => a.id));
    for (const appt of pipeline) {
      if (upcomingIds.has(appt.id)) continue;
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

    // 3. Today's visits still needing an outcome logged.
    for (const appt of upcoming) {
      if (appt.status !== 'confirmed' || appt.outcome) continue;
      if (dayKey(appt.date) !== dayKey(now)) continue;
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
      if (dayKey(appt.date) !== dayKey(tomorrow)) continue;
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
        <div class="top-header">
          <h1 style="flex:1;text-align:center;font-size:18px;">Follow-ups</h1>
        </div>
        <div style="padding:0 16px 24px;">
          ${due.length === 0 && later.length === 0 ? `
            <div class="empty-state" style="padding:48px 24px;">
              <span class="material-symbols-rounded">mark_email_read</span>
              <div style="font-weight:600;margin-bottom:4px;">All caught up.</div>
              <div style="font-size:13px;">Quotes to chase, payments to collect and visit reminders will all land here when they're due.</div>
            </div>
          ` : ''}

          ${due.length ? `
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">Due now (${due.length})</div>
            ${due.map(t => this.renderTaskCard(t)).join('')}
          ` : ''}

          ${later.length ? `
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">Not due yet (${later.length})</div>
            ${later.map(t => this.renderTaskCard(t, true)).join('')}
          ` : ''}

          <div style="margin-top:20px;">
            <div class="divider-text">Quick opens</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
              <button class="btn btn-outline btn-sm" onclick="App.navigate('orders')"><span class="material-symbols-rounded">view_kanban</span>Orders board</button>
              <button class="btn btn-outline btn-sm" onclick="App.navigate('talk')"><span class="material-symbols-rounded">chat</span>Talk</button>
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

    const meta = task.appointment
      ? `${Utils.formatDate(task.appointment.date, 'short')} · ${task.daysLabel}`
      : (task.order ? `${Utils.escapeHtml(task.order.orderNumber || 'Order')} · ${task.daysLabel}` : task.daysLabel);

    const icons = { quote: 'receipt_long', payment: 'payments', visit_today: 'event_available', visit_tomorrow: 'event', };
    const accent = task.kind === 'payment' ? 'var(--warning)' : task.kind === 'visit_today' ? 'var(--primary)' : 'var(--danger)';

    return `
      <div class="fup-card" style="border-left:3px solid ${accent};opacity:${muted ? '0.65' : '1'};">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span class="material-symbols-rounded" style="color:${accent};margin-top:2px;">${icons[task.kind] || 'campaign'}</span>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
              ${task.kind === 'payment' ? '<span class="badge badge-warning" style="font-size:10px;flex-shrink:0;">Payment</span>' : ''}
              ${task.kind === 'visit_today' ? '<span class="badge badge-primary" style="font-size:10px;flex-shrink:0;">Today</span>' : ''}
              ${task.priority === 'high' ? '<span class="badge badge-danger" style="font-size:10px;flex-shrink:0;">High</span>' : ''}
            </div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${Utils.escapeHtml(task.action)}</div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">${meta}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          ${this.renderPrimaryAction(task)}
          ${task.customer ? `<button class="btn btn-ghost btn-sm" aria-label="Open customer profile" onclick="App.navigate('customer', {id: ${task.customer.id}})"><span class="material-symbols-rounded" style="font-size:18px;">person</span></button>` : ''}
        </div>
      </div>
    `;
  },

  renderPrimaryAction(task) {
    if (task.kind === 'quote') {
      return `
        <button class="btn btn-sm btn-primary" style="flex:1;" onclick="TalkFeature.sendMessage(${task.appointment.id}, '${Utils.escapeJsString(task.template)}')">
          <span class="material-symbols-rounded" style="font-size:16px;">send</span>Follow up
        </button>
        <button class="btn btn-sm btn-outline" style="flex:1;" onclick="App.navigate('appointments', {id: ${task.appointment.id}})">Visit</button>
      `;
    }
    if (task.kind === 'payment') {
      const order = task.order;
      return `
        <button class="btn btn-sm btn-primary" style="flex:1;" onclick="OrdersFeature.openOrderSheet(${order.id})">
          <span class="material-symbols-rounded" style="font-size:16px;">payments</span>Collect
        </button>
        ${order.appointmentId ? `
          <button class="btn btn-sm btn-outline" style="flex:1;" onclick="OrdersFeature.paymentMessage(${order.id})">
            <span class="material-symbols-rounded" style="font-size:16px;">send</span>Message
          </button>
        ` : ''}
      `;
    }
    if (task.kind === 'visit_today') {
      return `
        <button class="btn btn-sm btn-primary" style="flex:1;" onclick="App.navigate('appointments', {id: ${task.appointment.id}})">
          <span class="material-symbols-rounded" style="font-size:16px;">fact_check</span>Log outcome
        </button>
      `;
    }
    return `
      <button class="btn btn-sm btn-primary" style="flex:1;" onclick="TalkFeature.sendDayBefore(${task.appointment.id})">
        <span class="material-symbols-rounded" style="font-size:16px;">send</span>Send reminder
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