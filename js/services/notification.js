/* ============================================
   ADVISOROS v5.0 — NOTIFICATION SERVICE
   WhatsApp, push, SMS templates
   ============================================ */

const NotificationService = {
  _visitReminderTimers: new Map(),
  _visitReminderRefreshTimer: null,

  // Process template with variables
  processTemplate(template, variables = {}) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp('{{' + key + '}}', 'g'), value || '');
    }
    return result;
  },

  // A booking made three days out and a booking made the night before don't
  // read the same way to the customer, even if the visit itself is
  // identical - "looking forward to Thursday" sent on Monday feels normal,
  // but the same phrasing sent an hour before a same-day visit feels off,
  // and a generic line sent four days out misses the chance to say a
  // reminder is coming so they don't have to hold the date in their head.
  // This picks an opening and sign-off tuned to the actual gap between
  // "now" and the visit, then wraps the same per-type practical ask
  // (windows clear, parking, etc.) that's always needed regardless of
  // timing - the personalization is in the framing, not the substance.
  // `time` carries its own preposition: "at 09:00" for an exact slot or
  // "between 09:00 and 11:00" for an arrival window — the caller picks, so
  // the phrase "at between …" can never leak into a customer message.
  buildBookingConfirmationMessage({ firstName, date, dateLabel, time, address, type, advisorName, advisorTitle }) {
    const name = firstName || 'there';
    const author = advisorName || 'Your Advisor';
    let daysUntil = null;
    if (date instanceof Date && !isNaN(date)) {
      // UK calendar-day difference (same convention as the rest of the app):
      // "now" and the visit day are both read through Europe/London, so a
      // device set to a non-UK timezone still tiers the message correctly
      // (e.g. a visit "tomorrow" by the advisor's calendar, not by the
      // device clock).
      const nowP = Utils.ukParts();
      const tgtP = Utils.ukParts(date);
      const a = new Date(nowP.year, nowP.month - 1, nowP.day).getTime();
      const b = new Date(tgtP.year, tgtP.month - 1, tgtP.day).getTime();
      daysUntil = Math.round((b - a) / 86400000);
    }
    const tier = daysUntil === null ? 'soon' : daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : daysUntil <= 3 ? 'soon' : 'later';

    const role = advisorTitle || 'window coverings adviser';
    const purpose = {
      consultation: 'for your window-coverings consultation', measure: 'to measure your windows',
      fitting: 'to fit your window coverings', review: 'to review the completed work',
      service_call: 'to look at the issue you reported', follow_up: 'to follow up on our previous visit'
    }[type] || 'for your appointment';
    const when = tier === 'today' ? `today ${time}` : tier === 'tomorrow' ? `tomorrow ${time}` : `${dateLabel} ${time}`;
    const openings = {
      today: `Hi ${name}, I'm ${author}, your ${role}. I'll be with you ${when} ${purpose}.`,
      tomorrow: `Hi ${name}, I'm ${author}, your ${role}. Just confirming I'll be with you ${when} ${purpose}.`,
      soon: `Hi ${name}, I'm ${author}, your ${role}. I have your visit arranged for ${when} ${purpose}.`,
      later: `Hi ${name}, I'm ${author}, your ${role}. I have your visit arranged for ${when} ${purpose}. I'll send you a shorter reminder closer to the day.`
    };

    const asks = {
      consultation: "To help me bring the right ideas, please reply with roughly how many windows or blinds you're considering, which rooms they're in, and any styles, colours or inspiration photos you like. Please also mention any parking or access considerations.",
      measure: 'For the survey, please clear the area around each window we\'re measuring so I can take accurate sizes. Let me know about any parking or access considerations too.',
      fitting: 'Before the fitting, please clear the area around the windows and take down any existing blinds or curtains. If parking or access has changed, just let me know.',
      review: "Let me know if there's anywhere specific to park, or anything in particular you'd like me to take a look at.",
      service_call: "Could you make sure the area's clear so I can get straight to it? Let me know about parking too."
    };

    const closings = {
      today: 'See you shortly!',
      tomorrow: 'See you tomorrow!',
      soon: 'Speak soon!',
      later: "That's everything for now — see you then!"
    };

    const ask = asks[type] || asks.consultation;
    const opening = openings[tier];
    const closing = closings[tier];
    return `${opening} ${ask} ${closing} — ${author}`;
  },

  // Send WhatsApp message
  sendWhatsApp(phone, message) {
    const url = Utils.buildWhatsAppUrl(phone, message);
    if (!url) {
      Toast.show('Add a valid phone number for WhatsApp', 'error');
      return false;
    }
    // window.open returns null when a popup blocker swallows the window —
    // fall back to navigating this tab so the draft is never silently lost.
    const win = window.open(url, '_blank');
    if (!win) {
      window.location.href = url;
      Toast.show('Opened WhatsApp — check it sent', 'info');
    }
    return true;
  },

  // Send SMS - opens the device's SMS app with the message pre-filled.
  // Sanitize the phone number before splicing into the sms: URL: a
  // customer-supplied phone string could contain URI metacharacters
  // (e.g. '?', '&', '=') that would otherwise end the phone part early
  // and inject extra parameters into the URL.
  sendSMS(phone, message) {
    const cleanedPhone = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleanedPhone) {
      Toast.show('No valid phone number', 'warning');
      return false;
    }
    window.location.href = `sms:${cleanedPhone}?body=${encodeURIComponent(message || '')}`;
    return true;
  },

  // Request push notification permission
  async requestPushPermission() {
    if (!('Notification' in window)) {
      Toast.show('Push notifications not supported', 'warning');
      return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  // Show local notification
  showNotification(title, options = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notificationOptions = {
        icon: 'assets/icons/icon-gold-192.png',
        badge: 'assets/icons/badge-gold-72.png',
        ...options
      };
      // Installed iPhone PWAs deliver notifications through their service
      // worker. Desktop browsers can still use the Notification constructor.
      if (navigator.serviceWorker?.ready) {
        navigator.serviceWorker.ready
          .then(registration => registration.showNotification(title, notificationOptions))
          .catch(() => {
            try { new Notification(title, notificationOptions); } catch (e) {}
          });
        return true;
      }
      try { new Notification(title, notificationOptions); return true; } catch (e) {}
    }
    return false;
  },

  // Schedule reminder
  scheduleReminder(title, body, delayMs) {
    setTimeout(() => {
      this.showNotification(title, { body });
    }, delayMs);
  },

  // ── VISIT REMINDERS ────────────────────────────────────────────────────
  // Timers are rebuilt whenever Beelo starts, becomes visible, or a visit is
  // added/moved. iOS can suspend a PWA in the background, so the in-app alert
  // is available only while Beelo is active and not editing another dialog;
  // OS delivery depends on existing notification permission/browser support.
  isVisitReminderEnabled() {
    return localStorage.getItem('advisoros_visit_reminders_enabled') !== 'false';
  },

  setVisitReminderEnabled(enabled) {
    localStorage.setItem('advisoros_visit_reminders_enabled', enabled ? 'true' : 'false');
    if (enabled) this.refreshVisitReminders();
    else {
      this.clearVisitReminders();
      return this._refreshOpenVisitReminder();
    }
  },

  startVisitReminders() {
    this.refreshVisitReminders();
    if (!this._visitVisibilityBound) {
      this._visitVisibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.refreshVisitReminders();
      });
    }
  },

  clearVisitReminders() {
    for (const timer of this._visitReminderTimers.values()) clearTimeout(timer);
    this._visitReminderTimers.clear();
    if (this._visitReminderRefreshTimer) clearTimeout(this._visitReminderRefreshTimer);
    this._visitReminderRefreshTimer = null;
  },

  queueVisitReminderRefresh() {
    if (!this.isVisitReminderEnabled() && !this._openVisitReminder) return;
    if (this._visitReminderRefreshTimer) clearTimeout(this._visitReminderRefreshTimer);
    this._visitReminderRefreshTimer = setTimeout(() => this.refreshVisitReminders(), 150);
  },

  _visitReminderKey(appt) {
    return `${appt.id}:${new Date(appt.date).getTime()}`;
  },

  _readDeliveredVisitReminders() {
    try { return JSON.parse(localStorage.getItem('advisoros_visit_reminders_delivered') || '{}'); }
    catch (e) { return {}; }
  },

  _markVisitReminderDelivered(key) {
    const delivered = this._readDeliveredVisitReminders();
    delivered[key] = Date.now();
    const cutoff = Date.now() - (7 * 86400000);
    for (const [storedKey, at] of Object.entries(delivered)) {
      if (!Number.isFinite(Number(at)) || Number(at) < cutoff) delete delivered[storedKey];
    }
    localStorage.setItem('advisoros_visit_reminders_delivered', JSON.stringify(delivered));
  },

  async refreshVisitReminders() {
    this.clearVisitReminders();
    await this._refreshOpenVisitReminder();
    if (!this.isVisitReminderEnabled() || typeof DB === 'undefined' || !DB.db) return;
    try {
      const now = Date.now();
      const upcoming = await DB.getUpcomingAppointments(2);
      const delivered = this._readDeliveredVisitReminders();
      for (const appt of upcoming) {
        if (!appt || appt.status === 'cancelled' || appt.status === 'completed' || appt.outcome) continue;
        const visitAt = new Date(appt.date).getTime();
        if (!Number.isFinite(visitAt) || visitAt < now - (15 * 60000)) continue;
        const key = this._visitReminderKey(appt);
        if (delivered[key]) continue;
        const delay = Math.max(250, visitAt - now - (15 * 60000));
        const timer = setTimeout(() => this._fireVisitReminder(appt.id, key), delay);
        this._visitReminderTimers.set(key, timer);
      }
    } catch (e) {
      console.log('Visit reminder scheduling skipped:', e);
    }
  },

  _reminderTiming(visitAt) {
    const minutes = Math.max(0, Math.ceil((visitAt - Date.now()) / 60000));
    return minutes >= 14 ? 'in 15 minutes' : minutes > 0 ? `in ${minutes} minutes` : 'now';
  },

  _openReminderNode(owner) {
    return document.querySelector?.(`#modal-overlay.active #bottom-sheet [data-visit-reminder-owner="${owner.token}"]`);
  },

  _reminderSnapshotOwned(frame, owner) {
    return typeof frame?.content === 'string' && frame.content.includes(`data-visit-reminder-owner="${owner.token}"`);
  },

  _queueOpenReminderCheck(owner) {
    if (this._openVisitReminder !== owner) return;
    clearTimeout(this._openVisitReminderTimer);
    const delay = Math.max(1, Math.min(60000, owner.visitAt + 15 * 60000 - Date.now() + 1));
    this._openVisitReminderTimer = setTimeout(() => this._refreshOpenVisitReminder(), delay);
  },

  _retireOpenVisitReminder(owner) {
    if (this._openVisitReminder !== owner) return;
    clearTimeout(this._openVisitReminderTimer);
    this._openVisitReminderTimer = null;
    this._openVisitReminder = null;
    // Remove only this reminder's saved frame. Never restore/replace the
    // currently edited form, or discard unrelated modal-stack entries.
    if (typeof App !== 'undefined') {
      if (Array.isArray(App.modalStack)) App.modalStack = App.modalStack.filter(frame => !this._reminderSnapshotOwned(frame, owner));
      if (this._openReminderNode(owner)) {
        if (document.querySelector?.('#modal-full.active')) {
          // A full-screen editor can cover the owned bottom sheet. Do not
          // invoke generic closeModal here: it would untrap that editor's
          // focus and unlock body scrolling. Retire only the covered sheet.
          const sheet = document.getElementById('bottom-sheet');
          const previous = App.modalStack?.pop();
          if (previous) {
            sheet.innerHTML = previous.content;
            sheet.scrollTop = previous.scrollTop || 0;
            App._nameDialog(sheet);
          } else {
            sheet.replaceChildren();
            for (const attribute of ['role', 'aria-modal', 'aria-label', 'aria-labelledby']) sheet.removeAttribute(attribute);
            document.getElementById('modal-overlay')?.classList.remove('active', 'passphrase-gate');
          }
        } else App.closeModal();
      }
    }
  },

  async _refreshOpenVisitReminder() {
    const owner = this._openVisitReminder;
    if (!owner || typeof App === 'undefined') return;
    clearTimeout(this._openVisitReminderTimer);
    this._openVisitReminderTimer = null;
    const stacked = Array.isArray(App.modalStack) && App.modalStack.some(frame => this._reminderSnapshotOwned(frame, owner));
    if (!this._openReminderNode(owner) && !stacked) {
      this._openVisitReminder = null; // Dismissed/navigated away: never reopen.
      return;
    }
    const outsideWindow = () => owner.visitAt < Date.now() - 15 * 60000 || owner.visitAt > Date.now() + 15 * 60000;
    if (!this.isVisitReminderEnabled() || outsideWindow()) {
      this._retireOpenVisitReminder(owner);
      return;
    }
    if (typeof DB === 'undefined' || !DB.db) { this._queueOpenReminderCheck(owner); return; }
    let appointment;
    try { appointment = await DB.getAppointment(owner.appointmentId); }
    catch (e) { this._queueOpenReminderCheck(owner); return; }
    // A dismissal/new sheet may have happened while IndexedDB was awaited.
    if (this._openVisitReminder !== owner) return;
    if (!this.isVisitReminderEnabled() || outsideWindow() || !appointment ||
        this._visitReminderKey(appointment) !== owner.key || appointment.status === 'cancelled' ||
        appointment.status === 'completed' || appointment.outcome) {
      this._retireOpenVisitReminder(owner);
      return;
    }
    const heading = this._openReminderNode(owner)?.querySelector('[data-visit-reminder-timing]');
    if (heading) heading.textContent = `Next appointment ${this._reminderTiming(owner.visitAt)}`;
    this._queueOpenReminderCheck(owner);
  },

  async _fireVisitReminder(appointmentId, key) {
    this._visitReminderTimers.delete(key);
    if (!this.isVisitReminderEnabled() || typeof DB === 'undefined' || !DB.db) return;
    let appt = null;
    try { appt = await DB.getAppointment(appointmentId); } catch (e) {}
    if (!appt || this._visitReminderKey(appt) !== key || appt.status === 'cancelled' || appt.status === 'completed' || appt.outcome) return;

    const visitAt = new Date(appt.date).getTime();
    const now = Date.now();
    // A suspended timer (or delayed database read) may resume long after its
    // scheduled window. Revalidate the same +/-15 minute scheduling boundary
    // before consuming the reminder or showing anything to the adviser.
    if (!this.isVisitReminderEnabled() || !DB.db || !Number.isFinite(visitAt) ||
        visitAt < now - (15 * 60000) || visitAt > now + (15 * 60000) ||
        this._readDeliveredVisitReminders()[key]) return;
    this._markVisitReminderDelivered(key);
    const name = appt.clientName || 'your customer';
    const timing = this._reminderTiming(visitAt);
    const body = `${name} · ${Utils.formatTimeUK(appt.date)}${appt.address ? ` · ${appt.address}` : ''}`;
    this.showNotification(`Next appointment ${timing}`, {
      body,
      tag: `visit-reminder-${appointmentId}`,
      data: { appointmentId },
      requireInteraction: true
    });

    // Do not stack a reminder over an editor/passphrase/full-screen modal:
    // the generic modal stack saves HTML, not unsaved live form values.
    if (document.visibilityState === 'visible' && typeof App !== 'undefined' &&
        !document.querySelector?.('#modal-overlay.active, #modal-full.active')) {
      const owner = { appointmentId, key, visitAt, token: `visit-reminder-${this._visitReminderSerial = (this._visitReminderSerial || 0) + 1}` };
      this._openVisitReminder = owner;
      App.openModal(`<div class="sheet-handle"></div>
        <div class="sheet-header" data-visit-reminder-owner="${owner.token}">
          <div><h3 data-visit-reminder-timing>Next appointment ${timing}</h3><div class="fs-12 text-secondary mt-2">${Utils.escapeHtml(Utils.formatTimeUK(appt.date))}</div></div>
          <button class="btn btn-ghost btn-sm" type="button" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="sheet-body">
          <div class="card mb-md"><div class="fw-600">${Utils.escapeHtml(name)}</div>${appt.address ? `<div class="fs-13 text-secondary mt-4">${Utils.escapeHtml(appt.address)}</div>` : ''}</div>
          <button class="btn btn-primary btn-block" data-close="1" data-action="App.navigate" data-args='${JSON.stringify(['appointments', { id: appointmentId }])}'>Open visit</button>
          <button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Dismiss</button>
        </div>`);
      this._queueOpenReminderCheck(owner);
    }
  },

  // ── MORNING BRIEF NOTIFICATION ──────────────────────────────────────────
  // Schedules a daily 7am local notification summarising the day.
  // Uses setTimeout chain since Service Worker Periodic Sync isn't
  // universally supported yet — this covers the common case where the
  // app or its tab/PWA process stays alive or is reopened each day.
  async scheduleMorningBrief() {
    const granted = await this.requestPushPermission();
    if (!granted) return false;

    localStorage.setItem('advisoros_morning_brief_enabled', 'true');
    this._queueNextMorningBrief();
    return true;
  },

  disableMorningBrief() {
    localStorage.setItem('advisoros_morning_brief_enabled', 'false');
    if (this._morningBriefTimeout) {
      clearTimeout(this._morningBriefTimeout);
    }
  },

  isMorningBriefEnabled() {
    return localStorage.getItem('advisoros_morning_brief_enabled') === 'true';
  },

  // Computes ms until the next 7:00am UK time. Deliberately does NOT build a
  // target Date via setHours(7,...) on `new Date()` — that sets 7am in the
  // *device's* timezone, which is wrong if the phone's clock/region isn't
  // set to the UK. Instead this works entirely in UK wall-clock seconds, so
  // the elapsed real time until the target is correct regardless of the
  // device's own timezone (DST transition days can be off by up to an hour,
  // which is an acceptable trade-off for a "brief", not a time-critical alarm).
  _msUntilNextUK7am() {
    const p = Utils.ukParts();
    const secondsNow = p.hour * 3600 + p.minute * 60 + p.second;
    const sevenAm = 7 * 3600;
    let secondsUntil = sevenAm - secondsNow;
    if (secondsUntil <= 0) secondsUntil += 24 * 3600; // already past 7am UK today — target tomorrow
    return secondsUntil * 1000;
  },

  _queueNextMorningBrief() {
    if (!this.isMorningBriefEnabled()) return;
    if (this._morningBriefTimeout) clearTimeout(this._morningBriefTimeout);

    const delay = this._msUntilNextUK7am();
    this._morningBriefTimeout = setTimeout(async () => {
      await this._fireMorningBrief();
      this._queueNextMorningBrief(); // chain to the following day
    }, delay);
  },

  async _fireMorningBrief() {
    try {
      const today = Utils.getToday();
      const appointments = await DB.getAppointmentsForDate(today.toISOString());
      const weekEarnings = await TodayFeature.getWeekEarnings();
      const target = CONFIG.weeklyTarget || 600;
      const remaining = Math.max(0, target - weekEarnings);

      const body = `${appointments.length} visit${appointments.length === 1 ? '' : 's'} today · ${Utils.formatCurrency(remaining)} from your weekly target`;

      this.showNotification('Your morning brief is ready ☀️', { body, tag: 'morning-brief' });
    } catch (e) {
      console.log('Morning brief generation failed:', e);
      this.showNotification('Your morning brief is ready ☀️', { body: 'Open Beelo to see your day.' });
    }
  }
};
