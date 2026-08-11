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
        <!-- Header -->
        <div class="top-header">
          <h1>Visits</h1>
          <div class="header-actions">
            <button class="btn btn-sm btn-outline" aria-label="Search" onclick="AppointmentsFeature.openCustomerSearch()">
              <span class="material-symbols-rounded">search</span>
            </button>
            <button class="btn btn-sm btn-primary" aria-label="Add visit" onclick="AppointmentsFeature.showAddModal()">
              <span class="material-symbols-rounded">add</span>
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div style="padding: 0 16px;">
          <div class="tabs" id="appt-tabs">
            <button class="tab active" data-tab="diary" onclick="AppointmentsFeature.switchTab('diary')">Diary</button>
            <button class="tab" data-tab="upcoming" onclick="AppointmentsFeature.switchTab('upcoming')">Upcoming</button>
            <button class="tab" data-tab="pipeline" onclick="AppointmentsFeature.switchTab('pipeline')">Follow-ups (${pipeline.length})</button>
            <button class="tab" data-tab="area" onclick="AppointmentsFeature.switchTab('area')">Area</button>
            <button class="tab" data-tab="past" onclick="AppointmentsFeature.switchTab('past')">Past</button>
          </div>
        </div>

        <!-- Diary View -->
        <div id="appt-diary" style="padding: 0 16px;">
          ${diaryHtml}
        </div>

        <!-- Upcoming View -->
        <div id="appt-upcoming" style="display: none;">
          ${sortedDates.length === 0 ? `
            <div class="empty-state">
              <span class="material-symbols-rounded">event</span>
              <div style="font-weight: 600; margin-bottom: 4px;">No upcoming visits</div>
              <div style="font-size: 13px;">Add your first visit to get started</div>
              <button class="btn btn-primary btn-sm" style="margin-top: 16px;" onclick="AppointmentsFeature.showAddModal()">
                <span class="material-symbols-rounded">add</span>
                Add Visit
              </button>
            </div>
          ` : sortedDates.map(dateKey => {
            const date = new Date(dateKey + 'T00:00:00');
            const isToday = Utils.isSameDay(date, today);
            const isTomorrow = Utils.isSameDay(date, Utils.getTomorrow());
            const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

            return `
              <div style="padding: 0 16px; margin-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; margin-top: 8px;">${label}</div>
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
          <div class="empty-state">
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
      const weekday = cursor.toLocaleDateString('en-GB', { weekday: 'short' });
      cells += `
        <button class="${classes.join(' ')}" style="aspect-ratio:auto;min-height:56px;flex-direction:column;gap:2px;padding:6px 2px;" onclick="AppointmentsFeature.selectCalendarDate('${key}')">
          <span style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;">${weekday}</span>
          <span class="calendar-cell-num">${dayNum}</span>
          ${count > 0 ? `<span class="calendar-cell-dot">${count > 3 ? '3+' : count}</span>` : ''}
        </button>
      `;
      cursor.setDate(cursor.getDate() + 1);
    }

    return `
      <div class="card calendar-card" style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;">Next 7 days</div>
          <button class="btn btn-ghost btn-sm" style="min-height:32px;padding:0 8px;" onclick="App.navigate('appointments')">Full diary <span class="material-symbols-rounded" style="font-size:16px;">chevron_right</span></button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;">
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
    const monthLabel = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
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
        <button class="${classes.join(' ')}" onclick="AppointmentsFeature.selectCalendarDate('${key}')">
          <span class="calendar-cell-num">${cursor.getDate()}</span>
          ${count > 0 ? `<span class="calendar-cell-dot" aria-label="${count} visits"></span>` : ''}
        </button>
      `;
      cursor.setDate(cursor.getDate() + 1);
    }

    return `
      <div class="card calendar-card" style="margin-bottom:12px;">
        <div class="calendar-header">
          <button class="btn btn-ghost btn-sm" aria-label="Previous month" onclick="AppointmentsFeature.shiftCalendarMonth(-1)">
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <div class="calendar-month-label">${Utils.escapeHtml(monthLabel)}</div>
          <button class="btn btn-ghost btn-sm" aria-label="Next month" onclick="AppointmentsFeature.shiftCalendarMonth(1)">
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
    const label = isToday ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    const mode = this.getDayMode(selectedKey + 'T00:00:00');
    const salesValue = dayAppointments.reduce((sum, a) => sum + (a.value || 0), 0);

    const summaryCard = `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-weight:700;">${Utils.escapeHtml(label)}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${Utils.escapeHtml(mode.friendLine)}</div>
          </div>
          <span class="badge ${mode.kind === 'fitting' ? 'badge-success' : mode.kind === 'sales' ? 'badge-primary' : 'badge-warning'}">${Utils.escapeHtml(mode.label)}</span>
        </div>
        <div class="stats-grid" style="margin-top:12px;gap:8px;">
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="Jump to today's visit list" onclick="AppointmentsFeature.scrollToVisitsList()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AppointmentsFeature.scrollToVisitsList();}">
            <div class="value">${dayAppointments.length || '—'}</div><div class="label">Booked</div>
          </div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View money and sales" onclick="App.navigate('money')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('money');}">
            <div class="value">${Utils.formatCurrency(salesValue).replace('.00', '')}</div><div class="label">Booked Value</div>
          </div>
        </div>
      </div>
    `;

    if (compact) {
      // Today's embedded calendar: just the summary + a clear Add Visit action,
      // no full visit list (keeps the dashboard from getting too long).
      return summaryCard + `
        <button class="btn btn-outline btn-block" onclick="AppointmentsFeature.addAt('${selectedKey}', '')">
          <span class="material-symbols-rounded">add</span> Add Visit
        </button>
      `;
    }

    return summaryCard + `
      <div id="appt-visits-list-anchor" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Visits</div>
        <button class="btn btn-sm btn-outline" onclick="AppointmentsFeature.addAt('${selectedKey}', '')">
          <span class="material-symbols-rounded">add</span> Add
        </button>
      </div>

      ${dayAppointments.length === 0 ? `
        <div class="empty-state">
          <span class="material-symbols-rounded">event_available</span>
          <div style="font-weight:600;margin-bottom:4px;">Nothing booked</div>
          <div style="font-size:13px;">Tap Add to book a visit on this day</div>
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
      <div class="card" style="margin-bottom:12px;">
        <div style="font-weight:700;margin-bottom:6px;">Area intelligence</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.45;margin-bottom:14px;">
          Search a postcode area before booking. I will show previous customers, outcomes, buying signals and conversion patterns.
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label>Postcode or area</label>
          <input class="input" id="area-query" placeholder="e.g. M14 or M14 7FZ" onkeydown="if(event.key==='Enter')AppointmentsFeature.runAreaSearch()">
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.runAreaSearch()">
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
    const customers = await DB.db.customers.toArray();
    const appointments = await DB.db.appointments.toArray();
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
        <div class="empty-state">
          <span class="material-symbols-rounded">travel_explore</span>
          <div>No local history yet</div>
          <div style="font-size:13px;">First visit in ${Utils.escapeHtml(report.area)} will start building the picture.</div>
        </div>
      `;
    }

    return `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-weight:700;">${Utils.escapeHtml(report.area)}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${report.customers.length} customer${report.customers.length === 1 ? '' : 's'} · ${report.visits} visit${report.visits === 1 ? '' : 's'}</div>
          </div>
          <span class="badge ${report.conversion >= 0.5 ? 'badge-success' : report.conversion >= 0.25 ? 'badge-warning' : 'badge-primary'}">${Math.round(report.conversion * 100)}% conversion</span>
        </div>
        <div class="stats-grid" style="margin-top:12px;gap:8px;">
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View customer records" onclick="AppointmentsFeature.scrollToAreaCustomers()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AppointmentsFeature.scrollToAreaCustomers();}"><div class="value">${report.sold || '—'}</div><div class="label">Sold</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View customer records" onclick="AppointmentsFeature.scrollToAreaCustomers()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AppointmentsFeature.scrollToAreaCustomers();}"><div class="value">${report.quotes || '—'}</div><div class="label">Quotes</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View money and sales" onclick="App.navigate('money')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('money');}"><div class="value">${report.avgSale ? Utils.formatCurrency(report.avgSale).replace('.00', '') : '—'}</div><div class="label">Avg Sale</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View customer records" onclick="AppointmentsFeature.scrollToAreaCustomers()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AppointmentsFeature.scrollToAreaCustomers();}"><div class="value">${report.orders.length || '—'}</div><div class="label">Orders</div></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div style="font-weight:700;margin-bottom:10px;">What this area tends to do</div>
        ${report.behaviours.length ? report.behaviours.map(text => `
          <div class="area-insight-row">
            <span class="material-symbols-rounded">insights</span>
            <span>${Utils.escapeHtml(text)}</span>
          </div>
        `).join('') : `<div style="font-size:13px;color:var(--text-secondary);">Not enough history yet for behaviour patterns.</div>`}
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div style="font-weight:700;margin-bottom:10px;">Signals</div>
        <div class="area-chip-row">
          ${topInterests.length ? topInterests.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(label)} · ${count}</span>`).join('') : '<span class="chip">No buying-interest notes yet</span>'}
        </div>
        <div class="area-chip-row" style="margin-top:8px;">
          ${topOutcomes.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(this.getOutcomeName(label, 'consultation'))} · ${count}</span>`).join('')}
          ${topSources.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(label.replace(/_/g, ' '))} · ${count}</span>`).join('')}
        </div>
      </div>

      <div class="card" id="area-customers-anchor">
        <div style="font-weight:700;margin-bottom:10px;">Customer records</div>
        ${report.customers.length ? report.customers.map(customer => `
          <button class="area-customer-row" onclick="AppointmentsFeature.openCustomerRecord(${customer.id})">
            <span class="material-symbols-rounded">person</span>
            <span>
              <strong>${Utils.escapeHtml(customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer')}</strong>
              <small>${Utils.escapeHtml(customer.phone || this.customerAddressText(customer) || 'No contact detail')}</small>
            </span>
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        `).join('') : `<div style="font-size:13px;color:var(--text-secondary);">No customer records match this area yet.</div>`}
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
    // Was a smaller modal with its own duplicate implementation - now just
    // opens the full customer profile screen instead of maintaining two
    // different "view customer" experiences with different feature sets.
    App.navigate('appointments', { customerId });
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
    const customer = await DB.db.customers.get(customerId);
    if (!customer) {
      Toast.show('Customer not found', 'error');
      return;
    }
    const name = customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Edit Customer</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label>Name *</label>
          <input type="text" class="input" id="edit-cust-name" autocomplete="name" value="${Utils.escapeAttr(name)}">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" class="input" id="edit-cust-phone" inputmode="tel" autocomplete="tel" value="${Utils.escapeAttr(customer.phone || '')}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" class="input" id="edit-cust-email" autocomplete="email" value="${Utils.escapeAttr(customer.email || '')}">
        </div>
        <div class="form-group">
          <label>Address *</label>
          <input type="text" class="input" id="edit-cust-address" autocomplete="street-address" value="${Utils.escapeAttr(customer.address?.line1 || '')}">
          <div class="hint">Include the postcode here, e.g. "12 Elm Street, Manchester, M14 5AB"</div>
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.saveEditCustomer(${customerId})">
          Save Changes
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveEditCustomer(customerId) {
    const customer = await DB.db.customers.get(customerId);
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

      await DB.db.customers.update(customerId, {
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
      const appts = await DB.db.appointments.where('customerId').equals(customerId).toArray();
      for (const appt of appts) {
        await DB.db.appointments.update(appt.id, { clientName: name, phone, address });
      }

      App.closeModal();
      Toast.show('Customer updated', 'success');
      App.navigate('appointments', { customerId });
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
      statusBadge = `<span class="badge badge-success" style="font-size: 10px;">${this.getOutcomeName(appt.outcome, appt.type)}</span>`;
    } else if (appt.status === 'cancelled') {
      statusBadge = `<span class="badge badge-danger" style="font-size: 10px;">Cancelled</span>`;
    } else if (appt.status === 'completed') {
      statusBadge = `<span class="badge badge-success" style="font-size: 10px;">Done</span>`;
    } else if (appt.status === 'confirmed') {
      statusBadge = `<span class="badge badge-primary" style="font-size: 10px;">Confirmed</span>`;
    } else {
      statusBadge = `<span class="badge badge-warning" style="font-size: 10px;">Pending</span>`;
    }

    return `
      <div class="card card-interactive visit-card" onclick="App.navigate('appointments', {id: '${appt.id}'})">
        <div class="visit-card-row">
          <div class="visit-icon">
            <span class="material-symbols-rounded">${typeConfig.icon}</span>
          </div>
          <div class="visit-main">
            <div class="visit-title-row">
              <span class="visit-title">${Utils.escapeHtml(appt.clientName || 'Unknown')}</span>
              <span class="badge ${typeConfig.badgeClass || 'badge-primary'}" style="font-size: 10px; padding: 2px 8px; flex-shrink: 0;">${Utils.escapeHtml(typeConfig.name)}</span>
            </div>
            <div class="visit-meta">
              ${Utils.formatTime(appt.date)} · ${appt.address ? Utils.escapeHtml(Utils.truncate(appt.address, 30)) : 'No address'}
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
        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--danger); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Hot — Close This Week</div>
          ${hot.map(a => this.renderPipelineCard(a)).join('')}
        </div>
      ` : ''}

      ${warm.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--warning); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Warm — Follow Up</div>
          ${warm.map(a => this.renderPipelineCard(a)).join('')}
        </div>
      ` : ''}

      ${cool.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Cool — At Risk</div>
          ${cool.map(a => this.renderPipelineCard(a)).join('')}
        </div>
      ` : ''}

      ${pipeline.length === 0 ? `
        <div class="empty-state">
          <span class="material-symbols-rounded">trending_up</span>
          <div>No follow-ups waiting</div>
          <div style="font-size: 13px;">Complete visits to build your follow-up list</div>
        </div>
      ` : ''}
    `;
  },

  async openFollowUpDetail(id) {
    let appt = null;
    let customer = null;
    try {
      appt = await DB.db.appointments.get(id);
      customer = appt?.customerId ? await DB.db.customers.get(appt.customerId) : null;
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
          <div style="font-size: 13px; color: var(--text-tertiary);">${Utils.escapeHtml(appt.address || 'No address set')}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="card" style="margin-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="badge ${meta.badgeClass}">${Utils.escapeHtml(meta.label)}</span>
            <span style="font-size: 13px; color: var(--text-tertiary);">${daysSince} day${daysSince === 1 ? '' : 's'} ago</span>
          </div>
          ${match && match.learned ? `
            <div style="font-size: 11px; color: var(--secondary); margin-top: 6px;">
              <span class="material-symbols-rounded" style="font-size: 12px; vertical-align: text-bottom;">insights</span>
              Learned from ${match.sampleSize} past deals - typically closed in ${match.medianDaysToConversion}d
            </div>
          ` : ''}
          ${appt.value > 0 ? `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between;">
              <span style="color: var(--text-secondary);">Quote total</span>
              <strong>${Utils.formatCurrency(appt.value)}</strong>
            </div>
          ` : ''}
          ${appt.notes ? `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light); font-size: 13px; color: var(--text-secondary);">
              ${Utils.escapeHtml(appt.notes)}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">
          ${match ? `
            <button class="btn btn-primary btn-block" onclick="App.closeModal(); TalkFeature.sendMessage(${appt.id}, '${match.template}')">
              <span class="material-symbols-rounded">send</span>
              Send Reminder
            </button>
          ` : ''}
          ${phone ? `
            <a class="btn btn-outline btn-block" href="tel:${Utils.escapeAttr(Utils.toE164Phone(phone) || phone)}">
              <span class="material-symbols-rounded">call</span>
              Call Customer
            </a>
          ` : `
            <div style="font-size: 12px; color: var(--text-tertiary); text-align: center;">No phone number on file</div>
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
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <input type="search" class="input" id="customer-search-input" placeholder="Name, postcode, phone, or product..."
               oninput="AppointmentsFeature.debouncedCustomerSearch(this.value)" autocomplete="off">
        <div id="customer-search-results" style="margin-top:12px;">
          <div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:24px 0;">
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
      resultsEl.innerHTML = `<div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:24px 0;">Keep typing (2+ characters)...</div>`;
      return;
    }

    let results = [];
    try {
      results = await Search.search(query);
    } catch (e) {
      console.error('Search failed:', e);
      resultsEl.innerHTML = `<div style="font-size:13px;color:var(--danger);text-align:center;padding:24px 0;">Search failed - try again</div>`;
      return;
    }

    if (results.length === 0) {
      resultsEl.innerHTML = `<div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:24px 0;">No matches for "${Utils.escapeHtml(query)}"</div>`;
      return;
    }

    resultsEl.innerHTML = results.map(r => `
      <button class="area-customer-row" style="width:100%;text-align:left;" onclick="AppointmentsFeature.openSearchResult('${r.type}', ${r.id})">
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
      App.navigate('appointments', { customerId: id });
      return;
    }

    if (type === 'order') {
      try {
        const order = await DB.db.orders.get(id);
        if (order?.appointmentId) { App.navigate('appointments', { id: order.appointmentId }); return; }
      } catch (e) {}
      Toast.show('No linked visit found for this order', 'warning');
    }
  },

  renderPipelineCard(appt) {
    const daysSince = Utils.daysBetween(new Date(), new Date(appt.date));

    return `
      <div class="card card-interactive visit-card" onclick="AppointmentsFeature.openFollowUpDetail(${appt.id})">
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
          <span class="material-symbols-rounded" style="color: var(--text-tertiary); flex-shrink: 0;">chevron_right</span>
        </div>
      </div>
    `;
  },

  getProbability(outcome, daysSince) {
    const baseProb = CONFIG.probabilityDecay[0] || 0.8;

    if (daysSince <= 0) return baseProb;
    if (daysSince <= 3) return 0.6;
    if (daysSince <= 7) return 0.4;
    if (daysSince <= 14) return 0.2;
    return 0.05;
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
              onclick="AppointmentsFeature.captureOutcome(${appt.id}, '${o.id}')">
        <span class="material-symbols-rounded" style="font-size: 18px;">${o.icon}</span>
        ${o.name}
      </button>
    `;

    return `
      ${hero ? renderButton(hero, true) : ''}
      ${rest.length > 0 ? `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
          ${rest.map(o => renderButton(o, false)).join('')}
        </div>
      ` : ''}
      ${noVisitOutcomes.length > 0 ? `
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
          <div style="font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">Visit didn't happen</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            ${noVisitOutcomes.map(o => renderButton(o, false)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  },

  async renderCustomerProfile(customerId) {
    let customer = null;
    try {
      customer = await DB.db.customers.get(customerId);
    } catch (e) {
      console.error('Failed to load customer:', e);
    }

    if (!customer) {
      return `<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Customer not found</div></div>`;
    }

    let appts = [];
    let orders = [];
    let comms = [];
    let photos = [];
    try { appts = await DB.db.appointments.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { orders = await DB.db.orders.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { comms = await DB.db.communications.where('customerId').equals(customerId).toArray(); } catch (e) {}
    try { photos = await DB.getPhotosForCustomer(customerId); } catch (e) {}

    appts.sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstVisit = appts[0];
    const lastVisit = appts[appts.length - 1];
    const totalValue = appts.reduce((sum, a) => sum + (a.outcome === 'ordered' ? (a.value || 0) : 0), 0);
    const interests = Object.entries(this.extractBuyingInterests(appts)).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // One merged, chronological "everything that's happened with this
    // person" timeline - visits, orders, and follow-up messages together,
    // not three separate lists you have to mentally interleave yourself.
    const timeline = [
      ...appts.map(a => ({
        date: a.date,
        icon: CONFIG.appointmentTypes.find(t => t.id === a.type)?.icon || 'event',
        title: CONFIG.appointmentTypes.find(t => t.id === a.type)?.name || a.type || 'Visit',
        subtitle: a.outcome ? `Outcome: ${Utils.escapeHtml(a.outcome.replace(/_/g, ' '))}${a.value > 0 ? ` · ${Utils.formatCurrency(a.value)}` : ''}` : 'No outcome logged',
        onclick: `App.navigate('appointments', {id: ${a.id}})`
      })),
      ...orders.map(o => ({
        date: o.createdAt || o.date,
        icon: 'receipt',
        title: `Order ${Utils.escapeHtml(o.orderNumber || '')}`,
        subtitle: `${Utils.escapeHtml(o.status || '')} · ${Utils.formatCurrency(o.total || 0)}`,
        onclick: ''
      })),
      ...comms.map(c => ({
        date: c.sentAt,
        icon: 'chat',
        title: 'Follow-up sent',
        subtitle: Utils.escapeHtml((c.template || c.type || '').replace(/_/g, ' ')),
        onclick: ''
      }))
    ].filter(item => item.date).sort((a, b) => new Date(b.date) - new Date(a.date));

    const phone = customer.phone || '';
    const address = customer.address?.line1 || '';
    const name = customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer';

    return `
      <div class="fade-in">
        <div class="top-header">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('appointments')">
            <span class="material-symbols-rounded">arrow_back</span>
          </button>
          <h1 style="flex: 1; text-align: center; font-size: 18px;">Customer</h1>
          <div style="width: 40px;"></div>
        </div>

        <div class="card" style="margin: 16px; margin-top: 8px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600;">
              ${name.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
              <div style="font-size: 20px; font-weight: 600;">${Utils.escapeHtml(name)}</div>
              <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${Utils.escapeHtml(customer.customerNumber || '')}</div>
            </div>
            <button class="btn btn-ghost btn-sm" aria-label="Edit customer details" onclick="AppointmentsFeature.openEditCustomerModal(${customer.id})">
              <span class="material-symbols-rounded">edit</span>
            </button>
          </div>

          ${address ? `<div style="margin-top:12px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;"><span class="material-symbols-rounded" style="font-size:16px;">location_on</span>${Utils.escapeHtml(address)}</div>` : ''}
          ${customer.email ? `<div style="margin-top:6px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;"><span class="material-symbols-rounded" style="font-size:16px;">mail</span>${Utils.escapeHtml(customer.email)}</div>` : ''}

          <div style="display: flex; gap: 8px; margin-top: 16px;">
            ${phone ? `
              <a class="btn btn-outline btn-sm" style="flex: 1; gap: 6px;" href="tel:${Utils.escapeAttr(Utils.toE164Phone(phone) || phone)}">
                <span class="material-symbols-rounded" style="font-size: 18px;">call</span>
                Call
              </a>
              <button class="btn btn-outline btn-sm" style="flex: 1; gap: 6px;" onclick="ContactFeature.open({name: '${Utils.escapeJsString(name)}', phone: '${Utils.escapeJsString(phone)}'})">
                <span class="material-symbols-rounded" style="font-size: 18px;">chat</span>
                Message
              </button>
            ` : ''}
            ${address ? `
              <button class="btn btn-outline btn-sm" style="flex: 1; gap: 6px;" onclick="window.open('${Utils.escapeJsString(Geo.buildNavigationUrl(address))}', '_blank')">
                <span class="material-symbols-rounded" style="font-size: 18px;">navigation</span>
                Navigate
              </button>
            ` : ''}
          </div>
        </div>

        <div class="card" style="margin: 16px; margin-top: 0;">
          <div class="hsc-stat-row">
            <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View visit history" onclick="AppointmentsFeature.scrollToCustomerHistory()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AppointmentsFeature.scrollToCustomerHistory();}">
              <div class="hsc-stat-value">${appts.length}</div>
              <div class="hsc-stat-label">Visits</div>
            </div>
            <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View money and sales" onclick="App.navigate('money')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('money');}">
              <div class="hsc-stat-value">${Utils.formatCurrency(totalValue)}</div>
              <div class="hsc-stat-label">Total Ordered</div>
            </div>
            <div class="hsc-stat ${lastVisit ? 'hsc-stat-clickable' : ''}" ${lastVisit ? `role="button" tabindex="0" aria-label="Open last visit" onclick="App.navigate('appointments', {id: ${lastVisit.id}})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('appointments', {id: ${lastVisit.id}});}"` : ''}>
              <div class="hsc-stat-value">${lastVisit ? Utils.formatDate(lastVisit.date, 'short') : '—'}</div>
              <div class="hsc-stat-label">Last Visit</div>
            </div>
          </div>
          ${firstVisit ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:10px;text-align:center;">Customer since ${Utils.formatDate(firstVisit.date, 'long')}</div>` : ''}
        </div>

        ${interests.length ? `
          <div class="card" style="margin: 16px; margin-top: 0;">
            <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Buying Interest</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${interests.map(([label, count]) => `<span class="chip">${Utils.escapeHtml(label)} · ${count}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="card" id="customer-history-anchor" style="margin: 16px; margin-top: 0;">
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">History</div>
          ${timeline.length === 0 ? `
            <div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:16px 0;">No visits, orders, or messages recorded yet</div>
          ` : timeline.map(item => `
            <div class="hsc-appt-row" ${item.onclick ? `onclick="${item.onclick}" style="cursor:pointer;"` : 'style="cursor:default;"'}>
              <span class="material-symbols-rounded" style="color:var(--text-tertiary);">${item.icon}</span>
              <span class="hsc-appt-details">
                <span class="hsc-appt-name">${item.title}</span>
                <span class="hsc-appt-address">${Utils.formatDate(item.date, 'short')} · ${item.subtitle}</span>
              </span>
              ${item.onclick ? '<span class="material-symbols-rounded hsc-appt-chevron">chevron_right</span>' : ''}
            </div>
          `).join('')}
        </div>

        <div class="card" style="margin: 16px; margin-top: 0;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:600;color:var(--text-secondary);">Photos ${photos.length ? `(${photos.length})` : ''}</div>
            <button class="btn btn-outline btn-sm" style="gap:6px;" aria-label="Add photo" onclick="document.getElementById('customer-photo-input').click()">
              <span class="material-symbols-rounded" style="font-size:16px;">photo_camera</span>Add Photo
            </button>
          </div>
          ${photos.length === 0 ? `
            <div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:12px 0 4px;">No photos yet — windows, fronts, damage notes, anything useful to remember.</div>
          ` : `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
              ${photos.map(p => this.renderPhotoThumb(p)).join('')}
            </div>
          `}
          <input type="file" id="customer-photo-input" accept="image/*" capture="environment" style="display:none;" onchange="AppointmentsFeature.captureCustomerPhoto(event, ${customerId})">
        </div>

        <div style="margin: 16px; margin-top: 0;">
          <button class="btn btn-danger btn-block btn-sm" onclick="AppointmentsFeature.confirmDeleteCustomer(${customer.id})">
            <span class="material-symbols-rounded">delete</span>
            Delete Customer
          </button>
        </div>
      </div>
    `;
  },

  // ---- Customer photo gallery ----
  // Photos are stored as base64 in IndexedDB (DB.addPhoto) and render
  // directly as data URLs — no object URLs to track or revoke, and it works
  // on both the Dexie and mini-Dexie storage engines.

  renderPhotoThumb(p) {
    return `<div style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--bg);" role="button" tabindex="0" aria-label="View photo" onclick="AppointmentsFeature.openPhotoViewer(${p.id}, ${p.customerId})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();AppointmentsFeature.openPhotoViewer(${p.id}, ${p.customerId});}">
      <img src="${this._photoSrc(p)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">
    </div>`;
  },

  _photoSrc(p) {
    return `data:${p.mimeType || 'image/jpeg'};base64,${p.data}`;
  },

  // Camera/file picker on the phone's hardware camera; on desktop this falls
  // back to a normal file picker. The picked photo is downscaled before
  // saving so the gallery stays lean (rows of a few hundred KB).
  async captureCustomerPhoto(event, customerId) {
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
    this._capturePhoto = { customerId, data, mimeType: 'image/jpeg' };
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Save photo</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal(); AppointmentsFeature.discardCapture()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <img src="${data}" alt="Captured photo" style="width:100%;max-height:45vh;object-fit:contain;border-radius:8px;background:var(--bg);">
        <div class="form-group" style="margin-top:12px;">
          <label>Caption (optional)</label>
          <input type="text" class="input" id="photo-caption-input" value="${Utils.escapeAttr(Utils.formatDate(new Date(), 'long'))}" placeholder="e.g. Front windows with Juliet balcony">
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.saveCapturedPhoto()"><span class="material-symbols-rounded">save</span>Save to gallery</button>
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

  _downscaleImage(file, maxSide = 1600, quality = 0.82) {
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
    const { customerId, data, mimeType } = this._capturePhoto || {};
    if (!customerId || !data) return;
    try {
      await DB.addPhoto({ customerId, data, mimeType, caption });
      this._capturePhoto = null;
      App.closeModal();
      Toast.show('Photo saved', 'success');
      App.navigate('appointments', { customerId });
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
      <div class="sheet-header"><h3>Photo</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <img src="${this._photoSrc(p)}" alt="Customer photo" style="width:100%;max-height:55vh;object-fit:contain;border-radius:8px;background:var(--bg);">
        <div class="form-group" style="margin-top:12px;">
          <label>Caption</label>
          <input type="text" class="input" id="photo-viewer-caption" value="${Utils.escapeAttr(caption)}">
        </div>
        <button class="btn btn-outline btn-sm btn-block" onclick="AppointmentsFeature.savePhotoCaption(${photoId})"><span class="material-symbols-rounded" style="font-size:16px;">save</span>Save caption</button>
        <div style="font-size:12px;color:var(--text-tertiary);text-align:center;margin:10px 0 4px;">Taken ${Utils.escapeHtml(Utils.formatDate(p.createdAt, 'long'))}</div>
        <button class="btn btn-danger btn-sm btn-block" onclick="AppointmentsFeature.confirmDeletePhoto(${photoId}, ${customerId})"><span class="material-symbols-rounded" style="font-size:16px;">delete</span>Delete photo</button>
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
      <div class="sheet-header"><h3>Delete photo?</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">This permanently removes the photo from the customer's gallery. This can't be undone.</div>
        <button class="btn btn-danger btn-block" onclick="AppointmentsFeature.deletePhoto(${photoId}, ${customerId})"><span class="material-symbols-rounded">delete</span>Delete Permanently</button>
      </div>`;
    App.openModal(content);
  },

  async deletePhoto(photoId, customerId) {
    try {
      await DB.deletePhoto(photoId);
      App.closeModal();
      Toast.show('Photo deleted', 'success');
      App.navigate('appointments', { customerId });
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
      customer = await DB.db.customers.get(customerId);
      apptCount = await DB.db.appointments.where('customerId').equals(customerId).count();
      photoCount = await DB.db.photos.where('customerId').equals(customerId).count();
    } catch (e) {}
    if (!customer) { Toast.show('Customer not found', 'error'); return; }
    const name = customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'this customer';
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Delete ${Utils.escapeHtml(name)}?</h3><button class="btn btn-ghost btn-sm" onclick="App.closeModal()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">
          This permanently deletes ${Utils.escapeHtml(name)}${apptCount > 0 ? ` and ${apptCount} linked visit${apptCount === 1 ? '' : 's'}` : ''}, along with any orders${photoCount > 0 ? `, ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''} and messages on record for them. This can't be undone.
        </div>
        <button class="btn btn-danger btn-block" onclick="AppointmentsFeature.deleteCustomer(${customerId})">
          <span class="material-symbols-rounded">delete</span>Delete Permanently
        </button>
        <button class="btn btn-outline btn-block" style="margin-top:8px;" onclick="App.closeModal()">Cancel</button>
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
      appt = await DB.db.appointments.get(id);
    } catch (e) {
      console.error('Failed to load visit:', e);
    }

    if (!appt) {
      return `<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Visit not found</div></div>`;
    }

    let customer = null;
    try {
      customer = appt.customerId ? await DB.db.customers.get(appt.customerId) : null;
    } catch (e) {}

    let measurements = [];
    try {
      measurements = await DB.db.measurements.where('appointmentId').equals(appt.id).toArray();
    } catch (e) {}

    const typeConfig = CONFIG.appointmentTypes.find(t => t.id === appt.type);
    const contactPhone = customer?.phone || appt.phone || '';

    return `
      <div class="fade-in">
        <!-- Header -->
        <div class="top-header">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('appointments')">
            <span class="material-symbols-rounded">arrow_back</span>
          </button>
          <h1 style="flex: 1; text-align: center; font-size: 18px;">Visit</h1>
          <div style="width: 40px;"></div>
        </div>

        <!-- Customer Info -->
        <div class="card" style="margin: 16px; margin-top: 8px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="display:flex;align-items:center;gap:16px;flex:1;min-width:0;${customer ? 'cursor:pointer;' : ''}" ${customer ? `role="button" tabindex="0" aria-label="View customer profile" onclick="App.navigate('appointments', {customerId: ${customer.id}})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('appointments', {customerId: ${customer.id}});}"` : ''}>
              <div style="width: 56px; height: 56px; flex-shrink:0; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600;">
                ${appt.clientName ? Utils.escapeHtml(appt.clientName.charAt(0).toUpperCase()) : '?'}
              </div>
              <div style="flex: 1; min-width:0;">
                <div style="font-size: 20px; font-weight: 600;">${Utils.escapeHtml(appt.clientName || 'Unknown')}</div>
                ${customer ? `
                  <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${Utils.escapeHtml(customer.customerNumber || '')} · View profile</div>
                ` : ''}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" aria-label="Edit customer details" onclick="AppointmentsFeature.openEditDetailsModal(${appt.id})">
              <span class="material-symbols-rounded">edit</span>
            </button>
          </div>

          ${contactPhone ? `
            <div style="display: flex; gap: 8px; margin-top: 16px;">
              <button class="btn btn-outline btn-sm" style="flex: 1; gap: 6px;" onclick="ContactFeature.open({name: '${Utils.escapeJsString(appt.clientName || 'Customer')}', phone: '${Utils.escapeJsString(contactPhone)}'})">
                <span class="material-symbols-rounded" style="font-size: 18px;">chat</span>
                Contact
              </button>
              ${(() => {
                const match = (typeof TalkFeature !== 'undefined') ? TalkFeature.getTemplateForOutcome(appt.outcome) : null;
                if (!match) return '';
                return `
                  <button class="btn btn-outline btn-sm" style="flex: 1; gap: 6px;" onclick="TalkFeature.sendMessage(${appt.id}, '${Utils.escapeJsString(match.template)}')">
                    <span class="material-symbols-rounded" style="font-size: 18px;">forward_to_inbox</span>
                    ${Utils.escapeHtml(match.action)}
                  </button>
                `;
              })()}
            </div>
          ` : ''}
        </div>

        <!-- Visit Details -->
        <div class="card" style="margin: 16px; margin-top: 0;">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="material-symbols-rounded" style="color: var(--text-tertiary);">event</span>
              <div>
                <div style="font-weight: 500;">${Utils.formatDate(appt.date, 'long')}</div>
                <div style="font-size: 13px; color: var(--text-secondary);">${Utils.formatTime(appt.date)}${this.getVisitDurationLabel(appt)}</div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="material-symbols-rounded" style="color: var(--text-tertiary);">${typeConfig?.icon || 'event'}</span>
              <div>
                <div style="font-weight: 500;">${Utils.escapeHtml(typeConfig?.name || appt.type)}</div>
                <div style="font-size: 13px; color: var(--text-secondary);">${appt.source === 'company_system' ? 'From company lead system' : 'Self-generated'}</div>
              </div>
            </div>

            ${appt.address ? `
              <div style="display: flex; align-items: flex-start; gap: 12px;">
                <span class="material-symbols-rounded" style="color: var(--text-tertiary); margin-top: 2px;">location_on</span>
                <div style="flex: 1;">
                  <div style="font-weight: 500;">${Utils.escapeHtml(appt.address)}</div>
                </div>
                <button class="btn btn-ghost btn-sm" aria-label="Edit address" style="flex-shrink:0;" onclick="AppointmentsFeature.openEditDetailsModal(${appt.id})">
                  <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        ${measurements.length ? `
          <div class="card" style="margin: 16px; margin-top: 0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="font-size:13px;font-weight:600;color:var(--text-secondary);">Measurements</div>
              <button class="btn btn-ghost btn-sm" aria-label="Add another measurement" onclick="App.navigate('measure', {appointmentId: ${appt.id}})">
                <span class="material-symbols-rounded">add</span>
              </button>
            </div>
            ${measurements.map(m => `
              <button class="area-customer-row" onclick="App.navigate('measure', {appointmentId: ${appt.id}, measurementId: ${m.id}})">
                <span class="material-symbols-rounded">straighten</span>
                <span>
                  <strong>${Utils.escapeHtml(m.windowName || 'Window')}</strong>
                  <small>${Utils.formatMeasurement(m.widthUsed || 0)} × ${Utils.formatMeasurement(m.dropUsed || 0)} · ${m.fittingType === 'exact' ? 'Exact' : 'Recess'}</small>
                </span>
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            `).join('')}
          </div>
        ` : ''}

        ${appt.status !== 'cancelled' ? `
          <div style="padding:0 16px;margin-bottom:16px;">
            <div class="divider-text">Manage</div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;">
              ${appt.address ? `
                <button class="btn btn-outline btn-sm" onclick="AppointmentsFeature.navigateToVisit('${Utils.escapeJsString(appt.address)}', ${appt.id})">
                  <span class="material-symbols-rounded">navigation</span>
                  Navigate
                </button>
              ` : ''}
              <button class="btn btn-outline btn-sm" onclick="App.navigate('measure', {appointmentId: ${appt.id}})">
                <span class="material-symbols-rounded">straighten</span>
                Measure
              </button>
              <button class="btn btn-outline btn-sm" onclick="AppointmentsFeature.openRescheduleModal(${appt.id})">
                <span class="material-symbols-rounded">edit_calendar</span>
                Move
              </button>
            </div>
            <button class="btn btn-danger btn-sm btn-block" onclick="AppointmentsFeature.openCancelModal(${appt.id})">
              <span class="material-symbols-rounded">event_busy</span>
              Cancel Visit
            </button>
          </div>
        ` : `
          <div style="padding:0 16px;margin-bottom:16px;">
            <div class="card" style="background:var(--danger-light);">
              <strong style="color:var(--danger);">Cancelled</strong>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">This visit is kept in the record, but removed from live planning.</div>
            </div>
          </div>
        `}

        <!-- Outcome Section -->
        ${appt.status === 'confirmed' ? `
          <div style="padding: 0 16px;">
            <div class="divider-text">Outcome</div>
            ${this.renderOutcomeButtons(appt)}
          </div>
        ` : appt.outcome ? `
          <div style="padding: 0 16px;">
            <div class="divider-text">Outcome</div>
            <div class="card" style="background: var(--secondary-light);">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="material-symbols-rounded" style="color: var(--secondary);">check_circle</span>
                <div style="flex:1;">
                  <div style="font-weight: 600;">${this.getOutcomeName(appt.outcome, appt.type)}</div>
                  ${appt.value > 0 ? `<div style="font-size: 13px; color: var(--secondary);">${Utils.formatCurrency(appt.value)}</div>` : ''}
                  ${appt.quoteReason ? `<div style="font-size: 13px; color: var(--text-secondary); margin-top:2px;">${Utils.escapeHtml(this.getQuoteReasonLabel(appt.quoteReason))}</div>` : ''}
                </div>
                <button class="btn btn-ghost btn-sm" aria-label="Change outcome" onclick="AppointmentsFeature.openChangeOutcomeModal(${appt.id})">
                  <span class="material-symbols-rounded">edit</span>
                </button>
              </div>
              ${appt.quoteReason === 'expensive' ? `
                <button class="btn btn-outline btn-sm btn-block" style="margin-top:10px;" onclick="AppointmentsFeature.openFloorCheckModal(${appt.id})">
                  <span class="material-symbols-rounded" style="font-size:18px;">calculate</span>
                  Check my floor
                </button>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Notes -->
        <div style="padding: 0 16px; margin-top: 16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="divider-text" style="margin-bottom:0;">Notes</div>
            <button class="btn btn-ghost btn-sm" aria-label="${appt.notes ? 'Edit notes' : 'Add notes'}" onclick="AppointmentsFeature.openEditNotesModal(${appt.id})">
              <span class="material-symbols-rounded">${appt.notes ? 'edit' : 'add'}</span>
            </button>
          </div>
          ${appt.notes ? `
            <div class="card inset-dark" style="background: var(--bg);">
              <div style="font-size: 14px; color: var(--text-secondary); white-space: pre-wrap;">${Utils.escapeHtml(appt.notes)}</div>
            </div>
          ` : `
            <div style="font-size:13px;color:var(--text-tertiary);">No notes yet.</div>
          `}
        </div>
      </div>
    `;
  },

  renderAddForm(params = {}) {
    // "undefined" can reach here via a stale hash URL (older builds serialised
    // undefined params into the query string) - treat it like an absent value.
    const paramDate = params.date && params.date !== 'undefined' ? params.date : '';
    const paramTime = params.time && params.time !== 'undefined' ? params.time : '';
    const today = paramDate || Utils.formatDate(new Date(), 'iso');
    const selectedTime = paramTime || '09:00';
    const allowedTypes = this.getAllowedTypesForDate(today);
    const defaultType = allowedTypes.includes(params.type) ? params.type : allowedTypes[0];
    const mode = this.getDayMode(today + 'T00:00:00');
    const scannedName = params.name || '';
    const scannedPhone = params.phone || '';
    const scannedAddress = params.address || '';
    return `
      <div class="fade-in">
        <div class="top-header">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('appointments')">
            <span class="material-symbols-rounded">arrow_back</span>
          </button>
          <h1 style="flex: 1; text-align: center; font-size: 18px;">New Visit</h1>
          <div style="width: 40px;"></div>
        </div>

        <div style="padding: 16px;">
          <div class="form-group">
            <label>Customer Name *</label>
            <input type="text" class="input" id="appt-name" autocomplete="name" placeholder="e.g. Sarah Johnson" value="${Utils.escapeAttr(scannedName)}">
          </div>

          <div class="form-group">
            <label>Phone</label>
            <input type="tel" class="input" id="appt-phone" inputmode="tel" autocomplete="tel" placeholder="07700 900123" value="${Utils.escapeAttr(scannedPhone)}">
          </div>

          <div class="form-group">
            <label>Address *</label>
            <input type="text" class="input" id="appt-address" autocomplete="street-address" placeholder="Full address" value="${Utils.escapeAttr(scannedAddress)}">
          </div>

          <button type="button" class="btn btn-outline btn-block visit-scan-button" onclick="App.navigate('ocr')">
            <span class="material-symbols-rounded">document_scanner</span>
            Scan customer details
          </button>
          <div class="hint" style="margin-top:-4px;margin-bottom:16px;">Use this for a paper note, screenshot, business card or order document.</div>

	          <div class="form-row">
	            <div class="form-group">
	              <label>Date *</label>
	              <input type="date" class="input" id="appt-date" value="${today}" onchange="AppointmentsFeature.updateVisitDayAdvice(this.value)">
	            </div>
	            <div class="form-group">
	              <label>Visit time *</label>
	              <input type="time" class="input" id="appt-time" value="${selectedTime}" step="900" oninput="AppointmentsFeature.updateScheduleAdvice()">
	            </div>
	          </div>

	          <div class="form-row">
	            <div class="form-group">
	              <label>Duration</label>
	              <select class="select" id="appt-duration" onchange="AppointmentsFeature.updateScheduleAdvice()">
	                ${this.renderDurationOptions(params.duration || 1)}
	              </select>
	            </div>
	            <div class="form-group">
	              <label>Travel room</label>
	              <button type="button" class="btn btn-outline btn-block" onclick="AppointmentsFeature.previewTravelRoom()">
	                <span class="material-symbols-rounded">route</span>
	                Check gaps
	              </button>
	            </div>
	          </div>
	          <div class="hint" id="visit-day-advice" style="margin-top:-8px;margin-bottom:8px;">${Utils.escapeHtml(mode.friendLine)}</div>
	          <div class="hint" id="travel-room-advice" style="margin-bottom:16px;">Rough area-based check of the gap before and after this visit.</div>

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

          <button class="btn btn-primary btn-block" id="appt-save-btn" style="margin-top: 8px;" onclick="AppointmentsFeature.saveAppointment()">
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
      notes: document.getElementById('appt-notes')?.value.trim() || ''
    };
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
    const appt = await DB.db.appointments.get(appointmentId);
    if (!appt) { App.navigate('appointments'); return; }
    const customer = appt.customerId ? await DB.db.customers.get(appt.customerId) : null;
    const phone = customer?.phone || appt.phone;
    const apptDate = new Date(appt.date);
    const message = NotificationService.buildBookingConfirmationMessage({
      firstName: customer?.firstName || appt.clientName?.split(' ')[0] || 'there',
      date: apptDate,
      dateLabel: apptDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
      time: Utils.formatTime(appt.date),
      address: appt.address || '',
      type: appt.type,
      advisorName: CONFIG.advisorName || 'Your Advisor'
    });
    const content = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h3>Send Booking Confirmation?</h3><button class="btn btn-ghost btn-sm" onclick="AppointmentsFeature.skipBookingConfirmation()"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Introduces you, confirms the visit, and asks about clear windows and parking.</div>
        <textarea class="textarea" id="booking-confirm-message" style="min-height:130px;">${Utils.escapeHtml(message)}</textarea>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn btn-outline btn-block" onclick="AppointmentsFeature.skipBookingConfirmation()">Not Now</button>
          <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.sendBookingConfirmation('${Utils.escapeJsString(Utils.toWhatsAppPhone(phone) || '')}')">
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
    const data = draft || this.readAppointmentDraft();
    if (!data) {
      Toast.show('Visit form is no longer open. Please check details and try again.', 'error');
      return;
    }
    const { name, phone, address, date, time, durationSlots, type, source, access, notes } = data;

	    if (!name || !address || !date) {
	      Toast.show('Please fill in required fields', 'error');
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
        const travelWarnings = this.findTravelWarnings({ address, date, time, durationSlots }, existingToday);
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

      // Create or find customer
      let customerId = null;
      if (phone) {
        const existing = await DB.db.customers.where('phone').equals(phone).first();
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
        clientName: name,
        phone,
        address,
        date: dateTime.toISOString(),
        durationSlots,
        type,
        source,
        notes: [access ? `Access: ${access}` : '', notes].filter(Boolean).join('\n\n'),
        status: 'confirmed'
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
    if (advice) {
      advice.textContent = warnings.length > 0
        ? warnings[0]
        : 'The gap around this visit looks workable from the diary.';
    }
  },

  showTravelWarning(warnings) {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Tight travel gap</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">
          This may still work, but I would check the driving time before committing it.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
          ${warnings.map(text => `
            <div style="border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:10px;background:var(--warning-light);font-size:13px;line-height:1.4;">
              ${Utils.escapeHtml(text)}
            </div>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.confirmTravelWarning()">
          Save anyway
        </button>
        <button class="btn btn-outline btn-block" style="margin-top:10px;" onclick="App.closeModal();">
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
        const upcoming = await DB.getUpcomingAppointments(180);
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
            detail: `${new Date(appt.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${Utils.formatTime(appt.date)}`
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
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">
          This may still be a genuine second visit, but I found something close enough to check before saving.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
          ${warnings.map(w => `
            <div class="inset-dark" style="border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:10px;background:var(--bg);">
              <div style="font-weight:700;color:var(--text-primary);">${Utils.escapeHtml(w.title)}</div>
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">${Utils.escapeHtml(w.detail)}</div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.confirmDuplicateSave()">
          Save anyway
        </button>
        <button class="btn btn-outline btn-block" style="margin-top:10px;" onclick="App.closeModal();">
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
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const date = Utils.formatDate(appt.date, 'iso');
    const time = this.getTimeKey(appt.date);
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Move Visit</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
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
          <label>Reason / note</label>
          <textarea class="textarea" id="move-note" placeholder="Customer requested, route tidy-up, no access..."></textarea>
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.saveReschedule(${id})">
          Save New Time
        </button>
      </div>
    `;
    App.openModal(content);
  },

  readRescheduleDraft(appt) {
    return {
      date: document.getElementById('move-date')?.value || Utils.formatDate(appt.date, 'iso'),
      time: document.getElementById('move-time')?.value || this.getTimeKey(appt.date),
      durationSlots: Math.max(1, parseInt(document.getElementById('move-duration')?.value, 10) || appt.durationSlots || 1),
      reason: document.getElementById('move-note')?.value.trim() || '',
      address: appt.address || ''
    };
  },

  async saveReschedule(id, forceTravel = false, draft = null) {
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const data = draft || this.readRescheduleDraft(appt);

    if (!data.date || !data.time) {
      Toast.show('Pick a date and time first', 'error');
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
      const travelWarnings = this.findTravelWarnings(data, existingToday, id);
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
    await DB.db.appointments.update(id, {
      date: newDate,
      durationSlots: data.durationSlots,
      status: 'confirmed',
      notes: [existingNotes, moveNote].filter(Boolean).join('\n\n')
    });
    App.closeModal();
    Toast.show('Visit moved', 'success');
    App.navigate('appointments', { id });
  },

  async openEditDetailsModal(id) {
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Edit Details</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" class="input" id="edit-detail-name" autocomplete="name" value="${Utils.escapeAttr(appt.clientName || '')}">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" class="input" id="edit-detail-phone" inputmode="tel" autocomplete="tel" value="${Utils.escapeAttr(appt.phone || '')}">
        </div>
        <div class="form-group">
          <label>Address *</label>
          <input type="text" class="input" id="edit-detail-address" autocomplete="street-address" value="${Utils.escapeAttr(appt.address || '')}">
          <div class="hint">Include the postcode here, e.g. "12 Elm Street, Manchester, M14 5AB"</div>
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.saveEditDetails(${id})">
          Save Changes
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveEditDetails(id) {
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }

    const name = document.getElementById('edit-detail-name')?.value.trim() || '';
    const phone = document.getElementById('edit-detail-phone')?.value.trim() || '';
    const address = document.getElementById('edit-detail-address')?.value.trim() || '';

    if (!name || !address) {
      Toast.show('Name and address are required', 'error');
      return;
    }

    try {
      await DB.db.appointments.update(id, { clientName: name, phone, address });

      // Keep the linked customer record in sync so search, the area view and
      // future visits all see the corrected details rather than just this visit.
      if (appt.customerId) {
        const { postcode, postcodeNormalized } = (typeof OCRFeature !== 'undefined' && OCRFeature.extractPostcodeFromAddress)
          ? OCRFeature.extractPostcodeFromAddress(address)
          : { postcode: '', postcodeNormalized: '' };
        const customer = await DB.db.customers.get(appt.customerId);
        await DB.db.customers.update(appt.customerId, {
          fullName: name,
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' ') || '',
          phone,
          postcodeNormalized,
          address: { ...(customer?.address || {}), line1: address, postcode, postcodeNormalized }
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
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Cancel Visit</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">
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
        <button class="btn btn-danger btn-block" onclick="AppointmentsFeature.cancelAppointment(${id})">
          Cancel Visit
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async cancelAppointment(id) {
    const reason = document.getElementById('cancel-reason')?.value || 'cancelled';
    const note = document.getElementById('cancel-note')?.value.trim() || '';
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const existingNotes = appt.notes || '';
    const cancelNote = `Cancelled: ${reason.replace(/_/g, ' ')}${note ? ` - ${note}` : ''}`;
    await DB.db.appointments.update(id, {
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
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>${appt.notes ? 'Edit Notes' : 'Add Notes'}</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <textarea class="textarea" id="edit-appt-notes" rows="5" placeholder="Anything worth remembering about this visit...">${Utils.escapeHtml(appt.notes || '')}</textarea>
        </div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.saveNotes(${id})">
          Save Notes
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveNotes(id) {
    const notes = document.getElementById('edit-appt-notes')?.value.trim() || '';
    try {
      await DB.db.appointments.update(id, { notes });
      App.closeModal();
      Toast.show('Notes saved', 'success');
      App.navigate('appointments', { id });
    } catch (e) {
      console.error('Save notes error:', e);
      Toast.show('Failed to save notes', 'error');
    }
  },

  async openChangeOutcomeModal(id) {
    const appt = await DB.db.appointments.get(id);
    if (!appt) {
      Toast.show('Visit not found', 'error');
      return;
    }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Change Outcome</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="hint" style="margin-top:-4px;margin-bottom:14px;">Picking an outcome below replaces the current one.</div>
        ${this.renderOutcomeButtons(appt)}
      </div>
    `;
    App.openModal(content);
  },

  async captureOutcome(id, outcomeId) {
    let appt = null;
    try {
      appt = await DB.db.appointments.get(id);
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
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        ${moneyOutcome ? `
          <div class="form-group">
            <label>${valueLabel}</label>
            <input type="number" class="input" id="outcome-value" placeholder="0.00" step="0.01" min="0" inputmode="decimal" autofocus oninput="AppointmentsFeature.updateOutcomeCommission()">
          </div>
          ${saleOutcome ? `
            <div class="form-group">
              <label>Discount Offered (%) <span style="font-weight:400;color:var(--text-tertiary);">- optional</span></label>
              <input type="number" class="input" id="outcome-discount" placeholder="0" step="1" min="0" max="100" inputmode="decimal" oninput="AppointmentsFeature.updateOutcomeCommission()">
            </div>
            <div class="form-group">
              <label>Commission</label>
              <input type="text" class="input" id="outcome-commission" value="${Utils.formatCurrency(0)}" readonly aria-live="polite">
              <div class="hint">${Utils.escapeHtml(commissionHint)} Change this in Settings if your rate changes.</div>
            </div>
            <div id="outcome-discount-breakdown"></div>
          ` : `
            <div class="hint" style="margin-top:-8px;margin-bottom:14px;">Quote value is kept on the table, but no commission is counted until it becomes an order.</div>
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
            <label>What's the access/safety issue? <span style="color: var(--danger, #c0392b);">*</span></label>
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
            <label>Reason${outcomeId === 'other_no_sale' ? ' <span style="color: var(--danger, #c0392b);">*</span>' : ''}</label>
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

        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.saveOutcome(${id}, '${outcomeId}')">
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

    if (!breakdownEl) return;
    if (discountPct <= 0 || grossValue <= 0) { breakdownEl.innerHTML = ''; return; }

    const discountAmount = grossValue - netValue;
    const ctx = this._outcomeDiscountContext;
    const targetHtml = ctx ? (() => {
      const projectedTotal = ctx.weekSales + netValue;
      const stillHitsTarget = projectedTotal >= ctx.target;
      return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <span class="material-symbols-rounded" style="font-size:18px;color:${stillHitsTarget ? 'var(--secondary)' : 'var(--danger)'};">${stillHitsTarget ? 'check_circle' : 'warning'}</span>
        <span style="font-size:12px;font-weight:600;color:${stillHitsTarget ? 'var(--secondary)' : 'var(--danger)'};">${stillHitsTarget ? 'Still on target' : 'Target may be at risk'} - ${Utils.formatCurrency(projectedTotal)} of ${Utils.formatCurrency(ctx.target)} this week</span>
      </div>`;
    })() : '';

    breakdownEl.innerHTML = `
      <div style="background:var(--bg);border-radius:12px;padding:12px 14px;margin-top:-8px;margin-bottom:14px;font-size:13px;color:var(--text-secondary);line-height:1.6;">
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
      let appt = await DB.db.appointments.get(id);
      const existingNotes = appt.notes || '';
      const reasonText = reason ? `Reason: ${reason.replace(/_/g, ' ')}` : '';
      const discountText = discountPct > 0 ? `Discount: ${discountPct}% off ${Utils.formatCurrency(grossValue)}` : '';
      const outcomeNote = [reasonText, discountText, notes ? `Outcome: ${notes}` : ''].filter(Boolean).join('\n');

      await DB.db.appointments.update(id, {
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
      });

      // Order reconciliation: EXACTLY ONE order may exist per sale. Saving
      // an 'ordered' outcome upserts the order keyed by appointmentId (so
      // re-saving or correcting the value updates the existing order instead
      // of creating a duplicate), and moving the outcome away from 'ordered'
      // deletes the linked order so a reversed sale stops counting toward
      // customer totals and the pipeline.
      const linkedOrder = await DB.db.orders
        .where('appointmentId')
        .equals(id)
        .first()
        .catch(() => null);

      if (outcomeId === 'ordered') {
        if (value > 0) {
          if (linkedOrder) {
            const deposit = App.calculateDeposit(value);
            await DB.db.orders.update(linkedOrder.id, {
              total: value,
              depositRequired: deposit.amount,
              balanceDue: value,
              status: 'deposit_pending'
            });
            await DB.refreshCustomerTotals(appt.customerId);
          } else {
            await DB.addOrder({
              customerId: appt.customerId,
              appointmentId: id,
              total: value,
              status: 'deposit_pending'
            });
          }
        }
      } else if (linkedOrder) {
        await DB.removeOrder(linkedOrder.id);
      }

      App.closeModal();
      Toast.show('Outcome saved', 'success');

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
      <div class="sheet-header"><h3>Book the Service Call?</h3><button class="btn btn-ghost btn-sm" onclick="AppointmentsFeature.skipServiceCallBooking(${appt.id})"><span class="material-symbols-rounded">close</span></button></div>
      <div class="sheet-body">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Take you straight to a new visit for ${Utils.escapeHtml(appt.clientName || 'this customer')}, pre-filled with their details and set to Service Call. Pick the date and time on the next screen.</div>
        <button class="btn btn-primary btn-block" onclick="AppointmentsFeature.bookServiceCallNow(${appt.id})">
          <span class="material-symbols-rounded">build</span>Book Service Call
        </button>
        <button class="btn btn-outline btn-block" style="margin-top:8px;" onclick="AppointmentsFeature.skipServiceCallBooking(${appt.id})">
          Not Now
        </button>
      </div>`;
    App.openModal(content);
  },

  bookServiceCallNow(appointmentId) {
    App.closeModal();
    DB.db.appointments.get(appointmentId).then(appt => {
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
      appt = await DB.db.appointments.get(id);
    } catch (e) {
      Toast.show('Visit not found', 'error');
      return;
    }

    App.openModal(`
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Check my floor</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body" id="floor-check-body">
        <div style="text-align:center;padding:32px 0;color:var(--text-tertiary);">Working it out...</div>
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
      <div class="hint" style="margin-top:-4px;margin-bottom:14px;">
        This is a walk-away line, not something to offer. Hold rack rate first — this is only for when the deal is genuinely about to be lost.
      </div>
      <div class="card inset-dark" style="background: var(--bg);margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span style="color:var(--text-secondary);">Round trip</span>
          <span>${floor.roundTripKm.toFixed(1)} km &middot; ${Utils.formatCurrency(floor.tripCost)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span style="color:var(--text-secondary);">Time (drive + visit)</span>
          <span>${Math.round(floor.totalMinutes)} min &middot; ${Utils.formatCurrency(floor.timeCost)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px solid var(--border-light);padding-top:8px;margin-top:2px;">
          <span>Minimum commission worth taking</span>
          <span>${Utils.formatCurrency(floor.minCommission)}</span>
        </div>
      </div>
      ${floor.minSaleValue !== null ? `
        <div class="card" style="margin-bottom:12px;">
          <div style="font-size:13px;color:var(--text-secondary);">Floor sale price</div>
          <div style="font-size:22px;font-weight:800;">${Utils.formatCurrency(floor.minSaleValue)}</div>
          ${quoted > 0 ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Your quote of ${Utils.formatCurrency(quoted)} would pay ${Utils.formatCurrency(quotedCommission)} commission.</div>` : ''}
        </div>
      ` : `
        <div class="hint">Can't work out a floor price — your commission rate is set to 0% in Settings.</div>
      `}
      ${floor.hourlyRateIsEstimate ? `<div class="hint">Using an estimated hourly value from your weekly target (&pound;${floor.hourlyRate.toFixed(0)}/hr). Set your own in Settings &rarr; Minimum Hourly Value for a number you actually trust.</div>` : ''}
    `;
  },

  switchTab(tab) {
    const tabs = document.querySelectorAll('#appt-tabs .tab');
    tabs.forEach(t => t.classList.remove('active'));

    // Find the clicked tab
    const clickedTab = Array.from(tabs).find(t => t.dataset.tab === tab);
    if (clickedTab) clickedTab.classList.add('active');

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
  },

  showAddModal() {
    App.navigate('appointments', {action: 'add'});
  },

  activate(params = {}) {
    // Auto-refresh when activated
    if (params.tab) {
      this.switchTab(params.tab);
    }
  }
};

App.registerFeature(AppointmentsFeature);
