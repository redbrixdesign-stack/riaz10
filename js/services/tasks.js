/* Durable task orchestration. Persistence stays behind DB so the same
   behavior works with IndexedDB, backup/restore and the in-memory test DB. */
const TaskService = {
  now() { return new Date(); },

  derivedKey(task) {
    if (!task) return null;
    if (task.derivedKey || task.sourceKey) return task.derivedKey || task.sourceKey;
    const apptId = task.appointment?.id || task.appointmentId;
    const orderId = task.order?.id || task.orderId;
    if (task.kind === 'quote' && apptId) return `quote:appointment:${apptId}:${task.template || task.appointment?.outcome || 'follow-up'}`;
    if (task.kind === 'payment' && orderId) return `payment:order:${orderId}`;
    if (task.kind === 'visit_today' && apptId) return `visit-outcome:appointment:${apptId}`;
    if (task.kind === 'visit_tomorrow' && apptId) return `message:day-before:appointment:${apptId}`;
    if (task.kind === 'intro_confirmation' && apptId) return `message:intro-day-before:appointment:${apptId}`;
    if (task.kind === 'intro' && apptId) return `message:intro:appointment:${apptId}`;
    if (task.kind === 'post_fit' && apptId) return `message:post-fit:appointment:${apptId}`;
    if (task.kind === 'service' && apptId) return `message:service:appointment:${apptId}`;
    return null;
  },

  effectiveDue(task) {
    const due = task?.dueAt ? new Date(task.dueAt) : null;
    const snooze = task?.snoozedUntil ? new Date(task.snoozedUntil) : null;
    if (snooze && !isNaN(snooze) && (!due || isNaN(due) || snooze > due)) return snooze;
    return due && !isNaN(due) ? due : null;
  },

  isActive(task) { return task && !['completed', 'cancelled'].includes(task.status); },

  canonicalKey(key) {
    return String(key || '').replace(/^message:(intro|intro-day-before|day-before):appointment:/, 'message:previsit:appointment:');
  },

  contactEvidence(visit) {
    const history = (visit.contactOutcomes || []).filter(e => e.provenance === 'advisor_recorded' && e.channel === 'phone' && String(e.customerId || '') === String(visit.customerId || ''));
    const introduced = history.some(e => ['introduced', 'introduced_and_agreed'].includes(e.outcome));
    const snapshot = typeof DB.visitContactSnapshot === 'function' ? DB.visitContactSnapshot(visit) : null;
    const agreed = !!snapshot && history.some(e => e.bookingSnapshot === snapshot && ['visit_agreed', 'introduced_and_agreed'].includes(e.outcome));
    return { introduced, agreed };
  },

  decorateDurable(task, now = this.now()) {
    const effectiveDue = this.effectiveDue(task);
    const snoozeDate = task?.snoozedUntil ? new Date(task.snoozedUntil) : null;
    const snoozed = !!snoozeDate && !isNaN(snoozeDate) && snoozeDate > now;
    return {
      ...task,
      kind: task.kind || task.type || 'manual',
      durable: true,
      due: !snoozed && !!effectiveDue && effectiveDue <= now,
      snoozed,
      effectiveDue: effectiveDue ? effectiveDue.toISOString() : null,
      action: task.action || task.title || 'Task',
      daysLabel: effectiveDue ? Utils.formatDate(effectiveDue, 'short') : 'No due date'
    };
  },

  async getDurableTasks() {
    if (typeof DB.getTasks !== 'function') return [];
    try { return (await DB.getTasks()).filter(t => this.isActive(t)); }
    catch (e) { console.warn('Tasks: durable task load failed', e); return []; }
  },

  async merge(derived = [], now = this.now()) {
    const durable = [];
    for (const task of await this.getDurableTasks()) {
      // Absence from the derived list is not evidence of resolution (a read
      // may have failed, or the visit may be outside the look-ahead window).
      let reason = null;
      try {
        const key = task.derivedKey || task.sourceKey || '';
        if (task.appointmentId && /^(message:|visit-outcome:appointment:|quote:appointment:)/.test(key) && typeof DB.getAppointment === 'function') {
          const appt = await DB.getAppointment(task.appointmentId);
          if (appt) {
            let orders = [];
            if (key.startsWith('quote:appointment:') && DB.db?.orders) orders = await DB.db.orders.toArray();
            reason = this.appointmentResolution(key, appt, orders);
          }
        }
        if (reason && typeof DB.resolveTask === 'function') {
          await DB.resolveTask(task.id, reason, `task:resolved:${task.id}:${reason}`);
          continue;
        }
      } catch (e) { console.warn('Tasks: source reconciliation deferred', e); }
      durable.push(task);
    }
    const activeByKey = new Map();
    for (const task of durable) {
      const rawKey = task.derivedKey || task.sourceKey;
      if (!rawKey) continue;
      const key = this.canonicalKey(rawKey);
      const group = activeByKey.get(key) || [];
      group.push(task);
      activeByKey.set(key, group);
    }
    const merged = [];
    const represented = new Set();
    for (const suggestion of derived) {
      const derivedKey = this.derivedKey(suggestion);
      const canonical = this.canonicalKey(derivedKey);
      const group = activeByKey.get(canonical) || [];
      // Carry the latest explicit snooze across intro -> combined -> reminder.
      // Keep one reminder; retained task events explain any superseded copies.
      group.sort((a, b) => (this.effectiveDue(b)?.getTime() || 0) - (this.effectiveDue(a)?.getTime() || 0));
      const linked = group[0];
      if (linked) {
        for (const task of group) represented.add(task.id);
        if (canonical.startsWith('message:previsit:') && typeof DB.resolveTask === 'function') {
          for (const duplicate of group.slice(1)) {
            try { await DB.resolveTask(duplicate.id, 'previsit_purpose_consolidated', `task:consolidated:${duplicate.id}:${linked.id}`); }
            catch (e) { console.warn('Tasks: duplicate reconciliation deferred', e); }
          }
        }
        merged.push(this.decorateDurable({
          ...linked, kind: suggestion.kind, action: suggestion.action, derivedKey, sourceSuggestion: suggestion,
          customer: suggestion.customer, appointment: suggestion.appointment,
          order: suggestion.order, template: suggestion.template
        }, now));
        activeByKey.delete(canonical);
      } else {
        merged.push({ ...suggestion, derivedKey, durable: false });
      }
    }
    for (const task of durable) if (!represented.has(task.id)) merged.push(this.decorateDurable(task, now));
    return merged;
  },

  appointmentResolution(key, appt, orders = []) {
    const cancelled = appt.status === 'cancelled' || appt.outcome === 'cancelled';
    const preVisit = /^(message:(intro|day-before|intro-day-before):appointment:|visit-outcome:appointment:)/.test(key);
    if (preVisit) {
      if (cancelled) return 'visit_cancelled';
      if (appt.outcome || appt.status === 'completed') return 'visit_concluded';
      if (key.startsWith('message:') && appt.date && new Date(appt.date) <= this.now()) return 'previsit_window_closed';
      const contact = this.contactEvidence(appt);
      if (key.startsWith('message:intro:') && contact.introduced) return 'phone_introduction_recorded';
      if (key.startsWith('message:day-before:') && contact.agreed) return 'phone_agreement_recorded';
      if (key.startsWith('message:intro-day-before:') && contact.agreed && (contact.introduced || appt.introSent)) return 'phone_agreement_recorded';
      if (key.startsWith('message:intro:') && appt.introSent) return 'message_confirmed_sent';
      if (key.startsWith('message:day-before:') && appt.dayBeforeSent) return 'message_confirmed_sent';
      if (key.startsWith('message:intro-day-before:') && appt.introSent && appt.dayBeforeSent) return 'message_confirmed_sent';
    }
    if (key.startsWith('quote:appointment:')) {
      if (cancelled) return 'visit_cancelled';
      if (['ordered', 'lost', 'not_interested', 'not_looking_for', 'other_no_sale'].includes(appt.outcome)) return 'sales_decision_recorded';
      if (orders.some(o => String(o.appointmentId) === String(appt.id) && !['cancelled', 'cancelled_order'].includes(o.status) && o.stage !== 'cancelled')) return 'linked_order_recorded';
    }
    // Service issues and post-fitting care are separate purposes: completing
    // the appointment must never silently resolve either of them.
    return null;
  },

  validate(input) {
    const title = String(input?.title || '').trim();
    if (!title) throw new Error('Task title is required');
    const due = new Date(input?.dueAt);
    if (!input?.dueAt || isNaN(due)) throw new Error('Choose a valid due date and time');
    return { ...input, title, dueAt: due.toISOString(), priority: input.priority || 'normal', type: input.type || 'other' };
  },

  async create(input) {
    if (typeof DB.addTask !== 'function') throw new Error('Task storage is not available');
    return DB.addTask(this.validate(input));
  },

  async createFromSuggestion(suggestion, options = {}) {
    if (typeof DB.createTaskFromSuggestion !== 'function') throw new Error('Task storage is not available');
    const derivedKey = this.derivedKey(suggestion);
    if (!derivedKey) throw new Error('This follow-up cannot be linked to a reminder');
    return DB.createTaskFromSuggestion(derivedKey, {
      title: suggestion.action || 'Follow up',
      type: suggestion.kind || 'other',
      priority: suggestion.priority || 'normal',
      customerId: suggestion.customer?.id || null,
      appointmentId: suggestion.appointment?.id || null,
      orderId: suggestion.order?.id || null,
      dueAt: options.dueAt || new Date().toISOString(),
      snoozedUntil: options.snoozedUntil || null
    });
  },

  async complete(id, operationId) {
    if (typeof DB.completeTask !== 'function') throw new Error('Task storage is not available');
    return DB.completeTask(id, operationId || this.operationId('complete', id));
  },

  async snooze(task, until, operationId) {
    const date = new Date(until);
    if (isNaN(date) || date <= this.now()) throw new Error('Choose a future time');
    let durable = task;
    if (!task.durable) durable = await this.createFromSuggestion(task, { snoozedUntil: date.toISOString() });
    if (typeof DB.snoozeTask !== 'function') throw new Error('Task storage is not available');
    return DB.snoozeTask(durable.id, date.toISOString(), operationId || this.operationId('snooze', durable.id));
  },

  operationId(action, id) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `task:${action}:${id || 'new'}:${random}`;
  }
};
