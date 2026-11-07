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
      console.error(`JSON.parse failed for localStorage key "${key}":`, e.message);
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
  async init() {
    await this.restoreActiveTrip();
    if(typeof VisitTiming!=='undefined')await VisitTiming.init();

    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState==='visible'){if(this.activeTrip)this.checkArrivalOnResume();if(typeof VisitTiming!=='undefined')VisitTiming.resume();}
      else if(typeof VisitTiming!=='undefined')VisitTiming.suspend();
    });
  },

  async checkArrivalOnResume() {
    if (!this.activeTrip || this.finishingTrip || this.activeTrip.saveFailed) return;
    try {
      const pos = await this.getCurrentPosition();
      this.onTripPositionUpdate({coords:{latitude:pos.lat,longitude:pos.lng,accuracy:pos.accuracy,speed:pos.speed},timestamp:pos.timestamp});
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
            speed: pos.coords.speed,
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
  async startTrip(options = {}) {
    if(this._startingTrip){
      if((options.appointmentId??null)!==this._startingAppointmentId){Toast.show('A journey is already starting. Review it before tracking another visit.','info');return null;}
      return this._startingTrip;
    }
    this._startingAppointmentId=options.appointmentId??null;
    const request=this._startingTrip=this.startTripOnce(options);
    try{return await request;}finally{if(this._startingTrip===request)this._startingTrip=null;}
  },

  async startTripOnce({ destinationAddress = '', appointmentId = null } = {}) {
    if (this.activeTrip) {
      Toast.show('A trip is already in progress', 'info');
      return (appointmentId??null)===(this.activeTrip.appointmentId??null)?this.activeTrip:null;
    }
    const departedAt=Date.now();
    if(appointmentId&&typeof DB!=='undefined'&&typeof DB.getAppointment==='function'){const appt=await DB.getAppointment(appointmentId);if(!appt||['completed','cancelled'].includes(appt.status)||appt.arrivedAt&&!appt.leftAt){Toast.show('Navigation will open. Review this visit’s timing or create a new visit before starting another tracked journey.','info');return null;}}

    // Starting the next appointment's journey is the advisor's clearest
    // low-input signal that any previous customer visit has ended. Close a
    // stale on-site timer before beginning the new trip; the visit-detail
    // controls remain available when GPS or this inference needs correcting.


    let startPos;
    try {
      startPos = await this.getCurrentPosition();
    } catch (e) {
      Toast.show('Navigation will open, but Beelo could not start mileage tracking. Check Location access in your phone settings.', 'warning', 6000);
      return null;
    }

    let destination = null;
    if (destinationAddress) {
      const geocoded = await this.geocode(destinationAddress);
      if (geocoded && !geocoded.postcodeOnly) destination = { lat: geocoded.lat, lng: geocoded.lng };
    }

    this.activeTrip = {
      id: Utils.generateId('trip'),
      startTime: new Date(departedAt).toISOString(),
      lastTimingFixAt:startPos.timestamp||departedAt,
      timingReviewRequired:(startPos.timestamp||Date.now())-departedAt>120000,
      startLocation: 'Trip start',
      destinationAddress,
      destination,
      appointmentId,
      distanceKm: 0,
      path: [{ lat: startPos.lat, lng: startPos.lng }],
      lastPos: { lat: startPos.lat, lng: startPos.lng }
    };
    if (!await this.persistActiveTrip()) {
      this.activeTrip = null;
      Toast.show('Mileage tracking could not start: secure recovery storage is unavailable. Navigation is still available.', 'error', 6000);
      return null;
    }

    await this.closePreviousOnSiteSessions(appointmentId);

    if (appointmentId) {
      try {
        await DB.db.appointments.update(appointmentId, {
          travelStatus: 'in_transit',
          travelStartedAt: departedAt
        });
      } catch (e) { console.log('travelStatus update (in_transit) failed:', e); }
    }

    this.watchId = navigator.geolocation.watchPosition(
      pos => this.onTripPositionUpdate(pos),
      err => console.log('Trip GPS error:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    this.renderTripBanner();
    if(typeof VisitTiming!=='undefined')VisitTiming.refresh();
    if (appointmentId && typeof MessageScheduler !== 'undefined') MessageScheduler.startDelayChecker(appointmentId);
    Toast.show(destination ? "Trip started — arrival is checked while Beelo receives location updates" : 'Trip started', 'success');
    return this.activeTrip;
  },

  async closePreviousOnSiteSessions(nextAppointmentId = null,{source='next_journey'}={}) {
    if (typeof DB === 'undefined' || !DB.db?.appointments) return 0;

    try {
      const openVisits = await DB.db.appointments
        .filter(appt => !!appt.arrivedAt && !appt.leftAt && appt.status !== 'cancelled' && appt.id !== nextAppointmentId)
        .toArray();
      const leftAt = Date.now();

      let closed=0;
      for (const visit of openVisits) {
        const saved=typeof DB.endVisitTiming==='function'?await DB.endVisitTiming(visit.id,new Date(visit.arrivedAt).getTime(),leftAt,{source,needsReview:true}):await DB.db.appointments.update(visit.id,{travelStatus:null,leftAt,departureEvidence:source,onSiteTimeReviewRequired:true,onSiteDurationMinutes:Math.max(0,Math.round((leftAt-new Date(visit.arrivedAt).getTime())/60000))});
        if(saved!==false){closed++;if(typeof VisitTiming!=='undefined')VisitTiming.stopFor(visit.id);}
      }
      if(closed)await App.setActiveVisitUnlock?.(false);
      return closed;
    } catch (e) {
      console.log('Previous on-site session close skipped:', e);
      return 0;
    }
  },

  onTripPositionUpdate(position) {
    if (!this.activeTrip || this.finishingTrip || this.activeTrip.saveFailed) return;
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

    if(typeof VisitTiming!=='undefined'){
      const fix=VisitTiming.fix(position);
      if(fix){if(fix.at-(this.activeTrip.lastTimingFixAt||Date.parse(this.activeTrip.startTime))>VisitTiming.GAP_MS)this.activeTrip.timingReviewRequired=true;this.activeTrip.lastTimingFixAt=fix.at;}
      else this.activeTrip.timingReviewRequired=true;
      const arrival=VisitTiming.arrival(this.activeTrip,position);
      this.persistActiveTrip();
      if(!arrival)this.scheduleArrivalCheck();
      if(arrival)return this.finishTrip({auto:true,arrivalAt:arrival.arrivedAt,anchor:arrival.anchor});
    }else if(this.activeTrip.destination&&this.activeTrip.distanceKm>=this.MIN_UNDERWAY_KM){
      const distance=this.calculateDistance(lat,lng,this.activeTrip.destination.lat,this.activeTrip.destination.lng);
      if(distance<=this.ARRIVAL_RADIUS_KM)return this.finishTrip({auto:true});
    }
  },

  scheduleArrivalCheck() {
    const trip=this.activeTrip,candidate=trip?.arrivalCandidate,key=candidate?`${trip.id}:${candidate.at}`:null;
    if(this._arrivalPollKey===key)return;
    clearTimeout(this._arrivalPoll);this._arrivalPollKey=key;if(!key)return;
    this._arrivalPoll=setTimeout(async()=>{
      if(this.activeTrip!==trip||this.finishingTrip||document.visibilityState!=='visible')return;
      try{const p=await this.getCurrentPosition();if(this.activeTrip===trip&&!this.finishingTrip)await this.onTripPositionUpdate({coords:{latitude:p.lat,longitude:p.lng,accuracy:p.accuracy,speed:p.speed},timestamp:p.timestamp});}catch(_){trip.timingReviewRequired=true;this.persistActiveTrip();}
    },30000);
  },

  async finishTrip({ auto = false, arrivalAt = null, anchor = null } = {}) {
    if (!this.activeTrip || this.finishingTrip) return null;
    this.finishingTrip = true;
    clearTimeout(this._arrivalPoll);this._arrivalPollKey=null;
    const trip = this.activeTrip;
    // Persist the observation boundary before any routing/storage wait. Retry
    // uses the same end instant and cannot inflate elapsed customer time.
    if(!trip.endTime){trip.endTime=new Date(arrivalAt||Date.now()).toISOString();trip.arrivalEvidence=auto?'gps_arrival':'advisor_finished_trip';trip.arrivalAnchor=anchor;await this.persistActiveTrip();}

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    let distanceKm = Math.max(trip.distanceKm, 0);
    const start = trip.path[0];
    const end = trip.lastPos;
    if (start && end) {
      const roadKm = await this.getDrivingDistanceKm(start.lat, start.lng, end.lat, end.lng).catch(() => null);
      if (roadKm !== null && roadKm > distanceKm) {
        distanceKm = roadKm;
      }
    }

    try {
      await DB.completeTrackedTrip({
        operationId: trip.id,
        date: trip.startTime,
        startLocation: trip.startLocation,
        endLocation: trip.destinationAddress || 'Trip end',
        distanceKm,
        purpose: 'business',
        appointmentId: trip.appointmentId,
        autoTracked: true,trackingIncomplete:!!trip.timingReviewRequired,endedAt:trip.endTime,arrivalAt:Date.parse(trip.endTime),arrivalEvidence:trip.arrivalEvidence,
        durationSeconds:Math.max(0,(Date.parse(trip.endTime)-Date.parse(trip.startTime))/1000),timingReviewRequired:!!trip.timingReviewRequired
      });
      const distance = CONFIG.distanceUnit === 'miles' ? distanceKm * 0.621371 : distanceKm;
      Toast.show(`${auto ? 'Arrived — trip' : 'Trip'} logged: ${distance.toFixed(1)} ${CONFIG.distanceUnit}`, 'success');
    } catch (e) {
      console.error('Failed to save trip:', e);
      trip.saveFailed = true;
      this.finishingTrip = false;
      await this.persistActiveTrip();
      if (typeof MessageScheduler !== 'undefined') MessageScheduler.stopDelayChecker();
      this.updateTripBanner();
      Toast.show('Trip not saved. Your recovery draft is retained; tap Retry save.', 'error', 6000);
      return null;
    }

    if(typeof VisitTiming!=='undefined'&&trip.appointmentId&&trip.arrivalAnchor){try{const appt=await DB.getAppointment(trip.appointmentId);if(appt&&!appt.leftAt&&appt.arrivalTripOperationId===trip.id&&!(VisitTiming.session?.appointmentId===trip.appointmentId&&VisitTiming.session?.arrivedAt===Number(appt.arrivedAt)))await VisitTiming.begin(trip.appointmentId,Number(appt.arrivedAt),trip.arrivalAnchor);}catch(_){Toast.show('Trip saved; automatic departure tracking could not start. Review visit times.','warning');}}
    this.activeTrip = null;
    this.finishingTrip = false;
    this.clearPersistedTrip();
    if (typeof MessageScheduler !== 'undefined') MessageScheduler.stopDelayChecker();
    this.removeTripBanner();

    if(typeof VisitTiming!=='undefined')VisitTiming.refresh();
    const editing=document.activeElement?.matches?.('input,textarea,select')||document.getElementById('modal-overlay')?.classList.contains('active');
    if (App.currentFeature?.id==='money'&&!editing) {
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
    clearTimeout(this._arrivalPoll);this._arrivalPollKey=null;
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
    if (typeof MessageScheduler !== 'undefined') MessageScheduler.stopDelayChecker();
    this.removeTripBanner();
    Toast.show('Trip cancelled', 'info');
  },

  _persistQueue: Promise.resolve(),
  _persistGeneration: 0,

  persistActiveTrip() {
    const snapshot = JSON.stringify(this.activeTrip);
    const generation = this._persistGeneration;
    this._persistQueue = this._persistQueue.then(async () => {
      const encrypted = await encryptField(snapshot);
      if (generation !== this._persistGeneration) return true;
      localStorage.setItem('advisoros_active_trip', JSON.stringify({ version: 1, encrypted }));
      return true;
    }).catch(() => {
      Toast.show('Trip recovery could not be updated. Keep Beelo open and retry saving.', 'warning');
      return false;
    });
    return this._persistQueue;
  },

  clearPersistedTrip() {
    this._persistGeneration++;
    try { localStorage.removeItem('advisoros_active_trip'); } catch (e) {}
  },

  async restoreActiveTrip() {
    try {
      const raw = localStorage.getItem('advisoros_active_trip');
      if (!raw) return;
      const stored = this.safeJSONParse(raw, 'advisoros_active_trip');
      const trip = stored?.version === 1
        ? JSON.parse(await decryptField(stored.encrypted)) : stored;
      if (!trip) return;
      if (!trip.id || !Array.isArray(trip.path) || !trip.lastPos) throw new Error('Invalid trip recovery data');
      if(trip.endTime)trip.saveFailed=true;
      this.activeTrip = trip;
      // Migrate legacy plaintext before resuming tracking. Never fall back to plaintext.
      if (!await this.persistActiveTrip()) { this.activeTrip = null; return; }
      if (!trip.saveFailed && navigator.geolocation) this.watchId = navigator.geolocation.watchPosition(
        pos => this.onTripPositionUpdate(pos),
        err => console.log('Trip GPS error:', err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
      this.renderTripBanner();
      if (!trip.saveFailed && trip.appointmentId && typeof MessageScheduler !== 'undefined') MessageScheduler.startDelayChecker(trip.appointmentId);
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
          <strong>${this.activeTrip.saveFailed ? 'Trip needs saving' : 'Trip in progress'}</strong>
          <span>${distance.toFixed(1)} ${CONFIG.distanceUnit}${this.activeTrip.timingReviewRequired?' · location gap: time/mileage need review':this.activeTrip.destination ? ' · automatic arrival while location is available' : ''}</span>
        </div>
        <button class="btn btn-sm btn-ghost" data-action="Geo.cancelTrip" title="Cancel trip">
          <span class="material-symbols-rounded">close</span>
        </button>
        <button class="btn btn-sm btn-primary" data-action="Geo.finishTrip">${this.activeTrip.saveFailed ? 'Retry save' : 'Finish'}</button>
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

  // Build an app-specific iOS URL. The chooser is explicit, so selecting
  // Google Maps or Waze means the corresponding app is expected to exist.
  // HTTPS universal links are deliberately avoided: iOS PWAs may keep those
  // links in Safari instead of handing them to the installed map app.
  buildNavigationAppUrl(provider, destination, origin = '') {
    const dest = encodeURIComponent(destination || '');
    const from = origin ? encodeURIComponent(origin) : '';

    if (provider === 'apple') {
      return `maps://?daddr=${dest}${from ? `&saddr=${from}` : ''}&dirflg=d`;
    }
    if (provider === 'waze') {
      return `waze://?q=${dest}&navigate=yes`;
    }
    return `comgooglemaps://?${from ? `saddr=${from}&` : ''}daddr=${dest}&directionsmode=driving`;
  },

  isIOS() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    return /iPad|iPhone|iPod/i.test(ua) ||
      (/Mac/i.test(platform) && Number(navigator.maxTouchPoints || 0) > 1);
  },

  buildGoogleMapsAppUrl(webUrl) {
    return String(webUrl || '').replace(/^https?:\/\//i, 'comgooglemapsurl://');
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
            <span><strong>Google Maps</strong><small>Requires the Google Maps app</small></span>
            <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
          </button>
          <button class="nav-app-option" type="button" data-action="Geo.launchNavigationChoice" data-args='${actionArgs('waze')}'>
            <span class="nav-app-icon nav-app-icon--waze material-symbols-rounded" aria-hidden="true">directions_car</span>
            <span><strong>Waze</strong><small>Requires the Waze app</small></span>
            <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
          </button>
        </div>
        <p class="hint mt-md mb-0">Google Maps and Waze must be installed. Beelo stays available when you return. Set a default in Settings → Navigation, or keep choosing each time.</p>
      </div>
    `);
  },

  async launchNavigationChoice(provider, destination, origin = '', appointmentId = null) {
    const url = this.buildNavigationAppUrl(provider, destination, origin);
    if (!url) return;

    App.closeModal();

    // Initiate GPS while the tap is still active, but do not await it before
    // opening the native URL scheme. iOS may block a custom scheme once the
    // original user activation has been lost across an async boundary.
    let tripPromise = null;
    try {
      tripPromise = this.startTrip({ destinationAddress: destination || '', appointmentId });
    } catch (e) {
      console.log('Trip start from navigation skipped:', e);
    }
    this.launchExternalUrl(url);

    let trip = null;
    try {
      trip = tripPromise ? await tripPromise : null;
    } catch (e) {
      console.log('Trip start from navigation skipped:', e);
    }
    if (trip && appointmentId && typeof MessageScheduler !== 'undefined' && typeof MessageScheduler.onDeparture === 'function') {
      try { Promise.resolve(MessageScheduler.onDeparture(appointmentId)).catch(() => console.warn('Departure draft unavailable')); } catch (e) { /* scheduler optional */ }
    }
  },

  // A same-context hand-off avoids the empty Safari/PWA overlay produced by
  // window.open(..., '_blank') on iPhone and preserves the original tap for
  // custom app schemes.
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
