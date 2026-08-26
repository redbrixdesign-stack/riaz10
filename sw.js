const CACHE_PREFIX = 'advisoros-';
const CACHE_NAME = 'advisoros-v6-98';
const STATIC_ASSETS = [
  './','index.html','manifest.json?v=3','css/core.css?v=34','css/components.css?v=49',
  'assets/fonts/material-symbols-rounded.woff2','assets/fonts/hankengrotesk-latin.woff2','assets/fonts/hankengrotesk-latinext.woff2','assets/fonts/jetbrainsmono-latin.woff2',
  'assets/icons/badge-gold-72.png','assets/icons/icon-gold-72.png','assets/icons/icon-gold-96.png','assets/icons/icon-gold-128.png','assets/icons/icon-gold-144.png','assets/icons/icon-gold-152.png','assets/icons/icon-gold-192.png','assets/icons/icon-gold-384.png','assets/icons/icon-gold-512.png','assets/icons/icon-gold-192-maskable.png','assets/icons/icon-gold-512-maskable.png','assets/icons/apple-touch-icon-gold-180.png',
  'assets/img/marker-icon.png','assets/img/marker-icon-2x.png','assets/img/marker-shadow.png',
  'js/vendor/dexie.min.js?v=1','js/vendor/minidexie.min.js?v=12',
  'js/core/config.min.js?v=15','js/core/utils.min.js?v=7','js/core/db.min.js?v=29','js/core/geoprovider.min.js?v=1','js/core/geo.min.js?v=11','js/core/search.min.js?v=3','js/core/tax.min.js?v=2','js/core/install-prompt.min.js?v=1','js/core/app.min.js?v=35','js/core/legal.min.js?v=2','js/core/contact.min.js?v=4',
  'js/services/ai.min.js?v=11','js/services/notification.min.js?v=8','js/services/message-scheduler.min.js?v=6','js/services/export.min.js?v=11','js/services/weather.min.js?v=3','js/services/tasks.min.js?v=1','js/services/quote-document.min.js?v=1','js/services/job-field-service.min.js?v=1','js/services/finance-document.min.js?v=1','js/services/capacity.min.js?v=1','js/services/communications.min.js?v=1',
  'js/features/companion/companion.min.js?v=23','js/features/onboarding/onboarding.min.js?v=7','js/features/today/today.min.js?v=18','js/features/today/home-screen-controller.min.js?v=12','js/features/appointments/appointments.min.js?v=40','js/features/quotes/quotes.min.js?v=1','js/features/jobs/jobs.min.js?v=3','js/features/invoices/invoices.min.js?v=1','js/features/suppliers/suppliers.min.js?v=2','js/features/capacity/capacity.min.js?v=1','js/features/profitability/profitability.min.js?v=1','js/features/retention/retention.min.js?v=1','js/features/customer/customer.min.js?v=10','js/features/route/route.min.js?v=14',
  'js/features/leads/leads.min.js?v=1','js/features/followups/followups.min.js?v=18','js/features/orders/orders.min.js?v=14',
  'js/features/money/money.min.js?v=10','js/features/talk/talk.min.js?v=21','js/features/measure/measure.min.js?v=7',
  'js/features/ocr/ocr.min.js?v=22','js/features/control/control.min.js?v=13','js/features/settings/settings.min.js?v=21'
];

const FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  // Keep a newly installed worker waiting until the page deliberately asks
  // it to activate. This avoids mixing an old, already-running UI with a new
  // cache and worker halfway through a customer workflow.
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map(n => caches.delete(n))
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.protocol === 'chrome-extension:') return;
  if (url.origin !== self.location.origin) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(networkWithTimeout(e.request, 6000)
      .then(cacheResponse)
      .catch(async () => {
        notifyClientsOffline();
        return (await caches.match(e.request)) || (await caches.match('index.html')) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }));
    return;
  }

  // Fingerprinted/versioned shell assets are safe to serve immediately and
  // refresh in the background. A failed asset request never receives HTML.
  if (['script', 'style', 'font', 'image'].includes(e.request.destination)) {
    e.respondWith(caches.match(e.request).then(cached => {
      const refresh = fetch(e.request).then(cacheResponse).catch(() => null);
      return cached || refresh.then(response => response || new Response('', { status: 504 }));
    }));
    return;
  }

  // Do not persist arbitrary same-origin GET/API responses. They may contain
  // private business data and require an endpoint-specific caching contract.
  e.respondWith(fetch(e.request).catch(() => new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  })));
});

function networkWithTimeout(request, timeoutMs) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), timeoutMs))
  ]);
}

function cacheResponse(response) {
  if (response?.ok) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(copy.url, copy));
  }
  return response;
}

// Post a message to every controlled client so the page can flip the
// persistent offline strip even when navigator.onLine lies. Delayed: when
// the message is triggered by a navigation fallback, the freshly-loaded
// window client doesn't exist yet at respondWith time (and its message
// listener registers during app boot), so wait a beat before broadcasting.
function notifyClientsOffline() {
  setTimeout(() => {
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) client.postMessage({ type: 'beelo-offline' });
    });
  }, 1000);
}

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(data.title || 'AdvisorOS', {
    body: data.body || '', icon: 'assets/icons/icon-gold-192.png', badge: 'assets/icons/badge-gold-72.png',
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
