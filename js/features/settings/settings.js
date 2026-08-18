/* ============================================
   BEELO — SETTINGS FEATURE
   Config, targets, notifications, data management
   ============================================ */

const SettingsFeature = {
  id: 'settings',
  name: 'Settings',
  icon: 'settings',
  route: false, // reached from Tools (kept the bottom nav to 5 items)

  // Current detail section being viewed (null = index)
  _currentSection: null,

  render(params = {}) {
    // If a section parameter is provided, show that detail screen
    if (params.section) {
      this._currentSection = params.section;
      return this.renderDetail(params.section);
    }
    this._currentSection = null;
    return this.renderIndex();
  },

  renderIndex() {
    const briefEnabled = NotificationService.isMorningBriefEnabled();
    const ai = CONFIG.ai || {};
    const aiEnabled = !!ai.enabled;
    // "Connected" must mean configured AND enabled — enabling AI without a
    // proxy URL silently means every AI feature falls back to offline OCR,
    // so the index must not claim a connection that isn't there.
    const aiSummary = aiEnabled ? (ai.proxyUrl ? 'Connected' : 'Needs setup') : 'Off';
    const autoMsgEnabled = !!(CONFIG.autoMessages && CONFIG.autoMessages.enabled);
    const consentSummary = (() => {
      try { return localStorage.getItem('advisoros_consent') ? 'Acknowledged' : 'One-time notice pending'; } catch { return '—'; }
    })();
    const commission = CONFIG.commission || {};
    const commissionMode = commission.mode || 'two_stage';
    const effectiveRate = TaxCalculator.getEffectiveCommissionRate();
    const effectiveRatePercent = (effectiveRate * 100).toFixed(1);
    const weeklyTarget = CONFIG.weeklyTarget || 600;

    const sections = [
      {
        id: 'details',
        title: 'Your Details',
        icon: 'person',
        summary: `${CONFIG.advisorName || '—'} · £${weeklyTarget}/week`,
        description: 'Name, weekly target, minimum hourly value'
      },
      {
        id: 'branding',
        title: 'Company Branding',
        icon: 'business',
        summary: CONFIG.companyName || 'Beelo (default)',
        description: 'Company name shown throughout the app'
      },
      {
        id: 'business-base',
        title: 'Business Base',
        icon: 'location_on',
        summary: CONFIG.businessAddress ? 'Set' : 'Not set',
        description: 'Home address for route distances & ETAs'
      },
      {
        id: 'morning-brief',
        title: 'Morning Brief',
        icon: 'wb_sunny',
        summary: briefEnabled ? 'On · 7am' : 'Off',
        description: 'Daily overview when you open the app'
      },
      {
        id: 'auto-messages',
        title: 'Automated Messages',
        icon: 'schedule_send',
        summary: autoMsgEnabled ? 'On' : 'Off',
        description: 'Evening-before & morning-of visit drafts'
      },
      {
        id: 'commission',
        title: 'Commission Rate',
        icon: 'percent',
        summary: `${effectiveRatePercent}% effective · ${commissionMode}`,
        description: 'How commission is calculated from sales'
      },
      {
        id: 'advisor-mode',
        title: 'Advisor Mode',
        icon: 'business_center',
        summary: CONFIG.advisorMode || 'independent',
        description: 'Company vs Independent workflow'
      },
      {
        id: 'trade',
        title: 'Trade',
        icon: 'construction',
        summary: CONFIG.trades.find(t => t.id === CONFIG.trade)?.name || 'Not set',
        description: 'Your trade type'
      },
      {
        id: 'units',
        title: 'Units',
        icon: 'straighten',
        summary: `${CONFIG.distanceUnit || 'mi'} · ${CONFIG.measurementUnit || 'mm'}`,
        description: 'Distance & measurement units'
      },
      {
        id: 'ai',
        title: 'Claude AI',
        icon: 'psychology',
        summary: aiSummary,
        description: 'Document scanning & message drafting'
      },
      {
        id: 'data',
        title: 'Data & Backup',
        icon: 'backup',
        summary: (App.state.storageStatus?.database && App.state.storageStatus?.localStorage) ? 'Persistent' : 'Check storage',
        description: 'Export, import, factory reset'
      },
      {
        id: 'privacy',
        title: 'Privacy & Legal',
        icon: 'policy',
        summary: consentSummary,
        description: 'Privacy policy, terms, consent & erasure'
      }
    ];

    return `<div class="fade-in">
      ${App.renderTopHeader({ title: 'Settings' })}
      <div class="p-md" >
        ${sections.map(s => `
          <button class="card mb-md" data-action="App.navigate" data-args='${JSON.stringify([`settings?section=${s.id}`])}' style="text-align:left;">
            <div class="flex items-start gap-md">
              <span class="material-symbols-rounded fs-24 shrink-0" style="color:var(--accent);">${s.icon}</span>
              <div class="flex-1 min-w-0">
                <div class="fw-600">${s.title}</div>
                <div class="fs-13 text-secondary mt-1">${s.description}</div>
                <div class="fs-14 fw-500 mt-2" style="color:var(--text-primary);">${Utils.escapeHtml(s.summary)}</div>
              </div>
              <span class="material-symbols-rounded text-tertiary shrink-0">chevron_right</span>
            </div>
          </button>
        `).join('')}

        <div class="divider-text mt-lg">About</div>
        <div class="mt-xl text-center text-tertiary fs-13" >
          <div>${CONFIG.companyName ? Utils.escapeHtml(CONFIG.companyName) + ' · ' : ''}Beelo v5.0</div>
          <div class="mt-xs" >Your day, visits, follow-ups, and money in one place.</div>
        </div>
      </div>
    </div>`;
  },

  renderDetail(section) {
    const briefEnabled = NotificationService.isMorningBriefEnabled();

    const detailScreens = {
      'details': this.renderDetailsDetail(),
      'branding': this.renderBrandingDetail(),
      'business-base': this.renderBusinessBaseDetail(),
      'morning-brief': this.renderMorningBriefDetail(briefEnabled),
      'auto-messages': this.renderAutoMessagesDetail(),
      'commission': this.renderCommissionDetail(),
      'advisor-mode': this.renderAdvisorModeDetail(),
      'trade': this.renderTradeDetail(),
      'units': this.renderUnitsDetail(),
      'ai': this.renderAIDetail(),
      'data': this.renderDataDetail(),
      'privacy': this.renderPrivacyDetail()
    };

    const content = detailScreens[section] || this.renderIndex();
    const title = this.getSectionTitle(section);

    return `<div class="fade-in">
      ${App.renderTopHeader({ title, showBack: true, backHref: 'settings' })}
      <div class="p-md" >${content}</div>
    </div>`;
  },

  getSectionTitle(section) {
    const titles = {
      'details': 'Your Details',
      'branding': 'Company Branding',
      'business-base': 'Business Base',
      'morning-brief': 'Morning Brief',
      'auto-messages': 'Automated Messages',
      'commission': 'Commission Rate',
      'advisor-mode': 'Advisor Mode',
      'trade': 'Trade',
      'units': 'Units',
      'ai': 'Claude AI',
      'data': 'Data & Backup',
      'privacy': 'Privacy & Legal'
    };
    return titles[section] || 'Settings';
  },

  renderDetailsDetail() {
    return `
      <div class="card mb-md">
        <div class="fw-600 mb-12">Your Details</div>
        <div class="form-group">
          <label>Name</label>
          <input type="text" class="input" id="set-name" value="${Utils.escapeHtml(CONFIG.advisorName || '')}" placeholder="Your full name" data-action="SettingsFeature.setName" data-args='${JSON.stringify(["__value__"])}'>
        </div>
        <div class="form-group">
          <label>Weekly Earnings Target (£)</label>
          <input type="number" class="input" inputmode="decimal" id="set-target" value="${CONFIG.weeklyTarget || 600}" step="10" min="0" data-action="SettingsFeature.setTarget" data-args='${JSON.stringify(["__value__"])}'>
          <div class="hint">What you want to take home this week. Everything else derives from this.</div>
        </div>
        <div class="form-group mb-0">
          <label>Weekly Sales Target (derived)</label>
          <input type="text" class="input op-75" id="set-sales-target" value="${Utils.formatCurrency(TaxCalculator.getRequiredWeeklySales(CONFIG.weeklyTarget)).replace('.00','')}" disabled>
          <div class="hint">Sales needed to hit your earnings target at the current ${(TaxCalculator.getEffectiveCommissionRate() * 100).toFixed(1)}% effective commission rate. Change your commission structure below to update this automatically.</div>
        </div>
        <div class="form-group mb-0 mt-14">
          <label>Minimum Hourly Value (&pound;)</label>
          <input type="number" class="input" inputmode="decimal" id="set-min-hourly" value="${CONFIG.minHourlyRate || ''}" placeholder="${TaxCalculator.getMinHourlyRate().rate.toFixed(0)} (estimated)" step="1" min="0" data-action="SettingsFeature.setMinHourlyRate" data-args='${JSON.stringify(["__value__"])}'>
          <div class="hint">What your time is worth, at minimum. Only used by "Check my floor" on a visit after a price objection — leave blank to use a rough estimate from your weekly target.</div>
        </div>
      </div>`;
  },

  renderBrandingDetail() {
    return `
      <div class="card mb-md">
        <div class="fw-600 mb-12">Company Branding</div>
        <div class="form-group mb-0">
          <label>Company Name</label>
          <input type="text" class="input" id="set-company-name" value="${Utils.escapeHtml(CONFIG.companyName || '')}" placeholder="e.g. Your Company Ltd" data-action="SettingsFeature.setCompanyName" data-args='${JSON.stringify(["__value__"])}'>
          <div class="hint">Shown throughout the app in place of "Beelo". Leave blank to use the default Beelo branding.</div>
        </div>
      </div>`;
  },

  renderBusinessBaseDetail() {
    return `
      <div class="card mb-md">
        <div class="fw-600 mb-xs">Business Base</div>
        <div class="fs-12 text-secondary mb-12">Where you normally start and return from. Used for route distance and ETA planning.</div>
        <div class="form-group mb-0">
          <label>Home / Business Address</label>
          <textarea class="textarea" id="set-business-address" placeholder="e.g. 12 Example Street, Manchester M14 7FZ" data-action="SettingsFeature.setBusinessAddress" data-args='${JSON.stringify(["__value__"])}'>${Utils.escapeHtml(CONFIG.businessAddress || '')}</textarea>
        </div>
      </div>`;
  },

  renderMorningBriefDetail(briefEnabled) {
    return `
      <div class="card mb-md">
        <div class="flex items-center justify-between">
          <div>
            <div class="fw-600">Morning Brief</div>
            <div class="fs-12 text-secondary mt-2">7am UK time — but only if Beelo is open (or was recently) around then. Phones suspend background tabs/PWAs, so this won't reliably fire overnight; it's a bonus, not a real alarm.</div>
          </div>
          <button class="btn btn-sm ${briefEnabled ? 'btn-primary' : 'btn-outline'}" data-action="SettingsFeature.toggleMorningBrief">
            ${briefEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>`;
  },

  renderAutoMessagesDetail() {
    const am = CONFIG.autoMessages || {};
    const enabled = !!am.enabled;
    return `
      <div class="card mb-md">
        <div class="flex items-center justify-between">
          <div>
            <div class="fw-600">Automated Messages</div>
            <div class="fs-12 text-secondary mt-2">Drafts a message the evening before and morning of each visit (and an "on my way" draft when you start driving). Every draft opens the preview sheet for your review — nothing is ever sent on its own.</div>
          </div>
          <button class="btn btn-sm ${enabled ? 'btn-primary' : 'btn-outline'}" data-action="SettingsFeature.toggleAutoMessages">
            ${enabled ? 'On' : 'Off'}
          </button>
        </div>

        ${enabled ? `
        <div class="fs-12 text-tertiary mt-10 lh-150">Drafts wait in the preview sheet until you send them, so even a time you miss while the app is closed is waiting for you the next time you open it. These fire along the same lines as the Morning Brief — best treated as a prompt, not an alarm.</div>

        <div class="form-group mt-10">
          <label>Evening-before draft (day before the visit)</label>
          <input type="time" class="input" id="set-msg-evening" value="${String(am.eveningHour ?? 18).padStart(2, '0')}:00" data-action="SettingsFeature.setAutoMessageHour" data-args='${JSON.stringify(["eveningHour", "__value__"])}'>
        </div>
        <div class="form-group mb-0">
          <label>Morning-of draft (visit day)</label>
          <input type="time" class="input" id="set-msg-morning" value="${String(am.morningHour ?? 8).padStart(2, '0')}:00" data-action="SettingsFeature.setAutoMessageHour" data-args='${JSON.stringify(["morningHour", "__value__"])}'>
        </div>
        ` : ''}
      </div>`;
  },

  renderCommissionDetail() {
    const commission = CONFIG.commission || {};
    const mode = commission.mode || 'two_stage';
    const example = 1000;
    const previewCommission = TaxCalculator.estimateCommission(example);
    const previewRate = example > 0 ? ((previewCommission / example) * 100).toFixed(1) : '0.0';

    return `
      <div class="card mb-md">
        <div class="fw-600 mb-xs">Commission Rate</div>
        <div class="fs-12 text-secondary mb-12">How commission is calculated from a sale's value.</div>

        <div class="segmented mb-12">
          <button class="segment ${mode === 'two_stage' ? 'active' : ''}" data-action="SettingsFeature.setCommissionMode" data-args='${JSON.stringify(["two_stage"])}'>Sale reduction + net %</button>
          <button class="segment ${mode === 'simple' ? 'active' : ''}" data-action="SettingsFeature.setCommissionMode" data-args='${JSON.stringify(["simple"])}'>Simple %</button>
        </div>

        ${mode === 'two_stage' ? `
          <div class="form-group">
            <label>Step 1: Reduce sale value by (%)</label>
            <input type="number" class="input" inputmode="decimal" id="set-commission-reduction" value="${commission.saleReductionRate ?? 20}" step="0.1" min="0" max="100" data-action="SettingsFeature.setSaleReductionRate" data-args='${JSON.stringify(["__value__"])}'>
            <div class="hint">e.g. 20 means the net figure is 80% of the sale value.</div>
          </div>
          <div class="form-group mb-0">
            <label>Step 2: Commission on the net (%)</label>
            <input type="number" class="input" inputmode="decimal" id="set-commission-net" value="${commission.netCommissionRate ?? 15.25}" step="0.01" min="0" max="100" data-action="SettingsFeature.setNetCommissionRate" data-args='${JSON.stringify(["__value__"])}'>
            <div class="hint">Applied to the net figure from Step 1.</div>
          </div>
        ` : `
          <div class="form-group mb-0">
            <label>Commission Rate (%)</label>
            <input type="number" class="input" inputmode="decimal" id="set-commission-simple" value="${commission.simpleRate ?? 10}" step="0.1" min="0" max="100" data-action="SettingsFeature.setSimpleCommissionRate" data-args='${JSON.stringify(["__value__"])}'>
            <div class="hint">Applied directly to the full sale value.</div>
          </div>
        `}

        <div class="inset-dark mt-12 dark-note fs-12 text-secondary">
          Example: on a ${Utils.formatCurrency(example)} sale, commission is ${Utils.formatCurrency(previewCommission)} (${previewRate}% effective).
        </div>
      </div>`;
  },

  renderAdvisorModeDetail() {
    return `
      <div class="card mb-md">
        <div class="fw-600 mb-12">Advisor Mode</div>
        <div class="segmented">
          <button class="segment ${CONFIG.advisorMode === 'company' ? 'active' : ''}" data-action="SettingsFeature.setMode" data-args='${JSON.stringify(["company"])}'>Company</button>
          <button class="segment ${CONFIG.advisorMode === 'independent' ? 'active' : ''}" data-action="SettingsFeature.setMode" data-args='${JSON.stringify(["independent"])}'>Independent</button>
        </div>
      </div>`;
  },

  renderTradeDetail() {
    return `
      <div class="form-group"><label>Trade</label>
        <select class="select" data-action="SettingsFeature.setTrade" data-args='${JSON.stringify(["__value__"])}'>
          ${CONFIG.trades.map(t => `<option value="${t.id}" ${CONFIG.trade === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>
      </div>`;
  },

  renderUnitsDetail() {
    return `
      <div class="card mb-md">
        <div class="fw-600 mb-12">Units</div>
        <div class="flex gap-md">
          <div class="flex-1"><label class="fs-12 text-secondary">Distance</label>
            <div class="segmented mt-xs">
              <button class="segment ${CONFIG.distanceUnit === 'miles' ? 'active' : ''}" data-action="SettingsFeature.setDistanceUnit" data-args='${JSON.stringify(["miles"])}'>mi</button>
              <button class="segment ${CONFIG.distanceUnit === 'km' ? 'active' : ''}" data-action="SettingsFeature.setDistanceUnit" data-args='${JSON.stringify(["km"])}'>km</button>
            </div>
            ${CONFIG.country === 'GB' ? '<div class="fs-11 text-tertiary mt-xs">HMRC pays mileage relief in miles</div>' : ''}
          </div>
          <div class="flex-1"><label class="fs-12 text-secondary">Measurement</label>
            <div class="segmented mt-xs">
              <button class="segment ${CONFIG.measurementUnit === 'mm' ? 'active' : ''}" data-action="SettingsFeature.setMeasurementUnit" data-args='${JSON.stringify(["mm"])}'>mm</button>
              <button class="segment ${CONFIG.measurementUnit === 'cm' ? 'active' : ''}" data-action="SettingsFeature.setMeasurementUnit" data-args='${JSON.stringify(["cm"])}'>cm</button>
              <button class="segment ${CONFIG.measurementUnit === 'inches' ? 'active' : ''}" data-action="SettingsFeature.setMeasurementUnit" data-args='${JSON.stringify(["inches"])}'>in</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  renderAIDetail() {
    const ai = CONFIG.ai || {};
    const sessionSecret = (() => { try { return sessionStorage.getItem('advisoros_ai_secret'); } catch (e) { return null; } })();
    const secretSaved = !!sessionSecret || !!ai.secret;
    const usage = AIService.lastUsage;
    const usageLine = usage
      ? `Last call: ${usage.type === 'ocr' ? 'OCR' : 'draft'} · ${(usage.input_tokens || 0).toLocaleString()}/${(usage.output_tokens || 0).toLocaleString()} tokens · ${Utils.formatCurrency(usage.cost ?? 0)}`
      : 'No AI calls yet.';

    return `
      <div class="card mb-md">
        <div class="flex items-center justify-between">
          <div>
            <div class="fw-600">Claude AI</div>
            <div class="fs-12 text-secondary mt-2">Reads scanned documents (Scan screen) and drafts customer messages (Talk screen).</div>
          </div>
          <button class="btn btn-sm ${ai.enabled ? 'btn-primary' : 'btn-outline'}" data-action="SettingsFeature.toggleAI">
            ${ai.enabled ? 'On' : 'Off'}
          </button>
        </div>

        <div class="fs-12 text-tertiary mt-10 lh-150">Works through your own serverless function (Vercel), which holds the API key — it never ships inside this app. Deploy <code class="fs-11">api/claude.mjs</code> (Vercel) with your <code class="fs-11">ANTHROPIC_API_KEY</code> environment variable, then paste the function URL below.</div>

        <div class="form-group mt-10">
          <label>Proxy URL</label>
          <input type="text" class="input" id="set-ai-url" value="${Utils.escapeHtml(ai.proxyUrl || '')}" placeholder="https://your-site.vercel.app/api/claude" data-action="SettingsFeature.setAIUrl" data-args='${JSON.stringify(["__value__"])}'>
        </div>
        <div class="form-group">
          <label>Shared Secret (optional)</label>
          <input type="password" class="input" id="set-ai-secret" value="" placeholder="${secretSaved ? 'Saved for this session — leave blank to keep it' : 'Only if your proxy requires X-AI-Key'}" data-action="SettingsFeature.setAISecret" data-args='${JSON.stringify(["__value__"])}'>
        </div>
        <div class="form-group">
          <label>OCR model (document reading)</label>
          <select class="select" id="set-ai-ocr-model" data-action="SettingsFeature.setAIModel" data-args='${JSON.stringify(["ocrModel", "__value__"])}'>
            <option value="claude-sonnet-4-5" ${ai.ocrModel === 'claude-sonnet-4-5' ? 'selected' : ''}>Claude Sonnet 4.5 — best accuracy</option>
            <option value="claude-3-7-sonnet-latest" ${ai.ocrModel === 'claude-3-7-sonnet-latest' ? 'selected' : ''}>Claude Sonnet 3.7</option>
            <option value="claude-haiku-4-5" ${ai.ocrModel === 'claude-haiku-4-5' ? 'selected' : ''}>Claude Haiku 4.5 — fastest/cheapest</option>
          </select>
        </div>
        <div class="form-group mb-0">
          <label>Draft model (message writing)</label>
          <select class="select" id="set-ai-draft-model" data-action="SettingsFeature.setAIModel" data-args='${JSON.stringify(["draftModel", "__value__"])}'>
            <option value="claude-haiku-4-5" ${ai.draftModel === 'claude-haiku-4-5' ? 'selected' : ''}>Claude Haiku 4.5 — fast & cheap</option>
            <option value="claude-sonnet-4-5" ${ai.draftModel === 'claude-sonnet-4-5' ? 'selected' : ''}>Claude Sonnet 4.5 — higher quality</option>
            <option value="claude-3-5-haiku-latest" ${ai.draftModel === 'claude-3-5-haiku-latest' ? 'selected' : ''}>Claude Haiku 3.5</option>
          </select>
        </div>

        <div class="inset-dark mt-12 dark-note fs-12 text-secondary">${Utils.escapeHtml(usageLine)}</div>
        <button class="btn btn-outline btn-sm btn-block mt-10" data-action="SettingsFeature.testAI"><span class="material-symbols-rounded fs-16">bolt</span>Test connection</button>
      </div>`;
  },

  renderDataDetail() {
    const backupMeta = ExportService.getLastBackupMeta();
    const isStale = ExportService.isBackupStale();
    const ageLabel = ExportService.getBackupAgeLabel();
    const photoCount = backupMeta?.photoCount || 0;
    const totalRecords = backupMeta?.totalRecords || 0;
    const tableCounts = backupMeta?.tableCounts || {};

    // Build table counts display
    let countsHtml = '';
    const tableOrder = ['customers', 'appointments', 'orders', 'measurements', 'photos', 'expenses', 'trips', 'communications'];
    for (const table of tableOrder) {
      const count = tableCounts[table];
      if (count !== undefined) {
        countsHtml += `<div class="flex justify-between"><span class="text-secondary">${Utils.escapeHtml(table)}</span><span class="fw-600">${count}</span></div>`;
      }
    }

    return `
      ${this.renderStorageCard()}

      <!-- Last Backup Info -->
      <div class="card mb-md">
        <div class="fw-600 mb-8" >Last Backup</div>
        <div class="fs-14" style="color:var(--text-primary);" >${backupMeta ? ageLabel : 'Never backed up'}</div>
        ${backupMeta ? `
        <div class="fs-12 text-tertiary mt-4" >
          ${backupMeta.totalRecords || 0} records · ${backupMeta.photoCount || 0} photos · v${backupMeta.backupVersion || 1}
        </div>
        <div class="mt-8" >
          ${Object.keys(backupMeta.tableCounts || {}).length ? `
          <div class="fs-12 text-tertiary mb-4" >Record counts:</div>
          <div class="fs-13 lh-160" >${countsHtml}</div>
          ` : ''}
        </div>
        ` : ''}
      </div>

      <!-- Primary Backup Action -->
      <div class="mb-md">
        <button class="btn btn-primary btn-block" data-action="ExportService.exportBackup">
          <span class="material-symbols-rounded mr-8">backup</span>
          <span class="fw-600">Back Up My Beelo</span>
        </button>
        <div class="fs-12 text-tertiary mt-2 text-center" >Creates a complete backup of all your customers, visits, orders, measurements, photos, and settings</div>
      </div>

      <!-- Restore Section -->
      <div class="card mb-md" style="border-left:3px solid var(--warning);">
        <div class="fw-600 mb-4" >Restore from Backup</div>
        <div class="fs-13 text-secondary mb-8" >Replaces all data on this device with a previous backup</div>
        <div class="flex flex-col gap-sm">
          <button class="btn btn-outline btn-sm" data-action="SettingsFeature.importBackup">
            <span class="material-symbols-rounded mr-8">restore</span>
            <span>Choose Backup File</span>
          </button>
          <input type="file" id="import-file" accept=".json" style="display:none;" data-action="SettingsFeature.handleImport" data-args='${JSON.stringify(["__event__"])}'>
        </div>
        <div class="fs-11 text-tertiary mt-4" >Only restores from Beelo backup files (.json). Your AI proxy secret is never included in backups and will not be affected.</div>
      </div>

      <!-- Export CSV -->
      <div class="flex flex-col gap-sm mt-sm">
        <button class="btn btn-outline btn-sm" data-action="SettingsFeature.exportCSV">
          <span class="material-symbols-rounded mr-8">download</span>
          <span>Export to CSV (single table)</span>
        </button>
      </div>

      <!-- Danger Zone -->
      <div class="card mb-md" style="border-left:3px solid var(--danger);">
        <div class="fw-600 mb-4 text-danger" >Danger Zone</div>
        <div class="fs-13 text-secondary mb-8" >Permanent actions that cannot be undone</div>
        <div class="flex flex-col gap-sm">
          <button class="btn btn-outline btn-sm text-danger border-danger-soft" data-action="SettingsFeature.confirmWipe">
            <span class="material-symbols-rounded mr-8">delete_forever</span>
            <span>Start Fresh — Delete All Data</span>
          </button>
        </div>
        <div class="fs-11 text-tertiary mt-4" >Deletes all customers, visits, orders, photos, messages, settings, and targets. No undo.</div>
      </div>

      ${ExportService.isBackupStale() ? `
      <!-- Backup Reminder -->
      <div class="card mb-md" style="border-left:3px solid var(--accent);background:rgba(242,201,76,0.08);">
        <div class="flex items-start gap-8">
          <span class="material-symbols-rounded text-accent shrink-0" style="margin-top:2px;">notifications</span>
          <div class="flex-1 min-w-0">
            <div class="fw-600" >No recent backup</div>
            <div class="fs-13 text-secondary mt-2" >Your last backup was ${ExportService.getBackupAgeLabel()}. Consider backing up before your next busy day.</div>
          </div>
        </div>
      </div>
      ` : ''}`;
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
        <div class="flex gap-10 items-start" >
          <span class="material-symbols-rounded" style="color:${reliable ? 'var(--secondary)' : 'var(--warning)'};">${icon}</span>
          <div class="min-w-0" >
            <div class="fw-700 mb-xs" >${Utils.escapeHtml(title)}</div>
            <div class="fs-12 text-secondary lh-145" >${Utils.escapeHtml(detail)}</div>
            <div class="fs-11 text-tertiary lh-135 mt-sm ow-any" >${Utils.escapeHtml(origin)}</div>
          </div>
        </div>
      </div>
    `;
  },

  renderPrivacyDetail() {
    const consentAt = (() => {
      try {
        const raw = localStorage.getItem('advisoros_consent');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.at ? new Date(parsed.at) : null;
      } catch { return null; }
    })();
    const consentLine = consentAt
      ? `Acknowledged ${consentAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : 'Not yet acknowledged — the one-time notice shows when you first settle on Home.';
    const c = typeof Legal !== 'undefined' ? Legal.COMPANY : null;

    return `
      <div class="card mb-md">
        <div class="fw-700 mb-10" >Legal documents</div>
        <div class="flex flex-col gap-sm">
          <button class="btn btn-outline btn-sm btn-block" data-action="Legal.openPrivacy">
            <span class="material-symbols-rounded mr-8">policy</span>Privacy Policy
          </button>
          <button class="btn btn-outline btn-sm btn-block" data-action="Legal.openTerms">
            <span class="material-symbols-rounded mr-8">menu_book</span>Terms of Service
          </button>
        </div>
        <div class="fs-11 text-tertiary mt-4" >Both pages are stored in the app, so they work offline.</div>
      </div>

      <div class="card mb-md">
        <div class="fw-700 mb-10" >Consent</div>
        <div class="fs-13 text-secondary mb-4" >${Utils.escapeHtml(consentLine)}</div>
        <button class="btn btn-ghost btn-sm mt-2" data-action="ConsentPrompt.acknowledge">
          <span class="material-symbols-rounded mr-8">check_circle</span>Acknowledge now
        </button>
      </div>

      <div class="card mb-md">
        <div class="fw-700 mb-10" >Your data, your control</div>
        <div class="fs-13 text-secondary lh-150 mb-8" >
          Beelo keeps everything on this device — there is nothing on our servers to
          export or delete. You still have full control here:
        </div>
        <div class="flex flex-col gap-sm">
          <button class="btn btn-outline btn-sm btn-block" data-action="ExportService.exportBackup">
            <span class="material-symbols-rounded mr-8">download</span>Export my data (backup)
          </button>
          <button class="btn btn-outline btn-sm btn-block text-danger border-danger-soft" data-action="SettingsFeature.confirmWipe">
            <span class="material-symbols-rounded mr-8">delete_forever</span>Delete all my data
          </button>
        </div>
        <div class="fs-11 text-tertiary mt-4" >Deletion is permanent and can't be undone — see the Privacy Policy for how erasure works.</div>
      </div>

      <div class="card mb-md">
        <div class="fw-700 mb-10" >Operator</div>
        ${c ? `
          <div class="fs-13 lh-150"><span class="text-tertiary">Name:</span> ${Utils.escapeHtml(c.name)}</div>
          <div class="fs-13 lh-150"><span class="text-tertiary">Address:</span> ${Utils.escapeHtml(c.address)}</div>
          <div class="fs-13 lh-150"><span class="text-tertiary">Email:</span> ${Utils.escapeHtml(c.email)}</div>
          <div class="fs-13 lh-150"><span class="text-tertiary">Company no.:</span> ${Utils.escapeHtml(c.companyNumber)}</div>
        ` : '<div class="fs-13 text-secondary" >Operator details pending.</div>'}
      </div>`;
  },

  // Central persist helper — keeps every setter in sync with one call
  persist() {
    // The AI shared secret is deliberately NOT persisted (no localStorage,
    // no DB, no backup): it lives only in sessionStorage for the lifetime of
    // this browser session. persist() saves everything else about the AI
    // config (enabled, proxyUrl, models) — the secret is restored to CONFIG
    // on boot from sessionStorage (see AIService.readSecret) so this session
    // keeps working, and any stored config never carries it.
    const aiWithoutSecret = CONFIG.ai ? { ...CONFIG.ai, secret: undefined } : CONFIG.ai;
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
      ai: aiWithoutSecret,
      autoMessages: CONFIG.autoMessages,
      onboardingComplete: true
    };
    localStorage.setItem('advisoros_config', JSON.stringify(toSave));
    try { DB.setSetting('config', toSave); } catch (e) {}
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
    // The field never displays the stored secret (it renders empty), so a
    // blank blur means "leave it as it is", not "delete it" — otherwise just
    // tapping past the field would quietly wipe a working secret.
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    // Session-only: the secret lives in sessionStorage (cleared when the
    // tab/browser closes) and in CONFIG.ai.secret for this session only —
    // never in the persisted config or a backup.
    try { sessionStorage.setItem('advisoros_ai_secret', trimmed); } catch (e) { /* private mode */ }
    CONFIG.ai = { ...(CONFIG.ai || {}), secret: trimmed };
    this.persist(); // persists everything EXCEPT the secret
    Toast.show('AI secret saved for this session', 'success');
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
    // Re-render the section the user is actually on: render() with no params
    // always returns the settings INDEX, so toggling a control on a detail
    // screen used to throw the user back to the list (and detach the very
    // control they just tapped, which could trip an innerHTML race).
    main.innerHTML = this._currentSection ? this.renderDetail(this._currentSection) : this.render();
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
    try {
      await ExportService.importBackup(file);
      // Reload so every feature reboots against the restored database and
      // config — in-memory caches, Dexie instances and the home screen all
      // rebuild from the imported state instead of the pre-import one.
      Toast.show('Data imported — reloading', 'success');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      Toast.show('Import failed: ' + err.message, 'error');
    }
  },
  exportCSV() { ExportService.exportCSV('appointments'); ExportService.exportCSV('expenses'); ExportService.exportCSV('trips'); },

  // First step of a factory reset: warn, then require a second deliberate tap
  // on the actual delete button before anything is touched.
  confirmWipe() {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Delete everything?</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          This permanently deletes every customer, visit, order, photo, expense and message — plus all your settings and targets. There is <strong>no undo</strong>, so export a backup first if you might need this data again.
        </div>
        <div class="fs-12 text-tertiary lh-150 mb-14" >
          Under the Privacy Policy this is your right to erasure — the data lives only on this device, so deleting it here erases it permanently. No copy exists anywhere else unless you exported a backup yourself.
        </div>
        <button class="btn btn-danger btn-block" data-action="SettingsFeature.confirmWipeFinal">
          <span class="material-symbols-rounded">warning</span> Yes — delete all my data
        </button>
        <button class="btn btn-outline btn-block mt-10"  data-action="App.closeModal">Cancel</button>
        <button class="btn btn-ghost btn-block mt-10 fs-13" data-action="Legal.openPrivacy">Read the privacy policy</button>
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
