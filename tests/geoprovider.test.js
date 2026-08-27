/* ============================================
   ADVISOROS — GEO PROVIDER TESTS
   Run with: node tests/geoprovider.test.js

   Tests the GeoProvider abstraction and PublicGeoProvider implementation.
   Uses a controllable mock to verify the Route feature works against
   the abstraction without network calls.
   ============================================ */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

let failures = 0;
function ok(label, cond, extra) {
  if (cond) {
    console.log('  OK ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

function makeLocalStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

// Build a sandbox with a mock provider
function loadGeoProvider({ mockProvider = null, mapboxKey = '' } = {}) {
  const sandbox = {
    console, Math, JSON, Date, Promise, Map, Set, Array, Object,
    Number, String, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
    AbortController, URL, localStorage: makeLocalStorage(),
    setTimeout, clearTimeout,
    fetch: async (url, options) => {
      if (mockProvider && mockProvider.fetch) {
        return mockProvider.fetch(url, options);
      }
      throw new Error('No mock fetch');
    },
    Toast: { show: () => {} },
    App: {
      modal: '',
      openModal(html) { this.modal = html; },
      closeModal() {}
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.location = { assigned: '', assign(url) { this.assigned = url; } };
  sandbox.navigator = { geolocation: {} };

  vm.createContext(sandbox);

  // Load config with optional mapboxKey
  const configSrc = fs.readFileSync(path.join(REPO, 'js/core/config.js'), 'utf8')
    .replace("mapboxKey: ''", `mapboxKey: '${mapboxKey}'`);
  vm.runInContext(configSrc + ';CONFIG;', sandbox);

  // Load utils (needed for Geo)
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/utils.js'), 'utf8'), sandbox);

  // Load geoprovider - explicitly get classes from sandbox
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/geoprovider.js'), 'utf8'), sandbox);
  const GeoProvider = vm.runInContext('GeoProvider;', sandbox);
  const PublicGeoProvider = vm.runInContext('PublicGeoProvider;', sandbox);
  const GeoProviderRegistry = vm.runInContext('GeoProviderRegistry;', sandbox);

  // Load geo (uses provider)
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/geo.js'), 'utf8'), sandbox);
  const Geo = vm.runInContext('Geo;', sandbox);

  return { GeoProvider, PublicGeoProvider, GeoProviderRegistry, Geo, sandbox };
}

(async () => {
  console.log('\nTest A: GeoProvider interface');
  {
    const { GeoProvider } = loadGeoProvider();

    // Verify abstract methods exist
    ok('GeoProvider has geocode', typeof GeoProvider.prototype.geocode === 'function');
    ok('GeoProvider has getRouteSummary', typeof GeoProvider.prototype.getRouteSummary === 'function');
    ok('GeoProvider has getDistanceKm', typeof GeoProvider.prototype.getDistanceKm === 'function');
    ok('GeoProvider has getTravelTimeMin', typeof GeoProvider.prototype.getTravelTimeMin === 'function');
    ok('GeoProvider has calculateDistance', typeof GeoProvider.prototype.calculateDistance === 'function');
    ok('GeoProvider has buildNavigationUrl', typeof GeoProvider.prototype.buildNavigationUrl === 'function');
  }

  console.log('\nTest B: PublicGeoProvider extends GeoProvider');
  {
    const { PublicGeoProvider, GeoProvider } = loadGeoProvider();

    const provider = new PublicGeoProvider();
    ok('instanceof GeoProvider', provider instanceof GeoProvider);
    ok('has geocode', typeof provider.geocode === 'function');
    ok('has getRouteSummary', typeof provider.getRouteSummary === 'function');
    ok('has getDistanceKm', typeof provider.getDistanceKm === 'function');
    ok('has getTravelTimeMin', typeof provider.getTravelTimeMin === 'function');
    ok('has calculateDistance (Haversine)', typeof provider.calculateDistance === 'function');
    ok('has buildNavigationUrl', typeof provider.buildNavigationUrl === 'function');
  }

  console.log('\nTest C: GeoProviderRegistry');
  {
    const { GeoProviderRegistry, PublicGeoProvider, GeoProvider } = loadGeoProvider();

    GeoProviderRegistry.reset();
    const p1 = GeoProviderRegistry.get();
    ok('returns PublicGeoProvider by default', p1 instanceof PublicGeoProvider);

    const p2 = GeoProviderRegistry.get();
    ok('singleton behavior', p1 === p2);

    class MockProvider extends GeoProvider {
      async geocode() { return { lat: 51.5, lng: -0.1 }; }
      async getRouteSummary() { return { distanceKm: 10, durationMin: 15, source: 'road' }; }
      async getDistanceKm() { return 10; }
      async getTravelTimeMin() { return 15; }
      calculateDistance() { return 10; }
      buildNavigationUrl() { return 'https://maps.test'; }
    }
    const mock = new MockProvider();
    GeoProviderRegistry.set(mock);
    ok('can set custom provider', GeoProviderRegistry.get() === mock);

    GeoProviderRegistry.reset();
    ok('reset restores default', GeoProviderRegistry.get() instanceof PublicGeoProvider);
  }

  console.log('\nTest D: Haversine distance calculation (local, no network)');
  {
    const { PublicGeoProvider } = loadGeoProvider();

    const provider = new PublicGeoProvider();
    // London to Manchester ~260km
    const d = provider.calculateDistance(51.5074, -0.1278, 53.4808, -2.2426);
    ok('London to Manchester ~260km', d > 250 && d < 270, d);

    // Same point = 0
    ok('same point = 0', provider.calculateDistance(51.5, -0.1, 51.5, -0.1) === 0);
  }

  console.log('\nTest E: Geo delegates to provider');
  {
    // Create a mock provider that we control
    const { GeoProvider } = loadGeoProvider();
    class MockProvider extends GeoProvider {
      constructor() {
        super();
        this.geocodeCalls = [];
        this.routeCalls = [];
      }
      async geocode(address) {
        this.geocodeCalls.push(address);
        if (address.includes('fail')) return null;
        return { lat: 51.5, lng: -0.1, displayName: address };
      }
      async getRouteSummary(fromLat, fromLng, toLat, toLng) {
        this.routeCalls.push({ fromLat, fromLng, toLat, toLng });
        return { distanceKm: 42, durationMin: 60, source: 'road' };
      }
      async getDistanceKm() { return 42; }
      async getTravelTimeMin() { return 60; }
      calculateDistance(lat1, lng1, lat2, lng2) {
        return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2)) * 111;
      }
      buildNavigationUrl(dest, origin) { return `https://maps.test?to=${dest}&from=${origin}`; }
    }

    const mockProvider = new MockProvider();

    const { Geo } = loadGeoProvider({ mockProvider });
    // Override the registry to return our mock
    Geo._provider = () => mockProvider;

    // Test geocode delegation
    const result = await Geo.geocode('10 Downing Street, London');
    ok('geocode delegates to provider', mockProvider.geocodeCalls.includes('10 Downing Street, London'));
    ok('geocode returns provider result', result.lat === 51.5 && result.lng === -0.1);

    // Test calculateDistance delegation
    const dist = Geo.calculateDistance(51.5, -0.1, 52.0, -0.5);
    ok('calculateDistance delegates', dist > 0);

    // Test buildNavigationUrl delegation
    const url = Geo.buildNavigationUrl('Manchester', 'London');
    ok('buildNavigationUrl delegates', url.includes('Manchester') && url.includes('London'));

    // Test getDrivingRouteSummary delegation
    const summary = await Geo.getDrivingRouteSummary(51.5, -0.1, 53.5, -2.2);
    ok('getDrivingRouteSummary delegates', summary.distanceKm === 42 && summary.durationMin === 60);

    // Test getDrivingDistanceKm delegation
    const distKm = await Geo.getDrivingDistanceKm(51.5, -0.1, 53.5, -2.2);
    ok('getDrivingDistanceKm delegates', distKm === 42);
  }

  console.log('\nTest F: Geo.calculateDistance uses provider Haversine');
  {
    const { PublicGeoProvider } = loadGeoProvider();

    const provider = new PublicGeoProvider();
    // Use the real Haversine
    const d = provider.calculateDistance(51.5074, -0.1278, 53.4808, -2.2426);
    ok('uses Haversine', d > 250 && d < 270, d);
  }

  console.log('\nTest G: Navigation URL format');
  {
    const { PublicGeoProvider, Geo, sandbox } = loadGeoProvider();

    const provider = new PublicGeoProvider();
    const url = provider.buildNavigationUrl('Manchester, UK', 'London, UK');
    ok('contains Google Maps base', url.startsWith('https://www.google.com/maps/dir/'));
    ok('contains destination', url.includes('Manchester'));
    ok('contains origin', url.includes('London'));

    const appleUrl = Geo.buildNavigationAppUrl('apple', 'Manchester, UK', 'London, UK');
    ok('Apple Maps URL contains driving destination', appleUrl.startsWith('https://maps.apple.com/') && appleUrl.includes('daddr=Manchester%2C%20UK') && appleUrl.includes('dirflg=d'));

    const wazeUrl = Geo.buildNavigationAppUrl('waze', 'Manchester, UK');
    ok('Waze URL starts live navigation', wazeUrl.startsWith('https://www.waze.com/ul?') && wazeUrl.includes('navigate=yes'));

    const googleUrl = Geo.buildNavigationAppUrl('google', 'Manchester, UK');
    ok('Google choice uses provider URL', googleUrl.startsWith('https://www.google.com/maps/dir/'));

    let tripOptions = null;
    let departureCalls = 0;
    Geo.startTrip = async options => { tripOptions = options; return null; };
    sandbox.MessageScheduler = { onDeparture: () => { departureCalls++; } };
    await Geo.launchNavigationChoice('google', 'Manchester, UK', '', 42);
    ok('navigation requests GPS before handing off to Maps', tripOptions?.appointmentId === 42 && sandbox.location.assigned === googleUrl, tripOptions);
    ok('failed optional trip does not trigger departure messaging', departureCalls === 0, departureCalls);

    Geo.launchExternalUrl(appleUrl);
    ok('navigation handoff uses same browsing context', sandbox.location.assigned === appleUrl);

    vm.runInContext("CONFIG.navigationApp = 'ask'", sandbox);
    Geo.openNavigationChooser('Manchester, UK');
    ok('ask preference opens the three-app chooser', sandbox.App.modal.includes('Apple Maps') && sandbox.App.modal.includes('Google Maps') && sandbox.App.modal.includes('Waze'));

    let directChoice = null;
    Geo.launchNavigationChoice = (...args) => { directChoice = args; };
    vm.runInContext("CONFIG.navigationApp = 'waze'", sandbox);
    Geo.openNavigationChooser('Manchester, UK', '', 42);
    ok('saved preference bypasses chooser', directChoice && directChoice[0] === 'waze' && directChoice[3] === 42, directChoice);
  }

  console.log('\nTest H: Provider swap does not break Geo API');
  {
    // Verify Geo's public API surface is unchanged
    const { Geo } = loadGeoProvider();

    const methods = [
      'init', 'getCurrentPosition', 'startTrip', 'finishTrip', 'cancelTrip',
      'geocode', 'calculateDistance', 'buildNavigationUrl',
      'buildNavigationAppUrl', 'openNavigationChooser', 'launchNavigationChoice',
      'launchExternalUrl',
      'optimizeRoute', 'calculateRouteDistance', 'getDrivingDistanceKm',
      'getDrivingRouteSummary', 'persistActiveTrip', 'clearPersistedTrip',
      'restoreActiveTrip', 'renderTripBanner', 'updateTripBanner',
      'removeTripBanner', 'destroy'
    ];

    for (const m of methods) {
      ok(`Geo.${m} exists`, typeof Geo[m] === 'function', m);
    }
  }

  console.log('\nTest I: Fetch timeout falls back to estimate, does not hang');
  {
    let aborted = 0;
    const { PublicGeoProvider } = loadGeoProvider({
      mockProvider: { fetch: async (url, options) => {
        const p = new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            aborted++;
            const e = new Error('The operation was aborted.');
            e.name = 'AbortError';
            reject(e);
          });
        });
        return p;
      } }
    });

    const start = Date.now();
    const provider = new PublicGeoProvider({ fetchTimeoutMs: 150 });
    const summary = await provider.getRouteSummary(51.5, -0.1, 53.4, -2.9);
    const elapsed = Date.now() - start;

    ok('timeout aborts the request', aborted === 1, aborted);
    ok('returns within a bounded time (< 3s)', elapsed < 3000, elapsed);
    ok('falls back to estimate source', summary && summary.source === 'estimate', summary);
    ok('estimate is plausible (~260km * 1.3)', summary && summary.distanceKm > 250 && summary.distanceKm < 450, summary && summary.distanceKm);
    ok('estimate has a duration', summary && summary.durationMin > 0, summary);
  }

  console.log('\nTest J: Geocode persistent cache serves repeat addresses offline');
  {
    const calls = [];
    const { PublicGeoProvider, sandbox } = loadGeoProvider({
      mockProvider: { fetch: async url => {
        calls.push(url);
        return {
          ok: true, status: 200,
          json: async () => [{ lat: '51.5034', lon: '-0.1276', display_name: '10 Downing Street, London' }]
        };
      } }
    });

    const p1 = new PublicGeoProvider();
    const first = await p1.geocode('10 Downing Street, London');
    ok('first geocode resolves via network', first && first.lat === 51.5034, first);

    // Second instance with the same (shared) localStorage — fetch now dead.
    sandbox.fetch = async () => { throw new Error('offline'); };
    const p2 = new PublicGeoProvider();
    const second = await p2.geocode('10 Downing Street, London');
    ok('repeat geocode served from cache offline', second && second.lat === 51.5034 && second.lng === -0.1276, second);
    ok('no additional network call for cached address', calls.length === 1, calls.length);
    ok('cache persisted to localStorage', sandbox.localStorage.getItem('advisoros_geocode_v1') !== null);

    // Offline miss returns null, not an exception.
    const miss = await p2.geocode('Somewhere, Nowhere XX1 1XX');
    ok('offline miss returns null', miss === null, miss);

    // Exact same address (different casing) still hits the cache.
    const third = await p2.geocode('  10 downing street, london  ');
    ok('cache key is case/space normalised', third && third.lat === 51.5034, third);
  }

  console.log('\nTest K: MapboxGeoProvider class exists and implements interface');
  {
    const { GeoProvider, sandbox } = loadGeoProvider({ mapboxKey: 'pk.test-key' });
    const MapboxGeoProvider = vm.runInContext('MapboxGeoProvider;', sandbox);
    ok('MapboxGeoProvider class exported', typeof MapboxGeoProvider === 'function');

    const provider = new MapboxGeoProvider({ accessToken: 'pk.test-key' });
    ok('instanceof GeoProvider', provider instanceof GeoProvider);
    ok('has geocode', typeof provider.geocode === 'function');
    ok('has getRouteSummary', typeof provider.getRouteSummary === 'function');
    ok('has getDistanceKm', typeof provider.getDistanceKm === 'function');
    ok('has getTravelTimeMin', typeof provider.getTravelTimeMin === 'function');
    ok('has calculateDistance', typeof provider.calculateDistance === 'function');
    ok('has buildNavigationUrl', typeof provider.buildNavigationUrl === 'function');
  }

  console.log('\nTest L: GeoProviderRegistry prefers Mapbox when key is set');
  {
    const { GeoProviderRegistry, sandbox } = loadGeoProvider({ mapboxKey: 'pk.test-key' });
    GeoProviderRegistry.reset();
    const provider = GeoProviderRegistry.get();
    ok('returns MapboxGeoProvider when key set', provider.constructor.name === 'MapboxGeoProvider');
    ok('getActiveProviderName returns mapbox', GeoProviderRegistry.getActiveProviderName() === 'mapbox');
  }

  console.log('\nTest M: GeoProviderRegistry falls back to PublicGeoProvider when no key');
  {
    const { GeoProviderRegistry, PublicGeoProvider, sandbox } = loadGeoProvider({ mapboxKey: '' });
    GeoProviderRegistry.reset();
    const provider = GeoProviderRegistry.get();
    ok('returns PublicGeoProvider when key empty', provider instanceof PublicGeoProvider);
    ok('getActiveProviderName returns public', GeoProviderRegistry.getActiveProviderName() === 'public');
  }

  console.log('\nTest N: Mapbox geocode uses Mapbox API (mocked)');
  {
    let mapboxCalls = 0;
    const { GeoProviderRegistry, sandbox } = loadGeoProvider({
      mapboxKey: 'pk.test-key',
      mockProvider: { fetch: async (url, options) => {
        mapboxCalls++;
        if (url.includes('geocoding/v5')) {
          return {
            ok: true, status: 200,
            json: async () => ({
              features: [{ center: [-0.1276, 51.5034], place_name: '10 Downing Street, London' }]
            })
          };
        }
        if (url.includes('directions/v5')) {
          return {
            ok: true, status: 200,
            json: async () => ({
              routes: [{ distance: 260000, duration: 3600, geometry: { coordinates: [] } }]
            })
          };
        }
        throw new Error('unexpected url: ' + url);
      } }
    });
    GeoProviderRegistry.reset();
    const provider = GeoProviderRegistry.get();

    const geoResult = await provider.geocode('10 Downing Street, London');
    ok('geocode calls Mapbox API', mapboxCalls === 1, mapboxCalls);
    ok('geocode returns coords', geoResult.lat === 51.5034 && geoResult.lng === -0.1276, geoResult);

    const routeResult = await provider.getRouteSummary(51.5, -0.1, 53.4, -2.9);
    ok('getRouteSummary calls Mapbox API', mapboxCalls === 2, mapboxCalls);
    ok('getRouteSummary returns road distance', routeResult.distanceKm === 260 && routeResult.source === 'road', routeResult);
  }

  console.log('\nTest O: Mapbox falls back to estimate when API fails');
  {
    let mapboxCalls = 0;
    const { GeoProviderRegistry, sandbox } = loadGeoProvider({
      mapboxKey: 'pk.test-key',
      mockProvider: { fetch: async () => { throw new Error('network error'); } }
    });
    GeoProviderRegistry.reset();
    const provider = GeoProviderRegistry.get();

    const routeResult = await provider.getRouteSummary(51.5, -0.1, 53.4808, -2.2426);
    ok('returns estimate on API failure', routeResult && routeResult.source === 'estimate', routeResult);
    ok('estimate distance is plausible', routeResult.distanceKm > 250 && routeResult.distanceKm < 450, routeResult.distanceKm);
  }

  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });
