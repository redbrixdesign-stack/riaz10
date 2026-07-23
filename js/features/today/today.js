
/* ============================================
   ADVISOROS v5.0 — TODAY FEATURE
   Mission control dashboard + Morning Brief
   ============================================ */

const TodayFeature = {
  id: 'today',
  name: 'Home',
  icon: 'home',

  // render() previously built the Morning Brief / quick actions / embedded
  // calendar / route preview / EOD prompt dashboard itself (see
  // renderAsync() below, kept intact but no longer called by the router).
  // It now delegates the whole screen to HomeScreenController, which is a
  // separate state-machine-driven implementation (Morning Blueprint /
  // Mid-Day van-mount dashboard / Evening Closeout / Tomorrow Preview —
  // see js/features/today/home-screen-controller.js).
  //
  // NOTE — this is a real, visible product change, not just plumbing: the
  // old dashboard's quick-actions row, embedded calendar, weather, and EOD
  // check-in prompt are NOT part of HomeScreenController's four states, so
  // they no longer appear on Home. If any of those need to survive, they
  // should be folded into HomeScreenController's states (e.g. quick actions
  // inside Morning Blueprint) rather than left orphaned in renderAsync().
  init() {},

  render() {
    // A fixed-id shell HomeScreenController can mount into. Returned
    // synchronously (no promise) since HomeScreenController does its own
    // async DB work internally, after mount, inside activate() below.
    return `<div id="hsc-today-root" class="notebook-page"></div>`;
  },

  // App.navigate() calls activate() once render()'s output is actually in
  // the DOM (see js/core/app.js) — that's the correct moment to hand off,
  // rather than trying to render before #hsc-today-root exists.
  activate() {
    HomeScreenController.renderDynamicHomeScreen('hsc-today-root');
  },

  // App.navigate() calls deactivate() on whatever feature you're leaving,
  // before switching screens (js/core/app.js, "Deactivate current"). This
  // is what stops HomeScreenController's polling setInterval from
  // continuing to fire — and querying the DB — after you've left Home.
  deactivate() {
    HomeScreenController.stopDynamicHomeScreen();
  },

  async renderAsync() {
    const today = Utils.getToday();
    let appointments = [];
    let upcoming = [];
    let pipeline = [];
    let weekEarnings = 0;
    let weekSales = 0;

    try {
      appointments = await DB.getAppointmentsForDate(today.toISOString());
      appointments = this.sortAppointments(appointments);
    } catch (e) { console.log('Appointments load failed:', e); }

    try {
      upcoming = await DB.getUpcomingAppointments(365);
      upcoming = this.sortAppointments(upcoming);
    } catch (e) { console.log('Upcoming load failed:', e); }

    try {
      pipeline = await DB.getPipeline();
    } catch (e) { console.log('Pipeline load failed:', e); }

    try {
      weekEarnings = await this.getWeekEarnings();
    } catch (e) { console.log('Week earnings calc failed:', e); }

    try {
      weekSales = await this.getWeekSales();
    } catch (e) { console.log('Week sales calc failed:', e); }

    const thisWeek = upcoming.filter(a => {
      const d = new Date(a.date);
      return d >= today && d <= Utils.addDays(today, 7);
    });

    const todayRouteState = await this.getTodayRouteState(appointments);
    const nextTodayAppt = todayRouteState.nextAppt || this.getNextTodayAppointment(appointments);
    const nextActivity = nextTodayAppt || this.getNextFutureAppointment(upcoming, today);
    const nextRouteEstimate = todayRouteState.routeEstimate || (nextActivity ? await this.estimateNextRouteFromBase(nextActivity) : null);
    const dueFollowUps = this.getDueFollowUps(pipeline);
    const todayDistance = await this.estimateTodayDistance(appointments);
    // TaxCalculator.calculateMileageClaim expects kilometres, so convert if needed.
    const distanceKm = CONFIG.distanceUnit === 'miles' ? todayDistance * 1.60934 : todayDistance;
    const mileageSaving = TaxCalculator.calculateMileageClaim(distanceKm);

    let weather = null;
    try {
      weather = await WeatherService.getTodayWeather();
    } catch (e) { console.log('Weather load failed:', e); }

    let calendarHtml = '';
    try {
      calendarHtml = await AppointmentsFeature.renderEmbeddedCalendar();
    } catch (e) { console.log('Embedded calendar load failed:', e); }

    return `
      <div class="fade-in notebook-page">
        ${this.renderMorningBrief(today, appointments, todayDistance, mileageSaving, weekEarnings, weekSales, weather)}

        ${this.renderQuickActions()}

        <div style="padding: 0 0 16px;">${calendarHtml}</div>

        <!-- Today's Route Preview -->
        ${appointments.length > 1 ? this.renderRoutePreview(appointments) : ''}

        <!-- End of Day check-in -->
        ${this.shouldShowEOD() ? this.renderEODPrompt() : ''}
      </div>
    `;
  },

  // Compact quick-action row so the most common field actions (log expense,
  // log mileage, discount impact) are reachable from Today without tabbing
  // away to Tools. Previously these methods existed on TodayFeature but had
  // no buttons in the Today UI.
  renderQuickActions() {
    return `
      <div class="notebook-action-row" style="margin-top:6px;margin-bottom:4px;">
        <button class="notebook-action" onclick="TodayFeature.openMileageModal()">
          <span class="material-symbols-rounded">route</span>
          Mileage
        </button>
        <button class="notebook-action" onclick="TodayFeature.openExpenseModal()">
          <span class="material-symbols-rounded">receipt</span>
          Expense
        </button>
        <button class="notebook-action" onclick="App.navigate('talk')">
          <span class="material-symbols-rounded">chat</span>
          Follow up
        </button>
      </div>
    `;
  },

  // ── MORNING BRIEF ────────────────────────────────────────────────────────
  renderMorningBrief(today, appointments, miles, mileageSaving, weekEarnings, weekSales, weather) {
    const target = TaxCalculator.getRequiredWeeklySales(CONFIG.weeklyTarget);
    const remaining = Math.max(0, target - weekSales);
    const pct = target > 0 ? Math.min(100, (weekSales / target) * 100) : 0;
    const company = (CONFIG.companyName || 'AdvisorOS').trim();
    const dateLabel = today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

    const weatherHtml = weather ? `
      <div class="notebook-weather">
        <span class="material-symbols-rounded">${Utils.escapeHtml(weather.icon)}</span>
        <span>${weather.tempC}°</span>
      </div>
    ` : '';

    return `
      <div class="notebook-brand">
        <div class="notebook-logo">${Utils.escapeHtml(company)}</div>
        <div class="notebook-brand-meta">
          <div class="notebook-date">${Utils.escapeHtml(dateLabel)}</div>
          ${weatherHtml}
        </div>
      </div>

      <section class="notebook-section">
        <div class="notebook-kicker">Weekly sales target</div>
        <div class="notebook-progress-row">
          <div class="notebook-progress-figures">
            <strong>${Utils.formatCurrency(weekSales).replace('.00', '')}</strong>
            <span> of ${Utils.formatCurrency(target).replace('.00', '')}</span>
          </div>
          <div class="notebook-progress-remaining">${remaining > 0 ? Utils.formatCurrency(remaining).replace('.00', '') + ' left' : 'Target hit'}</div>
        </div>
        <div class="progress-bar" style="margin-top:6px;">
          <div class="fill ${pct >= 100 ? 'success' : 'accent'}" style="width:${pct}%;"></div>
        </div>
      </section>
    `;
  },

  getGreeting() {
    const hour = Utils.ukParts().hour;
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  },

  async getWeekEarnings() {
    const start = Utils.getStartOfWeek();
    const end = Utils.getEndOfWeek();
    const appts = await DB.db.appointments
      .where('date')
      .between(start.toISOString(), end.toISOString())
      .and(a => a.outcome === 'ordered')
      .toArray();
    return appts.reduce((sum, a) => {
      if (typeof a.commission === 'number' && a.commission > 0) return sum + a.commission;
      return sum + TaxCalculator.estimateCommission(a.value || 0);
    }, 0);
  },

  async getWeekSales() {
    const start = Utils.getStartOfWeek();
    const end = Utils.getEndOfWeek();
    const appts = await DB.db.appointments
      .where('date')
      .between(start.toISOString(), end.toISOString())
      .and(a => a.outcome === 'ordered')
      .toArray();
    return appts.reduce((sum, a) => sum + (a.value || 0), 0);
  },

  sortAppointments(appointments) {
    return [...appointments].sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  getNextTodayAppointment(appointments) {
    return appointments.find(a => a.status !== 'cancelled' && a.status !== 'completed' && !a.outcome) || null;
  },

  getNextFutureAppointment(upcoming, today) {
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    return upcoming.find(a => new Date(a.date) > todayEnd && a.status !== 'cancelled') || null;
  },

  formatCountdown(dateInput) {
    const diffMs = new Date(dateInput) - new Date();
    if (diffMs <= 0) return 'now';

    const totalMinutes = Math.max(1, Math.floor(diffMs / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  },

  getNextActivityDateLabel(appt, isToday) {
    const date = new Date(appt.date);
    if (isToday) return 'Today';
    if (Utils.isSameDay(date, Utils.getTomorrow())) return 'Tomorrow';
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  },

  async estimateNextRouteFromBase(appt) {
    const baseAddress = (CONFIG.businessAddress || '').trim();
    if (!baseAddress || !appt?.address) return null;

    try {
      let base = Array.isArray(CONFIG.businessLatLng) ? { lat: CONFIG.businessLatLng[0], lng: CONFIG.businessLatLng[1] } : null;
      if (!base) {
        const geocodedBase = await this.withTimeout(Geo.geocode(baseAddress), 2500);
        if (geocodedBase) {
          base = { lat: geocodedBase.lat, lng: geocodedBase.lng };
          CONFIG.businessLatLng = [base.lat, base.lng];
          try {
            const saved = JSON.parse(localStorage.getItem('advisoros_config') || '{}');
            const nextSaved = { ...saved, businessAddress: CONFIG.businessAddress || '', businessLatLng: CONFIG.businessLatLng };
            localStorage.setItem('advisoros_config', JSON.stringify(nextSaved));
            DB.setSetting('config', nextSaved);
          } catch (e) {}
        }
      }

      let dest = Array.isArray(appt.latLng) ? { lat: appt.latLng[0], lng: appt.latLng[1] } : null;
      if (!dest) {
        const geocodedDest = await this.withTimeout(Geo.geocode(appt.address), 2500);
        if (geocodedDest) {
          dest = { lat: geocodedDest.lat, lng: geocodedDest.lng };
          try { await DB.db.appointments.update(appt.id, { latLng: [dest.lat, dest.lng] }); } catch (e) {}
        }
      }

      if (!base || !dest) return null;

      const summary = await this.withTimeout(Geo.getDrivingRouteSummary(base.lat, base.lng, dest.lat, dest.lng), 2500);
      if (!summary) return null;
      // Match the shape produced by getTodayRouteState() so renderNotebookNext()
      // can read fromLabel / originAddress regardless of which path supplied the
      // estimate. (Previously this returned { from } which the renderer never
      // read, so the "from" label and origin address were silently dropped.)
      return {
        ...summary,
        fromLabel: 'base',
        toLabel: appt?.clientName || 'Visit',
        originAddress: baseAddress
      };
    } catch (e) {
      console.log('Next route estimate unavailable:', e);
      return null;
    }
  },

  async getTodayRouteState(appointments) {
    const active = this.sortAppointments(appointments)
      .filter(a => a.status !== 'cancelled');
    if (active.length === 0) return { nextAppt: null, routeEstimate: null };

    try {
      if (typeof RouteFeature === 'undefined') {
        return { nextAppt: this.getNextTodayAppointment(active), routeEstimate: null };
      }

      const base = await RouteFeature.getBasePoint();
      const withCoords = await RouteFeature.ensureAppointmentCoords(active);
      const ordered = RouteFeature.optimizeDayLoopOrder(withCoords, base);
      const legs = RouteFeature.buildRouteLegs(ordered, base);
      const activeLeg = RouteFeature.getActiveRouteLeg(legs);
      const nextAppt = activeLeg?.to?.appointment || this.getNextTodayAppointment(ordered);
      if (!activeLeg || !nextAppt) return { nextAppt, routeEstimate: null };

      return {
        nextAppt,
        routeEstimate: activeLeg.distanceKm > 0 ? {
          distanceKm: activeLeg.distanceKm,
          durationMin: activeLeg.etaMin,
          source: 'estimate',
          fromLabel: activeLeg.from.label,
          toLabel: activeLeg.to.label,
          originAddress: activeLeg.from.address || ''
        } : null
      };
    } catch (e) {
      console.log('Today route state unavailable:', e);
      return { nextAppt: this.getNextTodayAppointment(active), routeEstimate: null };
    }
  },

  withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), ms))
    ]);
  },

  formatEta(minutes) {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  },

  renderNotebookNext(nextAppt, options = {}) {
    if (!nextAppt) {
      return `
        <section class="notebook-section">
          <div class="notebook-title">
            <h2>NEXT</h2>
          </div>
          <div class="notebook-line">
            <span>No visit booked</span>
            <strong>Clear</strong>
          </div>
          <div class="notebook-command">
            <button class="btn notebook-command-primary" onclick="App.navigate('appointments', {action: 'add'})">
              <span class="material-symbols-rounded">add</span>
              Add Visit
            </button>
            <button class="btn notebook-command-secondary" onclick="App.navigate('talk')">
              <span class="material-symbols-rounded">chat</span>
              Open Talk
            </button>
          </div>
        </section>
      `;
    }

    const isToday = options.isToday !== false && Utils.isSameDay(nextAppt.date, new Date());
    const countdown = this.formatCountdown(nextAppt.date);
    const dateLabel = this.getNextActivityDateLabel(nextAppt, isToday);
    const timeLabel = Utils.formatTime(nextAppt.date);
    const activityType = nextAppt.type ? Utils.escapeHtml(nextAppt.type) : 'Visit';
    const customerName = nextAppt.clientName || 'Customer';
    const address = nextAppt.address || 'Address not added yet';
    const phone = nextAppt.phone || '';
    const routeEstimate = options.routeEstimate;
    const routeFrom = routeEstimate?.fromLabel || 'base';
    const routeOrigin = routeEstimate?.originAddress || CONFIG.businessAddress || '';
    const urgency = this.getNextUrgency(nextAppt.date);

    return `
      <section class="notebook-section next-section next-${urgency.level}">
        <div class="notebook-title">
          <h2>NEXT</h2>
          <div class="next-urgency-chip">${Utils.escapeHtml(urgency.label)}</div>
        </div>
        <button class="next-activity-card" type="button" onclick="App.navigate('appointments', {id: ${nextAppt.id}})">
          <span class="next-activity-meta">${Utils.escapeHtml(dateLabel)} · ${Utils.escapeHtml(timeLabel)} · ${activityType}</span>
          <strong>${Utils.escapeHtml(customerName)}</strong>
          <span>${Utils.escapeHtml(address)}</span>
          ${phone ? `<span>${Utils.escapeHtml(phone)}</span>` : '<span>Phone not added yet</span>'}
        </button>
        ${routeEstimate ? `
          <div class="next-route-estimate">
            <span class="material-symbols-rounded">route</span>
            <strong>${Utils.escapeHtml(Utils.formatDistance(routeEstimate.distanceKm))}</strong>
            <span>${Utils.escapeHtml(this.formatEta(routeEstimate.durationMin))}${routeEstimate.source === 'estimate' ? ' estimated' : ''} from ${Utils.escapeHtml(routeFrom)}</span>
          </div>
        ` : CONFIG.businessAddress ? '' : `
          <button class="btn notebook-action" onclick="App.navigate('settings')">
            <span class="material-symbols-rounded">home_pin</span>
            Add base address for mileage and ETA
          </button>
        `}
        <div class="notebook-command" style="gap:14px;">
          <button class="btn notebook-command-primary" onclick="TodayFeature.confirmStartRoute('${Utils.escapeJsString(nextAppt.address || '')}', ${nextAppt.id}, '${Utils.escapeJsString(routeOrigin)}', '${Utils.escapeJsString(customerName)}')">
            <span class="material-symbols-rounded">navigation</span>
            Start Route
          </button>
          ${nextAppt.phone ? `
            <button class="btn notebook-command-secondary" onclick="ContactFeature.open({name: '${Utils.escapeJsString(customerName)}', phone: '${Utils.escapeJsString(nextAppt.phone)}'})">
              <span class="material-symbols-rounded">chat</span>
              Contact Customer
            </button>
          ` : ''}
        </div>
      </section>
    `;
  },

  // Confirms before opening turn-by-turn navigation AND starting a live GPS
  // trip. A mis-tap on "Start Route" used to fire both immediately —
  // irreversible from within AdvisorOS until you switched back. The confirm
  // sheet makes the action deliberate and lets the user opt out of trip
  // tracking if they only want directions.
  confirmStartRoute(address, appointmentId, origin, customerName) {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Start route to ${Utils.escapeHtml(customerName)}?</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px;">
          This opens turn-by-turn directions${address ? '' : ' (no address set — directions may not work)'}.
        </div>
        <button class="btn btn-primary btn-block" onclick="TodayFeature.startDrivingTo('${Utils.escapeJsString(address)}', ${appointmentId}, '${Utils.escapeJsString(origin)}')">
          <span class="material-symbols-rounded">navigation</span>
          Directions + log trip
        </button>
        <button class="btn btn-outline btn-block" style="margin-top:10px;" onclick="TodayFeature.directionsOnly('${Utils.escapeJsString(address)}')">
          <span class="material-symbols-rounded">directions</span>
          Directions only
        </button>
        <button class="btn btn-ghost btn-block" style="margin-top:6px;" onclick="App.closeModal()">Cancel</button>
      </div>
    `;
    App.openModal(content);
  },

  directionsOnly(address) {
    App.closeModal();
    if (!address) {
      Toast.show('No address set for this visit', 'warning');
      return;
    }
    window.open(Geo.buildNavigationUrl(address), '_blank');
  },

  getNextUrgency(date) {
    const diffMin = Math.round((new Date(date) - new Date()) / 60000);
    if (diffMin <= 0) return { level: 'now', label: 'Due now' };
    if (diffMin <= 15) return { level: 'soon', label: `In ${diffMin} min` };
    if (diffMin <= 60) return { level: 'soon', label: `In ${diffMin} min` };
    if (diffMin <= 180) {
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      return { level: 'today', label: mins ? `In ${hours}h ${mins}m` : `In ${hours}h` };
    }
    if (Utils.isSameDay(date, new Date())) return { level: 'today', label: 'Today' };
    return { level: 'future', label: `In ${this.formatCountdown(date)}` };
  },

  async estimateTodayDistance(appointments) {
    if (appointments.length === 0) return 0;
    try {
      const withCoords = appointments.filter(a => a.latLng);
      if (withCoords.length === 0) {
        // Rough fallback: 8 distance-units between jobs
        const fallbackPerJob = CONFIG.distanceUnit === 'miles' ? 8 : 13;
        return appointments.length * fallbackPerJob;
      }
      // Geo.calculateRouteDistance returns kilometres (Haversine, R=6371)
      const km = Geo.calculateRouteDistance(withCoords);
      return CONFIG.distanceUnit === 'miles' ? km * 0.621371 : km;
    } catch (e) {
      const fallbackPerJob = CONFIG.distanceUnit === 'miles' ? 8 : 13;
      return appointments.length * fallbackPerJob;
    }
  },

  // ── FOLLOW-UPS ────────────────────────────────────────────────────────────
  getDueFollowUps(pipeline) {
    const now = new Date();
    return pipeline.filter(p => {
      const daysSince = Utils.daysBetween(now, p.date);
      return daysSince >= 3; // due for a nudge
    }).slice(0, 5);
  },

  // ── END OF DAY ────────────────────────────────────────────────────────────
  shouldShowEOD() {
    const hour = Utils.ukParts().hour;
    const todayKey = Utils.formatDate(Utils.getToday(), 'iso');
    const lastEOD = localStorage.getItem('advisoros_last_eod');
    return hour >= 16 && lastEOD !== todayKey;
  },

  renderEODPrompt() {
    return `
      <div class="card" style="margin: 16px; margin-top: 8px; border-left: 4px solid var(--primary);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-rounded" style="color: var(--primary);">fact_check</span>
            <div>
              <div style="font-weight: 600; font-size: 14px;">End of day check-in</div>
              <div style="font-size: 12px; color: var(--text-tertiary);">30 seconds. Wrap up today properly.</div>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="TodayFeature.openEODModal()">Start</button>
        </div>
      </div>
    `;
  },

  async openEODModal() {
    const today = Utils.getToday();
    let appointments = [];
    try { appointments = await DB.getAppointmentsForDate(today.toISOString()); } catch (e) {}
    const completed = appointments.filter(a => a.outcome).length;
    const earned = appointments.reduce((sum, a) => sum + (a.outcome === 'ordered' ? (a.value || 0) : 0), 0);

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>End of Day</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
          <div class="stat-card">
            <div class="value">${Utils.formatCurrency(earned)}</div>
            <div class="label">Earned Today</div>
          </div>
          <div class="stat-card">
            <div class="value">${completed}/${appointments.length}</div>
            <div class="label">Visits Done</div>
          </div>
        </div>

        <div class="form-group">
          <label>Anything to remember for tomorrow?</label>
          <input type="text" class="input" id="eod-note" placeholder="e.g. Call back Mrs Jones about samples">
        </div>

        <button class="btn btn-primary btn-block" onclick="TodayFeature.completeEOD()">
          Done for Today <span class="material-symbols-rounded">check</span>
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async completeEOD() {
    const noteEl = document.getElementById('eod-note');
    const note = noteEl ? noteEl.value.trim() : '';

    if (note) {
      try {
        await DB.addCommunication({
          type: 'note',
          content: `EOD note: ${note}`,
          sentAt: new Date().toISOString()
        });
      } catch (e) { console.log('Could not save EOD note'); }
    }

    localStorage.setItem('advisoros_last_eod', Utils.formatDate(Utils.getToday(), 'iso'));
    App.closeModal();
    Toast.show('Day complete. See you tomorrow!', 'success');
    App.navigate('today');
  },

  // Tapped from the "Start Route" confirm sheet — opens turn-by-turn directions
  // and starts a live, GPS-tracked trip that auto-logs itself once you arrive.
  async startDrivingTo(address, appointmentId, origin = '') {
    App.closeModal();
    window.open(Geo.buildNavigationUrl(address || '', origin || ''), '_blank');
    await Geo.startTrip({ destinationAddress: address || '', appointmentId });
  },

  renderRoutePreview(appointments) {
    const plan = typeof RouteFeature !== 'undefined' ? RouteFeature.analyseDay(appointments, new Date()) : null;
    return `
      <div class="card" style="margin: 16px; margin-top: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div>
            <div style="font-weight: 600;">Today's Route</div>
            ${plan ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">${Utils.escapeHtml(plan.efficiency.label)} · ${Object.keys(plan.areas).length} area${Object.keys(plan.areas).length === 1 ? '' : 's'}</div>` : ''}
          </div>
          <button class="btn btn-sm btn-ghost" onclick="App.navigate('route')">
            Plan <span class="material-symbols-rounded" style="font-size: 16px;">chevron_right</span>
          </button>
        </div>
        ${plan?.suggestions?.[0] ? `
          <div class="inset-dark" style="font-size:13px;color:var(--text-secondary);line-height:1.45;background:var(--bg);border-radius:8px;padding:10px;margin-bottom:10px;">
            ${Utils.escapeHtml(plan.suggestions[0])}
          </div>
        ` : ''}
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${appointments.map((a, i) => `
            <div class="inset-dark" style="display: flex; align-items: center; gap: 12px; padding: 8px; background: var(--bg); border-radius: 8px;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">${i + 1}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${Utils.escapeHtml(a.clientName || 'Visit')}</div>
                <div style="font-size: 12px; color: var(--text-tertiary);">${Utils.formatTime(a.date)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ── TASKS ─────────────────────────────────────────────────────────────────
  // Replaces the old "recent activity" log with forward-looking, actionable
  // items: follow-ups gone quiet, quotes still open, and visits missing the
  // details you'll need on the day. Each row jumps straight to where it's fixed.
  renderTaskList(dueFollowUps, pipeline, thisWeek) {
    const missingDetails = thisWeek.filter(a => !a.address || !a.phone).length;
    const openQuotes = pipeline.length;

    const tasks = [];

    if (dueFollowUps.length > 0) {
      tasks.push({
        icon: 'campaign',
        label: `${dueFollowUps.length} follow-up${dueFollowUps.length === 1 ? '' : 's'} due`,
        hint: 'Gone quiet for a few days — worth a nudge',
        onclick: "App.navigate('appointments', {tab: 'pipeline'})"
      });
    }

    if (openQuotes > dueFollowUps.length) {
      const waiting = openQuotes - dueFollowUps.length;
      tasks.push({
        icon: 'request_quote',
        label: `${waiting} quote${waiting === 1 ? '' : 's'} still open`,
        hint: 'Waiting on a decision',
        onclick: "App.navigate('appointments', {tab: 'pipeline'})"
      });
    }

    if (missingDetails > 0) {
      tasks.push({
        icon: 'contact_page',
        label: `${missingDetails} visit${missingDetails === 1 ? '' : 's'} missing details`,
        hint: 'Address or phone not added yet',
        onclick: "App.navigate('appointments', {tab: 'upcoming'})"
      });
    }

    if (tasks.length === 0) {
      return `
        <section class="notebook-section">
          <div class="notebook-title"><h2>TASKS</h2></div>
          <div class="notebook-line"><span>All caught up, nothing pending</span></div>
        </section>
      `;
    }

    return `
      <section class="notebook-section">
        <div class="notebook-title">
          <h2>TASKS</h2>
          <div class="task-count-chip">${tasks.length} open</div>
        </div>
        ${tasks.map(t => `
          <button class="task-row" onclick="${t.onclick}">
            <span class="material-symbols-rounded task-row-icon">${t.icon}</span>
            <span class="task-row-body">
              <span class="task-row-label">${Utils.escapeHtml(t.label)}</span>
              <span class="task-row-hint">${Utils.escapeHtml(t.hint)}</span>
            </span>
            <span class="material-symbols-rounded task-row-chevron">chevron_right</span>
          </button>
        `).join('')}
      </section>
    `;
  },

  // Quick action modals
  openExpenseModal() {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Quick Expense</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label>Amount (£)</label>
          <input type="number" class="input" id="expense-amount" placeholder="0.00" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label>Category</label>
          <select class="select" id="expense-category">
            ${CONFIG.expenseCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" class="input" id="expense-description" placeholder="What was this for?">
        </div>
        <button class="btn btn-primary btn-block" onclick="TodayFeature.saveExpense()">
          Save Expense
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveExpense() {
    const amountEl = document.getElementById('expense-amount');
    const categoryEl = document.getElementById('expense-category');
    const descEl = document.getElementById('expense-description');

    if (!amountEl || !categoryEl) {
      Toast.show('Form not ready', 'error');
      return;
    }

    const amount = parseFloat(amountEl.value);
    const category = categoryEl.value;
    const description = descEl ? descEl.value : '';

    if (!amount || amount <= 0) {
      Toast.show('Please enter a valid amount', 'error');
      return;
    }

    try {
      await DB.addExpense({
        date: new Date().toISOString(),
        amount,
        category,
        description: description || category
      });
      App.closeModal();
      Toast.show('Expense logged', 'success');
      App.navigate('today');
    } catch (e) {
      Toast.show('Failed to save expense', 'error');
    }
  },

  openMileageModal() {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Log Mileage</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <button class="btn btn-primary btn-block" onclick="TodayFeature.startLiveTrip()" style="margin-bottom:16px;">
          <span class="material-symbols-rounded">directions_car</span>
          Start Live Trip
        </button>
        <div class="hint" style="margin-top:-10px;margin-bottom:16px;">Uses GPS + real road distance. Add a destination and it checks for arrival whenever you reopen the app (handy if you navigate elsewhere in the meantime) — or leave it blank and tap Finish yourself.</div>
        <div class="form-group">
          <label>From</label>
          <input type="text" class="input" id="trip-from" placeholder="Start location">
        </div>
        <div class="form-group">
          <label>To</label>
          <input type="text" class="input" id="trip-to" placeholder="Destination">
        </div>
        <div class="divider-text">or enter manually</div>
        <div class="form-group">
          <label>Distance (${CONFIG.distanceUnit})</label>
          <input type="number" class="input" id="trip-distance" placeholder="0.0" step="0.1" min="0">
        </div>
        <button class="btn btn-outline btn-block" onclick="TodayFeature.saveTrip()">
          Log Trip
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async startLiveTrip() {
    const toEl = document.getElementById('trip-to');
    const destinationAddress = toEl ? toEl.value.trim() : '';
    App.closeModal();
    await Geo.startTrip({ destinationAddress });
  },

  async saveTrip() {
    const fromEl = document.getElementById('trip-from');
    const toEl = document.getElementById('trip-to');
    const distEl = document.getElementById('trip-distance');

    if (!distEl) {
      Toast.show('Form not ready', 'error');
      return;
    }

    const from = fromEl ? fromEl.value : '';
    const to = toEl ? toEl.value : '';
    const distance = parseFloat(distEl.value);

    if (!distance || distance <= 0) {
      Toast.show('Please enter a valid distance', 'error');
      return;
    }

    try {
      await DB.addTrip({
        date: new Date().toISOString(),
        startLocation: from || 'Home',
        endLocation: to || 'Unknown',
        distanceKm: CONFIG.distanceUnit === 'miles' ? distance * 1.60934 : distance,
        purpose: 'business'
      });
      App.closeModal();
      Toast.show('Trip logged', 'success');
      App.navigate('today');
    } catch (e) {
      Toast.show('Failed to save trip', 'error');
    }
  }
};

App.registerFeature(TodayFeature);
