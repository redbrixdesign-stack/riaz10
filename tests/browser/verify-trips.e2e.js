#!/usr/bin/env node
/* ============================================
   ADVISOROS — NAVIGATION → MILEAGE TRIP VERIFICATION
   The phone report: (1) does tapping Navigate actually trigger the
   GPS-tracked mileage trip and finish it when near the destination, and
   (2) a service call booked for today appeared in Visits but never as
   the featured NEXT card.

   Drives the REAL app with mocked geolocation:
   1. Home's featured NEXT card shows the earliest pending visit TODAY
      (the service call whose slot has passed) — not a future visit.
   2. Tapping Navigate on the featured card starts a live trip for that
      appointment (in_transit) with the destination geocoded.
   3. Moving near the destination and re-opening the app finishes the
      trip automatically: a trips row is logged (autoTracked, linked to
      the appointment) and the visit flips to on_site.
   4. The Route screen's Navigate actions ALSO start the trip (they used
      to open maps without tracking mileage).
   Run: node tests/browser/verify-trips.e2e.js  (:8000 + Playwright)
   ============================================ */
'use strict';

const { chromium } = require('playwright');
const BASE = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const ok = (label, cond, extra) => {
  console.log((cond ? '  OK   ' : '  FAIL ') + label + (extra && !cond ? ' — ' + JSON.stringify(extra).slice(0, 220) : ''));
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(['geolocation'], { origin: BASE });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('trp') !== '1') { localStorage.clear(); sessionStorage.clear(); }
    localStorage.setItem('advisoros_enc_test', '1');
    localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true, businessAddress: '12 Willow Works, Stockport Road, Manchester M16 0AA', businessLatLng: [53.415, -2.149] }));
    sessionStorage.setItem('trp', '1');
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/frame-ancestors|Failed to load|Leaflet/.test(m.text())) errs.push(m.text().slice(0, 110)); });
  const setPos = (lat, lng) => cdp.send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lng, accuracy: 5 });

  await page.goto(BASE + '/tests/browser/seed-review.html');
  await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'), null, { timeout: 30000 });
  await page.goto(BASE + '/index.html?trp=1');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForSelector('.comp-home-next-visit', { timeout: 20000 });
  await sleep(1500);

  // Deterministic geocoding for the test (no network): every address
  // resolves to the same "destination" point. Set AFTER the reload below —
  // a reload resets the page's overrides.
  await page.evaluate(() => {
    Geo.geocode = async () => ({ lat: 53.445, lng: -2.160 });
    Geo.launchExternalUrl = url => { window.__navigationUrl = url; };
  });
  await setPos(53.415, -2.149); // start at "base"

  // Clear all appointments; add ONE service call for today at a slot that
  // has ALREADY PASSED (the user's exact report) plus one visit tomorrow.
  const ids = await page.evaluate(async () => {
    await DB.db.appointments.clear();
    await DB.db.trips.clear();
    await DB.db.expenses.clear();
    const custs = await DB.getCustomersByIds((await DB.db.customers.toArray()).map(c => c.id));
    const david = custs.find(c => c.firstName === 'David');
    const amelia = custs.find(c => c.firstName === 'Amelia');
    const today = Utils.getToday();
    const past = new Date(today); past.setHours(Math.max(0, new Date().getHours() - 1), 0, 0, 0);
    const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1); tmr.setHours(10, 0, 0, 0);
    const svc = await DB.addAppointment({ customerId: david.id, clientName: "David O'Leary", type: 'service_call', date: past.toISOString(), status: 'confirmed', phone: '07900 333444', address: "St Mary's Court, Altrincham M22 2AA" });
    const tmrA = await DB.addAppointment({ customerId: amelia.id, clientName: 'Amelia Green', type: 'consultation', date: tmr.toISOString(), status: 'confirmed', phone: '07711 223344', address: '9 Birch Lane, Wilmslow SK9 5AA' });
    return { svc: svc.id, tmr: tmrA.id };
  });

  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.currentHash === 'today', null, { timeout: 30000 });
  await page.waitForSelector('.comp-home-next-visit', { timeout: 20000 });
  await sleep(2000);

  // Re-assert the mock AFTER the reload (a reload resets page overrides):
  // geocoding stub + the starting position.
  await page.evaluate(() => {
    Geo.geocode = async () => ({ lat: 53.445, lng: -2.160 });
    Geo.launchExternalUrl = url => { window.__navigationUrl = url; };
  });
  await setPos(53.415, -2.149);

  console.log('\n=== 1. The passed-slot service call is the featured NEXT ===');
  const featured = await page.evaluate(() => ({
    name: (document.querySelector('.comp-home-next-visit-name') || { textContent: '' }).textContent.replace(/^@/, ''),
    time: (document.querySelector('.comp-home-next-visit-time') || { textContent: '' }).textContent.trim(),
    journey: (document.querySelector('.comp-home-next-visit-journey') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim()
  }));
  console.log('  featured:', JSON.stringify(featured));
  ok('featured card is the service call (earliest pending today), not the future visit', featured.name.includes("David O'Leary"), featured);
  ok('featured card is not the tomorrow visit', !featured.name.includes('Amelia'), featured);

  console.log('\n=== 2. Navigate on the featured card starts the mileage trip ===');
  await page.evaluate(() => { const b = document.querySelector('.comp-home-cta--primary'); if (b) b.click(); });
  await page.getByRole('button', { name: /Google Maps/ }).click();
  await sleep(1200);
  const started = await page.evaluate(async ({ svc }) => {
    const trip = Geo.activeTrip;
    const appt = await DB.getAppointment(svc);
    return {
      hasTrip: !!trip,
      tripAppointmentId: trip ? trip.appointmentId : null,
      destSet: !!(trip && trip.destinationAddress),
      destGeocoded: !!(trip && trip.destination && trip.destination.lat),
      travelStatus: appt.travelStatus,
      navigationUrl: window.__navigationUrl || ''
    };
  }, { svc: ids.svc });
  ok('a live trip is active for the service call', started.hasTrip && started.tripAppointmentId === ids.svc, started);
  ok('destination address set + geocoded', started.destSet && started.destGeocoded, started);
  ok('appointment marked in_transit', started.travelStatus === 'in_transit', started);
  ok('Google Maps launched without a blank popup tab', started.navigationUrl.startsWith('https://www.google.com/maps/dir/'), started);

  console.log('\n=== 3. Arrival near the destination auto-finishes the trip ===');
  // The advisor drove to the destination; "reopening" the app re-checks.
  await setPos(53.445, -2.160); // now AT the destination
  await page.evaluate(() => Geo.checkArrivalOnResume());
  await sleep(1200);
  const finished = await page.evaluate(async ({ svc }) => {
    const trips = await DB.db.trips.toArray();
    const appt = await DB.getAppointment(svc);
    return {
      activeTrip: !!Geo.activeTrip,
      tripCount: trips.length,
      tripLinked: trips.some(t => t.appointmentId === svc && t.autoTracked === true),
      tripKm: trips.reduce((s, t) => s + (t.distanceKm || 0), 0),
      travelStatus: appt.travelStatus
    };
  }, { svc: ids.svc });
  ok('trip auto-finished (no active trip left)', finished.activeTrip === false, finished);
  ok('a trips row was logged, auto-tracked and linked to the appointment', finished.tripCount === 1 && finished.tripLinked, finished);
  ok('distance recorded (approx 3.4km to the destination)', finished.tripKm > 2, finished);
  ok('appointment flipped to on_site', finished.travelStatus === 'on_site', finished);

  console.log('\n=== 4. Route screen navigation also starts the trip ===');
  await page.evaluate(async () => {
    // The service call is the only today visit; add one more so the route
    // has two stops, then open the leg route for stop 1.
    const custs = await DB.getCustomersByIds((await DB.db.customers.toArray()).map(c => c.id));
    const tom = custs.find(c => c.firstName === 'Tom');
    const today = Utils.getToday();
    const later = new Date(today); later.setHours(Math.min(23, new Date().getHours() + 2), 0, 0, 0);
    await DB.addAppointment({ customerId: tom.id, clientName: 'Tom Hardcastle', type: 'measure', date: later.toISOString(), status: 'confirmed', phone: '07900 555666', address: '3 Cypress Close, Stockport SK7 5AA' });
  });
  await page.evaluate(() => Geo.cancelTrip());
  await sleep(300);
  await page.evaluate(async () => RouteFeature.openLegRoute(0));
  await page.getByRole('button', { name: /Google Maps/ }).click();
  await sleep(1200);
  const routeTrip = await page.evaluate(async () => {
    const trip = Geo.activeTrip;
    const appts = (await DB.getAppointmentsForDate(Utils.getToday().toISOString())).filter(a => a.status !== 'cancelled');
    const first = [...appts].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    return { hasTrip: !!trip, matchesFirstStop: !!(trip && first && trip.appointmentId === first.id), destSet: !!(trip && trip.destinationAddress) };
  });
  ok('Route leg Navigate starts a trip for that stop', routeTrip.hasTrip && routeTrip.matchesFirstStop && routeTrip.destSet, routeTrip);

  ok('no console errors', errs.length === 0, errs);

  await browser.close();
  console.log(failures === 0 ? '\n✓ verify-trips.e2e PASS' : `\n✗ verify-trips.e2e FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
