/* ============================================
   ADVISOROS — BEELO COMPANION
   DeepSeek-style dark chat that IS the Home screen.

   Every answer starts rule-built from real DB data —
   instant, free, offline, and incapable of inventing
   figures. When "Phrase with AI" is on (and Claude is
   configured), the proxy's 'assistant' type rephrases
   the reply and suggests the next question, with the
   snapshot JSON drawn from the same real data.

   The companion only reads and suggests. Every action
   button calls an existing app screen/modal; it never
   sends messages or writes data itself.
   ============================================ */

const CompanionFeature = {
  id: 'companion',
  // Session transcript: [{role:'user', text} | {role:'assistant', answer, phrase?}]
  _turns: [],
  _busy: false,
  _rootId: null,
  _clockTimer: null,

  // A tiny whitelist shared with the proxy prompt — the AI may only ever
  // suggest commands the router actually understands.
  ALLOWED_SUGGESTIONS: ['today', 'my day', 'week', 'money', 'follow-ups', 'next visit', 'log expense', 'weather', 'help'],

  CHIP_LABELS: {
    today: "▸ Today's overview",
    'my day': '▸ My day',
    week: '▸ Weekly overview',
    money: '▸ Money & tax',
    'follow-ups': '▸ Follow-ups due',
    'next visit': '▸ Next visit',
    'log expense': '▸ Log an expense',
    weather: '▸ Weather',
    help: '▸ What can you ask?'
  },

  get aiPrefKey() {
    return (CONFIG.companion && CONFIG.companion.aiPreferenceKey) || 'advisoros_companion_ai';
  },

  /* ---------- lifecycle (called by TodayFeature) ---------- */

  mount(containerId) {
    this._rootId = containerId;
    const root = document.getElementById(containerId);
    if (!root) return;
    this.renderShell();
    const input = document.getElementById('comp-input');
    if (input) input.focus();
  },

  unmount() {
    if (this._clockTimer) { clearInterval(this._clockTimer); this._clockTimer = null; }
    try { HomeScreenController.stopDynamicHomeScreen(); } catch (e) { /* safe */ }
  },

  renderShell() {
    const root = document.getElementById(this._rootId);
    if (!root) return;
    root.innerHTML = `
      <div class="comp-root">
        <div class="comp-topbar">
          <span class="comp-brand">Beelo</span>
          <span class="comp-clock" id="comp-clock">${Utils.escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>
        </div>
        <div class="comp-scroll" id="comp-scroll"></div>
        <div class="comp-composer">
          <div class="comp-toolbar">
            <label class="comp-toggle-label ${AIService.isEnabled() ? '' : 'disabled'}">
              <input type="checkbox" id="comp-ai-toggle" ${this.aiPrefEnabled() ? 'checked' : ''} ${AIService.isEnabled() ? '' : 'disabled'}>
              <span class="comp-toggle-track"><span class="comp-toggle-thumb"></span></span>
              <span class="comp-toggle-text">Phrase with AI</span>
            </label>
          </div>
          <div class="comp-inputbar">
            <input type="text" id="comp-input" class="comp-input" placeholder="Ask me about your day, money, customers, follow-ups…" autocomplete="off">
            <button class="comp-send" id="comp-send" aria-label="Send" onclick="CompanionFeature.doSend()">
              <span class="material-symbols-rounded">arrow_upward</span>
            </button>
          </div>
        </div>
      </div>`;

    this._clockTimer = setInterval(() => {
      const el = document.getElementById('comp-clock');
      if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, 60000);

    const toggle = document.getElementById('comp-ai-toggle');
    if (toggle) {
      toggle.addEventListener('change', e => {
        try { localStorage.setItem(this.aiPrefKey, e.target.checked ? '1' : '0'); } catch (err) { /* private mode */ }
      });
    }
    const inputEl = document.getElementById('comp-input');
    if (inputEl) inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.doSend();
    });

    this.renderScroll();
  },

  aiPrefEnabled() {
    if (!AIService.isEnabled()) return false;
    try {
      const v = localStorage.getItem(this.aiPrefKey);
      return v === null ? true : v === '1';
    } catch (e) { return true; }
  },

  /* ---------- transcript rendering (scroll area only — original composer untouched) ---------- */

  renderScroll() {
    const scroll = document.getElementById('comp-scroll');
    if (!scroll) return;
    const inner = this._turns.length === 0 ? this.welcomeHtml() : this._turns.map(t =>
      t.role === 'user' ? this.userBubbleHtml(t.text) : this.assistantHtml(t)
    ).join('');
    scroll.innerHTML = inner;
    scroll.scrollTop = scroll.scrollHeight;
  },

  welcomeHtml() {
    const firstName = Utils.firstNameFrom(CONFIG.advisorName || '');
    const cards = [
      ['today', 'event_available', "Today's Overview", 'your day at a glance'],
      ['week', 'trending_up', 'Weekly Overview', 'earnings + sales'],
      ['money', 'payments', 'Money & Tax', 'expenses, mileage, tax'],
      ['follow-ups', 'campaign', 'Follow-ups Due', 'who needs a nudge'],
      ['next visit', 'near_me', 'Next Visit', 'who, when, how far'],
      ['log expense', 'receipt_long', 'Log Expense', 'scan or type a receipt']
    ];
    return `
      <div class="comp-welcome">
        <div class="comp-avatar comp-avatar-lg">B</div>
        <h2 class="comp-welcome-title">Hi, I'm Beelo.</h2>
        <p class="comp-welcome-sub">How can I help you today${firstName !== 'there' ? `, ${Utils.escapeHtml(firstName)}` : ''}?</p>
        <div class="comp-cards">
          ${cards.map(c => `
            <button class="comp-card" type="button" onclick="CompanionFeature.send('${c[0]}')">
              <span class="material-symbols-rounded comp-card-icon">${c[1]}</span>
              <span class="comp-card-body">
                <span class="comp-card-title">${c[2]}</span>
                <span class="comp-card-sub">${c[3]}</span>
              </span>
              <span class="material-symbols-rounded comp-card-arrow">chevron_right</span>
            </button>
          `).join('')}
        </div>
      </div>`;
  },

  userBubbleHtml(text) {
    return `<div class="comp-msg comp-msg-user"><div class="comp-bubble-user">${Utils.escapeHtml(text)}</div></div>`;
  },

  assistantHtml(turn) {
    const a = turn.answer;
    const typing = !!turn.typing;
    const text = typing ? null : (turn.phrase ? turn.phrase.reply : a.text);
    const suggestions = typing ? [] : (turn.phrase ? turn.phrase.suggestions : a.suggestions);
    const textHtml = text === null
      ? '<div class="comp-typing"><span></span><span></span><span></span></div>'
      : `<div class="comp-ai-text">${Utils.escapeHtml(text)}</div>`;
    return `
      <div class="comp-msg comp-msg-ai">
        <div class="comp-avatar comp-avatar-sm">B</div>
        <div class="comp-ai-body">
          ${a.facts && a.facts.length ? `
            <div class="comp-facts">
              ${a.facts.map(f => `
                <div class="comp-fact">
                  <span class="comp-fact-label">${Utils.escapeHtml(f.label)}</span>
                  <span class="comp-fact-value ${f.highlight ? 'comp-fact-value-hl' : ''}">${Utils.escapeHtml(f.value)}</span>
                </div>
              `).join('')}
            </div>` : ''}
          ${textHtml}
          ${a.actions && a.actions.length ? `
            <div class="comp-actions">
              ${a.actions.map(x => `<button class="comp-action" type="button" onclick="${x.onclick}">${Utils.escapeHtml(x.label)}</button>`).join('')}
            </div>` : ''}
          ${suggestions.length ? `
            <div class="comp-chips">
              ${suggestions.map(k => `<button class="comp-chip" type="button" onclick="CompanionFeature.send('${Utils.escapeJsString(k)}')">${Utils.escapeHtml(this.CHIP_LABELS[k] || k)}</button>`).join('')}
            </div>` : ''}
        </div>
      </div>`;
  },

  /* ---------- send flow ---------- */

  doSend() {
    const input = document.getElementById('comp-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.send(text);
  },

  // Public entry from suggestion chips AND the input line.
  async send(text) {
    const cleaned = String(text || '').trim();
    if (!cleaned || this._busy) return;

    this._turns.push({ role: 'user', text: cleaned });
    this.renderScroll();

    this._busy = true;
    this.setBusy(true);
    const key = this.normalizeCommand(cleaned);
    let answer = null;
    try {
      answer = await this.runCommand(key);
    } catch (e) {
      console.warn('Companion command failed:', e);
      answer = this.answerDefault();
    }
    this.setBusy(false);
    this._busy = false;

    const turn = { role: 'assistant', answer };
    this._turns.push(turn);
    this.renderScroll();

    if (AIService.isEnabled() && this.aiPrefEnabled()) {
      turn.typing = true;
      this.renderScroll();
      await this.phrase(turn, cleaned);
    }
  },

  setBusy(busy) {
    const btn = document.getElementById('comp-send');
    if (btn) btn.disabled = busy;
  },

  async phrase(turn, turnText) {
    let history = '';
    try {
      const max = (CONFIG.companion && CONFIG.companion.maxHistoryTurns) || 6;
      const pairs = this._turns.slice(-(max * 2) - 1, -1).map(t =>
        t.role === 'user' ? `advisor: ${t.text}` : `beelo: ${(t.phrase ? t.phrase.reply : t.answer.text) || ''}`
      );
      history = pairs.join('\n');
    } catch (e) { /* history is optional */ }

    let snapshot = {};
    try { snapshot = await this.buildSnapshot(); } catch (e) { /* snapshot is optional */ }

    const result = await AIService.assistantTurn({ snapshot, turnText, history });
    turn.typing = false;
    if (result.ok && result.reply) {
      turn.phrase = { reply: result.reply, suggestions: result.suggestions };
    }
    this.renderScroll();
  },

  /* ---------- intent routing ---------- */

  ALIASES: {
    today: ['today', 'overview', 'today\'s overview', 'today overview', 'todays overview', 'my day plan', 'plan'],
    'my day': ['my day', 'day', 'calendar', 'schedule', 'my week', 'week planner'],
    week: ['week', 'weekly', 'weekly overview', 'how am i doing this week', 'this week', 'target', 'sales'],
    money: ['money', 'tax', 'money & tax', 'finances', 'earnings', 'miles', 'mileage', 'expenses', 'records', 'cash'],
    'follow-ups': ['follow-ups', 'followups', 'follow up', 'follow-up', 'follow ups', 'reminders', 'nudges', 'who to chase'],
    'next visit': ['next visit', 'next', 'next appointment', 'up next', 'next customer', 'eta'],
    'log expense': ['log expense', 'log expenses', 'expense', 'add expense', 'receipt', 'scan receipt', 'mileage claim'],
    weather: ['weather', 'rain', 'forecast'],
    help: ['help', 'commands', 'what can you do', 'what can you ask', 'menu', 'options']
  },

  normalizeCommand(text) {
    const t = String(text).toLowerCase().trim().replace(/[?!.]+$/, '');
    if (['hi', 'hello', 'hey', 'morning', 'good morning', 'good afternoon', 'good evening', 'afternoon', 'evening', 'yo'].includes(t)) return 'greeting';
    for (const [key, aliases] of Object.entries(this.ALIASES)) {
      if (aliases.includes(t)) return key;
    }
    return 'default';
  },

  async runCommand(key) {
    const handler = this['answer' + key.charAt(0).toUpperCase() + key.slice(1)];
    if (!handler) return this.answerDefault();
    return await handler.call(this);
  },

  /* ---------- rule handlers — each returns {text, facts, actions, suggestions} ---------- */

  async answerToday() {
    const today = Utils.getToday();
    let appts = [];
    try {
      appts = (await DB.getAppointmentsForDate(today.toISOString()))
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) { /* no visits */ }
    const total = appts.length;
    const done = appts.filter(a => a.status === 'completed' || a.outcome).length;
    const next = appts.find(a => a.status !== 'completed') || null;
    const eta = next ? await this.etaFor(next) : null;

    let weather = null;
    try { weather = await WeatherService.getTodayWeather(); } catch (e) { /* off */ }

    const facts = [
      { label: 'Visits today', value: String(total) },
      { label: 'Done', value: String(done) }
    ];
    if (next) {
      facts.push({
        label: 'Next up',
        value: `${next.clientName || 'Customer'} · ${Utils.formatTime(next.date)}${eta ? ` · ${eta} away` : ''}`
      });
    }
    if (weather && Number.isFinite(weather.tempC)) {
      facts.push({ label: 'Weather', value: `${weather.tempC}°C` });
    }

    let text;
    if (total === 0) {
      text = `Nothing booked today${weather && Number.isFinite(weather.tempC) ? ` — ${weather.tempC}°C out there` : ''}. A good day for follow-ups if you have a moment.`;
    } else if (done === total) {
      text = `All ${total} visit${total === 1 ? '' : 's'} done — great day.` + (weather && Number.isFinite(weather.tempC) ? ` (${weather.tempC}°C out there.)` : '');
    } else {
      text = `${total - done} visit${total - done === 1 ? '' : 's'} to go${next ? ` — ${next.clientName || 'Customer'} at ${Utils.formatTime(next.date)}${eta ? `, about ${eta} away` : ''} is next` : ''}.`;
    }
    return {
      text,
      facts,
      actions: [
        { label: 'My Day calendar', onclick: "CompanionFeature.openMyDay()" },
        { label: 'Open Visits', onclick: "App.navigate('appointments', {tab: 'upcoming'})" }
      ],
      suggestions: ['week', 'money', 'follow-ups']
    };
  },

  async answerWeek() {
    const start = Utils.getStartOfWeek();
    const end = Utils.getEndOfWeek();
    let stats = { sales: 0, earnings: 0, orderedCount: 0 };
    try { stats = await DB.getWeekStats(start.toISOString(), end.toISOString()); } catch (e) { /* empty week */ }
    const target = CONFIG.weeklyTarget || 600;
    const gap = Math.max(0, target - stats.earnings);

    return {
      text: gap > 0
        ? `${Utils.formatCurrency(gap)} to your earnings target this week — ${stats.orderedCount} order${stats.orderedCount === 1 ? '' : 's'} so far.`
        : `Target hit — ${Utils.formatCurrency(stats.earnings)} earned against a ${Utils.formatCurrency(target)} target this week, with ${stats.orderedCount} order${stats.orderedCount === 1 ? '' : 's'}.`,
      facts: [
        { label: 'Earnings', value: Utils.formatCurrency(stats.earnings), highlight: true },
        { label: 'Sales value', value: Utils.formatCurrency(stats.sales) },
        { label: 'Target', value: Utils.formatCurrency(target) },
        { label: 'Orders', value: String(stats.orderedCount) }
      ],
      actions: [{ label: 'Open Money', onclick: "App.navigate('money')" }],
      suggestions: ['today', 'money', 'follow-ups']
    };
  },

  async answerMoney() {
    let weekEarnings = 0;
    try { weekEarnings = await MoneyFeature.getWeekEarnings(); } catch (e) {}
    const target = CONFIG.weeklyTarget || 600;
    const gap = Math.max(0, target - weekEarnings);

    const now = new Date();
    const monthStart = Utils.getStartOfMonth(now);
    let monthTotal = 0;
    let monthMiles = 0;
    try {
      const expenses = await DB.getExpensesForPeriod(monthStart.toISOString(), now.toISOString());
      monthTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    } catch (e) {}
    try {
      const trips = await DB.getTripsForPeriod(monthStart.toISOString(), now.toISOString());
      monthMiles = trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    } catch (e) {}
    const mileageClaim = TaxCalculator.calculateMileageClaim(monthMiles);

    let taxDue = null;
    try {
      const ts = await TaxCalculator.getRunningEstimate();
      if (ts && ts.tax) taxDue = ts.taxDue;
    } catch (e) {}

    const facts = [
      { label: 'This week earned', value: Utils.formatCurrency(weekEarnings), highlight: true },
      { label: 'Earnings target', value: Utils.formatCurrency(gap) },
      { label: 'Expenses this month', value: Utils.formatCurrency(monthTotal) },
      { label: 'Mileage claim', value: `${Utils.formatDistance(monthMiles)} · ${Utils.formatCurrency(mileageClaim)}` }
    ];
    if (taxDue !== null) facts.push({ label: 'Tax estimate', value: `${Utils.formatCurrency(taxDue)} ~31 Jan` });

    return {
      text: gap > 0
        ? `${Utils.formatCurrency(gap)} remaining to this week's target. ${Utils.formatCurrency(monthTotal)} of expenses logged this month.`
        : `You're past this week's target — nice one. ${Utils.formatCurrency(monthTotal)} of expenses logged this month.`,
      facts,
      actions: [
        { label: 'Open Money', onclick: "App.navigate('money')" },
        { label: 'Log Expense', onclick: "MoneyFeature.openExpenseModal()" },
        { label: 'View Records', onclick: "MoneyFeature.openRecordsModal()" }
      ],
      suggestions: ['week', 'today', 'follow-ups']
    };
  },

  async answerFollowUps() {
    let tasks = [];
    try { tasks = await FollowupsFeature.loadTasks(); } catch (e) {}
    const due = tasks.filter(t => t.due);
    const nameOf = t =>
      (t.customer && (t.customer.firstName || t.customer.fullName)) ||
      (t.appointment && t.appointment.clientName) ||
      (t.order && t.order.orderNumber) ||
      'Someone';

    const facts = due.slice(0, 5).map(t => ({
      label: nameOf(t),
      value: String(t.action).replace(/\s*[—–-]\s*not sent yet$/, '')
    }));

    return {
      text: due.length === 0
        ? 'All caught up — nothing due right now.'
        : `${due.length} thing${due.length === 1 ? '' : 's'} due today${due[0] ? ` — ${nameOf(due[0]).split(' ')[0]} first` : ''}.`,
      facts,
      actions: [{ label: 'Open Follow-ups', onclick: "App.navigate('followups')" }],
      suggestions: ['today', 'money', 'week']
    };
  },

  async answerNextVisit() {
    let upcoming = [];
    try { upcoming = await DB.getUpcomingAppointments(3); } catch (e) {}
    const next = upcoming.find(a => a.status !== 'cancelled' && (a.phone || a.customerId)) || upcoming.find(a => a.status !== 'cancelled') || null;

    if (!next) {
      return { text: 'No upcoming visits booked. Add one and I\'ll keep an eye on it.', facts: [], actions: [{ label: 'Add Visit', onclick: "App.navigate('appointments', {action: 'add'})" }], suggestions: ['today', 'week'] };
    }

    const eta = await this.etaFor(next);
    const facts = [
      { label: 'Next visit', value: `${next.clientName || 'Customer'} · ${Utils.formatDate(next.date, 'long')}` },
      { label: 'Time', value: Utils.formatTime(next.date) },
      { label: 'Address', value: next.address || 'No address set' }
    ];
    if (eta) facts.push({ label: 'Drive', value: eta });

    return {
      text: `Next up: ${next.clientName || 'Customer'} at ${Utils.formatTime(next.date)}${eta ? ` — about ${eta} away` : ''}.`,
      facts,
      actions: [
        { label: 'Navigate', onclick: `AppointmentsFeature.navigateToVisit('${Utils.escapeJsString(next.address || '')}', ${next.id})` },
        { label: 'Draft morning message', onclick: `TalkFeature.sendMessage(${next.id}, 'morning_of')` }
      ],
      suggestions: ['today', 'weather', 'follow-ups']
    };
  },

  async answerLogExpense() {
    return {
      text: "Open the expense sheet and either scan a receipt photo or type it in — I'll file it under the right category. (Receipts are scanned with Claude when AI is on.)",
      facts: [],
      actions: [{ label: 'Log Expense', onclick: "MoneyFeature.openExpenseModal()" }],
      suggestions: ['money', 'week', 'today']
    };
  },

  async answerWeather() {
    let weather = null;
    try { weather = await WeatherService.getTodayWeather(); } catch (e) {}
    if (!weather || !Number.isFinite(weather.tempC)) {
      return { text: "I couldn't fetch the weather right now (location not set or offline).", facts: [], actions: [], suggestions: ['today', 'next visit', 'week'] };
    }
    const label = weather.icon === 'rainy' || weather.icon === 'thunderstorm'
      ? 'Take the coat'
      : weather.icon === 'ac_unit' ? 'Chilly out there'
      : weather.icon === 'wb_sunny' ? 'Nice and bright out there'
      : 'Steady weather out there';
    return {
      text: `It's ${weather.tempC}°C${label ? ` — ${label}.` : '.'}`,
      facts: [{ label: 'Now', value: `${weather.tempC}°C` }],
      actions: [],
      suggestions: ['today', 'next visit', 'week']
    };
  },

  async answerHelp() {
    return {
      text: "Ask me about your day, the week's earnings and sales, money & tax, follow-ups due, the next visit, the weather — or log an expense. Tap a chip or just type it.",
      facts: [],
      actions: [],
      suggestions: ['today', 'week', 'money', 'follow-ups', 'next visit', 'log expense', 'weather']
    };
  },

  async answerGreeting() {
    const h = new Date().getHours();
    const part = h < 5 ? 'Working late' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Late shift';
    let count = 0;
    try { count = await FollowupsFeature.getDueCount(); } catch (e) {}
    return {
      text: `${part}, ${Utils.firstNameFrom(CONFIG.advisorName || '')}${count > 0 ? ` — ${count} thing${count === 1 ? '' : 's'} due today` : ' — all caught up'}. What would help?`,
      facts: [],
      actions: [],
      suggestions: ['today', 'week', 'money', 'follow-ups']
    };
  },

  answerDefault() {
    return {
      text: "I can't look that up yet — but I can help with any of these.",
      facts: [],
      actions: [],
      suggestions: ['today', 'week', 'money', 'follow-ups', 'next visit', 'help']
    };
  },

  /* ---------- actions ---------- */

  openMyDay() {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h3>My Day</h3><button class="btn btn-ghost btn-sm" onclick="HomeScreenController.stopDynamicHomeScreen(); App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body p-0" style="min-height:72vh;">
        <div id="companion-myday-root"></div>
        <div class="p-md" >
          <button class="btn btn-primary btn-block" onclick="HomeScreenController.stopDynamicHomeScreen(); App.closeModal()">Back to Beelo</button>
        </div>
      </div>`;
    App.openModal(content);
    try { HomeScreenController.renderDynamicHomeScreen('companion-myday-root'); } catch (e) {
      console.warn('My Day panel failed:', e);
    }
  },

  async etaFor(appt) {
    try {
      if (!appt) return null;
      let toLatLng = Array.isArray(appt.latLng) ? appt.latLng : null;
      if (!toLatLng && appt.address) {
        const geo = await Utils.withTimeout(Geo.geocode(appt.address), 2500, { resolveOnTimeout: null });
        if (geo) toLatLng = [geo.lat, geo.lng];
      }
      if (!toLatLng) return null;
      let from = null;
      try {
        const base = await Utils.withTimeout(RouteFeature.getBasePoint(), 2500, { resolveOnTimeout: null });
        if (Array.isArray(base && base.latLng)) from = base.latLng;
      } catch (e) {}
      if (!from) return null;
      const km = RouteFeature.calculateLegKm(from, toLatLng);
      if (!km || km <= 0) return null;
      return `${Math.max(1, Math.round((km / 35) * 60))} min`;
    } catch (e) { return null; }
  },

  /* ---------- snapshot for the AI phrasing ---------- */

  async buildSnapshot() {
    const today = Utils.getToday();
    let appts = [];
    try {
      appts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
    } catch (e) {}

    const weekStart = Utils.getStartOfWeek();
    const weekEnd = Utils.getEndOfWeek();
    let week = { sales: 0, earnings: 0, orderedCount: 0 };
    try { week = await DB.getWeekStats(weekStart.toISOString(), weekEnd.toISOString()); } catch (e) {}
    const target = CONFIG.weeklyTarget || 600;

    let monthExpenses = 0;
    let monthMiles = 0;
    try {
      const ms = Utils.getStartOfMonth(new Date());
      const now = new Date();
      const expenses = await DB.getExpensesForPeriod(ms.toISOString(), now.toISOString());
      monthExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      const trips = await DB.getTripsForPeriod(ms.toISOString(), now.toISOString());
      monthMiles = trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    } catch (e) {}

    let due = [];
    try {
      due = (await FollowupsFeature.loadTasks()).filter(t => t.due).slice(0, 5).map(t => ({
        customer: (t.customer && (t.customer.firstName || t.customer.fullName)) || (t.appointment && t.appointment.clientName) || (t.order && t.order.orderNumber) || 'Someone',
        action: String(t.action || '').replace(/\s*[—–-]\s*not sent yet$/, '')
      }));
    } catch (e) {}

    let weather = null;
    try { weather = await WeatherService.getTodayWeather(); } catch (e) {}

    return {
      advisor_name: CONFIG.advisorName || 'Advisor',
      today: {
        date: Utils.formatDate(today, 'iso'),
        visits: appts.map(a => ({
          name: a.clientName || 'Customer',
          time: Utils.formatTime(a.date),
          address: a.address || '',
          status: a.status || '',
          outcome: a.outcome || ''
        }))
      },
      week: { sales: week.sales, earnings: week.earnings, ordered_count: week.orderedCount, target, target_gap: Math.max(0, target - week.earnings) },
      month: { expenses_total: monthExpenses, mileage_km: monthMiles },
      follow_ups_due: due,
      weather: weather && Number.isFinite(weather.tempC) ? { temp_c: weather.tempC, condition: weather.icon || null } : null
    };
  }
};

App.registerFeature(CompanionFeature);