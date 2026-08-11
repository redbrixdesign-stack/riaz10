/* ============================================
   ADVISOROS v5.0 — SETTINGS FEATURE
   Config, targets, notifications, data management
   ============================================ */

const SettingsFeature = {
  id: 'settings',
  name: 'Settings',
  icon: 'settings',
  route: false, // reached from Tools (kept the bottom nav to 5 items)

  render() {
    const briefEnabled = NotificationService.isMorningBriefEnabled();

    return `<div class="fade-in">
      <div class="top-header"><h1>Settings</h1></div>
      <div style="padding:16px;">

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:12px;">Your Details</div>
          <div class="form-group">
            <label>Name</label>
            <input type="text" class="input" id="set-name" value="${Utils.escapeAttr(CONFIG.advisorName || '')}" placeholder="Your full name" onblur="SettingsFeature.setName(this.value)">
          </div>
          <div class="form-group">
            <label>Weekly Earnings Target (£)</label>
            <input type="number" class="input" id="set-target" value="${CONFIG.weeklyTarget || 600}" step="10" min="0" onblur="SettingsFeature.setTarget(this.value)">
            <div class="hint">What you want to take home this week. Everything else derives from this.</div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Weekly Sales Target (derived)</label>
            <input type="text" class="input" id="set-sales-target" value="${Utils.formatCurrency(TaxCalculator.getRequiredWeeklySales(CONFIG.weeklyTarget)).replace('.00','')}" disabled style="opacity:0.75;">
            <div class="hint">Sales needed to hit your earnings target at the current ${(TaxCalculator.getEffectiveCommissionRate() * 100).toFixed(1)}% effective commission rate. Change your commission structure below to update this automatically.</div>
          </div>
          <div class="form-group" style="margin-bottom:0;margin-top:14px;">
            <label>Minimum Hourly Value (&pound;)</label>
            <input type="number" class="input" id="set-min-hourly" value="${CONFIG.minHourlyRate || ''}" placeholder="${TaxCalculator.getMinHourlyRate().rate.toFixed(0)} (estimated)" step="1" min="0" onblur="SettingsFeature.setMinHourlyRate(this.value)">
            <div class="hint">What your time is worth, at minimum. Only used by "Check my floor" on a visit after a price objection — leave blank to use a rough estimate from your weekly target.</div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:12px;">Company Branding</div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Company Name</label>
            <input type="text" class="input" id="set-company-name" value="${Utils.escapeAttr(CONFIG.companyName || '')}" placeholder="e.g. Your Company Ltd" onblur="SettingsFeature.setCompanyName(this.value)">
            <div class="hint">Shown throughout the app in place of "AdvisorOS". Leave blank to use the default AdvisorOS branding.</div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:4px;">Business Base</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Where you normally start and return from. Used for route distance and ETA planning.</div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Home / Business Address</label>
            <textarea class="textarea" id="set-business-address" placeholder="e.g. 12 Example Street, Manchester M14 7FZ" onblur="SettingsFeature.setBusinessAddress(this.value)">${Utils.escapeHtml(CONFIG.businessAddress || '')}</textarea>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div style="font-weight:600;">Morning Brief</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">7am UK time — but only if AdvisorOS is open (or was recently) around then. Phones suspend background tabs/PWAs, so this won't reliably fire overnight; it's a bonus, not a real alarm.</div>
            </div>
            <button class="btn btn-sm ${briefEnabled ? 'btn-primary' : 'btn-outline'}" onclick="SettingsFeature.toggleMorningBrief()">
              ${briefEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        ${this.renderAICard()}

        ${this.renderAutoMessagesCard()}

        ${this.renderCommissionCard()}

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:12px;">Advisor Mode</div>
          <div class="segmented">
            <button class="segment ${CONFIG.advisorMode === 'company' ? 'active' : ''}" onclick="SettingsFeature.setMode('company')">Company</button>
            <button class="segment ${CONFIG.advisorMode === 'independent' ? 'active' : ''}" onclick="SettingsFeature.setMode('independent')">Independent</button>
          </div>
        </div>

        <div class="form-group"><label>Trade</label>
          <select class="select" onchange="SettingsFeature.setTrade(this.value)">
            ${CONFIG.trades.map(t => `<option value="${t.id}" ${CONFIG.trade === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:12px;">Units</div>
          <div style="display:flex;gap:16px;">
            <div style="flex:1;"><label style="font-size:12px;color:var(--text-secondary);">Distance</label>
              <div class="segmented" style="margin-top:4px;">
                <button class="segment ${CONFIG.distanceUnit === 'miles' ? 'active' : ''}" onclick="SettingsFeature.setDistanceUnit('miles')">mi</button>
                <button class="segment ${CONFIG.distanceUnit === 'km' ? 'active' : ''}" onclick="SettingsFeature.setDistanceUnit('km')">km</button>
              </div>
              ${CONFIG.country === 'GB' ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">HMRC pays mileage relief in miles</div>' : ''}
            </div>
            <div style="flex:1;"><label style="font-size:12px;color:var(--text-secondary);">Measurement</label>
              <div class="segmented" style="margin-top:4px;">
                <button class="segment ${CONFIG.measurementUnit === 'mm' ? 'active' : ''}" onclick="SettingsFeature.setMeasurementUnit('mm')">mm</button>
                <button class="segment ${CONFIG.measurementUnit === 'cm' ? 'active' : ''}" onclick="SettingsFeature.setMeasurementUnit('cm')">cm</button>
                <button class="segment ${CONFIG.measurementUnit === 'inches' ? 'active' : ''}" onclick="SettingsFeature.setMeasurementUnit('inches')">in</button>
              </div>
            </div>
          </div>
        </div>

        <div class="divider-text">Data</div>
        ${this.renderStorageCard()}
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="ExportService.exportBackup()"><span class="material-symbols-rounded">backup</span>Export Backup</button>
          <button class="btn btn-outline btn-sm" onclick="SettingsFeature.importBackup()"><span class="material-symbols-rounded">restore</span>Import Backup</button>
          <button class="btn btn-outline btn-sm" onclick="SettingsFeature.exportCSV()"><span class="material-symbols-rounded">download</span>Export to CSV</button>
          <input type="file" id="import-file" accept=".json" style="display:none;" onchange="SettingsFeature.handleImport(event)">
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          <button class="btn btn-outline btn-sm" style="color:var(--danger,#e5484d);border-color:var(--danger,#e5484d66);" onclick="SettingsFeature.confirmWipe()">
            <span class="material-symbols-rounded">delete_forever</span>Start fresh — delete all data
          </button>
        </div>

        <div style="margin-top:32px;text-align:center;color:var(--text-tertiary);font-size:13px;">
          <div>${CONFIG.companyName ? Utils.escapeHtml(CONFIG.companyName) + ' · ' : ''}AdvisorOS v5.0</div>
          <div style="margin-top:4px;">Your day, visits, follow-ups, and money in one place.</div>
        </div>
      </div>
    </div>`;
  },

  renderStorageCard() {
    const status = App.state.storageStatus || {};
    const mode = status.mode || 'checking';
    const reliable = status.localStorage && status.database && mode !== 'memory';
    const icon = reliable ? 'database' : 'warning';
    const title = reliable ? 'Storage looks persistent' : 'Storage needs attention';
    const detail = status.warning || `Using ${mode}. Keep using the same website address so your data stays in the same app storage.`;
    const origin = status.origin && status.origin !== 'null' ? status.origin : window.location.href.split('#')[0];

    return `
      <div class="card" style="margin-bottom:16px;border-left:4px solid ${reliable ? 'var(--secondary)' : 'var(--warning)'};">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <span class="material-symbols-rounded" style="color:${reliable ? 'var(--secondary)' : 'var(--warning)'};">${icon}</span>
          <div style="min-width:0;">
            <div style="font-weight:700;margin-bottom:4px;">${Utils.escapeHtml(title)}</div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.45;">${Utils.escapeHtml(detail)}</div>
            <div style="font-size:11px;color:var(--text-tertiary);line-height:1.35;margin-top:8px;overflow-wrap:anywhere;">${Utils.escapeHtml(origin)}</div>
          </div>
        </div>
      </div>
    `;
  },

  // Central persist helper — keeps every setter in sync with one call
  persist() {
    const toSave = {
      advisorName: CONFIG.advisorName,
      companyName: CONFIG.companyName,
      businessAddress: CONFIG.businessAddress,
      businessLatLng: CONFIG.businessLatLng || null,
      weeklyTarget: CONFIG.weeklyTarget,
      weeklySalesTarget: CONFIG.weeklySalesTarget,
      minHourlyRate: CONFIG.minHourlyRate,
      advisorMode: CONFIG.advisorMode,
      trade: CONFIG.trade,
      country: CONFIG.country,
      currency: CONFIG.currency,
      taxSystem: CONFIG.taxSystem,
      dateFormat: CONFIG.dateFormat,
      distanceUnit: CONFIG.distanceUnit,
      measurementUnit: CONFIG.measurementUnit,
      commission: CONFIG.commission,
      ai: CONFIG.ai,
      autoMessages: CONFIG.autoMessages,
      onboardingComplete: true
    };
    localStorage.setItem('advisoros_config', JSON.stringify(toSave));
    try { DB.setSetting('config', toSave); } catch (e) {}
  },

  // ---- Commission ----
  renderCommissionCard() {
    const commission = CONFIG.commission || {};
    const mode = commission.mode || 'two_stage';
    const example = 1000;
    const previewCommission = TaxCalculator.estimateCommission(example);
    const previewRate = example > 0 ? ((previewCommission / example) * 100).toFixed(1) : '0.0';

    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:4px;">Commission Rate</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">How commission is calculated from a sale's value.</div>

        <div class="segmented" style="margin-bottom:12px;">
          <button class="segment ${mode === 'two_stage' ? 'active' : ''}" onclick="SettingsFeature.setCommissionMode('two_stage')">Sale reduction + net %</button>
          <button class="segment ${mode === 'simple' ? 'active' : ''}" onclick="SettingsFeature.setCommissionMode('simple')">Simple %</button>
        </div>

        ${mode === 'two_stage' ? `
          <div class="form-group">
            <label>Step 1: Reduce sale value by (%)</label>
            <input type="number" class="input" id="set-commission-reduction" value="${commission.saleReductionRate ?? 20}" step="0.1" min="0" max="100" onblur="SettingsFeature.setSaleReductionRate(this.value)">
            <div class="hint">e.g. 20 means the net figure is 80% of the sale value.</div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Step 2: Commission on the net (%)</label>
            <input type="number" class="input" id="set-commission-net" value="${commission.netCommissionRate ?? 15.25}" step="0.01" min="0" max="100" onblur="SettingsFeature.setNetCommissionRate(this.value)">
            <div class="hint">Applied to the net figure from Step 1.</div>
          </div>
        ` : `
          <div class="form-group" style="margin-bottom:0;">
            <label>Commission Rate (%)</label>
            <input type="number" class="input" id="set-commission-simple" value="${commission.simpleRate ?? 10}" step="0.1" min="0" max="100" onblur="SettingsFeature.setSimpleCommissionRate(this.value)">
            <div class="hint">Applied directly to the full sale value.</div>
          </div>
        `}

        <div class="inset-dark" style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text-secondary);">
          Example: on a ${Utils.formatCurrency(example)} sale, commission is ${Utils.formatCurrency(previewCommission)} (${previewRate}% effective).
        </div>
      </div>
    `;
  },

  // ---- Automated Messages ----
  renderAutoMessagesCard() {
    const am = CONFIG.autoMessages || {};
    const enabled = !!am.enabled;
    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-weight:600;">Automated Messages</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Drafts a message the evening before and morning of each visit (and an "on my way" draft when you start driving). Every draft opens the preview sheet for your review — nothing is ever sent on its own.</div>
          </div>
          <button class="btn btn-sm ${enabled ? 'btn-primary' : 'btn-outline'}" onclick="SettingsFeature.toggleAutoMessages()">
            ${enabled ? 'On' : 'Off'}
          </button>
        </div>

        ${enabled ? `
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:10px;line-height:1.5;">Drafts wait in the preview sheet until you send them, so even a time you miss while the app is closed is waiting for you the next time you open it. These fire along the same lines as the Morning Brief — best treated as a prompt, not an alarm.</div>

          <div class="form-group" style="margin-top:10px;">
            <label>Evening-before draft (day before the visit)</label>
            <input type="time" class="input" id="set-msg-evening" value="${String(am.eveningHour ?? 18).padStart(2, '0')}:00" onchange="SettingsFeature.setAutoMessageHour('eveningHour', this.value)">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Morning-of draft (visit day)</label>
            <input type="time" class="input" id="set-msg-morning" value="${String(am.morningHour ?? 8).padStart(2, '0')}:00" onchange="SettingsFeature.setAutoMessageHour('morningHour', this.value)">
          </div>
        ` : ''}
      </div>
    `;
  },

  toggleAutoMessages() {
    CONFIG.autoMessages = { ...(CONFIG.autoMessages || {}), enabled: !CONFIG.autoMessages.enabled };
    this.persist();
    if (typeof MessageScheduler !== 'undefined') MessageScheduler.reschedule();
    Toast.show(CONFIG.autoMessages.enabled ? 'Automated Messages enabled' : 'Automated Messages turned off', 'success');
    this.refreshInPlace();
  },

  setAutoMessageHour(key, value) {
    const hour = parseInt((value || '18:00').split(':')[0], 10);
    CONFIG.autoMessages = { ...(CONFIG.autoMessages || {}), [key]: Number.isFinite(hour) ? hour : 18 };
    this.persist();
    this.refreshInPlace();
  },

  // ---- AI (Claude) ----
  renderAICard() {
    const ai = CONFIG.ai || {};
    const usage = AIService.lastUsage;
    const usageLine = usage
      ? `Last call: ${usage.type === 'ocr' ? 'OCR' : 'draft'} · ${(usage.input_tokens || 0).toLocaleString()}/${(usage.output_tokens || 0).toLocaleString()} tokens · ${Utils.formatCurrency(usage.cost ?? 0)}`
      : 'No AI calls yet.';

    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-weight:600;">Claude AI</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Reads scanned documents (Scan screen) and drafts customer messages (Talk screen).</div>
          </div>
          <button class="btn btn-sm ${ai.enabled ? 'btn-primary' : 'btn-outline'}" onclick="SettingsFeature.toggleAI()">
            ${ai.enabled ? 'On' : 'Off'}
          </button>
        </div>

        <div style="font-size:12px;color:var(--text-tertiary);margin-top:10px;line-height:1.5;">Works through your own serverless function (Netlify/Vercel), which holds the API key — it never ships inside this app. Deploy <code style="font-size:11px;">api/claude.mjs</code> (Vercel) or <code style="font-size:11px;">netlify/functions/claude.mjs</code> (Netlify) with your <code style="font-size:11px;">ANTHROPIC_API_KEY</code> environment variable, then paste the function URL below.</div>

        <div class="form-group" style="margin-top:10px;">
          <label>Proxy URL</label>
          <input type="text" class="input" id="set-ai-url" value="${Utils.escapeAttr(ai.proxyUrl || '')}" placeholder="https://your-site.netlify.app/.netlify/functions/claude" onblur="SettingsFeature.setAIUrl(this.value)">
        </div>
        <div class="form-group">
          <label>Shared Secret (optional)</label>
          <input type="password" class="input" id="set-ai-secret" value="${Utils.escapeAttr(ai.secret || '')}" placeholder="Only if your proxy requires X-AI-Key" onblur="SettingsFeature.setAISecret(this.value)">
        </div>
        <div class="form-group">
          <label>OCR model (document reading)</label>
          <select class="select" id="set-ai-ocr-model" onchange="SettingsFeature.setAIModel('ocrModel', this.value)">
            <option value="claude-sonnet-4-5" ${ai.ocrModel === 'claude-sonnet-4-5' ? 'selected' : ''}>Claude Sonnet 4.5 — best accuracy</option>
            <option value="claude-3-7-sonnet-latest" ${ai.ocrModel === 'claude-3-7-sonnet-latest' ? 'selected' : ''}>Claude Sonnet 3.7</option>
            <option value="claude-haiku-4-5" ${ai.ocrModel === 'claude-haiku-4-5' ? 'selected' : ''}>Claude Haiku 4.5 — fastest/cheapest</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Draft model (message writing)</label>
          <select class="select" id="set-ai-draft-model" onchange="SettingsFeature.setAIModel('draftModel', this.value)">
            <option value="claude-haiku-4-5" ${ai.draftModel === 'claude-haiku-4-5' ? 'selected' : ''}>Claude Haiku 4.5 — fast & cheap</option>
            <option value="claude-sonnet-4-5" ${ai.draftModel === 'claude-sonnet-4-5' ? 'selected' : ''}>Claude Sonnet 4.5 — higher quality</option>
            <option value="claude-3-5-haiku-latest" ${ai.draftModel === 'claude-3-5-haiku-latest' ? 'selected' : ''}>Claude Haiku 3.5</option>
          </select>
        </div>

        <div class="inset-dark" style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text-secondary);">${Utils.escapeHtml(usageLine)}</div>
        <button class="btn btn-outline btn-sm btn-block" style="margin-top:10px;" onclick="SettingsFeature.testAI()"><span class="material-symbols-rounded" style="font-size:16px;">bolt</span>Test connection</button>
      </div>
    `;
  },

  toggleAI() {
    CONFIG.ai = { ...(CONFIG.ai || {}), enabled: !CONFIG.ai.enabled };
    this.persist();
    Toast.show(CONFIG.ai.enabled ? 'Claude AI enabled' : 'Claude AI turned off', 'success');
    this.refreshInPlace();
  },

  setAIUrl(value) {
    CONFIG.ai = { ...(CONFIG.ai || {}), proxyUrl: value.trim() };
    this.persist();
    Toast.show('AI proxy URL saved', 'success');
  },

  setAISecret(value) {
    CONFIG.ai = { ...(CONFIG.ai || {}), secret: value.trim() };
    this.persist();
    Toast.show('AI secret saved', 'success');
  },

  setAIModel(key, value) {
    CONFIG.ai = { ...(CONFIG.ai || {}), [key]: value };
    this.persist();
    Toast.show('AI model updated', 'success');
  },

  async testAI() {
    const button = event?.currentTarget;
    if (button) { button.disabled = true; button.textContent = 'Testing…'; }
    try {
      const result = await AIService.testConnection();
      if (result.ok) {
        Toast.show('Connected — ' + result.model + ' responded', 'success');
      } else if (result.unavailable) {
        Toast.show(result.reason === 'timeout' ? 'Connection timed out' : 'Proxy unreachable — check the URL', 'error');
      } else {
        Toast.show(result.message || 'Proxy error — check the URL and env vars', 'error');
      }
    } catch (err) {
      Toast.show('Test failed: ' + err.message, 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Test connection'; }
      this.refreshInPlace();
    }
  },

  // Re-render the settings screen into #main WITHOUT resetting scroll to the
  // top (which App.navigate does). This keeps the user's place when they toggle
  // a segmented control or change a commission rate mid-screen.
  refreshInPlace() {
    const main = document.getElementById('main');
    if (!main) return;
    const scrollTop = main.scrollTop;
    main.innerHTML = this.render();
    main.scrollTop = scrollTop;
  },

  setCommissionMode(mode) {
    CONFIG.commission = { ...(CONFIG.commission || {}), mode };
    this.persist();
    this.refreshInPlace();
  },

  setSaleReductionRate(value) {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      Toast.show('Enter a percentage between 0 and 100', 'error');
      this.refreshInPlace();
      return;
    }
    CONFIG.commission = { ...(CONFIG.commission || {}), saleReductionRate: num };
    this.persist();
    Toast.show('Commission rate updated', 'success');
    this.refreshInPlace();
  },

  setNetCommissionRate(value) {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      Toast.show('Enter a percentage between 0 and 100', 'error');
      this.refreshInPlace();
      return;
    }
    CONFIG.commission = { ...(CONFIG.commission || {}), netCommissionRate: num };
    this.persist();
    Toast.show('Commission rate updated', 'success');
    this.refreshInPlace();
  },

  setSimpleCommissionRate(value) {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      Toast.show('Enter a percentage between 0 and 100', 'error');
      this.refreshInPlace();
      return;
    }
    CONFIG.commission = { ...(CONFIG.commission || {}), simpleRate: num };
    this.persist();
    Toast.show('Commission rate updated', 'success');
    this.refreshInPlace();
  },

  setCompanyName(value) {
    CONFIG.companyName = value.trim();
    this.persist();
    App.setBranding?.();
    Toast.show('Company name updated', 'success');
  },

  setBusinessAddress(value) {
    const next = value.trim();
    if (next !== (CONFIG.businessAddress || '')) {
      CONFIG.businessLatLng = null;
    }
    CONFIG.businessAddress = next;
    this.persist();
    Toast.show('Business base updated', 'success');
  },

  setName(value) {
    CONFIG.advisorName = value.trim();
    this.persist();
    Toast.show('Name updated', 'success');
  },

  setTarget(value) {
    const num = parseFloat(value);
    if (!num || num <= 0) {
      Toast.show('Please enter a valid target', 'error');
      return;
    }
    CONFIG.weeklyTarget = num;
    this.persist();
    Toast.show('Weekly target updated', 'success');
    this.refreshInPlace();
  },

  setMinHourlyRate(value) {
    if (value === '' || value === null || value === undefined) {
      CONFIG.minHourlyRate = null;
      this.persist();
      Toast.show('Using an estimated hourly value instead', 'info');
      this.refreshInPlace();
      return;
    }
    const num = parseFloat(value);
    if (!num || num <= 0) {
      Toast.show('Please enter a valid hourly rate', 'error');
      return;
    }
    CONFIG.minHourlyRate = num;
    this.persist();
    Toast.show('Minimum hourly value updated', 'success');
    this.refreshInPlace();
  },

  async toggleMorningBrief() {
    const currentlyEnabled = NotificationService.isMorningBriefEnabled();
    if (currentlyEnabled) {
      NotificationService.disableMorningBrief();
      Toast.show('Morning brief turned off', 'info');
    } else {
      const granted = await NotificationService.scheduleMorningBrief();
      if (granted) {
        Toast.show('Morning brief queued for 7am when app is active', 'success');
      } else {
        Toast.show('Notification permission denied', 'error');
      }
    }
    this.refreshInPlace();
  },

  async setMode(mode) { CONFIG.advisorMode = mode; this.persist(); Toast.show(`Switched to ${mode} mode`, 'success'); this.refreshInPlace(); },
  async setTrade(trade) { CONFIG.trade = trade; this.persist(); },
  async setDistanceUnit(unit) { CONFIG.distanceUnit = unit; this.persist(); this.refreshInPlace(); },
  async setMeasurementUnit(unit) { CONFIG.measurementUnit = unit; this.persist(); this.refreshInPlace(); },
  importBackup() { document.getElementById('import-file').click(); },
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    try { await ExportService.importBackup(file); Toast.show('Data imported', 'success'); } catch(err) { Toast.show('Import failed: ' + err.message, 'error'); }
  },
  exportCSV() { ExportService.exportCSV('appointments'); ExportService.exportCSV('expenses'); ExportService.exportCSV('trips'); },

  // First step of a factory reset: warn, then require a second deliberate tap
  // on the actual delete button before anything is touched.
  confirmWipe() {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Delete everything?</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">
          This permanently deletes every customer, visit, order, photo, expense and message — plus all your settings and targets. There is <strong>no undo</strong>, so export a backup first if you might need this data again.
        </div>
        <button class="btn btn-danger btn-block" onclick="SettingsFeature.confirmWipeFinal()">
          <span class="material-symbols-rounded">warning</span> Yes — delete all my data
        </button>
        <button class="btn btn-outline btn-block" style="margin-top:10px;" onclick="App.closeModal()">Cancel</button>
      </div>
    `;
    App.openModal(content);
  },

  async confirmWipeFinal() {
    App.closeModal();
    try {
      await DB.deleteAllData();
      Toast.show('All data deleted — starting fresh', 'success');
      // Config, targets and onboarding flags are gone; reload boots back
      // into the setup flow.
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      console.error('Wipe failed:', e);
      Toast.show('Could not delete data — please try again', 'error');
    }
  }
};

App.registerFeature(SettingsFeature);
