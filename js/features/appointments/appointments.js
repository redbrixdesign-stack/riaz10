/* ============================================
   ADVISOROS v5.0 — APPOINTMENTS FEATURE
   Pipeline, list, detail, add, outcome capture
   ============================================ */

const AppointmentsFeature = {
  id: 'appointments',
  name: 'Visits',
  icon: 'calendar_month',
  // No longer a bottom-nav tab (see the Home screen redesign) - the visit
  // list/search/area-analysis screen this renders by default is now reached
  // via the search icon on Home, and individual visits via the weekly
  // calendar. Still fully navigable with App.navigate('appointments', ...)
  // from anywhere; this only controls the persistent nav icon.
  route: false,

  init() {
    // Nothing needed
  },

  render(params = {}) {
    if (params.action === 'add') {
      return this.renderAddForm(params);
    }
    if (params.customerId) {
      const customerId = parseInt(params.customerId) || params.customerId;
      return this.renderCustomerProfile(customerId);
    }
    if (params.id) {
      // Handle string IDs from URL params
      const id = parseInt(params.id) || params.id;
      return this.renderDetail(id);
    }
    // Deep links / action cards can request a specific tab
    // (e.g. {"tab":"upcoming"} from the Home attention card): render the
    // list, then switch to that tab once it's in the DOM.
    const TAB_IDS = ['diary', 'upcoming', 'pipeline', 'area', 'past'];
    if (params.tab && TAB_IDS.includes(params.tab)) {
      const requested = params.tab;
      setTimeout(() => { try { this.switchTab(requested); } catch (e) {} }, 0);
    }
    return this.renderList();
  },

  async renderList() {
    const today = Utils.getToday();
    let upcoming = [];
    let pipeline = [];
    let todayAppointments = [];

    try {
      upcoming = await DB.getUpcomingAppointments(30);
    } catch (e) {
      console.error('Upcoming load failed:', e);
    }

    try {
      todayAppointments = await DB.getAppointmentsForDate(today.toISOString());
    } catch (e) {
      console.error('Today load failed:', e);
    }

    try {
      pipeline = await DB.getPipeline();
    } catch (e) {
      console.error('Pipeline load failed:', e);
    }

    // Group by date
    const grouped = {};
    for (const appt of upcoming) {
      const dateKey = Utils.formatDate(appt.date, 'iso');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(appt);
    }

    // Sort dates
    const sortedDates = Object.keys(grouped).sort();
    const diaryHtml = await this.renderDiary(todayAppointments, today);

    return `
      <div class="fade-in">
        ${App.renderTopHeader({ 
          title: 'Visits', 
          actions: `
            <button class="btn btn-sm btn-outline" aria-label="Search" data-action="AppointmentsFeature.openCustomerSearch">
              <span class="material-symbols-rounded">search</span>
            </button>
            <button class="btn btn-sm btn-primary" aria-label="Add visit" data-action="AppointmentsFeature.showAddModal">
              <span class="material-symbols-rounded">add</span>
            </button>
          ` 
        })}

        <!-- Tabs -->
        <div class="px-md" >
          <div class="tabs" id="appt-tabs" role="tablist" aria-label="Visits">
            <button class="tab active" data-tab="diary" role="tab" aria-selected="true" aria-controls="appt-diary" data-action="AppointmentsFeature.switchTab" data-args='${JSON.stringify(["diary"])}'>Diary</button>
            <button class="tab" data-tab="upcoming" role="tab" aria-selected="false" aria-controls="appt-upcoming" data-action="AppointmentsFeature.switchTab" data-args='${JSON.stringify(["upcoming"])}'>Upcoming</button>
            <button class="tab" data-tab="pipeline" role="tab" aria-selected="false" aria-controls="appt-pipeline" data-action="AppointmentsFeature.switchTab" data-args='${JSON.stringify(["pipeline"])}'>Follow-ups (${pipeline.length})</button>
            <button class="tab" data-tab="area" role="tab" aria-selected="false" aria-controls="appt-area" data-action="AppointmentsFeature.switchTab" data-args='${JSON.stringify(["area"])}'>Area</button>
            <button class="tab" data-tab="past" role="tab" aria-selected="false" aria-controls="appt-past" data-action="AppointmentsFeature.switchTab" data-args='${JSON.stringify(["past"])}'>Past</button>
          </div>
        </div>

        <!-- Diary View -->
        <div class="px-md" id="appt-diary" >
          ${diaryHtml}
        </div>

        <!-- Upcoming View -->
        <div id="appt-upcoming" style="display: none;">
          ${sortedDates.length === 0 ? `
            <div class="empty-state empty-state-lg">
              <span class="material-symbols-rounded">event</span>
              <div class="fw-600 mb-xs" >No upcoming visits</div>
              <div class="fs-13" >Add your first visit to get started</div>
              <button class="btn btn-primary btn-sm mt-md"  data-action="AppointmentsFeature.showAddModal">
                <span class="material-symbols-rounded">add</span>
                Add Visit
              </button>
            </div>
          ` : sortedDates.map(dateKey => {
            const date = new Date(dateKey + 'T00:00:00');
            const isToday = Utils.isSameDay(date, today);
            const isTomorrow = Utils.isSameDay(date, Utils.getTomorrow());
            const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : Utils.formatDate(date, 'weekday-day-month');

            return `
              <div class="px-md mb-sm" >
                <div class="fs-12 fw-600 text-secondary text-uppercase ls-05 mb-sm mt-sm" >${label}</div>
                ${grouped[dateKey].map(appt => this.renderAppointmentCard(appt)).join('')}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Pipeline View (hidden by default) -->
        <div id="appt-pipeline" style="display: none; padding: 0 16px;">
          ${this.renderPipeline(pipeline)}
        </div>

        <div id="appt-area" style="display: none; padding: 0 16px;">
          ${this.renderAreaSearch()}
        </div>

        <!-- Past View (hidden by default) -->
        <div id="appt-past" style="display: none; padding: 0 16px;">
          <div class="empty-state empty-state-lg">
            <span class="material-symbols-rounded">history</span>
            <div>No past visits yet</div>
          </div>
        </div>
      </div>
    `;
	  },

  async renderDiary(appointments, date) {
    // `appointments` here is today's appointments (from renderList's initial load),
    // kept for signature compatibility but not otherwise used — the calendar
    // fetches its own month range and manages its own selection state.
    if (!this._calendarState) {
      this._calendarState = {
        monthDate: Utils.getToday(),
        selectedDate: Utils.formatDate(Utils.getToday(), 'iso')
      };
    }
    this._calendarRootId = 'appt-calendar-root';
    this._calendarCompact = false;
    const inner = await this.buildCalendarHtml(false);
    return `<div id="appt-calendar-root">${inner}</div>`;
  },

  // Compact variant embedded on the Today dashboard: a 7-day strip (today +
  // 6 days) instead of the full month grid, so the NEXT card and tasks stay
  // above the fold. The full month calendar lives in the Visits > Diary tab.
  async renderEmbeddedCalendar() {
    if (!this._calendarState) {
      this._calendarState = {
        monthDate: Utils.getToday(),
        selectedDate: Utils.formatDate(Utils.getToday(), 'iso')
      };
    }
    this._calendarRootId = 'today-calendar-root';
    this._calendarCompact = true;

    const today = Utils.getToday();
    const weekStart = new Date(today);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    let weekAppointments = [];
    try {
      weekAppointments = await DB.getAppointmentsForRange(weekStart.toISOString(), weekEnd.toISOString());
    } catch (e) {
      console.error('Today week strip load failed:', e);
    }

    const byDate = {};
    for (const appt of weekAppointments) {
      const key = Utils.formatDate(appt.date, 'iso');
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(appt);
    }

    const selectedKey = this._calendarState.selectedDate;
    const dayAppointments = (byDate[selectedKey] || []).sort((a, b) => new Date(a.date) - new Date(b.date));

    return `<div id="today-calendar-root">${this.renderWeekStrip(weekStart, byDate, selectedKey)}${this.renderCalendarAgenda(selectedKey, dayAppointments, true)}</div>`;
  },

  // 7-day horizontal strip for the Today dashboard.
  renderWeekStrip(weekStart, byDate, selectedKey) {
    const todayKey = Utils.formatDate(Utils.getToday(), 'iso');
    let cells = '';
    const cursor = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const key = Utils.formatDate(cursor, 'iso');
      const count = (byDate[key] || []).length;
      const classes = ['calendar-cell'];
      if (key === todayKey) classes.push('calendar-cell-today');
      if (key === selectedKey) classes.push('calendar-cell-selected');
      const dayNum = cursor.getDate();
      const weekday = Utils.formatDate(cursor, 'weekday-short');
      cells += `
        <button class="${classes.join(' ')} aspect-auto minh-56 flex-col gap-2 pad-6-2"  data-action="AppointmentsFeature.selectCalendarDate" data-args='${JSON.stringify([key])}'>
          <span class="fs-10 text-tertiary text-uppercase" >${weekday}</span>
          <span class="calendar-cell-num">${dayNum}</span>
          ${count > 0 ? `<span class="calendar-cell-dot">${count > 3 ? '3+' : count}</span>` : ''}
        </button>
      `;
      cursor.setDate(cursor.getDate() + 1);
    }

    return `
      <div class="card calendar-card mb-12" >
        <div class="flex items-center justify-between mb-sm" >
          <div class="fs-13 fw-700" >Next 7 days</div>
          <button class="btn btn-ghost btn-sm minh-32 px-sm"  data-action="App.navigate" data-args='${JSON.stringify(["appointments"])}'>Full diary <span class="material-symbols-rounded fs-16" >chevron_right</span></button>
        </div>
        <div class="grid-7 gap-xs" >
          ${cells}
        </div>
      </div>
    `;
  },

  async buildCalendarHtml(compact = false) {
    const state = this._calendarState;
    const monthStart = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth(), 1);
    // Pad to the visible grid (starts Sunday, 6 full weeks) so appointment dots
    // show correctly even for the leading/trailing days from neighbouring months.
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridEnd.getDate() + 41);
    gridEnd.setHours(23, 59, 59, 999);

    let monthAppointments = [];
    try {
      monthAppointments = await DB.getAppointmentsForRange(gridStart.toISOString(), gridEnd.toISOString());
    } catch (e) {
      console.error('Calendar month load failed:', e);
    }

    const byDate = {};
    for (const appt of monthAppointments) {
      const key = Utils.formatDate(appt.date, 'iso');
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(appt);
    }

    const selectedKey = state.selectedDate;
    const dayAppointments = (byDate[selectedKey] || []).sort((a, b) => new Date(a.date) - new Date(b.date));

    return this.renderCalendarMonth(state.monthDate, gridStart, byDate, selectedKey) +
      this.renderCalendarAgenda(selectedKey, dayAppointments, compact);
  },

  async loadCalendar() {
    const rootId = this._calendarRootId || 'appt-calendar-root';
    const root = document.getElementById(rootId);
    if (!root) return;
    // The Today dashboard embeds a 7-day strip, not the full month grid.
    if (this._calendarCompact) {
      root.innerHTML = await this.renderEmbeddedCalendar();
      return;
    }
    root.innerHTML = await this.buildCalendarHtml(this._calendarCompact);
  },

  renderCalendarMonth(monthDate, gridStart, byDate, selectedKey) {
    const monthLabel = Utils.formatDate(monthDate, 'month-year');
    const todayKey = Utils.formatDate(Utils.getToday(), 'iso');
    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let cells = '';
    const cursor = new Date(gridStart);
    for (let i = 0; i < 42; i++) {
      const key = Utils.formatDate(cursor, 'iso');
      const inMonth = cursor.getMonth() === monthDate.getMonth();
      const isToday = key === todayKey;
      const isSelected = key === selectedKey;
      const count = (byDate[key] || []).length;
      const classes = ['calendar-cell'];
      if (!inMonth) classes.push('calendar-cell-muted');
      if (isToday) classes.push('calendar-cell-today');
      if (isSelected) classes.push('calendar-cell-selected');
      cells += `
        <button class="${classes.join(' ')}" data-action="AppointmentsFeature.selectCalendarDate" data-args='${JSON.stringify([key])}'>
          <span class="calendar-cell-num">${cursor.getDate()}</span>
          ${count > 0 ? `<span class="calendar-cell-dot" aria-label="${count} visits"></span>` : ''}
        </button>
      `;
      cursor.setDate(cursor.getDate() + 1);
    }

    return `
      <div class="card calendar-card mb-12" >
        <div class="calendar-header">
          <button class="btn btn-ghost btn-sm" aria-label="Previous month" data-action="AppointmentsFeature.shiftCalendarMonth" data-args='${JSON.stringify([-1])}'>
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <div class="calendar-month-label">${Utils.escapeHtml(monthLabel)}</div>
          <button class="btn btn-ghost btn-sm" aria-label="Next month" data-action="AppointmentsFeature.shiftCalendarMonth" data-args='${JSON.stringify([1])}'>
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        </div>
        <div class="calendar-weekdays">
          ${weekdayLabels.map(w => `<span>${w}</span>`).join('')}
        </div>
        <div class="calendar-grid">
          ${cells}
        </div>
      </div>
    `;
  },

  renderCalendarAgenda(selectedKey, dayAppointments, compact = false) {
    const date = new Date(selectedKey + 'T00:00:00');
    const today = Utils.getToday();
    const isToday = Utils.isSameDay(date, today);
    const label = isToday ? 'Today' : Utils.formatDate(date, 'weekday-day-month');
    const mode = this.getDayMode(selectedKey + 'T00:00:00');
    const salesValue = dayAppointments.reduce((sum, a) => sum + (a.value || 0), 0);

    const summaryCard = `
      <div class="card mb-12" >
        <div class="flex items-start justify-between gap-12" >
          <div>
            <div class="fw-700" >${Utils.escapeHtml(label)}</div>
            <div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(mode.friendLine)}</div>
          </div>
          <span class="badge ${mode.kind === 'fitting' ? 'badge-success' : mode.kind === 'sales' ? 'badge-primary' : 'badge-warning'}">${Utils.escapeHtml(mode.label)}</span>
        </div>
        <div class="stats-grid mt-12 gap-sm" >
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="Jump to today's visit list" data-action="AppointmentsFeature.scrollToVisitsList" data-key="Enter, space">
            <div class="value">${dayAppointments.length || '—'}</div><div class="label">Booked</div>
          </div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View money and sales" data-action="App.navigate" data-args='${JSON.stringify(["money"])}' data-key="Enter, space">
            <div class="value">${Utils.formatCurrency(salesValue).replace('.00', '')}</div><div class="label">Booked Value</div>
          </div>
        </div>
      </div>
    `;

    if (compact) {
      // Today's embedded calendar: just the summary + a clear Add Visit action,
      // no full visit list (keeps the dashboard from getting too long).
      return summaryCard + `
        <button class="btn btn-outline btn-block" data-action="AppointmentsFeature.addAt" data-args='${JSON.stringify([selectedKey, ""])}'>
          <span class="material-symbols-rounded">add</span> Add Visit
        </button>
      `;
    }

    return summaryCard + `
      <div class="flex items-center justify-between mb-sm" id="appt-visits-list-anchor" >
        <div class="fs-12 fw-600 text-secondary text-uppercase ls-05" >Visits</div>
        <button class="btn btn-sm btn-outline" data-action="AppointmentsFeature.addAt" data-args='${JSON.stringify([selectedKey, ""])}'>
          <span class="material-symbols-rounded">add</span> Add
        </button>
      </div>

      ${dayAppointments.length === 0 ? `
        <div class="empty-state">
          <span class="material-symbols-rounded">event_available</span>
          <div class="fw-600 mb-xs" >Nothing booked</div>
          <div class="fs-13" >Tap Add to book a visit on this day</div>
        </div>
      ` : dayAppointments.map(appt => this.renderAppointmentCard(appt)).join('')}
    `;
  },

  selectCalendarDate(key) {
    this._calendarState.selectedDate = key;
    this.loadCalendar();
  },

  shiftCalendarMonth(delta) {
    const d = new Date(this._calendarState.monthDate);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    this._calendarState.monthDate = d;
    this.loadCalendar();
  },

  renderAreaSearch() {
    return `
      <div class="card mb-12" >
        <div class="fw-700 mb-6" >Area intelligence</div>
        <div class="fs-13 text-secondary lh-145 mb-14" >
          Search a postcode area before booking. I will show previous customers, outcomes, buying signals and conversion patterns.
        </div>
        <div class="form-group mb-10" >
          <label>Postcode or area</label>
          <input class="input" id="area-query" placeholder="e.g. M14 or M14 7FZ" data-action="AppointmentsFeature.runAreaSearch" data-key="Enter">
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.runAreaSearch">
          <span class="material-symbols-rounded">query_stats</span>
          Search Area
        </button>
      </div>
      <div id="area-search-result"></div>
    `;
  },

  async runAreaSearch() {
    const query = document.getElementById('area-query')?.value.trim() || '';
    const resultEl = document.getElementById('area-search-result');
    if (!resultEl) return;
    if (!query) {
      resultEl.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">search</span><div>Enter a postcode area first</div></div>`;
      return;
    }
    const report = await this.buildAreaAnalytics(query);
    resultEl.innerHTML = this.renderAreaAnalytics(report);
  },

  async buildAreaAnalytics(query) {
    const area = this.getPostcodeArea(query);
    const normalizedQuery = this.normalizeBookingText(query);
    const customers = await DB.getAllCustomers();
    const appointments = await DB.getAllAppointments();
    const orders = await DB.db.orders.toArray();

    const customerMatches = customers.filter(c => {
      const text = this.customerAddressText(c);
      const customerArea = this.getPostcodeArea(text);
      const haystack = this.normalizeBookingText(`${c.fullName || ''} ${c.firstName || ''} ${c.lastName || ''} ${c.phone || ''} ${text}`);
      return (area && customerArea === area) || (normalizedQuery && haystack.includes(normalizedQuery));
    });
    const customerIds = new Set(customerMatches.map(c => c.id));
    const areaAppointments = appointments.filter(a => {
      const apptArea = this.getPostcodeArea(a.address || '');
      return (area && apptArea === area) || customerIds.has(a.customerId);
    });
    areaAppointments.forEach(a => {
      if (a.customerId) customerIds.add(a.customerId);
    });
    const areaCustomers = customers.filter(c => customerIds.has(c.id));
    const areaOrders = orders.filter(o => customerIds.has(o.customerId) || areaAppointments.some(a => a.id === o.appointmentId));
    const soldOutcomes = ['ordered', 'completed'];
    const soldVisits = areaAppointments.filter(a => soldOutcomes.includes(a.outcome));
    const outcomeVisits = areaAppointments.filter(a => a.outcome);
    const quoteVisits = areaAppointments.filter(a => ['quoted', 'compare_quotes', 'thinking', 'partner', 'expensive'].includes(a.outcome));
    const totalSales = soldVisits.reduce((sum, a) => sum + (a.value || 0), 0);

    return {
      query,
      area: area || query.toUpperCase(),
      customers: areaCustomers,
      appointments: areaAppointments.sort((a, b) => new Date(b.date) - new Date(a.date)),
      orders: areaOrders,
      visits: areaAppointments.length,
      sold: soldVisits.length,
      quotes: quoteVisits.length,
      conversion: outcomeVisits.length ? soldVisits.length / outcomeVisits.length : 0,
      totalSales,
      avgSale: soldVisits.length ? totalSales / soldVisits.length : 0,
      outcomes: this.countBy(areaAppointments, a => a.outcome || a.status || 'open'),
      sources: this.countBy(areaAppointments, a => a.source || 'unknown'),
      interests: this.extractBuyingInterests(areaAppointments),
      behaviours: this.getAreaBehaviours(areaAppointments)
    };
  },

  renderAreaAnalytics(report) {
    const topOutcomes = Object.entries(report.outcomes).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const topInterests = Object.entries(report.interests).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topSources = Object.entries(report.sources).sort((a, b) => b[1] - a[1]).slice(0, 3);

    if (report.visits === 0 && report.customers.length === 0) {
      return `
        <div class="empty-state empty-state-lg">
          <span class="material-symbols-rounded">travel_explore</span>
          <div>No local history yet</div>
          <div class="fs-13" >First visit in ${Utils.escapeHtml(report.area)} will start building the picture.</div>
        </div>
      `;
    }

    return `
      <div class="card mb-12" >
        <div class="flex items-start justify-between gap-12" >
          <div>
            <div class="fw-700" >${Utils.escapeHtml(report.area)}</div>
            <div class="fs-13 text-secondary mt-2" >${report.customers.length} customer${report.customers.length === 1 ? '' : 's'} · ${report.visits} visit${report.visits === 1 ? '' : 's'}</div>
          </div>
          <span class="badge ${report.conversion >= 0.5 ? 'badge-success' : report.conversion >= 0.25 ? 'badge-warning' : 'badge-primary'}">${Math.round(report.conversion * 100)}% conversion</span>
        </div>
        <div class="stats-grid mt-12 gap-sm" >
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View customer records" data-action="AppointmentsFeature.scrollToAreaCustomers" data-key="Enter, space"><div class="value">${report.sold || '—'}</div><div class="label">Sold</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View customer records" data-action="AppointmentsFeature.scrollToAreaCustomers" data-key="Enter, space"><div class="value">${report.quotes || '—'}</div><div class="label">Quotes</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View money and sales" data-action="App.navigate" data-args='${JSON.stringify(["money"])}' data-key="Enter, space"><div class="value">${report.avgSale ? Utils.formatCurrency(report.avgSale).replace('.00', '') : '—'}</div><div class="label">Avg Sale</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View customer records" data-action="AppointmentsFeature.scrollToAreaCustomers" data-key="Enter, space"><div class="value">${report.orders.length || '—'}</div><div class="label">Orders</div></div>
        </div>
      </div>

      <div class="card mb-12" >
        <div class="fw-700 mb-10" >What this area tends to do</div>
        ${report.behaviours.length ? report.behaviours.map(text => `
          <div class="area-insight-row">
            <span class="material-symbols-rounded">insights</span>
            <span>${Utils.escapeHtml(text)}</span>
          </div>
        `).join('') : `<div class="fs-13 text-secondary" >Not enough history yet for behaviour patterns.</div>`}
      </div>

      <div class="card mb-12" >
        <div class="fw-700 mb-10" >Signals</div>
        <div class="area-chip-row">
          ${topInterests.length ? topInterests.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(label)} · ${count}</span>`).join('') : '<span class="chip">No buying-interest notes yet</span>'}
        </div>
        <div class="area-chip-row mt-sm" >
          ${topOutcomes.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(this.getOutcomeName(label, 'consultation'))} · ${count}</span>`).join('')}
          ${topSources.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(label.replace(/_/g, ' '))} · ${count}</span>`).join('')}
        </div>
      </div>

      <div class="card" id="area-customers-anchor">
        <div class="fw-700 mb-10" >Customer records</div>
        ${report.customers.length ? report.customers.map(customer => `
          <button class="area-customer-row" data-action="AppointmentsFeature.openCustomerRecord" data-args='${JSON.stringify([(customer.id)])}'>
            <span class="material-symbols-rounded">person</span>
            <span>
              <strong>${Utils.escapeHtml(customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer')}</strong>
              <small>${Utils.escapeHtml(customer.phone || this.customerAddressText(customer) || 'No contact detail')}</small>
            </span>
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        `).join('') : `<div class="fs-13 text-secondary" >No customer records match this area yet.</div>`}
      </div>
    `;
  },

  customerAddressText(customer) {
    if (!customer?.address) return '';
    if (typeof customer.address === 'string') return customer.address;
    return [customer.address.line1, customer.address.postcode, customer.address.postcodeFormatted, customer.address.city].filter(Boolean).join(' ');
  },

  getPostcodeArea(value) {
    const text = String(value || '').toUpperCase();
    const full = text.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/);
    if (full) return Utils.normalizePostcode(full[0]).slice(0, -3);
    const outward = text.match(/\b[A-Z]{1,2}\d[A-Z\d]?\b/);
    return outward ? outward[0].replace(/\s/g, '') : '';
  },

  countBy(items, getter) {
    return items.reduce((counts, item) => {
      const key = getter(item) || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  },

  extractBuyingInterests(appointments) {
    const keywords = ['blinds', 'shutters', 'curtains', 'roller', 'roman', 'venetian', 'vertical', 'wood', 'blackout', 'bedroom', 'lounge', 'bay', 'conservatory', 'motorised'];
    const counts = {};
    for (const appt of appointments) {
      const text = `${appt.notes || ''} ${appt.type || ''} ${appt.outcome || ''}`.toLowerCase();
      for (const keyword of keywords) {
        if (text.includes(keyword)) counts[keyword] = (counts[keyword] || 0) + 1;
      }
    }
    return counts;
  },

  getAreaBehaviours(appointments) {
    const total = appointments.length;
    if (!total) return [];
    const count = outcome => appointments.filter(a => a.outcome === outcome || a.quoteReason === outcome).length;
    const sold = appointments.filter(a => ['ordered', 'completed'].includes(a.outcome)).length;
    const behaviours = [];
    if (sold > 0) behaviours.push(`${sold} previous visit${sold === 1 ? '' : 's'} converted into orders or completed work.`);
    if (count('compare_quotes') > 0) behaviours.push('Customers here have compared quotes before, so value and like-for-like explanation matter.');
    if (count('expensive') > 0) behaviours.push('Price concern has appeared here before. Keep a good-better-best option ready.');
    if (count('partner') > 0) behaviours.push('Partner decision has come up before; ask early who else needs to be involved.');
    if (count('customer_no_show') > 0) behaviours.push('There has been a no-show here. Confirm before travelling.');
    return behaviours.slice(0, 4);
  },

  getQuoteReasonLabel(reason) {
    const labels = {
      thinking: 'Needs to think',
      partner: 'Wants to talk with partner',
      compare_quotes: 'Comparing quotes',
      expensive: 'Price concern',
      timing: 'Timing / payday',
      spec_mismatch: 'Specification needs clarifying',
      other: 'Other reason'
    };
    return labels[reason] || String(reason || '').replace(/_/g, ' ');
  },

  async openCustomerRecord(customerId) {
    // Opens the full Customer 360 profile screen.
    App.navigate('customer', { id: customerId });
  },

  buildSlots(start, end) {
    const slots = [];
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    const cursor = new Date(2000, 0, 1, startHour, startMinute);
    const finish = new Date(2000, 0, 1, endHour, endMinute);
    while (cursor < finish) {
      slots.push(cursor.toTimeString().slice(0, 5));
      cursor.setMinutes(cursor.getMinutes() + (CONFIG.workingWeek?.slotMinutes || 15));
    }
    return slots;
  },

  // Returns the list of slot start-times (HH:MM) an appointment occupies, given its
  // start time and how many consecutive slots it takes up (e.g. 4 x 15min slots = 1 hour).
  getOccupiedSlots(startTime, durationSlots = 1) {
    const slotMinutes = CONFIG.workingWeek?.slotMinutes || 15;
    const [h, m] = startTime.split(':').map(Number);
    const cursor = new Date(2000, 0, 1, h, m);
    const keys = [];
    const count = Math.max(1, parseInt(durationSlots, 10) || 1);
    for (let i = 0; i < count; i++) {
      keys.push(cursor.toTimeString().slice(0, 5));
      cursor.setMinutes(cursor.getMinutes() + slotMinutes);
    }
    return keys;
  },

  // Duration options for the add-visit form, expressed in slots (so "4 slots" = 1 hour
  // when the slot size is 15 minutes).
  renderDurationOptions(selected = 1) {
    const slotMinutes = CONFIG.workingWeek?.slotMinutes || 15;
    const options = [1, 2, 3, 4, 6, 8];
    return options.map(n => {
      const mins = n * slotMinutes;
      let label;
      if (mins < 60) {
        label = `${mins} min`;
      } else if (mins % 60 === 0) {
        label = `${mins / 60} hr${mins / 60 > 1 ? 's' : ''}`;
      } else {
        label = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      }
      return `<option value="${n}" ${n === Number(selected) ? 'selected' : ''}>${label}</option>`;
    }).join('');
  },

  getTimeKey(date) {
    return new Date(date).toTimeString().slice(0, 5);
  },

  // ── Arrival window ─────────────────────────────────────────────
  // An exact start time can't always be guaranteed once you're on the
  // road, so a visit can carry an optional arrival window (e.g. "between
  // 09:00 and 11:00") that is what the customer is promised. The exact
  // `date`/`time` is kept internally: it still anchors the diary slot,
  // conflict checks and routing, the window only changes what's shown and
  // what messages say.

  // Friendly display label: "between 09:00 and 11:00" ('' when no window).
  getArrivalWindowLabel(appt) {
    if (!appt || !appt.arrivalStart || !appt.arrivalEnd) return '';
    return `between ${appt.arrivalStart} and ${appt.arrivalEnd}`;
  },

  // Compact form used where a template already says "at" ("at 09:00–11:00"
  // reads fine, "at between 09:00 and 11:00" does not). Falls back to the
  // exact formatted time when no window is set.
  getArrivalTimeText(appt) {
    if (!appt || !appt.arrivalStart || !appt.arrivalEnd) return Utils.formatTime(appt.date);
    return `${appt.arrivalStart}–${appt.arrivalEnd}`;
  },

  // Presets come from the working blocks (morning/midday/afternoon/evening)
  // so they're always valid, plus a Custom option that reveals two time
  // pickers for any other range.
  renderArrivalWindowOptions(selectedId = 'none') {
    const blocks = CONFIG.workingWeek?.blocks || [];
    const labels = { none: 'Exact time — no arrival window', custom: 'Custom window…' };
    const ids = ['none', ...blocks.map(b => b.id), 'custom'];
    return ids.map(id => {
      const block = blocks.find(b => b.id === id);
      const label = block ? block.name : labels[id];
      return `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(label)}</option>`;
    }).join('');
  },

  renderArrivalWindowFields(selectedId = 'none', start = '', end = '') {
    return `
      <div class="form-group">
        <label>Arrival window <span class="fw-400 text-tertiary" >— optional</span></label>
        <select class="select" id="arrival-window" data-action="AppointmentsFeature.toggleArrivalWindowCustom" data-args='${JSON.stringify(["__value__"])}'>
          ${this.renderArrivalWindowOptions(selectedId)}
        </select>
        <div class="hint">If an exact time can't be guaranteed, promise a window instead — the diary still plans on the exact time.</div>
      </div>
      <div class="form-row" id="arrival-window-custom" style="display: ${selectedId === 'custom' ? 'flex' : 'none'};">
        <div class="form-group">
          <label>Window start</label>
          <input type="time" class="input" id="arrival-window-start" value="${start}" step="900">
        </div>
        <div class="form-group">
          <label>Window end</label>
          <input type="time" class="input" id="arrival-window-end" value="${end}" step="900">
        </div>
      </div>
    `;
  },

  // Matches a stored window back to a preset so reopening a form selects the
  // right option; a range that doesn't match a block stays "custom".
  getArrivalWindowPreset(appt) {
    const start = appt?.arrivalStart || '';
    const end = appt?.arrivalEnd || '';
    if (!start || !end) return 'none';
    const block = (CONFIG.workingWeek?.blocks || []).find(b => b.start === start && b.end === end);
    return block ? block.id : 'custom';
  },

  validateArrivalWindowContainsTime(time, start, end) {
    if (!start && !end) return '';
    if (!start || !end) return 'Choose both ends of the arrival window, or use Exact time.';
    if (time < start || time >= end) {
      return `Diary time ${time} must sit inside the arrival window ${start}–${end}. Change the diary time or choose a different window.`;
    }
    return '';
  },

  toggleArrivalWindowCustom(value) {
    const el = document.getElementById('arrival-window-custom');
    if (el) el.style.display = value === 'custom' ? 'flex' : 'none';
  },

  // Reads the window fields into { arrivalStart, arrivalEnd }. Returns
  // { error } when a custom window was chosen but is invalid, and null when
  // no window was picked at all.
  readArrivalWindow() {
    const select = document.getElementById('arrival-window');
    if (!select) return null;
    const value = select.value;
    if (value === 'none') return null;
    const block = (CONFIG.workingWeek?.blocks || []).find(b => b.id === value);
    if (block) return { arrivalStart: block.start, arrivalEnd: block.end };
    const start = document.getElementById('arrival-window-start')?.value || '';
    const end = document.getElementById('arrival-window-end')?.value || '';
    if (!start || !end) return { error: 'Pick both a start and an end for the custom window.' };
    if (start >= end) return { error: 'Window end must be later than the start.' };
    return { arrivalStart: start, arrivalEnd: end };
  },

  // e.g. " – 10:00 (1 hr)" appended after a start time, only shown for multi-slot visits.
  getVisitDurationLabel(appt) {
    const duration = appt.durationSlots || 1;
    if (duration <= 1) return '';
    const occupied = this.getOccupiedSlots(this.getTimeKey(appt.date), duration);
    const slotMinutes = CONFIG.workingWeek?.slotMinutes || 15;
    const last = occupied[occupied.length - 1].split(':').map(Number);
    const endDate = new Date(2000, 0, 1, last[0], last[1] + slotMinutes);
    const end = endDate.toTimeString().slice(0, 5);
    const mins = duration * slotMinutes;
    const durationLabel = mins % 60 === 0 ? `${mins / 60} hr${mins / 60 > 1 ? 's' : ''}` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return ` – ${end} (${durationLabel})`;
  },

  getDayMode(dateInput) {
    const day = Utils.ukParts(new Date(dateInput)).weekday;
    const salesDays = CONFIG.workingWeek?.salesDays || [1, 2, 4];
    const fittingDays = CONFIG.workingWeek?.fittingDays || [3, 5];
    if (salesDays.includes(day)) {
      return {
        kind: 'sales',
        label: 'Sales day',
        shortAdvice: 'Sell / measure',
        friendLine: 'A sales day. Keep the diary purposeful and leave breathing room between proper calls.'
      };
    }
    if (fittingDays.includes(day)) {
      return {
        kind: 'fitting',
        label: 'Fitting day',
        shortAdvice: 'Fittings',
        friendLine: 'A fitting day. Protect the finish, the relationship, and the review afterwards.'
      };
    }
    return {
      kind: 'closed',
      label: 'Usually off-plan',
      shortAdvice: 'Careful',
      friendLine: 'Not a normal sales or fitting day. Fine if needed, but I would keep it intentional.'
    };
  },

  getAllowedTypesForDate(dateInput) {
    const mode = this.getDayMode(dateInput);
    if (mode.kind === 'fitting') return ['fitting', 'service_call'];
    if (mode.kind === 'sales') return ['consultation', 'measure', 'follow_up', 'review', 'service_call'];
    return CONFIG.appointmentTypes.map(t => t.id);
  },

  addAt(date, time) {
    App.navigate('appointments', { action: 'add', date, time });
  },

  scrollToVisitsList() {
    document.getElementById('appt-visits-list-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  scrollToCustomerHistory() {
    document.getElementById('customer-history-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  scrollToAreaCustomers() {
    document.getElementById('area-customers-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async openEditCustomerModal(customerId) {
    const customer = await DB.getCustomer(customerId);
    if (!customer) {
      Toast.show('Customer not found', 'error');
      return;
    }
    const name = customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Edit Customer</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label>Name *</label>
          <input type="text" class="input" id="edit-cust-name" autocomplete="name" value="${Utils.escapeHtml(name)}">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" class="input" id="edit-cust-phone" inputmode="tel" autocomplete="tel" value="${Utils.escapeHtml(customer.phone || '')}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" class="input" id="edit-cust-email" autocomplete="email" value="${Utils.escapeHtml(customer.email || '')}">
        </div>
        <div class="form-group">
          <label>Address *</label>
          <input type="text" class="input" id="edit-cust-address" autocomplete="street-address" value="${Utils.escapeHtml(customer.address?.line1 || '')}">
          <div class="hint">Include the postcode here, e.g. "12 Elm Street, Manchester, M14 5AB"</div>
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.saveEditCustomer" data-args='${JSON.stringify([(customerId)])}'>
          Save Changes
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveEditCustomer(customerId) {
    const customer = await DB.getCustomer(customerId);
    if (!customer) {
      Toast.show('Customer not found', 'error');
      return;
    }

    const name = document.getElementById('edit-cust-name')?.value.trim() || '';
    const phone = document.getElementById('edit-cust-phone')?.value.trim() || '';
    const email = document.getElementById('edit-cust-email')?.value.trim() || '';
    const address = document.getElementById('edit-cust-address')?.value.trim() || '';

    if (!name || !address) {
      Toast.show('Name and address are required', 'error');
      return;
    }

    try {
      const { postcode, postcodeNormalized } = (typeof OCRFeature !== 'undefined' && OCRFeature.extractPostcodeFromAddress)
        ? OCRFeature.extractPostcodeFromAddress(address)
        : { postcode: '', postcodeNormalized: '' };

      await DB.updateCustomer(customerId, {
        fullName: name,
        firstName: name.split(' ')[0],
        lastName: name.split(' ').slice(1).join(' ') || '',
        phone,
        email,
        postcodeNormalized,
        address: { ...(customer.address || {}), line1: address, postcode, postcodeNormalized }
      });

      // Any future visits for this customer will use the customer record for
      // display, but existing visit cards store their own copy of name/phone/
      // address at booking time - keep those in sync too so the fix is visible
      // everywhere, not just on the customer profile.
      const appts = await DB.getAppointmentsByCustomer(customerId);
      for (const appt of appts) {
        await DB.updateAppointment(appt.id, { clientName: name, phone, address });
      }

      App.closeModal();
      Toast.show('Customer updated', 'success');
      App.navigate('customer', { id: customerId });
    } catch (e) {
      console.error('Save customer error:', e);
      Toast.show('Failed to save changes', 'error');
    }
  },

  renderAppointmentCard(appt) {
    const typeConfig = CONFIG.appointmentTypes.find(t => t.id === appt.type) || { name: appt.type, icon: 'event' };
    // Status as a text badge (colour + label) rather than a lone 8px dot, which
    // failed AA for the "pending" grey and was indistinguishable for colour-blind
    // users. Completed visits with an outcome show the outcome label instead.
    let statusBadge = '';
    if (appt.outcome) {
      statusBadge = `<span class="badge badge-success fs-10" >${this.getOutcomeName(appt.outcome, appt.type)}</span>`;
    } else if (appt.status === 'cancelled') {
      statusBadge = `<span class="badge badge-danger fs-10" >Cancelled</span>`;
    } else if (appt.status === 'completed') {
      statusBadge = `<span class="badge badge-success fs-10" >Done</span>`;
    } else if (appt.status === 'confirmed') {
      statusBadge = `<span class="badge badge-primary fs-10" >Confirmed</span>`;
    } else {
      statusBadge = `<span class="badge badge-warning fs-10" >Pending</span>`;
    }

    return `
      <div class="card card-interactive visit-card" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: appt.id}])}'>
        <div class="visit-card-row">
          <div class="visit-icon">
            <span class="material-symbols-rounded">${typeConfig.icon}</span>
          </div>
          <div class="visit-main">
            <div class="visit-title-row">
              <span class="visit-title">${Utils.escapeHtml(appt.clientName || 'Unknown')}</span>
              <span class="badge ${typeConfig.badgeClass || 'badge-primary'} fs-10 pill-pad shrink-0" >${Utils.escapeHtml(typeConfig.name)}</span>
            </div>
            <div class="visit-meta">
              ${this.getArrivalWindowLabel(appt) ? `Arrive ${Utils.escapeHtml(this.getArrivalWindowLabel(appt))}` : Utils.formatTime(appt.date)} · ${appt.address ? Utils.escapeHtml(Utils.truncate(appt.address, 30)) : 'No address'}
            </div>
            ${appt.value > 0 ? `
              <div class="visit-value">
                ${Utils.formatCurrency(appt.value)}
              </div>
            ` : ''}
          </div>
          <div class="visit-status">
            ${statusBadge}
          </div>
        </div>
      </div>
    `;
  },

  // Compact money card for the visit sheet: the order behind this visit, its
  // stage and what's still owed. Taps through to the Orders sheet (via the
  // orders route, which auto-opens it for an id - no direct cross-feature
  // dependency at render time).
  renderLinkedOrderCard(order) {
    const stageNames = { ordered: 'Ordered', delivered: 'Delivered', fitted: 'Fitted', paid: 'Paid' };
    const paid = (order.balanceDue || 0) <= 0;
    const stageName = stageNames[order.stage] || 'Ordered';
    return `
      <div class="card card-page" >
        <div class="flex items-center justify-between mb-sm" >
          <div class="fs-13 fw-600 text-secondary" >Order</div>
          ${paid ? `<span class="badge badge-success fs-10" >Paid</span>` : `<span class="badge badge-warning fs-10" >Owes ${Utils.formatCurrency(order.balanceDue || 0)}</span>`}
        </div>
        <button class="area-customer-row" data-action="App.navigate" data-args='${JSON.stringify(["orders", {id: (order.id)}])}'>
          <span class="material-symbols-rounded">receipt_long</span>
          <span>
            <strong>${Utils.escapeHtml(order.orderNumber || 'Order')}</strong>
            <small>${Utils.formatCurrency(order.total || 0)} · ${stageName}${(order.depositPaid || 0) > 0 ? ` · ${Utils.formatCurrency(order.depositPaid)} paid` : ''}</small>
          </span>
          <span class="material-symbols-rounded">chevron_right</span>
        </button>
      </div>
    `;
  },

  renderPipeline(pipeline) {
    // Categorize by temperature
    const now = new Date();
    const hot = [];
    const warm = [];
    const cool = [];

    for (const appt of pipeline) {
      const daysSince = Utils.daysBetween(now, new Date(appt.date));
      const probability = this.getProbability(appt.outcome, daysSince);

      if (probability >= 0.6) hot.push({...appt, probability});
      else if (probability >= 0.3) warm.push({...appt, probability});
      else cool.push({...appt, probability});
    }

    return `
      ${hot.length > 0 ? `
        <div class="mb-md" >
          <div class="fs-12 fw-600 text-danger text-uppercase ls-05 mb-sm" >Hot — Close This Week</div>
          ${hot.map(a => this.renderPipelineCard(a)).join('')}
        </div>
      ` : ''}

      ${warm.length > 0 ? `
        <div class="mb-md" >
          <div class="fs-12 fw-600 text-warning text-uppercase ls-05 mb-sm" >Warm — Follow Up</div>
          ${warm.map(a => this.renderPipelineCard(a)).join('')}
        </div>
      ` : ''}

      ${cool.length > 0 ? `
        <div class="mb-md" >
          <div class="fs-12 fw-600 text-tertiary text-uppercase ls-05 mb-sm" >Cool — At Risk</div>
          ${cool.map(a => this.renderPipelineCard(a)).join('')}
        </div>
      ` : ''}

      ${pipeline.length === 0 ? `
        <div class="empty-state empty-state-lg">
          <span class="material-symbols-rounded">trending_up</span>
          <div>No follow-ups waiting</div>
          <div class="fs-13" >Complete visits to build your follow-up list</div>
        </div>
      ` : ''}
    `;
  },

  async openFollowUpDetail(id) {
    let appt = null;
    let customer = null;
    try {
      appt = await DB.getAppointment(id);
      customer = appt?.customerId ? await DB.getCustomer(appt.customerId) : null;
    } catch (e) {
      Toast.show('Could not load visit', 'error');
      return;
    }
    if (!appt) { Toast.show('Visit not found', 'error'); return; }

    const daysSince = Utils.daysBetween(new Date(), new Date(appt.date));
    const phone = customer?.phone || appt.phone || '';
    const match = TalkFeature.getTemplateForOutcome(appt.outcome);
    const outcomeMeta = {
      quoted: { label: 'Quote given', badgeClass: 'badge-primary' },
      thinking: { label: 'Needs to think', badgeClass: 'badge-primary' },
      partner: { label: 'Partner approval needed', badgeClass: 'badge-primary' },
      compare_quotes: { label: 'Comparing quotes', badgeClass: 'badge-primary' },
      expensive: { label: 'Price objection', badgeClass: 'badge-warning' },
      customer_no_show: { label: 'Missed visit', badgeClass: 'badge-danger' },
      advisor_unavailable: { label: "Couldn't attend", badgeClass: 'badge-danger' }
    };
    const meta = outcomeMeta[appt.outcome] || { label: appt.outcome || 'Follow-up', badgeClass: 'badge-primary' };

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <h3>${Utils.escapeHtml(appt.clientName || 'Customer')}</h3>
          <div class="fs-13 text-tertiary" >${Utils.escapeHtml(appt.address || 'No address set')}</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="card mt-12" >
          <div class="flex justify-between items-center" >
            <span class="badge ${meta.badgeClass}">${Utils.escapeHtml(meta.label)}</span>
            <span class="fs-13 text-tertiary" >${daysSince} day${daysSince === 1 ? '' : 's'} ago</span>
          </div>
          ${match && match.learned ? `
            <div class="fs-11 text-success mt-6" >
              <span class="material-symbols-rounded fs-12 vtext-bottom" >insights</span>
              Learned from ${match.sampleSize} past deals - typically closed in ${match.medianDaysToConversion}d
            </div>
          ` : ''}
          ${appt.value > 0 ? `
            <div class="mt-10 top-divider-10 flex justify-between" >
              <span class="text-secondary" >Quote total</span>
              <strong>${Utils.formatCurrency(appt.value)}</strong>
            </div>
          ` : ''}
          ${appt.notes ? `
            <div class="mt-10 top-divider-10 fs-13 text-secondary" >
              ${Utils.escapeHtml(appt.notes)}
            </div>
          ` : ''}
        </div>

        <div class="flex flex-col gap-sm mt-md" >
          ${match ? `
            <button class="btn btn-primary btn-block" data-close="1" data-action="TalkFeature.sendMessage" data-args='${JSON.stringify([(appt.id), match.template])}'>
              <span class="material-symbols-rounded">send</span>
              Send Reminder
            </button>
          ` : ''}
          ${phone ? `
            <a class="btn btn-outline btn-block" href="tel:${Utils.escapeHtml(Utils.toE164Phone(phone) || phone)}">
              <span class="material-symbols-rounded">call</span>
              Call Customer
            </a>
          ` : `
            <div class="fs-12 text-tertiary text-center" >No phone number on file</div>
          `}
        </div>
      </div>
    `;
    App.openModal(content);
  },

  openCustomerSearch() {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Search</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <input type="search" class="input" id="customer-search-input" placeholder="Name, postcode, phone, or product..."
               data-event="input" data-action="AppointmentsFeature.debouncedCustomerSearch" data-args='${JSON.stringify(["__value__"])}' autocomplete="off">
        <div class="mt-12" id="customer-search-results" >
          <div class="fs-13 text-tertiary text-center py-24" >
            Try a name, postcode (e.g. M14), phone number, or product (e.g. "roman blinds")
          </div>
        </div>
      </div>
    `;
    App.openModal(content);
    setTimeout(() => document.getElementById('customer-search-input')?.focus(), 100);
  },

  debouncedCustomerSearch(query) {
    clearTimeout(this._searchDebounceTimer);
    this._searchDebounceTimer = setTimeout(() => this.runCustomerSearch(query), 150);
  },

  async runCustomerSearch(query) {
    const resultsEl = document.getElementById('customer-search-results');
    if (!resultsEl) return;

    if (!query || query.trim().length < 2) {
      resultsEl.innerHTML = `<div class="fs-13 text-tertiary text-center py-24" >Keep typing (2+ characters)...</div>`;
      return;
    }

    let results = [];
    try {
      results = await Search.search(query);
    } catch (e) {
      console.error('Search failed:', e);
      resultsEl.innerHTML = `<div class="fs-13 text-danger text-center py-24" >Search failed - try again</div>`;
      return;
    }

    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="fs-13 text-tertiary text-center py-24" >No matches for "${Utils.escapeHtml(query)}"</div>`;
      return;
    }

    resultsEl.innerHTML = results.map(r => `
      <button class="area-customer-row w-full text-left"  data-action="AppointmentsFeature.openSearchResult" data-args='${JSON.stringify([r.type, (r.id)])}'>
        <span class="material-symbols-rounded">${r.icon}</span>
        <span>
          <strong>${Utils.escapeHtml(r.title)}</strong>
          <small>${Utils.escapeHtml(r.subtitle || '')}${r.detail ? ' · ' + Utils.escapeHtml(r.detail) : ''}</small>
        </span>
      </button>
    `).join('');
  },

  async openSearchResult(type, id) {
    App.closeModal();

    if (type === 'appointment') {
      App.navigate('appointments', { id });
      return;
    }

    if (type === 'customer') {
      App.navigate('customer', { id });
      return;
    }

    if (type === 'order') {
      try {
        const order = await DB.db.orders.get(id);
        if (order && typeof OrdersFeature !== 'undefined') {
          App.navigate('orders', { id: order.id });
          return;
        }
      } catch (e) {}
      Toast.show('No linked visit found for this order', 'warning');
    }
  },

  renderPipelineCard(appt) {
    const daysSince = Utils.daysBetween(new Date(), new Date(appt.date));

    return `
      <div class="card card-interactive visit-card" data-action="AppointmentsFeature.openFollowUpDetail" data-args='${JSON.stringify([(appt.id)])}'>
        <div class="visit-card-row">
          <div class="visit-main">
            <div class="visit-title">${Utils.escapeHtml(appt.clientName || 'Unknown')}</div>
            <div class="visit-meta">
              ${Utils.escapeHtml(appt.outcome === 'quoted' ? 'Quote given' : appt.outcome === 'thinking' ? 'Needs to think' : appt.outcome === 'partner' ? 'Partner approval' : appt.outcome === 'expensive' ? 'Price objection' : appt.outcome)} · ${daysSince} days ago
            </div>
            ${appt.value > 0 ? `
              <div class="visit-value">
                ${Utils.formatCurrency(appt.value)} · ${Math.round((appt.probability || 0) * 100)}% probability
              </div>
            ` : ''}
          </div>
          <span class="material-symbols-rounded text-tertiary shrink-0" >chevron_right</span>
        </div>
      </div>
    `;
  },

  getProbability(outcome, daysSince) {
    // Decay thresholds are config-driven (CONFIG.probabilityDecay, keyed by
    // "days since quote") so the ramp-down can be tuned in one place instead
    // of being hardcoded here.
    const decay = CONFIG.probabilityDecay || { 0: 0.8, 3: 0.6, 7: 0.4, 14: 0.2, 21: 0.05 };
    const thresholds = Object.keys(decay).map(Number).sort((a, b) => a - b);
    let probability = decay[0] ?? 0.8;
    for (const threshold of thresholds) {
      probability = decay[threshold];
      if (daysSince <= threshold) break;
    }
    return probability;
  },

  renderOutcomeButtons(appt) {
    const outcomes = CONFIG.outcomes[appt.type] || [];
    // The single most likely successful outcome gets a full-width primary
    // button so the common case (sold/finished) is one tap. Everything else
    // drops into a 2-column grid below it.
    const heroId = appt.type === 'consultation' ? 'ordered'
                 : appt.type === 'fitting' ? 'completed'
                 : appt.type === 'review' ? 'happy'
                 : appt.type === 'service_call' ? 'resolved'
                 : appt.type === 'follow_up' ? 'reached'
                 : 'measured';
    const hero = outcomes.find(o => o.id === heroId);
    const noVisitIds = ['customer_no_show', 'advisor_unavailable'];
    const noVisitOutcomes = outcomes.filter(o => noVisitIds.includes(o.id));
    const rest = outcomes.filter(o => o.id !== heroId && !noVisitIds.includes(o.id));

    const renderButton = (o, primary = false) => `
      <button class="btn ${primary ? 'btn-primary' : 'btn-outline'} ${primary ? 'btn-block' : 'btn-sm'}" style="${primary ? 'margin-bottom:12px;' : 'justify-content: flex-start; text-align: left;'}"
              data-action="AppointmentsFeature.captureOutcome" data-args='${JSON.stringify([(appt.id), o.id])}'>
        <span class="material-symbols-rounded fs-18" >${o.icon}</span>
        ${o.name}
      </button>
    `;

    return `
      ${hero ? renderButton(hero, true) : ''}
      ${rest.length > 0 ? `
        <div class="grid-2 gap-sm" >
          ${rest.map(o => renderButton(o, false)).join('')}
        </div>
      ` : ''}
      ${noVisitOutcomes.length > 0 ? `
        <div class="mt-md top-divider-strong" >
          <div class="fs-11 ls-em05 text-uppercase text-secondary mb-sm" >Visit didn't happen</div>
          <div class="grid-2 gap-sm" >
            ${noVisitOutcomes.map(o => renderButton(o, false)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  },

  // Customer 360 lives in its own feature now (js/features/customer/).
  // This method is kept as a thin delegate so every existing caller (inline
  // onclick handlers, old hashes like #appointments?customerId=N) still lands
  // on the same, upgraded profile screen.
  async renderCustomerProfile(customerId) {
    const id = parseInt(customerId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return `<div class="empty-state"><span class="material-symbols-rounded">person_off</span><div>Customer not found</div></div>`;
    }
    return CustomerFeature.renderProfile(id);
  },

  // ---- Customer photo gallery ----
  // Photos are stored as base64 in IndexedDB (DB.addPhoto) and render
  // directly as data URLs — no object URLs to track or revoke, and it works
  // on both the Dexie and mini-Dexie storage engines.

  renderPhotoThumb(p) {
    return `<div class="photo-tile"  role="button" tabindex="0" aria-label="View photo" data-action="AppointmentsFeature.openPhotoViewer" data-args='${JSON.stringify([(p.id), (p.customerId)])}' data-key="Enter, space">
      <img class="img-cover" src="${this._photoSrc(p)}" alt="" >
    </div>`;
  },

  _photoSrc(p) {
    return `data:${p.mimeType || 'image/jpeg'};base64,${p.data}`;
  },

  // Photo picker: on mobile it offers both the hardware camera and the photo
  // library (no `capture` attribute, so customers' shared window pictures can
  // be uploaded straight from WhatsApp-style downloads too); on desktop it's a
  // normal file picker. The picked photo is downscaled before saving so the
  // gallery stays lean (rows of a few tens of KB).
  // When fired from a visit detail screen, returnToAppointmentId sends the
  // advisor straight back to that visit after saving instead of the customer
  // profile — on-site capture shouldn't interrupt the visit flow.
  async captureCustomerPhoto(event, customerId, returnToAppointmentId = null) {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = '';
    if (!file) return;
    let data;
    try {
      const blob = await this._downscaleImage(file);
      data = await this._blobToDataUrl(blob);
    } catch (e) {
      console.error('Photo read failed:', e);
      Toast.show('Could not read that image', 'error');
      return;
    }
    this._capturePhoto = { customerId, data, mimeType: 'image/jpeg', returnToAppointmentId };
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Save photo</h3><button class="btn btn-ghost btn-sm" data-close="1" data-action="AppointmentsFeature.discardCapture"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <img class="img-contain maxh-45" src="${data}" alt="Captured photo" >
        <div class="form-group mt-12" >
          <label>Caption (optional)</label>
          <input type="text" class="input" id="photo-caption-input" value="${Utils.escapeHtml(Utils.formatDate(new Date(), 'long'))}" placeholder="e.g. Front windows with Juliet balcony">
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.saveCapturedPhoto"><span class="material-symbols-rounded">save</span>Save to gallery</button>
      </div>`;
    App.openModal(content);
  },

  discardCapture() {
    this._capturePhoto = null;
  },

  _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('encode failed'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  },

  // Photos are reference-only (seen on a phone, rarely zoomed), so they're
  // downscaled hard before storage: 800px longest side at ~60% JPEG keeps a
  // 2-4MB camera shot to a few tens of KB base64, which keeps IndexedDB lean
  // and the gallery quick — detail far beyond what a phone screen shows is
  // simply not needed.
  _downscaleImage(file, maxSide = 800, quality = 0.62) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode failed'));
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  async saveCapturedPhoto() {
    const caption = (document.getElementById('photo-caption-input')?.value || '').trim();
    const { customerId, data, mimeType, returnToAppointmentId } = this._capturePhoto || {};
    if (!customerId || !data) return;
    try {
      await DB.addPhoto({ customerId, data, mimeType, caption });
      const returnTo = returnToAppointmentId;
      this._capturePhoto = null;
      App.closeModal();
      Toast.show('Photo saved', 'success');
      if (returnTo) {
        App.navigate('appointments', { id: returnTo });
        return;
      }
      App.navigate('customer', { id: customerId });
    } catch (e) {
      console.error('Save photo error:', e);
      Toast.show('Failed to save photo', 'error');
    }
  },

  async openPhotoViewer(photoId, customerId) {
    let p = null;
    try { p = await DB.db.photos.get(photoId); } catch (e) {}
    if (!p) { Toast.show('Photo not found', 'error'); return; }
    const caption = p.caption || Utils.formatDate(p.createdAt, 'long');
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Photo</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <img class="img-contain maxh-55" src="${this._photoSrc(p)}" alt="Customer photo" >
        <div class="form-group mt-12" >
          <label>Caption</label>
          <input type="text" class="input" id="photo-viewer-caption" value="${Utils.escapeHtml(caption)}">
        </div>
        <button class="btn btn-outline btn-sm btn-block" data-action="AppointmentsFeature.savePhotoCaption" data-args='${JSON.stringify([(photoId)])}'><span class="material-symbols-rounded fs-16" >save</span>Save caption</button>
        <div class="fs-12 text-tertiary text-center mt-10 mb-xs" >Taken ${Utils.escapeHtml(Utils.formatDate(p.createdAt, 'long'))}</div>
        <button class="btn btn-danger btn-sm btn-block" data-action="AppointmentsFeature.confirmDeletePhoto" data-args='${JSON.stringify([(photoId), (customerId)])}'><span class="material-symbols-rounded fs-16" >delete</span>Delete photo</button>
      </div>`;
    App.openModal(content);
  },

  async savePhotoCaption(photoId) {
    const caption = (document.getElementById('photo-viewer-caption')?.value || '').trim();
    try {
      await DB.db.photos.update(photoId, { caption });
      Toast.show('Caption saved', 'success');
    } catch (e) {
      console.error('Caption save error:', e);
      Toast.show('Failed to save caption', 'error');
    }
  },

  confirmDeletePhoto(photoId, customerId) {
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Delete photo?</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary mb-md" >This permanently removes the photo from the customer's gallery. This can't be undone.</div>
        <button class="btn btn-danger btn-block" data-action="AppointmentsFeature.deletePhoto" data-args='${JSON.stringify([(photoId), (customerId)])}'><span class="material-symbols-rounded">delete</span>Delete Permanently</button>
      </div>`;
    App.openModal(content);
  },

  async deletePhoto(photoId, customerId) {
    try {
      await DB.deletePhoto(photoId);
      App.closeModal();
      Toast.show('Photo deleted', 'success');
      App.navigate('customer', { id: customerId });
    } catch (e) {
      console.error('Delete photo error:', e);
      Toast.show('Failed to delete photo', 'error');
    }
  },

  async confirmDeleteCustomer(customerId) {
    let customer = null;
    let apptCount = 0;
    let photoCount = 0;
    try {
      customer = await DB.getCustomer(customerId);
      apptCount = await DB.db.appointments.where('customerId').equals(customerId).count();
      photoCount = await DB.db.photos.where('customerId').equals(customerId).count();
    } catch (e) {}
    if (!customer) { Toast.show('Customer not found', 'error'); return; }
    const name = customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'this customer';
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Delete ${Utils.escapeHtml(name)}?</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary mb-md" >
          This permanently deletes ${Utils.escapeHtml(name)}${apptCount > 0 ? ` and ${apptCount} linked visit${apptCount === 1 ? '' : 's'}` : ''}, along with any orders${photoCount > 0 ? `, ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''} and messages on record for them. This can't be undone.
        </div>
        <button class="btn btn-danger btn-block" data-action="AppointmentsFeature.deleteCustomer" data-args='${JSON.stringify([(customerId)])}'>
          <span class="material-symbols-rounded">delete</span>Delete Permanently
        </button>
        <button class="btn btn-outline btn-block mt-sm"  data-action="App.closeModal">Cancel</button>
      </div>`;
    App.openModal(content);
  },

  async deleteCustomer(customerId) {
    try {
      const result = await DB.deleteCustomer(customerId);
      App.closeModal();
      const parts = [];
      if (result.appointments) parts.push(`${result.appointments} visit${result.appointments === 1 ? '' : 's'}`);
      if (result.orders) parts.push(`${result.orders} order${result.orders === 1 ? '' : 's'}`);
      Toast.show(parts.length ? `Customer deleted (also removed ${parts.join(', ')})` : 'Customer deleted', 'success');
      App.navigate('appointments');
    } catch (e) {
      console.error('Delete customer error:', e);
      Toast.show('Failed to delete customer', 'error');
    }
  },

  async renderDetail(id) {
    let appt = null;
    try {
      appt = await DB.getAppointment(id);
    } catch (e) {
      console.error('Failed to load visit:', e);
    }

    if (!appt) {
      return `<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Visit not found</div></div>`;
    }

    let customer = null;
    try {
      customer = appt.customerId ? await DB.getCustomer(appt.customerId) : null;
    } catch (e) {}

    let measurements = [];
    try {
      measurements = await DB.db.measurements.where('appointmentId').equals(appt.id).toArray();
    } catch (e) {}

    // The linked order (EXACTLY ONE per sale - see saveOutcome): puts money
    // status in front of the advisor on the visit itself instead of
    // requiring a detour through the Orders board to see what's owed. A
    // fitting/measure visit has no order of its own (the order is created on
    // the sale visit), so fall back to the customer's most recent open order
    // - the job this visit belongs to.
    let linkedOrder = null;
    try { linkedOrder = await DB.db.orders.where('appointmentId').equals(appt.id).first(); } catch (e) {}
    let orderCardOrder = linkedOrder;
    if (!orderCardOrder && appt.customerId) {
      try {
        const openOrders = (await DB.db.orders.where('customerId').equals(appt.customerId).toArray())
          .filter(o => (o.balanceDue || 0) > 0)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        orderCardOrder = openOrders[0] || null;
      } catch (e) {}
    }

    let photos = [];
    if (appt.customerId) {
      try {
        photos = await DB.getPhotosForCustomer(appt.customerId);
      } catch (e) {}
    }

    const typeConfig = CONFIG.appointmentTypes.find(t => t.id === appt.type);
    const contactPhone = customer?.phone || appt.phone || '';

    return `
      <div class="fade-in">
        ${App.renderTopHeader({ 
          title: 'Visit', 
          showBack: true, 
          backHref: 'appointments' 
        })}

        <!-- Customer Info -->
        <div class="card card-page-gap" >
          <div class="flex items-center gap-md" >
            <div style="display:flex;align-items:center;gap:16px;flex:1;min-width:0;${customer ? 'cursor:pointer;' : ''}" ${customer ? `role="button" tabindex="0" aria-label="View customer profile" data-action="App.navigate" data-args='${JSON.stringify(["customer", {id: (customer.id)}])}' data-key="Enter, space"` : ''}>
              <div class="avatar-56 shrink-0" >
                ${appt.clientName ? Utils.escapeHtml(appt.clientName.charAt(0).toUpperCase()) : '?'}
              </div>
              <div class="flex-1 min-w-0" >
                <div class="fs-20 fw-600" >${Utils.escapeHtml(appt.clientName || 'Unknown')}</div>
                ${customer ? `
                  <div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(customer.customerNumber || '')} · View profile</div>
                ` : ''}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" aria-label="Edit customer details" data-action="AppointmentsFeature.openEditDetailsModal" data-args='${JSON.stringify([(appt.id)])}'>
              <span class="material-symbols-rounded">edit</span>
            </button>
          </div>

          ${contactPhone ? `
            <div class="flex gap-sm mt-md" >
              <button class="btn btn-outline btn-sm flex-1 gap-6"  data-action="ContactFeature.open" data-args='${Utils.escapeHtml(JSON.stringify([{name: appt.clientName || 'Customer', phone: contactPhone}]))}'>
                <span class="material-symbols-rounded fs-18" >chat</span>
                Contact
              </button>
              ${(() => {
                const match = (typeof TalkFeature !== 'undefined') ? TalkFeature.getTemplateForOutcome(appt.outcome) : null;
                if (!match) return '';
                return `
                  <button class="btn btn-outline btn-sm flex-1 gap-6"  data-action="TalkFeature.sendMessage" data-args='${Utils.escapeHtml(JSON.stringify([(appt.id), match.template]))}'>
                    <span class="material-symbols-rounded fs-18" >forward_to_inbox</span>
                    ${Utils.escapeHtml(match.action)}
                  </button>
                `;
              })()}
            </div>
          ` : ''}
        </div>

        <!-- Visit Details -->
        <div class="card card-page" >
          <div class="flex flex-col gap-md" >
            <div class="flex items-center gap-12" >
              <span class="material-symbols-rounded text-tertiary" >event</span>
              <div>
                <div class="fw-500" >${Utils.formatDate(appt.date, 'long')}</div>
                <div class="fs-13 text-secondary" >${this.getArrivalWindowLabel(appt) ? `Arrive ${Utils.escapeHtml(this.getArrivalWindowLabel(appt))} · planned ${Utils.formatTime(appt.date)}` : Utils.formatTime(appt.date)}${this.getVisitDurationLabel(appt)}</div>
              </div>
            </div>

            <div class="flex items-center gap-12" >
              <span class="material-symbols-rounded text-tertiary" >${typeConfig?.icon || 'event'}</span>
              <div>
                <div class="fw-500" >${Utils.escapeHtml(typeConfig?.name || appt.type)}</div>
                <div class="fs-13 text-secondary" >${appt.source === 'company_system' ? 'From company lead system' : 'Self-generated'}</div>
              </div>
            </div>

            ${appt.address ? `
              <div class="flex items-start gap-12" >
                <span class="material-symbols-rounded text-tertiary mt-2" >location_on</span>
                <div class="flex-1" >
                  <div class="fw-500" >${Utils.escapeHtml(appt.address)}</div>
                </div>
                <button class="btn btn-ghost btn-sm shrink-0" aria-label="Edit address"  data-action="AppointmentsFeature.openEditDetailsModal" data-args='${JSON.stringify([(appt.id)])}'>
                  <span class="material-symbols-rounded fs-18" >edit</span>
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        ${orderCardOrder ? this.renderLinkedOrderCard(orderCardOrder) : ''}

        ${measurements.length ? `
          <div class="card card-page" >
            <div class="flex items-center justify-between mb-sm" >
              <div class="fs-13 fw-600 text-secondary" >Measurements</div>
              <button class="btn btn-ghost btn-sm" aria-label="Add another measurement" data-action="App.navigate" data-args='${JSON.stringify(["measure", {appointmentId: (appt.id)}])}'>
                <span class="material-symbols-rounded">add</span>
              </button>
            </div>
            ${measurements.map(m => `
              <button class="area-customer-row" data-action="App.navigate" data-args='${JSON.stringify(["measure", {appointmentId: (appt.id), measurementId: (m.id)}])}'>
                <span class="material-symbols-rounded">straighten</span>
                <span>
                  <strong>${Utils.escapeHtml(m.windowName || 'Window')}</strong>
                  <small>${m.widthUsed ? Utils.formatMeasurement(m.widthUsed) : '--'} × ${m.dropUsed ? Utils.formatMeasurement(m.dropUsed) : '--'} · ${m.fittingType === 'exact' ? 'Exact' : 'Recess'}</small>
                </span>
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            `).join('')}
          </div>
        ` : ''}

        <!-- Photos — capture on-site during sales, survey (measure) or fit
             days without leaving the visit screen. Co-lives with the same
             gallery on the customer profile. -->
        ${appt.customerId ? `
          <div class="card card-page" >
            <div class="flex items-center justify-between mb-sm" >
              <div class="fs-13 fw-600 text-secondary" >Photos ${photos.length ? `(${photos.length})` : ''}</div>
              <button class="btn btn-outline btn-sm" style="gap:6px;" aria-label="Add photo" data-file="visit-photo-input">
                <span class="material-symbols-rounded fs-16" >photo_camera</span>Add Photo
              </button>
            </div>
            ${photos.length === 0 ? `
              <div class="fs-13 text-tertiary text-center pt-12 pb-4" >Capture the windows, fronts or any damage notes — anything useful to remember from today.</div>
            ` : `
              <div class="grid-3 gap-6" >
                ${photos.map(p => this.renderPhotoThumb(p)).join('')}
              </div>
            `}
            <input type="file" id="visit-photo-input" accept="image/*" style="display:none;" data-action="AppointmentsFeature.captureCustomerPhoto" data-args='${JSON.stringify(["__event__", (appt.customerId), (appt.id)])}'>
          </div>
        ` : `
          <div class="card card-page" >
            <div class="fs-13 fw-600 text-secondary mb-6" >Photos</div>
            <div class="fs-13 text-tertiary" >Add a phone number to this visit to link a customer record — photos are stored there.</div>
          </div>
        `}

        ${appt.status !== 'cancelled' ? `
          <div class="px-md mb-md" >
            <div class="divider-text">Manage</div>
            <div class="grid-3 gap-sm mb-10" >
              ${appt.customerId ? `<button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['quotes', { action: 'add', customerId: appt.customerId, appointmentId: appt.id }])}'><span class="material-symbols-rounded">request_quote</span>Quote</button>` : ''}
              ${appt.address ? `
                <button class="btn btn-outline btn-sm" data-action="AppointmentsFeature.navigateToVisit" data-args='${Utils.escapeHtml(JSON.stringify([appt.address, (appt.id)]))}'>
                  <span class="material-symbols-rounded">navigation</span>
                  Navigate
                </button>
              ` : ''}
              <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(["measure", {appointmentId: (appt.id)}])}'>
                <span class="material-symbols-rounded">straighten</span>
                Measure
              </button>
              <button class="btn btn-outline btn-sm" data-action="AppointmentsFeature.openRescheduleModal" data-args='${JSON.stringify([(appt.id)])}'>
                <span class="material-symbols-rounded">edit_calendar</span>
                Move
              </button>
            </div>
            <button class="btn btn-danger btn-sm btn-block" data-action="AppointmentsFeature.openCancelModal" data-args='${JSON.stringify([(appt.id)])}'>
              <span class="material-symbols-rounded">event_busy</span>
              Cancel Visit
            </button>
          </div>
        ` : `
          <div class="px-md mb-md" >
            <div class="card bg-danger-light" >
              <strong class="text-danger" >Cancelled</strong>
              <div class="fs-13 text-secondary mt-xs" >This visit is kept in the record, but removed from live planning.</div>
            </div>
          </div>
        `}

        <!-- Outcome Section -->
        ${appt.status === 'confirmed' ? `
          <div class="px-md" >
            <div class="divider-text">Outcome</div>
            ${this.renderOutcomeButtons(appt)}
          </div>
        ` : appt.outcome ? `
          <div class="px-md" >
            <div class="divider-text">Outcome</div>
            <div class="card bg-success-light" >
              <div class="flex items-center gap-12" >
                <span class="material-symbols-rounded text-success" >check_circle</span>
                <div class="flex-1" >
                  <div class="fw-600" >${this.getOutcomeName(appt.outcome, appt.type)}</div>
                  ${appt.value > 0 ? `<div class="fs-13 text-success" >${Utils.formatCurrency(appt.value)}</div>` : ''}
                  ${appt.quoteReason ? `<div class="fs-13 text-secondary mt-2" >${Utils.escapeHtml(this.getQuoteReasonLabel(appt.quoteReason))}</div>` : ''}
                </div>
                <button class="btn btn-ghost btn-sm" aria-label="Change outcome" data-action="AppointmentsFeature.openChangeOutcomeModal" data-args='${JSON.stringify([(appt.id)])}'>
                  <span class="material-symbols-rounded">edit</span>
                </button>
              </div>
              ${appt.quoteReason === 'expensive' ? `
                <button class="btn btn-outline btn-sm btn-block mt-10"  data-action="AppointmentsFeature.openFloorCheckModal" data-args='${JSON.stringify([(appt.id)])}'>
                  <span class="material-symbols-rounded fs-18" >calculate</span>
                  Check my floor
                </button>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Notes -->
        <div class="px-md mt-md" >
          <div class="flex items-center justify-between" >
            <div class="divider-text mb-0" >Notes</div>
            <button class="btn btn-ghost btn-sm" aria-label="${appt.notes ? 'Edit notes' : 'Add notes'}" data-action="AppointmentsFeature.openEditNotesModal" data-args='${JSON.stringify([(appt.id)])}'>
              <span class="material-symbols-rounded">${appt.notes ? 'edit' : 'add'}</span>
            </button>
          </div>
          ${appt.notes ? `
            <div class="card inset-dark bg-bg" >
              <div class="fs-14 text-secondary prewrap" >${Utils.escapeHtml(appt.notes)}</div>
            </div>
          ` : `
            <div class="fs-13 text-tertiary" >No notes yet.</div>
          `}
        </div>
      </div>
    `;
  },

  renderAddForm(params = {}) {
    // "undefined" can reach here via a stale hash URL (older builds serialised
    // undefined params into the query string) - treat it like an absent value.
    // Date/time params are interpolated into input value attributes, so both
    // must also match a strict pattern: a crafted #add?date="x link would
    // otherwise break out of the attribute and inject markup/script.
    const paramDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : '';
    const paramTime = params.time && /^\d{2}:\d{2}$/.test(params.time) ? params.time : '';
    const today = paramDate || Utils.formatDate(new Date(), 'iso');
    const selectedTime = paramTime || '09:00';
    const allowedTypes = this.getAllowedTypesForDate(today);
    const defaultType = allowedTypes.includes(params.type) ? params.type : allowedTypes[0];
    const mode = this.getDayMode(today + 'T00:00:00');
    const scannedName = params.name || '';
    const scannedPhone = params.phone || '';
    const scannedAddress = params.address || '';
    const leadId = Number.isInteger(Number(params.leadId)) && Number(params.leadId) > 0 ? Number(params.leadId) : null;
    const jobId = Number.isInteger(Number(params.jobId)) && Number(params.jobId) > 0 ? Number(params.jobId) : null;
    const jobRole = ['fitting', 'service', 'return_visit'].includes(params.jobRole) ? params.jobRole : null;
    return `
      <div class="fade-in">
        ${App.renderTopHeader({ 
          title: 'New Visit', 
          showBack: true, 
          backHref: 'appointments' 
        })}

        <div class="p-md" >
          ${leadId ? `<input type="hidden" id="appt-lead-id" value="${leadId}">` : ''}
          ${jobId ? `<input type="hidden" id="appt-job-id" value="${jobId}">` : ''}
          ${jobRole ? `<input type="hidden" id="appt-job-role" value="${jobRole}">` : ''}
          ${jobId ? `<input type="hidden" id="appt-job-operation-id" value="${Utils.escapeHtml(Utils.generateId('job-visit'))}">` : ''}
          ${leadId ? '<div class="card inset-dark mb-md" id="lead-booking-banner"><span class="material-symbols-rounded fs-18">person_add</span> Booking from enquiry…</div>' : ''}
          ${jobId ? '<div class="card inset-dark mb-md" id="job-booking-banner"><span class="material-symbols-rounded fs-18">construction</span> Scheduling linked job visit…</div>' : ''}
          <div class="form-group">
            <label>Customer Name *</label>
            <input type="text" class="input" id="appt-name" autocomplete="name" placeholder="e.g. Sarah Johnson" value="${Utils.escapeHtml(scannedName)}">
          </div>

          <div class="form-group">
            <label>Phone</label>
            <input type="tel" class="input" id="appt-phone" inputmode="tel" autocomplete="tel" placeholder="07700 900123" value="${Utils.escapeHtml(scannedPhone)}">
          </div>

          <div class="form-group">
            <label>Address *</label>
            <input type="text" class="input" id="appt-address" autocomplete="street-address" placeholder="Full address" value="${Utils.escapeHtml(scannedAddress)}">
          </div>

          <button type="button" class="btn btn-outline btn-block visit-scan-button" data-action="App.navigate" data-args='${JSON.stringify(["ocr"])}'>
            <span class="material-symbols-rounded">document_scanner</span>
            Scan customer details
          </button>
          <div class="hint mt-neg-4 mb-md" >Use this for a paper note, screenshot, business card or order document.</div>

	          <div class="form-row">
	            <div class="form-group">
	              <label>Date *</label>
	              <input type="date" class="input" id="appt-date" value="${today}" data-action="AppointmentsFeature.updateVisitDayAdvice" data-args='${JSON.stringify(["__value__"])}'>
	            </div>
	            <div class="form-group">
	              <label>Diary time *</label>
	              <input type="time" class="input" id="appt-time" value="${selectedTime}" step="900" data-action="AppointmentsFeature.updateScheduleAdvice">
	              <div class="hint">Used for diary order, route planning and travel gaps.</div>
	            </div>
	          </div>

	          <div class="form-row">
	            <div class="form-group">
	              <label>Duration</label>
	              <select class="select" id="appt-duration" data-action="AppointmentsFeature.updateScheduleAdvice">
	                ${this.renderDurationOptions(params.duration || 1)}
	              </select>
	            </div>
	            <div class="form-group">
	              <label>Travel room</label>
	              <button type="button" class="btn btn-outline btn-block" data-action="AppointmentsFeature.previewTravelRoom">
	                <span class="material-symbols-rounded">route</span>
	                Check gaps
	              </button>
	            </div>
	          </div>
	          <div class="hint mt-neg-8 mb-sm" id="visit-day-advice" >${Utils.escapeHtml(mode.friendLine)}</div>
	          <div class="hint mb-md" id="travel-room-advice" >Rough area-based check of the gap before and after this visit.</div>

          ${this.renderArrivalWindowFields(this.getBlockForTime(selectedTime)?.id || 'none')}

          <div class="form-group">
            <label>Parking / Access</label>
            <input type="text" class="input" id="appt-access" placeholder="e.g. permit parking, side gate, 3rd floor">
          </div>

	          <div class="form-group">
	            <label>Type</label>
	            <select class="select" id="appt-type">
	              ${this.renderTypeOptions(allowedTypes, defaultType)}
	            </select>
	          </div>

          <div class="form-group">
            <label>Source</label>
            <select class="select" id="appt-source">
              ${CONFIG.leadSources.map(s => `<option value="${s.toLowerCase().replace(/\s+/g, '_')}">${s}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>Notes</label>
            <textarea class="textarea" id="appt-notes" placeholder="Rooms, product interest, objections, future opportunity..."></textarea>
          </div>

          <button class="btn btn-primary btn-block mt-sm" id="appt-save-btn"  data-action="AppointmentsFeature.saveAppointment">
            Save Visit
          </button>
        </div>
      </div>
    `;
	  },

  renderSlotOptions(blockId, selectedTime = '09:00', durationSlots = 1) {
    const block = (CONFIG.workingWeek?.blocks || []).find(b => b.id === blockId) || CONFIG.workingWeek?.blocks?.[0];
    if (!block) return `<option value="${selectedTime}">${selectedTime}</option>`;
    // Start times where the current duration would run past the end of the block are
    // shown disabled, rather than only being caught as a conflict after Save is tapped.
    return this.buildSlots(block.start, block.end)
      .map(slot => {
        const fits = this.fitsInBlock(block, slot, durationSlots);
        return `<option value="${slot}" ${slot === selectedTime && fits ? 'selected' : ''} ${fits ? '' : 'disabled'}>${slot}${fits ? '' : ' (too late for this duration)'}</option>`;
      })
      .join('');
  },

  renderTypeOptions(allowedTypes, selectedType) {
    return CONFIG.appointmentTypes
      .filter(t => allowedTypes.includes(t.id))
      .map(t => `<option value="${t.id}" ${t.id === selectedType ? 'selected' : ''}>${t.name}</option>`)
      .join('');
  },

  getBlockForTime(time) {
    const toMinutes = value => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    const target = toMinutes(time);
    return (CONFIG.workingWeek?.blocks || []).find(block => target >= toMinutes(block.start) && target < toMinutes(block.end));
  },

  // Does a visit of `durationSlots` starting at `startTime` finish at or before the
  // block's end? Used both to guard saving and to disable bad starts in the picker,
  // so a 2-hour visit at 20:30 can't be booked into a block that ends at 21:00.
  fitsInBlock(block, startTime, durationSlots) {
    if (!block) return true;
    const slotMinutes = CONFIG.workingWeek?.slotMinutes || 15;
    const toMinutes = value => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    const count = Math.max(1, parseInt(durationSlots, 10) || 1);
    const endMinutes = toMinutes(startTime) + count * slotMinutes;
    return endMinutes <= toMinutes(block.end);
  },

  updateSlotOptions() {
    const blockEl = document.getElementById('appt-block');
    const timeEl = document.getElementById('appt-time');
    const durationEl = document.getElementById('appt-duration');
    if (!blockEl || !timeEl) return;
    const duration = durationEl ? durationEl.value : 1;
    timeEl.innerHTML = this.renderSlotOptions(blockEl.value, timeEl.value, duration);
  },

  updateVisitDayAdvice(dateValue) {
    const adviceEl = document.getElementById('visit-day-advice');
    const typeEl = document.getElementById('appt-type');
    const mode = this.getDayMode(dateValue + 'T00:00:00');
    const allowed = this.getAllowedTypesForDate(dateValue + 'T00:00:00');
    if (adviceEl) adviceEl.textContent = mode.friendLine;
    if (typeEl) typeEl.innerHTML = this.renderTypeOptions(allowed, allowed[0]);
    this.updateScheduleAdvice();
  },

  updateScheduleAdvice() {
    const adviceEl = document.getElementById('travel-room-advice');
    const time = document.getElementById('appt-time')?.value || '';
    const durationSlots = Math.max(1, parseInt(document.getElementById('appt-duration')?.value, 10) || 1);
    if (!adviceEl || !time) return;

    if (!this.isQuarterHour(time)) {
      adviceEl.textContent = 'Use a 15-minute time, like 09:00, 09:15, 09:30 or 09:45.';
      adviceEl.style.color = 'var(--warning)';
      return;
    }

    const block = this.getBlockForTime(time);
    if (!block) {
      adviceEl.textContent = 'That time sits outside your normal working blocks.';
      adviceEl.style.color = 'var(--warning)';
      return;
    }

    if (!this.fitsInBlock(block, time, durationSlots)) {
      adviceEl.textContent = `That would run past ${block.name}. Pick an earlier time or shorter duration.`;
      adviceEl.style.color = 'var(--danger)';
      return;
    }

    adviceEl.textContent = `Fits inside ${block.name}. I will still warn you if travel looks tight.`;
    adviceEl.style.color = 'var(--text-tertiary)';
  },

  readAppointmentDraft() {
    const nameEl = document.getElementById('appt-name');
    if (!nameEl) return null;
    const windowData = this.readArrivalWindow() || {};
    return {
      name: nameEl.value.trim(),
      phone: document.getElementById('appt-phone')?.value.trim() || '',
      address: document.getElementById('appt-address')?.value.trim() || '',
      date: document.getElementById('appt-date')?.value || '',
      time: document.getElementById('appt-time')?.value || '09:00',
      durationSlots: Math.max(1, parseInt(document.getElementById('appt-duration')?.value, 10) || 1),
      type: document.getElementById('appt-type')?.value || 'consultation',
      source: document.getElementById('appt-source')?.value || 'self_generated',
      access: document.getElementById('appt-access')?.value.trim() || '',
      notes: document.getElementById('appt-notes')?.value.trim() || '',
      arrivalStart: windowData.arrivalStart || '',
      arrivalEnd: windowData.arrivalEnd || '',
      arrivalError: windowData.error || '',
      leadId: parseInt(document.getElementById('appt-lead-id')?.value, 10) || null,
      jobId: parseInt(document.getElementById('appt-job-id')?.value, 10) || null,
      jobRole: document.getElementById('appt-job-role')?.value || null,
      jobOperationId: document.getElementById('appt-job-operation-id')?.value || null
    };
  },

  async hydrateLeadBooking(leadId) {
    if (!leadId || typeof DB.getLead !== 'function') return;
    try {
      const lead = await DB.getLead(leadId);
      if (!lead || String(document.getElementById('appt-lead-id')?.value) !== String(leadId)) return;
      if (lead.appointmentId) {
        Toast.show('This enquiry already has a visit', 'info');
        App.navigate('appointments', { id: lead.appointmentId });
        return;
      }
      const name = lead.name || lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ');
      const address = typeof lead.address === 'string' ? lead.address : lead.address?.line1 || '';
      const values = { 'appt-name': name, 'appt-phone': lead.phone || '', 'appt-address': address, 'appt-notes': lead.notes || '' };
      for (const [id, value] of Object.entries(values)) {
        const input = document.getElementById(id);
        if (input && !input.value) input.value = value;
      }
      const source = document.getElementById('appt-source');
      if (source && lead.source && [...source.options].some(option => option.value === lead.source)) source.value = lead.source;
      const banner = document.getElementById('lead-booking-banner');
      if (banner) banner.innerHTML = '<span class="material-symbols-rounded fs-18">person_add</span> Booking visit from saved enquiry';
    } catch (error) {
      console.error('Lead booking load failed:', error);
      Toast.show('Could not load the enquiry', 'error');
    }
  },

  async hydrateJobBooking(jobId) {
    if (!jobId || typeof DB.getJob !== 'function') return;
    try {
      const job = await DB.getJob(jobId);
      if (!job || String(document.getElementById('appt-job-id')?.value) !== String(jobId)) return;
      const customer = job.customerId ? await DB.getCustomer(job.customerId) : null;
      const name = customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');
      const address = typeof customer?.address === 'string' ? customer.address : [customer?.address?.line1, customer?.address?.town, customer?.address?.postcode].filter(Boolean).join(', ');
      const values = { 'appt-name': name, 'appt-phone': customer?.phone || '', 'appt-address': address };
      for (const [id, value] of Object.entries(values)) { const input = document.getElementById(id); if (input && !input.value) input.value = value || ''; }
      const banner = document.getElementById('job-booking-banner');
      if (banner) banner.innerHTML = `<span class="material-symbols-rounded fs-18">construction</span> Scheduling for ${Utils.escapeHtml(job.jobNumber || 'job')}`;
    } catch (error) { console.error('Job booking load failed:', error); Toast.show('Could not load job details', 'error'); }
  },

  // Toggle the Save button between its normal and "working" states so the user
  // gets immediate feedback during the async duplicate/travel-warning checks
  // and DB write — instead of a button that looks dead for 1-2s.
  setSaveButtonState(state) {
    const btn = document.getElementById('appt-save-btn');
    if (!btn) return;
    if (state === 'working') {
      btn.disabled = true;
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Checking…';
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  },

  async offerBookingConfirmation(appointmentId) {
    const appt = await DB.getAppointment(appointmentId);
    if (!appt) { App.navigate('appointments'); return; }
    const customer = appt.customerId ? await DB.getCustomer(appt.customerId) : null;
    const phone = customer?.phone || appt.phone;
    const apptDate = new Date(appt.date);
    const message = NotificationService.buildBookingConfirmationMessage({
      firstName: customer?.firstName || appt.clientName?.split(' ')[0] || 'there',
      date: apptDate,
      dateLabel: Utils.formatDate(apptDate, 'long'),
      // time carries its own preposition so a window reads naturally:
      // "I'll be with you today at 09:00" vs "…today between 09:00 and 11:00".
      time: this.getArrivalWindowLabel(appt) || `at ${Utils.formatTime(appt.date)}`,
      address: appt.address || '',
      type: appt.type,
      advisorName: CONFIG.advisorName || 'Your Advisor'
    });
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Send Booking Confirmation?</h3><button class="btn btn-ghost btn-sm" data-action="AppointmentsFeature.skipBookingConfirmation"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="fs-13 text-secondary mb-sm" >Introduces you, confirms the visit, and asks about clear windows and parking.</div>
        <textarea class="textarea" id="booking-confirm-message" style="min-height:130px;">${Utils.escapeHtml(message)}</textarea>
        <div class="flex gap-sm mt-14" >
          <button class="btn btn-outline btn-block" data-action="AppointmentsFeature.skipBookingConfirmation">Not Now</button>
          <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.sendBookingConfirmation" data-args='${Utils.escapeHtml(JSON.stringify([(Utils.toWhatsAppPhone(phone) || '')]))}'>
            <span class="material-symbols-rounded">chat</span>Send
          </button>
        </div>
      </div>`;
    App.openModal(content);
  },

  sendBookingConfirmation(whatsappPhone) {
    const message = document.getElementById('booking-confirm-message')?.value.trim();
    if (!whatsappPhone) {
      Toast.show('No valid WhatsApp number for this customer', 'error');
      App.closeModal();
      App.navigate('appointments');
      return;
    }
    const url = Utils.buildWhatsAppUrl(whatsappPhone, message);
    if (url) window.open(url, '_blank');
    App.closeModal();
    App.navigate('appointments');
  },

  skipBookingConfirmation() {
    App.closeModal();
    App.navigate('appointments');
  },

  async saveAppointment(forceDuplicate = false, draft = null) {
    // A single user gesture can be dispatched more than once when event
    // listeners are accidentally rebound (or when assistive input emits a
    // second activation while the first async save is still pending). The
    // disabled button cannot protect against two handlers already running for
    // the same event, so keep the write path itself single-flight.
    if (this._saveAppointmentInFlight) return;

    const data = draft || this.readAppointmentDraft();
    if (!data) {
      Toast.show('Visit form is no longer open. Please check details and try again.', 'error');
      return;
    }
    const { name, phone, address, date, time, durationSlots, type, source, access, notes, arrivalStart, arrivalEnd, arrivalError, leadId, jobId, jobRole, jobOperationId } = data;

	    if (!name || !address || !date) {
	      Toast.show('Please fill in required fields', 'error');
	      return;
	    }

    if (arrivalError) {
      Toast.show(arrivalError, 'warning');
      return;
    }

    const windowTimeError = this.validateArrivalWindowContainsTime(time, arrivalStart, arrivalEnd);
    if (windowTimeError) {
      Toast.show(windowTimeError, 'warning');
      return;
    }

    if (!this.isQuarterHour(time)) {
      Toast.show('Pick one of the 15-minute slots, nice and tidy.', 'error');
      return;
    }

    const block = this.getBlockForTime(time);
    if (block && !this.fitsInBlock(block, time, durationSlots)) {
      Toast.show(`That runs past the end of ${block.name} (${block.end}). Pick an earlier start or a shorter visit.`, 'warning');
      return;
    }

    const allowedTypes = this.getAllowedTypesForDate(date + 'T00:00:00');
    if (!allowedTypes.includes(type)) {
      const mode = this.getDayMode(date + 'T00:00:00');
      Toast.show(`${mode.label}: this slot is better kept for ${mode.shortAdvice.toLowerCase()}.`, 'warning');
      return;
    }

    this._saveAppointmentInFlight = true;
    this.setSaveButtonState('working');
    try {
      const dateTime = new Date(date + 'T' + time);

      // A multi-slot visit (e.g. 4 x 15-min slots = 1 hour) occupies every slot it spans,
      // so check the whole run for conflicts, not just the start time.
      const wantedSlots = this.getOccupiedSlots(time, durationSlots);
      const existingToday = await DB.getAppointmentsForDate(new Date(date + 'T00:00:00').toISOString());
      const conflict = this.hasScheduleConflict({ time, durationSlots }, existingToday);
      if (conflict) {
        this.setSaveButtonState('idle');
        Toast.show(wantedSlots.length > 1 ? 'One of those slots is already booked. Choose a free run of slots.' : 'That slot is already booked. Choose a free one.', 'warning');
        return;
      }

      if (!forceDuplicate) {
        const capacityWarnings = typeof CapacityService !== 'undefined'
          ? await CapacityService.analyse({ date: dateTime.toISOString(), durationSlots }, existingToday)
          : [];
        const travelWarnings = [
          ...capacityWarnings.filter(w => w.code !== 'overlap').map(w => w.message),
          ...this.findTravelWarnings({ address, date, time, durationSlots }, existingToday)
        ];
        if (travelWarnings.length > 0) {
          this.setSaveButtonState('idle');
          this.pendingTravelAction = { kind: 'saveAppointment', draft: data };
          this.showTravelWarning(travelWarnings);
          return;
        }

        const warnings = await this.findBookingWarnings({ name, phone, address, date, time, durationSlots }, existingToday);
        if (warnings.length > 0) {
          this.setSaveButtonState('idle');
          this.pendingAppointmentDraft = data;
          this.showBookingWarning(warnings);
          return;
        }
      }

      const appointmentData = {
        clientName: name,
        phone,
        address,
        date: dateTime.toISOString(),
        durationSlots,
        type,
        source,
        arrivalStart: arrivalStart || null,
        arrivalEnd: arrivalEnd || null,
        notes: [access ? `Access: ${access}` : '', notes].filter(Boolean).join('\n\n'),
        status: 'confirmed'
      };

      // Lead conversion owns customer resolution, visit creation and lead
      // linking in one retry-safe domain operation. Only leadId travelled in
      // the URL; contact details were loaded from the encrypted local store.
      if (leadId && typeof DB.convertLeadToVisit === 'function') {
        const result = await DB.convertLeadToVisit(leadId, appointmentData);
        const newAppt = result.appointment;
        Toast.show('Enquiry converted and visit saved', 'success');
        if (typeof MessageScheduler !== 'undefined') MessageScheduler.reschedule();
        const bookingAskTypes = ['consultation', 'measure', 'fitting', 'review', 'service_call'];
        if (phone && bookingAskTypes.includes(type)) {
          this.offerBookingConfirmation(newAppt.id);
          return;
        }
        App.navigate('appointments', { id: newAppt.id });
        return;
      }

      if (jobId && typeof DB.scheduleJobVisit === 'function') {
        const result = await DB.scheduleJobVisit(jobId, { ...appointmentData, jobRole: jobRole || type, operationId: jobOperationId });
        const newAppt = result.appointment || result;
        Toast.show('Job visit scheduled', 'success');
        if (typeof MessageScheduler !== 'undefined') MessageScheduler.reschedule();
        App.navigate('jobs', { id: jobId });
        return;
      }

      // Create or find customer
      let customerId = null;
      if (phone) {
        const existing = await DB.findCustomerByPhone(phone);
        if (existing) {
          customerId = existing.id;
        }
      }

      if (!customerId) {
        const { postcode, postcodeNormalized } = (typeof OCRFeature !== 'undefined' && OCRFeature.extractPostcodeFromAddress)
          ? OCRFeature.extractPostcodeFromAddress(address)
          : { postcode: '', postcodeNormalized: '' };
        const customer = await DB.addCustomer({
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' ') || '',
          fullName: name,
          phone,
          postcodeNormalized,
          address: {
            line1: address,
            postcode,
            postcodeNormalized
          },
          source: source
        });
        customerId = customer.id;
      }

      const newAppt = await DB.addAppointment({
        customerId,
        ...appointmentData
      });

      Toast.show('Visit saved', 'success');
      if (typeof MessageScheduler !== 'undefined') MessageScheduler.reschedule();
      const bookingAskTypes = ['consultation', 'measure', 'fitting', 'review', 'service_call'];
      if (phone && bookingAskTypes.includes(type)) {
        this.offerBookingConfirmation(newAppt.id);
        return;
      }
      App.navigate('appointments');
    } catch (e) {
      console.error('Save visit error:', e);
      this.setSaveButtonState('idle');
      Toast.show('Failed to save visit', 'error');
    } finally {
      this._saveAppointmentInFlight = false;
    }
	  },

  hasScheduleConflict({ time, durationSlots }, appointments, excludeId = null) {
    const wantedSlots = this.getOccupiedSlots(time, durationSlots);
    return appointments.some(a => {
      if (a.status === 'cancelled' || String(a.id) === String(excludeId)) return false;
      const occupied = this.getOccupiedSlots(this.getTimeKey(a.date), a.durationSlots || 1);
      return occupied.some(slot => wantedSlots.includes(slot));
    });
  },

  findTravelWarnings({ address, date, time, durationSlots }, appointments, excludeId = null) {
    const start = new Date(date + 'T' + time);
    const slotMinutes = CONFIG.workingWeek?.slotMinutes || 15;
    const end = new Date(start.getTime() + Math.max(1, durationSlots || 1) * slotMinutes * 60000);
    const active = appointments
      .filter(a => a.status !== 'cancelled' && String(a.id) !== String(excludeId))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const warnings = [];
    for (const appt of active) {
      const apptStart = new Date(appt.date);
      const apptEnd = new Date(apptStart.getTime() + Math.max(1, appt.durationSlots || 1) * slotMinutes * 60000);
      const required = this.estimateTravelBufferMinutes(appt.address || '', address || '');

      if (apptEnd <= start) {
        const gap = Math.round((start - apptEnd) / 60000);
        if (gap < required) {
          warnings.push(`Only ${gap} min after ${appt.clientName || 'previous visit'}; I would allow around ${required} min for travel and breathing room.`);
        }
      } else if (end <= apptStart) {
        const gap = Math.round((apptStart - end) / 60000);
        if (gap < required) {
          warnings.push(`Only ${gap} min before ${appt.clientName || 'next visit'}; route-wise I would want about ${required} min.`);
        }
      }
    }
    return warnings.slice(0, 3);
  },

  estimateTravelBufferMinutes(fromAddress, toAddress) {
    if (!fromAddress || !toAddress) return 30;
    const fromArea = this.getPostcodeArea(fromAddress);
    const toArea = this.getPostcodeArea(toAddress);
    if (fromArea && toArea && fromArea === toArea) return 20;
    if (fromArea && toArea) return 45;
    return 30;
  },

  async previewTravelRoom() {
    const draft = this.readAppointmentDraft();
    const advice = document.getElementById('travel-room-advice');
    if (!draft || !draft.date) {
      if (advice) advice.textContent = 'Add the date and time first, then I can check the gaps.';
      return;
    }
    const existingToday = await DB.getAppointmentsForDate(new Date(draft.date + 'T00:00:00').toISOString());
    const warnings = this.findTravelWarnings(draft, existingToday);
    const suggestions = typeof CapacityService !== 'undefined'
      ? await CapacityService.suggest({ date: `${draft.date}T${draft.time}`, durationSlots: draft.durationSlots }, existingToday)
      : [];
    if (advice) {
      advice.textContent = warnings.length > 0
        ? `${warnings[0]}${suggestions.length ? ` Possible diary gaps: ${suggestions.map(s => s.label).join(', ')} (advice only).` : ''}`
        : 'The gap around this visit looks workable from the diary.';
    }
  },

  showTravelWarning(warnings) {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Check this diary slot</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          This may still work, but the day has a capacity or travel warning worth reviewing.
        </div>
        <div class="flex flex-col gap-sm mb-18" >
          ${warnings.map(text => `
            <div class="note-warning fs-13 lh-140" >
              ${Utils.escapeHtml(text)}
            </div>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.confirmTravelWarning">
          Save anyway
        </button>
        <button class="btn btn-outline btn-block mt-10"  data-action="App.closeModal">
          Adjust time
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async confirmTravelWarning() {
    const action = this.pendingTravelAction;
    this.pendingTravelAction = null;
    App.closeModal();
    if (!action) return;
    if (action.kind === 'saveAppointment') {
      await this.saveAppointment(true, action.draft);
    } else if (action.kind === 'reschedule') {
      await this.saveReschedule(action.id, true, action.draft);
    } else if (action.kind === 'editDetails') {
      await this.saveEditDetails(action.id, true, action.draft);
    }
  },

  async confirmDuplicateSave() {
    const draft = this.pendingAppointmentDraft;
    this.pendingAppointmentDraft = null;
    App.closeModal();
    await this.saveAppointment(true, draft);
  },

  async findBookingWarnings({ name, phone, address, date, time, durationSlots }, existingToday = null) {
    const warnings = [];
    const normalizedPhone = this.normalizePhone(phone);
    const normalizedName = this.normalizeBookingText(name);
    const normalizedAddress = this.normalizeBookingText(address);
    const requestedStart = new Date(date + 'T' + time);
    const today = existingToday || await DB.getAppointmentsForDate(new Date(date + 'T00:00:00').toISOString());
    const activeToday = today.filter(a => a.status !== 'cancelled');

    for (const appt of activeToday) {
      const reasons = [];
      const samePhone = normalizedPhone && this.normalizePhone(appt.phone || '') === normalizedPhone;
      const sameAddress = normalizedAddress && this.normalizeBookingText(appt.address || '') === normalizedAddress;
      const similarName = normalizedName && this.namesLookSimilar(normalizedName, this.normalizeBookingText(appt.clientName || ''));
      const minutesApart = Math.abs((new Date(appt.date) - requestedStart) / 60000);

      if (samePhone) reasons.push('same phone');
      if (sameAddress) reasons.push('same address');
      if (similarName) reasons.push('similar name');
      if (minutesApart > 0 && minutesApart < (durationSlots * (CONFIG.workingWeek?.slotMinutes || 15) + 45)) {
        reasons.push('very close time');
      }

      if (samePhone || sameAddress || (similarName && reasons.length > 1)) {
        warnings.push({
          title: `${appt.clientName || 'Customer'} already has a visit that day`,
          detail: `${Utils.formatTime(appt.date)} · ${reasons.join(', ')}`
        });
      }
    }

    if (normalizedPhone || normalizedAddress) {
      try {
        const upcoming = await DB.getFutureAppointmentsUntil(new Date(Date.now() + 180 * 86400000));
        const matchingFuture = upcoming
          .filter(a => a.status !== 'cancelled' && !Utils.isSameDay(a.date, requestedStart))
          .filter(a => {
            const samePhone = normalizedPhone && this.normalizePhone(a.phone || '') === normalizedPhone;
            const sameAddress = normalizedAddress && this.normalizeBookingText(a.address || '') === normalizedAddress;
            return samePhone || sameAddress;
          })
          .slice(0, 2);

        for (const appt of matchingFuture) {
          warnings.push({
            title: `${appt.clientName || 'Customer'} is already in the diary`,
            detail: `${Utils.formatDate(appt.date, 'weekday-day-month')} at ${Utils.formatTime(appt.date)}`
          });
        }
      } catch (e) {}
    }

    return warnings.slice(0, 4);
  },

  showBookingWarning(warnings) {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Possible duplicate</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          This may still be a genuine second visit, but I found something close enough to check before saving.
        </div>
        <div class="flex flex-col gap-sm mb-18" >
          ${warnings.map(w => `
            <div class="inset-dark note-dark" >
              <div class="fw-700 text-primary" >${Utils.escapeHtml(w.title)}</div>
              <div class="fs-12 text-tertiary mt-2" >${Utils.escapeHtml(w.detail)}</div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.confirmDuplicateSave">
          Save anyway
        </button>
        <button class="btn btn-outline btn-block mt-10"  data-action="App.closeModal">
          Check details
        </button>
      </div>
    `;
    App.openModal(content);
  },

  normalizePhone(phone) {
    return (phone || '').replace(/\D/g, '').replace(/^0044/, '0').replace(/^44/, '0');
  },

  normalizeBookingText(value) {
    return (value || '')
      .toLowerCase()
      .replace(/\b(flat|apartment|apt|house|road|rd|street|st|avenue|ave|drive|dr|lane|ln|close|cl|court|ct)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  },

  namesLookSimilar(a, b) {
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  },

  isQuarterHour(time) {
    const minutes = Number((time || '').split(':')[1]);
    return Number.isFinite(minutes) && minutes % (CONFIG.workingWeek?.slotMinutes || 15) === 0;
  },

  async openRescheduleModal(id) {
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const date = Utils.formatDate(appt.date, 'iso');
    const time = this.getTimeKey(appt.date);
    const windowPreset = this.getArrivalWindowPreset(appt);
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Move Visit</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-row">
          <div class="form-group">
            <label>New date</label>
            <input type="date" class="input" id="move-date" value="${date}">
          </div>
          <div class="form-group">
            <label>New time</label>
            <input type="time" class="input" id="move-time" value="${time}" step="900">
          </div>
        </div>
        <div class="form-group">
          <label>Duration</label>
          <select class="select" id="move-duration">
            ${this.renderDurationOptions(appt.durationSlots || 1)}
          </select>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select class="select" id="move-type">
            ${this.renderTypeOptions(CONFIG.appointmentTypes.map(type => type.id), appt.type)}
          </select>
        </div>
        ${this.renderArrivalWindowFields(windowPreset, appt.arrivalStart || '', appt.arrivalEnd || '')}
        <div class="form-group">
          <label>Reason / note</label>
          <textarea class="textarea" id="move-note" placeholder="Customer requested, route tidy-up, no access..."></textarea>
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.saveReschedule" data-args='${JSON.stringify([(id)])}'>
          Save New Time
        </button>
      </div>
    `;
    App.openModal(content);
  },

  readRescheduleDraft(appt) {
    const windowData = this.readArrivalWindow() || {};
    return {
      date: document.getElementById('move-date')?.value || Utils.formatDate(appt.date, 'iso'),
      time: document.getElementById('move-time')?.value || this.getTimeKey(appt.date),
      durationSlots: Math.max(1, parseInt(document.getElementById('move-duration')?.value, 10) || appt.durationSlots || 1),
      type: document.getElementById('move-type')?.value || appt.type,
      reason: document.getElementById('move-note')?.value.trim() || '',
      address: appt.address || '',
      arrivalStart: windowData.arrivalStart || '',
      arrivalEnd: windowData.arrivalEnd || '',
      arrivalError: windowData.error || ''
    };
  },

  async saveReschedule(id, forceTravel = false, draft = null) {
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const rawData = draft || this.readRescheduleDraft(appt);
    // Older queued travel-warning drafts predate editable visit types. Keep
    // those compatible by retaining the appointment's current type.
    const data = { ...rawData, type: rawData.type || appt.type };

    if (!data.date || !data.time) {
      Toast.show('Pick a date and time first', 'error');
      return;
    }
    if (!CONFIG.appointmentTypes.some(type => type.id === data.type)) {
      Toast.show('Pick a valid visit type', 'error');
      return;
    }
    if (data.arrivalError) {
      Toast.show(data.arrivalError, 'warning');
      return;
    }
    const windowTimeError = this.validateArrivalWindowContainsTime(data.time, data.arrivalStart, data.arrivalEnd);
    if (windowTimeError) {
      Toast.show(windowTimeError, 'warning');
      return;
    }
    if (!this.isQuarterHour(data.time)) {
      Toast.show('Use a 15-minute time, nice and tidy.', 'warning');
      return;
    }

    const existingToday = await DB.getAppointmentsForDate(new Date(data.date + 'T00:00:00').toISOString());
    if (this.hasScheduleConflict(data, existingToday, id)) {
      Toast.show('That time clashes with another visit.', 'warning');
      return;
    }

    if (!forceTravel) {
      const candidateDate = new Date(data.date + 'T' + data.time).toISOString();
      const capacityWarnings = typeof CapacityService !== 'undefined'
        ? await CapacityService.analyse({ date: candidateDate, durationSlots: data.durationSlots }, existingToday, id)
        : [];
      const travelWarnings = [
        ...capacityWarnings.filter(w => w.code !== 'overlap').map(w => w.message),
        ...this.findTravelWarnings(data, existingToday, id)
      ];
      if (travelWarnings.length > 0) {
        this.pendingTravelAction = { kind: 'reschedule', id, draft: data };
        this.showTravelWarning(travelWarnings);
        return;
      }
    }

    const newDate = new Date(data.date + 'T' + data.time).toISOString();
    const previous = `${Utils.formatDate(appt.date, 'short')} ${Utils.formatTime(appt.date)}`;
    const existingNotes = appt.notes || '';
    const moveNote = `Moved from ${previous}${data.reason ? `: ${data.reason}` : ''}`;
    await DB.updateAppointment(id, {
      date: newDate,
      durationSlots: data.durationSlots,
      type: data.type,
      arrivalStart: data.arrivalStart || null,
      arrivalEnd: data.arrivalEnd || null,
      status: 'confirmed',
      notes: [existingNotes, moveNote].filter(Boolean).join('\n\n')
    });
    App.closeModal();
    Toast.show('Visit moved', 'success');
    App.navigate('appointments', { id });
  },

  async openEditDetailsModal(id) {
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const date = Utils.formatDate(appt.date, 'iso');
    const time = this.getTimeKey(appt.date);
    const windowPreset = this.getArrivalWindowPreset(appt);
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Edit Details</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="divider-text">Visit time</div>
        <div class="form-row">
          <div class="form-group">
            <label>Date *</label>
            <input type="date" class="input" id="edit-detail-date" value="${date}">
          </div>
          <div class="form-group">
            <label>Visit time *</label>
            <input type="time" class="input" id="edit-detail-time" value="${time}" step="900">
          </div>
        </div>
        <div class="form-group">
          <label>Duration</label>
          <select class="select" id="edit-detail-duration">
            ${this.renderDurationOptions(appt.durationSlots || 1)}
          </select>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select class="select" id="edit-detail-type">
            ${this.renderTypeOptions(CONFIG.appointmentTypes.map(type => type.id), appt.type)}
          </select>
        </div>
        ${this.renderArrivalWindowFields(windowPreset, appt.arrivalStart || '', appt.arrivalEnd || '')}
        <div class="divider-text">Customer details</div>
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" class="input" id="edit-detail-name" autocomplete="name" value="${Utils.escapeHtml(appt.clientName || '')}">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" class="input" id="edit-detail-phone" inputmode="tel" autocomplete="tel" value="${Utils.escapeHtml(appt.phone || '')}">
        </div>
        <div class="form-group">
          <label>Address *</label>
          <input type="text" class="input" id="edit-detail-address" autocomplete="street-address" value="${Utils.escapeHtml(appt.address || '')}">
          <div class="hint">Include the postcode here, e.g. "12 Elm Street, Manchester, M14 5AB"</div>
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.saveEditDetails" data-args='${JSON.stringify([(id)])}'>
          Save Changes
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveEditDetails(id, forceTravel = false, draft = null) {
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }

    const rawData = draft || (() => {
      const windowData = this.readArrivalWindow() || {};
      return {
        name: document.getElementById('edit-detail-name')?.value.trim() || '',
        phone: document.getElementById('edit-detail-phone')?.value.trim() || '',
        address: document.getElementById('edit-detail-address')?.value.trim() || '',
        date: document.getElementById('edit-detail-date')?.value || '',
        time: document.getElementById('edit-detail-time')?.value || '',
        durationSlots: Math.max(1, parseInt(document.getElementById('edit-detail-duration')?.value, 10) || appt.durationSlots || 1),
        type: document.getElementById('edit-detail-type')?.value || appt.type,
        arrivalStart: windowData.arrivalStart || '',
        arrivalEnd: windowData.arrivalEnd || '',
        arrivalError: windowData.error || ''
      };
    })();
    // Retain compatibility with a pending travel-warning draft created by an
    // older build, where type was not part of the edit payload.
    const data = { ...rawData, type: rawData.type || appt.type };

    if (!data.name || !data.address || !data.date || !data.time) {
      Toast.show('Name, address, date and time are required', 'error');
      return;
    }
    if (!CONFIG.appointmentTypes.some(type => type.id === data.type)) {
      Toast.show('Pick a valid visit type', 'error');
      return;
    }
    if (data.arrivalError) {
      Toast.show(data.arrivalError, 'warning');
      return;
    }
    const windowTimeError = this.validateArrivalWindowContainsTime(data.time, data.arrivalStart, data.arrivalEnd);
    if (windowTimeError) {
      Toast.show(windowTimeError, 'warning');
      return;
    }
    if (!this.isQuarterHour(data.time)) {
      Toast.show('Use a 15-minute time, nice and tidy.', 'warning');
      return;
    }

    const block = this.getBlockForTime(data.time);
    if (block && !this.fitsInBlock(block, data.time, data.durationSlots)) {
      Toast.show(`That runs past the end of ${block.name} (${block.end}). Pick an earlier start or a shorter visit.`, 'warning');
      return;
    }

    const existingToday = await DB.getAppointmentsForDate(new Date(data.date + 'T00:00:00').toISOString());
    if (this.hasScheduleConflict(data, existingToday, id)) {
      Toast.show('That time clashes with another visit.', 'warning');
      return;
    }

    if (!forceTravel) {
      const candidateDate = new Date(data.date + 'T' + data.time).toISOString();
      const capacityWarnings = typeof CapacityService !== 'undefined'
        ? await CapacityService.analyse({ date: candidateDate, durationSlots: data.durationSlots }, existingToday, id)
        : [];
      const travelWarnings = [
        ...capacityWarnings.filter(w => w.code !== 'overlap').map(w => w.message),
        ...this.findTravelWarnings(data, existingToday, id)
      ];
      if (travelWarnings.length > 0) {
        this.pendingTravelAction = { kind: 'editDetails', id, draft: data };
        this.showTravelWarning(travelWarnings);
        return;
      }
    }

    try {
      await DB.updateAppointment(id, {
        clientName: data.name,
        phone: data.phone,
        address: data.address,
        date: new Date(data.date + 'T' + data.time).toISOString(),
        durationSlots: data.durationSlots,
        type: data.type,
        arrivalStart: data.arrivalStart || null,
        arrivalEnd: data.arrivalEnd || null
      });

      // Keep the linked customer record in sync so search, the area view and
      // future visits all see the corrected details rather than just this visit.
      if (appt.customerId) {
        const { postcode, postcodeNormalized } = (typeof OCRFeature !== 'undefined' && OCRFeature.extractPostcodeFromAddress)
          ? OCRFeature.extractPostcodeFromAddress(data.address)
          : { postcode: '', postcodeNormalized: '' };
        const customer = await DB.getCustomer(appt.customerId);
        await DB.updateCustomer(appt.customerId, {
          fullName: data.name,
          firstName: data.name.split(' ')[0],
          lastName: data.name.split(' ').slice(1).join(' ') || '',
          phone: data.phone,
          postcodeNormalized,
          address: { ...(customer?.address || {}), line1: data.address, postcode, postcodeNormalized }
        });
      }

      App.closeModal();
      Toast.show('Details updated', 'success');
      App.navigate('appointments', { id });
    } catch (e) {
      console.error('Save edit details error:', e);
      Toast.show('Failed to save changes', 'error');
    }
  },

  async openCancelModal(id) {
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Cancel Visit</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          I will keep this in the customer record, but remove it from live diary, route and targets.
        </div>
        <div class="form-group">
          <label>Reason</label>
          <select class="select" id="cancel-reason">
            <option value="customer_cancelled">Customer cancelled</option>
            <option value="rebook_later">Customer wants to rebook later</option>
            <option value="advisor_unavailable">Advisor unavailable</option>
            <option value="duplicate">Duplicate booking</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Note</label>
          <textarea class="textarea" id="cancel-note" placeholder="Anything useful for the relationship..."></textarea>
        </div>
        <button class="btn btn-danger btn-block" data-action="AppointmentsFeature.cancelAppointment" data-args='${JSON.stringify([(id)])}'>
          Cancel Visit
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async cancelAppointment(id) {
    const reason = document.getElementById('cancel-reason')?.value || 'cancelled';
    const note = document.getElementById('cancel-note')?.value.trim() || '';
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const existingNotes = appt.notes || '';
    const cancelNote = `Cancelled: ${reason.replace(/_/g, ' ')}${note ? ` - ${note}` : ''}`;
    await DB.updateAppointment(id, {
      status: 'cancelled',
      cancellationReason: reason,
      notes: [existingNotes, cancelNote].filter(Boolean).join('\n\n')
    });
    App.closeModal();
    Toast.show('Visit cancelled', 'success');
    App.navigate('appointments', { id });
  },

  // Tapped from the visit detail screen's "Navigate" button - opens turn-by-turn
  // directions and, same as the Today screen's "Start Route" flow, starts a live
  // GPS-tracked trip that logs its own mileage once you arrive. Without this, the
  // most obvious button on a visit ("Navigate") silently skipped mileage capture
  // entirely, while a differently-named button elsewhere in the app did track it -
  // same feature, inconsistent behaviour depending which screen you tapped from.
  async navigateToVisit(address, appointmentId) {
    window.open(Geo.buildNavigationUrl(address || ''), '_blank');
    await Geo.startTrip({ destinationAddress: address || '', appointmentId });
    if (typeof MessageScheduler !== 'undefined') MessageScheduler.onDeparture(appointmentId);
  },

  async openEditNotesModal(id) {
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>${appt.notes ? 'Edit Notes' : 'Add Notes'}</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <textarea class="textarea" id="edit-appt-notes" rows="5" placeholder="Anything worth remembering about this visit...">${Utils.escapeHtml(appt.notes || '')}</textarea>
        </div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.saveNotes" data-args='${JSON.stringify([(id)])}'>
          Save Notes
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveNotes(id) {
    const notes = document.getElementById('edit-appt-notes')?.value.trim() || '';
    try {
      await DB.updateAppointment(id, { notes });
      App.closeModal();
      Toast.show('Notes saved', 'success');
      App.navigate('appointments', { id });
    } catch (e) {
      console.error('Save notes error:', e);
      Toast.show('Failed to save notes', 'error');
    }
  },

  async openChangeOutcomeModal(id) {
    const appt = await DB.getAppointment(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Change Outcome</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="hint mt-neg-4 mb-14" >Picking an outcome below replaces the current one.</div>
        ${this.renderOutcomeButtons(appt)}
      </div>
    `;
    App.openModal(content);
  },

  async captureOutcome(id, outcomeId) {
    let appt = null;
    try {
      appt = await DB.getAppointment(id);
    } catch (e) {
      Toast.show('Visit not found', 'error');
      return;
    }

    const outcomeConfig = (CONFIG.outcomes[appt.type] || []).find(o => o.id === outcomeId);
    if (!outcomeConfig) return;
    const moneyOutcome = ['ordered', 'quoted'].includes(outcomeId);
    const saleOutcome = outcomeId === 'ordered';
    const valueLabel = saleOutcome ? 'Sale Amount (&pound;)' : 'Quote Amount (&pound;)';
    const commissionHint = this.getCommissionHint();

    // The door-money hooks: a deposit when the sale is logged, the final
    // payment when the fitting completes. Both read REAL order records, never
    // a guess. A fitting visit has no order of its own (orders are created on
    // the sale visit), so the fitting balance is found by customer - the most
    // recent open order is the job being fitted today.
    let linkedOrder = null;
    try { linkedOrder = await DB.db.orders.where('appointmentId').equals(id).first(); } catch (e) {}
    let fittingOrder = null;
    if (outcomeId === 'completed' && appt.customerId) {
      try {
        const openOrders = (await DB.db.orders.where('customerId').equals(appt.customerId).toArray())
          .filter(o => (o.balanceDue || 0) > 0)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        fittingOrder = openOrders[0] || null;
      } catch (e) {}
    }
    const depositPrefill = (saleOutcome && linkedOrder && !(linkedOrder.depositPaid > 0))
      ? (linkedOrder.depositRequired || 0)
      : '';
    const fittingBalance = (outcomeId === 'completed' && fittingOrder)
      ? (fittingOrder.balanceDue || 0)
      : null;
    // Stashed for updateOutcomeCommission's live preview - same data the old
    // standalone Discount Impact tool needed, now fetched once right where
    // it's actually relevant (recording a real sale) instead of a separate
    // disconnected calculator the advisor had to re-enter the same figures
    // into a second time.
    if (saleOutcome) {
      try {
        const weekSales = await TodayFeature.getWeekSales();
        this._outcomeDiscountContext = { weekSales, target: TaxCalculator.getRequiredWeeklySales(CONFIG.weeklyTarget) };
      } catch (e) {
        this._outcomeDiscountContext = null;
      }
    }

    // Show outcome detail modal
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>${outcomeConfig.name}</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        ${moneyOutcome ? `
          <div class="form-group">
            <label>${valueLabel}</label>
            <input type="number" class="input" inputmode="decimal" id="outcome-value" placeholder="0.00" step="0.01" min="0" autofocus data-action="AppointmentsFeature.updateOutcomeCommission">
          </div>
          ${saleOutcome ? `
            <div class="form-group">
              <label>Discount Offered (%) <span class="fw-400 text-tertiary" >- optional</span></label>
              <input type="number" class="input" inputmode="decimal" id="outcome-discount" placeholder="0" step="1" min="0" max="100" data-action="AppointmentsFeature.updateOutcomeCommission">
            </div>
            <div class="form-group">
              <label>Commission</label>
              <input type="text" class="input" id="outcome-commission" value="${Utils.formatCurrency(0)}" readonly aria-live="polite">
              <div class="hint">${Utils.escapeHtml(commissionHint)} Change this in Settings if your rate changes.</div>
            </div>
            <div id="outcome-discount-breakdown"></div>
            <div class="form-group">
              <label>Deposit taken today (&pound;) <span class="fw-400 text-tertiary" >- optional</span></label>
              <input type="number" class="input" inputmode="decimal" id="outcome-payment" data-deposit="1" value="${depositPrefill}" placeholder="0.00" step="0.01" min="0" data-action="AppointmentsFeature.updateOutcomeCommission">
              <div class="hint" id="outcome-payment-hint">${linkedOrder && (linkedOrder.depositPaid || 0) > 0 ? 'Deposit already recorded on this order.' : 'Leave empty to record the deposit later.'}</div>
            </div>
          ` : `
            <div class="hint mt-neg-8 mb-14" >Quote value is kept on the table, but no commission is counted until it becomes an order.</div>
          `}
        ` : ''}

        ${outcomeId === 'quoted' ? `
          <div class="form-group">
            <label>Why not ordered yet?</label>
            <select class="select" id="outcome-reason">
              <option value="">Not sure yet</option>
              <option value="thinking">Needs to think</option>
              <option value="partner">Wants to talk with partner</option>
              <option value="compare_quotes">Comparing quotes</option>
              <option value="expensive">Price concern</option>
              <option value="timing">Timing / payday</option>
              <option value="spec_mismatch">Specification needs clarifying</option>
              <option value="other">Other</option>
            </select>
          </div>
        ` : outcomeId === 'windows_too_high' ? `
          <div class="form-group">
            <label>What's the access/safety issue? <span class="text-danger" >*</span></label>
            <select class="select" id="outcome-reason" required>
              <option value="">Select issue...</option>
              <option value="too_high_unsafe">Too high to reach safely</option>
              <option value="no_access_equipment">No access equipment (ladder/tower)</option>
              <option value="structural_obstruction">Structural obstruction</option>
              <option value="other">Other</option>
            </select>
          </div>
        ` : ['other_no_sale', 'out_of_range', 'spec_mismatch', 'not_looking_for'].includes(outcomeId) ? `
          <div class="form-group">
            <label>Reason${outcomeId === 'other_no_sale' ? ' <span class="text-danger" >*</span>' : ''}</label>
            <select class="select" id="outcome-reason" ${outcomeId === 'other_no_sale' ? 'required' : ''}>
              <option value="">Select reason...</option>
              <option value="price">Price too high</option>
              <option value="timing">Bad timing</option>
              <option value="product">Product not suitable</option>
              <option value="competitor">Went to competitor</option>
              <option value="other">Other</option>
            </select>
          </div>
        ` : ''}

        <div class="form-group">
          <label>Notes</label>
          <textarea class="textarea" id="outcome-notes" placeholder="Any additional notes..."></textarea>
        </div>

        ${fittingBalance !== null ? `
          <div class="form-group">
            <label>Payment received today (&pound;)</label>
            <input type="number" class="input" inputmode="decimal" id="outcome-payment" value="${fittingBalance}" step="0.01" min="0">
            <div class="hint">${Utils.formatCurrency(fittingBalance)} balance on ${Utils.escapeHtml(fittingOrder.orderNumber || 'the open order')} — recorded against it right here.</div>
          </div>
        ` : ''}

        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.saveOutcome" data-args='${JSON.stringify([(id), outcomeId])}'>
          Save Outcome
        </button>
      </div>
    `;

    App.openModal(content);
  },

  updateOutcomeCommission() {
    const valueEl = document.getElementById('outcome-value');
    const discountEl = document.getElementById('outcome-discount');
    const commissionEl = document.getElementById('outcome-commission');
    const breakdownEl = document.getElementById('outcome-discount-breakdown');
    if (!valueEl || !commissionEl) return;

    const grossValue = parseFloat(valueEl.value) || 0;
    const discountPct = discountEl ? Math.min(100, Math.max(0, parseFloat(discountEl.value) || 0)) : 0;
    const netValue = grossValue * (1 - discountPct / 100);
    const commission = netValue > 0 ? TaxCalculator.estimateCommission(netValue) : 0;
    commissionEl.value = Utils.formatCurrency(commission);

    // Live deposit suggestion: the deposit input prefills itself with the
    // rule-based deposit for the current (discounted) sale value, so the
    // advisor sees "what should I take today?" without any extra calculator.
    // Runs before the discount-breakdown early return - it must also work
    // when no discount has been typed yet (the common fresh-sale case).
    const paymentEl = document.getElementById('outcome-payment');
    const paymentHint = document.getElementById('outcome-payment-hint');
    if (paymentEl && paymentEl.dataset.deposit === '1') {
      const prefillLocked = parseFloat(paymentEl.value) > 0;
      if (!prefillLocked) {
        const deposit = netValue > 0 ? App.calculateDeposit(netValue).amount : 0;
        paymentEl.placeholder = deposit > 0 ? Utils.formatCurrency(deposit) : '0.00';
        if (paymentHint) {
          paymentHint.textContent = deposit > 0
            ? `Suggested: ${Utils.formatCurrency(deposit)} · balance after: ${Utils.formatCurrency(Math.max(0, netValue - deposit))}`
            : 'Leave empty to record the deposit later.';
        }
      }
    }

    if (!breakdownEl) return;
    if (discountPct <= 0 || grossValue <= 0) { breakdownEl.innerHTML = ''; return; }

    const discountAmount = grossValue - netValue;
    const ctx = this._outcomeDiscountContext;
    const targetHtml = ctx ? (() => {
      const projectedTotal = ctx.weekSales + netValue;
      const stillHitsTarget = projectedTotal >= ctx.target;
      return `<div class="flex items-center gap-sm mt-sm" >
        <span class="material-symbols-rounded" style="font-size:18px;color:${stillHitsTarget ? 'var(--secondary)' : 'var(--danger)'};">${stillHitsTarget ? 'check_circle' : 'warning'}</span>
        <span style="font-size:12px;font-weight:600;color:${stillHitsTarget ? 'var(--secondary)' : 'var(--danger)'};">${stillHitsTarget ? 'Still on target' : 'Target may be at risk'} - ${Utils.formatCurrency(projectedTotal)} of ${Utils.formatCurrency(ctx.target)} this week</span>
      </div>`;
    })() : '';

    breakdownEl.innerHTML = `
      <div class="dark-note-12 mt-neg-8 mb-14 fs-13 text-secondary lh-160" >
        Discount: <strong>${Utils.formatCurrency(discountAmount)}</strong> · Sale after discount: <strong>${Utils.formatCurrency(netValue)}</strong>
        ${targetHtml}
      </div>
    `;
  },

  getCommissionHint() {
    const commission = CONFIG.commission || {};
    if (commission.mode === 'two_stage') {
      const reduction = commission.saleReductionRate ?? 20;
      const rate = commission.netCommissionRate ?? 15.25;
      return `Auto: sale less ${reduction}% VAT/adjustment, then ${rate}% commission on net.`;
    }
    if (commission.mode === 'simple') {
      return `Auto: ${commission.simpleRate ?? 10}% of the sale amount.`;
    }
    return 'Auto-calculated from your commission settings.';
  },

  async saveOutcome(id, outcomeId) {
    const grossValue = parseFloat(document.getElementById('outcome-value')?.value || 0);
    const discountPct = outcomeId === 'ordered'
      ? Math.min(100, Math.max(0, parseFloat(document.getElementById('outcome-discount')?.value || 0)))
      : 0;
    // The discount is applied here, at the one place a real sale value gets
    // entered, rather than in a separate calculator the advisor had to
    // duplicate the same figures into. `value` (what feeds weekly-target,
    // tax, and order totals everywhere downstream) is always the actual
    // discounted figure - grossValue/discountPercent are kept alongside it
    // purely as a record of what was offered, not used in any calculation.
    const value = discountPct > 0 ? grossValue * (1 - discountPct / 100) : grossValue;
    const commission = value > 0 && outcomeId === 'ordered'
      ? TaxCalculator.estimateCommission(value)
      : 0;
    const notes = document.getElementById('outcome-notes')?.value || '';
    const reason = document.getElementById('outcome-reason')?.value || '';

    if (['other_no_sale', 'windows_too_high'].includes(outcomeId) && !reason) {
      Toast.show('Please select a reason before saving', 'error');
      return;
    }

    try {
      let appt = await DB.getAppointment(id);
      const existingNotes = appt.notes || '';
      const reasonText = reason ? `Reason: ${reason.replace(/_/g, ' ')}` : '';
      const discountText = discountPct > 0 ? `Discount: ${discountPct}% off ${Utils.formatCurrency(grossValue)}` : '';
      const outcomeNote = [reasonText, discountText, notes ? `Outcome: ${notes}` : ''].filter(Boolean).join('\n');

      const result = await DB.completeVisitOutcome({
        appointmentId: id,
        paymentAmount: parseFloat(document.getElementById('outcome-payment')?.value || 0),
        paymentOperationId: Utils.generateId('payment'),
        appointmentFields: {
        status: 'completed',
        outcome: outcomeId,
        // Fields that are being "cleared" use `null`, NOT `undefined` - the
        // mini-Dexie shim skips undefined values silently while real Dexie
        // deletes them, and `null` behaves identically in both.
        quoteReason: outcomeId === 'quoted' ? reason || null : appt.quoteReason || null,
        value: value > 0 ? value : null,
        commission: commission > 0 ? commission : null,
        grossValue: discountPct > 0 ? grossValue : null,
        discountPercent: discountPct > 0 ? discountPct : null,
        notes: outcomeNote ? [existingNotes, outcomeNote].filter(Boolean).join('\n\n') : existingNotes,
        // Additive fields (see js/core/geo.js travelStatus comment) — a real
        // completion timestamp instead of inferring "now" from elsewhere,
        // and travelStatus cleared since the visit is finished, not on-site.
        // completedAt is only stamped if absent: re-saving an outcome (e.g.
        // editing a morning sale at 17:00) must not move "when the day was
        // completed" - the home screen's closeout window reads this.
        completedAt: appt.completedAt || Date.now(),
        travelStatus: null
        }
      });
      const paymentNote = result.payment?.applied > 0
        ? ` · ${Utils.formatCurrency(result.payment.applied)} payment recorded`
        : '';

      App.closeModal();
      Toast.show('Outcome saved' + paymentNote, 'success');

      if (outcomeId === 'needs_service_call') {
        this.offerServiceCallBooking(appt);
        return;
      }

      App.navigate('appointments', {id});
    } catch (e) {
      console.error('Save outcome error:', e);
      Toast.show('Failed to save outcome', 'error');
    }
  },

  offerServiceCallBooking(appt) {
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Book the Service Call?</h3><button class="btn btn-ghost btn-sm" data-action="AppointmentsFeature.skipServiceCallBooking" data-args='${JSON.stringify([(appt.id)])}'><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div class="fs-13 text-secondary mb-md" >Take you straight to a new visit for ${Utils.escapeHtml(appt.clientName || 'this customer')}, pre-filled with their details and set to Service Call. Pick the date and time on the next screen.</div>
        <button class="btn btn-primary btn-block" data-action="AppointmentsFeature.bookServiceCallNow" data-args='${JSON.stringify([(appt.id)])}'>
          <span class="material-symbols-rounded">build</span>Book Service Call
        </button>
        <button class="btn btn-outline btn-block mt-sm"  data-action="AppointmentsFeature.skipServiceCallBooking" data-args='${JSON.stringify([(appt.id)])}'>
          Not Now
        </button>
      </div>`;
    App.openModal(content);
  },

  bookServiceCallNow(appointmentId) {
    App.closeModal();
    DB.getAppointment(appointmentId).then(appt => {
      App.navigate('appointments', {
        action: 'add',
        type: 'service_call',
        name: appt?.clientName || '',
        phone: appt?.phone || '',
        address: appt?.address || ''
      });
    });
  },

  skipServiceCallBooking(appointmentId) {
    App.closeModal();
    App.navigate('appointments', {id: appointmentId});
  },

  getOutcomeName(outcomeId, type) {
    const outcomes = CONFIG.outcomes[type] || [];
    const found = outcomes.find(o => o.id === outcomeId);
    return found ? found.name : outcomeId;
  },

  // Walk-away floor price after a logged price objection. Only reachable via
  // the "Check my floor" button, which only appears once quoteReason ===
  // 'expensive' — deliberately not automatic, so it stays a last-resort check
  // rather than a number that quietly becomes the default target.
  async openFloorCheckModal(id) {
    let appt;
    try {
      appt = await DB.getAppointment(id);
    } catch (e) {
      Toast.show('Visit not found', 'error');
      return;
    }

    App.openModal(`
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Check my floor</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body" id="floor-check-body">
        <div class="center-box-tertiary" >Working it out...</div>
      </div>
    `);

    const bodyEl = () => document.getElementById('floor-check-body');

    const base = await RouteFeature.getBasePoint();
    if (!base || !Array.isArray(base.latLng) || !Array.isArray(appt.latLng)) {
      if (bodyEl()) {
        bodyEl().innerHTML = `
          <div class="hint">I need both your business address (Settings → Business Base) and a geocoded address on this visit to work out travel cost. Add whichever's missing and try again.</div>
        `;
      }
      return;
    }

    let distanceKm, driveMinutesOneWay;
    try {
      const summary = await Geo.getDrivingRouteSummary(base.latLng[0], base.latLng[1], appt.latLng[0], appt.latLng[1]);
      distanceKm = summary.distanceKm;
      driveMinutesOneWay = summary.durationMin || Math.round((distanceKm / 35) * 60);
    } catch (e) {
      distanceKm = Geo.calculateDistance(base.latLng[0], base.latLng[1], appt.latLng[0], appt.latLng[1]) * 1.3;
      driveMinutesOneWay = Math.round((distanceKm / 35) * 60);
    }

    const visitMinutes = (appt.durationSlots || 1) * (CONFIG.workingWeek?.slotMinutes || 15);
    const floor = TaxCalculator.calculateVisitFloor({ distanceKm, visitMinutes, driveMinutesOneWay });

    const quoted = appt.value || 0;
    const quotedCommission = quoted > 0 ? TaxCalculator.estimateCommission(quoted) : 0;

    if (!bodyEl()) return; // modal was closed while we were working this out

    bodyEl().innerHTML = `
      <div class="hint mt-neg-4 mb-14" >
        This is a walk-away line, not something to offer. Hold rack rate first — this is only for when the deal is genuinely about to be lost.
      </div>
      <div class="card inset-dark bg-bg mb-12" >
        <div class="flex justify-between fs-13 mb-6" >
          <span class="text-secondary" >Round trip</span>
          <span>${floor.roundTripKm.toFixed(1)} km &middot; ${Utils.formatCurrency(floor.tripCost)}</span>
        </div>
        <div class="flex justify-between fs-13 mb-6" >
          <span class="text-secondary" >Time (drive + visit)</span>
          <span>${Math.round(floor.totalMinutes)} min &middot; ${Utils.formatCurrency(floor.timeCost)}</span>
        </div>
        <div class="flex justify-between fs-13 fw-700 top-divider-8 mt-2" >
          <span>Minimum commission worth taking</span>
          <span>${Utils.formatCurrency(floor.minCommission)}</span>
        </div>
      </div>
      ${floor.minSaleValue !== null ? `
        <div class="card mb-12" >
          <div class="fs-13 text-secondary" >Floor sale price</div>
          <div class="fs-22 fw-800" >${Utils.formatCurrency(floor.minSaleValue)}</div>
          ${quoted > 0 ? `<div class="fs-12 text-secondary mt-xs" >Your quote of ${Utils.formatCurrency(quoted)} would pay ${Utils.formatCurrency(quotedCommission)} commission.</div>` : ''}
        </div>
      ` : `
        <div class="hint">Can't work out a floor price — your commission rate is set to 0% in Settings.</div>
      `}
      ${floor.hourlyRateIsEstimate ? `<div class="hint">Using an estimated hourly value from your weekly target (&pound;${floor.hourlyRate.toFixed(0)}/hr). Set your own in Settings &rarr; Minimum Hourly Value for a number you actually trust.</div>` : ''}
    `;
  },

  switchTab(tab) {
    const tabs = document.querySelectorAll('#appt-tabs .tab');
    tabs.forEach(t => {
      const active = t.dataset.tab === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const diaryEl = document.getElementById('appt-diary');
    const upcomingEl = document.getElementById('appt-upcoming');
    const pipelineEl = document.getElementById('appt-pipeline');
    const areaEl = document.getElementById('appt-area');
    const pastEl = document.getElementById('appt-past');

    if (diaryEl) diaryEl.style.display = tab === 'diary' ? 'block' : 'none';
    if (upcomingEl) upcomingEl.style.display = tab === 'upcoming' ? 'block' : 'none';
    if (pipelineEl) pipelineEl.style.display = tab === 'pipeline' ? 'block' : 'none';
    if (areaEl) areaEl.style.display = tab === 'area' ? 'block' : 'none';
    if (pastEl) pastEl.style.display = tab === 'past' ? 'block' : 'none';

    // Move keyboard focus to the selected panel so screen-reader users land
    // on the content they just asked for (WCAG 2.4.3 focus order).
    const panel = document.getElementById('appt-' + tab);
    if (panel && !panel.hasAttribute('tabindex')) {
      panel.setAttribute('tabindex', '-1');
    }
    if (panel && document.activeElement && document.activeElement.classList.contains('tab')) {
      try { panel.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
  },

  // WAI-ARIA tabs pattern: Left/Right move focus between tabs (Home/End jump
  // to first/last). Registered once per render; the tablist is static for
  // the Visits screen lifetime.
  setupTabKeyboard() {
    const tablist = document.getElementById('appt-tabs');
    if (!tablist || tablist.dataset.keyboardBound) return;
    tablist.dataset.keyboardBound = '1';
    tablist.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const tabs = Array.from(tablist.querySelectorAll('.tab'));
      if (!tabs.length) return;
      const idx = tabs.indexOf(document.activeElement);
      let next = idx;
      if (e.key === 'ArrowLeft') next = idx <= 0 ? tabs.length - 1 : idx - 1;
      else if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      e.preventDefault();
      tabs[next].focus();
    });
  },

  showAddModal() {
    App.navigate('appointments', {action: 'add'});
  },

  activate(params = {}) {
    // Auto-refresh when activated
    this.setupTabKeyboard();
    if (params.tab) {
      this.switchTab(params.tab);
    }
    if (params.leadId) this.hydrateLeadBooking(parseInt(params.leadId, 10));
    if (params.jobId) this.hydrateJobBooking(parseInt(params.jobId, 10));
  }
};

App.registerFeature(AppointmentsFeature);
