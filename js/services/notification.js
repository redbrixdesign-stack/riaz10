/* ============================================
   ADVISOROS v5.0 — NOTIFICATION SERVICE
   WhatsApp, push, SMS templates
   ============================================ */

const NotificationService = {
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
  buildBookingConfirmationMessage({ firstName, date, dateLabel, time, address, type, advisorName }) {
    const name = firstName || 'there';
    const author = advisorName || 'Your Advisor';
    let daysUntil = null;
    if (date instanceof Date && !isNaN(date)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const visitDay = new Date(date); visitDay.setHours(0, 0, 0, 0);
      daysUntil = Math.round((visitDay - today) / 86400000);
    }
    const tier = daysUntil === null ? 'soon' : daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : daysUntil <= 3 ? 'soon' : 'later';

    const openings = {
      today: `Hi ${name}, thanks for booking! I'll be with you today at ${time}.`,
      tomorrow: `Hi ${name}, thanks for booking — looking forward to seeing you tomorrow at ${time}.`,
      soon: `Hi ${name}, thanks for booking! I've got you down for ${dateLabel} at ${time}.`,
      later: `Hi ${name}, thanks for booking! You're all set for ${dateLabel} at ${time} — that's a little way off yet, so I'll drop you a reminder closer to the day, but wanted to say hello now and flag a couple of things ahead of time:`
    };

    const asks = {
      consultation: "It'd help if the windows we'll be looking at are clear of anything in the way — and if there's anywhere specific you'd like me to park, just let me know.",
      measure: 'For accurate measurements, could you make sure the windows we\'re measuring are clear? Let me know if there\'s somewhere specific to park too.',
      fitting: 'Could you clear the area around the windows being fitted before I arrive? Let me know about parking or anything else useful.',
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
    window.open(url, '_blank');
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
      new Notification(title, {
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/badge-72.png',
        ...options
      });
    }
  },

  // Schedule reminder
  scheduleReminder(title, body, delayMs) {
    setTimeout(() => {
      this.showNotification(title, { body });
    }, delayMs);
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
      this.showNotification('Your morning brief is ready ☀️', { body: 'Open AdvisorOS to see your day.' });
    }
  }
};
