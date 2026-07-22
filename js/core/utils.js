/* ============================================
   ADVISOROS v5.0 — UTILITIES
   Date, currency, validation helpers
   ============================================ */

const Utils = {
  // ---- UK wall-clock time ----
  // This app runs on UK business rules (tax year, working week, EOD cut-off,
  // morning brief) that must follow the UK calendar/clock even if the
  // device's own timezone is set to something else. These helpers read the
  // real instant (Date.now()) through the Europe/London timezone, so they're
  // correct through both GMT and BST without manual offset math.
  //
  // IMPORTANT: the Date object returned by nowUK()/ukParts() is only valid
  // for reading calendar fields (getFullYear/getMonth/getDate/getHours/
  // getDay etc). Don't take its .getTime() and diff it against a real Date's
  // .getTime() — the epoch value is intentionally not "real".
  ukParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
    });
    const parts = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
    }
    const asDate = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return {
      year: parts.year,
      month: parts.month, // 1-12
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
      weekday: asDate.getDay() // 0=Sun..6=Sat, derived from the UK calendar date above
    };
  },

  // "Now", but read as UK wall-clock fields (see warning above).
  nowUK(date = new Date()) {
    const p = this.ukParts(date);
    return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  },

  // Date helpers — "today" follows the UK calendar day, not the device's.
  getToday() {
    const p = this.ukParts();
    return new Date(p.year, p.month - 1, p.day);
  },

  getTomorrow() {
    const t = this.getToday();
    t.setDate(t.getDate() + 1);
    return t;
  },

  getStartOfWeek(date) {
    const d = date ? new Date(date) : this.getToday();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  },

  getEndOfWeek(date) {
    // "End of week" means the end of Sunday (the last day of a Mon–Sun week),
    // not the start of it. The previous version added only 6 days to Monday's
    // midnight, landing on Sunday 00:00 — and since callers compare with
    // `.toISOString()` (which shifts local midnight through UTC), the boundary
    // ended up at Saturday 23:00 UTC during BST, quietly dropping every
    // Sunday appointment from "this week" earnings/sales. +7 days from the
    // Monday start reaches Monday 00:00 of the following week, so the whole
    // Sunday is included, and consumers that use it as an exclusive upper
    // bound (between()) now cover all seven days.
    const start = this.getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return end;
  },

  getStartOfMonth(date) {
    const d = date || this.getToday();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  },

  getEndOfMonth(date) {
    const d = date || this.getToday();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  },

  // UK tax year runs April 6 - April 5. The cutover must check the full date
  // (month AND day) — checking month alone flips the year 5 days early, on
  // April 1st instead of April 6th.
  getTaxYearStart() {
    const p = this.ukParts();
    const beforeCutover = p.month < 4 || (p.month === 4 && p.day < 6);
    const year = beforeCutover ? p.year - 1 : p.year;
    return new Date(year, 3, 6); // April 6
  },

  getTaxYearEnd() {
    const start = this.getTaxYearStart();
    return new Date(start.getFullYear() + 1, 3, 5); // April 5
  },

  isSameDay(d1, d2) {
    const a = new Date(d1);
    const b = new Date(d2);
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  },

  daysBetween(d1, d2) {
    const a = new Date(d1);
    const b = new Date(d2);
    const diff = a - b;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },

  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  formatDate(date, format = 'short') {
    const d = new Date(date);
    if (format === 'short') {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    if (format === 'medium') {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (format === 'long') {
      return d.toLocaleDateString('en-GB', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
      });
    }
    if (format === 'time') {
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    if (format === 'datetime') {
      return d.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    if (format === 'iso') {
      // Build from LOCAL date parts — do NOT use toISOString() here. That
      // converts through UTC, and during BST (UK summer time, UTC+1) a
      // local-midnight Date shifts back into the previous day once
      // converted, silently keying "today" as yesterday for anything built
      // from local-midnight dates (calendar grids, getToday(), etc.).
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return d.toISOString();
  },

  formatTime(date) {
    return new Date(date).toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  },

  // Currency
  formatCurrency(amount, currency = CONFIG.currency) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  },

  formatNumber(num, decimals = 0) {
    return new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num || 0);
  },

  // Distance
  formatDistance(km) {
    if (CONFIG.distanceUnit === 'miles') {
      return `${(km * 0.621371).toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
  },

  // Measurement
  formatMeasurement(mm) {
    if (CONFIG.measurementUnit === 'cm') {
      const cm = (mm || 0) / 10;
      return `${Number.isInteger(cm) ? cm.toFixed(0) : cm.toFixed(1)} cm`;
    }
    if (CONFIG.measurementUnit === 'inches') {
      const inches = mm / 25.4;
      const feet = Math.floor(inches / 12);
      const remaining = inches % 12;
      if (feet > 0) {
        return `${feet}' ${remaining.toFixed(1)}"`;
      }
      return `${inches.toFixed(1)}"`;
    }
    return `${mm} mm`;
  },

  // Phone formatting
  formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('44')) {
      return `+44 ${cleaned.slice(2, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
    if (cleaned.startsWith('0')) {
      return `0${cleaned.slice(1, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
    return phone;
  },

  toWhatsAppPhone(phone, defaultCountry = CONFIG.country || 'GB') {
    if (!phone) return '';
    const raw = String(phone).trim();
    let digits = raw.replace(/\D/g, '');

    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);

    if (defaultCountry === 'GB') {
      if (digits.startsWith('0')) digits = `44${digits.slice(1)}`;
      if (/^7\d{9}$/.test(digits)) digits = `44${digits}`;
    }

    if (digits.length < 10 || digits.length > 15) return '';
    return digits;
  },

  // A tel: link built from whatever format the number happens to be stored
  // in (local "07..." vs "+44 7..." vs digits with stray spaces/dashes from
  // OCR) is unreliable - some devices/carriers mishandle a bare national
  // number, especially once other punctuation is involved. Reuses the same
  // UK-aware digit normalization as the WhatsApp link so Call and WhatsApp
  // agree on what the "real" number is, then prefixes + for the standard
  // international (E.164) form every phone dialer accepts unambiguously.
  toE164Phone(phone, defaultCountry = CONFIG.country || 'GB') {
    const digits = this.toWhatsAppPhone(phone, defaultCountry);
    return digits ? `+${digits}` : '';
  },

  buildWhatsAppUrl(phone, message = '') {
    const whatsappPhone = this.toWhatsAppPhone(phone);
    if (!whatsappPhone) return '';
    const text = message ? `?text=${encodeURIComponent(message)}` : '';
    return `https://wa.me/${whatsappPhone}${text}`;
  },

  // Postcode normalization
  normalizePostcode(postcode) {
    return postcode?.toUpperCase().replace(/\s/g, '') || '';
  },

  formatPostcode(postcode) {
    const normalized = this.normalizePostcode(postcode);
    if (normalized.length >= 4) {
      const inward = normalized.slice(-3);
      const outward = normalized.slice(0, -3);
      return `${outward} ${inward}`;
    }
    return postcode;
  },

  // ID generation
  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  // Slugify
  slugify(str) {
    return str.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  },

  // Debounce
  debounce(fn, ms) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  },

  // Throttle
  throttle(fn, ms) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...args);
      }
    };
  },

  // Deep clone
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Validation
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  isValidPhone(phone) {
    return /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(phone.replace(/\s/g, ''));
  },

  isValidPostcode(postcode) {
    return /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i.test(postcode);
  },

  // Array helpers
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key];
      result[group] = result[group] || [];
      result[group].push(item);
      return result;
    }, {});
  },

  sortBy(array, key, direction = 'asc') {
    return [...array].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (direction === 'desc') {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    });
  },

  // String helpers
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  truncate(str, length = 50) {
    if (!str || str.length <= length) return str;
    return str.slice(0, length) + '...';
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  },

  escapeAttr(value) {
    return this.escapeHtml(value);
  },

  escapeJsString(value) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  },

  // File helpers
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  base64ToBlob(base64, mimeType = 'image/jpeg') {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
  },

  // Color helpers
  getContrastColor(hexColor) {
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#000000' : '#ffffff';
  }
};
