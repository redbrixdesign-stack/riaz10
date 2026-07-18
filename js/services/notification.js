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

  // Send SMS
  sendSMS(phone, message) {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
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
