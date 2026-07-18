/* ============================================
   ADVISOROS v5.0 — ROUTE FEATURE
   Leaflet map, route optimization, batch suggestions
   ============================================ */

const RouteFeature = {
  id: 'route',
  name: 'Route',
  icon: 'map',
  route: false,
  map: null,
  markers: [],
  routeLine: null,
  leafletLoaded: false,

  init() {
    // Load Leaflet CSS dynamically
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    if (!window.L) {
      const existing = document.getElementById('leaflet-js');
      if (existing) existing.remove(); // retry: drop the previous (failed) attempt before re-adding
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        console.log('Leaflet loaded');
        this.leafletLoaded = true;
      };
      script.onerror = () => {
        console.error('Leaflet failed to load');
      };
      document.head.appendChild(script);
    } else {
      this.leafletLoaded = true;
    }
  },

  async render() {
    const today = Utils.getToday();
    let appointments = [];
    try {
      appointments = await DB.getAppointmentsForDate(today.toISOString());
    } catch (e) {
      console.error('Failed to load appointments:', e);
    }
    appointments = this.sortByTime(appointments);

    // Render the stop list from local data FIRST — it needs no network, so it
    // shows immediately even with patchy signal. The base/coords lookups below
    // may fail offline, but they must not blank the whole screen.
    const base = await this.getBasePoint();
    appointments = await this.ensureAppointmentCoords(appointments);
    const plan = this.analyseDay(appointments, today, base);
    const routeList = plan.optimized || appointments;
    const routeDistance = plan.optimizedLegKm || plan.currentLegKm || 0;
    const routeTime = Math.max(0, Math.round((routeDistance / 35) * 60));
    const routeSaving = TaxCalculator.calculateMileageClaim(routeDistance);
    // If we have visits but no distance, we're offline (geocoding failed).
    // Show "offline" rather than "--" so the advisor knows it's a signal issue,
    // not a missing-data issue.
    const hasVisits = appointments.length > 0;
    const distLabel = routeDistance > 0 ? Utils.formatDistance(routeDistance) : (hasVisits ? 'offline' : '--');
    const timeLabel = routeTime > 0 ? `${routeTime} min` : (hasVisits ? 'offline' : '--');
    const savingLabel = routeDistance > 0 ? Utils.formatCurrency(routeSaving) : (hasVisits ? 'offline' : '--');

    return `
      <div class="fade-in route-screen">
        <!-- Header -->
        <div class="top-header">
          <h1>Today's Route</h1>
          <div class="header-actions">
            <button class="btn btn-sm btn-ghost" onclick="RouteFeature.openTodayRoute()" aria-label="Open full day route">
              <span class="material-symbols-rounded">navigation</span>
            </button>
            <button class="btn btn-sm btn-ghost" onclick="RouteFeature.optimizeRoute()">
              <span class="material-symbols-rounded">route</span>
            </button>
          </div>
        </div>

        <!-- Route Stats -->
        <div class="route-stats">
          <div class="route-stats-grid">
            <div class="route-stat">
              <strong>${appointments.length}</strong>
              <span>Stops</span>
            </div>
            <div class="route-stat">
              <strong id="route-distance">${distLabel}</strong>
              <span>Base Loop</span>
            </div>
            <div class="route-stat">
              <strong id="route-time">${timeLabel}</strong>
              <span>Est. Time</span>
            </div>
            <div class="route-stat">
              <strong style="color: var(--secondary);" id="route-saving">${savingLabel}</strong>
              <span>Tax Relief</span>
            </div>
          </div>
        </div>

        ${this.renderRoutePlan(plan)}

        <!-- Map Container -->
        <div id="route-map" class="route-map">
          <div id="route-map-loading" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary);">
            <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 8px;">map</span>
            <div>Loading map...</div>
          </div>
        </div>

        <!-- Appointment List — always rendered from local data -->
        <div class="route-list">
          ${appointments.length === 0 ? `
            <div class="empty-state" style="padding: 24px;">
              <span class="material-symbols-rounded">location_off</span>
              <div>No visits today</div>
            </div>
          ` : routeList.map((a, i) => `
            <div class="list-item" onclick="RouteFeature.focusMarker(${i})">
              <div class="route-stop-number">${i + 1}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${Utils.escapeHtml(a.clientName || 'Unknown')}</div>
                <div style="font-size: 12px; color: var(--text-tertiary);">${Utils.formatTime(a.date)} · ${Utils.escapeHtml(this.getAreaLabel(a))} · ${Utils.escapeHtml(Utils.truncate(a.address || '', 24))}</div>
              </div>
              <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.open('${Utils.escapeJsString(Geo.buildNavigationUrl(a.address || '', CONFIG.businessAddress || ''))}', '_blank')">
                <span class="material-symbols-rounded" style="font-size: 18px;">navigation</span>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  sortByTime(appointments) {
    return [...appointments].sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  getDayMode(dateInput) {
    const day = new Date(dateInput).getDay();
    if ((CONFIG.workingWeek?.salesDays || [1, 2, 4]).includes(day)) return 'sales';
    if ((CONFIG.workingWeek?.fittingDays || [3, 5]).includes(day)) return 'fitting';
    return 'mixed';
  },

  getAreaLabel(appt) {
    const address = appt.address || '';
    const postcode = address.match(/\b[A-Z]{1,2}\d[A-Z\d]?\b/i);
    if (postcode) return postcode[0].toUpperCase();
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2];
    return parts[0] || 'Area unknown';
  },

  async getBasePoint() {
    const address = (CONFIG.businessAddress || '').trim();
    if (!address) return null;
    if (Array.isArray(CONFIG.businessLatLng) && CONFIG.businessLatLng.length === 2) {
      return { address, latLng: CONFIG.businessLatLng };
    }
    try {
      const geo = await this.withTimeout(Geo.geocode(address), 2500);
      if (geo) {
        CONFIG.businessLatLng = [geo.lat, geo.lng];
        this.persistBasePoint();
        return { address, latLng: CONFIG.businessLatLng };
      }
    } catch (e) {
      console.log('Base geocode unavailable:', e);
    }
    return { address, latLng: null };
  },

  persistBasePoint() {
    try {
      const saved = JSON.parse(localStorage.getItem('advisoros_config') || '{}');
      const nextSaved = { ...saved, businessAddress: CONFIG.businessAddress || '', businessLatLng: CONFIG.businessLatLng || null };
      localStorage.setItem('advisoros_config', JSON.stringify(nextSaved));
      DB.setSetting('config', nextSaved);
    } catch (e) {}
  },

  withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), ms))
    ]);
  },

  async ensureAppointmentCoords(appointments) {
    const updated = [];
    for (const appt of appointments) {
      if (Array.isArray(appt.latLng) && appt.latLng.length === 2) {
        updated.push(appt);
        continue;
      }
      if (!appt.address) {
        updated.push(appt);
        continue;
      }
      try {
        const geo = await this.withTimeout(Geo.geocode(appt.address), 1800);
        if (geo) {
          const latLng = [geo.lat, geo.lng];
          try { await DB.db.appointments.update(appt.id, { latLng }); } catch (e) {}
          updated.push({ ...appt, latLng });
          continue;
        }
      } catch (e) {}
      updated.push(appt);
    }
    return updated;
  },

  analyseDay(appointments, date = new Date(), base = null) {
    const sorted = this.sortByTime(appointments);
    const mode = this.getDayMode(date);
    const areas = this.groupByArea(sorted);
    const areaSequence = sorted.map(a => this.getAreaLabel(a));
    const areaJumps = areaSequence.reduce((count, area, index) => {
      if (index === 0) return 0;
      return count + (area !== areaSequence[index - 1] ? 1 : 0);
    }, 0);
    const repeatedReturn = this.findRepeatedAreaReturn(areaSequence);
    const withCoords = sorted.filter(a => Array.isArray(a.latLng) && a.latLng.length === 2);
    const currentLegKm = this.calculateDayLoopDistance(sorted, base);
    const optimized = withCoords.length >= 2 ? this.optimizeDayLoopOrder(sorted, base) : sorted;
    const optimizedLegKm = this.calculateDayLoopDistance(optimized, base);
    const savingKm = Math.max(0, currentLegKm - optimizedLegKm);
    const efficiency = this.scoreEfficiency({ sorted, areas, areaJumps, repeatedReturn, savingKm, currentLegKm });
    // IMPORTANT: the actual route the advisor follows must respect appointment
    // times - they're commitments already confirmed with customers, not just
    // waypoints to be shuffled for a shorter drive. Build the real legs from
    // `sorted` (time order), not `optimized` (geography-only order). The
    // geography-optimized order is still computed above and still powers the
    // "Route friend" suggestion below - that's the right place for a
    // "here's a shorter loop if appointments were movable" idea, since it
    // already frames itself that way, rather than silently becoming the plan.
    const legs = this.buildRouteLegs(sorted, base);
    const activeLeg = this.getActiveRouteLeg(legs);
    const suggestions = this.buildSuggestions({
      sorted,
      mode,
      areas,
      areaJumps,
      repeatedReturn,
      optimized,
      currentLegKm,
      optimizedLegKm,
      savingKm,
      withCoords,
      base
    });

    return {
      mode,
      appointments: sorted,
      areas,
      areaSequence,
      areaJumps,
      repeatedReturn,
      currentLegKm,
      optimized,
      optimizedLegKm,
      savingKm,
      base,
      legs,
      activeLeg,
      efficiency,
      suggestions
    };
  },

  groupByArea(appointments) {
    return appointments.reduce((groups, appt) => {
      const area = this.getAreaLabel(appt);
      groups[area] = groups[area] || [];
      groups[area].push(appt);
      return groups;
    }, {});
  },

  findRepeatedAreaReturn(sequence) {
    const firstSeen = new Map();
    for (let i = 0; i < sequence.length; i++) {
      const area = sequence[i];
      if (!firstSeen.has(area)) {
        firstSeen.set(area, i);
        continue;
      }
      const previous = firstSeen.get(area);
      const middle = sequence.slice(previous + 1, i);
      if (middle.some(item => item !== area)) {
        return { area, fromIndex: previous, toIndex: i };
      }
    }
    return null;
  },

  calculateLegDistance(appointments) {
    let total = 0;
    const stops = appointments.filter(a => Array.isArray(a.latLng) && a.latLng.length === 2);
    for (let i = 1; i < stops.length; i++) {
      total += Geo.calculateDistance(
        stops[i - 1].latLng[0],
        stops[i - 1].latLng[1],
        stops[i].latLng[0],
        stops[i].latLng[1]
      );
    }
    return total;
  },

  calculateDayLoopDistance(appointments, base = null) {
    const stops = appointments.filter(a => Array.isArray(a.latLng) && a.latLng.length === 2);
    if (stops.length === 0) return 0;
    const baseLatLng = Array.isArray(base?.latLng) && base.latLng.length === 2 ? base.latLng : null;
    let total = 0;
    let current = baseLatLng || stops[0].latLng;
    const firstIndex = baseLatLng ? 0 : 1;

    for (let i = firstIndex; i < stops.length; i++) {
      total += Geo.calculateDistance(current[0], current[1], stops[i].latLng[0], stops[i].latLng[1]);
      current = stops[i].latLng;
    }

    if (baseLatLng && stops.length > 0) {
      const last = stops[stops.length - 1].latLng;
      total += Geo.calculateDistance(last[0], last[1], baseLatLng[0], baseLatLng[1]);
    }

    return total * 1.3;
  },

  calculateLegKm(fromLatLng, toLatLng) {
    if (!Array.isArray(fromLatLng) || !Array.isArray(toLatLng)) return 0;
    return Geo.calculateDistance(fromLatLng[0], fromLatLng[1], toLatLng[0], toLatLng[1]) * 1.3;
  },

  buildRouteLegs(appointments, base = null) {
    const stops = appointments.filter(a => a.address || Array.isArray(a.latLng));
    if (stops.length === 0) return [];

    const hasBase = base?.address || Array.isArray(base?.latLng);
    const startPoint = hasBase ? this.makeRoutePoint('base', base) : this.makeRoutePoint('appointment', stops[0]);
    const points = [
      startPoint,
      ...stops.map(appt => this.makeRoutePoint('appointment', appt))
    ];

    if (hasBase) {
      points.push(this.makeRoutePoint('base', base));
    }

    const legs = [];
    const startIndex = hasBase ? 0 : 1;
    for (let i = startIndex; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const distanceKm = this.calculateLegKm(from.latLng, to.latLng);
      legs.push({
        index: legs.length,
        from,
        to,
        distanceKm,
        etaMin: distanceKm > 0 ? Math.max(1, Math.round((distanceKm / 35) * 60)) : 0,
        appointmentId: to.type === 'appointment' ? to.appointment?.id : null,
        isReturn: to.type === 'base'
      });
    }

    return legs;
  },

  makeRoutePoint(type, item) {
    if (type === 'base') {
      return {
        type,
        label: 'Base',
        address: item?.address || CONFIG.businessAddress || '',
        latLng: Array.isArray(item?.latLng) ? item.latLng : null
      };
    }

    return {
      type,
      label: item.clientName || 'Visit',
      address: item.address || '',
      latLng: Array.isArray(item.latLng) ? item.latLng : null,
      appointment: item
    };
  },

  getActiveRouteLeg(legs) {
    if (!legs.length) return null;
    const nextVisitLeg = legs.find(leg => {
      if (leg.isReturn || !leg.to.appointment) return false;
      const appt = leg.to.appointment;
      return appt.status !== 'completed' && !appt.outcome;
    });
    return nextVisitLeg || legs.find(leg => leg.isReturn) || legs[legs.length - 1];
  },

  calculateRawLoopDistance(stops, base = null) {
    const routeStops = stops.filter(a => Array.isArray(a.latLng) && a.latLng.length === 2);
    if (routeStops.length === 0) return 0;
    const baseLatLng = Array.isArray(base?.latLng) && base.latLng.length === 2 ? base.latLng : null;
    let total = 0;
    let current = baseLatLng || routeStops[0].latLng;
    const firstIndex = baseLatLng ? 0 : 1;

    for (let i = firstIndex; i < routeStops.length; i++) {
      total += Geo.calculateDistance(current[0], current[1], routeStops[i].latLng[0], routeStops[i].latLng[1]);
      current = routeStops[i].latLng;
    }

    if (baseLatLng) {
      const last = routeStops[routeStops.length - 1].latLng;
      total += Geo.calculateDistance(last[0], last[1], baseLatLng[0], baseLatLng[1]);
    }

    return total;
  },

  optimizeDayLoopOrder(appointments, base = null) {
    const withCoords = appointments.filter(a => Array.isArray(a.latLng) && a.latLng.length === 2);
    const withoutCoords = appointments.filter(a => !Array.isArray(a.latLng) || a.latLng.length !== 2);
    if (withCoords.length < 2) return appointments;

    const baseLatLng = Array.isArray(base?.latLng) && base.latLng.length === 2 ? base.latLng : null;
    let ordered;

    if (baseLatLng && withCoords.length <= 8) {
      ordered = this.findBestLoopPermutation(withCoords, base);
    } else {
      ordered = this.improveRouteOrder(this.nearestNeighbourOrder(withCoords, base), base);
    }

    return [...ordered, ...withoutCoords];
  },

  findBestLoopPermutation(stops, base) {
    let bestRoute = stops;
    let bestDistance = Infinity;
    const used = new Array(stops.length).fill(false);
    const current = [];

    const search = () => {
      if (current.length === stops.length) {
        const distance = this.calculateRawLoopDistance(current, base);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRoute = [...current];
        }
        return;
      }

      for (let i = 0; i < stops.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        current.push(stops[i]);
        search();
        current.pop();
        used[i] = false;
      }
    };

    search();
    return bestRoute;
  },

  improveRouteOrder(route, base = null) {
    let best = [...route];
    let bestDistance = this.calculateRawLoopDistance(best, base);
    let improved = true;
    let guard = 0;

    while (improved && guard < 30) {
      improved = false;
      guard++;
      for (let i = 0; i < best.length - 1; i++) {
        for (let j = i + 1; j < best.length; j++) {
          const candidate = [
            ...best.slice(0, i),
            ...best.slice(i, j + 1).reverse(),
            ...best.slice(j + 1)
          ];
          const distance = this.calculateRawLoopDistance(candidate, base);
          if (distance + 0.01 < bestDistance) {
            best = candidate;
            bestDistance = distance;
            improved = true;
          }
        }
      }
    }

    return best;
  },

  nearestNeighbourOrder(appointments, base = null) {
    const withCoords = appointments.filter(a => Array.isArray(a.latLng) && a.latLng.length === 2);
    const withoutCoords = appointments.filter(a => !Array.isArray(a.latLng) || a.latLng.length !== 2);
    if (withCoords.length < 2) return appointments;

    const route = [];
    const unvisited = [...withCoords];
    const baseLatLng = Array.isArray(base?.latLng) && base.latLng.length === 2 ? base.latLng : null;
    let currentPoint = baseLatLng || withCoords[0].latLng;

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      unvisited.forEach((appt, index) => {
        const distance = Geo.calculateDistance(currentPoint[0], currentPoint[1], appt.latLng[0], appt.latLng[1]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      const next = unvisited.splice(nearestIndex, 1)[0];
      route.push(next);
      currentPoint = next.latLng;
    }
    return [...route, ...withoutCoords];
  },

  scoreEfficiency({ sorted, areas, areaJumps, repeatedReturn, savingKm, currentLegKm }) {
    if (sorted.length <= 1) return { label: 'Easy day', score: 100, tone: 'success' };
    let score = 100;
    score -= Math.max(0, Object.keys(areas).length - 1) * 10;
    score -= areaJumps * 6;
    if (repeatedReturn) score -= 18;
    if (currentLegKm > 0 && savingKm > 0) score -= Math.min(25, (savingKm / currentLegKm) * 60);
    score = Math.max(20, Math.round(score));
    if (score >= 78) return { label: 'Looks tidy', score, tone: 'success' };
    if (score >= 55) return { label: 'Could be smoother', score, tone: 'warning' };
    // Reserve 'danger' for actual errors/cancellations — route quality is a
    // suggestion, not a failure, so the worst band uses warning too.
    return { label: 'Worth rearranging', score, tone: 'warning' };
  },

  buildSuggestions({ sorted, mode, areas, areaJumps, repeatedReturn, optimized, currentLegKm, optimizedLegKm, savingKm, withCoords, base }) {
    const suggestions = [];
    const areaNames = Object.keys(areas);
    const fittingCount = sorted.filter(a => a.type === 'fitting').length;

    if (sorted.length === 0) {
      suggestions.push("Nothing booked yet. If leads come in, I'd group them by area before the day fills up.");
      return suggestions;
    }

    if (!base?.address) {
      suggestions.push('Add your business base in Settings so I can judge the true start and return mileage.');
    } else if (!base?.latLng) {
      suggestions.push('I have your base address. Once maps lookup is available, I can include the start and return legs more accurately.');
    } else {
      suggestions.push(`I am treating the day as base → ${sorted.length} stop${sorted.length === 1 ? '' : 's'} → base.`);
    }

    if (mode === 'fitting') {
      if (fittingCount > 4) {
        suggestions.push(`That is ${fittingCount} fittings. I would keep an eye on finish quality and avoid squeezing in another far-away one.`);
      } else if (fittingCount > 0) {
        suggestions.push(`${fittingCount} fitting${fittingCount === 1 ? '' : 's'} today. Nice if they stay in one or two areas; messy if they bounce around.`);
      }
    }

    if (areaNames.length >= 3) {
      suggestions.push(`You are touching ${areaNames.length} areas today: ${areaNames.slice(0, 4).join(', ')}. If any visit is movable, grouping by area would save headspace and mileage.`);
    } else if (areaNames.length === 2) {
      suggestions.push(`Two areas today: ${areaNames.join(' and ')}. I would try to clear one side of town before crossing over.`);
    } else {
      suggestions.push(`Area-wise, this looks calm: mostly ${areaNames[0] || 'one patch'}.`);
    }

    if (repeatedReturn) {
      suggestions.push(`Small flag: the route comes back to ${repeatedReturn.area} after leaving it. That is usually where the wasted driving hides.`);
    }

    if (withCoords.length >= 2 && savingKm >= 3) {
      suggestions.push(`If the times can move, a smoother base-to-base loop could save about ${Utils.formatDistance(savingKm)}.`);
    } else if (withCoords.length < 2 && sorted.length >= 2) {
      suggestions.push('I can judge this better after locations are geocoded, but the area order already gives a useful steer.');
    }

    if (mode === 'sales' && areaJumps > 2) {
      suggestions.push('For sales days, I would avoid big cross-town jumps before evening calls. They quietly steal selling energy.');
    }

    if (mode === 'fitting' && areaNames.length > 2) {
      suggestions.push('For fitting days, I would consider moving one fit to another day if it sits alone in a different area.');
    }

    if (suggestions.length === 0) {
      suggestions.push('This route looks reasonable. I would leave it alone unless a customer asks to move.');
    }

    return suggestions;
  },

  renderRoutePlan(plan) {
    const toneColor = {
      success: 'var(--secondary)',
      warning: 'var(--warning)',
      danger: 'var(--danger)'
    }[plan.efficiency.tone] || 'var(--primary)';
    const areaNames = Object.keys(plan.areas);
    const orderChanged = plan.optimized.map(a => a.id).join('|') !== plan.appointments.map(a => a.id).join('|');

    return `
      <div class="route-plan">
        <div class="route-plan-head">
          <div>
            <div style="font-weight:700;">Route friend</div>
            <div style="font-size:12px;color:var(--text-tertiary);">${plan.mode === 'fitting' ? 'Fitting day' : plan.mode === 'sales' ? 'Sales day' : 'Mixed day'} · ${areaNames.length || 0} area${areaNames.length === 1 ? '' : 's'}</div>
          </div>
          <span class="badge" style="background:${toneColor};color:white;">${Utils.escapeHtml(plan.efficiency.label)}</span>
        </div>

        <div class="route-plan-metrics">
          <div><strong>${plan.efficiency.score}%</strong><span>Flow</span></div>
          <div><strong>${plan.currentLegKm > 0 ? Utils.formatDistance(plan.currentLegKm) : '—'}</strong><span>Base loop</span></div>
          <div><strong>${plan.savingKm > 0 ? Utils.formatDistance(plan.savingKm) : '—'}</strong><span>Possible save</span></div>
        </div>

        ${this.renderLegTimeline(plan)}

        <div class="route-suggestions">
          ${plan.suggestions.slice(0, 3).map(text => `
            <div class="route-suggestion">
              <span class="material-symbols-rounded">lightbulb</span>
              <span>${Utils.escapeHtml(text)}</span>
            </div>
          `).join('')}
        </div>

        ${orderChanged ? `
          <div class="route-order">
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">If customers can move, I would try this order</div>
            ${plan.optimized.map((appt, index) => `
              <div class="route-order-row">
                <span>${index + 1}</span>
                <strong>${Utils.escapeHtml(Utils.formatTime(appt.date))}</strong>
                <em>${Utils.escapeHtml(appt.clientName || 'Visit')}</em>
                <small>${Utils.escapeHtml(this.getAreaLabel(appt))}</small>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  renderLegTimeline(plan) {
    if (!plan.legs?.length) return '';
    const activeIndex = plan.activeLeg?.index ?? 0;

    return `
      <div class="route-legs">
        <div class="route-legs-head">
          <span>Next destination</span>
          <strong>${Utils.escapeHtml(plan.activeLeg?.from.label || 'Base')} → ${Utils.escapeHtml(plan.activeLeg?.to.label || 'Visit')}</strong>
        </div>
        ${plan.legs.map((leg, index) => `
          <button class="route-leg ${index === activeIndex ? 'active' : ''}" onclick="RouteFeature.openLegRoute(${index})">
            <span class="route-leg-index">${leg.isReturn ? '<span class="material-symbols-rounded">home</span>' : index + 1}</span>
            <span class="route-leg-main">
              <strong>${Utils.escapeHtml(leg.from.label)} → ${Utils.escapeHtml(leg.to.label)}</strong>
              <small>${leg.distanceKm > 0 ? Utils.formatDistance(leg.distanceKm) : 'Distance pending'} · ${leg.etaMin > 0 ? `${leg.etaMin} min` : 'ETA pending'}</small>
            </span>
            <span class="material-symbols-rounded">navigation</span>
          </button>
        `).join('')}
      </div>
    `;
  },

  async activate() {
    // Wait for Leaflet to load
    if (!this.leafletLoaded) {
      let attempts = 0;
      while (!window.L && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (!window.L) {
        const mapEl = document.getElementById('route-map');
        if (!mapEl) return; // user already navigated away before the timeout fired
        const offline = !navigator.onLine;
        mapEl.innerHTML = `
          <div class="empty-state" style="height: 100%;">
            <span class="material-symbols-rounded">${offline ? 'wifi_off' : 'map'}</span>
            <div>${offline ? 'Map unavailable offline' : 'Map failed to load'}</div>
            <div style="font-size: 13px;">${offline ? 'Check your connection' : 'This can happen if the map service is temporarily unreachable'}</div>
            <button class="btn btn-outline btn-sm" style="margin-top:12px;" onclick="RouteFeature.retryMap()">Try again</button>
          </div>
        `;
        return;
      }
    }

    await this.initMap();
  },

  async retryMap() {
    const mapEl = document.getElementById('route-map');
    if (mapEl) {
      mapEl.innerHTML = `
        <div id="route-map-loading" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary);">
          <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 8px;">map</span>
          <div>Loading map...</div>
        </div>
      `;
    }
    if (!window.L) {
      this.leafletLoaded = false;
      this.init(); // re-attempt the script/CSS injection in case it failed the first time
    }
    await this.activate();
  },

  async initMap() {
    const mapEl = document.getElementById('route-map');
    if (!mapEl) return;

    // Get today's appointments
    const today = Utils.getToday();
    let appointments = [];
    try {
      appointments = await DB.getAppointmentsForDate(today.toISOString());
    } catch (e) {
      console.error('Failed to load appointments for map:', e);
    }
    const base = await this.getBasePoint();
    appointments = await this.ensureAppointmentCoords(appointments);
    const plan = this.analyseDay(appointments, today, base);
    const mapAppointments = plan.optimized || appointments;

    // Default center (UK)
    let center = [52.5, -1.5];
    let zoom = 6;

    // Prefer business base as the route centre
    try {
      if (Array.isArray(base?.latLng)) {
        center = base.latLng;
      } else {
        const pos = await Geo.getCurrentPosition();
        center = [pos.lat, pos.lng];
      }
      zoom = 10;
    } catch (e) {
      // Use first appointment location if available
      if (appointments.length > 0 && appointments[0].latLng) {
        center = appointments[0].latLng;
        zoom = 11;
      }
    }

    // Initialize map
    try {
      this.map = L.map('route-map', {
        zoomControl: false,
        attributionControl: false
      }).setView(center, zoom);

      // Add tile layer (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(this.map);
    } catch (e) {
      console.error('Map init failed:', e);
      mapEl.innerHTML = `
        <div class="empty-state" style="height: 100%;">
          <span class="material-symbols-rounded">map</span>
          <div>Could not load map</div>
        </div>
      `;
      return;
    }

    // Add markers
    this.markers = [];
    const bounds = L.latLngBounds();

    if (Array.isArray(base?.latLng)) {
      const baseMarker = L.marker(base.latLng).addTo(this.map);
      const baseIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="width: 30px; height: 30px; border-radius: 50%; background: var(--text-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">H</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      baseMarker.setIcon(baseIcon);
      baseMarker.bindPopup(`<div style="font-weight:600;">Business base</div><div style="font-size:12px;">${Utils.escapeHtml(base.address || '')}</div>`);
      bounds.extend(base.latLng);
    }

    for (let i = 0; i < mapAppointments.length; i++) {
      const appt = mapAppointments[i];
      let latLng = appt.latLng;

      // Try to geocode if no latLng
      if (!latLng && appt.address) {
        try {
          const geo = await Geo.geocode(appt.address);
          if (geo) {
            latLng = [geo.lat, geo.lng];
            // Save for future
            await DB.db.appointments.update(appt.id, { latLng });
          }
        } catch (e) {
          console.log('Geocoding failed for', appt.address);
        }
      }

      if (latLng) {
        const marker = L.marker(latLng).addTo(this.map);
        marker.bindPopup(`
          <div style="font-weight: 600;">${Utils.escapeHtml(appt.clientName || 'Unknown')}</div>
          <div style="font-size: 12px;">${Utils.formatTime(appt.date)}</div>
          <div style="font-size: 12px;">${Utils.escapeHtml(appt.address || '')}</div>
        `);

        // Add numbered icon
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${i + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        marker.setIcon(icon);

        this.markers.push(marker);
        bounds.extend(latLng);
      }
    }

    // Fit bounds if we have markers
    if (this.markers.length > 0) {
      this.map.fitBounds(bounds, { padding: [30, 30] });
    }

    // Calculate route stats
    this.drawRouteLine(plan.optimized, base);
    this.updateRouteStats(plan.optimized, base);
  },

  updateRouteStats(appointments, base = null) {
    const distanceKm = this.calculateDayLoopDistance(appointments, base);
    const time = Math.max(0, Math.round((distanceKm / 35) * 60));
    const mileageSaving = TaxCalculator.calculateMileageClaim(distanceKm);

    const distEl = document.getElementById('route-distance');
    const timeEl = document.getElementById('route-time');
    const savingEl = document.getElementById('route-saving');

    if (distEl) distEl.textContent = Utils.formatDistance(distanceKm);
    if (timeEl) timeEl.textContent = `${Math.round(time)} min`;
    if (savingEl) savingEl.textContent = Utils.formatCurrency(mileageSaving);
  },

  async optimizeRoute() {
    const today = Utils.getToday();
    let appointments = [];
    try {
      appointments = await DB.getAppointmentsForDate(today.toISOString());
    } catch (e) {
      Toast.show('Failed to load visits', 'error');
      return;
    }

    if (appointments.length < 2) {
      Toast.show('Need at least 2 visits to optimize', 'warning');
      return;
    }

    if (!this.map) {
      Toast.show('Map not ready yet', 'warning');
      return;
    }

    Toast.show('Optimizing route...', 'info');

    const base = await this.getBasePoint();
    appointments = await this.ensureAppointmentCoords(appointments);
    const optimized = this.optimizeDayLoopOrder(appointments, base);

    // Clear existing markers
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];

    // Add optimized markers
    const bounds = L.latLngBounds();
    if (Array.isArray(base?.latLng)) {
      bounds.extend(base.latLng);
    }

    for (let i = 0; i < optimized.length; i++) {
      const appt = optimized[i];
      if (appt.latLng) {
        const marker = L.marker(appt.latLng).addTo(this.map);

        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="width: 28px; height: 28px; border-radius: 50%; background: ${i === 0 ? 'var(--secondary)' : 'var(--primary)'}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${i + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        marker.setIcon(icon);

        marker.bindPopup(`
          <div style="font-weight: 600;">${Utils.escapeHtml(appt.clientName || 'Unknown')}</div>
          <div style="font-size: 12px;">${Utils.formatTime(appt.date)}</div>
          <div style="font-size: 12px;">${Utils.escapeHtml(appt.address || '')}</div>
          ${i === 0 ? '<div style="font-size: 11px; color: var(--secondary); margin-top: 4px;">First after base</div>' : ''}
          <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">Shortest-drive order - check against booked time</div>
        `);

        this.markers.push(marker);
        bounds.extend(appt.latLng);
      }
    }

    if (this.markers.length > 0) {
      this.map.fitBounds(bounds, { padding: [30, 30] });
    }

    this.drawRouteLine(optimized, base);

    Toast.show('Shortest-drive order shown - may not match your booked appointment times', 'info');
    this.updateRouteStats(optimized, base);
  },

  drawRouteLine(appointments, base = null) {
    if (!this.map) return;
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
    }

    const stops = appointments.filter(a => Array.isArray(a.latLng) && a.latLng.length === 2).map(a => a.latLng);
    if (stops.length === 0) return;
    const latLngs = Array.isArray(base?.latLng) ? [base.latLng, ...stops, base.latLng] : stops;
    if (latLngs.length > 1) {
      this.routeLine = L.polyline(latLngs, {
        color: 'var(--primary)',
        weight: 3,
        opacity: 0.7,
        dashArray: '10, 10'
      }).addTo(this.map);
    }
  },

  async openTodayRoute() {
    const today = Utils.getToday();
    let appointments = [];
    try {
      appointments = await DB.getAppointmentsForDate(today.toISOString());
    } catch (e) {}
    if (appointments.length === 0) {
      Toast.show('No visits to route today', 'info');
      return;
    }
    const base = await this.getBasePoint();
    appointments = await this.ensureAppointmentCoords(appointments);
    // Appointment times are confirmed commitments, not just waypoints to
    // reshuffle for a shorter drive - same reasoning as analyseDay(). Use
    // time order here too, not the geography-only optimized order.
    const ordered = this.sortByTime(appointments);
    const stops = ordered.map(a => a.address).filter(Boolean);
    if (stops.length === 0) {
      Toast.show('Add addresses before opening the day route', 'warning');
      return;
    }
    const origin = base?.address || stops[0];
    const destination = base?.address || stops[stops.length - 1];
    const waypoints = base?.address ? stops : stops.slice(1, -1);
    const url = this.buildDayRouteUrl(origin, waypoints, destination);
    window.open(url, '_blank');
  },

  buildDayRouteUrl(origin, waypoints, destination) {
    const params = new URLSearchParams({
      api: '1',
      origin: origin || '',
      destination: destination || ''
    });
    if (waypoints.length > 0) {
      params.set('waypoints', waypoints.join('|'));
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  },

  async openLegRoute(index) {
    const today = Utils.getToday();
    let appointments = [];
    try {
      appointments = await DB.getAppointmentsForDate(today.toISOString());
    } catch (e) {}
    const base = await this.getBasePoint();
    appointments = await this.ensureAppointmentCoords(appointments);
    // Must match the order analyseDay() actually displays (time order) or
    // tapping "leg 3" could open directions for whichever stop happens to
    // land at index 3 in the geography-optimized order instead.
    const ordered = this.sortByTime(appointments);
    const legs = this.buildRouteLegs(ordered, base);
    const leg = legs[index];
    if (!leg) return;

    const origin = leg.from.address || leg.from.label;
    const destination = leg.to.address || leg.to.label;
    if (!destination) {
      Toast.show('Add the destination address first', 'warning');
      return;
    }
    window.open(Geo.buildNavigationUrl(destination, origin), '_blank');
  },

  focusMarker(index) {
    if (this.markers[index]) {
      this.markers[index].openPopup();
      this.map.panTo(this.markers[index].getLatLng());
    }
  },

  deactivate() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.markers = [];
    this.routeLine = null;
  }
};

App.registerFeature(RouteFeature);
