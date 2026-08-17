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

  _timer: null,
  // The container the weekly calendar is currently rendered into. My Day
  // renders into #companion-myday-root; shift/select re-render into THIS
  // container (they used to hardcode #hsc-today-root, which no longer
  // exists, so the panel's arrows and day taps silently did nothing).
  _rootId: null,

  async renderDynamicHomeScreen(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`[HomeScreenController] container #${containerId} not found`);
      return;
    }
    this._rootId = containerId;

    // First paint only: shell out the weekly layout so the screen never sits
    // blank while appointments/geocoding load. Later 60s poll re-renders keep
    // the previous content in place until the new data lands.
    if (!container.querySelector('.hsc-root')) {
      container.innerHTML = this.renderSkeleton();
    }

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
    this.renderDynamicHomeScreen(this._rootId || 'hsc-today-root');
  },

  selectDay(isoDate) {
    this._selectedDate = new Date(isoDate);
    this.renderDynamicHomeScreen(this._rootId || 'hsc-today-root');
  },

  jumpToToday() {
    this._selectedDate = Utils.getToday();
    this.renderDynamicHomeScreen(this._rootId || 'hsc-today-root');
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
      const active = dayAppts.find(a => a.status !== 'completed' && !a.outcome);
      if (active) {
        let bannerPhotos = [];
        if (active.customerId) {
          try { bannerPhotos = await DB.getPhotosForCustomer(active.customerId); } catch (e) {}
        }
        upNextCardHtml = this.renderUpNextBanner(active, bannerPhotos);
      }
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
        <button class="hsc-week-day ${isSelected ? 'active' : ''}" type="button" data-action="HomeScreenController.selectDay" data-args='${JSON.stringify([Utils.formatDate(d, 'iso')])}'>
          <span class="hsc-week-day-name">${Utils.formatDate(d, 'weekday-short')}</span>
          <span class="hsc-week-day-num">${d.getDate()}</span>
          ${isTodayDot && !isSelected ? '<span class="hsc-week-day-dot"></span>' : ''}
        </button>
      `;
    }).join('');

    const listHtml = dayAppts.length === 0
      ? `<div class="hsc-empty mt-lg" >Nothing booked ${isToday ? 'today' : 'this day'}.</div>`
      : this.renderGroupedVisitList(dayAppts, travelLabels);

    return `
      <div class="hsc-root hsc-weekly fade-in">
        <div class="hsc-week-toprow">
          <button class="hsc-week-icon-btn" type="button" aria-label="Search visits" data-action="App.navigate" data-args='${JSON.stringify(["appointments"])}'>
            <span class="material-symbols-rounded">search</span>
          </button>
        </div>

        <div class="hsc-week-header">
          <button class="hsc-week-nav" type="button" aria-label="Previous day" data-action="HomeScreenController.shiftSelectedDay" data-args='${JSON.stringify([-1])}'>
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <div class="hsc-week-title" data-action="HomeScreenController.jumpToToday">
            ${Utils.escapeHtml(Utils.formatDate(selected, 'long'))}
            ${!isToday ? '<span class="hsc-week-today-hint">Tap for today</span>' : ''}
          </div>
          <button class="hsc-week-nav" type="button" aria-label="Next day" data-action="HomeScreenController.shiftSelectedDay" data-args='${JSON.stringify([1])}'>
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
        </div>

        <div class="hsc-week-strip">${dayStripHtml}</div>

        ${followUpCount > 0 ? `
        <button class="hsc-followup-badge" type="button" data-action="App.navigate" data-args='${JSON.stringify(["followups"])}'>
          <span class="material-symbols-rounded">campaign</span>
          ${followUpCount} thing${followUpCount === 1 ? '' : 's'} due today
          <span class="material-symbols-rounded ml-auto" >chevron_right</span>
        </button>
        ` : ''}

        ${upNextCardHtml}

        <div class="hsc-week-list">${listHtml}</div>

        <div class="text-center mt-md" >
          ${this.renderAddVisitLink()}
        </div>
      </div>
    `;
  },

  renderGroupedVisitList(appts, travelLabels) {
    const groups = { Morning: [], Afternoon: [], Evening: [] };
    for (const a of appts) {
      const h = Utils.hourUK(a.date);
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
    const time = Utils.escapeHtml(Utils.formatTimeUK(appt.date));
    const isDone = appt.status === 'completed';
    const phone = appt.phone || '';

    return `
      <div class="hsc-week-row ${isDone ? 'done' : ''}">
        <button class="hsc-week-row-main" type="button" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {id: (appt.id)}])}'>
          <div class="hsc-week-row-top">
            <span class="hsc-week-row-name">@${name}</span>
            <span class="hsc-week-row-time">${time}</span>
          </div>
          <div class="hsc-week-row-address">${address}</div>
          ${travel ? `<div class="hsc-week-row-travel"><span class="material-symbols-rounded">directions_car</span>${travel} away</div>` : ''}
        </button>
        ${!isDone ? `
        <div class="hsc-week-row-actions">
          <button class="btn btn-outline btn-sm" type="button" data-action="AppointmentsFeature.navigateToVisit" data-args='${JSON.stringify([(Utils.escapeJsString(appt.address || '')), (appt.id)])}'>
            <span class="material-symbols-rounded">navigation</span>Navigate
          </button>
          <button class="btn btn-outline btn-sm" type="button" ${phone ? '' : 'disabled'} data-action="ContactFeature.open" data-args='${JSON.stringify([{name: (Utils.escapeJsString(appt.clientName || 'Customer')), phone: (Utils.escapeJsString(phone))}])}'>
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
  // screen being taken over by a single visit. When the customer has photos
  // (captured on-site, or window pictures they shared before the first
  // visit), up to four small thumbs render underneath so the advisor can
  // recognise the property while on the way.
  renderUpNextBanner(appt, photos = []) {
    const isOnSite = appt.travelStatus === 'on_site';
    const isInTransit = appt.travelStatus === 'in_transit';
    const isLate = !isOnSite && (Date.now() - new Date(appt.date).getTime()) > 5 * 60 * 1000;
    const label = isOnSite ? 'On site now' : isLate ? 'Running late' : isInTransit ? 'On the way' : 'Up next';
    const color = isLate ? 'var(--warning,#b06000)' : isOnSite ? 'var(--secondary)' : 'var(--text-secondary)';
    const photoThumbs = photos.slice(0, 4).map(p => `
      <button class="hsc-upnext-photo" type="button" aria-label="View photo" data-action="AppointmentsFeature.openPhotoViewer" data-args='${JSON.stringify([(p.id), (p.customerId)])}'>
        <img src="data:${p.mimeType || 'image/jpeg'};base64,${p.data}" alt="">
      </button>
    `).join('');
    return `
      <div class="hsc-upnext-banner">
        <div class="hsc-upnext-line">
          <span class="hsc-upnext-dot" style="background:${color};"></span>
          <span class="hsc-upnext-label" style="color:${color};">${Utils.escapeHtml(label)}</span>
          <span class="hsc-upnext-name">@${Utils.escapeHtml(appt.clientName || 'Customer')}</span>
          <span class="hsc-upnext-time">${Utils.escapeHtml(Utils.formatTime(appt.date))}</span>
        </div>
        ${photoThumbs ? `<div class="hsc-upnext-photos">${photoThumbs}</div>` : ''}
      </div>
    `;
  },

  // A new appointment can come in any time - mid-morning, mid-visit, or right
  // at the end of the day - and previously the only place to add one was the
  // empty-day state. This gives every state the same way in.
  renderAddVisitLink() {
    return `
      <button class="hsc-escape-link" type="button" data-action="App.navigate" data-args='${JSON.stringify(["appointments", {action: "add"}])}'>
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

  renderSkeleton() {
    return `
      <div class="hsc-root hsc-weekly fade-in" aria-busy="true" aria-label="Loading today's plan">
        <div class="hsc-week-toprow">
          <span class="skeleton w-32 h-32 round" ></span>
        </div>
        <div class="hsc-week-header">
          <span class="skeleton w-32 h-32 round" ></span>
          <span class="skeleton w-150 h-20 br-6" ></span>
          <span class="skeleton w-32 h-32 round" ></span>
        </div>
        <div class="hsc-week-strip">
          ${Array.from({ length: 7 }, () => '<span class="skeleton h-44 br-md" ></span>').join('')}
        </div>
        ${Array.from({ length: 3 }, () => '<div class="skeleton h-64 br-md" ></div>').join('')}
      </div>
    `;
  }
};
