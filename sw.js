const CACHE_NAME = 'advisoros-v5-40';
const FONT_CACHE_NAME = 'advisoros-fonts-1';
const STATIC_ASSETS = [
  './','index.html','css/core.css','css/components.css?v=11',
  'js/vendor/minidexie.min.js?v=9',
  'js/core/config.min.js?v=5','js/core/utils.min.js?v=3','js/core/db.min.js?v=8','js/core/geo.min.js?v=4','js/core/search.min.js?v=2','js/core/tax.min.js?v=2','js/core/app.min.js?v=4','js/core/contact.min.js?v=2',
  'js/services/notification.min.js?v=3','js/services/export.min.js?v=2','js/services/weather.min.js?v=2',
  'js/features/onboarding/onboarding.min.js?v=3','js/features/today/today.min.js?v=13','js/features/today/home-screen-controller.min.js?v=2','js/features/appointments/appointments.min.js?v=12','js/features/route/route.min.js?v=4',
  'js/features/money/money.min.js?v=3','js/features/talk/talk.min.js?v=4','js/features/measure/measure.min.js?v=2',
  'js/features/ocr/ocr.min.js?v=8','js/features/control/control.min.js?v=2','js/features/settings/settings.min.js?v=6'
];

const FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(n => n !== CACHE_NAME && n !== FONT_CACHE_NAME).map(n => caches.delete(n))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.protocol === 'chrome-extension:') return;

  // Material Symbols / Google Fonts: these are the icon font used throughout
  // the whole UI (nav bar, buttons, cards). They're cross-origin so the
  // in-app cache above skips them by design — but without ANY offline
  // caching for them, a poor/blocked connection makes every icon in the app
  // render as literal text (e.g. "chevron_right") instead of an icon.
  // Stale-while-revalidate: serve the cached version instantly if we have
  // one, and refresh it in the background — so it's available offline after
  // the first successful load, and still stays current when online.
  if (FONT_ORIGINS.includes(url.hostname)) {
    e.respondWith(
      caches.open(FONT_CACHE_NAME).then(async cache => {
        const cached = await cache.match(e.request);
        const networkFetch = fetch(e.request).then(resp => {
          if (resp && resp.ok) cache.put(e.request, resp.clone());
          return resp;
        }).catch(() => null);
        return cached || (await networkFetch) || new Response('', { status: 504 });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Same-origin app files: network-first. This is what actually makes "I
  // pushed a fix" and "the installed PWA is running the fix" the same
  // statement — a cache-first strategy here would keep serving old JS/CSS
  // indefinitely whenever the network is fine, contradicting the whole point
  // of shipping a fix. Falls back to cache (then to the app shell) only when
  // the network genuinely isn't available.
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp && resp.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, resp.clone()));
      return resp;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('index.html')))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(data.title || 'AdvisorOS', {
    body: data.body || '', icon: 'assets/icons/icon-192.png', badge: 'assets/icons/badge-72.png',
    tag: data.tag || 'default', data: data.data || {}, requireInteraction: data.requireInteraction || false, actions: data.actions || []
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window'}).then(clients => {
    if (clients.length > 0) { clients[0].focus(); clients[0].postMessage({type:'notification-click',data:e.notification.data}); }
    else self.clients.openWindow('./');
  }));
});
