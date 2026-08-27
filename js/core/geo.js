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

  // Initialize geolocation tracking
  init() {
    if ('geolocation' in navigator) {
      this.getCurrentPosition().catch(e => {
        console.log('Initial position unavailable:', e && e.message ? e.message : e);
      });
    }
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
          arrivedAt: Date.now()
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

  _isIOS() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    return /iPad|iPhone|iPod/i.test(ua) ||
      (/Mac/i.test(platform) && Number(navigator.maxTouchPoints || 0) > 1);
  },

  buildAppleMapsUrl(destination, origin = '') {
    const dest = encodeURIComponent(destination || '');
    const from = origin ? `&saddr=${encodeURIComponent(origin)}` : '';
    return `maps://?daddr=${dest}${from}&dirflg=d`;
  },

  _handoffNavigationUrl(url) {
    if (!url) return;
    // A new browsing context makes installed iOS PWAs keep universal links in
    // Safari. A same-context handoff lets iOS resolve maps:// (or a universal
    // HTTPS route) to the installed navigation app.
    if (this._isIOS()) {
      if (window.location && typeof window.location.assign === 'function') {
        window.location.assign(url);
      } else {
        window.location.href = url;
      }
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  // Open a single destination in the native Apple Maps app on iPhone/iPad.
  // Other platforms retain the provider's HTTPS navigation handoff.
  openNavigation(destination, origin = '') {
    const url = this._isIOS()
      ? this.buildAppleMapsUrl(destination || '', origin || '')
      : this.buildNavigationUrl(destination || '', origin || '');
    this._handoffNavigationUrl(url);
  },

  // Multi-stop Google routes have no equivalent Apple Maps URL scheme. Use a
  // same-context universal-link handoff on iOS so Google Maps can claim it.
  openNavigationUrl(url) {
    this._handoffNavigationUrl(url);
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
