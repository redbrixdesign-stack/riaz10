/* ============================================
   ADVISOROS v5.0 — WEATHER SERVICE
   Small "glance" weather badge for the Today dashboard: icon + temperature
   for the advisor's business base (falls back to device location). Uses
   Open-Meteo (no API key required) and caches once per day so it doesn't
   refetch on every navigation.
   ============================================ */

const WeatherService = {
  cacheKey: 'advisoros_weather_cache',
  cacheTtlMs: 30 * 60 * 1000, // 30 minutes

  async getTodayWeather() {
    const todayKey = Utils.formatDate(Utils.getToday(), 'iso');

    try {
      const cached = JSON.parse(localStorage.getItem(this.cacheKey) || 'null');
      if (cached && cached.dateKey === todayKey && (Date.now() - cached.fetchedAt) < this.cacheTtlMs) {
        return cached.data;
      }
    } catch (e) { /* ignore corrupt cache */ }

    const coords = await this.resolveCoords();
    if (!coords) return null;

    try {
      const data = await this.fetchCurrent(coords);
      localStorage.setItem(this.cacheKey, JSON.stringify({ dateKey: todayKey, fetchedAt: Date.now(), data }));
      return data;
    } catch (e) {
      console.log('Weather fetch failed:', e);
      return null;
    }
  },

  async resolveCoords() {
    // businessLatLng is stored everywhere else as a [lat, lng] array (route.js,
    // today.js, settings.js). This previously checked for a `.lat` property, so
    // the business base was never recognised and weather always fell back to a
    // live GPS prompt — annoying on a device that just wants a glance at the
    // temperature. Accept the array form (and, defensively, an object form).
    const ll = CONFIG.businessLatLng;
    if (Array.isArray(ll) && ll.length === 2 && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) {
      return { lat: ll[0], lng: ll[1] };
    }
    if (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) {
      return { lat: ll.lat, lng: ll.lng };
    }
    // No business base set: return null rather than prompting for a live GPS
    // fix. The weather badge is cosmetic, and triggering a location-permission
    // dialog on a brand-new user's first dashboard paint is the wrong first
    // impression. Weather appears once they set a base address (onboarding or
    // Settings) — which also unlocks routing/mileage, so the prompt happens in
    // a context where the user understands why location matters.
    return null;
  },

  async fetchCurrent(coords) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
      const json = await res.json();
      const tempC = Math.round(json?.current?.temperature_2m);
      const code = json?.current?.weather_code;
      if (!Number.isFinite(tempC)) throw new Error('Weather API returned no temperature');
      return { tempC, icon: this.iconForCode(code) };
    } finally {
      clearTimeout(timeout);
    }
  },

  // Maps WMO weather codes (used by Open-Meteo) to Material Symbols icon names.
  iconForCode(code) {
    if (code === 0) return 'wb_sunny';
    if ([1, 2, 3].includes(code)) return 'wb_cloudy';
    if ([45, 48].includes(code)) return 'foggy';
    if ([51, 53, 55, 56, 57].includes(code)) return 'grain';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rainy';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'ac_unit';
    if ([95, 96, 99].includes(code)) return 'thunderstorm';
    return 'wb_cloudy';
  }
};
