/* ============================================
   ADVISOROS v5.0 — ONBOARDING
   Single-screen first-run setup: name, trade, weekly
   target, base address, distance unit, measurement unit.
   Previously a 4-step wizard requiring Continue taps
   between screens - now one scrollable form so nothing
   requires extra navigation to set up or change your mind.
   ============================================ */

const OnboardingFeature = {
  id: 'onboarding',
  name: 'Onboarding',
  icon: 'waving_hand',
  route: false, // not in bottom nav

  data: {
    advisorName: '',
    trade: 'window_coverings',
    advisorTitle: 'independent window coverings professional',
    earningsMode: 'manual',
    weeklyTarget: 600,
    businessAddress: '',
    distanceUnit: 'miles',
    measurementUnit: 'mm'
  },

  init() {},

  render() {
    return `
      <div class="fade-in minh-screen flex flex-col" >
        <div class="flex-1 pad-scroll" >
          <div class="fs-40 mb-sm" >👋</div>
          <h1 class="fs-26 fw-700 mb-sm" >Welcome to Beelo</h1>
          <p class="text-secondary mb-28 lh-150" >
            It adapts to you — you don't adapt to it. Everything below can be changed later in Settings, so don't overthink it.
          </p>

          <div class="form-group">
            <label>Your Full Name *</label>
            <input type="text" class="input" id="ob-name" placeholder="e.g. Riaz Ahmed" value="${Utils.escapeHtml(this.data.advisorName)}">
          </div>

          <div class="form-group">
            <label>Your Trade</label>
            <select class="select" id="ob-trade" data-event="change" data-action="OnboardingFeature.changeTrade" data-args='["__value__"]'>
              ${CONFIG.trades.map(t => `<option value="${t.id}" ${this.data.trade === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>

          <div class="form-group"><label for="ob-title">How you introduce yourself</label><input type="text" class="input" id="ob-title" maxlength="160" value="${Utils.escapeHtml(this.data.advisorTitle)}"><p class="hint">Used in your message drafts. Add a company affiliation only if it is yours. Social links start blank; add your own in Settings.</p></div>
          <details class="mb-md"><summary class="py-sm">Sales commission · set now or later</summary><label for="ob-commission-mode">How commission is estimated</label><select id="ob-commission-mode" class="select" data-event="change" data-action="OnboardingFeature.changeEarningsMode" data-args='["__value__"]'><option value="manual">Not set — no commission estimates yet</option><option value="simple">Percentage of the full sale</option><option value="two_stage">Sale reduction, then net commission</option></select>
            <div id="ob-simple-fields" hidden><label for="ob-simple-rate">Commission (%)</label><input id="ob-simple-rate" class="input" type="number" inputmode="decimal" min="0" max="100" step="0.01"></div>
            <div id="ob-net-fields" hidden><label for="ob-reduction">Sale reduction (%)</label><input id="ob-reduction" class="input" type="number" inputmode="decimal" min="0" max="100" step="0.01"><label for="ob-net-rate">Commission on the reduced amount (%)</label><input id="ob-net-rate" class="input" type="number" inputmode="decimal" min="0" max="100" step="0.01"></div><p class="hint">Use your actual agreement. Until configured, sales and survey commission estimates are £0. Change this later in Settings → Commission Rate. Existing pilot service-call fee rules are separate.</p>
          </details>
          <div class="divider-text mt-28" >Weekly Target</div>
          <p class="text-secondary fs-13 mb-md lh-150" >
            Compare recorded earnings with your goal before expenses and tax. Zero means no target. This is not a take-home target.
          </p>
          <div class="form-group">
            <label>Weekly earnings target (£, before expenses and tax)</label>
            <input type="number" class="input fs-24 fw-700 text-center" inputmode="decimal" id="ob-target" placeholder="600" value="${this.data.weeklyTarget}" step="10" min="0" >
          </div>
          <div class="flex gap-sm" >
            ${[400, 600, 800, 1000].map(v => `
              <button type="button" class="btn btn-outline btn-sm flex-1"  data-action="OnboardingFeature.setTargetPreset" data-args='${JSON.stringify([v])}'>£${v}</button>
            `).join('')}
          </div>

          <div class="divider-text mt-28" >Home / Business Base</div>
          <p class="text-secondary fs-13 mb-md lh-150" >
            Powers route distances, ETAs, mileage tax relief, and the weather glance on Home. Optional — leave blank and add it later if you'd rather.
          </p>
          <div class="form-group">
            <textarea class="textarea" id="ob-address" placeholder="e.g. 12 Example Street, Manchester M14 7FZ" style="min-height:70px;">${Utils.escapeHtml(this.data.businessAddress || '')}</textarea>
          </div>

          <div class="divider-text mt-28" >Distance Unit</div>
          <p class="text-secondary fs-13 mb-md lh-150" >
            UK mileage tax relief is calculated in miles: 55p/mile for the first 10,000 business miles (2026/27).
          </p>
          <div class="segmented" id="ob-distance-segmented">
            <button type="button" class="segment ${this.data.distanceUnit === 'miles' ? 'active' : ''}" data-value="miles" data-action="OnboardingFeature.setUnit" data-args='${JSON.stringify(["distanceUnit", "miles", "ob-distance-segmented"])}'>Miles</button>
            <button type="button" class="segment ${this.data.distanceUnit === 'km' ? 'active' : ''}" data-value="km" data-action="OnboardingFeature.setUnit" data-args='${JSON.stringify(["distanceUnit", "km", "ob-distance-segmented"])}'>Kilometres</button>
          </div>

          <div class="divider-text mt-28" >Measurement Unit</div>
          <p class="text-secondary fs-13 mb-md lh-150" >
            Used when you measure a window for blinds/curtains on a visit.
          </p>
          <div class="segmented" id="ob-measurement-segmented">
            <button type="button" class="segment ${this.data.measurementUnit === 'mm' ? 'active' : ''}" data-value="mm" data-action="OnboardingFeature.setUnit" data-args='${JSON.stringify(["measurementUnit", "mm", "ob-measurement-segmented"])}'>mm</button>
            <button type="button" class="segment ${this.data.measurementUnit === 'cm' ? 'active' : ''}" data-value="cm" data-action="OnboardingFeature.setUnit" data-args='${JSON.stringify(["measurementUnit", "cm", "ob-measurement-segmented"])}'>cm</button>
            <button type="button" class="segment ${this.data.measurementUnit === 'inches' ? 'active' : ''}" data-value="inches" data-action="OnboardingFeature.setUnit" data-args='${JSON.stringify(["measurementUnit", "inches", "ob-measurement-segmented"])}'>in</button>
          </div>

          <section class="card mt-md" aria-labelledby="ob-storage-title"><h2 id="ob-storage-title" class="fs-18">Your records stay on this phone</h2>${typeof ConsentPrompt!=='undefined'?ConsentPrompt.explanationHtml():'<p role="alert">Storage information could not load. Reload before completing setup.</p>'}<button type="button" class="btn btn-ghost" data-action="Legal.openPage" data-args='["privacy"]'>Read privacy policy</button><label class="flex items-start gap-sm mt-sm" for="ob-storage-ack"><input type="checkbox" id="ob-storage-ack"><span>I understand where my records are stored and that I need a protected backup.</span></label></section>
          <p id="ob-error" role="alert"></p>
          <button class="btn btn-primary btn-block mt-xl"  data-action="OnboardingFeature.finish">
            Start Using Beelo <span class="material-symbols-rounded">check</span>
          </button>

          <button class="btn btn-outline btn-block mt-10"  data-action="OnboardingFeature.importBackup">
            <span class="material-symbols-rounded">restore</span>
            Restore Backup Instead
          </button>
          <input type="file" id="ob-import-file" accept=".json,application/json" style="display:none;" data-action="OnboardingFeature.handleImport" data-args='["__event__"]'>
        </div>
      </div>
    `;
  },

  suggestedTitle(trade) {
    const name = CONFIG.trades.find(t => t.id === trade)?.name || 'home-visit';
    return 'independent ' + name.toLowerCase() + ' professional';
  },
  changeTrade(value) {
    const input = document.getElementById('ob-title');
    if (input && input.value === this.suggestedTitle(this.data.trade)) input.value = this.suggestedTitle(value);
    this.data.trade = value;
  },
  changeEarningsMode(value) {
    document.getElementById('ob-simple-fields').hidden = value !== 'simple';
    document.getElementById('ob-net-fields').hidden = value !== 'two_stage';
  },
  showError(message, field) {
    const error = document.getElementById('ob-error'); if (error) error.textContent = message;
    Toast.show(message, 'error'); const input = document.getElementById(field); input?.focus(); input?.scrollIntoView?.({block:'center'});
  },

  setTargetPreset(v) {
    this.data.weeklyTarget = v;
    const el = document.getElementById('ob-target');
    if (el) el.value = v;
  },

  // Toggles a segmented control in place (no full re-render / no navigation)
  // so picking a unit doesn't lose whatever else you've already typed.
  setUnit(field, value, segmentedId) {
    this.data[field] = value;
    const container = document.getElementById(segmentedId);
    if (!container) return;
    container.querySelectorAll('.segment').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  },

  importBackup() {
    const input = document.getElementById('ob-import-file');
    if (input) input.click();
  },

  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      await ExportService.importBackup(file);
      Toast.show('Backup restored', 'success');
      App.navigate('today');
    } catch (err) {
      console.error('Onboarding import failed:', err);
      Toast.show('Import failed: ' + (err.message || 'Please check the backup file'), 'error');
    } finally {
      event.target.value = '';
    }
  },

  async finish() {
    if (this._saving) return;
    const value = id => document.getElementById(id)?.value?.trim() || '';
    const name = value('ob-name'), trade = value('ob-trade'), title = value('ob-title');
    const targetText = value('ob-target'), target = Number(targetText), mode = value('ob-commission-mode');
    if (!name) return this.showError('Please enter your name', 'ob-name');
    if (!CONFIG.trades.some(t => t.id === trade)) return this.showError('Choose your trade', 'ob-trade');
    if (!title || title.length > 160) return this.showError('Enter how you introduce yourself (up to 160 characters)', 'ob-title');
    if (!targetText || !Number.isFinite(target) || target < 0) return this.showError('Enter zero or a positive weekly earnings target', 'ob-target');
    if (!['manual','simple','two_stage'].includes(mode)) return this.showError('Choose a commission option', 'ob-commission-mode');
    const commission = { mode };
    for (const [field,key] of mode === 'simple' ? [['ob-simple-rate','simpleRate']] : mode === 'two_stage' ? [['ob-reduction','saleReductionRate'],['ob-net-rate','netCommissionRate']] : []) {
      const text = value(field), rate = Number(text);
      if (!text || !Number.isFinite(rate) || rate < 0 || rate > 100) return this.showError('Enter a percentage between 0 and 100', field);
      commission[key] = rate;
    }
    if (!document.getElementById('ob-storage-ack')?.checked) return this.showError('Please read and acknowledge how your records are stored', 'ob-storage-ack');
    if (typeof ConsentPrompt === 'undefined' || !ConsentPrompt.recordAcknowledgement()) return this.showError('Could not save the storage acknowledgement. Please try again.', 'ob-storage-ack');
    const toSave = {
      advisorName:name, advisorTitle:title, trade, weeklyTarget:target,
      commission, socialLinks:{facebook:'',instagram:''},
      businessAddress:value('ob-address'), distanceUnit:this.data.distanceUnit, measurementUnit:this.data.measurementUnit,
      advisorMode:CONFIG.advisorMode, country:CONFIG.country, currency:CONFIG.currency,
      taxSystem:CONFIG.taxSystem, dateFormat:CONFIG.dateFormat, onboardingComplete:true
    };
    this._saving = true;
    const button = document.querySelector('[data-action="OnboardingFeature.finish"]'); if (button) button.disabled = true;
    try {
      await DB.setSetting('config', toSave);
      try { localStorage.setItem('advisoros_config', JSON.stringify(toSave)); } catch (_) { /* The local database is the persisted authority. */ }
      Object.assign(CONFIG,toSave);
      Toast.show(`Welcome, ${name}!`, 'success'); App.navigate('today');
    } catch (_) { this.showError('Could not save setup. Your entries are still here; please try again.', 'ob-name'); }
    finally { this._saving = false; if (button?.isConnected) button.disabled = false; }
  }
};

App.registerFeature(OnboardingFeature);
