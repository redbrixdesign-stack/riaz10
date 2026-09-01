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
  // Which week the Home strip displays (0 = current week, ±1 per arrow tap).
  // Session-persisted like HomeScreenController._selectedDate; resets on reload.
  _weekOffset: 0,

  // A tiny whitelist shared with the proxy prompt — the AI may only ever
  // suggest commands the router actually understands.
  ALLOWED_SUGGESTIONS: ['today', 'my day', 'week', 'money', 'follow-ups', 'next visit', 'log expense', 'messages', 'orders', 'weather', 'help'],

  CHIP_LABELS: {
    today: "▸ What's my day look like?",
    'my day': '▸ My day',
    week: '▸ How am I doing this week?',
    money: '▸ Money & tax',
    'follow-ups': '▸ Who should I chase?',
    'next visit': "▸ What's next?",
    'log expense': '▸ Log an expense',
    messages: "▸ Who haven't I messaged?",
    orders: "▸ Who hasn't paid?",
    weather: '▸ Weather',
    help: '▸ What can you ask?',
    'after visit': '▸ What should I do now?',
    'evening review': '▸ What have I missed?'
  },

  // Extract area label from appointment address — same convention as the
  // Route screen: the postcode when present, else the last address part
  // ("27 Oakfield Road, Sale M33 4AA" -> "M33 4AA"). The old logic
  // returned the STREET for two-part addresses, duplicating the address
  // line right above it on the Home card.
  getAreaLabel(appt) {
    const address = (appt && appt.address) || '';
    const postcode = address.match(/\b[A-Z]{1,2}\d[A-Z\d]?\b/i);
    if (postcode) return postcode[0].toUpperCase();
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 1];
    return parts[0] || 'Unknown area';
  },

  ORDER_STAGES: { ordered: 'Ordered', delivered: 'Delivered', fitted: 'Fitted', paid: 'Paid' },

  // Map an outcome id to its human label for the current appointment type.
  outcomeName(type, outcomeId) {
    const list = CONFIG.outcomes[type] || [];
    const found = list.find(o => o.id === outcomeId);
    return found ? found.name : String(outcomeId || '');
  },

  // One truthful, data-driven line about why this customer matters right now.
  // Reads only the customer's own records: an outstanding order outweighs
  // history, otherwise the most recent past visit outcome. Never invents.
  async briefingFor(appt) {
    if (!appt || !appt.customerId) return '';
    try {
      const activeOrders = (await DB.db.orders.toArray())
        .filter(o => o.customerId === appt.customerId && (o.balanceDue || 0) > 0);
      if (activeOrders.length) {
        return `Order in progress — ${this.ORDER_STAGES[activeOrders[0].stage] || 'Ordered'}`;
      }
    } catch (e) { /* no order data */ }
    try {
      const visits = await DB.getAppointmentsByCustomer(appt.customerId);
      const past = visits
        .filter(v => v.id !== appt.id && v.outcome && new Date(v.date) < new Date())
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      if (past.length) {
        return `Last visit: ${this.outcomeName(past[0].type, past[0].outcome)} · ${Utils.formatDateUK(past[0].date, 'short')}`;
      }
    } catch (e) { /* no visit history */ }
    return '';
  },

  // A truthful, offline-first "before you go" summary. It only uses notes
  // already recorded against this customer's visits and a small amount of
  // history metadata. Labelled facts win over prose so access details are
  // predictable and easy to scan in the field.
  async customerBriefFor(appt) {
    if (!appt) return { text: 'No customer notes recorded yet.', fingerprint: '' };
    let visits = [appt];
    if (appt.customerId) {
      try { visits = await DB.getAppointmentsByCustomer(appt.customerId); } catch (e) { /* current visit is enough */ }
    }
    const chronological = visits.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const noteField = (notes, label) => {
      const match = String(notes || '').match(new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+?)\\s*$`, 'im'));
      return match ? match[1].trim() : '';
    };
    const facts = [];
    const labels = [
      ['Parking', 'parking'], ['Access', 'access(?: code)?'], ['Pets', 'pets?'], ['Floor', 'floor']
    ];
    for (const [title, pattern] of labels) {
      const value = chronological.map(v => noteField(v.notes, pattern)).find(Boolean);
      if (value) facts.push(`${title}: ${value}`);
    }
    const past = chronological.filter(v => v.id !== appt.id && new Date(v.date) < new Date());
    if (past.length) {
      const last = past.find(v => v.outcome);
      facts.push(`${past.length} previous visit${past.length === 1 ? '' : 's'}${last ? `; last outcome: ${this.outcomeName(last.type, last.outcome)}` : ''}`);
    }
    // Preserve a useful unlabelled current-visit note after the operational
    // facts and repeat-customer signal, so those higher-value facts survive
    // the deliberately short five-item Home summary.
    const freeNote = String(appt.notes || '').split(/\r?\n/)
      .map(s => s.trim()).filter(s => s && !/^(parking|access(?: code)?|pets?|floor)\s*[:\-]/i.test(s))[0];
    if (freeNote) facts.push(freeNote);
    const localText = facts.slice(0, 5).join(' · ') || 'No customer notes recorded yet.';
    const source = JSON.stringify({ customerId: appt.customerId || null, facts: facts.slice(0, 5) });
    let hash = 5381;
    for (let i = 0; i < source.length; i++) hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
    const fingerprint = (hash >>> 0).toString(36);
    this._briefCache ||= new Map();
    const cached = this._briefCache.get(fingerprint) || '';
    if (!cached && CONFIG.ai?.customerBriefsEnabled && typeof AIService !== 'undefined' && AIService.isEnabled()) {
      const aiFacts = facts.filter(f => /^(Parking|Access|Pets|Floor):|^\d+ previous visit/.test(f)).slice(0, 5);
      // Deliberately detached: Home never waits for a network or model call.
      if (aiFacts.length) setTimeout(() => this.enhanceCustomerBrief(aiFacts, fingerprint), 0);
    }
    return { text: cached || localText, fingerprint, ai: !!cached };
  },

  async enhanceCustomerBrief(facts, fingerprint) {
    if (!facts.length || this._briefRequests?.has(fingerprint)) return;
    this._briefRequests ||= new Set();
    this._briefRequests.add(fingerprint);
    try {
      const result = await AIService.customerBrief({ facts: facts.slice(0, 5) });
      const text = result.ok ? String(result.text || '').trim().slice(0, 180) : '';
      if (!text) return;
      this._briefCache.set(fingerprint, text);
      const el = document.querySelector(`[data-customer-brief="${fingerprint}"]`);
      if (el) el.textContent = `AI brief · check saved notes — ${text}`;
    } catch (e) { /* local summary remains visible */ }
    finally { this._briefRequests.delete(fingerprint); }
  },

  get aiPrefKey() {
    return (CONFIG.companion && CONFIG.companion.aiPreferenceKey) || 'advisoros_companion_ai';
  },

  render() {
    return `<div id="companion-root" class="comp-page"></div>`;
  },

  // Keep the exact instant for diary order and routing, but emphasise the
  // arrival promise everywhere the advisor reads the customer-facing time.
  homeVisitTime(appt) {
    if (appt && appt.arrivalStart && appt.arrivalEnd) {
      return { text: `${appt.arrivalStart}–${appt.arrivalEnd}`, isWindow: true };
    }
    return { text: Utils.formatTimeUK(appt.date), isWindow: false };
  },

  /* ---------- lifecycle (called by TodayFeature) ---------- */

  mount(containerId) {
    this._rootId = containerId;
    const root = document.getElementById(containerId);
    if (!root) return;
    this.renderShell();
    // Only auto-focus on a device with a real pointer. On touch screens
    // focusing the composer pops the on-screen keyboard over the feed the
    // moment Home opens — the "screen displaces" bug. The advisor taps the
    // field when they actually want to type, and focus happens naturally.
    const input = document.getElementById('comp-input');
    if (input && window.matchMedia('(pointer: fine)').matches) input.focus();
  },

  unmount() {
    try { HomeScreenController.stopDynamicHomeScreen(); } catch (e) { /* safe */ }
  },

  renderShell() {
    const root = document.getElementById(this._rootId);
    if (!root) return;
    root.innerHTML = `
      <div class="comp-root">
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
            <input type="text" id="comp-input" class="comp-input" placeholder="Ask Beelo — visits, money, follow-ups…" autocomplete="off">
            <button class="comp-send" id="comp-send" aria-label="Send" data-action="CompanionFeature.doSend">
              <span class="material-symbols-rounded">arrow_upward</span>
            </button>
          </div>
        </div>
      </div>`;

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
      // Home feed. When we return from a chat we restore the scroll
      // position the advisor was at (the feed is taller than the viewport,
      // so without this the screen visibly jumps to the top).
      scroll.innerHTML = this.loadingShellHtml();
      this.buildHomeData().then(homeData => {
        const again = document.getElementById('comp-scroll');
        if (again && this._turns.length === 0 && again.innerHTML) {
          again.innerHTML = this.welcomeHtml(homeData);
          if (this._homeScrollTop != null) {
            again.scrollTop = Math.min(this._homeScrollTop, again.scrollHeight);
            this._homeScrollTop = null;
          }
        }
      }).catch(() => {
        // Offline/corrupt-data fallback: a calm empty feed, never a hang.
        const again = document.getElementById('comp-scroll');
        if (again && this._turns.length === 0) {
          again.innerHTML = this.welcomeHtml({ nextVisit: null, upcomingVisits: [], attention: [], suggestions: [] });
        }
      });
      return;
    }
    // Chat mode — the composer stays put below; a slim header offers the
    // way back to the Home feed (tapping an Ask Beelo chip must never
    // strand the advisor in a transcript with no way out).
    const headerHtml = `
      <div class="comp-chat-header">
        <button type="button" class="comp-chat-back" data-action="CompanionFeature.backToHome" aria-label="Back to Home">
          <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
          <span>Home</span>
        </button>
        <span class="comp-chat-title">Beelo</span>
      </div>`;
    const inner = this._turns.map(t =>
      t.role === 'user' ? this.userBubbleHtml(t.text) : this.assistantHtml(t)
    ).join('');
    scroll.innerHTML = headerHtml + inner;
    scroll.scrollTop = scroll.scrollHeight;
  },

  // Brief first-paint shell so Home never flashes a false "No visits"
  // empty state while the real feed data is being read.
  loadingShellHtml() {
    return `
      <div class="comp-home">
        <div class="comp-home-section">
          <div class="comp-home-section-header">
            <span class="comp-home-section-label">Upcoming</span>
          </div>
          <div class="comp-home-empty">Loading your visits…</div>
        </div>
        <div class="comp-home-composer-spacer"></div>
      </div>`;
  },

  // Leave the transcript and restore the Home feed (see renderScroll).
  backToHome() {
    const scroll = document.getElementById('comp-scroll');
    if (scroll) this._homeScrollTop = scroll.scrollTop;
    this._turns = [];
    this.renderScroll();
  },

  welcomeHtml(homeData) {
    // Home = advisor identity, weekly calendar, thumb-reachable capture,
    // today's route, then ONE appointment feed (NEXT visit as a rich card +
    // compact rows), attention and Ask Beelo chips.

    const advisorName = Utils.firstNameFrom(CONFIG.advisorName || '') || 'Advisor';
    const greetingHtml = `
      <div class="comp-home-greeting" aria-label="Advisor ${Utils.escapeHtml(advisorName)}">
        <div class="comp-home-greeting-text">
          <div class="comp-home-greeting-main">${Utils.escapeHtml(advisorName)}<span class="comp-home-greeting-dot">.</span></div>
        </div>
      </div>`;

    const captureHtml = `
      <div class="comp-home-section comp-home-quick-add" aria-label="Scan or add">
        <label class="comp-home-capture" for="home-quick-capture">
          <span class="comp-home-capture-plus material-symbols-rounded" aria-hidden="true">add</span>
          <span class="comp-home-capture-copy"><strong>Scan to add</strong><small>Visit details or an expense receipt</small></span>
          <span class="material-symbols-rounded" aria-hidden="true">document_scanner</span>
        </label>
        <input class="native-file-input" type="file" id="home-quick-capture" accept="image/*" capture="environment" data-event="change" data-action="ControlFeature.handleQuickCapture" data-args='${JSON.stringify(["__event__"])}'>
        <div class="comp-home-quick-manual">
          <button type="button" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {action: "add"}])}'><span class="material-symbols-rounded">event</span>Add visit manually</button>
          <button type="button" data-action="MoneyFeature.openExpenseModal"><span class="material-symbols-rounded">receipt_long</span>Add expense manually</button>
        </div>
      </div>`;

    // A. THIS WEEK — navigational 7-day calendar (tap a day → My Day)
    // with a thin target progress line.
    let weekStripHtml = '';
    const week = homeData.week;
    if (week && week.target > 0) {
      const todayIso = Utils.formatDate(Utils.getToday(), 'iso');
      const daysHtml = (homeData.weekDays || []).map(d => {
        const isToday = d.iso === todayIso;
        const isPast = d.iso < todayIso;
        return `
          <button type="button" class="comp-home-week-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}" data-action="CompanionFeature.openMyDay" data-args='${JSON.stringify([d.iso])}' ${isToday ? 'aria-current="date"' : ''}>
            <span class="comp-home-week-day-label">${d.label}</span>
            <span class="comp-home-week-day-num">${d.num}</span>
            <span class="comp-home-week-day-count">${d.count > 0 ? d.count : '—'}</span>
          </button>`;
      }).join('');
      weekStripHtml = `
        <div class="comp-home-section">
          <div class="comp-home-section-header">
            <span class="comp-home-section-label">THIS WEEK</span>
            <div class="comp-home-week-nav">
              <button type="button" class="comp-home-week-arrow" aria-label="Previous week" data-action="CompanionFeature.shiftHomeWeek" data-args='${JSON.stringify([-1])}'>
                <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
              </button>
              <button type="button" class="comp-home-week-arrow" aria-label="Next week" data-action="CompanionFeature.shiftHomeWeek" data-args='${JSON.stringify([1])}'>
                <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          </div>
          <div class="comp-home-week-strip">${daysHtml}</div>
          <div class="comp-home-week-progress">
            <div class="progress-bar comp-home-week-bar"><div class="fill accent" style="width:${week.pct}%"></div></div>
            <button type="button" class="comp-home-week-target" data-action="App.navigate" data-args='${JSON.stringify(["money"])}'>
              ${week.gap > 0 ? `${Utils.formatCurrency(week.gap)} to target` : 'Target reached — nice work'}
            </button>
          </div>
          ${homeData.weekRange ? `<div class="comp-home-week-range">${Utils.escapeHtml(homeData.weekRange)} · tap a day for the diary</div>` : ''}
        </div>`;
    }

    // B. TODAY'S ROUTE — a compact, actionable sequence using the same
    // time-ordered legs as the full Route screen. Completed stops remain in
    // context but are muted; the active leg is highlighted as the next move.
    let routePlanHtml = '';
    const routePlan = homeData.routePlan;
    if (routePlan && Array.isArray(routePlan.legs) && routePlan.legs.length > 0) {
      const activeIndex = routePlan.activeLeg ? routePlan.activeLeg.index : null;
      const legsHtml = routePlan.legs.map(leg => {
        const destination = leg.to || {};
        const appointment = destination.appointment || null;
        const completed = !!appointment && (appointment.status === 'completed' || !!appointment.outcome);
        const active = leg.index === activeIndex;
        const stateClass = completed ? 'completed' : (active ? 'active' : 'upcoming');
        const fromLabel = (leg.from && leg.from.label) || 'Start';
        const toLabel = destination.label || (leg.isReturn ? 'Base' : 'Next stop');
        const routeFacts = [];
        if (completed) routeFacts.push('Completed');
        else if (active) routeFacts.push('Next move');
        else if (leg.isReturn) routeFacts.push('Return');
        if (!completed && leg.distanceKm > 0) routeFacts.push(Utils.formatDistance(leg.distanceKm));
        if (!completed && leg.etaMin > 0) routeFacts.push(`${leg.etaMin} min`);
        if (!completed && leg.unresolvedPoint) routeFacts.push('Check address');
        const marker = completed ? 'check' : (leg.isReturn ? 'home' : String(leg.index + 1));
        return `
          <button type="button" class="comp-home-route-leg ${stateClass}" data-action="RouteFeature.openLegRoute" data-args='${JSON.stringify([leg.index])}' ${completed ? 'disabled aria-label="Completed route leg"' : ''}>
            <span class="comp-home-route-marker${completed || leg.isReturn ? ' material-symbols-rounded' : ''}" aria-hidden="true">${marker}</span>
            <span class="comp-home-route-copy">
              <strong>${Utils.escapeHtml(fromLabel)} <span aria-hidden="true">→</span> ${Utils.escapeHtml(toLabel)}</strong>
              <small>${Utils.escapeHtml(routeFacts.join(' · ') || 'Route details')}</small>
            </span>
            <span class="material-symbols-rounded comp-home-route-action" aria-hidden="true">${completed ? 'check_circle' : (active ? 'navigation' : 'chevron_right')}</span>
          </button>`;
      }).join('');
      const activeLeg = routePlan.activeLeg;
      const nextMove = activeLeg
        ? `${activeLeg.from?.label || 'Start'} → ${activeLeg.to?.label || 'next stop'}`
        : 'Route complete';
      routePlanHtml = `
        <div class="comp-home-section comp-home-route" aria-labelledby="home-route-heading">
          <div class="comp-home-section-header comp-home-route-header">
            <div class="comp-home-route-title">
              <span class="comp-home-section-label" id="home-route-heading">TODAY'S ROUTE</span>
              <span class="comp-home-route-next">${Utils.escapeHtml(nextMove)}</span>
            </div>
            <button type="button" class="comp-home-route-open" data-action="App.navigate" data-args='${JSON.stringify(["route"])}'>Full route</button>
          </div>
          <div class="comp-home-route-legs">${legsHtml}</div>
        </div>`;
    }

    // C. NEXT / UPCOMING — the appointment feed. The first upcoming visit
    // renders as the featured card (active, full detail + actions +
    // "More about this visit"); the remaining upcoming visits render as
    // compact rows (customer name, time, ETA). ONE feed — no separate
    // TODAY/TOMORROW sections, so no appointment is ever shown twice.
    const upcomingVisits = homeData.upcomingVisits || [];
    let nextVisitHtml = '';
    if (homeData.nextVisit || upcomingVisits.length > 0) {
      const count = (homeData.nextVisit ? 1 : 0) + upcomingVisits.length;
      // Featured card (only when a next visit exists).
      let featuredHtml = '';
      if (homeData.nextVisit) {
        const nv = homeData.nextVisit;
        // A bare time ("11:15") only reads correctly when the visit is today.
        // On any other day the card shows the UK weekday + date.
        const visitToday = Utils.isSameDay(new Date(nv.date), Utils.getToday());
        const whenText = visitToday
          ? nv.time
          : `${Utils.formatDateUK(nv.date, 'weekday-short')} ${Utils.formatDateUK(nv.date, 'short')}, ${nv.time}`;
        const timeLabel = whenText;
        const context = nv.briefing || '';
        const etaText = [nv.eta !== '—' ? nv.eta : null, nv.travel].filter(Boolean).join(' · ');
        const phoneDisabled = nv.phone ? '' : ' disabled aria-disabled="true"';
        featuredHtml = `
          <div class="comp-home-next-visit">
            <button type="button" class="comp-home-next-visit-main" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (nv.id)}])}'>
              <div class="comp-home-next-visit-time${nv.hasArrivalWindow ? ' is-window' : ''}">${Utils.escapeHtml(timeLabel)}</div>
              <div class="comp-home-next-visit-headline">
                <div class="comp-home-next-visit-name">@${Utils.escapeHtml(nv.name)}</div>
                ${etaText ? `<div class="comp-home-next-visit-eta">${Utils.escapeHtml(etaText)}</div>` : ''}
              </div>
              ${context ? `<div class="comp-home-next-visit-context">${Utils.escapeHtml(context)}</div>` : ''}
              <div class="comp-home-next-visit-address">${Utils.escapeHtml(nv.address)}</div>
              ${nv.parkingNotes ? `<div class="comp-home-next-visit-journey">${Utils.escapeHtml(nv.parkingNotes)}</div>` : ''}
            </button>
            <div class="comp-home-next-visit-actions">
              <button class="comp-home-cta comp-home-cta--primary" type="button" data-action="AppointmentsFeature.navigateToVisit" data-args='${Utils.escapeHtml(JSON.stringify([nv.address || '', (nv.id)]))}'>
                <span class="material-symbols-rounded" aria-hidden="true">navigation</span>
                <span>Navigate</span>
              </button>
              <button class="comp-home-cta comp-home-cta--ghost" type="button"${phoneDisabled} data-action="ContactFeature.open" data-args='${Utils.escapeHtml(JSON.stringify([{name: nv.name, phone: nv.phone || ''}]))}'>
                <span class="material-symbols-rounded" aria-hidden="true">call</span>
                <span>Call</span>
              </button>
              <button class="comp-home-cta comp-home-cta--ghost" type="button"${phoneDisabled} data-action="TalkFeature.sendMessage" data-args='${JSON.stringify([(nv.id), "on_my_way"])}'>
                <span class="material-symbols-rounded" aria-hidden="true">near_me</span>
                <span>On my way</span>
              </button>
            </div>
          </div>`;
      }
      // Compact rows for the remaining upcoming visits (name, time, ETA).
      const rowsHtml = upcomingVisits.slice(0, 5).map(v => {
        const visitToday = Utils.isSameDay(new Date(v.date), Utils.getToday());
        const whenText = visitToday
          ? v.time
          : `${Utils.formatDateUK(v.date, 'weekday-short')} ${Utils.formatDateUK(v.date, 'short')}, ${v.time}`;
        const meta = [v.area, v.eta ? `ETA ${v.eta}` : null].filter(Boolean).join(' · ');
        return `
          <button type="button" class="comp-home-visit upcoming" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (v.id)}])}'>
            <span class="comp-home-visit-time${v.hasArrivalWindow ? ' is-window' : ''}">${Utils.escapeHtml(whenText)}</span>
            <div class="comp-home-visit-main">
              <span class="comp-home-visit-name">@${Utils.escapeHtml(v.name)}</span>
              <span class="comp-home-visit-area">${Utils.escapeHtml(meta)}</span>
            </div>
          </button>`;
      }).join('');
      nextVisitHtml = `
        <div class="comp-home-section comp-home-schedule" aria-labelledby="home-schedule-heading">
          <div class="comp-home-section-header comp-home-schedule-header">
            <div class="comp-home-schedule-title">
              <span class="comp-home-section-label" id="home-schedule-heading">Upcoming</span>
            </div>
            <span class="comp-home-section-count">${count} visit${count === 1 ? '' : 's'}</span>
          </div>
          <div class="comp-home-schedule-list">
            ${featuredHtml}
            ${rowsHtml ? `<div class="comp-home-visits">${rowsHtml}</div>` : ''}
          </div>
          ${upcomingVisits.length > 5 ? `<button class="btn btn-ghost btn-sm comp-home-see-all" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {tab: "upcoming"}])}'>See all ${count} visits</button>` : ''}
        </div>`;
    } else {
      nextVisitHtml = `
        <div class="comp-home-section comp-home-schedule" aria-labelledby="home-schedule-heading">
          <div class="comp-home-section-header comp-home-schedule-header">
            <div class="comp-home-schedule-title">
              <span class="comp-home-section-label" id="home-schedule-heading">Upcoming</span>
            </div>
            <span class="comp-home-section-count">No visits</span>
          </div>
          <div class="comp-home-empty">No upcoming visits booked. A good day for follow-ups.</div>
        </div>`;
    }

    // B. NEEDS YOUR ATTENTION
    let attentionHtml = '';
    if (homeData.attention && homeData.attention.length > 0) {
      const itemsHtml = homeData.attention.map(item => item.action ? `
        <button type="button" class="comp-home-attention-item" ${App.actionAttrs(item.action)}>
          <span class="material-symbols-rounded comp-home-attention-icon" aria-hidden="true">${item.icon}</span>
          <div class="comp-home-attention-content">
            <span class="comp-home-attention-label">${Utils.escapeHtml(item.label)}</span>
            <span class="comp-home-attention-value">${Utils.escapeHtml(item.value)}</span>
          </div>
          <span class="comp-home-attention-cta">${Utils.escapeHtml(item.actionLabel || 'Open')}<span class="material-symbols-rounded" aria-hidden="true">chevron_right</span></span>
        </button>` : `
        <div class="comp-home-attention-item">
          <span class="material-symbols-rounded comp-home-attention-icon" aria-hidden="true">${item.icon}</span>
          <div class="comp-home-attention-content">
            <span class="comp-home-attention-label">${Utils.escapeHtml(item.label)}</span>
            <span class="comp-home-attention-value">${Utils.escapeHtml(item.value)}</span>
          </div>
        </div>`).join('');
      
      attentionHtml = `
        <div class="comp-home-section">
          <div class="comp-home-section-header">
            <span class="comp-home-section-label">NEEDS YOUR ATTENTION</span>
            <span class="comp-home-section-count">${homeData.attention.length}</span>
          </div>
          <div class="comp-home-attention-list">${itemsHtml}</div>
        </div>`;
    }

    // C. ASK BEELO - Suggestion chips
    const suggestions = homeData.suggestions || [];
    const suggestionsHtml = suggestions.length > 0 ? `
      <div class="comp-home-section">
        <div class="comp-home-section-header">
          <span class="comp-home-section-label">ASK BEELO</span>
        </div>
        <div class="comp-home-suggestions">
          ${suggestions.map(s => `<button class="comp-suggestion-chip" type="button" data-action="CompanionFeature.send" data-args='${Utils.escapeHtml(JSON.stringify([s]))}'>${Utils.escapeHtml(this.CHIP_LABELS[s] || s)}</button>`).join('')}
        </div>
      </div>` : '';

    return `
      <div class="comp-home">
        ${greetingHtml}
        ${weekStripHtml}
        ${captureHtml}
        ${nextVisitHtml}
        ${attentionHtml}
        ${suggestionsHtml}
        <div class="comp-home-composer-spacer"></div>
      </div>`;
  },

  // Live, data-driven welcome chips: real names/times/amounts the advisor
  // actually cares about right now. Falls back to the static card bag when
  // a data source is missing or offline.
  async buildHomeData() {
    // Gather all data needed
    const today = Utils.getToday();
    let todayAppts = [];
    let upcoming = [];
    let orders = [];

    try {
      todayAppts = (await DB.getAppointmentsForDate(today.toISOString())).filter(a => a.status !== 'cancelled');
      upcoming = await DB.getUpcomingAppointments(14);
      orders = await DB.db.orders.toArray();
    } catch (e) {}

    // Chained travel across the feed: the first visit of each UK day is
    // measured from base, every following visit that day is measured from
    // the ONE BEFORE it — matching how the day actually drives, not
    // "drive home and back out again before every visit". Same chain the
    // weekly layout uses (see home-screen-controller); the feed rows just
    // render its labels. Coords for today's visits are ensured here so the
    // chain works even before the Route screen has geocoded them.
    let basePoint = null;
    let baseLatLng = null;
    try {
      basePoint = await RouteFeature.getBasePoint();
      if (Array.isArray(basePoint && basePoint.latLng)) baseLatLng = basePoint.latLng;
    } catch (e) { /* no base point */ }
    try {
      if (typeof RouteFeature.ensureAppointmentCoords === 'function') {
        todayAppts = await RouteFeature.ensureAppointmentCoords(todayAppts);
        const todayCoords = new Map(todayAppts.filter(a => Array.isArray(a.latLng)).map(a => [a.id, a.latLng]));
        upcoming = upcoming.map(a => todayCoords.has(a.id) ? { ...a, latLng: todayCoords.get(a.id) } : a);
      }
    } catch (e) { /* chain degrades to per-visit-from-base below */ }

    let routePlan = null;
    try {
      if (todayAppts.length > 0 && typeof RouteFeature.analyseDay === 'function') {
        routePlan = RouteFeature.analyseDay(todayAppts, today, basePoint);
      }
    } catch (e) { /* route overview is optional */ }
    const etaMap = new Map();
    {
      const sorted = [...upcoming].sort((a, b) => new Date(a.date) - new Date(b.date));
      let chain = baseLatLng;
      let dayKey = null;
      for (const a of sorted) {
        const k = Utils.formatDate(a.date, 'iso');
        if (k !== dayKey) { chain = baseLatLng; dayKey = k; } // new day → start from base again
        const to = Array.isArray(a.latLng) && a.latLng.length === 2 ? a.latLng : null;
        if (to) {
          if (chain) {
            const km = RouteFeature.calculateLegKm(chain, to);
            if (km && km > 0) etaMap.set(a.id, `${Math.max(1, Math.round((km / 35) * 60))} min`);
          }
          chain = to; // next stop is measured from THIS one
        }
      }
    }

    // Next visit (the most urgent pending one). The featured card leads with
    // the earliest pending visit TODAY — even one whose slot has already
    // passed (a service call booked for 14:00 at 14:30 is the thing to
    // attend/log NOW, not the visit tomorrow). Only when nothing is pending
    // today does it fall to the next future visit.
    const now = new Date();
    const isToday = a => Utils.isSameDay(new Date(a.date), Utils.getToday());
    const next = upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && isToday(a) && (a.phone || a.customerId))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && isToday(a))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && new Date(a.date) >= now && (a.phone || a.customerId))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && new Date(a.date) >= now)
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && (a.phone || a.customerId))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome) || null;
    
    // Next visit data
    let nextVisit = null;
    if (next) {
      const promisedTime = this.homeVisitTime(next);
      const eta = etaMap.get(next.id) || (await this.etaFor(next));
      const travel = next.travelStatus === 'on_site' ? 'On site now'
        : next.travelStatus === 'in_transit' ? 'On the way'
        : null;
      // Real contact + access data for the card's actions and the
      // "More about this visit" rows. Access/Parking follow the app's
      // notes convention ("Access: …" / "Parking: …" lines) — same parser
      // the Talk drafts use; rows are hidden when the field is absent.
      let phone = next.phone || '';
      if (!phone && next.customerId) {
        try { const c = await DB.getCustomer(next.customerId); phone = (c && c.phone) || ''; } catch (e) { /* no customer data */ }
      }
      const noteField = (prefix) => {
        if (!next.notes) return '';
        try {
          if (typeof TalkFeature !== 'undefined' && typeof TalkFeature._parseNoteField === 'function') {
            return TalkFeature._parseNoteField(next.notes, prefix);
          }
          const re = new RegExp(`^\\s*${prefix}\\s*[:\\-]\\s*(.+?)\\s*$`, 'im');
          const m = String(next.notes).match(re);
          return m ? m[1].trim() : '';
        } catch (e) { return ''; }
      };
      nextVisit = {
        id: next.id,
        name: next.clientName || 'Customer',
        time: promisedTime.text,
        hasArrivalWindow: promisedTime.isWindow,
        area: this.getAreaLabel(next),
        type: next.type ? (CONFIG.appointmentTypes.find(t => t.id === next.type)?.name || next.type) : 'Visit',
        address: next.address || 'No address set',
        date: next.date, // raw instant — lets the renderer show a date when the visit isn't today
        eta: eta || '—',
        travel,
        briefing: await this.briefingFor(next),
        phone,
        accessNotes: noteField('access'),
        parkingNotes: noteField('parking'),
        notes: next.notes || '',
        onSiteActive: !!next.arrivedAt && !next.leftAt && next.status !== 'completed'
      };
    }

    // Attention items — ordered by what's at risk first: today's visits
    // needing an outcome (data loss), follow-ups due today (a customer
    // waiting), messages owed (a visit at risk), then money.
    const attention = [];

    // Unlogged outcomes today
    const unloggedToday = todayAppts.filter(a => !a.outcome && a.status !== 'completed');
    if (unloggedToday.length > 0) {
      attention.push({
        icon: 'event_busy',
        label: 'Outcomes not logged',
        value: `${unloggedToday.length} visit${unloggedToday.length === 1 ? '' : 's'} today`,
        action: "App.navigate('appointments', {tab: 'upcoming'})",
        actionLabel: 'Log outcomes'
      });
    }

    // Follow-ups due — name who's first so the advisor knows who to call
    // without opening the inbox.
    const followUpsDue = (await FollowupsFeature.loadTasks()).filter(t => t.due);
    const startToday = Utils.getToday();
    const overdueTasks = followUpsDue.filter(t => t.durable && t.effectiveDue && new Date(t.effectiveDue) < startToday);
    const dueNow = followUpsDue.filter(t => !overdueTasks.includes(t));
    if (overdueTasks.length > 0) {
      attention.push({
        icon: 'assignment_late',
        label: 'Tasks overdue',
        value: `${overdueTasks.length} task${overdueTasks.length === 1 ? '' : 's'} need attention`,
        action: "App.navigate('followups')",
        actionLabel: 'Open Follow-ups'
      });
    }
    if (dueNow.length > 0) {
      const firstTask = dueNow[0];
      const firstName = (firstTask.customer && (firstTask.customer.firstName || firstTask.customer.fullName)) ||
        (firstTask.appointment && firstTask.appointment.clientName) ||
        (firstTask.order && firstTask.order.orderNumber) || null;
      attention.push({
        icon: 'campaign',
        label: 'Follow-ups due',
        value: `${dueNow.length} task${dueNow.length === 1 ? '' : 's'} due${firstName ? ` — ${String(firstName).split(' ')[0]} first` : ''}`,
        action: "App.navigate('followups')",
        actionLabel: 'Open Follow-ups'
      });
    }

    // Morning-of messages are not part of the derived Follow-ups inbox.
    // Intro and day-before reminders are already counted above, so counting
    // them here too would make Home report the same work twice.
    let messagesDue = 0;
    const upcomingAll = await DB.getUpcomingAppointments(7);
    for (const a of upcomingAll) {
      if (a.status !== 'confirmed' || !a.phone && !a.customerId) continue;
      if (new Date(a.date).toDateString() === Utils.getToday().toDateString()) {
        if (!localStorage.getItem(`advisoros_auto_morning_of_${a.id}`)) messagesDue++;
      }
    }
    if (messagesDue > 0) {
      attention.push({
        icon: 'mark_email_unread',
        label: 'Messages unsent',
        value: `${messagesDue} visit${messagesDue === 1 ? '' : 's'} need a message`,
        action: "App.navigate('followups')",
        actionLabel: 'Open Follow-ups'
      });
    }

    // Unpaid orders
    const unpaidOrders = orders.filter(o => (o.balanceDue || 0) > 0);
    if (unpaidOrders.length > 0) {
      const totalDue = unpaidOrders.reduce((s, o) => s + (o.balanceDue || 0), 0);
      attention.push({
        icon: 'payments',
        label: 'Payments outstanding',
        value: `${Utils.formatCurrency(totalDue)} over ${unpaidOrders.length} order${unpaidOrders.length === 1 ? '' : 's'}`,
        action: "App.navigate('orders')",
        actionLabel: 'View Orders'
      });
    }

    // Week progress — compact earnings vs target for the home strip
    let weekStats = { sales: 0, earnings: 0, orderedCount: 0 };
    try {
      const ws = Utils.getStartOfWeek();
      const we = Utils.getEndOfWeek();
      weekStats = await DB.getWeekStats(ws.toISOString(), we.toISOString());
    } catch (e) { /* week stats optional */ }
    const target = Number(CONFIG.weeklyTarget) || 0;
    const week = {
      earnings: weekStats.earnings || 0,
      target,
      gap: Math.max(0, target - (weekStats.earnings || 0)),
      pct: target > 0 ? Math.min(100, Math.round(((weekStats.earnings || 0) / target) * 100)) : 0
    };

    // 7-day strip (Mon–Sun of the displayed week — current week by default,
    // shifted ±1 week per tap on the ‹ › arrows) with real per-day visit
    // counts, from the same day window the rest of the app uses.
    let weekDays = [];
    let weekRange = '';
    try {
      const weekStart = Utils.addDays(Utils.getStartOfWeek(), (this._weekOffset || 0) * 7);
      const weekEnd = Utils.addDays(weekStart, 7);
      const weekAppts = await DB.getAppointmentsForRange(weekStart.toISOString(), weekEnd.toISOString());
      const counts = {};
      for (const a of weekAppts) {
        if (a.status === 'cancelled') continue;
        const key = Utils.formatDate(a.date, 'iso');
        counts[key] = (counts[key] || 0) + 1;
      }
      weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = Utils.addDays(weekStart, i);
        const iso = Utils.formatDate(d, 'iso');
        return { iso, label: Utils.formatDate(d, 'weekday-short'), num: d.getDate(), count: counts[iso] || 0 };
      });
      const first = weekDays[0];
      const last = weekDays[6];
      weekRange = `${first.label} ${first.num} – ${last.label} ${last.num}`;
    } catch (e) { /* strip is optional */ }

    // Suggestions — a small contextual set, all whitelisted commands (the
    // AI never invents actions; every chip routes to an existing handler).
    const suggestions = ['today', 'next visit', 'follow-ups', 'week', 'messages'];

    return {
      nextVisit,
      weekDays,
      weekRange,
      // The appointment feed — remaining upcoming visits (14-day window,
      // after the featured NEXT card), chronological, each with a real
      // ETA when it can be computed. The renderer shows the first as the
      // featured card and the rest as compact rows (name, time, ETA).
      upcomingVisits: await Promise.all(
        upcoming
          .filter(a => a.status !== 'completed' && !a.outcome && (!next || a.id !== next.id))
          .map(async v => {
            const promisedTime = this.homeVisitTime(v);
            return {
              id: v.id,
              name: v.clientName || 'Customer',
              time: promisedTime.text,
              hasArrivalWindow: promisedTime.isWindow,
              area: this.getAreaLabel(v),
              type: v.type ? (CONFIG.appointmentTypes.find(t => t.id === v.type)?.name || v.type) : 'Visit',
              date: v.date,
              eta: etaMap.get(v.id) || null
            };
          })
      ),
      week,
      routePlan,
      attention,
      suggestions
    };
  },

  // Backward compatibility: transform buildHomeData into the old chips format for tests
  async buildWelcomeChips() {
    const homeData = await this.buildHomeData();
    const chips = [];
    
    if (homeData.nextVisit) {
      chips.push(['Next visit', 'near_me', `${homeData.nextVisit.name} · ${homeData.nextVisit.time}`, 'next visit']);
    }
    if (homeData.attention.some(a => a.label === 'Messages unsent')) {
      chips.push(['Messages', 'mark_email_unread', 'Messages unsent', 'messages']);
    }
    if (homeData.attention.some(a => a.label === 'Payments outstanding')) {
      chips.push(['Unpaid', 'payments', 'Payments outstanding', 'orders']);
    }
    if (homeData.attention.some(a => a.label === 'Follow-ups due')) {
      chips.push(['Follow-ups', 'campaign', 'Follow-ups due', 'follow-ups']);
    }
    if (homeData.attention.some(a => a.label === 'Outcomes not logged')) {
      chips.push(['Outcomes', 'event_busy', 'Outcomes not logged', 'today']);
    }
    if (homeData.attention.some(a => a.label === 'Target')) {
      chips.push(['Target', 'trending_up', 'Target', 'week']);
    }
    
    // Fallback to static chips if no dynamic data
    if (chips.length === 0) {
      return [
        ["Today's Overview", 'event_available', 'your day at a glance', 'today'],
        ['Weekly Overview', 'trending_up', 'earnings + sales', 'week'],
        ['Money & Tax', 'payments', 'expenses, mileage, tax', 'money'],
        ['Follow-ups Due', 'campaign', 'who needs a nudge', 'follow-ups'],
        ['Next Visit', 'near_me', 'who, when, how far', 'next visit'],
        ['Log Expense', 'receipt_long', 'scan or type a receipt', 'log expense']
      ];
    }
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
              ${a.actions.map(x => `<button class="comp-action" type="button" ${App.actionAttrs(x.onclick)}>${Utils.escapeHtml(x.label)}</button>`).join('')}
            </div>` : ''}
          ${suggestions.length ? `
            <div class="comp-chips">
              ${suggestions.map(k => `<button class="comp-chip" type="button" data-action="CompanionFeature.send" data-args='${Utils.escapeHtml(JSON.stringify([k]))}'>${Utils.escapeHtml(this.CHIP_LABELS[k] || k)}</button>`).join('')}
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
    const next = appts.find(a => a.status !== 'completed' && !a.outcome) || null;
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
    // Same 14-day window as the Home feed (includes earlier-today visits) so
    // the chat's "next visit" agrees with the featured card.
    try { upcoming = await DB.getUpcomingAppointments(14); } catch (e) {}
    const now = new Date();
    const isToday = a => Utils.isSameDay(new Date(a.date), Utils.getToday());
    const next = upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && isToday(a) && (a.phone || a.customerId))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && isToday(a))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && new Date(a.date) >= now && (a.phone || a.customerId))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && new Date(a.date) >= now)
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome && (a.phone || a.customerId))
      || upcoming.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome) || null;

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
    try { appts = await DB.getAppointmentsByCustomer(c.id); } catch (e) {}
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
      const cust = match.customerId ? await DB.getCustomer(match.customerId) : null;
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
      const fetched = ids.length ? await DB.getCustomersByIds(ids) : [];
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
    try { allAppts = await DB.getAllAppointments(); } catch (e) {}

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
      allAppts = await DB.getAllAppointments();
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
      allAppts = await DB.getAllAppointments();
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

  // Move the Home week strip ±1 week and re-render the feed (the strip is
  // the only week-aware part; NEXT/TODAY stay anchored to "now").
  shiftHomeWeek(delta) {
    this._weekOffset = (this._weekOffset || 0) + delta;
    this.renderScroll();
  },

  openMyDay(isoDate) {
    // Optional initial day: the Home week strip lets a day tap open the
    // calendar already on that day (existing HomeScreenController logic,
    // just seeded before the panel renders).
    if (isoDate && typeof HomeScreenController !== 'undefined') {
      HomeScreenController._selectedDate = new Date(isoDate);
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h3>My Day</h3><button class="btn btn-ghost btn-sm" data-action="HomeScreenController.stopDynamicHomeScreen" data-close="1"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body p-0" style="min-height:72vh;">
        <div id="companion-myday-root"></div>
        <div class="p-md" >
          <button class="btn btn-primary btn-block" data-action="HomeScreenController.stopDynamicHomeScreen" data-close="1">Back to Beelo</button>
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
