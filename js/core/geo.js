/* ============================================
   ADVISOROS v5.0 — GEOLOCATION & ROUTING
   Uses GeoProvider abstraction (PublicGeoProvider by default).
   ============================================ */

const Geo = {
  currentPosition: null,
  watchId: null,

  // Safe JSON.parse wrapper with debugging for corrupted stored data
  safeJSONParse(str, key) {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch (e) {
      const preview = str.slice(0, 500);
      console.error(`JSON.parse failed for localStorage key "${key}":`, e.message);
      console.error(`Corrupted value preview: ${preview}`);
      try { localStorage.removeItem(key); } catch (err) {}
      throw e;
    }
  },

  // ---- Live trip tracking ----
  // activeTrip: { id, startTime, startLocation, destinationAddress, destination:{lat,lng}|null,
  //               appointmentId, distanceKm, path:[{lat,lng}], lastPos:{lat,lng} }
  activeTrip: null,
  finishingTrip: false,
  ARRIVAL_RADIUS_KM: 0.15,
  MIN_MOVE_KM: 0.02,
  MIN_UNDERWAY_KM: 0.3,

  // Provider accessor
  _provider() {
    return GeoProviderRegistry.get();
  },

  // Initialize trip state without requesting location on app launch. Location
  // permission is requested only from a user action that needs it (start trip,
  // live ETA, route map without a base), or when resuming a trip the user
  // explicitly started earlier.
  init() {
    this.restoreActiveTrip();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.activeTrip) {
        this.checkArrivalOnResume();
      }
    });
  },

  async checkArrivalOnResume() {
    if (!this.activeTrip) return;
    try {
      const pos = await this.getCurrentPosition();
      const last = this.activeTrip.lastPos;
      const segment = last ? this.calculateDistance(last.lat, last.lng, pos.lat, pos.lng) : 0;

      if (segment >= this.MIN_MOVE_KM) {
        this.activeTrip.distanceKm += segment;
        this.activeTrip.path.push({ lat: pos.lat, lng: pos.lng });
      }
      this.activeTrip.lastPos = { lat: pos.lat, lng: pos.lng };
      this.persistActiveTrip();

      if (this.activeTrip.destination && this.activeTrip.distanceKm >= this.MIN_UNDERWAY_KM) {
        const distToDest = this.calculateDistance(pos.lat, pos.lng, this.activeTrip.destination.lat, this.activeTrip.destination.lng);
        if (distToDest <= this.ARRIVAL_RADIUS_KM) {
          this.finishTrip({ auto: true });
          return;
        }
      }

      this.updateTripBanner();
    } catch (e) {
      console.log('Arrival re-check skipped:', e);
    }
  },

  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation not available'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        pos => {
          this.currentPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp
          };
          resolve(this.currentPosition);
        },
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  },

  // ---- Start / Stop / auto-finish a live trip ----
  async startTrip({ destinationAddress = '', appointmentId = null } = {}) {
    if (this.activeTrip) {
      Toast.show('A trip is already in progress', 'info');
      return this.activeTrip;
    }

    let startPos;
    try {
      startPos = await this.getCurrentPosition();
    } catch (e) {
      Toast.show('Could not get your location. Check location permissions and try again.', 'error');
      return null;
    }

    let destination = null;
    if (destinationAddress) {
      const geocoded = await this.geocode(destinationAddress);
      if (geocoded) destination = { lat: geocoded.lat, lng: geocoded.lng };
    }

    this.activeTrip = {
      id: Utils.generateId('trip'),
      startTime: new Date().toISOString(),
      startLocation: 'Trip start',
      destinationAddress,
      destination,
      appointmentId,
      distanceKm: 0,
      path: [{ lat: startPos.lat, lng: startPos.lng }],
      lastPos: { lat: startPos.lat, lng: startPos.lng }
    };
    this.persistActiveTrip();

    if (appointmentId) {
      try {
        await DB.db.appointments.update(appointmentId, {
          travelStatus: 'in_transit',
          travelStartedAt: Date.now()
        });
      } catch (e) { console.log('travelStatus update (in_transit) failed:', e); }
    }

    this.watchId = navigator.geolocation.watchPosition(
      pos => this.onTripPositionUpdate(pos),
      err => console.log('Trip GPS error:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    this.renderTripBanner();
    Toast.show(destination ? "Trip started — I'll check for arrival whenever you reopen Beelo" : 'Trip started', 'success');
    return this.activeTrip;
  },

  onTripPositionUpdate(position) {
    if (!this.activeTrip) return;
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const last = this.activeTrip.lastPos;
    const segment = this.calculateDistance(last.lat, last.lng, lat, lng);

    if (segment >= this.MIN_MOVE_KM) {
      this.activeTrip.distanceKm += segment;
      this.activeTrip.path.push({ lat, lng });
      this.activeTrip.lastPos = { lat, lng };
      this.persistActiveTrip();
      this.updateTripBanner();
    } else {
      this.activeTrip.lastPos = { lat, lng };
    }

    if (this.activeTrip.destination && this.activeTrip.distanceKm >= this.MIN_UNDERWAY_KM) {
      const distToDest = this.calculateDistance(lat, lng, this.activeTrip.destination.lat, this.activeTrip.destination.lng);
      if (distToDest <= this.ARRIVAL_RADIUS_KM) {
        this.finishTrip({ auto: true });
      }
    }
  },

  async finishTrip({ auto = false } = {}) {
    if (!this.activeTrip || this.finishingTrip) return null;
    this.finishingTrip = true;
    const trip = this.activeTrip;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    let distanceKm = Math.max(trip.distanceKm, 0);
    const start = trip.path[0];
    const end = trip.lastPos;
    if (start && end) {
      const roadKm = await this.getDrivingDistanceKm(start.lat, start.lng, end.lat, end.lng);
      if (roadKm !== null && roadKm > distanceKm) {
        distanceKm = roadKm;
      }
    }

    try {
      await DB.addTrip({
        date: trip.startTime,
        startLocation: trip.startLocation,
        endLocation: trip.destinationAddress || 'Trip end',
        distanceKm,
        purpose: 'business',
        appointmentId: trip.appointmentId,
        autoTracked: true
      });
      const distance = CONFIG.distanceUnit === 'miles' ? distanceKm * 0.621371 : distanceKm;
      Toast.show(`${auto ? 'Arrived — trip' : 'Trip'} logged: ${distance.toFixed(1)} ${CONFIG.distanceUnit}`, 'success');
    } catch (e) {
      console.error('Failed to save trip:', e);
      Toast.show('Could not save trip', 'error');
    }

    if (trip.appointmentId) {
      try {
        await DB.db.appointments.update(trip.appointmentId, {
          travelStatus: 'on_site',
          arrivedAt: Date.now(),
          leftAt: null,
          onSiteDurationMinutes: null
        });
      } catch (e) { console.log('travelStatus update (on_site) failed:', e); }
    }

    this.activeTrip = null;
    this.finishingTrip = false;
    this.clearPersistedTrip();
    this.removeTripBanner();

    if (App.currentFeature && ['today', 'money'].includes(App.currentFeature.id)) {
      App.navigate(App.currentFeature.id);
    }
    return distanceKm;
  },

  // Delegate to provider for road distance
  async getDrivingDistanceKm(fromLat, fromLng, toLat, toLng) {
    return this._provider().getDistanceKm(fromLat, fromLng, toLat, toLng);
  },

  async getDrivingRouteSummary(fromLat, fromLng, toLat, toLng) {
    return this._provider().getRouteSummary(fromLat, fromLng, toLat, toLng);
  },

  cancelTrip() {
    if (!this.activeTrip) return;
    if (this.finishingTrip) {
      Toast.show('Trip is already being saved', 'info');
      return;
    }
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.activeTrip = null;
    this.clearPersistedTrip();
    this.removeTripBanner();
    Toast.show('Trip cancelled', 'info');
  },

  persistActiveTrip() {
    try { localStorage.setItem('advisoros_active_trip', JSON.stringify(this.activeTrip)); } catch (e) {}
  },

  clearPersistedTrip() {
    try { localStorage.removeItem('advisoros_active_trip'); } catch (e) {}
  },

  restoreActiveTrip() {
    try {
      const raw = localStorage.getItem('advisoros_active_trip');
      if (!raw) return;
      const trip = this.safeJSONParse(raw, 'advisoros_active_trip');
      if (!trip) return;
      this.activeTrip = trip;
      this.watchId = navigator.geolocation.watchPosition(
        pos => this.onTripPositionUpdate(pos),
        err => console.log('Trip GPS error:', err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
      this.renderTripBanner();
    } catch (e) {
      console.log('Could not restore active trip:', e);
    }
  },

  // ---- Persistent "trip in progress" banner ----
  renderTripBanner() {
    if (!this.activeTrip) return;
    let el = document.getElementById('trip-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'trip-banner';
      el.className = 'trip-banner';
      const app = document.getElementById('app');
      const nav = document.getElementById('bottom-nav');
      app.insertBefore(el, nav);
    }
    document.body.classList.add('trip-active');
    this.updateTripBanner();
  },

  updateTripBanner() {
    const el = document.getElementById('trip-banner');
    if (!el || !this.activeTrip) return;
    const distanceKm = this.activeTrip.distanceKm || 0;
    const distance = CONFIG.distanceUnit === 'miles' ? distanceKm * 0.621371 : distanceKm;
    el.innerHTML = `
      <div class="trip-banner-inner">
        <span class="material-symbols-rounded">directions_car</span>
        <div class="trip-banner-text">
          <strong>Trip in progress</strong>
          <span>${distance.toFixed(1)} ${CONFIG.distanceUnit}${this.activeTrip.destination ? ' · finishes when you arrive & reopen the app' : ''}</span>
        </div>
        <button class="btn btn-sm btn-ghost" data-action="Geo.cancelTrip" title="Cancel trip">
          <span class="material-symbols-rounded">close</span>
        </button>
        <button class="btn btn-sm btn-primary" data-action="Geo.finishTrip">Finish</button>
      </div>
    `;
  },

  removeTripBanner() {
    const el = document.getElementById('trip-banner');
    if (el) el.remove();
    document.body.classList.remove('trip-active');
  },

  // Local Haversine (no network)
  calculateDistance(lat1, lng1, lat2, lng2) {
    return this._provider().calculateDistance(lat1, lng1, lat2, lng2);
  },

  // Geocode delegates to provider
  async geocode(address) {
    return this._provider().geocode(address);
  },

  // Navigation handoff delegates to provider
  buildNavigationUrl(destination, origin = '') {
    return this._provider().buildNavigationUrl(destination, origin);
  },

  // Build a universal link for the navigation app selected by the advisor.
  // Universal links are preferable to app-only schemes here: they open the
  // installed app when available and retain a useful web fallback otherwise.
  buildNavigationAppUrl(provider, destination, origin = '') {
    const dest = encodeURIComponent(destination || '');
    const from = origin ? encodeURIComponent(origin) : '';

    if (provider === 'apple') {
      return `https://maps.apple.com/?daddr=${dest}${from ? `&saddr=${from}` : ''}&dirflg=d`;
    }
    if (provider === 'waze') {
      return `https://www.waze.com/ul?q=${dest}&navigate=yes`;
    }
    return this.buildNavigationUrl(destination || '', origin || '');
  },

  openNavigationChooser(destination, origin = '', appointmentId = null) {
    const address = String(destination || '').trim();
    if (!address) {
      Toast.show('Add the destination address first', 'warning');
      return;
    }

    const preferred = ['apple', 'google', 'waze'].includes(CONFIG.navigationApp)
      ? CONFIG.navigationApp
      : 'ask';
    if (preferred !== 'ask') {
      this.launchNavigationChoice(preferred, address, origin || '', appointmentId);
      return;
    }

    const actionArgs = provider => Utils.escapeHtml(JSON.stringify([
      provider,
      address,
      origin || '',
      appointmentId
    ]));

    App.openModal(`
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <h3>Choose navigation app</h3>
          <div class="fs-12 text-secondary mt-2">${Utils.escapeHtml(address)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" aria-label="Close" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="nav-app-list" role="group" aria-label="Navigation apps">
          <button class="nav-app-option" type="button" data-action="Geo.launchNavigationChoice" data-args='${actionArgs('apple')}'>
            <span class="nav-app-icon nav-app-icon--apple material-symbols-rounded" aria-hidden="true">map</span>
            <span><strong>Apple Maps</strong><small>Best integrated with iPhone</small></span>
            <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
          </button>
          <button class="nav-app-option" type="button" data-action="Geo.launchNavigationChoice" data-args='${actionArgs('google')}'>
            <span class="nav-app-icon nav-app-icon--google material-symbols-rounded" aria-hidden="true">location_on</span>
            <span><strong>Google Maps</strong><small>Opens the app or web directions</small></span>
            <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
          </button>
          <button class="nav-app-option" type="button" data-action="Geo.launchNavigationChoice" data-args='${actionArgs('waze')}'>
            <span class="nav-app-icon nav-app-icon--waze material-symbols-rounded" aria-hidden="true">directions_car</span>
            <span><strong>Waze</strong><small>Live traffic and road alerts</small></span>
            <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
          </button>
        </div>
        <p class="hint mt-md mb-0">Beelo stays available when you return. Set a default in Settings → Navigation, or keep choosing each time.</p>
      </div>
    `);
  },

  launchNavigationChoice(provider, destination, origin = '', appointmentId = null) {
    const url = this.buildNavigationAppUrl(provider, destination, origin);
    if (!url) return;

    App.closeModal();

    // Begin tracking from the same deliberate tap. Do not await location here:
    // the navigation hand-off should remain immediate even if GPS is slow.
    Promise.resolve(this.startTrip({ destinationAddress: destination || '', appointmentId }))
      .then(() => {
        if (appointmentId && typeof MessageScheduler !== 'undefined' && typeof MessageScheduler.onDeparture === 'function') {
          try { MessageScheduler.onDeparture(appointmentId); } catch (e) { /* scheduler optional */ }
        }
      })
      .catch(e => console.log('Trip start from navigation skipped:', e));

    this.launchExternalUrl(url);
  },

  // A same-context hand-off avoids the empty Safari/PWA overlay produced by
  // window.open(..., '_blank') on iPhone. External universal links still open
  // their native app (when installed), while Beelo remains ready on return.
  launchExternalUrl(url) {
    if (!url) return;
    if (window.location && typeof window.location.assign === 'function') {
      window.location.assign(url);
    } else {
      window.location.href = url;
    }
  },

  openNavigation(destination, origin = '', appointmentId = null) {
    this.openNavigationChooser(destination, origin, appointmentId);
  },

  // Optimize route for multiple stops (TSP approximation) - uses local calculateDistance
  async optimizeRoute(appointments, startLocation = null) {
    if (!startLocation && this.currentPosition) {
      startLocation = [this.currentPosition.lat, this.currentPosition.lng];
    }

    if (!startLocation || appointments.length < 2) {
      return appointments;
    }

    const unvisited = [...appointments];
    const route = [];
    let current = startLocation;

    while (unvisited.length > 0) {
      let nearest = null;
      let nearestDist = Infinity;
      let nearestIndex = -1;

      for (let i = 0; i < unvisited.length; i++) {
        const appt = unvisited[i];
        if (!appt.latLng) continue;

        const dist = this.calculateDistance(
          current[0], current[1],
          appt.latLng[0], appt.latLng[1]
        );

        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = appt;
          nearestIndex = i;
        }
      }

      if (nearest) {
        route.push(nearest);
        current = nearest.latLng;
        unvisited.splice(nearestIndex, 1);
      } else {
        break;
      }
    }

    return route;
  },

  // Calculate total route distance - uses local calculateDistance
  calculateRouteDistance(appointments, startLocation = null) {
    if (!startLocation && this.currentPosition) {
      startLocation = [this.currentPosition.lat, this.currentPosition.lng];
    }

    if (!startLocation || appointments.length === 0) return 0;

    let total = 0;
    let current = startLocation;

    for (const appt of appointments) {
      if (appt.latLng) {
        total += this.calculateDistance(
          current[0], current[1],
          appt.latLng[0], appt.latLng[1]
        );
        current = appt.latLng;
      }
    }

    return total;
  },

  // Cleanup
  destroy() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
};

if (typeof window !== 'undefined') window.Geo = Geo;
if (typeof module !== 'undefined') module.exports = { Geo };
