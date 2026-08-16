/* ============================================
   ADVISOROS — AUTOMATED MESSAGE SCHEDULER
   Anchors a message cadence around each visit:
     evening_before  T−1 day, eveningHour (UK) — confirm next-day visit
     morning_of      visit day, morningHour (UK) — short check-in
     on_my_way       when the advisor starts the trip (Geo.startTrip)
                     — live-ETA "I'm on my way" message
     running_late    when the trip is significantly delayed — live ETA delay

    Every trigger DRAFTS and opens Talk's preview sheet for review — nothing
    is ever sent automatically (a PWA can't send WhatsApp texts silently, and
    real customer texts shouldn't be fired off without a human tap anyway).

    Same limitation as the Morning Brief: these timers live in a JS setTimeout
    chain, so they fire while the app is open (or within a moment of reopening).
    Phones suspend background tabs, so this is a convenience, not an alarm.

    Once a stage fires it never re-fires (localStorage flag + the schedule is
    recomputed fresh on every boot/appointment change).
    ============================================ */

const MessageScheduler = {
  timers: new Map(),

  init() {
    this.reschedule();
  },

  settings() {
    const am = CONFIG.autoMessages || {};
    return {
      enabled: !!am.enabled,
      eveningHour: am.eveningHour ?? 18,
      morningHour: am.morningHour ?? 8
    };
  },

  isEnabled() {
    return this.settings().enabled;
  },

  _flag(stage, apptId) {
    return `advisoros_auto_${stage}_${apptId}`;
  },

  _clearTimers() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  },

  // UK calendar-day distance from today to a visit instant (0 = today,
  // 1 = tomorrow, -1 = yesterday). Both dates are read through the UK
  // timezone so the "visit day" matches the advisor's calendar.
  _daysFromNowUK(visitDate) {
    const now = Utils.ukParts();
    const tgt = Utils.ukParts(new Date(visitDate));
    const a = new Date(now.year, now.month - 1, now.day).getTime();
    const b = new Date(tgt.year, tgt.month - 1, tgt.day).getTime();
    return Math.round((b - a) / 86400000);
  },

  // Real ms until a UK wall-clock time on a day offset from today
  // (offset 0 = today). Returns 0 when the moment is already in the past
  // so a boot that happens after the slot can still fire (catch-up).
  _msUntilUKTime(dayOffset, hour, minute) {
    const p = Utils.ukParts();
    const secondsNow = p.hour * 3600 + p.minute * 60 + p.second;
    const targetSec = (hour % 24) * 3600 + (minute || 0) * 60;
    let sec = targetSec - secondsNow + dayOffset * 86400;
    if (sec < 0) sec = 0;
    return sec * 1000;
  },

  // Morning-of should fire relative to visit time, not fixed 08:00.
  // Schedule for max(08:00, visitTime - 2h) to give ~2h buffer.
  // The visit time is read through the UK timezone (Utils.ukParts) and the
  // day distance added explicitly, so the timer lands on the visit's own UK
  // day regardless of the device timezone or the wall-clock time of boot.
  _msUntilMorningOf(appt) {
    if (!appt.date) return 0;
    const p = Utils.ukParts();
    const secondsNow = p.hour * 3600 + p.minute * 60 + p.second;
    const v = Utils.ukParts(new Date(appt.date));
    const targetSec = Math.max(8 * 3600, v.hour * 3600 + v.minute * 60 - 2 * 3600);
    const dayOffset = this._daysFromNowUK(appt.date);
    let sec = targetSec - secondsNow + dayOffset * 86400;
    if (sec < 0) sec = 0;
    return sec * 1000;
  },

  _clearTimers() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  },

  // UK calendar-day distance from today to a visit instant (0 = today,
  // 1 = tomorrow, -1 = yesterday). Both dates are read through the UK
  // timezone so the "visit day" matches the advisor's calendar.
  _daysFromNowUK(visitDate) {
    const now = Utils.ukParts();
    const tgt = Utils.ukParts(new Date(visitDate));
    const a = new Date(now.year, now.month - 1, now.day).getTime();
    const b = new Date(tgt.year, tgt.month - 1, tgt.day).getTime();
    return Math.round((b - a) / 86400000);
  },

  // Real ms until a UK wall-clock time on a day offset from today
  // (offset 0 = today). Returns 0 when the moment is already in the past
  // so a boot that happens after the slot can still fire (catch-up).
  _msUntilUKTime(dayOffset, hour, minute) {
    const p = Utils.ukParts();
    const secondsNow = p.hour * 3600 + p.minute * 60 + p.second;
    const targetSec = (hour % 24) * 3600 + (minute || 0) * 60;
    let sec = targetSec - secondsNow + dayOffset * 86400;
    if (sec < 0) sec = 0;
    return sec * 1000;
  },

  // Rebuilds the timer set from the upcoming week's appointments. Runs on
  // boot and after appointment changes, so an edit to a visit re-times its
  // messages automatically.
  async reschedule() {
    this._clearTimers();
    if (!this.isEnabled()) return;
    const s = this.settings();
    let upcoming = [];
    try {
      upcoming = await DB.getUpcomingAppointments(7);
    } catch (e) {
      console.warn('MessageScheduler: could not read upcoming appointments', e);
      return;
    }
    for (const appt of upcoming) {
      // A visit with an outcome already logged has already happened — no
      // check-in draft for a completed visit (e.g. outcome logged at 09:00,
      // app reopened at 10:00, would otherwise fire a stale morning_of).
      if (appt.outcome) continue;
      const days = this._daysFromNowUK(appt.date);
      if (days === 1) {
        // Visit tomorrow: evening-before draft fires today, morning-of draft tomorrow.
        this._schedule(appt, 'evening_before', 0, s.eveningHour);
        this._scheduleMorningOf(appt);
      } else if (days === 0) {
        // Visit today: morning-of draft fires this morning.
        this._scheduleMorningOf(appt);
      }
    }
  },

  _schedule(appt, stage, dayOffset, hour) {
    if (!appt.phone && !appt.customerId) {
      console.warn('MessageScheduler: no contact info for appointment', appt.id);
      return;
    }
    if (localStorage.getItem(this._flag(stage, appt.id)) === '1') return;
    const delay = this._msUntilUKTime(dayOffset, hour, 0);
    const timer = setTimeout(async () => {
      try { await this._fire(appt, stage); } catch (e) { console.warn('MessageScheduler ' + stage + ' failed:', e); }
    }, delay);
    this.timers.set(this._flag(stage, appt.id), timer);
  },

  _scheduleMorningOf(appt) {
    if (localStorage.getItem(this._flag('morning_of', appt.id)) === '1') return;
    const delay = this._msUntilMorningOf(appt);
    const timer = setTimeout(async () => {
      try { await this._fire(appt, 'morning_of'); } catch (e) { console.warn('MessageScheduler morning_of failed:', e); }
    }, delay);
    this.timers.set(this._flag('morning_of', appt.id), timer);
  },

  // Fires when the trip for a visit starts ("Start Trip" on Today/Visits):
  // live ETA from the current position -> on-my-way draft.
  async onDeparture(appointmentId) {
    if (!this.isEnabled() || !appointmentId) return;
    const appt = await DB.db.appointments.get(appointmentId);
    if (!appt) return;
    if (localStorage.getItem(this._flag('on_my_way', appt.id)) === '1') return;

    let etaText = '';
    try {
      const live = await this.getLiveEta(appt);
      if (live) etaText = `${live.etaMin} minute${live.etaMin === 1 ? '' : 's'}`;
    } catch (e) { /* no live ETA — let the AI write without it */ }

    const phone = await this._resolvePhone(appt);
    if (!phone) return;
    const pending = { customerId: appt.customerId || 0, phone, appointmentId: appt.id, templateKey: 'on_my_way' };
    if (etaText) pending.extraVars = { eta: etaText };
    const message = await this._buildMessage(appt, 'on_my_way', pending, { eta: etaText });
    if (!message) return;
    TalkFeature.pendingMessage = pending;
    TalkFeature.openPreviewSheet(message, pending, etaText
      ? `Live ETA from your current position — about ${etaText}. Double-check before sending.`
      : "Couldn't work out a live ETA (location unavailable) - this is a placeholder, edit before sending.");
    // Flag only after the sheet opened — a failed draft retries on the next
    // departure instead of being burned (same policy as _fire).
    localStorage.setItem(this._flag('on_my_way', appt.id), '1');
  },

  // Check if trip is significantly delayed (>15 min past ETA) and fire running_late
  async checkDelay(appt) {
    if (!this.isEnabled()) return;
    if (localStorage.getItem(this._flag('running_late', appt.id)) === '1') return;
    const live = await this.getLiveEta(appt);
    if (!live) return;
    const minutesUntil = appt?.date ? (new Date(appt.date) - new Date()) / 60000 : 0;
    const overrun = Math.round(live.etaMin - minutesUntil);
    if (overrun > 15) {
      const phone = await this._resolvePhone(appt);
      if (!phone) return;
      const pending = { customerId: appt.customerId || 0, phone, appointmentId: appt.id, templateKey: 'running_late' };
      pending.extraVars = { delay: String(overrun) };
      const message = await this._buildMessage(appt, 'running_late', pending, { delay: String(overrun) });
      if (!message) return;
      TalkFeature.pendingMessage = pending;
      TalkFeature.openPreviewSheet(message, pending, `Live ETA shows ${overrun} min late — double-check before sending.`);
      localStorage.setItem(this._flag('running_late', appt.id), '1');
    }
  },

  // Fires when the trip for a visit starts ("Start Trip" on Today/Visits):
  // live ETA from the current position -> on-my-way draft.
  async onDeparture(appointmentId) {
    if (!this.isEnabled() || !appointmentId) return;
    const appt = await DB.db.appointments.get(appointmentId);
    if (!appt) return;
    if (localStorage.getItem(this._flag('on_my_way', appt.id)) === '1') return;

    let etaText = '';
    try {
      const live = await this.getLiveEta(appt);
      if (live) etaText = `${live.etaMin} minute${live.etaMin === 1 ? '' : 's'}`;
    } catch (e) { /* no live ETA — let the AI write without it */ }

    const phone = await this._resolvePhone(appt);
    if (!phone) return;
    const pending = { customerId: appt.customerId || 0, phone, appointmentId: appt.id, templateKey: 'on_my_way' };
    if (etaText) pending.extraVars = { eta: etaText };
    const message = await this._buildMessage(appt, 'on_my_way', pending, { eta: etaText });
    if (!message) return;
    TalkFeature.pendingMessage = pending;
    TalkFeature.openPreviewSheet(message, pending, etaText
      ? `Live ETA from your current position — about ${etaText}. Double-check before sending.`
      : "Couldn't work out a live ETA (location unavailable) - this is a placeholder, edit before sending.");
    // Flag only after the sheet opened — a failed draft retries on the next
    // departure instead of being burned (same policy as _fire).
    localStorage.setItem(this._flag('on_my_way', appt.id), '1');
  },

  // Check for delay periodically during an active trip
  async startDelayChecker(appointmentId) {
    if (!this.isEnabled()) return;
    const checkInterval = setInterval(async () => {
      const appt = await DB.db.appointments.get(appointmentId);
      if (!appt || appt.outcome || appt.status !== 'confirmed') {
        clearInterval(checkInterval);
        return;
      }
      await this.checkDelay(appt);
    }, 5 * 60 * 1000); // check every 5 minutes
    return checkInterval;
  },

  async _buildMessage(appt, stage, pending, extra) {
    const context = await TalkFeature.buildMessageContext(pending);
    if (extra.eta) context.eta = extra.eta;
    if (extra.delay) context.delay = extra.delay;

    if (AIService.isEnabled()) {
      try {
        const result = await AIService.draftMessage(context);
        if (result.ok && result.text) return result.text;
      } catch (e) { /* fall through to template */ }
    }

    const templates = {
      evening_before: CONFIG.templates?.evening_before,
      morning_of: CONFIG.templates?.morning_of,
      on_my_way: CONFIG.templates?.on_my_way,
      running_late: CONFIG.templates?.running_late
    };
    const template = templates[stage];
    if (!template) return null;
    return NotificationService.processTemplate(template, {
      firstName: Utils.firstNameFrom(context.customer_name),
      time: context.time_start || '',
      address: context.address || '',
      advisorName: context.advisor_name || 'Your Advisor',
      eta: extra.eta || '15-20 minutes',
      delay: extra.delay || '10-15'
    });
  },

  async _fire(appt, stage) {
    if (localStorage.getItem(this._flag(stage, appt.id)) === '1') return;

    const phone = await this._resolvePhone(appt);
    if (!phone) {
      console.warn('MessageScheduler: no phone for appointment', appt.id);
      return;
    }
    const pending = { customerId: appt.customerId || 0, phone, appointmentId: appt.id, templateKey: stage };
    const message = await this._buildMessage(appt, stage, pending, {});
    if (!message) return;

    const hints = {
      evening_before: "Auto-drafted for tomorrow's visit — review before sending.",
      morning_of: "Auto-drafted for today's visit — review before sending."
    };
    TalkFeature.pendingMessage = pending;
    TalkFeature.openPreviewSheet(message, pending, hints[stage] || null);
    // Flag only AFTER the draft actually reached the review sheet. A fire
    // that failed earlier (no phone, AI down AND template missing) leaves
    // the flag unset, so the next boot's catch-up retries it instead of
    // silently burning the stage forever.
    localStorage.setItem(this._flag(stage, appt.id), '1');
  },

  async _resolvePhone(appt) {
    if (appt.phone) return appt.phone;
    if (appt.customerId) {
      try {
        const c = await DB.getCustomer(appt.customerId);
        if (c?.phone) return c.phone;
      } catch (e) { /* fall through */ }
    }
    return null;
  },

  // Get live ETA for a visit using the Route feature
  async getLiveEta(appt) {
    // Test mock support: if appointment has a pre-computed live ETA, use it
    if (appt._liveEta && typeof appt._liveEta.etaMin === 'number') {
      return { etaMin: appt._liveEta.etaMin, distanceKm: 0 };
    }
    if (!appt.address) return null;
    try {
      const base = await RouteFeature.getBasePoint();
      if (!base?.latLng) return null;
      const distanceKm = RouteFeature.calculateLegKm(base.latLng, appt.latLng);
      if (!distanceKm || distanceKm <= 0) return null;
      const etaMin = Math.max(1, Math.round((distanceKm / 35) * 60));
      return { etaMin, distanceKm };
    } catch (e) {
      console.log('Live ETA failed:', e);
      return null;
    }
  }
};

if (typeof window !== 'undefined') window.MessageScheduler = MessageScheduler;