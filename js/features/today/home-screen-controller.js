/* ============================================
   ADVISOROS — HOME SCREEN LAYOUT CONTROLLER
   State-machine driven Today screen: Morning Blueprint →
   Mid-Day Dashboard → Evening Closeout → Tomorrow Preview.

   INTEGRATION: this is a classic global script, same as every other file
   in js/core and js/features — no <script type="module"> needed, just add
   it to index.html alongside today.js:

     <script src="js/features/today/home-screen-controller.js?v=1"></script>

   Then call HomeScreenController.renderDynamicHomeScreen('containerId')
   from wherever you want it shown (e.g. in place of TodayFeature.render()).
   Swapping it in as the actual Today screen is still a product decision
   left to you — this file makes it available, it doesn't self-install.

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

   Appointments completed before this change won't have completedAt —
   getCompletionTimestamp() below falls back to a settings-store marker for
   those so State 3 → 4 timing doesn't break on old data.
   ============================================ */

const HomeScreenController = {
  MORNING_START_HOUR: 7,
  CLOSEOUT_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  LEGACY_MARKER_KEY: 'hsc_last_completion', // fallback only, see header note
  POLL_MS: 60 * 1000,
  STYLE_ID: 'hsc-styles',

  _timer: null,
  _lastStateName: null,
  _sheetOpen: false,

  async renderDynamicHomeScreen(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`[HomeScreenController] container #${containerId} not found`);
      return;
    }

    this.injectStylesOnce();

    // The escape hatch (see renderEscapeHatchLink / showFullDaySheet) pins
    // whatever was on screen when the person opened it. Swapping the layout
    // underneath that open sheet would defeat the point — they'd close it
    // and land somewhere they didn't choose. Skip this poll's render and
    // just reschedule; the next poll after the sheet closes will pick up
    // wherever things actually are.
    if (this._sheetOpen) {
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(() => this.renderDynamicHomeScreen(containerId), this.POLL_MS);
      return;
    }

    try {
      const { html, stateName } = await this.buildHomeScreenHtml(containerId);

      // On the very first render, or a manual re-render caused by the same
      // state (e.g. the 60s poll firing with nothing changed), just swap
      // silently — that's normal. But if the state itself has changed since
      // the LAST render (e.g. the last job flips to completed while the
      // person is mid-scroll on the Mid-Day dashboard), the whole screen
      // layout is about to change under them. A silent DOM swap at that
      // moment reads as the app hijacking the screen; a toast at least
      // announces what happened and why the layout just moved.
      if (this._lastStateName && this._lastStateName !== stateName) {
        this.announceTransition(this._lastStateName, stateName);
      }
      this._lastStateName = stateName;

      container.innerHTML = html;
    } catch (e) {
      console.error('[HomeScreenController] render failed:', e);
      container.innerHTML = this.renderErrorFallback();
    }

    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.renderDynamicHomeScreen(containerId), this.POLL_MS);
  },

  // Human-readable heads-up for an automatic layout change. This is a
  // minimal fix, not a full solution — a proper "escape hatch" (e.g. a
  // small "see full day" link that pins the previous view) is a further
  // product decision worth making before this ships, not something to
  // silently bolt on here.
  announceTransition(fromState, toState) {
    const messages = {
      'morning-blueprint→mid-day': "You're on the move — switching to drive mode",
      'mid-day→evening-closeout': 'Day complete — nice work',
      'evening-closeout→tomorrow-preview': "Here's tomorrow",
      'mid-day→evening-closeout-shell': 'Day complete',
    };
    const key = `${fromState}→${toState}`;
    const message = messages[key] || 'Home screen updated';
    if (typeof Toast !== 'undefined' && Toast.show) {
      Toast.show(message, 'info');
    }
  },

  stopDynamicHomeScreen() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },

  /* ---------- Escape hatch ----------
     A small, always-available way out of whatever state the clock/DB just
     decided to show. Opens a static list of the whole day — it does NOT
     auto-transition while open, so the person can check "am I actually
     done?" or "what's after this one?" without the layout changing under
     them mid-read. */
  renderEscapeHatchLink() {
    return `
      <button class="hsc-escape-link" type="button" onclick="HomeScreenController.showFullDaySheet()">
        See full day
        <span class="material-symbols-rounded">chevron_right</span>
      </button>
    `;
  },

  async startDay(address, appointmentId, containerId) {
    try {
      await AppointmentsFeature.navigateToVisit(address, appointmentId);
    } catch (e) {
      console.log('Start Day - navigation/trip start failed:', e);
    }
    // Don't wait for the next 60s poll - the whole point of tapping Start
    // Day is that the screen should flip straight into Van Mode right now.
    this.renderDynamicHomeScreen(containerId);
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

  async showFullDaySheet() {
    this._sheetOpen = true;

    const today = Utils.getToday();
    let todayAppts = [];
    try {
      todayAppts = (await DB.getAppointmentsForDate(today.toISOString()))
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
      console.log('[HomeScreenController] full-day sheet load failed:', e);
    }

    const rowsHtml = todayAppts.length
      ? todayAppts.map(a => this.renderFullDayRow(a)).join('')
      : `<div class="hsc-empty">Nothing booked today.</div>`;

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>${Utils.escapeHtml(Utils.formatDate(today, 'long'))}</h3>
        <button class="btn btn-ghost btn-sm" type="button" onclick="HomeScreenController.closeFullDaySheet()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body hsc-fullday-body">
        ${rowsHtml}
      </div>
    `;

    App.openModal(content, {
      onOpen: () => {
        // If the person dismisses by tapping the overlay/back button rather
        // than the close button, make sure the poll gets un-paused either
        // way — watch for the overlay losing 'active'.
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;
        const observer = new MutationObserver(() => {
          if (!overlay.classList.contains('active')) {
            this._sheetOpen = false;
            observer.disconnect();
          }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
      }
    });
  },

  closeFullDaySheet() {
    this._sheetOpen = false;
    App.closeModal();
  },

  renderFullDayRow(a) {
    const statusMeta = {
      completed: { label: 'Done', className: 'hsc-fullday-status-done' },
      confirmed: { label: a.travelStatus === 'on_site' ? 'On site' : a.travelStatus === 'in_transit' ? 'On the way' : 'Upcoming', className: 'hsc-fullday-status-pending' }
    };
    const meta = statusMeta[a.status] || { label: a.status || '', className: '' };

    return `
      <button class="hsc-fullday-row" type="button" onclick="HomeScreenController.closeFullDaySheet(); App.navigate('appointments', {id: '${a.id}'});">
        <span class="hsc-appt-time">${Utils.escapeHtml(Utils.formatTime(a.date))}</span>
        <span class="hsc-appt-details">
          <span class="hsc-appt-name">${Utils.escapeHtml(a.clientName || 'Customer')}</span>
          <span class="hsc-appt-address">${Utils.escapeHtml(a.address || 'No address set')}</span>
        </span>
        <span class="hsc-fullday-status ${meta.className}">${Utils.escapeHtml(meta.label)}</span>
      </button>
    `;
  },

  /* ---------- State resolution ---------- */

  async buildHomeScreenHtml(containerId) {
    const today = Utils.getToday();

    let todayAppts = [];
    try {
      todayAppts = (await DB.getAppointmentsForDate(today.toISOString()))
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
      console.log('[HomeScreenController] appointment load failed:', e);
    }

    if (todayAppts.length === 0) {
      const emptyDayContext = await this.buildEmptyDayContext();
      const focus = await this.buildTodaysFocus([], new Date());
      return { html: this.renderMorningBlueprint([], new Date(), emptyDayContext, null, null, containerId, focus), stateName: 'morning-blueprint' };
    }

    const now = new Date();
    const completedCount = todayAppts.filter(a => a.status === 'completed').length;
    const allCompleted = completedCount === todayAppts.length;
    // "pending" per spec = nothing started: still 'confirmed' and no travel
    // has begun on it yet.
    const allPending = todayAppts.every(a => a.status === 'confirmed' && !a.travelStatus);

    if (allCompleted) {
      const completedAt = await this.getCompletionTimestamp(todayAppts, today);
      const msSinceDone = Date.now() - completedAt;
      if (msSinceDone <= this.CLOSEOUT_WINDOW_MS) {
        return { html: await this.renderEveningCloseout(todayAppts), stateName: 'evening-closeout' };
      }
      return { html: await this.renderTomorrowPreview(), stateName: 'tomorrow-preview' };
    }

    if (allPending) {
      const morningStats = await this.buildMorningStats(todayAppts);
      const dayMode = RouteFeature.getDayMode(now);
      const checklistData = await this.getPrepChecklistData(dayMode);
      const focus = await this.buildTodaysFocus(todayAppts, now);
      return { html: this.renderMorningBlueprint(todayAppts, now, null, morningStats, checklistData, containerId, focus), stateName: 'morning-blueprint' };
    }

    return { html: this.renderMidDayDashboard(todayAppts, completedCount), stateName: 'mid-day' };
  },

  // Real numbers for the "at a glance" row - deliberately does NOT include an
  // estimated-value figure like the Project Compass mockup did. Appointments
  // only get a `value` once an outcome is logged after the visit, so any
  // "est. value" shown before the day starts would have to be invented from
  // nothing - the same kind of overclaim we stripped out of the manifesto.
  // Jobs, miles and booked on-site time are all real, already-known numbers.
  async buildMorningStats(todayAppts) {
    let base = null;
    try { base = await RouteFeature.getBasePoint(); } catch (e) {}
    // Uses whatever coordinates are already cached - deliberately does NOT
    // trigger live geocoding here, since this renders on every home-screen
    // poll (every 60s) and a network round-trip per stop would make the
    // dashboard feel slow for a number that's only ever an estimate anyway.
    const sorted = RouteFeature.sortByTime(todayAppts);
    const distanceKm = RouteFeature.calculateDayLoopDistance(sorted, base);
    const totalMinutes = todayAppts.reduce((sum, a) => sum + ((a.durationSlots || 0) * (CONFIG.slotMinutes || 15)), 0);
    return {
      jobs: todayAppts.length,
      distanceKm,
      totalMinutes,
      hasCoords: sorted.some(a => Array.isArray(a.latLng) && a.latLng.length === 2)
    };
  },

  // Real completedAt (per-appointment, added in appointments.js saveOutcome)
  // is authoritative. Falls back to a settings-store marker only for
  // appointments completed before that field existed.
  async getCompletionTimestamp(todayAppts, today) {
    const withTimestamps = todayAppts
      .filter(a => a.status === 'completed' && a.completedAt)
      .map(a => a.completedAt);

    if (withTimestamps.length === todayAppts.length) {
      return Math.max(...withTimestamps);
    }

    const todayIso = Utils.formatDate(today, 'iso');
    let marker = await DB.getSetting(this.LEGACY_MARKER_KEY, null);
    if (marker && marker.date !== todayIso) marker = null;

    if (!marker) {
      marker = { date: todayIso, ts: Date.now() };
      try { await DB.setSetting(this.LEGACY_MARKER_KEY, marker); } catch (e) { /* non-fatal */ }
    }
    return withTimestamps.length
      ? Math.max(...withTimestamps, marker.ts)
      : marker.ts;
  },

  // A day with nothing booked isn't nothing to say — it's just today. This
  // pulls what's actually next on the books, plus how the week's going so
  // far, so the empty state has somewhere to look instead of a dead end.
  async buildEmptyDayContext() {
    let upcoming = [];
    try {
      upcoming = (await DB.getUpcomingAppointments(14))
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 3);
    } catch (e) {
      console.log('[HomeScreenController] upcoming load failed:', e);
    }

    let weekSales = 0;
    let weekCompleted = 0;
    try {
      if (typeof TodayFeature !== 'undefined' && TodayFeature.getWeekSales) {
        weekSales = await TodayFeature.getWeekSales();
      }
      const start = Utils.getStartOfWeek();
      const end = Utils.getEndOfWeek();
      const weekAppts = await DB.getAppointmentsForRange(start.toISOString(), end.toISOString());
      weekCompleted = weekAppts.filter(a => a.status === 'completed').length;
    } catch (e) {
      console.log('[HomeScreenController] week snapshot load failed:', e);
    }

    return { upcoming, weekSales, weekTarget: CONFIG.weeklyTarget || 0, weekCompleted };
  },

  // "Tomorrow" reads faster than "Wed 15 July" at a glance; anything further
  // out gets the full weekday + date since "in 4 days" isn't how people
  // actually think about a calendar.
  relativeDayLabel(date) {
    const target = new Date(date);
    const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Utils.daysBetween(startOfTarget, Utils.getToday());

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return target.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  },

  /* ---------- State 1: Morning Blueprint ---------- */

  renderMorningBlueprint(appts, now, emptyDayContext = null, stats = null, checklistData = null, containerId = 'hsc-today-root', focus = null) {
    const hasAppts = appts.length > 0;
    // The first appointment gets its own prominent "Next Up" card below, so
    // it's excluded from the timeline here - otherwise the same customer
    // would appear twice on one screen (once in Next Up, once again at the
    // top of the timeline). On a day with only one appointment, that leaves
    // nothing for the timeline to show - which is fine, it's not an empty
    // day, there's just nothing left to list below Next Up.
    const timelineAppts = appts.slice(1);
    const windows = this.groupIntoThreeHourWindows(timelineAppts);
    const dateLabel = Utils.formatDate(now, 'long');
    const greeting = this.getGreeting(now);
    const advisorName = (CONFIG.advisorName || '').trim();

    // Only fall back to the "nothing booked" empty-state treatment when
    // today genuinely has no appointments at all - not just when the
    // post-Next-Up remainder happens to be empty.
    const windowsHtml = !hasAppts
      ? this.renderEmptyDayBlock(emptyDayContext)
      : windows.map(w => `
          <div class="hsc-window-block">
            <div class="hsc-window-label">${Utils.escapeHtml(w.label)}</div>
            ${w.subSlots.map(s => `
              <div class="hsc-subslot-group">
                <div class="hsc-subslot-label">${Utils.escapeHtml(s.label)}</div>
                ${s.appts.map(a => this.renderApptRow(a)).join('')}
              </div>
            `).join('')}
          </div>
        `).join('');

    // Nothing booked today means there's nothing to route to — launching
    // the optimizer here would just land on its own "no stops" message.
    const firstAppt = appts[0];
    const launchButtonHtml = hasAppts
      ? `
        ${firstAppt?.address ? `
          <button class="btn btn-primary btn-block btn-lg hsc-launch-btn"
                  type="button"
                  onclick="HomeScreenController.startDay('${Utils.escapeJsString(firstAppt.address)}', ${firstAppt.id}, '${containerId}')">
            <span class="material-symbols-rounded">play_arrow</span>
            Start Day
          </button>
        ` : ''}
        <button class="btn btn-outline btn-block" type="button" onclick="App.navigate('route')">
          <span class="material-symbols-rounded">route</span>
          Review Today's Route
        </button>
      `
      : '';

    return `
      <div class="hsc-root fade-in">
        <div class="hsc-greeting">${Utils.escapeHtml(greeting)}${advisorName ? `, ${Utils.escapeHtml(advisorName)}` : ''}</div>
        ${this.renderTodaysFocus(focus)}
        ${hasAppts ? `
          ${this.renderNextUpCard(appts[0])}
          ${this.renderAtAGlance(stats)}
          ${this.renderPrepChecklist(checklistData, containerId)}
        ` : ''}

        <div class="hsc-header hsc-header-row">
          <div>
            <div class="hsc-eyebrow">Morning Blueprint</div>
            <div class="hsc-date">${Utils.escapeHtml(dateLabel)}</div>
          </div>
          ${hasAppts ? this.renderAddVisitLink() : ''}
        </div>

        ${windowsHtml}

        ${launchButtonHtml}
      </div>
    `;
  },

  CHECKLIST_ITEMS_KEY: 'prep_checklist_items',
  CHECKLIST_STATE_KEY: 'prep_checklist_state',

  // Seeded once, on first use, then fully editable from then on - these are a
  // reasonable starting point for a window coverings advisor, not a claim
  // that this is *the* correct list. Tagged by day mode so a sales day and a
  // fitting day don't show the same checklist, matching the real Mon/Tue/Thu
  // (sales) vs Wed/Fri (fitting) split.
  DEFAULT_CHECKLIST_ITEMS: [
    { id: 'sample_books', label: 'Sample books', dayModes: ['sales'] },
    { id: 'measuring_tape', label: 'Measuring tape', dayModes: ['sales', 'fitting'] },
    { id: 'laser_measure', label: 'Laser measure', dayModes: ['sales'] },
    { id: 'notebook_pen', label: 'Notebook & pen', dayModes: ['sales', 'fitting'] },
    { id: 'bracket_pack', label: 'Bracket pack', dayModes: ['fitting'] },
    { id: 'screws_plugs', label: 'Screws & wall plugs', dayModes: ['fitting'] },
    { id: 'drill_bits', label: 'Drill & bits', dayModes: ['fitting'] },
    { id: 'step_ladder', label: 'Step ladder', dayModes: ['fitting'] },
    { id: 'vehicle_stocked', label: 'Vehicle stocked', dayModes: ['sales', 'fitting'] }
  ],

  async getPrepChecklistData(dayMode) {
    let items = null;
    try { items = await DB.getSetting(this.CHECKLIST_ITEMS_KEY, null); } catch (e) {}
    if (!items) {
      items = this.DEFAULT_CHECKLIST_ITEMS;
      try { await DB.setSetting(this.CHECKLIST_ITEMS_KEY, items); } catch (e) {}
    }

    const todayKey = Utils.formatDate(new Date(), 'iso');
    let state = null;
    try { state = await DB.getSetting(this.CHECKLIST_STATE_KEY, null); } catch (e) {}
    // A stale date means a new day has started - treat as nothing checked
    // yet, rather than carrying yesterday's ticks forward.
    const checkedIds = (state && state.date === todayKey) ? (state.checkedIds || []) : [];

    const relevant = items.filter(i => !i.dayModes || i.dayModes.includes(dayMode) || dayMode === 'mixed');
    return { items: relevant, checkedIds, todayKey };
  },

  async toggleChecklistItem(itemId, containerId) {
    const todayKey = Utils.formatDate(new Date(), 'iso');
    let state = null;
    try { state = await DB.getSetting(this.CHECKLIST_STATE_KEY, null); } catch (e) {}
    const checkedIds = (state && state.date === todayKey) ? [...(state.checkedIds || [])] : [];
    const idx = checkedIds.indexOf(itemId);
    if (idx >= 0) checkedIds.splice(idx, 1); else checkedIds.push(itemId);
    try { await DB.setSetting(this.CHECKLIST_STATE_KEY, { date: todayKey, checkedIds }); } catch (e) {}
    this.renderDynamicHomeScreen(containerId);
  },

  async addChecklistItem(inputId, containerId) {
    const input = document.getElementById(inputId);
    const label = (input?.value || '').trim();
    if (!label) return;
    let items = await DB.getSetting(this.CHECKLIST_ITEMS_KEY, this.DEFAULT_CHECKLIST_ITEMS);
    items = [...items, { id: `custom_${Date.now()}`, label, dayModes: null }];
    await DB.setSetting(this.CHECKLIST_ITEMS_KEY, items);
    this.renderDynamicHomeScreen(containerId);
  },

  async removeChecklistItem(itemId, containerId) {
    let items = await DB.getSetting(this.CHECKLIST_ITEMS_KEY, this.DEFAULT_CHECKLIST_ITEMS);
    items = items.filter(i => i.id !== itemId);
    await DB.setSetting(this.CHECKLIST_ITEMS_KEY, items);
    this.renderDynamicHomeScreen(containerId);
  },

  renderPrepChecklist(checklistData, containerId) {
    if (!checklistData || checklistData.items.length === 0) return '';
    const { items, checkedIds } = checklistData;
    const doneCount = items.filter(i => checkedIds.includes(i.id)).length;
    return `
      <div class="hsc-checklist-card">
        <div class="hsc-checklist-header">
          <span>Today's checklist</span>
          <span class="hsc-checklist-count">${doneCount}/${items.length}</span>
        </div>
        ${items.map(item => {
          const checked = checkedIds.includes(item.id);
          return `
            <div class="hsc-checklist-row">
              <button type="button" class="hsc-checklist-item ${checked ? 'hsc-checklist-item-checked' : ''}"
                      onclick="HomeScreenController.toggleChecklistItem('${item.id}', '${containerId}')">
                <span class="material-symbols-rounded hsc-checklist-icon">${checked ? 'check_box' : 'check_box_outline_blank'}</span>
                <span>${Utils.escapeHtml(item.label)}</span>
              </button>
              ${item.id.startsWith('custom_') ? `
                <button type="button" class="hsc-checklist-remove" onclick="HomeScreenController.removeChecklistItem('${item.id}', '${containerId}')">
                  <span class="material-symbols-rounded" style="font-size: 16px;">close</span>
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
        <div class="hsc-checklist-add-row">
          <input type="text" id="hsc-checklist-input" class="hsc-checklist-input" placeholder="Add item..."
                 onkeydown="if(event.key==='Enter'){HomeScreenController.addChecklistItem('hsc-checklist-input','${containerId}')}">
          <button type="button" class="btn btn-sm btn-ghost" onclick="HomeScreenController.addChecklistItem('hsc-checklist-input', '${containerId}')">
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>
      </div>
    `;
  },


  async buildTodaysFocus(appts, now) {
    let followUpCount = 0;
    try { followUpCount = await TalkFeature.getDueFollowUpCount(); } catch (e) {}

    if (followUpCount > 0) {
      return {
        type: 'followups',
        text: `You have ${followUpCount} follow-up${followUpCount === 1 ? '' : 's'} waiting`
      };
    }

    // Only worth a timing check if there's a next visit with a real address
    // and we've got coordinates to estimate travel from - otherwise this
    // would just be guessing.
    const nextAppt = appts[0];
    if (nextAppt) {
      try {
        const base = await RouteFeature.getBasePoint();
        const legs = RouteFeature.buildRouteLegs([nextAppt], base);
        const leg = legs[0];
        if (leg && leg.distanceKm > 0) {
          const minutesUntil = (new Date(nextAppt.date) - now) / 60000;
          const prepBufferMin = 10;
          if (minutesUntil > 0 && (leg.etaMin + prepBufferMin) > minutesUntil) {
            return {
              type: 'timing',
              text: `Tight for ${nextAppt.clientName || 'your next visit'} - about ${leg.etaMin} min drive, ${Math.round(minutesUntil)} min left`
            };
          }
        }
      } catch (e) {}
    }

    // Nothing genuinely actionable - stay quiet rather than manufacture a
    // reassuring "you're on track" message with no real baseline behind it.
    return null;
  },

  renderTodaysFocus(focus) {
    if (!focus) return '';
    const icon = focus.type === 'followups' ? 'campaign' : 'schedule';
    const onclick = focus.type === 'followups' ? `onclick="App.navigate('appointments', {tab: 'pipeline'})"` : '';
    return `
      <div class="hsc-focus-chip hsc-focus-${focus.type}" ${onclick}>
        <span class="material-symbols-rounded">${icon}</span>
        <span>${Utils.escapeHtml(focus.text)}</span>
      </div>
    `;
  },


  getGreeting(now) {
    const hour = now.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  },

  // Deliberately only 3 stats, not 4 - see buildMorningStats() for why an
  // "est. value" figure isn't shown here.
  renderAtAGlance(stats) {
    if (!stats) return '';
    const hours = Math.floor(stats.totalMinutes / 60);
    const mins = stats.totalMinutes % 60;
    const timeLabel = stats.totalMinutes > 0 ? `${hours > 0 ? `${hours}h ` : ''}${mins}m` : '—';
    const milesLabel = stats.hasCoords ? Utils.formatDistance(stats.distanceKm) : '—';
    return `
      <div class="hsc-stat-row hsc-glance-row">
        <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View today's visits" onclick="App.navigate('appointments')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('appointments');}">
          <div class="hsc-stat-value">${stats.jobs}</div>
          <div class="hsc-stat-label">Jobs</div>
        </div>
        <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View today's route" onclick="App.navigate('route')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('route');}">
          <div class="hsc-stat-value">${milesLabel}</div>
          <div class="hsc-stat-label">Est. driving</div>
        </div>
        <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View today's visits" onclick="App.navigate('appointments')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('appointments');}">
          <div class="hsc-stat-value">${timeLabel}</div>
          <div class="hsc-stat-label">Booked on site</div>
        </div>
      </div>
    `;
  },

  renderNextUpCard(nextAppt) {
    if (!nextAppt) return '';
    return `
      <div class="hsc-nextup-card">
        <div class="hsc-nextup-label">Next up</div>
        ${this.renderApptRow(nextAppt)}
      </div>
    `;
  },

  renderEmptyDayBlock(context) {
    const ctx = context || { upcoming: [], weekSales: 0, weekTarget: 0, weekCompleted: 0 };

    const comingUpHtml = ctx.upcoming.length
      ? `
        <div class="hsc-window-block">
          <div class="hsc-window-label">Coming up</div>
          ${ctx.upcoming.map(a => this.renderUpcomingRow(a)).join('')}
        </div>
      `
      : `
        <button class="btn btn-outline btn-block" type="button" onclick="App.navigate('appointments', {action: 'add'})">
          <span class="material-symbols-rounded">add</span>
          Add a visit
        </button>
      `;

    return `
      <div class="hsc-empty">No visits booked yet today.</div>

      ${comingUpHtml}

      <div class="hsc-stat-row">
        <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View this week's visits" onclick="App.navigate('appointments', {tab: 'upcoming'})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('appointments', {tab: 'upcoming'});}">
          <div class="hsc-stat-value">${ctx.weekCompleted}</div>
          <div class="hsc-stat-label">Visits this week</div>
        </div>
        <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View money and sales target" onclick="App.navigate('money')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('money');}">
          <div class="hsc-stat-value">${Utils.formatCurrency(ctx.weekSales)}</div>
          <div class="hsc-stat-label">of ${Utils.formatCurrency(ctx.weekTarget)} target</div>
        </div>
      </div>
    `;
  },

  renderUpcomingRow(a) {
    const dayLabel = this.relativeDayLabel(a.date);
    const time = Utils.formatTime(a.date);
    const name = Utils.escapeHtml(a.clientName || 'Customer');
    const address = Utils.escapeHtml(a.address || 'No address set');
    return `
      <button class="hsc-appt-row" type="button" onclick="App.navigate('appointments', {id: '${a.id}'})">
        <span class="hsc-appt-time">${Utils.escapeHtml(time)}</span>
        <span class="hsc-appt-details">
          <span class="hsc-appt-daylabel">${Utils.escapeHtml(dayLabel)}</span>
          <span class="hsc-appt-name">${name}</span>
          <span class="hsc-appt-address">${address}</span>
        </span>
        <span class="material-symbols-rounded hsc-appt-chevron">chevron_right</span>
      </button>
    `;
  },

  renderApptRow(a) {
    const time = Utils.formatTime(a.date);
    const name = Utils.escapeHtml(a.clientName || 'Customer');
    const address = Utils.escapeHtml(a.address || 'No address set');
    const typeConfig = CONFIG.appointmentTypes.find(t => t.id === a.type) || { name: a.type || 'Visit', badgeClass: 'badge-primary' };
    return `
      <button class="hsc-appt-row" type="button" onclick="App.navigate('appointments', {id: '${a.id}'})">
        <span class="hsc-appt-time">${Utils.escapeHtml(time)}</span>
        <span class="hsc-appt-details">
          <span class="hsc-appt-title-row">
            <span class="hsc-appt-name">${name}</span>
            <span class="badge ${typeConfig.badgeClass || 'badge-primary'} hsc-appt-badge">${Utils.escapeHtml(typeConfig.name)}</span>
          </span>
          <span class="hsc-appt-address">${address}</span>
        </span>
        <span class="material-symbols-rounded hsc-appt-chevron">chevron_right</span>
      </button>
    `;
  },

  // Real time-window blocks are the 09-12 / 12-15 / 15-18 / 18-21 slots used
  // elsewhere in the app; sub-slots here are grouped by hour rather than the
  // app's real 15-min granularity, per the "1-hour sub-slots" spec.
  groupIntoThreeHourWindows(appts) {
    const WINDOWS = [
      { start: 9, end: 12, label: '09:00 – 12:00' },
      { start: 12, end: 15, label: '12:00 – 15:00' },
      { start: 15, end: 18, label: '15:00 – 18:00' },
      { start: 18, end: 21, label: '18:00 – 21:00' }
    ];

    return WINDOWS.map(w => {
      const inWindow = appts.filter(a => {
        const h = new Date(a.date).getHours();
        return h >= w.start && h < w.end;
      });
      if (inWindow.length === 0) return null;

      const byHour = new Map();
      inWindow.forEach(a => {
        const h = new Date(a.date).getHours();
        if (!byHour.has(h)) byHour.set(h, []);
        byHour.get(h).push(a);
      });

      const subSlots = Array.from(byHour.keys()).sort((a, b) => a - b).map(h => ({
        label: `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`,
        appts: byHour.get(h)
      }));

      return { label: w.label, subSlots };
    }).filter(Boolean);
  },

  /* ---------- State 2: Mid-Day Dashboard (van mount) ---------- */

  renderMidDayDashboard(appts, completedCount) {
    const total = appts.length;
    const active = appts.find(a => a.status !== 'completed') || null;
    const callNumber = Math.min(completedCount + 1, total);
    const progressBar = this.buildProgressBar(completedCount, total);

    if (!active) {
      return this.renderEveningCloseoutShell();
    }

    const isOnSite = active.travelStatus === 'on_site';
    const isInTransit = active.travelStatus === 'in_transit';
    const name = Utils.escapeHtml(active.clientName || 'Customer');
    const address = Utils.escapeHtml(active.address || '');
    const time = Utils.escapeHtml(Utils.formatTime(active.date));
    const smsMessage = `Hi ${active.clientName || ''}, on my way to you now — see you around ${Utils.formatTime(active.date)}.`.trim();
    const statusLabel = isOnSite ? 'On site' : isInTransit ? 'On the way' : 'Up next';

    // On-site means driving there makes no sense — swap the nav button for
    // a direct link into the outcome/completion flow instead. Only possible
    // now that travelStatus is a real, stamped field rather than inferred.
    const primaryActionHtml = isOnSite
      ? `
        <button class="btn btn-primary btn-block btn-lg hsc-vanmode-nav-btn"
                type="button"
                onclick="App.navigate('appointments', {id: '${active.id}'})">
          <span class="material-symbols-rounded">task_alt</span>
          Log outcome
        </button>
      `
      : `
        <button class="btn btn-primary btn-block btn-lg hsc-vanmode-nav-btn"
                type="button"
                onclick="TodayFeature.confirmStartRoute('${Utils.escapeJsString(active.address || '')}', ${active.id}, '', '${Utils.escapeJsString(active.clientName || 'Customer')}')">
          <span class="material-symbols-rounded">navigation</span>
          Navigate
        </button>
      `;

    return `
      <div class="hsc-root hsc-vanmode inset-dark fade-in">
        <div class="hsc-vanmode-progress">
          <span class="hsc-vanmode-progress-text">${progressBar} Call ${callNumber} of ${total} · ${statusLabel}</span>
          ${this.renderEscapeHatchLink()}
        </div>

        <div class="hsc-vanmode-card">
          <div class="hsc-vanmode-time">${time}</div>
          <div class="hsc-vanmode-name">${name}</div>
          <div class="hsc-vanmode-address">${address || 'No address set'}</div>
        </div>

        ${primaryActionHtml}

        <button class="btn btn-outline btn-block hsc-vanmode-sms-btn"
                type="button"
                onclick="NotificationService.sendSMS('${Utils.escapeJsString(active.phone || '')}', '${Utils.escapeJsString(smsMessage)}')"
                ${active.phone ? '' : 'disabled'}>
          <span class="material-symbols-rounded">sms</span>
          Text ${name.split(' ')[0] || 'client'} I'm on my way
        </button>

        <div style="text-align: center;">
          ${this.renderAddVisitLink()}
        </div>
      </div>
    `;
  },

  buildProgressBar(done, total, width = 10) {
    const filled = total > 0 ? Math.round((done / total) * width) : 0;
    return '[' + '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled)) + ']';
  },

  /* ---------- State 3: Evening Closeout ---------- */

  async renderEveningCloseout(appts) {
    const today = Utils.getToday();
    const dayStartIso = new Date(new Date(today).setHours(0, 0, 0, 0)).toISOString();
    const dayEndIso = new Date(new Date(today).setHours(23, 59, 59, 999)).toISOString();

    let trips = [];
    try {
      trips = await DB.getTripsForPeriod(dayStartIso, dayEndIso);
    } catch (e) {
      console.log('[HomeScreenController] trips load failed:', e);
    }

    const totalKm = trips.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
    const totalMiles = totalKm * 0.621371;
    const distanceLabel = CONFIG.distanceUnit === 'miles'
      ? `${totalMiles.toFixed(1)} mi`
      : `${totalKm.toFixed(1)} km`;
    const taxShield = TaxCalculator.calculateMileageClaim(totalKm);
    const completedCount = appts.filter(a => a.status === 'completed').length;

    return `
      <div class="hsc-root fade-in">
        <div class="hsc-header hsc-header-row">
          <div>
            <div class="hsc-eyebrow">Day complete</div>
            <div class="hsc-date">Nice work.</div>
          </div>
          ${this.renderEscapeHatchLink()}
        </div>

        <div class="hsc-win-card">
          <div class="hsc-win-label">HMRC mileage tax shield today</div>
          <div class="hsc-win-value">${Utils.formatCurrency(taxShield)}</div>
          <div class="hsc-win-sub">${distanceLabel} tracked at ${Utils.formatCurrency(CONFIG.mileageRate)}/mile</div>
        </div>

        <div class="hsc-stat-row">
          <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View today's visits" onclick="App.navigate('appointments')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('appointments');}">
            <div class="hsc-stat-value">${completedCount}</div>
            <div class="hsc-stat-label">Visits completed</div>
          </div>
          <div class="hsc-stat hsc-stat-clickable" role="button" tabindex="0" aria-label="View money and mileage" onclick="App.navigate('money')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('money');}">
            <div class="hsc-stat-value">${distanceLabel}</div>
            <div class="hsc-stat-label">Miles tracked</div>
          </div>
        </div>

        <button class="btn btn-primary btn-block btn-lg" type="button" onclick="App.navigate('ocr')">
          <span class="material-symbols-rounded">receipt_long</span>
          Scan today's receipts
        </button>

        <div style="text-align: center;">
          ${this.renderAddVisitLink()}
        </div>
      </div>
    `;
  },

  // Defensive fallback only — see renderMidDayDashboard.
  renderEveningCloseoutShell() {
    return `
      <div class="hsc-root fade-in">
        <div class="hsc-header hsc-header-row">
          <div>
            <div class="hsc-eyebrow">Day complete</div>
            <div class="hsc-date">All visits done.</div>
          </div>
          ${this.renderEscapeHatchLink()}
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="button" onclick="App.navigate('ocr')">
          <span class="material-symbols-rounded">receipt_long</span>
          Scan today's receipts
        </button>

        <div style="text-align: center;">
          ${this.renderAddVisitLink()}
        </div>
      </div>
    `;
  },

  /* ---------- State 4: Tomorrow's Strategic Preview ---------- */

  async renderTomorrowPreview() {
    const tomorrow = Utils.addDays(Utils.getToday(), 1);

    let tomorrowAppts = [];
    try {
      tomorrowAppts = (await DB.getAppointmentsForDate(tomorrow.toISOString()))
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
      console.log('[HomeScreenController] tomorrow load failed:', e);
    }

    const dateLabel = Utils.formatDate(tomorrow, 'long');

    if (tomorrowAppts.length === 0) {
      return `
        <div class="hsc-root fade-in">
          <div class="hsc-header">
            <div class="hsc-eyebrow">Tomorrow</div>
            <div class="hsc-date">${Utils.escapeHtml(dateLabel)}</div>
          </div>
          <div class="hsc-empty">Nothing booked yet — a clear start.</div>
          <button class="btn btn-outline btn-block" type="button" onclick="App.navigate('appointments', {action: 'add'})">
            Add a visit
          </button>
        </div>
      `;
    }

    const flags = this.flagSpatialConflicts(tomorrowAppts);

    return `
      <div class="hsc-root fade-in">
        <div class="hsc-header">
          <div class="hsc-eyebrow">Tomorrow</div>
          <div class="hsc-date">${Utils.escapeHtml(dateLabel)}</div>
        </div>

        ${flags.length ? `
          <div class="hsc-hint-banner">
            <span class="material-symbols-rounded">info</span>
            ${flags.length} ${flags.length === 1 ? 'stop looks' : 'stops look'} worth a second glance —
            addresses may be spread out rather than grouped. Rough guess from
            postcode text, not a real route check.
          </div>
        ` : ''}

        ${tomorrowAppts.map((a, i) => `
          <div class="hsc-appt-row hsc-appt-row-static ${flags.includes(i) ? 'hsc-appt-row-flagged' : ''}">
            <span class="hsc-appt-time">${Utils.escapeHtml(Utils.formatTime(a.date))}</span>
            <span class="hsc-appt-details">
              <span class="hsc-appt-name">${Utils.escapeHtml(a.clientName || 'Customer')}</span>
              <span class="hsc-appt-address">${Utils.escapeHtml(a.address || 'No address set')}</span>
            </span>
            ${flags.includes(i) ? '<span class="material-symbols-rounded hsc-appt-chevron" style="color:var(--info);">info</span>' : ''}
          </div>
        `).join('')}

        <button class="btn btn-outline btn-block" type="button" onclick="App.navigate('route', {date: '${Utils.formatDate(tomorrow, 'iso')}'})">
          Review tomorrow's route
        </button>
      </div>
    `;
  },

  // Best-effort, offline heuristic — no geocoding call is made here (that
  // would mean firing Nominatim requests proactively on every render, which
  // this module deliberately avoids). It flags a visit whose outward
  // postcode/area token repeats non-consecutively in the day, which usually
  // means the round is criss-crossing rather than sweeping one area at a
  // time. A real fix belongs in RouteFeature's actual optimizer, not here.
  flagSpatialConflicts(appts) {
    const areaOf = (addr) => {
      if (!addr) return null;
      const match = String(addr).match(/[A-Z]{1,2}[0-9][0-9A-Z]?/i);
      return match ? match[0].toUpperCase() : String(addr).split(',').pop().trim().toUpperCase();
    };

    const areas = appts.map(a => areaOf(a.address));
    const flagged = new Set();

    areas.forEach((area, i) => {
      if (!area) return;
      const nextSameIndex = areas.indexOf(area, i + 1);
      if (nextSameIndex === -1) return;
      const between = areas.slice(i + 1, nextSameIndex);
      if (between.some(b => b && b !== area)) {
        flagged.add(i);
        flagged.add(nextSameIndex);
      }
    });

    return Array.from(flagged).sort((a, b) => a - b);
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

      .hsc-header { display: flex; flex-direction: column; gap: 2px; }
      .hsc-header-row {
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-sm);
      }

      .hsc-greeting {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary);
      }

      .hsc-glance-row { gap: var(--space-sm); }
      .hsc-glance-row .hsc-stat {
        background: var(--surface);
        border-radius: var(--radius-sm);
        padding: var(--space-sm);
      }

      .hsc-nextup-card {
        background: var(--card-bg, var(--surface));
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        padding: var(--space-sm);
      }
      .hsc-focus-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .hsc-focus-chip .material-symbols-rounded { font-size: 18px; }
      .hsc-focus-followups { background: var(--primary-light); color: var(--primary); }
      .hsc-focus-timing { background: var(--warning-light); color: #b06000; cursor: default; }

      .hsc-checklist-card {
        background: var(--card-bg, var(--surface));
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        padding: var(--space-sm);
      }
      .hsc-checklist-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        font-weight: 700;
        color: var(--text-secondary);
        margin-bottom: 8px;
      }
      .hsc-checklist-count { font-weight: 400; color: var(--text-tertiary); }
      .hsc-checklist-row { display: flex; align-items: center; gap: 4px; }
      .hsc-checklist-item {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        background: none;
        border: none;
        padding: 7px 4px;
        text-align: left;
        font-size: 14px;
        color: var(--text-primary);
        cursor: pointer;
      }
      .hsc-checklist-item-checked { color: var(--text-tertiary); text-decoration: line-through; }
      .hsc-checklist-icon { font-size: 20px; color: var(--text-tertiary); flex-shrink: 0; }
      .hsc-checklist-item-checked .hsc-checklist-icon { color: var(--secondary); }
      .hsc-checklist-remove { background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 4px; }
      .hsc-checklist-add-row {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
        padding-top: 8px;
        border-top: 1px solid var(--border-light);
      }
      .hsc-checklist-input {
        flex: 1;
        border: none;
        background: none;
        font-size: 14px;
        color: var(--text-primary);
        padding: 6px 4px;
      }
      .hsc-checklist-input:focus { outline: none; }

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
      .hsc-vanmode-progress { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
      .hsc-vanmode-progress .hsc-escape-link { color: var(--text-secondary); flex-shrink: 0; }

      .hsc-fullday-body { display: flex; flex-direction: column; gap: var(--space-xs); }
      .hsc-fullday-row {
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
      .hsc-fullday-status {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 3px 8px;
        border-radius: 999px;
        flex-shrink: 0;
        background: var(--border-light);
        color: var(--text-tertiary);
      }
      .hsc-fullday-status-done { background: var(--secondary-light); color: var(--secondary); }
      .hsc-fullday-status-pending { background: var(--warning-light); color: var(--warning); }
      .hsc-eyebrow {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .hsc-date { font-size: 20px; font-weight: 700; color: var(--text-primary); }

      .hsc-empty {
        padding: var(--space-lg);
        text-align: center;
        color: var(--text-tertiary);
        background: var(--surface);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-lg);
      }

      /* Morning Blueprint */
      .hsc-window-block {
        background: var(--surface);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-lg);
        padding: var(--space-md);
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }
      .hsc-window-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .hsc-subslot-group { display: flex; flex-direction: column; gap: var(--space-xs); }
      .hsc-subslot-label { font-size: 11px; color: var(--text-tertiary); padding-left: 2px; }

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
      .hsc-appt-row-static { cursor: default; }
      .hsc-appt-row-flagged { border-color: var(--info); background: var(--surface-elevated); }
      .hsc-appt-time { font-family: var(--font-mono); font-size: 13px; color: var(--text-secondary); min-width: 44px; }
      .hsc-appt-details { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .hsc-appt-title-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
      .hsc-appt-name { font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hsc-appt-badge { flex-shrink: 0; font-size: 9px; padding: 2px 7px; }
      .hsc-appt-daylabel {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--info);
      }
      .hsc-appt-address { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hsc-appt-chevron { color: var(--text-tertiary); }

      .hsc-launch-btn { margin-top: var(--space-sm); }

      .hsc-hint-banner {
        display: flex;
        align-items: flex-start;
        gap: var(--space-sm);
        background: var(--surface);
        color: var(--text-secondary);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-md);
        padding: var(--space-sm) var(--space-md);
        font-size: 12px;
        line-height: 1.5;
      }
      .hsc-hint-banner .material-symbols-rounded { color: var(--info); flex-shrink: 0; }

      /* Mid-Day van-mount dashboard: high contrast, minimal, big targets */
      .hsc-vanmode {
        background: var(--bg);
        border-radius: var(--radius-xl);
        padding: var(--space-lg);
        gap: var(--space-lg);
      }
      .hsc-vanmode-progress-text {
        font-family: var(--font-mono);
        font-size: 14px;
        color: var(--accent);
        letter-spacing: 0.02em;
      }
      .hsc-vanmode-card {
        background: var(--bg-elevated);
        border-radius: var(--radius-lg);
        padding: var(--space-lg);
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .hsc-vanmode-time { font-family: var(--font-mono); font-size: 15px; color: var(--accent); }
      .hsc-vanmode-name { font-size: 26px; font-weight: 800; color: var(--text-primary); }
      .hsc-vanmode-address { font-size: 14px; color: var(--text-secondary); }
      .hsc-vanmode-nav-btn { min-height: 64px; font-size: 18px; }
      .hsc-vanmode-sms-btn { border-color: var(--border); color: var(--text-primary); }

      /* Evening win card */
      .hsc-win-card {
        background: var(--accent);
        color: var(--accent-contrast);
        border-radius: var(--radius-xl);
        padding: var(--space-lg);
        text-align: center;
      }
      .hsc-win-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; }
      .hsc-win-value { font-size: 40px; font-weight: 800; line-height: 1.2; }
      .hsc-win-sub { font-size: 13px; opacity: 0.8; }

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
