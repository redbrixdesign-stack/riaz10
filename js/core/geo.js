/* ============================================
   ADVISOROS v5.0 — GEOLOCATION & ROUTING
   ============================================ */

const Geo = {
  currentPosition: null,
  watchId: null,

  // ---- Rate-limiting & resilience ----
  _requestCache: new Map(),          // deduplicate in-flight identical requests
  _lastRequestTime: 0,               // throttle: timestamp of last external request
  _minRequestInterval: 1200,         // ms: minimum gap between Nominatim/OSRM calls
  _backoffUntil: 0,                  // ms timestamp: stop all requests until this time
  _consecutiveErrors: 0,             // for exponential backoff
  _maxRetries: 2,
  // ---- Rate-limiting helpers ----
  // Deduplicate identical in-flight requests; throttle overall frequency;
  // retry with exponential backoff; warn the user if we're being rate-limited.
  async _fetchWithRateLimit(url, options = {}) {
    const cacheKey = url;

    // 1) Deduplication: if an identical request is already in flight, return its promise
    if (this._requestCache.has(cacheKey)) {
      return this._requestCache.get(cacheKey);
    }

    // 2) Throttle: wait until minimum interval has passed since last request
    const now = Date.now();
    const wait = this._lastRequestTime + this._minRequestInterval - now;
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }

    // 3) Backoff: if we've been rate-limited recently, abort with a user-facing warning
    if (Date.now() < this._backoffUntil) {
      const seconds = Math.ceil((this._backoffUntil - Date.now()) / 1000);
      throw new Error(`Rate limit active — retry in ${seconds}s`);
    }

    const attempt = async (retry = 0) => {
      this._lastRequestTime = Date.now();
      try {
        const resp = await fetch(url, options);
        if (resp.status === 429) {
          throw new Error('429');
        }
        if (!resp.ok) {
          throw new Error(`${resp.status}`);
        }
        this._consecutiveErrors = 0;
        return resp;
      } catch (err) {
        // Exponential backoff on network errors or 429
        const isRateLimit = err.message === '429' || (err.message && err.message.includes('429'));
        if (isRateLimit) {
          this._consecutiveErrors++;
          const backoffMs = Math.min(30000, 2000 * Math.pow(2, this._consecutiveErrors));
          this._backoffUntil = Date.now() + backoffMs;
          if (retry === 0) {
            Toast.show('Mapping service rate limit hit — slowing down', 'warning');
          }
        }
        if (retry < this._maxRetries && (isRateLimit || !err.message || !err.message.includes('Failed to fetch'))) {
          const delay = 1000 * Math.pow(2, retry);
          await new Promise(r => setTimeout(r, delay));
          return attempt(retry + 1);
        }
        throw err;
      }
    };

    const promise = attempt().finally(() => {
      this._requestCache.delete(cacheKey);
    });
    this._requestCache.set(cacheKey, promise);
    return promise;
  },

  // ---- Live trip tracking ----
  // activeTrip: { id, startTime, startLocation, destinationAddress, destination:{lat,lng}|null,
  //               appointmentId, distanceKm, path:[{lat,lng}], lastPos:{lat,lng} }
  activeTrip: null,
  finishingTrip: false,  // true only for the moment a finishTrip() save is in flight
  ARRIVAL_RADIUS_KM: 0.15,   // auto-finish once within ~150m of the destination
  MIN_MOVE_KM: 0.02,         // ignore GPS jitter under ~20m when accumulating distance
  MIN_UNDERWAY_KM: 0.3,      // must have travelled this far before auto-finish can trigger

  // Initialize geolocation tracking
  init() {
    if ('geolocation' in navigator) {
      // Get initial position. Fire-and-forget by design (init() shouldn't
      // block app startup on GPS), but that means nothing else is watching
      // this promise — a denied/unavailable permission (very normal on a
      // first PWA launch) would otherwise surface as an unhandled promise
      // rejection on every single app load.
      this.getCurrentPosition().catch(e => {
        console.log('Initial position unavailable:', e && e.message ? e.message : e);
      });
    }
    // Resume a trip that was in progress if the app was reloaded mid-journey
    this.restoreActiveTrip();

    // GPS tracking pauses while the tab/PWA is backgrounded (e.g. while Google/Apple Maps
    // has focus for turn-by-turn). The moment you switch back to AdvisorOS — say, to check
    // your next job after parking — re-check position immediately so arrival isn't missed.
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

      // Bring lastPos (and the path) up to date with where we actually are BEFORE any
      // possible finishTrip() below. Otherwise finishTrip()'s road-distance fallback
      // measures from the stale pre-background point (e.g. still near the trip start)
      // instead of the real arrival point — which is how a trip driven mostly in Maps,
      // out of AdvisorOS's sight, could get logged as almost zero miles.
      if (segment >= this.MIN_MOVE_KM) {
        this.activeTrip.distanceKm += segment;
        this.activeTrip.path.push({ lat: pos.lat, lng: pos.lng });
      }
      this.activeTrip.lastPos = { lat: pos.lat, lng: pos.lng };
      this.persistActiveTrip();

      // Same MIN_UNDERWAY_KM guard as onTripPositionUpdate: without it, a trip
      // started right next to its destination (then immediately backgrounded
      // for turn-by-turn) could auto-finish here on first resume, logging
      // ~0 miles for a trip that hasn't actually happened yet.
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
  // destinationAddress is optional — if given, the trip auto-finishes and logs itself
  // once GPS shows you within ARRIVAL_RADIUS_KM of it. Without one, tap Finish to end it.
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

    // Additive-only fields — travelStatus/travelStartedAt aren't in the Dexie
    // index string (js/core/db.js), so this needs no schema version bump.
    // Existing code that checks appointment.status ('confirmed'/'completed'/
    // 'cancelled') is untouched; travelStatus is a separate, orthogonal flag
    // that only the home screen controller reads.
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
    Toast.show(destination ? "Trip started — I'll check for arrival whenever you reopen AdvisorOS" : 'Trip started', 'success');
    return this.activeTrip;
  },

  onTripPositionUpdate(position) {
    if (!this.activeTrip) return;
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const last = this.activeTrip.lastPos;
    const segment = this.calculateDistance(last.lat, last.lng, lat, lng);

    // Ignore GPS jitter under MIN_MOVE_KM so a stationary phone doesn't rack up distance
    if (segment >= this.MIN_MOVE_KM) {
      this.activeTrip.distanceKm += segment;
      this.activeTrip.path.push({ lat, lng });
      this.activeTrip.lastPos = { lat, lng };
      this.persistActiveTrip();
      this.updateTripBanner();
    } else {
      this.activeTrip.lastPos = { lat, lng };
    }

    // Auto-finish once genuinely close to the destination. The MIN_UNDERWAY_KM guard stops
    // it firing immediately if you happen to start the trip right next to the destination.
    if (this.activeTrip.destination && this.activeTrip.distanceKm >= this.MIN_UNDERWAY_KM) {
      const distToDest = this.calculateDistance(lat, lng, this.activeTrip.destination.lat, this.activeTrip.destination.lng);
      if (distToDest <= this.ARRIVAL_RADIUS_KM) {
        this.finishTrip({ auto: true });
      }
    }
  },

  async finishTrip({ auto = false } = {}) {
    // Guards against a double-save: auto-finish (from onTripPositionUpdate or a resume
    // check) and a manual tap of the Finish button can land within the same moment.
    // Without this, both calls would pass the "is there a trip?" check below before
    // either had cleared it, and the trip would get logged to the DB twice.
    if (!this.activeTrip || this.finishingTrip) return null;
    this.finishingTrip = true;
    const trip = this.activeTrip;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    // Best-effort distance from whatever GPS points we captured (works well if the app
    // stayed foregrounded). If the phone was mostly in Maps for turn-by-turn, this path
    // is likely just a couple of points, so also try a real road-distance lookup between
    // the start and last-known points — much closer to true mileage than a straight line.
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

  // Real road distance between two points via OSRM's public routing API (no API key needed).
  // Returns km, or null if the lookup fails (e.g. offline) so callers can fall back gracefully.
  async getDrivingDistanceKm(fromLat, fromLng, toLat, toLng) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
      const response = await this._fetchWithRateLimit(url);
      const data = await response.json();
      if (data?.routes?.[0]?.distance) {
        return data.routes[0].distance / 1000;
      }
      return null;
    } catch (err) {
      console.log('Road-distance lookup failed, using GPS path instead:', err);
      return null;
    }
  },

  async getDrivingRouteSummary(fromLat, fromLng, toLat, toLng) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
      const response = await this._fetchWithRateLimit(url);
      const data = await response.json();
      const route = data?.routes?.[0];
      if (route?.distance) {
        return {
          distanceKm: route.distance / 1000,
          durationMin: route.duration ? Math.round(route.duration / 60) : null,
          source: 'road'
        };
      }
    } catch (err) {
      console.log('Route summary lookup failed, using estimate:', err);
    }

    const straightKm = this.calculateDistance(fromLat, fromLng, toLat, toLng);
    const distanceKm = straightKm * 1.3;
    return {
      distanceKm,
      durationMin: Math.max(5, Math.round((distanceKm / 35) * 60)),
      source: 'estimate'
    };
  },

  cancelTrip() {
    if (!this.activeTrip) return;
    // If a finish is already saving in the background (see finishTrip's guard), let it
    // complete instead of nulling activeTrip out from under it.
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

  // Resume a trip that was mid-journey if the page reloaded (distance already logged survives)
  restoreActiveTrip() {
    try {
      const raw = localStorage.getItem('advisoros_active_trip');
      if (!raw) return;
      const trip = JSON.parse(raw);
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

  // ---- Persistent "trip in progress" banner (survives screen navigation) ----
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
        <button class="btn btn-sm btn-ghost" onclick="Geo.cancelTrip()" title="Cancel trip">
          <span class="material-symbols-rounded">close</span>
        </button>
        <button class="btn btn-sm btn-primary" onclick="Geo.finishTrip()">Finish</button>
      </div>
    `;
  },

  removeTripBanner() {
    const el = document.getElementById('trip-banner');
    if (el) el.remove();
    document.body.classList.remove('trip-active');
  },

  // Calculate distance between two points (Haversine)
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(deg) {
    return deg * (Math.PI / 180);
  },

  // Geocode address to lat/lng
  async geocode(address) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
      const response = await this._fetchWithRateLimit(url);
      const data = await response.json();
      if (data && data[0]) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
      }
      return null;
    } catch (err) {
      console.error('Geocoding failed:', err);
      return null;
    }
  },

  // Build route URL for external navigation
  buildNavigationUrl(destination, origin = '') {
    const dest = encodeURIComponent(destination);
    const from = origin ? `&origin=${encodeURIComponent(origin)}` : '';
    return `https://www.google.com/maps/dir/?api=1${from}&destination=${dest}`;
  },

  // Optimize route for multiple stops (TSP approximation)
  async optimizeRoute(appointments, startLocation = null) {
    if (!startLocation && this.currentPosition) {
      startLocation = [this.currentPosition.lat, this.currentPosition.lng];
    }

    if (!startLocation || appointments.length < 2) {
      return appointments;
    }

    // Simple nearest-neighbor TSP
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

  // Calculate total route distance
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
