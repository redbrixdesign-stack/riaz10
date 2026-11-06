/* Deterministic diary-capacity advice. This service never changes a booking. */
const CapacityService = {
  slotMinutes() { return CONFIG.workingWeek?.slotMinutes || 15; },

  interval(appointment) {
    const start = new Date(appointment.date || appointment.startAt);
    const duration = Math.max(1, Number(appointment.durationSlots) || 1) * this.slotMinutes();
    return { start, end: new Date(start.getTime() + duration * 60000) };
  },

  overlaps(a, b) { return a.start < b.end && b.start < a.end; },

  workingEnvelope(date) {
    const blocks = CONFIG.workingWeek?.blocks || [];
    if (!blocks.length) return null;
    const day = Utils.formatDate(date, 'iso');
    return {
      start: new Date(Utils.ukDateTimeISO(day, blocks[0].start) || NaN),
      end: new Date(Utils.ukDateTimeISO(day, blocks[blocks.length - 1].end) || NaN)
    };
  },

  async analyse(candidate, appointments = [], excludeId = null) {
    const proposed = this.interval({ date: candidate.date, durationSlots: candidate.durationSlots });
    const active = appointments.filter(a => a.status !== 'cancelled' && String(a.id) !== String(excludeId));
    const warnings = [];
    const envelope = this.workingEnvelope(proposed.start);
    if (envelope && (!Number.isFinite(envelope.start.getTime()) || !Number.isFinite(envelope.end.getTime()))) {
      warnings.push({ code: 'closed_hours', message: 'Check your configured working hours before agreeing this slot.' });
    } else if (envelope && (proposed.start < envelope.start || proposed.end > envelope.end)) {
      warnings.push({ code: 'closed_hours', message: 'This visit falls outside your configured working hours.' });
    }
    if (active.some(a => this.overlaps(proposed, this.interval(a)))) {
      warnings.push({ code: 'overlap', message: 'This visit overlaps another diary booking.' });
    }
    if (typeof DB.getAvailabilityBlocks === 'function') {
      const blocks = await DB.getAvailabilityBlocks({ from: proposed.start.toISOString(), to: proposed.end.toISOString() });
      for (const block of blocks || []) {
        if (block.type !== 'working' && this.overlaps(proposed, { start: new Date(block.startAt), end: new Date(block.endAt) })) {
          warnings.push({ code: block.type || 'unavailable', message: `This time is marked ${block.type === 'leave' ? 'as leave' : 'unavailable'}${block.label ? `: ${block.label}` : '.'}` });
        }
      }
    }
    const bookedMinutes = active.reduce((sum, a) => sum + Math.max(1, Number(a.durationSlots) || 1) * this.slotMinutes(), 0)
      + Math.max(1, Number(candidate.durationSlots) || 1) * this.slotMinutes();
    if (bookedMinutes > 8 * 60) warnings.push({ code: 'unrealistic_day', message: 'This would put more than eight booked hours into one day, before travel and admin.' });
    return warnings;
  },

  async suggest(candidate, appointments = [], excludeId = null) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.date)) ? String(candidate.date) : Utils.formatDate(candidate.date, 'iso');
    const durationSlots = Math.max(1, Number(candidate.durationSlots) || 1);
    const blocks = CONFIG.workingWeek?.blocks || [];
    const suggestions = [];
    for (const block of blocks) {
      const startISO = Utils.ukDateTimeISO(day, block.start), endISO = Utils.ukDateTimeISO(day, block.end);
      if (!startISO || !endISO) continue;
      let cursor = new Date(startISO);
      const end = new Date(endISO);
      while (cursor.getTime() + durationSlots * this.slotMinutes() * 60000 <= end.getTime()) {
        const warnings = await this.analyse({ date: cursor.toISOString(), durationSlots }, appointments, excludeId);
        if (!warnings.some(w => ['overlap', 'closed_hours', 'leave', 'unavailable'].includes(w.code))) {
          suggestions.push({ date: cursor.toISOString(), label: Utils.formatTime(cursor) });
          if (suggestions.length === 3) return suggestions;
        }
        cursor = new Date(cursor.getTime() + this.slotMinutes() * 60000);
      }
    }
    return suggestions;
  }
};

