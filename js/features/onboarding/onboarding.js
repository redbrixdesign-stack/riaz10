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
            <select class="select" id="ob-trade">
              ${CONFIG.trades.map(t => `<option value="${t.id}" ${this.data.trade === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>

          <div class="divider-text mt-28" >Weekly Target</div>
          <p class="text-secondary fs-13 mb-md lh-150" >
            Powers your morning brief — how far you are from target, and whether you can afford to discount a job.
          </p>
          <div class="form-group">
            <label>Weekly Net Earnings Goal (£)</label>
            <input type="number" class="input fs-24 fw-700 text-center" inputmode="decimal" id="ob-target" placeholder="600" value="${this.data.weeklyTarget}" step="10" min="0" >
          </div>
          <div class="flex gap-sm" >
            ${[400, 600, 800, 1000].map(v => `
              <button type="button" class="btn btn-outline btn-sm flex-1"  onclick="OnboardingFeature.setTargetPreset(${v})">£${v}</button>
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
            <button type="button" class="segment ${this.data.distanceUnit === 'miles' ? 'active' : ''}" data-value="miles" onclick="OnboardingFeature.setUnit('distanceUnit', 'miles', 'ob-distance-segmented')">Miles</button>
            <button type="button" class="segment ${this.data.distanceUnit === 'km' ? 'active' : ''}" data-value="km" onclick="OnboardingFeature.setUnit('distanceUnit', 'km', 'ob-distance-segmented')">Kilometres</button>
          </div>

          <div class="divider-text mt-28" >Measurement Unit</div>
          <p class="text-secondary fs-13 mb-md lh-150" >
            Used when you measure a window for blinds/curtains on a visit.
          </p>
          <div class="segmented" id="ob-measurement-segmented">
            <button type="button" class="segment ${this.data.measurementUnit === 'mm' ? 'active' : ''}" data-value="mm" onclick="OnboardingFeature.setUnit('measurementUnit', 'mm', 'ob-measurement-segmented')">mm</button>
            <button type="button" class="segment ${this.data.measurementUnit === 'cm' ? 'active' : ''}" data-value="cm" onclick="OnboardingFeature.setUnit('measurementUnit', 'cm', 'ob-measurement-segmented')">cm</button>
            <button type="button" class="segment ${this.data.measurementUnit === 'inches' ? 'active' : ''}" data-value="inches" onclick="OnboardingFeature.setUnit('measurementUnit', 'inches', 'ob-measurement-segmented')">in</button>
          </div>

          <button class="btn btn-primary btn-block mt-xl"  onclick="OnboardingFeature.finish()">
            Start Using Beelo <span class="material-symbols-rounded">check</span>
          </button>

          <button class="btn btn-outline btn-block mt-10"  onclick="OnboardingFeature.importBackup()">
            <span class="material-symbols-rounded">restore</span>
            Restore Backup Instead
          </button>
          <input type="file" id="ob-import-file" accept=".json,application/json" style="display:none;" onchange="OnboardingFeature.handleImport(event)">
        </div>
      </div>
    `;
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
    const nameEl = document.getElementById('ob-name');
    const tradeEl = document.getElementById('ob-trade');
    const targetEl = document.getElementById('ob-target');
    const addressEl = document.getElementById('ob-address');

    this.data.advisorName = nameEl ? nameEl.value.trim() : this.data.advisorName;
    this.data.trade = tradeEl ? tradeEl.value : this.data.trade;
    this.data.weeklyTarget = targetEl ? (parseFloat(targetEl.value) || 600) : this.data.weeklyTarget;
    this.data.businessAddress = addressEl ? addressEl.value.trim() : this.data.businessAddress;

    if (!this.data.advisorName) {
      Toast.show('Please enter your name', 'error');
      nameEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameEl?.focus();
      return;
    }

    CONFIG.advisorName = this.data.advisorName;
    CONFIG.trade = this.data.trade;
    CONFIG.weeklyTarget = this.data.weeklyTarget;
    CONFIG.businessAddress = this.data.businessAddress;
    CONFIG.distanceUnit = this.data.distanceUnit;
    CONFIG.measurementUnit = this.data.measurementUnit;

    const toSave = {
      advisorName: CONFIG.advisorName,
      trade: CONFIG.trade,
      weeklyTarget: CONFIG.weeklyTarget,
      businessAddress: CONFIG.businessAddress,
      distanceUnit: CONFIG.distanceUnit,
      measurementUnit: CONFIG.measurementUnit,
      advisorMode: CONFIG.advisorMode,
      country: CONFIG.country,
      currency: CONFIG.currency,
      taxSystem: CONFIG.taxSystem,
      dateFormat: CONFIG.dateFormat,
      onboardingComplete: true
    };

    localStorage.setItem('advisoros_config', JSON.stringify(toSave));

    try {
      await DB.setSetting('config', toSave);
    } catch (e) {
      console.log('DB save failed, localStorage will suffice:', e);
    }

    Toast.show(`Welcome, ${CONFIG.advisorName}!`, 'success');
    App.navigate('today');
  }
};

App.registerFeature(OnboardingFeature);
