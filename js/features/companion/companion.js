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
  name: 'Companion',
  icon: 'psychology',
  route: false,
  // Session transcript: [{role:'user', text} | {role:'assistant', answer, phrase?}]
  _turns: [],
  _busy: false,
  _rootId: null,
  _clockTimer: null,

  // A tiny whitelist shared with the proxy prompt — the AI may only ever
  // suggest commands the router actually understands.
  ALLOWED_SUGGESTIONS: ['today', 'my day', 'week', 'money', 'follow-ups', 'next visit', 'log expense', 'messages', 'orders', 'weather', 'help'],

  CHIP_LABELS: {
    today: "▸ Today's overview",
    'my day': '▸ My day',
    week: '▸ Weekly overview',
    money: '▸ Money & tax',
    'follow-ups': '▸ Follow-ups due',
    'next visit': '▸ Next visit',
    'log expense': '▸ Log an expense',
    messages: '▸ What messages are due?',
    orders: '▸ Who hasn\'t paid?',
    weather: '▸ Weather',
    help: '▸ What can you ask?',
    'after visit': '▸ What should I do now?',
    'evening review': '▸ What have I missed?'
  },

  get aiPrefKey() {
    return (CONFIG.companion && CONFIG.companion.aiPreferenceKey) || 'advisoros_companion_ai';
  },

  render() {
    return `<div id="companion-root" class="comp-page"></div>`;
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
          <span class="comp-clock" id="comp-clock">${Utils.escapeHtml(Utils.formatTimeUK())}</span>
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
      if (el) el.textContent = Utils.formatTimeUK();
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
    if (this._turns.length === 0) {
      // First paint: welcome shell immediately, live chips when they land.
      scroll.innerHTML = this.welcomeHtml([]);
      this.buildWelcomeChips().then(chips => {
        const again = document.getElementById('comp-scroll');
        if (again && this._turns.length === 0 && again.innerHTML) {
          again.innerHTML = this.welcomeHtml(chips);
        }
      }).catch(() => { /* static cards seen already */ });
      return;
    }
    const inner = this._turns.map(t =>
      t.role === 'user' ? this.userBubbleHtml(t.text) : this.assistantHtml(t)
    ).join('');
    scroll.innerHTML = inner;
    scroll.scrollTop = scroll.scrollHeight;
  },

  welcomeHtml(chips) {
    const firstName = Utils.firstNameFrom(CONFIG.advisorName || '');
    const cards = (chips && chips.length ? chips : [
      ["Today's Overview", 'event_available', 'your day at a glance', 'today'],
      ['Weekly Overview', 'trending_up', 'earnings + sales', 'week'],
      ['Money & Tax', 'payments', 'expenses, mileage, tax', 'money'],
      ['Follow-ups Due', 'campaign', 'who needs a nudge', 'follow-ups'],
      ['Next Visit', 'near_me', 'who, when, how far', 'next visit'],
      ['Log Expense', 'receipt_long', 'scan or type a receipt', 'log expense']
    ]);
    return `
      <div class="comp-welcome">
        <div class="comp-avatar comp-avatar-lg">B</div>
        <h2 class="comp-welcome-title">Hi, I'm Beelo.</h2>
        <p class="comp-welcome-sub">${firstName !== 'there' ? `Morning, ${Utils.escapeHtml(firstName)}.` : 'Morning.'} What would help?</p>
        <div class="comp-cards">
          ${cards.map(card => `
            <button class="comp-card" type="button" onclick="CompanionFeature.send(${Utils.escapeJsString(JSON.stringify(card[3]))})">
              <span class="material-symbols-rounded comp-card-icon">${card[1]}</span>
              <span class="comp-card-body">
                <span class="comp-card-title">${Utils.escapeHtml(card[2])}</span>
                <span class="comp-card-sub">${Utils.escapeHtml(card[0])}</span>
              </span>
              <span class="material-symbols-rounded comp-card-arrow">chevron_right</span>
            </button>
          `).join('')}
        </div>
      </div>`;
  },

  // Live, data-driven welcome chips: real names/times/amounts the advisor
  // actually cares about right now. Falls back to the static card bag when
  // a data source is missing or offline.
  async buildWelcomeChips() {
    const chips = [];
    const hour = Utils.hourUK();
    try {
      const today = Utils.getToday();
      const todayAppts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
      const doneToday = todayAppts.filter(a => a.outcome || a.status === 'completed');
      const pendingToday = todayAppts.filter(a => !a.outcome && a.status !== 'completed');
      const upcoming = await DB.getUpcomingAppointments(14);
      const next = upcoming.find(a => a.status !== 'cancelled' && (a.phone || a.customerId)) || upcoming.find(a => a.status !== 'cancelled') || null;

      if (next) {
        chips.push(['Next visit', 'near_me', `${next.clientName || 'Customer'} · ${Utils.formatDateUK(next.date, 'short')} ${Utils.formatTimeUK(next.date)}`, 'next visit']);
      }
      const introOwed = upcoming.find(a => a.status === 'confirmed' && !a.introSent && (a.phone || a.customerId));
      if (introOwed) {
        chips.push(['Intro to send', 'waving_hand', `${introOwed.clientName || 'Customer'} · ${Utils.formatDateUK(introOwed.date, 'short')}`, 'messages']);
      }
      // After visit: show if there's a completed visit today
      if (doneToday.length && (hour < 18 || pendingToday.length)) {
        chips.push(['What now?', 'check_circle', `${doneToday[0].clientName || 'Customer'} done${pendingToday.length ? ` · ${pendingToday.length} more today` : ''}`, 'after visit']);
      }
      // Evening review: show in afternoon/evening
      if (hour >= 16) {
        chips.push(['Evening review', 'wb_sunny', 'Unsent messages, unlogged outcomes, unpaid', 'evening review']);
      }
    } catch (e) { /* chips are optional */ }
    try {
      const orders = await DB.db.orders.toArray();
      const openTotal = orders.reduce((s, o) => s + (o.balanceDue || 0), 0);
      const owed = orders.filter(o => (o.balanceDue || 0) > 0).sort((a, b) => (b.balanceDue || 0) - (a.balanceDue || 0));
      if (owed.length) {
        const cust = owed[0].customerId ? await DB.db.customers.get(owed[0].customerId) : null;
        chips.push(['Unpaid', 'payments', `${Utils.formatCurrency(openTotal)}${owed.length > 1 ? ` over ${owed.length} orders` : cust ? ' — ' + (cust.firstName || cust.fullName) : ''}`, 'orders']);
      }
    } catch (e) { /* chips are optional */ }
    try {
      const target = CONFIG.weeklyTarget || 600;
      const weekEarnings = await MoneyFeature.getWeekEarnings();
      if (weekEarnings < target) {
        chips.push(['Target', 'trending_up', `${Utils.formatCurrency(target - weekEarnings)} to this week's target`, 'week']);
      }
    } catch (e) { /* chips are optional */ }
    return chips.slice(0, 5);
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
      if (key !== 'default') {
        answer = await this.runCommand(key, cleaned);
      } else {
        answer = await this.tryParseQuery(cleaned);
        if (!answer) answer = await this.tryAiRoute(cleaned);
      }
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
    'follow-ups': ['follow-ups', 'followups', 'follow up', 'follow-up', 'follow ups', 'reminders', 'nudges', 'who to chase', 'quotes', 'quote'],
    'next visit': ['next visit', 'next', 'next appointment', 'up next', 'next customer', 'eta'],
    'log expense': ['log expense', 'log expenses', 'expense', 'add expense', 'receipt', 'scan receipt', 'mileage claim'],
    messages: ['messages', 'message', 'what messages', 'who to text', 'who to message', 'texts', 'sends', 'what to send', 'drafts', 'intro', 'send'],
    orders: ['orders', 'order', 'unpaid', 'owe', 'owing', 'outstanding', 'who hasn\'t paid', 'haven\'t paid', 'payment', 'payments', 'receipts'],
    weather: ['weather', 'rain', 'forecast'],
    help: ['help', 'commands', 'what can you do', 'what can you ask', 'menu', 'options'],
    // Post-appointment & evening review
    'after visit': ['after visit', 'after appointment', 'what now', 'what next', 'just finished', 'done with visit', 'post visit'],
    'evening review': ['evening review', 'end of day', 'what did i miss', 'what have i missed', 'evening', 'wrap up', 'day review']
  },

  normalizeCommand(text) {
    const t = String(text).toLowerCase().trim().replace(/[?!.]+$/, '');
    if (['hi', 'hello', 'hey', 'morning', 'good morning', 'good afternoon', 'good evening', 'afternoon', 'evening', 'yo'].includes(t)) return 'greeting';
    for (const [key, aliases] of Object.entries(this.ALIASES)) {
      if (aliases.includes(t)) return key;
    }
    return 'default';
  },

  // Stage 2 of the router: pure-text extractors that never need AI. Each
  // returns an answer only when the text clearly matches; a return of null
  // means "not my text — keep looking".
  async tryParseQuery(text) {
    const t = String(text).toLowerCase();

    // Period questions: "last week", "june", "march 2026", "2026-06".
    const period = this.extractPeriod(t);
    if (period) return this.answerMoneyPeriod(period);

    // "who hasn't paid" is routed by alias above; a raw order number is not.
    if (/\border\b/.test(t) && /\d{4,}/.test(t)) {
      return this.answerOrders(this.extractOrderNumber(t));
    }

    // Relative day questions: "tomorrow", "this weekend", "on monday".
    const dayRange = this.extractDayRange(t);
    if (dayRange) return this.answerWhen(dayRange);

    // "what about sarah" → person search.
    if (this.looksLikeNameQuery(t)) {
      const answer = await this.answerPerson(text);
      if (answer) return answer;
    }

    return null;
  },

  looksLikeNameQuery(t) {
    const cleaned = String(t).replace(/^(what about|tell me about|about|and|do you know|who is|who's|how is|how's|whats up with|what's up with|with|on|for)\s+/i, '').trim();
    return !!cleaned && /[a-z]{2,}/i.test(cleaned);
  },

  extractOrderNumber(t) {
    const m = String(t).match(/(\d{4,})/);
    return m ? m[1] : null;
  },

  extractPeriod(t) {
    const now = new Date();
    const startOfWeek = Utils.getStartOfWeek();
    const startOfMonth = Utils.getStartOfMonth(now);
    const iso = d => {
      const x = new Date(d);
      x.setHours(12, 0, 0, 0);
      return x.toISOString();
    };
    let start = null;
    let end = null;
    let label = '';

    if (/last week/.test(t)) {
      start = new Date(startOfWeek.getTime() - 7 * 86400000);
      end = new Date(startOfWeek.getTime() - 1);
      label = 'Last week';
    } else if (/this month/.test(t)) {
      start = new Date(startOfMonth);
      end = now;
      label = 'This month';
    } else if (/last month/.test(t)) {
      start = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1);
      end = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), 0, 23, 59, 59);
      label = 'Last month';
    } else if (/\b(20\d{2})(?:-|\/)(\d{1,2})\b/.test(t)) {
      const m = t.match(/\b(20\d{2})(?:-|\/)(\d{1,2})\b/);
      const yr = +m[1];
      const mo = +m[2] - 1;
      start = new Date(yr, mo, 1);
      end = new Date(yr, mo + 1, 0, 23, 59, 59);
      label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    } else {
      const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const matches = MONTHS.filter(m => new RegExp('\\b' + m + '\\b').test(t));
      if (matches.length) {
        const i = MONTHS.indexOf(matches[matches.length - 1]);
        const yrMatch = t.match(/\b(20\d{2})\b/);
        const yr = yrMatch ? +yrMatch[1] : now.getFullYear();
        start = new Date(yr, i, 1);
        end = new Date(yr, i + 1, 0, 23, 59, 59);
        label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      }
    }
    if (!start) return null;
    return { start: iso(start), end: iso(end), label };
  },

  extractDayRange(t) {
    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    let start = null;
    let label = '';

    if (/tomorrow/.test(t)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      label = 'Tomorrow';
    } else if (/this weekend/.test(t)) {
      const daysToSat = (7 - now.getDay()) % 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (daysToSat === 0 ? 7 : daysToSat));
      label = 'This weekend';
    } else {
      const named = DAYS.find(d => new RegExp('\\b' + d + '\\b').test(t));
      if (named) {
        const idx = DAYS.indexOf(named);
        const diff = (idx - now.getDay() + 7) % 7 || 7;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
        label = dayNames[idx];
      }
    }
    if (!start) return null;
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    end.setMilliseconds(-1);
    return { start: start.toISOString(), end: end.toISOString(), label };
  },

  async tryAiRoute(text) {
    // AI router: the model only classifies which rule command this is — the
    // answer itself always comes from the deterministic handlers on real
    // data. Returns null when the model is off, disowned, or unsure.
    if (!AIService.isEnabled() || !this.aiPrefEnabled()) return null;
    let verdict = null;
    try { verdict = await AIService.routeCommand(text); } catch (e) { return null; }
    if (!verdict || !verdict.ok || !verdict.command) return null;
    if (verdict.command === 'person') return this.answerPerson(text);
    if (typeof this['answer' + verdict.command.charAt(0).toUpperCase() + verdict.command.slice(1)] !== 'function') return null;
    return this.runCommand(verdict.command, text);
  },

  async runCommand(key, text) {
    const handler = this['answer' + key.charAt(0).toUpperCase() + key.slice(1)];
    if (!handler) return this.answerDefault();
    return await handler.call(this, text);
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
        value: `${next.clientName || 'Customer'} · ${Utils.formatTimeUK(next.date)}${eta ? ` · ${eta} away` : ''}`
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
      text = `${total - done} visit${total - done === 1 ? '' : 's'} to go${next ? ` — ${next.clientName || 'Customer'} at ${Utils.formatTimeUK(next.date)}${eta ? `, about ${eta} away` : ''} is next` : ''}.`;
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

  async answerFollowUps(text) {
    let tasks = [];
    try { tasks = await FollowupsFeature.loadTasks(); } catch (e) {}
    const t = String(text || '').toLowerCase();
    let kind = null;
    if (/quote|quotes|chase/.test(t)) kind = 'quote';
    else if (/post.?fit|thank|acknowledge/.test(t)) kind = 'post_fit';
    else if (/service|issue/.test(t)) kind = 'service';
    else if (/intro/.test(t)) kind = 'intro';
    else if (/payment|paid/.test(t)) kind = 'payment';

    const due = tasks.filter(x => x.due && (!kind || x.kind === kind));
    const kindLabel = kind ? kind.replace('_', ' ') : '';
    const nameOf = x =>
      (x.customer && (x.customer.firstName || x.customer.fullName)) ||
      (x.appointment && x.appointment.clientName) ||
      (x.order && x.order.orderNumber) ||
      'Someone';

    if (kind && !due.length) {
      return {
        text: `No ${kindLabel} tasks due right now — all clear.`,
        facts: [],
        actions: [{ label: 'Open Follow-ups', onclick: "App.navigate('followups')" }],
        suggestions: ['today', 'money', 'messages']
      };
    }

    const facts = due.slice(0, 5).map(x => ({
      label: nameOf(x),
      value: String(x.action).replace(/\s*[—–-]\s*not sent yet$/, '')
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
    try { upcoming = await DB.getUpcomingAppointments(14); } catch (e) {}
    const next = upcoming.find(a => a.status !== 'cancelled' && (a.phone || a.customerId)) || upcoming.find(a => a.status !== 'cancelled') || null;

    if (!next) {
      return { text: 'No upcoming visits booked. Add one and I\'ll keep an eye on it.', facts: [], actions: [{ label: 'Add Visit', onclick: "App.navigate('appointments', {action: 'add'})" }], suggestions: ['today', 'week'] };
    }

    const eta = await this.etaFor(next);
    const facts = [
      { label: 'Next visit', value: `${next.clientName || 'Customer'} · ${Utils.formatDateUK(next.date, 'long')}` },
      { label: 'Time', value: Utils.formatTimeUK(next.date) },
      { label: 'Address', value: next.address || 'No address set' }
    ];
    if (eta) facts.push({ label: 'Drive', value: eta });

    return {
      text: `Next up: ${next.clientName || 'Customer'} at ${Utils.formatTimeUK(next.date)}${eta ? ` — about ${eta} away` : ''}.`,
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
      text: "Ask in plain words — I read your real data: names (\"what about Sarah?\"), money periods (\"how much in June?\", \"last week\"), orders and unpaid (\"who hasn't paid?\"), dates (\"tomorrow\", \"this weekend\") and messages due (\"what messages are owed?\"). Tap a chip or type it.",
      facts: [],
      actions: [],
      suggestions: ['today', 'money', 'follow-ups', 'messages', 'orders', 'next visit']
    };
  },

  async answerGreeting() {
    const h = Utils.hourUK();
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
      text: "I can't look that up — but I can help with your day, money, visits, follow-ups, or orders.",
      facts: [],
      actions: [],
      suggestions: ['today', 'week', 'money', 'follow-ups', 'next visit', 'help']
    };
  },

  /* ---------- deep rules — person, periods, orders, dates, messages ---------- */

  async answerPerson(text) {
    const q = String(text).replace(/^(what about|tell me about|about|and|do you know|who is|who's|how is|how's|whats up with|what's up with|with|on|for)\s*/i, '').replace(/[?!.]+$/, '').trim();
    if (q.length < 2) return null;
    let results = [];
    try { results = await Search.search(q, { limit: 15 }); } catch (e) {}
    const customers = results.filter(r => r.type === 'customer');
    if (!customers.length) return null;

    if (customers.length > 1) {
      return {
        text: `${customers.length} people match "${q}" — which one?`,
        facts: customers.slice(0, 4).map(c => ({ label: c.title, value: c.detail || c.subtitle })),
        actions: [],
        suggestions: []
      };
    }

    const c = customers[0].data;
    let appts = [];
    let orders = [];
    try { appts = await DB.db.appointments.where('customerId').equals(c.id).toArray(); } catch (e) {}
    try { orders = await DB.db.orders.where('customerId').equals(c.id).toArray(); } catch (e) {}

    const now = new Date();
    const upcoming = appts
      .filter(a => a.status !== 'cancelled' && new Date(a.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const past = appts
      .filter(a => a.status !== 'cancelled' && new Date(a.date) < now)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const next = upcoming[0] || null;
    const lastVisit = past[0] || null;
    const outstanding = orders.reduce((s, o) => s + (o.balanceDue || 0), 0);

    const facts = [];
    if (next) {
      facts.push({ label: 'Next visit', value: `${Utils.formatDateUK(next.date, 'short')} · ${Utils.formatTimeUK(next.date)}` });
    }
    if (lastVisit) {
      facts.push({ label: 'Last visit', value: `${Utils.formatDateUK(lastVisit.date, 'short')}${lastVisit.outcome ? ' — ' + String(lastVisit.outcome).replace(/_/g, ' ') : ''}` });
    }
    if (outstanding > 0) facts.push({ label: 'Outstanding', value: Utils.formatCurrency(outstanding), highlight: true });
    if (next && !next.introSent && (next.phone || next.customerId)) facts.push({ label: 'Intro message', value: 'Not sent yet' });

    const actions = [];
    actions.push({ label: 'Open profile', onclick: `App.navigate('customer', { id: ${c.id} })` });
    if (next && !next.introSent && (next.phone || next.customerId)) {
      actions.push({ label: 'Draft intro', onclick: `TalkFeature.sendMessage(${next.id}, 'pre_intro')` });
    } else if (next) {
      actions.push({ label: 'Draft message', onclick: `TalkFeature.sendMessage(${next.id}, 'evening_before')` });
    }

    return {
      text: `${c.fullName || c.firstName}${next ? ` — booked ${Utils.formatDateUK(next.date, 'short')} at ${Utils.formatTimeUK(next.date)}` : lastVisit ? ` — last seen ${Utils.formatDateUK(lastVisit.date, 'short')}` : ''}.`,
      facts,
      actions,
      suggestions: ['messages', 'money', 'follow-ups']
    };
  },

  async answerOrders(orderNumber) {
    let orders = [];
    try { orders = await DB.db.orders.toArray(); } catch (e) {}

    if (orderNumber) {
      const groups = String(orderNumber).match(/\d+/g);
      const num = groups ? groups[groups.length - 1].replace(/^0+/, '') : '';
      const match = orders.find(o => String(o.orderNumber || '').replace(/^0+/, '').includes(num) || String(o.orderNumber || '').replace(/\D/g, '').endsWith(num)) || null;
      if (!match) {
        return {
          text: `No order matching "${orderNumber}" — check the number on the order card.`,
          facts: [],
          actions: [{ label: 'Open Orders', onclick: "App.navigate('orders')" }],
          suggestions: ['money', 'follow-ups']
        };
      }
      const cust = match.customerId ? await DB.db.customers.get(match.customerId) : null;
      const due = match.balanceDue || 0;
      return {
        text: `${match.orderNumber} — ${cust ? cust.fullName : 'customer'} · ${match.stage || match.status || 'ordered'}.`,
        facts: [
          { label: 'Total', value: Utils.formatCurrency(match.total || 0) },
          { label: 'Paid', value: Utils.formatCurrency((match.total || 0) - due) },
          { label: 'Balance due', value: Utils.formatCurrency(due), highlight: due > 0 },
          { label: 'Stage', value: match.stage || match.status || 'ordered' }
        ],
        actions: [{ label: 'Open order', onclick: `OrdersFeature.openOrderSheet(${match.id})` }],
        suggestions: ['money', 'messages']
      };
    }

    const open = orders
      .filter(o => (o.balanceDue || 0) > 0)
      .sort((a, b) => (b.balanceDue || 0) - (a.balanceDue || 0));
    if (!open.length) {
      return {
        text: 'Nothing outstanding — every order is settled.',
        facts: [],
        actions: [{ label: 'Open Orders', onclick: "App.navigate('orders')" }],
        suggestions: ['money', 'week']
      };
    }

    const ids = [...new Set(open.map(o => o.customerId).filter(Boolean))];
    const names = new Map();
    try {
      const fetched = ids.length ? await DB.db.customers.bulkGet(ids) : [];
      for (const cust of fetched) if (cust) names.set(cust.id, cust.fullName || cust.firstName);
    } catch (e) {}

    const totalDue = open.reduce((s, o) => s + (o.balanceDue || 0), 0);
    const facts = open.slice(0, 5).map(o => ({
      label: names.get(o.customerId) || o.orderNumber,
      value: Utils.formatCurrency(o.balanceDue || 0)
    }));

    return {
      text: `${open.length} order${open.length === 1 ? '' : 's'} still owe ${Utils.formatCurrency(totalDue)}${open[0] ? ` — ${names.get(open[0].customerId) || open[0].orderNumber} first` : ''}.`,
      facts,
      actions: [
        { label: 'Open Orders', onclick: "App.navigate('orders')" },
        { label: 'Record Payment', onclick: `OrdersFeature.openOrderSheet(${open[0].id})` }
      ],
      suggestions: ['money', 'messages', 'follow-ups']
    };
  },

  async answerMoneyPeriod(range) {
    // Normalize the period to whole days, then reuse the canonical weekly
    // statistics (DB.getWeekStats) — the same source the Money and Today
    // screens use — instead of re-implementing the ordered/commission
    // accumulation here.
    const start = new Date(range.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(range.end);
    end.setHours(23, 59, 59, 999);
    let periodStats = { sales: 0, earnings: 0, orderedCount: 0 };
    try {
      periodStats = await DB.getWeekStats(start.toISOString(), end.toISOString());
    } catch (e) { /* empty period */ }

    let expenses = [];
    let trips = [];
    let monthTotal = 0;
    let monthMiles = 0;
    try { expenses = await DB.getExpensesForPeriod(start.toISOString(), end.toISOString()); } catch (e) {}
    try { trips = await DB.getTripsForPeriod(start.toISOString(), end.toISOString()); } catch (e) {}
    monthTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    monthMiles = trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    const mileageClaim = TaxCalculator.calculateMileageClaim(monthMiles);

    const catTotals = {};
    for (const e of expenses) {
      const key = e.category || 'Other';
      catTotals[key] = (catTotals[key] || 0) + (e.amount || 0);
    }
    const topCats = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${String(k).replace(/_/g, ' ')} ${Utils.formatCurrency(v)}`);

    const facts = [
      { label: 'Earned', value: Utils.formatCurrency(periodStats.earnings), highlight: true },
      { label: 'Sales value', value: Utils.formatCurrency(periodStats.sales) },
      { label: 'Orders', value: String(periodStats.orderedCount) },
      { label: 'Expenses', value: Utils.formatCurrency(monthTotal) },
      { label: 'Mileage claim', value: `${Utils.formatDistance(monthMiles)} · ${Utils.formatCurrency(mileageClaim)}` }
    ];
    if (topCats.length) facts.push({ label: 'Top expenses', value: topCats.join(' · ') });

    return {
      text: `${range.label}: ${Utils.formatCurrency(periodStats.earnings)} earned on ${Utils.formatCurrency(periodStats.sales)} of sales, with ${Utils.formatCurrency(monthTotal)} of expenses.`,
      facts,
      actions: [{ label: 'Open Money', onclick: "App.navigate('money')" }],
      suggestions: ['week', 'today', 'money']
    };
  },

  async answerWhen(range) {
    let appts = [];
    try { appts = await DB.getAppointmentsForRange(range.start, range.end); } catch (e) {}
    const list = appts
      .filter(a => a.status !== 'cancelled')
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!list.length) {
      return {
        text: `Nothing booked ${range.label.toLowerCase()}.`,
        facts: [],
        actions: [{ label: 'Open Visits', onclick: "App.navigate('appointments', {tab: 'upcoming'})" }],
        suggestions: ['today', 'next visit', 'messages']
      };
    }

    const facts = list.slice(0, 6).map(a => ({
      label: `${Utils.formatTimeUK(a.date)} · ${a.clientName || 'Customer'}`,
      value: a.status === 'completed' ? 'Done' : String(a.status || 'Booked').replace(/_/g, ' ')
    }));
    const first = list[0];

    return {
      text: `${list.length} visit${list.length === 1 ? '' : 's'} ${range.label.toLowerCase()}${first ? ` — first is ${first.clientName || 'Customer'} at ${Utils.formatTimeUK(first.date)}` : ''}.`,
      facts,
      actions: [
        { label: 'My Day calendar', onclick: "CompanionFeature.openMyDay()" },
        { label: 'Open Visits', onclick: "App.navigate('appointments', {tab: 'upcoming'})" }
      ],
      suggestions: ['today', 'messages', 'follow-ups']
    };
  },

  async answerMessages() {
    let upcoming = [];
    let allAppts = [];
    try { upcoming = await DB.getUpcomingAppointments(60); } catch (e) {}
    try { allAppts = await DB.db.appointments.toArray(); } catch (e) {}

    const now = new Date();
    const pastFirstVisit = new Set();
    try {
      for (const a of allAppts) {
        if (!a.customerId || a.status === 'cancelled') continue;
        if (new Date(a.date) >= now) continue;
        pastFirstVisit.add(a.customerId);
      }
    } catch (e) {}
    // UK-day matching (iso keys) — the day a message is owed follows the UK
    // calendar like every other deadline in the app, not the device's.
    const dayKey = d => Utils.formatDate(d, 'iso');
    const sameDay = a => dayKey(a.date) === dayKey(now);
    const tomorrow = Utils.getTomorrow();
    const sameDayOn = (dateStr, ref) => dayKey(dateStr) === dayKey(ref);
    const autoFlag = (stage, id) => {
      try { return localStorage.getItem(`advisoros_auto_${stage}_${id}`) === '1'; } catch (e) { return false; }
    };

    const owed = upcoming
      .filter(a => a.status === 'confirmed' && (a.phone || a.customerId))
      .map(a => {
        let stage = null;
        if (sameDayOn(a.date, tomorrow) && !apptSent(a, 'dayBefore')) {
          stage = { label: 'Day-before — not sent', send: 'evening_before' };
        } else if (sameDay(a) && !apptSent(a, 'morning')) {
          stage = { label: 'Morning-of — not sent', send: 'morning_of' };
        } else if (!a.introSent && (!a.customerId || !pastFirstVisit.has(a.customerId))) {
          stage = { label: 'Intro — not sent', send: 'pre_intro' };
        }
        return stage ? { appt: a, stage } : null;
      })
      .filter(Boolean)
      .sort((x, y) => new Date(x.appt.date) - new Date(y.appt.date));

    function apptSent(a, name) {
      if (name === 'dayBefore') return !!(a.dayBeforeSent || autoFlag('evening_before', a.id));
      if (name === 'morning') return autoFlag('morning_of', a.id);
      return false;
    }

    if (!owed.length) {
      return {
        text: 'Nothing owed right now — every upcoming visit has its messages sent or covered.',
        facts: [],
        actions: [{ label: 'Open Follow-ups', onclick: "App.navigate('followups')" }],
        suggestions: ['today', 'next visit', 'help']
      };
    }

    const facts = owed.slice(0, 6).map(({ appt, stage }) => ({
      label: `${appt.clientName || 'Customer'} · ${Utils.formatDateUK(appt.date, 'short')}`,
      value: stage.label
    }));
    const first = owed[0];

    return {
      text: `${owed.length} visit${owed.length === 1 ? '' : 's'} owe a message${first ? ` — ${first.appt.clientName || 'Customer'} on ${Utils.formatDateUK(first.appt.date, 'short')} first` : ''}.`,
      facts,
      actions: [{ label: 'Send in Follow-ups', onclick: "App.navigate('followups')" }],
      suggestions: ['next visit', 'follow-ups', 'today']
    };
  },

  /* ---------- Post-appointment handler ---------- */
  // Situation 4: "What should I do now?" — right after finishing a visit.
  // Suggests: log outcome, send follow-up, check messages due, navigate to next.
  async answerAfterVisit() {
    const today = Utils.getToday();
    let todayAppts = [];
    let allAppts = [];
    try {
      todayAppts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
      allAppts = await DB.db.appointments.toArray();
    } catch (e) {}

    // Find the most recent completed/outcome-logged visit today
    const doneToday = todayAppts
      .filter(a => a.outcome || a.status === 'completed')
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Find upcoming visits today without outcome
    const pendingToday = todayAppts
      .filter(a => !a.outcome && a.status !== 'completed')
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Upcoming visits needing messages (intro, day-before, morning-of)
    const messagesDue = [];
    const pastFirstVisit = new Set();
    for (const a of allAppts) {
      if (!a.customerId || a.status === 'cancelled') continue;
      if (new Date(a.date) >= new Date()) continue;
      pastFirstVisit.add(a.customerId);
    }
    const upcoming = await DB.getUpcomingAppointments(7);
    for (const a of upcoming) {
      if (a.status !== 'confirmed' || !a.phone && !a.customerId) continue;
      if (a.introSent || (a.customerId && pastFirstVisit.has(a.customerId))) continue;
      if (new Date(a.date).toDateString() === today.toDateString()) continue; // today handled separately
      messagesDue.push({ appt: a, reason: 'Intro not sent', template: 'pre_intro' });
    }

    const facts = [];
    const actions = [];

    if (doneToday.length) {
      const last = doneToday[0];
      facts.push({ label: 'Last visit', value: `${last.clientName || 'Customer'} · ${Utils.formatTimeUK(last.date)}` });
      // Suggest logging outcome if not done
      if (!last.outcome) {
        actions.push({ label: 'Log outcome', onclick: `App.navigate('appointments', {id: ${last.id}})` });
      }
      // Suggest follow-up based on outcome
      if (last.outcome) {
        const match = TalkFeature.getTemplateForOutcome(last.outcome);
        if (match && match.minDays === 0) {
          actions.push({ label: `Send ${match.action}`, onclick: `TalkFeature.sendMessage(${last.id}, '${match.template}')` });
        }
      }
    }

    if (pendingToday.length) {
      facts.push({ label: 'Still to do today', value: `${pendingToday.length} visit${pendingToday.length === 1 ? '' : 's'} without outcome` });
      actions.push({ label: 'Open Visits', onclick: "App.navigate('appointments', {tab: 'upcoming'})" });
    }

    if (messagesDue.length) {
      facts.push({ label: 'Messages due', value: `${messagesDue.length} upcoming visit${messagesDue.length === 1 ? '' : 's'} need intro/day-before` });
      actions.push({ label: 'Send in Follow-ups', onclick: "App.navigate('followups')" });
    }

    // Next visit today or tomorrow
    const next = pendingToday[0] || upcoming.find(a => a.status !== 'cancelled');
    if (next) {
      const eta = await this.etaFor(next);
      facts.push({ label: 'Next up', value: `${next.clientName || 'Customer'} · ${Utils.formatDateUK(next.date, 'short')} ${Utils.formatTimeUK(next.date)}${eta ? ` · ${eta}` : ''}` });
      actions.push({ label: 'Navigate', onclick: `AppointmentsFeature.navigateToVisit('${Utils.escapeJsString(next.address || '')}', ${next.id})` });
    }

    const text = doneToday.length
      ? `Last was ${doneToday[0].clientName || 'Customer'}${pendingToday.length ? ` — ${pendingToday.length} more today` : ' — day done'}.`
      : 'No completed visits today yet.';

    return {
      text,
      facts,
      actions: actions.slice(0, 4),
      suggestions: ['today', 'follow-ups', 'messages', 'next visit']
    };
  },

  /* ---------- Evening review handler ---------- */
  // Situation 7: "What have I missed?" — end of day wrap-up.
  // Shows: unsent messages, unlogged outcomes, unpaid orders, due follow-ups.
  async answerEveningReview() {
    const today = Utils.getToday();
    let todayAppts = [];
    let allAppts = [];
    try {
      todayAppts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
      allAppts = await DB.db.appointments.toArray();
    } catch (e) {}

    const facts = [];
    const actions = [];

    // 1. Today's visits without outcome logged
    const unloggedToday = todayAppts.filter(a => !a.outcome && a.status !== 'completed');
    if (unloggedToday.length) {
      facts.push({ label: 'Outcomes not logged', value: `${unloggedToday.length} visit${unloggedToday.length === 1 ? '' : 's'} today` });
      actions.push({ label: 'Log outcomes', onclick: "App.navigate('appointments', {tab: 'upcoming'})" });
    }

    // 2. Upcoming visits needing messages (intro, day-before, morning-of)
    const pastFirstVisit = new Set();
    for (const a of allAppts) {
      if (!a.customerId || a.status === 'cancelled') continue;
      if (new Date(a.date) >= new Date()) continue;
      pastFirstVisit.add(a.customerId);
    }
    const upcoming = await DB.getUpcomingAppointments(7);
    const messagesDue = [];
    for (const a of upcoming) {
      if (a.status !== 'confirmed' || !a.phone && !a.customerId) continue;
      if (new Date(a.date).toDateString() === today.toDateString()) {
        // Today - check morning-of
        if (!localStorage.getItem(`advisoros_auto_morning_of_${a.id}`)) {
          messagesDue.push({ appt: a, reason: 'Morning-of not sent', template: 'morning_of' });
        }
      } else if (new Date(a.date).toDateString() === new Date(today.getTime() + 86400000).toDateString()) {
        // Tomorrow - check day-before
        if (!a.dayBeforeSent && !localStorage.getItem(`advisoros_auto_evening_before_${a.id}`)) {
          messagesDue.push({ appt: a, reason: 'Day-before not sent', template: 'evening_before' });
        }
      } else if (!a.introSent && (!a.customerId || !pastFirstVisit.has(a.customerId))) {
        // Future - check intro
        messagesDue.push({ appt: a, reason: 'Intro not sent', template: 'pre_intro' });
      }
    }
    if (messagesDue.length) {
      facts.push({ label: 'Messages unsent', value: `${messagesDue.length} visit${messagesDue.length === 1 ? '' : 's'} need a message` });
      actions.push({ label: 'Send in Follow-ups', onclick: "App.navigate('followups')" });
    }

    // 3. Unpaid orders
    let unpaidOrders = [];
    try {
      const orders = await DB.db.orders.toArray();
      unpaidOrders = orders.filter(o => (o.balanceDue || 0) > 0);
    } catch (e) {}
    if (unpaidOrders.length) {
      const totalDue = unpaidOrders.reduce((s, o) => s + (o.balanceDue || 0), 0);
      facts.push({ label: 'Outstanding', value: `${Utils.formatCurrency(totalDue)} over ${unpaidOrders.length} order${unpaidOrders.length === 1 ? '' : 's'}`, highlight: true });
      actions.push({ label: 'Open Orders', onclick: "App.navigate('orders')" });
    }

    // 4. Due follow-ups
    let dueFollowUps = [];
    try {
      dueFollowUps = (await FollowupsFeature.loadTasks()).filter(t => t.due);
    } catch (e) {}
    if (dueFollowUps.length) {
      facts.push({ label: 'Follow-ups due', value: `${dueFollowUps.length} task${dueFollowUps.length === 1 ? '' : 's'}` });
      if (!actions.some(a => a.label === 'Open Follow-ups')) {
        actions.push({ label: 'Open Follow-ups', onclick: "App.navigate('followups')" });
      }
    }

    // 5. Completed visits today - any follow-up needed?
    const doneToday = todayAppts.filter(a => a.outcome || a.status === 'completed');
    if (doneToday.length) {
      const needsFollowUp = doneToday.filter(a => {
        const match = TalkFeature.getTemplateForOutcome(a.outcome);
        return match && match.minDays === 0;
      });
      if (needsFollowUp.length) {
        facts.push({ label: 'Immediate follow-ups', value: `${needsFollowUp.length} visit${needsFollowUp.length === 1 ? '' : 's'} need a message now` });
        for (const nf of needsFollowUp.slice(0, 2)) {
          const match = TalkFeature.getTemplateForOutcome(nf.outcome);
          if (match) {
            actions.push({ label: `Send ${match.action}`, onclick: `TalkFeature.sendMessage(${nf.id}, '${match.template}')` });
          }
        }
      }
    }

    let text;
    if (!facts.length) {
      text = 'Nothing missed — all caught up for today.';
    } else {
      text = `End of day: ${facts.length} thing${facts.length === 1 ? '' : 's'} to review${facts[0] ? ` — ${facts[0].value}` : ''}.`;
    }

    return {
      text,
      facts,
      actions: actions.slice(0, 4),
      suggestions: ['today', 'follow-ups', 'messages', 'week']
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
        // Data minimisation: the AI sees only what a chat reply can use —
        // name/time/status/outcome. Full street addresses, postcodes and
        // phone numbers never leave the device (a Companion answer never
        // needs them, and they are the customer's most sensitive fields).
        date: Utils.formatDateUK(today, 'iso'),
        visits: appts.map(a => ({
          name: a.clientName || 'Customer',
          time: Utils.formatTimeUK(a.date),
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