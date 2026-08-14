/* ============================================
   ADVISOROS — GEO PROVIDER ABSTRACTION
   Interface for geocoding, routing, distance, and travel time.
   Current implementation: PublicGeoProvider (OSRM + Nominatim).
   Future implementations can swap without touching Route/Talk features.
   ============================================ */

/**
 * GeoProvider interface — all methods return Promises.
 * Implementations must handle offline gracefully (return null/throw with context).
 */
class GeoProvider {
  /**
   * Geocode a free-text address to coordinates.
   * @param {string} address - Full address or postcode
   * @returns {Promise<{lat:number, lng:number, displayName?:string, postcodeOnly?:boolean}|null>}
   */
  async geocode(address) {
    throw new Error('Not implemented');
  }

  /**
   * Get driving route summary between two points.
   * @returns {Promise<{distanceKm:number, durationMin:number, source:'road'|'estimate'}|null>}
   */
  async getRouteSummary(fromLat, fromLng, toLat, toLng) {
    throw new Error('Not implemented');
  }

  /**
   * Get driving distance in km between two points.
   * @returns {Promise<number|null>} - km, or null if unavailable
   */
  async getDistanceKm(fromLat, fromLng, toLat, toLng) {
    throw new Error('Not implemented');
  }

  /**
   * Get driving travel time in minutes between two points.
   * @returns {Promise<number|null>} - minutes, or null if unavailable
   */
  async getTravelTimeMin(fromLat, fromLng, toLat, toLng) {
    throw new Error('Not implemented');
  }

  /**
   * Calculate straight-line (Haversine) distance in km.
   * This is a local calculation, no network needed.
   * @returns {number} - km
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    throw new Error('Not implemented');
  }

  /**
   * Build a navigation URL for external apps (Google Maps, Apple Maps, etc).
   * @returns {string} - URL to open
   */
  buildNavigationUrl(destination, origin = '') {
    throw new Error('Not implemented');
  }
}

/**
 * PublicGeoProvider — wraps the existing OSRM + Nominatim implementation.
 * Provides the same capabilities with rate limiting, caching, postcode fallback.
 */
class PublicGeoProvider extends GeoProvider {
  constructor() {
    super();
    this._requestCache = new Map();
    this._lastRequestTime = 0;
    this._minRequestInterval = 1200;
    this._backoffUntil = 0;
    this._consecutiveErrors = 0;
    this._maxRetries = 2;
  }

  // ---- Rate-limiting helpers ----
  async _fetchWithRateLimit(url, options = {}) {
    const cacheKey = url;

    if (this._requestCache.has(cacheKey)) {
      return this._requestCache.get(cacheKey);
    }

    const now = Date.now();
    const wait = this._lastRequestTime + this._minRequestInterval - now;
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }

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
        const isRateLimit = err.message === '429' || (err.message && err.message.includes('429'));
        if (isRateLimit) {
          this._consecutiveErrors++;
          const backoffMs = Math.min(30000, 2000 * Math.pow(2, this._consecutiveErrors));
          this._backoffUntil = Date.now() + backoffMs;
          if (retry === 0 && typeof Toast !== 'undefined') {
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
  }

  // ---- Geocoding with postcode fallback ----
  extractPostcode(address) {
    const m = String(address || '').match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i);
    return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
  }

  async geocode(address) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=gb`;
      const response = await this._fetchWithRateLimit(url);
      const data = await response.json();
      if (data && data[0]) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
      }

      const postcode = this.extractPostcode(address);
      if (postcode) {
        const pcUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(postcode + ', UK')}&limit=1&countrycodes=gb`;
        const pcResponse = await this._fetchWithRateLimit(pcUrl);
        const pcData = await pcResponse.json();
        if (pcData && pcData[0]) {
          return {
            lat: parseFloat(pcData[0].lat),
            lng: parseFloat(pcData[0].lon),
            displayName: pcData[0].display_name,
            postcodeOnly: true
          };
        }
      }
      return null;
    } catch (err) {
      console.error('Geocoding failed:', err);
      return null;
    }
  }

  // ---- Routing via OSRM ----
  async getRouteSummary(fromLat, fromLng, toLat, toLng) {
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
  }

  async getDistanceKm(fromLat, fromLng, toLat, toLng) {
    const summary = await this.getRouteSummary(fromLat, fromLng, toLat, toLng);
    return summary?.distanceKm ?? null;
  }

  async getTravelTimeMin(fromLat, fromLng, toLat, toLng) {
    const summary = await this.getRouteSummary(fromLat, fromLng, toLat, toLng);
    return summary?.durationMin ?? null;
  }

  // ---- Local Haversine ----
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  // ---- Navigation handoff ----
  buildNavigationUrl(destination, origin = '') {
    const dest = encodeURIComponent(destination);
    const from = origin ? `&origin=${encodeURIComponent(origin)}` : '';
    return `https://www.google.com/maps/dir/?api=1${from}&destination=${dest}`;
  }
}

/**
 * GeoProviderRegistry — single place to get the active provider.
 * Defaults to PublicGeoProvider. Tests can swap with a mock.
 */
const GeoProviderRegistry = {
  _provider: null,

  get() {
    if (!this._provider) {
      this._provider = new PublicGeoProvider();
    }
    return this._provider;
  },

  set(provider) {
    this._provider = provider;
  },

  reset() {
    this._provider = null;
  }
};

// Export for both browser and Node (tests)
if (typeof window !== 'undefined') {
  window.GeoProvider = GeoProvider;
  window.PublicGeoProvider = PublicGeoProvider;
  window.GeoProviderRegistry = GeoProviderRegistry;
}
if (typeof module !== 'undefined') {
  module.exports = { GeoProvider, PublicGeoProvider, GeoProviderRegistry };
}