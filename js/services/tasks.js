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
    const durable = await this.getDurableTasks();
    const activeByKey = new Map();
    for (const task of durable) {
      const key = task.derivedKey || task.sourceKey;
      if (key) activeByKey.set(key, task);
    }
    const merged = [];
    for (const suggestion of derived) {
      const derivedKey = this.derivedKey(suggestion);
      const linked = derivedKey ? activeByKey.get(derivedKey) : null;
      if (linked) {
        merged.push(this.decorateDurable({
          ...linked, derivedKey, sourceSuggestion: suggestion,
          customer: suggestion.customer, appointment: suggestion.appointment,
          order: suggestion.order, template: suggestion.template
        }, now));
        activeByKey.delete(derivedKey);
      } else {
        merged.push({ ...suggestion, derivedKey, durable: false });
      }
    }
    const represented = new Set(merged.filter(t => t.durable).map(t => t.id));
    for (const task of durable) if (!represented.has(task.id)) merged.push(this.decorateDurable(task, now));
    return merged;
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
