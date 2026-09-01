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
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          ${Array.from({ length: 3 }, () => `
            <div class="skeleton" style="height:72px;border-radius:var(--radius-md);"></div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // This passphrase protects local encrypted records; it is not an account
  // credential. iOS ignores autocomplete="off" on password fields and offers
  // to create/save a website login, then misidentifies the onboarding name as
  // that login's username. WebKit/Chromium can mask an ordinary text control,
  // which keeps the value visually protected without invoking password-manager
  // account heuristics. Browsers without text-security support retain the
  // normal password-field fallback.
  passphraseControl(id, placeholder) {
    const canMaskText = typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('-webkit-text-security', 'disc');
    const common = `class="input passphrase-input" id="${id}" placeholder="${placeholder}" autocomplete="one-time-code" autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="text" data-1p-ignore="true" data-lpignore="true" data-bwignore="true"`;
    if (canMaskText) return `<textarea ${common} rows="1" aria-multiline="false"></textarea>`;
    return `<input type="password" ${common}>`;
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

    // Prompt for encryption passphrase before opening the database
    // so the derived key is available for any customer operations.
    await this.promptPassphrase();

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
        parsedSavedConfig = this.safeJSONParse(savedConfig, 'advisoros_config');
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

    // Restore the device-only AI shared secret after the encryption key and
    // database are ready. Older releases kept it only in sessionStorage; if
    // that value is still present, migrate it into encrypted device storage.
    try {
      let deviceSecret = await DB.getPrivateSetting('__device_ai_secret__', '');
      const sessionSecret = sessionStorage.getItem('advisoros_ai_secret');
      if (!deviceSecret && sessionSecret) {
        deviceSecret = sessionSecret;
        await DB.setPrivateSetting('__device_ai_secret__', deviceSecret);
      }
      if (deviceSecret) {
        CONFIG.ai = { ...(CONFIG.ai || {}), secret: deviceSecret };
        sessionStorage.setItem('advisoros_ai_secret', deviceSecret);
      }
    } catch (e) {
      console.warn('AI shared secret could not be restored');
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
    // EXCEPT a cold launch with an explicit deep link (PWA manifest
    // shortcuts, shared URLs): those must land on their target, not Today.
    const bootHash = window.location.hash.slice(1) || '';
    const hash = onboardingDone ? 'today' : 'onboarding';
    this.navigate(hash);
    if (onboardingDone && bootHash) {
      const cleanBoot = bootHash.split('?')[0];
      if (this.features.has(cleanBoot) && cleanBoot !== 'today') {
        this.navigate(bootHash);
      }
    }

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
    if (typeof NotificationService !== 'undefined') {
      NotificationService.startVisitReminders();
    }

    // Automated message cadence (evening-before / morning-of drafts around
    // each visit). Recomputes its timers fresh on every boot.
    if (typeof MessageScheduler !== 'undefined') {
      try { MessageScheduler.init(); } catch (e) { console.log('MessageScheduler init skipped:', e); }
    }

    console.log('AdvisorOS v5.0 ready');
  },

  // Prompt for the encryption passphrase when the device's configured unlock
  // grace has expired. The active key is held only in memory while Beelo runs.
  async promptPassphrase() {
    // Browser test mode: e2e suites boot a fresh profile and can't click a
    // modal. They set advisoros_enc_test=1 before boot and get a fixed
    // passphrase instead. Real users never see this path.
    if (localStorage.getItem('advisoros_enc_test') === '1') {
      try {
        await initEncryption('test-passphrase-123');
      } catch (e) {
        console.warn('Test-mode encryption init failed:', e);
      }
      return;
    }
    const hasSalt = localStorage.getItem('advisoros_enc_salt');
    if (!hasSalt) {
      // First launch after encryption feature added - create salt and set passphrase
      return new Promise((resolve) => {
        this.openModal(`
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <h3>Set Encryption Passphrase</h3>
          </div>
          <div class="sheet-body p-md">
            <p class="text-secondary mb-lg">Your customer data (names, phones, addresses, emails) will be encrypted at rest. Choose a passphrase you'll remember. You can choose how often Beelo asks for it in Settings.</p>
            <div class="form-group">
              <label>Passphrase</label>
              ${this.passphraseControl('enc-passphrase-new', 'Enter passphrase')}
            </div>
            <div class="form-group">
              <label>Confirm Passphrase</label>
              ${this.passphraseControl('enc-passphrase-confirm', 'Confirm passphrase')}
            </div>
            <div class="fs-12 text-tertiary mb-md">Forgetting this passphrase means permanent loss of customer data. No recovery is possible.</div>
            <button class="btn btn-primary btn-block" data-action="App._setPassphrase">Set Passphrase</button>
            <div class="fs-11 text-tertiary text-center mt-10" >Setting up encryption can take a few seconds on older iPhones — tap once and wait.</div>
          </div>
        `, { className: 'passphrase-gate', onOpen: () => document.getElementById('enc-passphrase-new')?.focus() });
        // The passphrase gate runs BEFORE setupEvents() attaches the delegated
        // data-action router (Phase 4.6), so the button's data-action alone
        // would do nothing — a tap here was silently dead (reported on iPhone).
        // Attach a direct listener so the modal works regardless of router state.
        const setBtn = document.querySelector('[data-action="App._setPassphrase"]');
        if (setBtn) setBtn.addEventListener('click', () => App._setPassphrase());
        const newPassphrase = document.getElementById('enc-passphrase-new');
        const confirmPassphrase = document.getElementById('enc-passphrase-confirm');
        newPassphrase?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); confirmPassphrase?.focus(); }
        });
        confirmPassphrase?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); App._setPassphrase(); }
        });
        App._setPassphrase = async () => {
          const btn = document.querySelector('[data-action="App._setPassphrase"]');
          const fail = (msg) => {
            if (btn) { btn.disabled = false; btn.textContent = 'Set Passphrase'; }
            Toast.show(msg, 'error');
          };
          const p1 = document.getElementById('enc-passphrase-new').value.replace(/[\r\n]/g, '');
          const p2 = document.getElementById('enc-passphrase-confirm').value.replace(/[\r\n]/g, '');
          if (!p1 || p1.length < 8) { fail('Passphrase must be at least 8 characters'); return; }
          if (p1 !== p2) { fail('Passphrases do not match'); return; }
          if (typeof crypto === 'undefined' || !crypto.subtle) {
            fail('Encryption needs a secure (https) connection — open the app from its web address, not a local network link.');
            return;
          }
          if (this._encryptInProgress) return; // single-flight: PBKDF2 is slow on phones
          this._encryptInProgress = true;
          if (btn) { btn.disabled = true; btn.textContent = 'Setting up…'; }
          try {
            await initEncryption(p1);
            localStorage.setItem('advisoros_enc_verify', JSON.stringify(await encryptField('advisoros-enc-verify')));
            await this.rememberUnlock(p1);
            this._encryptInProgress = false;
            this.closeModal();
            delete App._setPassphrase;
            Toast.show('Encryption enabled', 'success');
          } catch (e) {
            this._encryptInProgress = false;
            console.error('Encryption init failed:', e);
            fail('Failed to initialize encryption');
            return;
          }
          resolve();
        };
      });
    } else {
      // Reopen without prompting while the user-selected grace period is
      // still valid. An active on-site visit temporarily extends that grace
      // so iOS cannot put a passphrase gate in the middle of a customer visit.
      if (await this.tryRememberedUnlock()) return;
      // Subsequent launches - prompt for existing passphrase
      return new Promise((resolve) => {
        this.openModal(`
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <h3>Unlock Beelo</h3>
          </div>
          <div class="sheet-body p-md">
            <p class="text-secondary mb-lg">Enter your passphrase to decrypt customer data.</p>
            <div class="form-group">
              <label>Passphrase</label>
              ${this.passphraseControl('enc-passphrase', 'Enter passphrase')}
            </div>
            <div id="enc-error" class="fs-12 text-danger mb-md" style="display:none;"></div>
            <button class="btn btn-primary btn-block" data-action="App._checkPassphrase">Unlock</button>
            <div class="fs-11 text-tertiary text-center mt-10" >Decrypting can take a few seconds on older iPhones — tap Unlock once and wait.</div>
          </div>
        `, { className: 'passphrase-gate', onOpen: () => document.getElementById('enc-passphrase')?.focus() });
        // Same as the set button: the router isn't attached yet, so wire the
        // Unlock button directly (this modal also keeps its Enter-key path).
        const unlockBtn = document.querySelector('[data-action="App._checkPassphrase"]');
        if (unlockBtn) unlockBtn.addEventListener('click', () => App._checkPassphrase());
        App._checkPassphrase = async () => {
          const btn = document.querySelector('[data-action="App._checkPassphrase"]');
          const input = document.getElementById('enc-passphrase');
          const errEl = document.getElementById('enc-error');
          const fail = (msg) => {
            if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
            if (btn) { btn.disabled = false; btn.innerHTML = 'Unlock'; }
            if (input) input.value = '';
          };
          const passphrase = input ? input.value.replace(/[\r\n]/g, '') : '';
          if (!passphrase) { fail('Please enter your passphrase'); return; }
          // WebCrypto needs a secure context. Opening the app over plain
          // http:// (e.g. a LAN address on a phone) leaves crypto.subtle
          // undefined — say so instead of failing as "Incorrect passphrase".
          if (typeof crypto === 'undefined' || !crypto.subtle) {
            fail('Encryption needs a secure (https) connection — open the app from your home-screen icon, not a web address.');
            return;
          }
          if (this._unlockInProgress) return; // single-flight: PBKDF2 blocks the main thread on phones
          this._unlockInProgress = true;
          if (btn) { btn.disabled = true; btn.innerHTML = 'Unlocking…'; }
          try {
            await initEncryption(passphrase);
            const verifyRaw = localStorage.getItem('advisoros_enc_verify');
            if (verifyRaw) {
              const verified = await decryptField(JSON.parse(verifyRaw));
              if (verified !== 'advisoros-enc-verify') throw new Error('Passphrase verification failed');
            }
            await this.rememberUnlock(passphrase);
            this._unlockInProgress = false;
            this.closeModal();
            delete App._checkPassphrase;
            resolve();
          } catch (e) {
            this._unlockInProgress = false;
            fail('Incorrect passphrase');
          }
        };
        // Allow Enter key to submit
        document.getElementById('enc-passphrase').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); App._checkPassphrase(); }
        });
      });
    }
  },

  unlockTimeoutMinutes() {
    try {
      const saved = JSON.parse(localStorage.getItem('advisoros_config') || '{}');
      const value = Number(saved.unlockTimeoutMinutes);
      return [0, 15, 30, 60, 240, 480, 720, 1440].includes(value) ? value : 60;
    } catch (e) {
      return 60;
    }
  },

  _openUnlockCache() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open('beelo-unlock-cache', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unlock cache unavailable'));
    });
  },

  async _unlockCacheRecord(id, value) {
    const db = await this._openUnlockCache();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('cache', value === undefined ? 'readonly' : 'readwrite');
        const store = tx.objectStore('cache');
        const request = value === undefined ? store.get(id) : store.put({ id, value });
        request.onsuccess = () => resolve(value === undefined ? request.result?.value : value);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  },

  async _unlockDeviceKey() {
    let key = await this._unlockCacheRecord('device-key');
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await this._unlockCacheRecord('device-key', key);
    }
    return key;
  },

  async rememberUnlock(passphrase) {
    try {
      const key = await this._unlockDeviceKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(passphrase));
      const minutes = this.unlockTimeoutMinutes();
      await this._unlockCacheRecord('session', {
        iv: Array.from(iv),
        wrapped: Array.from(new Uint8Array(wrapped)),
        expiresAt: Date.now() + (minutes * 60000),
        activeVisitUntil: 0
      });
    } catch (e) {
      // Private browsing and some managed devices block durable CryptoKeys.
      // Falling back to the normal passphrase prompt is safer than weakening it.
      console.warn('Secure unlock grace could not be saved:', e);
    }
  },

  async tryRememberedUnlock() {
    try {
      const record = await this._unlockCacheRecord('session');
      if (!record) return false;
      const now = Date.now();
      if (!(Number(record.expiresAt) > now || Number(record.activeVisitUntil) > now)) return false;
      const key = await this._unlockDeviceKey();
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
        key,
        new Uint8Array(record.wrapped)
      );
      const passphrase = new TextDecoder().decode(plain);
      await initEncryption(passphrase);
      const verifyRaw = localStorage.getItem('advisoros_enc_verify');
      if (verifyRaw && await decryptField(JSON.parse(verifyRaw)) !== 'advisoros-enc-verify') return false;
      return true;
    } catch (e) {
      console.warn('Remembered unlock was unavailable:', e);
      return false;
    }
  },

  // Called by the on-site timer. A visit may keep the secure wrapper usable
  // for up to 12 hours; leaving the customer restarts the selected timeout.
  async setActiveVisitUnlock(active) {
    try {
      const record = await this._unlockCacheRecord('session');
      if (!record) return;
      const now = Date.now();
      record.activeVisitUntil = active ? now + (12 * 60 * 60000) : 0;
      if (!active) record.expiresAt = now + (this.unlockTimeoutMinutes() * 60000);
      await this._unlockCacheRecord('session', record);
    } catch (e) {
      console.warn('Visit unlock grace could not be updated:', e);
    }
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

    // Only warn when storage is genuinely critical. Photos make a fixed 4MB
    // threshold noisy on healthy phones, so use the browser's real quota.
    if (!this._storageQuotaWarned) {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const usageMB = estimate.usage ? Math.round(estimate.usage / 1024 / 1024 * 10) / 10 : 0;
          const quotaMB = estimate.quota ? Math.round(estimate.quota / 1024 / 1024 * 10) / 10 : 0;
          const ratio = estimate.quota ? estimate.usage / estimate.quota : 0;
          const remainingMB = Math.max(0, quotaMB - usageMB);
          const critical = ratio >= 0.90 || (ratio >= 0.75 && remainingMB <= 50);
          if (critical) {
            this._storageQuotaWarned = true;
            const msg = `Beelo storage is nearly full: ${usageMB}MB${quotaMB ? ` of ${quotaMB}MB` : ''}. Export a backup and remove unneeded photos.`;
            console.warn('AdvisorOS storage quota warning:', msg);
            Toast.show(msg, 'warning', 10000);
          }
        }
      } catch (e) {
        // navigator.storage.estimate not supported or failed - silently ignore
      }
    }

    this.state.storageStatus = status;
    if (status.warning) {
      console.warn('AdvisorOS storage warning:', status);
      // console.warn is invisible on a phone with no devtools attached -
      // this is the one piece of information most likely to explain "my
      // data isn't there", so it needs to reach the actual screen.
      const today = new Date().toISOString().slice(0, 10);
      const noticeKey = 'advisoros_storage_notice_day';
      let alreadyShown = false;
      try { alreadyShown = localStorage.getItem(noticeKey) === today; } catch (e) {}
      if (!alreadyShown && typeof Toast !== 'undefined') {
        Toast.show(status.warning, 'warning', 8000);
        try { localStorage.setItem(noticeKey, today); } catch (e) {}
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
    // From 6 April 2026 HMRC's approved car/goods-vehicle mileage rate is
    // 55p/mile for the first 10,000 business miles and 25p above. Repair the
    // previous GB default so existing installations receive the 2026-27 rate.
    if (CONFIG.country === 'GB' && CONFIG.mileageRate === 0.45) {
      CONFIG.mileageRate = 0.55;
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
    if (!['ask', 'apple', 'google', 'waze'].includes(CONFIG.navigationApp)) {
      CONFIG.navigationApp = 'ask';
    }
    if (![0, 15, 30, 60, 240, 480, 720, 1440].includes(Number(CONFIG.unlockTimeoutMinutes))) {
      CONFIG.unlockTimeoutMinutes = 60;
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

  // Generate a standard top-header with optional back button and title
  renderTopHeader(options = {}) {
    const { title = '', showBack = false, backHref = '#today', actions = '' } = options;
    let leftHtml = '';
    if (showBack && title) {
      leftHtml = `<button class="btn btn-ghost btn-sm" aria-label="Back" data-action="App.navigate" data-args='${Utils.escapeHtml(JSON.stringify([(backHref)]))}'><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></button><h1 class="page-heading">${Utils.escapeHtml(title)}</h1>`;
    } else if (showBack) {
      leftHtml = `<button class="btn btn-ghost btn-sm" aria-label="Back" data-action="App.navigate" data-args='${Utils.escapeHtml(JSON.stringify([(backHref)]))}'><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></button>`;
    } else if (title) {
      leftHtml = `<h1 class="page-heading">${Utils.escapeHtml(title)}</h1>`;
    }
    return `
      <div class="top-header">
        <div class="flex items-center gap-md" style="flex:1;">${leftHtml}</div>
        <div class="header-actions flex items-center gap-sm">${actions}</div>
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

  registerLazyFeature(definition) {
    const proxy = {
      id: definition.id,
      name: definition.name,
      icon: definition.icon,
      route: definition.route === true,
      _lazy: true,
      async render(params = {}) {
        await App.loadScripts(definition.scripts);
        const loaded = App.features.get(definition.id);
        if (!loaded || loaded === proxy || loaded._lazy) {
          throw new Error(`${definition.name} failed to load`);
        }
        // Keep the object App.navigate() already selected, but promote it to
        // the real implementation so activate/deactivate and later renders
        // use the loaded feature without a second navigation or layout jump.
        Object.assign(proxy, loaded, { _lazy: false });
        App.features.set(definition.id, proxy);
        return proxy.render(params);
      }
    };
    this.registerFeature(proxy);
  },

  loadScripts(urls = []) {
    return urls.reduce((chain, url) => chain.then(() => {
      if (document.querySelector(`script[data-lazy-src="${url}"]`)) return;
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.dataset.lazySrc = url;
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          reject(new Error(`Could not load ${url}`));
        };
        document.head.appendChild(script);
      });
    }), Promise.resolve());
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

    // Dismiss any iOS keyboard/focused form control before replacing the
    // screen. Otherwise Safari can carry the old visual viewport offset into
    // the next route even when #main.scrollTop is reset correctly.
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') {
      try { active.blur(); } catch (e) { /* detached control */ }
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
          // Guard against stale resolves: if the user navigated away while
          // the render was in flight, don't paint a screen they no longer
          // asked for (it would overwrite the new screen and leave the
          // URL hash out of sync with what's on screen).
          if (App.currentFeature !== feature) return;
          if (typeof html === 'string') {
            main.innerHTML = html;
          }
          if (feature.activate) {
            feature.activate(params);
          }
          App.finalizeNavigation(main, targetHash);
        }).catch(err => {
          console.error('Render error:', err);
          main.innerHTML = `<div class="empty-state">
            <span class="material-symbols-rounded">error</span>
            <div>Failed to load</div>
            <div style="display:flex;gap:8px;margin-top:12px;">
              <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${Utils.escapeHtml(JSON.stringify([(featureId)]))}'>Try again</button>
              ${featureId !== 'today' ? `<button class="btn btn-primary btn-sm" data-action="App.navigate" data-args='["today"]'>Go to Today</button>` : ''}
            </div>
          </div>`;
          App.finalizeNavigation(main, targetHash);
        });
        return; // activate called in promise
      }
    } catch (err) {
      console.error('Render error:', err);
      main.innerHTML = `<div class="empty-state">
        <span class="material-symbols-rounded">error</span>
        <div>Something went wrong loading this screen</div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${Utils.escapeHtml(JSON.stringify([(featureId)]))}'>Try again</button>
          ${featureId !== 'today' ? `<button class="btn btn-primary btn-sm" data-action="App.navigate" data-args='["today"]'>Go to Today</button>` : ''}
        </div>
      </div>`;
      App.finalizeNavigation(main, targetHash);
      return;
    }

    // Activate
    if (feature.activate) {
      try {
        feature.activate(params);
      } catch (e) {
        console.error('Activate error:', e);
      }
    }

    this.finalizeNavigation(main, targetHash);
  },

  // Shared tail of navigate(): fade-in, URL hash, scroll-to-top. Extracted
  // so both the synchronous and async render paths land here — without it,
  // async renders never updated the hash, so the browser back button /
  // back gesture returned to a stale screen (or nothing) instead of Home.
  finalizeNavigation(main, targetHash) {
    // Add fade-in
    main.classList.add('fade-in');
    setTimeout(() => main.classList.remove('fade-in'), 300);

    this._associateLabels(main);

    // Update URL hash
    this.currentHash = targetHash;
    if (window.location.hash.slice(1) !== targetHash) {
      window.location.hash = targetHash;
    }

    // Reset both the app scroller and the document viewport. Repeat after the
    // next paint and after iOS finishes closing its keyboard; a single
    // synchronous #main.scrollTop assignment does not reliably clear Safari's
    // visual-viewport carry-over from a long form.
    this.resetNavigationScroll(main);
    requestAnimationFrame(() => {
      if (this.currentHash === targetHash) this.resetNavigationScroll(main);
    });
    setTimeout(() => {
      if (this.currentHash === targetHash) this.resetNavigationScroll(main);
    }, 180);
  },

  resetNavigationScroll(main) {
    if (main) {
      main.scrollTop = 0;
      if (typeof main.scrollTo === 'function') main.scrollTo(0, 0);
    }
    if (typeof document !== 'undefined') {
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
  },

  // The app's forms use a loose "label next to control" pattern — 100+ labels
  // with no `for` attribute and no wrapping, which is not an accessible name
  // association (axe `label`/`select-name`, WCAG 1.3.1/4.1.2). Run after
  // every render (navigate + modals) to link each label to the control that
  // immediately follows it, so dynamically-built forms stay accessible.
  _associateLabels(root) {
    if (!root) return;
    root.querySelectorAll('label:not([for])').forEach(label => {
      // A wrapping label already associates its control.
      if (label.querySelector('input, select, textarea')) return;
      let control = label.nextElementSibling;
      // Some labels precede a wrapper div that holds the control.
      if (control && !control.matches('input, select, textarea')) {
        const inner = control.querySelectorAll('input, select, textarea');
        if (inner.length === 1) control = inner[0];
        else return;
      }
      if (control && control.id && control.matches('input, select, textarea')) {
        label.setAttribute('for', control.id);
      }
    });
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
      if (!this.features.has(cleanHash)) {
        // Never leave the address bar claiming one screen while another is
        // visible. Replace (rather than push) the invalid history entry so
        // Back does not return the user to the same broken URL.
        window.history.replaceState(null, '', '#today');
        if (this.currentHash !== 'today') this.navigate('today');
      } else if (hash !== this.currentHash) {
        this.navigate(hash);
      }
    });
  },

  // Convert a handler call-string ("Obj.method(args)") into data-action +
  // data-args attributes for the delegated router. Used where handler
  // strings are built in data objects (companion actions, customer
  // timeline). Returns '' for anything not parseable, so templates can drop
  // the attribute safely. This is the ONLY path that turns a string into an
  // action — gated by the same whitelist as the router, never eval.
  actionAttrs(callString) {
    const s = String(callString || '').trim();
    if (!s || s.includes(';')) return '';
    const m = s.match(/^([A-Za-z_][\w.]*)\((.*)\)$/s);
    if (!m) return '';
    const objpath = m[1];
    const arglist = m[2].trim();
    const root = objpath.split('.')[0];
    const KNOWN = ['App', 'AppointmentsFeature', 'SettingsFeature', 'MoneyFeature', 'TalkFeature', 'MeasureFeature', 'OnboardingFeature', 'RouteFeature', 'OrdersFeature', 'ContactFeature', 'HomeScreenController', 'CompanionFeature', 'ExportService', 'OCRFeature', 'ControlFeature', 'TodayFeature', 'Geo', 'CustomerFeature', 'FollowupsFeature', 'LeadsFeature', 'QuotesFeature', 'JobsFeature', 'InvoicesFeature', 'SuppliersFeature', 'CapacityFeature', 'ProfitabilityFeature', 'RetentionFeature', 'CommunicationsFeature', 'VoiceNotes'];
    if (!KNOWN.includes(root)) return '';
    // Convert the JS-ish argument list into a JSON array string:
    //   'appointments', {tab: 'upcoming'}  ->  ["appointments", {"tab": "upcoming"}]
    // Object keys must be quoted and the whole list wrapped in [] or the
    // router's JSON.parse rejects it (dead buttons + console errors).
    const jsonArgs = arglist
      // Stash escaped single quotes so the string-quoting pass below
      // doesn't split on them ('O\'Leary' must stay one string).
      .replace(/\\'/g, '\u0001')
      // Single-quoted strings -> double-quoted (JSON).
      .replace(/'([^']*)'/g, (mm, inner) => '"' + inner.replace(/"/g, '\\"') + '"')
      // Apostrophes are fine inside JSON strings.
      .replace(/\u0001/g, "'")
      // Quote object-literal keys: {tab: ...} -> {"tab": ...}.
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .trim();
    if (jsonArgs === '') {
      return `data-action="${objpath}"`;
    }
    const bracketed = '[' + jsonArgs + ']';
    try {
      JSON.parse(bracketed);
    } catch (e) {
      // Conversion failed (unusual literal) — keep the legacy emission so
      // the router still surfaces the bad-args error instead of a silent
      // wrong call.
      return `data-action="${objpath}" data-args='${jsonArgs}'`;
    }
    return `data-action="${objpath}" data-args='${bracketed}'`;
  },

  // Event setup
  shouldDispatchActionEvent(el, type) {
    const expectedEvent = el.getAttribute('data-event');
    if (expectedEvent) return type === expectedEvent;
    if (type === 'keydown' || type === 'keyup') {
      return type === 'keydown' && !!el.getAttribute('data-key');
    }
    const tag = String(el.tagName || '').toUpperCase();
    const formControl = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (type === 'click') return !formControl;
    if (type === 'change') return formControl;
    return false;
  },

  setupEvents() {
    // Back button handling
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeFullModal();
      }
    });

    // ---- Delegated action router (CSP: removes inline onclick/onchange) ----
    // Every interactive element that used an inline handler now carries
    // data-action="Object.method" plus data-args (JSON array) and, for
    // keydown handlers, data-key="Enter". A single document-level listener
    // dispatches to a WHITELIST of known globals — never eval, so the CSP
    // can drop 'unsafe-inline' without opening an injection vector.
    // data-key support is scoped to the legacy pattern
    //   if(event.key==='Enter'||event.key===' '){...}
    // which becomes data-key="Enter, " (comma-separated accepted keys).
    // Resolve on dispatch rather than snapshotting at boot: secondary
    // features are loaded only when their route is opened.
    const actionObject = name => ({
      App,
      AppointmentsFeature,
      SettingsFeature: typeof SettingsFeature === 'undefined' ? null : SettingsFeature,
      MoneyFeature,
      TalkFeature,
      MeasureFeature,
      OnboardingFeature,
      RouteFeature,
      OrdersFeature,
      ContactFeature,
      HomeScreenController,
      CompanionFeature,
      ExportService,
      OCRFeature,
      ControlFeature,
      TodayFeature,
      Geo,
      CustomerFeature,
      FollowupsFeature,
      LeadsFeature,
      QuotesFeature: typeof QuotesFeature === 'undefined' ? null : QuotesFeature,
      JobsFeature: typeof JobsFeature === 'undefined' ? null : JobsFeature,
      InvoicesFeature: typeof InvoicesFeature === 'undefined' ? null : InvoicesFeature,
      SuppliersFeature: typeof SuppliersFeature === 'undefined' ? null : SuppliersFeature,
      CapacityFeature: typeof CapacityFeature === 'undefined' ? null : CapacityFeature,
      ProfitabilityFeature: typeof ProfitabilityFeature === 'undefined' ? null : ProfitabilityFeature,
      RetentionFeature: typeof RetentionFeature === 'undefined' ? null : RetentionFeature,
      CommunicationsFeature,
      VoiceNotes: typeof VoiceNotes === 'undefined' ? null : VoiceNotes,
      InstallPrompt,
      Legal,
      ConsentPrompt
    })[name];

    const runAction = (el, event) => {
      const action = el.getAttribute('data-action');
      // Some controls deliberately expose their action on only one DOM event.
      // File inputs must complete their native click/default action so Safari
      // can open the camera; processing belongs to the later change event.
      const expectedEvent = el.getAttribute('data-event');
      if (expectedEvent && event.type !== expectedEvent) return false;
      // The modal overlay is a data-close-backdrop target: it exists ONLY to
      // close the sheet when the click lands on the backdrop itself. The
      // router's closest('[data-action]') can match this overlay for ANY
      // event whose target sits inside the sheet (plain form inputs, labels,
      // scroll areas) — without a click-type guard, a keydown/keyup while
      // typing in a modal form would run the overlay's App.closeModal action
      // and the modal would close mid-keystroke (was inline
      // onclick="if(event.target===this)App.closeModal()").
      if (el.getAttribute('data-close-backdrop')) {
        if (event.type === 'click' && event.target === el) {
          event.preventDefault();
          this.closeModal();
        }
        return true;
      }
      // data-stop-propagation: swallow clicks here so they don't bubble to a
      // parent handler (was inline onclick="event.stopPropagation()").
      if (el.getAttribute('data-stop-propagation')) {
        event.stopPropagation();
        return true;
      }
      // data-file: click a hidden file input on tap (was inline
      // document.getElementById('x').click()).
      if (!action && el.getAttribute('data-file')) {
        const fileInput = document.getElementById(el.getAttribute('data-file'));
        if (fileInput) {
          event.preventDefault();
          fileInput.click();
        }
        return true;
      }
      if (!action) return false;
      // data-stop: stop the event bubbling before running (was inline
      // event.stopPropagation();...).
      if (el.getAttribute('data-stop')) {
        event.stopPropagation();
      }
      // data-close: close any open modal first (was inline
      // App.closeModal();...).
      if (el.getAttribute('data-close')) {
        this.closeModal({ all: true, silent: true });
      }
      const dot = action.lastIndexOf('.');
      const objName = dot > 0 ? action.slice(0, dot) : '';
      const method = dot > 0 ? action.slice(dot + 1) : action;
      const obj = actionObject(objName);
      if (!obj) {
        console.error(`[action] unknown object "${objName}" from ${action}`);
        return false;
      }
      if (typeof obj[method] !== 'function') {
        console.error(`[action] "${objName}.${method}" is not a function`);
        return false;
      }
      let args = [];
      const rawArgs = el.getAttribute('data-args');
      if (rawArgs) {
        try {
          // Historical note: data-args used to embed escapeJsString output
          // (\' for apostrophes), which JSON rejects — and the raw '
          // truncated the single-quoted attribute. Args are now built with
          // Utils.escapeHtml(JSON.stringify(...)) (HTML entities decode back
          // to plain JSON). Normalise any legacy \' defensively.
          args = JSON.parse(rawArgs.replace(/\\'/g, "'"));
        } catch (e) {
          console.error(`[action] bad data-args on ${action}:`, rawArgs);
          return false;
        }
        if (!Array.isArray(args)) args = [args];
        // Handlers that need the originating element/event use sentinels in
        // data-args (file inputs pass the change event; inputs pass their
        // value/checked state). Substituted here so no eval is needed.
        args = args.map(a => {
          if (a === '__event__') return event;
          if (a === '__value__') return el.value !== undefined ? el.value : '';
          if (a === '__checked__') return el.checked === true;
          return a;
        });
      }
      // Keydown gate: only gate KEYBOARD events. A click/tap must always
      // dispatch — previously a data-key div[role=button] (e.g. the visit
      // detail's "View customer profile" area) was silently unclickable
      // because clicks have no event.key, so keys.includes(undefined) was
      // false and the action was swallowed.
      // data-key="Enter, " means Enter OR space.
      const keyAttr = el.getAttribute('data-key');
      if (event && event.type === 'keydown' && keyAttr) {
        const keys = keyAttr.split(',').map(k => k.trim() === 'space' ? ' ' : k.trim());
        if (!keys.includes(event.key)) return false;
        event.preventDefault();
      }
      if (event && event.type !== 'keydown' && event.type !== 'change' && event.type !== 'input' && event.type !== 'blur') event.preventDefault();
      try {
        obj[method](...args);
      } catch (e) {
        console.error(`[action] ${action} threw:`, e);
      }
      return true;
    };

    // One listener per event type; the router walks up from the target so
    // buttons nested inside cards/rows still resolve their own data-action.
    ['click', 'change', 'input', 'blur', 'keydown', 'keyup'].forEach(type => {
      document.addEventListener(type, (e) => {
        let el = e.target && e.target.closest ? e.target.closest('[data-action], [data-file]') : null;
        if (!el) return;
        // Native controls already synthesize exactly one click for keyboard
        // activation. Non-native keyboard targets opt in with data-key and
        // dispatch on keydown only, keeping every gesture single-shot.
        if (!this.shouldDispatchActionEvent(el, type)) return;
        runAction(el, e);
      }, true);
    });

    // Online/offline. A fresh offline launch never fires the 'offline' event
    // (it happens before the app boots), so the toast alone would leave the
    // advisor with no signal at all on the exact worst case. The persistent
    // strip answers from navigator.onLine at boot and stays until the
    // connection returns.
    const offlineBanner = document.createElement('div');
    offlineBanner.id = 'offline-banner';
    offlineBanner.innerHTML = '<span class="material-symbols-rounded fs-15" >wifi_off</span><span>Offline — changes are saved on this phone</span>';
    document.getElementById('app').appendChild(offlineBanner);
    const applyOfflineState = (forceOffline) => {
      offlineBanner.style.display = (forceOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) ? 'flex' : 'none';
    };
    // The service worker posts this when it had to serve the shell from
    // cache because the network failed or stalled — the one case where
    // navigator.onLine lies (flaky WiFi, captive portals) and the banner
    // would otherwise never appear even though the app IS offline.
    navigator.serviceWorker?.addEventListener('message', e => {
      if (e.data && e.data.type === 'notification-click' && e.data.data?.appointmentId) {
        this.navigate('appointments', { id: e.data.data.appointmentId });
        return;
      }
      if (e.data && e.data.type === 'beelo-offline') {
        applyOfflineState(true);
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          Toast.show('Working offline', 'warning');
        }
      }
    });
    window.addEventListener('online', () => {
      applyOfflineState();
      Toast.show('Back online', 'success');
    });
    window.addEventListener('offline', () => {
      applyOfflineState();
      Toast.show('Working offline', 'warning');
    });
    applyOfflineState();

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
    overlay.classList.toggle('passphrase-gate', options.className === 'passphrase-gate');
    sheet.scrollTop = 0;
    this._associateLabels(sheet);
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    this._nameDialog(sheet, options);
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Remember what had focus so it can be restored on close (WCAG 2.4.3).
    this._lastFocused = document.activeElement;

    if (options.onOpen) options.onOpen();
    this.focusFirstControl(sheet);
    this.trapFocus(sheet);
  },

  // Keep Tab/Shift+Tab inside the open dialog (WCAG 2.1.2). Registered on
  // the overlay so the sheet's own scroll handling isn't disturbed; removed
  // on close.
  trapFocus(container) {
    this._untrapFocus();
    this._focusTrapEl = container;
    this._onTrapKeydown = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', this._onTrapKeydown, true);
  },

  _untrapFocus() {
    if (this._onTrapKeydown) {
      document.removeEventListener('keydown', this._onTrapKeydown, true);
      this._onTrapKeydown = null;
      this._focusTrapEl = null;
    }
  },

  closeModal(options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const sheet = document.getElementById('bottom-sheet');
    const shouldCloseAll = options === true || options.all;

    if (!shouldCloseAll && this.modalStack.length && sheet && overlay?.classList.contains('active')) {
      const previous = this.modalStack.pop();
      sheet.innerHTML = previous.content;
      sheet.scrollTop = previous.scrollTop || 0;
      this._nameDialog(sheet);
      this.focusFirstControl(sheet);
      this.trapFocus(sheet);
      return;
    }

    this.modalStack = [];
    this._untrapFocus();
    if (overlay) {
      overlay.classList.remove('active');
      overlay.classList.remove('passphrase-gate');
    }
    if (sheet) {
      sheet.innerHTML = '';
      sheet.removeAttribute('role');
      sheet.removeAttribute('aria-modal');
      sheet.removeAttribute('aria-label');
      sheet.removeAttribute('aria-labelledby');
    }
    document.body.style.overflow = '';

    // Restore focus to whatever opened the modal (WCAG 2.4.3).
    if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
      try { this._lastFocused.focus({ preventScroll: true }); } catch (e) { /* element may be gone */ }
    }
    this._lastFocused = null;
  },

  openFullModal(content, options = {}) {
    const modal = document.getElementById('modal-full');
    if (!modal) return;

    modal.innerHTML = content;
    this._associateLabels(modal);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    this._nameDialog(modal, options);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    this._lastFocused = document.activeElement;

    if (options.onOpen) options.onOpen();
    this.focusFirstControl(modal);
    this.trapFocus(modal);
  },

  closeFullModal() {
    const modal = document.getElementById('modal-full');
    if (modal) {
      modal.classList.remove('active');
      modal.removeAttribute('role');
      modal.removeAttribute('aria-modal');
      modal.removeAttribute('aria-label');
      modal.removeAttribute('aria-labelledby');
    }
    this._untrapFocus();
    document.body.style.overflow = '';
    if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
      try { this._lastFocused.focus({ preventScroll: true }); } catch (e) { /* element may be gone */ }
    }
    this._lastFocused = null;
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

  // Every dialog needs an accessible name. Most call sites already include a
  // visible heading, so associate it automatically and allow explicit labels
  // for the few deliberately heading-free sheets.
  _nameDialog(container, options = {}) {
    container.removeAttribute('aria-label');
    container.removeAttribute('aria-labelledby');
    if (options.ariaLabel) {
      container.setAttribute('aria-label', options.ariaLabel);
      return;
    }
    const heading = container.querySelector('h1, h2, h3, [data-dialog-title]');
    if (heading) {
      if (!heading.id) heading.id = `dialog-title-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      container.setAttribute('aria-labelledby', heading.id);
      return;
    }
    container.setAttribute('aria-label', 'Dialog');
  },

  // Service worker
  async setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        // Browser suites deliberately seed this flag before boot. Capture it
        // before the asynchronous registration so a waiting worker cannot
        // cover the install/onboarding UI those suites are exercising.
        const suppressUpdateUI = localStorage.getItem('advisoros_enc_test') === '1';
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered:', registration.scope);
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (suppressUpdateUI || refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        const offerUpdate = worker => {
          if (suppressUpdateUI || !worker || !navigator.serviceWorker.controller || this._updateOffered) return;
          this._updateOffered = true;
          this.openModal(`
            <div class="sheet-handle"></div>
            <div class="sheet-header"><h3>Update ready</h3></div>
            <div class="sheet-body p-md">
              <p class="text-secondary mb-lg">A new version of Beelo is ready. Update now to load it safely.</p>
              <button class="btn btn-primary btn-block" data-action="App.applyServiceWorkerUpdate">Update and reload</button>
              <button class="btn btn-ghost btn-block mt-sm" data-action="App.closeModal">Later</button>
            </div>`);
        };

        this._waitingServiceWorker = registration.waiting || null;
        if (registration.waiting) offerUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              this._waitingServiceWorker = worker;
              offerUpdate(worker);
            }
          });
        });
      } catch (err) {
        console.log('Service Worker registration failed:', err);
      }
    }
  },

  applyServiceWorkerUpdate() {
    const worker = this._waitingServiceWorker;
    if (!worker) return;
    const button = document.querySelector('[data-action="App.applyServiceWorkerUpdate"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Updating…';
    }
    worker.postMessage({ type: 'SKIP_WAITING' });
  },
};

// Toast notification system
const Toast = {
  container: null,

  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    // WCAG 4.1.3: announce toast messages to screen readers without
    // interrupting ongoing speech (polite status region).
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
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
