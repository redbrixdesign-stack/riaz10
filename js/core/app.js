/* ============================================
   ADVISOROS v5.0 — CORE APP
   Module loader, router, state management
   ============================================ */

const App = {
  // State
  currentFeature: null,
  currentHash: '',
  features: new Map(),
  modalStack: [],
  state: {},

  // Generic loading shell shown while a feature's async render() resolves.
  // Blocks mirror the standard screen layout (top header + card list) so the
  // swap to real content doesn't jump the layout.
  renderSkeleton(featureName = '') {
    return `
      <div class="fade-in skeleton-screen" aria-busy="true" aria-label="Loading ${Utils.escapeHtml(featureName || 'screen')}">
        <div class="top-header">
          <span class="skeleton" style="width:110px;height:22px;border-radius:6px;"></span>
          <span class="skeleton" style="width:36px;height:36px;border-radius:50%;"></span>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          ${Array.from({ length: 3 }, () => `
            <div class="skeleton" style="height:72px;border-radius:var(--radius-md);"></div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // Initialize
  // Safe JSON.parse wrapper with debugging for corrupted stored data
  safeJSONParse(str, key) {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch (e) {
      // Log the corrupted value for debugging (truncated for safety)
      const preview = str.slice(0, 500);
      console.error(`JSON.parse failed for localStorage key "${key}":`, e.message);
      console.error(`Corrupted value preview: ${preview}`);
      // Remove corrupted value to prevent repeated failures
      try { localStorage.removeItem(key); } catch (err) {}
      throw e;
    }
  },

  async init() {
    console.log('AdvisorOS v5.0 initializing...');

    // Initialize database first so DB-backed settings can load.
    try {
      await DB.init();
    } catch (e) {
      console.error('DB init failed:', e);
      Toast.show('Database initialization failed', 'error');
    }
    await this.verifyStorage();

    // Load config from localStorage (legacy) or DB
    const savedConfig = localStorage.getItem('advisoros_config');
    let parsedSavedConfig = null;
    if (savedConfig) {
      try {
        parsedSavedConfig = safeJSONParse(savedConfig, 'advisoros_config');
        Object.assign(CONFIG, parsedSavedConfig);
      } catch (e) {
        console.warn('Failed to load saved config');
      }
    }
    // Also try to load from DB
    try {
      const dbConfig = await DB.getSetting('config');
      if (dbConfig) {
        Object.assign(CONFIG, dbConfig);
      }
    } catch (e) {
      console.log('No DB config yet');
    }

    this.migrateConfig();

    // Setup navigation
    this.setupNavigation();

    // Setup event listeners
    this.setupEvents();

    // First-run check: send to onboarding if not completed
    const onboardingDone = CONFIG.onboardingComplete || parsedSavedConfig?.onboardingComplete;
    // Always land on the day-aware Today screen on a fresh launch, not
    // whatever tab was left in the hash last time (e.g. #money) - Today is
    // the one screen that already decides Morning/Mid-Day/Evening for you,
    // so opening anywhere else undermines the whole point of it.
    const hash = onboardingDone ? 'today' : 'onboarding';
    this.navigate(hash);

    // Setup service worker
    this.setupServiceWorker();

    // Geolocation: warms up current position and resumes any trip left in progress
    if (typeof Geo !== 'undefined') {
      try { Geo.init(); } catch (e) { console.log('Geo init skipped:', e); }
    }

    // Non-blocking - the Home screen's follow-up nudge uses the same learned
    // timing, so this warms the cache before the Talk tab has ever been opened.
    if (typeof TalkFeature !== 'undefined') {
      TalkFeature.refreshLearnedTiming().catch(e => console.log('Learned timing warm-up skipped:', e));
    }

    if (typeof NotificationService !== 'undefined' && NotificationService.isMorningBriefEnabled()) {
      NotificationService._queueNextMorningBrief();
    }

    // Automated message cadence (evening-before / morning-of drafts around
    // each visit). Recomputes its timers fresh on every boot.
    if (typeof MessageScheduler !== 'undefined') {
      try { MessageScheduler.init(); } catch (e) { console.log('MessageScheduler init skipped:', e); }
    }

    console.log('AdvisorOS v5.0 ready');
  },

  async verifyStorage() {
    const status = {
      origin: window.location.origin,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      mode: DB.db?.storageMode || 'unknown',
      localStorage: false,
      database: false,
      warning: ''
    };

    try {
      const key = 'advisoros_storage_probe';
      const value = `${Date.now()}`;
      localStorage.setItem(key, value);
      status.localStorage = localStorage.getItem(key) === value;
    } catch (e) {
      status.localStorage = false;
    }

    try {
      await DB.setSetting('__storage_probe__', { origin: status.origin, updatedAt: new Date().toISOString() });
      const saved = await DB.getSetting('__storage_probe__');
      status.database = !!saved && saved.origin === status.origin;
      status.mode = DB.db?.storageMode || status.mode;
    } catch (e) {
      status.database = false;
    }

    const host = status.hostname || '';
    if (status.protocol === 'file:') {
      status.warning = 'This is running from a local file. Use the Vercel HTTPS link on iPhone for reliable app storage.';
    } else if (!status.localStorage || !status.database || status.mode === 'memory') {
      status.warning = 'This browser is not giving the app reliable storage. Export backups often or try Safari without private browsing.';
    }

    this.state.storageStatus = status;
    if (status.warning) {
      console.warn('AdvisorOS storage warning:', status);
      // console.warn is invisible on a phone with no devtools attached -
      // this is the one piece of information most likely to explain "my
      // data isn't there", so it needs to reach the actual screen.
      if (typeof Toast !== 'undefined') {
        Toast.show(status.warning, 'warning', 8000);
      }
    }
    return status;
  },

  migrateConfig() {
    if (!CONFIG.taxBands) {
      CONFIG.taxBands = [
        { limit: 37700, rate: 0.20 },
        { limit: 74870, rate: 0.40 },
        { limit: Infinity, rate: 0.45 }
      ];
    }
    if (!CONFIG.class4NIC?.lowerThreshold) {
      CONFIG.class4NIC = { lowerThreshold: 12570, upperThreshold: 50270, mainRate: 0.06, additionalRate: 0.02 };
    }
    // HMRC's approved car mileage rate is 45p/mile (first 10,000 miles),
    // 25p above. A legacy migration once overwrote the correct 0.45 default
    // with 0.55 (overclaiming the relief by 22% in the tax estimate), so
    // this normalises any install back to the HMRC rate.
    if (CONFIG.country === 'GB' && CONFIG.mileageRate === 0.55) {
      CONFIG.mileageRate = 0.45;
      CONFIG.mileageRateOver = 0.25;
    }
    // Weekly sales target is now DERIVED (weeklyTarget ÷ effective commission rate) —
    // see TaxCalculator.getRequiredWeeklySales(). No stored default to migrate here.
    // Migrate legacy single-rate commission config ({ type: 'percentage', rate }) to the
    // configurable model, and make sure a mode is always present.
    if (!CONFIG.commission || !CONFIG.commission.mode) {
      const legacy = CONFIG.commission || {};
      if (legacy.type === 'percentage' && typeof legacy.rate === 'number') {
        CONFIG.commission = { mode: 'simple', simpleRate: legacy.rate, saleReductionRate: 20, netCommissionRate: 15.25, tiers: legacy.tiers || null };
      } else {
        CONFIG.commission = { mode: 'two_stage', simpleRate: 10, saleReductionRate: 20, netCommissionRate: 15.25, tiers: null };
      }
    }
    this.setBranding();
  },

  // Reflects the configurable company name (Settings > Company Branding) into
  // chrome that isn't re-rendered per navigation, e.g. the browser tab title.
  // Note: manifest.json (PWA install name/icon) is a static file and can't be
  // changed at runtime — only in-app/browser-tab branding updates live.
  setBranding() {
    const name = (CONFIG.companyName || '').trim();
    document.title = name ? `${name} · Beelo` : 'Beelo';
  },

  // Generate a standard top-header with optional back button, title, and Beelo avatar
  renderTopHeader(options = {}) {
    const { title = '', showBack = false, backHref = '#today', actions = '' } = options;
    const avatarHtml = `
      <button class="beelo-avatar" type="button" aria-label="Open Beelo companion" onclick="App.navigate('today')">
        B
      </button>`;
    let leftHtml = '';
    if (showBack) {
      leftHtml = `<button class="btn btn-ghost btn-sm" onclick="App.navigate('${Utils.escapeJsString(backHref)}')"><span class="material-symbols-rounded">arrow_back</span></button>`;
    } else if (title) {
      leftHtml = `<h1 class="page-heading">${Utils.escapeHtml(title)}</h1>`;
    }
    return `
      <div class="top-header">
        <div class="flex items-center gap-md" style="flex:1;">${leftHtml}</div>
        <div class="header-actions flex items-center gap-sm">${actions}${avatarHtml}</div>
      </div>`;
  },

  // Deposit calculation
  calculateDeposit(total) {
    const rules = CONFIG.depositRules;
    if (total < rules.minimum) {
      return { amount: total, type: 'full' };
    }
    if (total <= rules.fullPaymentThreshold) {
      return { amount: total, type: 'full' };
    }
    return { 
      amount: Math.round(total * (rules.percentageAboveThreshold / 100) * 100) / 100, 
      type: 'percentage' 
    };
  },

  // Feature registration
  registerFeature(feature) {
    if (!feature || !feature.id || !feature.render) {
      console.error('Feature must have id and render method');
      return;
    }

    this.features.set(feature.id, feature);

    // Build nav item
    if (feature.route !== false) {
      this.buildNavItem(feature);
    }

    // Initialize if has init method
    if (feature.init) {
      try {
        feature.init();
      } catch (e) {
        console.error(`Feature init failed: ${feature.id}`, e);
      }
    }

    console.log(`Feature registered: ${feature.id}`);
  },

  // Navigation
  navigate(featureId, params = {}) {
    // Handle hash params
    if (featureId.includes('?')) {
      const [id, query] = featureId.split('?');
      featureId = id;
      const urlParams = new URLSearchParams(query);
      urlParams.forEach((value, key) => {
        params[key] = value;
      });
    }
    // Drop undefined/null params before serialising. URLSearchParams turns
    // an undefined VALUE into the string "undefined" (e.g. date=undefined),
    // which downstream forms read as a real value and render into date/time
    // inputs as an invalid value — leaving the form's date empty so the
    // visit silently fails to save.
    const cleanParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) cleanParams[key] = value;
    }
    const hasParams = Object.keys(cleanParams).length > 0;
    const targetHash = hasParams ? `${featureId}?${new URLSearchParams(cleanParams).toString()}` : featureId;

    const feature = this.features.get(featureId);
    if (!feature) {
      console.error(`Feature not found: ${featureId}`);
      // Fallback to today
      if (featureId !== 'today') {
        this.navigate('today');
      }
      return;
    }

    this.closeModal({ all: true, silent: true });
    this.closeFullModal({ silent: true });

    // Deactivate current
    if (this.currentFeature && this.currentFeature.deactivate) {
      try {
        this.currentFeature.deactivate();
      } catch (e) {
        console.error('Deactivate error:', e);
      }
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.feature === featureId);
    });

    // Activate new
    this.currentFeature = feature;

    // Render
    const main = document.getElementById('main');
    if (!main) return;

    main.innerHTML = '';

    try {
      const content = feature.render(params);
      if (typeof content === 'string') {
        main.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        main.appendChild(content);
      } else if (content && typeof content.then === 'function') {
        // Handle async render — show a skeleton shell while the promise
        // resolves so the screen never sits blank (flickering white) on
        // first paint.
        main.innerHTML = App.renderSkeleton(feature.name || featureId);
        content.then(html => {
          if (typeof html === 'string') {
            main.innerHTML = html;
          }
          if (feature.activate) {
            feature.activate(params);
          }
        }).catch(err => {
          console.error('Render error:', err);
          main.innerHTML = `<div class="empty-state">
            <span class="material-symbols-rounded">error</span>
            <div>Failed to load</div>
            <div style="display:flex;gap:8px;margin-top:12px;">
              <button class="btn btn-outline btn-sm" onclick="App.navigate('${Utils.escapeJsString(featureId)}')">Try again</button>
              ${featureId !== 'today' ? `<button class="btn btn-primary btn-sm" onclick="App.navigate('today')">Go to Today</button>` : ''}
            </div>
          </div>`;
        });
        return; // activate called in promise
      }
    } catch (err) {
      console.error('Render error:', err);
      main.innerHTML = `<div class="empty-state">
        <span class="material-symbols-rounded">error</span>
        <div>Something went wrong loading this screen</div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-outline btn-sm" onclick="App.navigate('${Utils.escapeJsString(featureId)}')">Try again</button>
          ${featureId !== 'today' ? `<button class="btn btn-primary btn-sm" onclick="App.navigate('today')">Go to Today</button>` : ''}
        </div>
      </div>`;
      return;
    }

    // Add fade-in
    main.classList.add('fade-in');
    setTimeout(() => main.classList.remove('fade-in'), 300);

    // Activate
    if (feature.activate) {
      try {
        feature.activate(params);
      } catch (e) {
        console.error('Activate error:', e);
      }
    }

    // Update URL hash
    this.currentHash = targetHash;
    if (window.location.hash.slice(1) !== targetHash) {
      window.location.hash = targetHash;
    }

    // Scroll to top
    main.scrollTop = 0;
  },

  // Build nav item
  buildNavItem(feature) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    // Check if already exists
    if (nav.querySelector(`[data-feature="${feature.id}"]`)) return;

    const item = document.createElement('button');
    item.className = 'nav-item';
    item.dataset.feature = feature.id;
    item.type = 'button';
    item.setAttribute('aria-label', feature.name);
    item.innerHTML = `
      <span class="material-symbols-rounded">${feature.icon}</span>
      <span>${feature.name}</span>
    `;
    item.addEventListener('click', () => this.navigate(feature.id));

    nav.appendChild(item);
  },

  // Setup navigation from hash
  setupNavigation() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'today';
      const cleanHash = hash.split('?')[0];
      if (this.features.has(cleanHash) && hash !== this.currentHash) {
        this.navigate(hash);
      }
    });
  },

  // Event setup
  setupEvents() {
    // Back button handling
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeFullModal();
      }
    });

    // Online/offline
    window.addEventListener('online', () => {
      Toast.show('Back online', 'success');
    });
    window.addEventListener('offline', () => {
      Toast.show('Working offline', 'warning');
    });

    // Safety net for errors that escape the feature render/activate try-catch
    // in navigate() - e.g. an inline onclick handler in rendered HTML throwing,
    // or an unhandled promise rejection anywhere in the app. Without this such
    // errors just fail silently to the console with no signal to the user.
    let lastGlobalErrorToast = 0;
    const notifyUnexpectedError = () => {
      const now = Date.now();
      // Throttle: a single bug can throw repeatedly (e.g. in a loop or timer),
      // don't spam the user with a toast per occurrence.
      if (now - lastGlobalErrorToast < 4000) return;
      lastGlobalErrorToast = now;
      Toast.show('Something went wrong there - your data is safe', 'error');
    };
    // Persists escaped errors to a small localStorage ring buffer (capped at
    // 50 entries). The console is invisible on a phone, so this is the one
    // place a crash can be diagnosed later — the key is visible in devtools
    // and clears with the rest of the app data on factory reset.
    const logError = (err) => {
      try {
        const entry = {
          at: new Date().toISOString(),
          name: (err && err.name) || 'Error',
          message: (err && (err.message || String(err))) || 'Unknown error',
          stack: err && err.stack ? String(err.stack).split('\n').slice(0, 6).join(' | ') : ''
        };
        const prev = this.safeJSONParse(localStorage.getItem('advisoros_error_log') || '[]', 'advisoros_error_log') || [];
        prev.push(entry);
        localStorage.setItem('advisoros_error_log', JSON.stringify(prev.slice(-50)));
      } catch (e) { /* storage unavailable — nothing more to do */ }
    };
    window.addEventListener('error', (e) => {
      console.error('Unhandled error:', e.error || e.message);
      logError(e.error || new Error(e.message || 'window error'));
      notifyUnexpectedError();
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('Unhandled promise rejection:', e.reason);
      logError(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
      notifyUnexpectedError();
    });
  },

  // Modal management
  openModal(content, options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const sheet = document.getElementById('bottom-sheet');

    if (!overlay || !sheet) return;

    if (!options.replace && overlay.classList.contains('active') && sheet.innerHTML.trim()) {
      this.modalStack.push({
        content: sheet.innerHTML,
        scrollTop: sheet.scrollTop
      });
    }

    sheet.innerHTML = content;
    sheet.scrollTop = 0;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (options.onOpen) options.onOpen();
    this.focusFirstControl(sheet);
  },

  closeModal(options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const sheet = document.getElementById('bottom-sheet');
    const shouldCloseAll = options === true || options.all;

    if (!shouldCloseAll && this.modalStack.length && sheet && overlay?.classList.contains('active')) {
      const previous = this.modalStack.pop();
      sheet.innerHTML = previous.content;
      sheet.scrollTop = previous.scrollTop || 0;
      this.focusFirstControl(sheet);
      return;
    }

    this.modalStack = [];
    if (overlay) {
      overlay.classList.remove('active');
    }
    if (sheet) {
      sheet.innerHTML = '';
      sheet.removeAttribute('role');
      sheet.removeAttribute('aria-modal');
    }
    document.body.style.overflow = '';
  },

  openFullModal(content, options = {}) {
    const modal = document.getElementById('modal-full');
    if (!modal) return;

    modal.innerHTML = content;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (options.onOpen) options.onOpen();
    this.focusFirstControl(modal);
  },

  closeFullModal() {
    const modal = document.getElementById('modal-full');
    if (modal) {
      modal.classList.remove('active');
      modal.removeAttribute('role');
      modal.removeAttribute('aria-modal');
    }
    document.body.style.overflow = '';
  },

  focusFirstControl(container) {
    requestAnimationFrame(() => {
      const target = container.querySelector('[autofocus], input:not([type="hidden"]), select, textarea') ||
        container.querySelector('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    });
  },

  // Service worker
  async setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered:', registration.scope);
      } catch (err) {
        console.log('Service Worker registration failed:', err);
      }
    }
  },
};

// Toast notification system
const Toast = {
  container: null,

  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3000) {
    if (!this.container) this.init();

    const icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="material-symbols-rounded">${icons[type] || 'info'}</span>
      <span>${Utils.escapeHtml(message)}</span>
    `;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// Initialize app when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
