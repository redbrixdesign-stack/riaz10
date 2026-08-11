/* ============================================
   ADVISOROS — HOME SCREEN LAYOUT CONTROLLER
   Weekly-calendar-and-visit-list layout for the Today screen
   (see renderWeeklyHomeScreen below).

   INTEGRATION: this is a classic global script, same as every other file
   in js/core and js/features — no <script type="module"> needed, just add
   it to index.html alongside today.js:

     <script src="js/features/today/home-screen-controller.js?v=1"></script>

   Then call HomeScreenController.renderDynamicHomeScreen('containerId')
   from wherever you want it shown (e.g. in place of TodayFeature.render()).
   This file makes it available, it doesn't self-install.

   SCHEMA: two small, additive fields were added elsewhere so this
   controller can read real data instead of guessing:
     - js/core/geo.js  — Geo.startTrip() now stamps the appointment with
       { travelStatus: 'in_transit', travelStartedAt }, and finishTrip()
       stamps { travelStatus: 'on_site', arrivedAt } on arrival.
     - js/features/appointments/appointments.js — saveOutcome() now stamps
       { completedAt, travelStatus: null } when a visit is marked done.
   Neither field is in the Dexie index string (js/core/db.js), so no
   version bump was needed — they're just extra properties on the record.
   The existing status enum ('confirmed'/'completed'/'cancelled') and every
   place that reads it are untouched; travelStatus is a separate, orthogonal
   flag that only this controller (and geo.js, which sets it) touches.
   ============================================ */

const HomeScreenController = {
  POLL_MS: 60 * 1000,
  STYLE_ID: 'hsc-styles',

  _timer: null,

  async renderDynamicHomeScreen(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`[HomeScreenController] container #${containerId} not found`);
      return;
    }

    this.injectStylesOnce();

    try {
      const html = await this.renderWeeklyHomeScreen(containerId);
      container.innerHTML = html;
    } catch (e) {
      console.error('[HomeScreenController] render failed:', e);
      container.innerHTML = this.renderErrorFallback();
    }

    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.renderDynamicHomeScreen(containerId), this.POLL_MS);
  },

  stopDynamicHomeScreen() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },

  /* ---------- Weekly calendar home screen ---------- */
  // Persisted on the controller object (not in DB) so it resets to today on
  // a fresh app load, but survives the 60s auto-poll re-render while
  // browsing a different day - matches how a native calendar app behaves.
  _selectedDate: null,

  getSelectedDate() {
    if (!this._selectedDate) this._selectedDate = Utils.getToday();
    return this._selectedDate;
  },

  shiftSelectedDay(days) {
    this._selectedDate = Utils.addDays(this.getSelectedDate(), days);
    this.renderDynamicHomeScreen('hsc-today-root');
  },

  selectDay(isoDate) {
    this._selectedDate = new Date(isoDate);
    this.renderDynamicHomeScreen('hsc-today-root');
  },

  jumpToToday() {
    this._selectedDate = Utils.getToday();
    this.renderDynamicHomeScreen('hsc-today-root');
  },

  async renderWeeklyHomeScreen(containerId) {
    const selected = this.getSelectedDate();
    const today = Utils.getToday();
    const isToday = selected.getTime() === today.getTime();

    // Week containing the selected day, Monday-first (matches the rest of
    // the app - see RouteFeature.getDayMode and the Visits week strip).
    const dow = (selected.getDay() + 6) % 7; // 0=Mon .. 6=Sun
    const monday = Utils.addDays(selected, -dow);
    const weekDays = Array.from({ length: 7 }, (_, i) => Utils.addDays(monday, i));

    let dayAppts = [];
    try {
      dayAppts = (await DB.getAppointmentsForDate(selected.toISOString()))
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
      console.log('[HomeScreenController] weekly home load failed:', e);
    }

    let base = null;
    try { base = await RouteFeature.getBasePoint(); } catch (e) {}

    // The travel-time line wasn't showing at all before this - because
    // appointments only ever get geocoded when the Route screen loads
    // (RouteFeature.ensureAppointmentCoords), and Home never called it. A
    // freshly-booked visit sat with no latLng indefinitely until someone
    // happened to open Route first. Doing it here too means Home can show a
    // travel estimate the first time you look, not just after a detour
    // through another screen.
    try { dayAppts = await RouteFeature.ensureAppointmentCoords(dayAppts); } catch (e) {}

    // Chained, not all-from-base: the first stop is measured from base (an
    // advisor's real starting point), but every stop after that is measured
    // from the ONE BEFORE it - matching how the day actually drives, not
    // "drive home and back out again before every visit". Precomputed here,
    // in chronological order, before the list gets split into
    // Morning/Afternoon/Evening groups for display - the chain has to follow
    // time order regardless of which group a stop lands in.
    const travelLabels = new Map();
    let chainPoint = base?.latLng || null;
    for (const a of dayAppts) {
      if (chainPoint && Array.isArray(a.latLng) && a.latLng.length === 2) {
        const km = RouteFeature.calculateLegKm(chainPoint, a.latLng);
        const mins = Math.max(1, Math.round((km / 35) * 60));
        travelLabels.set(a.id, `${mins} min`);
      }
      if (Array.isArray(a.latLng) && a.latLng.length === 2) chainPoint = a.latLng;
    }

    let upNextCardHtml = '';
    if (isToday) {
      const active = dayAppts.find(a => a.status !== 'completed');
      if (active) upNextCardHtml = this.renderUpNextBanner(active);
    }

    let followUpCount = 0;
    try {
      followUpCount = (typeof FollowupsFeature !== 'undefined')
        ? await FollowupsFeature.getDueCount()
        : await TalkFeature.getDueFollowUpCount();
    } catch (e) {}

    const dayStripHtml = weekDays.map(d => {
      const isSelected = d.getTime() === selected.getTime();
      const isTodayDot = d.getTime() === today.getTime();
      return `
        <button class="hsc-week-day ${isSelected ? 'active' : ''}" type="button" onclick="HomeScreenController.selectDay('${Utils.formatDate(d, 'iso')}')">
          <span class="hsc-week-day-name">${Utils.formatDate(d, 'weekday-short')}</span>
          <span class="hsc-week-day-num">${d.getDate()}</span>
          ${isTodayDot && !isSelected ? '<span class="hsc-week-day-dot"></span>' : ''}
        </button>
      `;
    }).join('');

    const listHtml = dayAppts.length === 0
      ? `<div class="hsc-empty" style="margin-top:24px;">Nothing booked ${isToday ? 'today' : 'this day'}.</div>`
      : this.renderGroupedVisitList(dayAppts, travelLabels);

    return `
      <div class="hsc-root hsc-weekly fade-in">
        <div class="hsc-week-toprow">
          <button class="hsc-week-icon-btn" type="button" aria-label="Search visits" onclick="App.navigate('appointments')">
            <span class="material-symbols-rounded">search</span>
          </button>
        </div>

        <div class="hsc-week-header">
          <button class="hsc-week-nav" type="button" aria-label="Previous day" onclick="HomeScreenController.shiftSelectedDay(-1)">
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <div class="hsc-week-title" onclick="HomeScreenController.jumpToToday()">
            ${Utils.escapeHtml(Utils.formatDate(selected, 'long'))}
            ${!isToday ? '<span class="hsc-week-today-hint">Tap for today</span>' : ''}
          </div>
          <button class="hsc-week-nav" type="button" aria-label="Next day" onclick="HomeScreenController.shiftSelectedDay(1)">
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        </div>

        <div class="hsc-week-strip">${dayStripHtml}</div>

        ${followUpCount > 0 ? `
        <button class="hsc-followup-badge" type="button" onclick="App.navigate('followups')">
          <span class="material-symbols-rounded">campaign</span>
          ${followUpCount} thing${followUpCount === 1 ? '' : 's'} due today
          <span class="material-symbols-rounded" style="margin-left:auto;">chevron_right</span>
        </button>
        ` : ''}

        ${upNextCardHtml}

        <div class="hsc-week-list">${listHtml}</div>

        <div style="text-align:center;margin-top:16px;">
          ${this.renderAddVisitLink()}
        </div>
      </div>
    `;
  },

  renderGroupedVisitList(appts, travelLabels) {
    const groups = { Morning: [], Afternoon: [], Evening: [] };
    for (const a of appts) {
      const h = new Date(a.date).getHours();
      (h < 12 ? groups.Morning : h < 17 ? groups.Afternoon : groups.Evening).push(a);
    }
    return Object.entries(groups)
      .filter(([, list]) => list.length > 0)
      .map(([label, list]) => `
        <div class="hsc-week-group-label">${label}</div>
        ${list.map(a => this.renderWeeklyVisitRow(a, travelLabels.get(a.id))).join('')}
      `).join('');
  },

  renderWeeklyVisitRow(appt, travel) {
    const name = Utils.escapeHtml(appt.clientName || 'Customer');
    const address = Utils.escapeHtml(appt.address || 'No address set');
    const time = Utils.escapeHtml(Utils.formatTime(appt.date));
    const isDone = appt.status === 'completed';
    const phone = appt.phone || '';

    return `
      <div class="hsc-week-row ${isDone ? 'done' : ''}">
        <button class="hsc-week-row-main" type="button" onclick="App.navigate('appointments', {id: ${appt.id}})">
          <div class="hsc-week-row-top">
            <span class="hsc-week-row-name">@${name}</span>
            <span class="hsc-week-row-time">${time}</span>
          </div>
          <div class="hsc-week-row-address">${address}</div>
          ${travel ? `<div class="hsc-week-row-travel"><span class="material-symbols-rounded">directions_car</span>${travel} away</div>` : ''}
        </button>
        ${!isDone ? `
        <div class="hsc-week-row-actions">
          <button class="btn btn-outline btn-sm" type="button" onclick="AppointmentsFeature.navigateToVisit('${Utils.escapeJsString(appt.address || '')}', ${appt.id})">
            <span class="material-symbols-rounded">navigation</span>Navigate
          </button>
          <button class="btn btn-outline btn-sm" type="button" ${phone ? '' : 'disabled'} onclick="ContactFeature.open({name: '${Utils.escapeJsString(appt.clientName || 'Customer')}', phone: '${Utils.escapeJsString(phone)}'})">
            <span class="material-symbols-rounded">chat</span>Talk
          </button>
        </div>
        ` : ''}
      </div>
    `;
  },

  // A compact live-status strip for today's next/current visit - keeps the
  // real-time "running late" awareness from the old Mid-Day dashboard
  // available, just as a banner atop the day's list rather than the whole
  // screen being taken over by a single visit.
  renderUpNextBanner(appt) {
    const isOnSite = appt.travelStatus === 'on_site';
    const isInTransit = appt.travelStatus === 'in_transit';
    const isLate = !isOnSite && (Date.now() - new Date(appt.date).getTime()) > 5 * 60 * 1000;
    const label = isOnSite ? 'On site now' : isLate ? 'Running late' : isInTransit ? 'On the way' : 'Up next';
    const color = isLate ? 'var(--warning,#b06000)' : isOnSite ? 'var(--secondary)' : 'var(--text-secondary)';
    return `
      <div class="hsc-upnext-banner">
        <span class="hsc-upnext-dot" style="background:${color};"></span>
        <span class="hsc-upnext-label" style="color:${color};">${Utils.escapeHtml(label)}</span>
        <span class="hsc-upnext-name">@${Utils.escapeHtml(appt.clientName || 'Customer')}</span>
        <span class="hsc-upnext-time">${Utils.escapeHtml(Utils.formatTime(appt.date))}</span>
      </div>
    `;
  },

  // A new appointment can come in any time - mid-morning, mid-visit, or right
  // at the end of the day - and previously the only place to add one was the
  // empty-day state. This gives every state the same way in.
  renderAddVisitLink() {
    return `
      <button class="hsc-escape-link" type="button" onclick="App.navigate('appointments', {action: 'add'})">
        <span class="material-symbols-rounded">add</span>
        Add visit
      </button>
    `;
  },

  /* ---------- Styling / fallback ---------- */


  renderErrorFallback() {
    return `
      <div class="hsc-root fade-in">
        <div class="hsc-empty">Couldn't load today's plan. Pull to refresh or check Settings → Data.</div>
      </div>
    `;
  },

  injectStylesOnce() {
    if (document.getElementById(this.STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = this.STYLE_ID;
    style.textContent = `
      .hsc-root {
        padding: var(--space-md);
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
      }

      .hsc-escape-link {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: none;
        border: none;
        padding: 4px 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-tertiary);
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .hsc-escape-link .material-symbols-rounded { font-size: 16px; }

      .hsc-empty {
        padding: var(--space-lg);
        text-align: center;
        color: var(--text-tertiary);
        background: var(--surface);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-lg);
      }

      /* Weekly calendar home screen */
      .hsc-weekly { gap: var(--space-sm); }
      .hsc-week-toprow {
        display: flex;
        justify-content: flex-end;
      }
      .hsc-week-icon-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid var(--border-light);
        background: var(--surface);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .hsc-followup-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        background: var(--warning-light, #fff3e0);
        border: 1px solid var(--warning, #b06000);
        color: var(--warning, #b06000);
        border-radius: var(--radius-md);
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .hsc-week-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-sm);
      }
      .hsc-week-nav {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid var(--border-light);
        background: var(--surface);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
      }
      .hsc-week-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--text-primary);
        text-align: center;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .hsc-week-today-hint {
        font-size: 11px;
        font-weight: 400;
        color: var(--text-tertiary);
      }
      .hsc-week-strip {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
      }
      .hsc-week-day {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 0;
        border-radius: var(--radius-md);
        border: none;
        background: transparent;
        cursor: pointer;
        position: relative;
      }
      .hsc-week-day.active { background: var(--text-primary); }
      .hsc-week-day-name {
        font-size: 11px;
        color: var(--text-tertiary);
      }
      .hsc-week-day.active .hsc-week-day-name { color: var(--surface); opacity: 0.7; }
      .hsc-week-day-num {
        font-size: 15px;
        font-weight: 700;
        color: var(--text-primary);
      }
      .hsc-week-day.active .hsc-week-day-num { color: var(--surface); }
      .hsc-week-day-dot {
        position: absolute;
        bottom: 2px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--warning);
      }
      .hsc-upnext-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--surface);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        padding: 10px 14px;
        font-size: 13px;
      }
      .hsc-upnext-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .hsc-upnext-label { font-weight: 700; }
      .hsc-upnext-name { color: var(--text-primary); font-weight: 700; margin-left: auto; }
      .hsc-upnext-time { color: var(--text-tertiary); }
      .hsc-week-group-label {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-tertiary);
        margin: var(--space-sm) 0 6px;
      }
      .hsc-week-row {
        background: var(--surface);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        margin-bottom: 8px;
        overflow: hidden;
      }
      .hsc-week-row.done { opacity: 0.55; }
      .hsc-week-row-main {
        display: block;
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        padding: 12px 14px;
        cursor: pointer;
        font-family: var(--font-body);
      }
      .hsc-week-row-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .hsc-week-row-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
      .hsc-week-row-time { font-size: 13px; font-weight: 700; color: var(--text-primary); flex-shrink: 0; }
      .hsc-week-row-address { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
      .hsc-week-row-travel {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--text-tertiary);
        margin-top: 6px;
      }
      .hsc-week-row-travel .material-symbols-rounded { font-size: 14px; }
      .hsc-week-row-actions {
        display: flex;
        gap: 8px;
        padding: 0 14px 12px;
      }
      .hsc-week-row-actions .btn { flex: 1; }

      .hsc-appt-row {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        width: 100%;
        background: var(--surface-elevated);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        padding: var(--space-sm) var(--space-md);
        text-align: left;
        cursor: pointer;
        font-family: var(--font-body);
      }
      .hsc-appt-details { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .hsc-appt-name { font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hsc-appt-address { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hsc-appt-chevron { color: var(--text-tertiary); }

      .hsc-stat-row { display: flex; gap: var(--space-sm); }
      .hsc-stat {
        flex: 1;
        background: var(--surface);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        padding: var(--space-md);
        text-align: center;
      }
      .hsc-stat-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
      .hsc-stat-label { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
    `;
    document.head.appendChild(style);
  }
};
