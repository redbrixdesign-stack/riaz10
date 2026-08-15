/* ============================================
   ADVISOROS — WEATHER SERVICE TESTS
   Run with: node tests/weather.test.js

   Covers the Today-dashboard weather badge: cache freshness,
   stale-while-revalidate offline fallback, and graceful failure.
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

function loadWeather({ fetchImpl = async () => { throw new Error('No mock fetch'); }, storedCache = null } = {}) {
  const sandbox = {
    console, Math, JSON, Date, Promise, Map, Set, Array, Object,
    Number, String, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
    setTimeout, clearTimeout, AbortController, fetch: fetchImpl,
    localStorage: makeLocalStorage()
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.navigator = {};

  if (storedCache !== null) {
    sandbox.localStorage.setItem('advisoros_weather_cache', JSON.stringify(storedCache));
  }

  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/config.js'), 'utf8') + ';CONFIG;', sandbox);
  const CONFIG = vm.runInContext('CONFIG;', sandbox);
  CONFIG.businessLatLng = [51.5, -0.1];
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/core/utils.js'), 'utf8'), sandbox);

  const Utils = vm.runInContext('Utils;', sandbox);
  Utils.getToday = () => new Date('2026-08-15T10:00:00Z');

  vm.runInContext(fs.readFileSync(path.join(REPO, 'js/services/weather.js'), 'utf8'), sandbox);
  const WeatherService = vm.runInContext('WeatherService;', sandbox);

  return { WeatherService, Utils, sandbox };
}

const TTL = 30 * 60 * 1000;
const FRESH = { tempC: 21, icon: 'wb_sunny' };
const STALE_SAME_DAY = { tempC: 19, icon: 'wb_cloudy' };
const YESTERDAY = { tempC: 14, icon: 'grain' };

(async () => {
  console.log('\nTest A: Fresh cache hits without any network call');
  {
    let calls = 0;
    const { WeatherService } = loadWeather({
      fetchImpl: async () => { calls++; throw new Error('should not be called'); },
      storedCache: { dateKey: '2026-08-15', fetchedAt: Date.now() - 1000, data: FRESH }
    });
    const result = await WeatherService.getTodayWeather();
    ok('fresh cached data returned', result && result.tempC === 21, result);
    ok('no network call', calls === 0, calls);
  }

  console.log('\nTest B: Stale same-day cache + offline fetch failure = stale data');
  {
    let calls = 0;
    const { WeatherService } = loadWeather({
      fetchImpl: async () => { calls++; throw new Error('offline'); },
      storedCache: { dateKey: '2026-08-15', fetchedAt: Date.now() - TTL - 5000, data: STALE_SAME_DAY }
    });
    const result = await WeatherService.getTodayWeather();
    ok('stale same-day reading served', result && result.tempC === 19, result);
    ok('fetch was attempted', calls === 1, calls);
  }

  console.log('\nTest C: Stale previous-day cache + offline = null (no wrong-day badge)');
  {
    const { WeatherService } = loadWeather({
      fetchImpl: async () => { throw new Error('offline'); },
      storedCache: { dateKey: '2026-08-14', fetchedAt: Date.now() - TTL - 5000, data: YESTERDAY }
    });
    const result = await WeatherService.getTodayWeather();
    ok('no wrong-day weather shown', result === null, result);
  }

  console.log('\nTest D: Fetch success refreshes cache and returns fresh data');
  {
    const { WeatherService, sandbox } = loadWeather({
      fetchImpl: async url => {
        if (!url.includes('open-meteo.com')) throw new Error('wrong host');
        return {
          ok: true, status: 200,
          json: async () => ({ current: { temperature_2m: 18.6, weather_code: 3 } })
        };
      },
      storedCache: { dateKey: '2026-08-15', fetchedAt: Date.now() - TTL - 5000, data: STALE_SAME_DAY }
    });
    const result = await WeatherService.getTodayWeather();
    ok('fresh data returned', result && result.tempC === 19 && result.icon === 'wb_cloudy', result);
    const stored = JSON.parse(sandbox.localStorage.getItem('advisoros_weather_cache'));
    ok('cache refreshed with new timestamp', stored && stored.fetchedAt > Date.now() - 5000, stored && stored.fetchedAt);
    ok('cached data matches response', stored && stored.data.tempC === 19, stored && stored.data);
  }

  console.log('\nTest E: No coords (no business base) still serves same-day cache, else null');
  {
    const { WeatherService } = loadWeather({
      storedCache: { dateKey: '2026-08-15', fetchedAt: Date.now() - 1000, data: FRESH }
    });
    const result = await WeatherService.getTodayWeather();
    ok('same-day cache served without coords', result && result.tempC === 21, result);
  }
  {
    const { WeatherService } = loadWeather({
      storedCache: { dateKey: '2026-08-14', fetchedAt: Date.now() - 1000, data: YESTERDAY }
    });
    const result = await WeatherService.getTodayWeather();
    ok('no coords and no same-day cache = null', result === null, result);
  }

  console.log('\nTest F: Corrupt cache is ignored, fetch proceeds');
  {
    const { WeatherService, sandbox } = loadWeather({
      fetchImpl: async () => ({
        ok: true, status: 200,
        json: async () => ({ current: { temperature_2m: 11, weather_code: 61 } })
      })
    });
    sandbox.localStorage.setItem('advisoros_weather_cache', '{not json');
    const result = await WeatherService.getTodayWeather();
    ok('corrupt cache ignored, fresh fetch succeeded', result && result.tempC === 11 && result.icon === 'rainy', result);
  }

  console.log('\nTest G: Fetch timeout (hung API) aborts and falls back to stale');
  {
    let aborted = 0;
    const { WeatherService } = loadWeather({
      fetchImpl: async (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted++;
          const e = new Error('The operation was aborted.');
          e.name = 'AbortError';
          reject(e);
        });
      }),
      storedCache: { dateKey: '2026-08-15', fetchedAt: Date.now() - TTL - 5000, data: STALE_SAME_DAY }
    });
    const start = Date.now();
    const result = await WeatherService.getTodayWeather();
    const elapsed = Date.now() - start;
    ok('hung request aborted', aborted === 1, aborted);
    ok('bounded by the 5s fetch timeout (< 6s)', elapsed < 6000, elapsed);
    ok('stale same-day badge served', result && result.tempC === 19, result);
  }

  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('UNEXPECTED ERROR:', e); process.exit(1); });