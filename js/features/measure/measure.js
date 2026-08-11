/* ============================================
   ADVISOROS v5.0 — MEASURE FEATURE
   Recess/exact fitting, diagonal check
   ============================================ */

const MeasureFeature = {
  id: 'measure',
  name: 'Measure',
  icon: 'straighten',
  route: false,
  fittingType: 'recess',
  photoData: null,

  render(params = {}) {
    if (params.appointmentId) return this.renderMeasureForm(params.appointmentId, params.measurementId);
    return `<div class="empty-state"><span class="material-symbols-rounded">straighten</span><div>Select a visit to measure</div></div>`;
  },

  async renderMeasureForm(appointmentId, measurementId) {
    const unit = this.getUnitLabel();
    let tolerance = this.mmToDisplay(10);
    const step = CONFIG.measurementUnit === 'inches' ? '0.125' : CONFIG.measurementUnit === 'cm' ? '0.1' : '1';

    let existing = null;
    if (measurementId) {
      try { existing = await DB.db.measurements.get(parseInt(measurementId) || measurementId); } catch (e) {}
      if (existing) {
        this.fittingType = existing.fittingType || 'recess';
        this.photoData = (existing.photos && existing.photos[0]) || null;
        if (existing.tolerance) tolerance = this.mmToDisplay(existing.tolerance);
      }
    } else {
      this.fittingType = 'recess';
      this.photoData = null;
    }
    const v = (mm) => existing && mm ? this.mmToDisplay(mm) : '';

    return `<div class="fade-in">
      <div class="top-header">
        <button class="btn btn-ghost btn-sm" onclick="App.navigate('appointments',{id:${appointmentId}})"><span class="material-symbols-rounded">arrow_back</span></button>
        <h1 style="flex:1;text-align:center;font-size:18px;">${existing ? 'Edit Measurement' : 'Measure'}</h1>
        <div style="width:40px;"></div>
      </div>
      <div style="padding:16px;">
        <div class="form-group"><label>Window / Location</label><input type="text" class="input" id="meas-name" placeholder="e.g. Living Room Bay - Left" value="${existing ? Utils.escapeAttr(existing.windowName || '') : ''}"></div>

        <div class="form-group"><label>Fitting Type</label>
          <div class="segmented">
            <button class="segment ${this.fittingType === 'recess' ? 'active' : ''}" onclick="MeasureFeature.setFittingType('recess')" id="fit-recess">Recess</button>
            <button class="segment ${this.fittingType === 'exact' ? 'active' : ''}" onclick="MeasureFeature.setFittingType('exact')" id="fit-exact">Exact</button>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;"><span class="material-symbols-rounded">width</span>Width (${unit})</div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0;"><label>Top</label><input type="number" class="input" id="meas-w-top" placeholder="0" step="${step}" value="${v(existing?.widthTop)}" onchange="MeasureFeature.calculate()"></div>
            <div class="form-group" style="margin-bottom:0;"><label>Middle</label><input type="number" class="input" id="meas-w-mid" placeholder="0" step="${step}" value="${v(existing?.widthMiddle)}" onchange="MeasureFeature.calculate()"></div>
          </div>
          <div class="form-group" style="margin-top:12px;margin-bottom:0;"><label>Bottom</label><input type="number" class="input" id="meas-w-bot" placeholder="0" step="${step}" value="${v(existing?.widthBottom)}" onchange="MeasureFeature.calculate()"></div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;color:var(--text-secondary);">Least: <strong id="calc-w-least">--</strong></span>
            <span style="font-size:13px;color:var(--primary);font-weight:600;">Use: <strong id="calc-w-use">--</strong></span>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;"><span class="material-symbols-rounded">height</span>Drop (${unit})</div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0;"><label>Left</label><input type="number" class="input" id="meas-d-left" placeholder="0" step="${step}" value="${v(existing?.dropLeft)}" onchange="MeasureFeature.calculate()"></div>
            <div class="form-group" style="margin-bottom:0;"><label>Centre</label><input type="number" class="input" id="meas-d-centre" placeholder="0" step="${step}" value="${v(existing?.dropCentre)}" onchange="MeasureFeature.calculate()"></div>
          </div>
          <div class="form-group" style="margin-top:12px;margin-bottom:0;"><label>Right</label><input type="number" class="input" id="meas-d-right" placeholder="0" step="${step}" value="${v(existing?.dropRight)}" onchange="MeasureFeature.calculate()"></div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;color:var(--text-secondary);">Least: <strong id="calc-d-least">--</strong></span>
            <span style="font-size:13px;color:var(--primary);font-weight:600;">Use: <strong id="calc-d-use">--</strong></span>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;"><span class="material-symbols-rounded">square_foot</span>Diagonal Check</div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0;"><label>TL → BR (${unit})</label><input type="number" class="input" id="meas-diag-1" placeholder="0" step="${step}" value="${v(existing?.diagonalTlBr)}" onchange="MeasureFeature.calculate()"></div>
            <div class="form-group" style="margin-bottom:0;"><label>TR → BL (${unit})</label><input type="number" class="input" id="meas-diag-2" placeholder="0" step="${step}" value="${v(existing?.diagonalTrBl)}" onchange="MeasureFeature.calculate()"></div>
          </div>
          <div style="margin-top:12px;display:flex;align-items:center;gap:8px;">
            <span id="diag-status-icon" class="material-symbols-rounded" style="color:var(--text-tertiary);">help</span>
            <span id="diag-status" style="font-size:13px;color:var(--text-secondary);">Enter diagonals to check squareness</span>
          </div>
        </div>

        <div class="form-group"><label>Tolerance (${unit}) — for recess fitting</label><input type="number" class="input" id="meas-tolerance" value="${tolerance}" step="${step}" onchange="MeasureFeature.calculate()"></div>
        <div class="form-group"><label>Notes</label><textarea class="textarea" id="meas-notes" placeholder="e.g. Slight bow in sill, handle obstruction...">${existing ? Utils.escapeHtml(existing.notes || '') : ''}</textarea></div>

        <div class="form-group">
          <label>Photo</label>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('meas-photo').click()"><span class="material-symbols-rounded">photo_camera</span>Take Photo</button>
          <input type="file" id="meas-photo" accept="image/*" capture="environment" style="display:none;" onchange="MeasureFeature.handlePhoto(event)">
          <div id="meas-photo-preview" style="margin-top:8px;">${this.photoData ? `<img src="${this.photoData}" style="max-width:100%;border-radius:8px;">` : ''}</div>
        </div>

        <button class="btn btn-primary btn-block" style="margin-top:8px;" onclick="MeasureFeature.save(${appointmentId}, ${existing ? existing.id : 'null'})">${existing ? 'Save Changes' : 'Save Measurement'}</button>
        ${existing ? `
          <button class="btn btn-danger btn-block" style="margin-top:8px;" onclick="MeasureFeature.deleteMeasurement(${existing.id}, ${appointmentId})">
            <span class="material-symbols-rounded">delete</span> Delete Measurement
          </button>
        ` : ''}
      </div>
    </div>`;
  },

  setFittingType(type) {
    this.fittingType = type;
    document.getElementById('fit-recess').classList.toggle('active', type === 'recess');
    document.getElementById('fit-exact').classList.toggle('active', type === 'exact');
    this.calculate();
  },

  getUnitLabel() {
    if (CONFIG.measurementUnit === 'inches') return 'in';
    if (CONFIG.measurementUnit === 'cm') return 'cm';
    return 'mm';
  },

  displayToMm(value) {
    const num = parseFloat(value) || 0;
    if (CONFIG.measurementUnit === 'inches') return num * 25.4;
    if (CONFIG.measurementUnit === 'cm') return num * 10;
    return num;
  },

  mmToDisplay(mm) {
    if (CONFIG.measurementUnit === 'inches') return Number((mm / 25.4).toFixed(3));
    if (CONFIG.measurementUnit === 'cm') return Number((mm / 10).toFixed(1));
    return mm;
  },

  readMeasurement(id) {
    return this.displayToMm(document.getElementById(id)?.value);
  },

  formatMeasurement(mm) {
    return mm > 0 ? Utils.formatMeasurement(Math.round(mm * 10) / 10) : '--';
  },

  calculate() {
    const wTop = this.readMeasurement('meas-w-top');
    const wMid = this.readMeasurement('meas-w-mid');
    const wBot = this.readMeasurement('meas-w-bot');
    const wLeast = Math.min(wTop, wMid, wBot);
    const tolerance = this.readMeasurement('meas-tolerance') || 10;
    const wUse = this.fittingType === 'recess' ? wLeast - tolerance : wLeast;
    document.getElementById('calc-w-least').textContent = this.formatMeasurement(wLeast);
    document.getElementById('calc-w-use').textContent = this.formatMeasurement(wUse);

    const dLeft = this.readMeasurement('meas-d-left');
    const dCentre = this.readMeasurement('meas-d-centre');
    const dRight = this.readMeasurement('meas-d-right');
    const dLeast = Math.min(dLeft, dCentre, dRight);
    const dUse = dLeast;
    document.getElementById('calc-d-least').textContent = this.formatMeasurement(dLeast);
    document.getElementById('calc-d-use').textContent = this.formatMeasurement(dUse);

    const diag1 = this.readMeasurement('meas-diag-1');
    const diag2 = this.readMeasurement('meas-diag-2');
    if (diag1 > 0 && diag2 > 0) {
      const variance = Math.abs(diag1 - diag2);
      const isSquare = variance <= 5;
      const statusEl = document.getElementById('diag-status');
      const iconEl = document.getElementById('diag-status-icon');
      if (isSquare) { statusEl.textContent = `Square (variance: ${Utils.formatMeasurement(variance)})`; statusEl.style.color = 'var(--secondary)'; iconEl.textContent = 'check_circle'; iconEl.style.color = 'var(--secondary)'; }
      else { statusEl.textContent = `Not square (variance: ${Utils.formatMeasurement(variance)})`; statusEl.style.color = 'var(--warning)'; iconEl.textContent = 'warning'; iconEl.style.color = 'var(--warning)'; }
    }
  },

  async handlePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const base64 = await Utils.fileToBase64(file);
    this.photoData = base64;
    document.getElementById('meas-photo-preview').innerHTML = `<img src="${base64}" style="max-width:100%;border-radius:8px;">`;
  },

  async save(appointmentId, measurementId) {
    const name = document.getElementById('meas-name').value.trim();
    if (!name) { Toast.show('Please enter a window name', 'error'); return; }

    const data = {
      appointmentId, windowName: name, fittingType: this.fittingType,
      inputUnit: CONFIG.measurementUnit || 'mm',
      widthTop: this.readMeasurement('meas-w-top'),
      widthMiddle: this.readMeasurement('meas-w-mid'),
      widthBottom: this.readMeasurement('meas-w-bot'),
      dropLeft: this.readMeasurement('meas-d-left'),
      dropCentre: this.readMeasurement('meas-d-centre'),
      dropRight: this.readMeasurement('meas-d-right'),
      diagonalTlBr: this.readMeasurement('meas-diag-1'),
      diagonalTrBl: this.readMeasurement('meas-diag-2'),
      tolerance: this.readMeasurement('meas-tolerance') || 10,
      notes: document.getElementById('meas-notes')?.value || '',
      photos: this.photoData ? [this.photoData] : []
    };

    if (measurementId) {
      const widthLeast = Math.min(data.widthTop, data.widthMiddle, data.widthBottom);
      const dropLeast = Math.min(data.dropLeft, data.dropCentre, data.dropRight);
      const diagVariance = Math.abs(data.diagonalTlBr - data.diagonalTrBl);
      await DB.db.measurements.update(measurementId, {
        ...data,
        widthLeast,
        dropLeast,
        widthUsed: data.fittingType === 'recess' ? widthLeast - data.tolerance : widthLeast,
        dropUsed: dropLeast,
        diagonalVariance: diagVariance,
        isSquare: diagVariance <= 5
      });
      Toast.show('Measurement updated', 'success');
    } else {
      await DB.addMeasurement(data);
      Toast.show('Measurement saved', 'success');
    }

    App.navigate('appointments', {id: appointmentId});
  },

  async deleteMeasurement(measurementId, appointmentId) {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Delete Measurement</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">
          This can't be undone.
        </div>
        <button class="btn btn-danger btn-block" onclick="MeasureFeature.confirmDeleteMeasurement(${measurementId}, ${appointmentId})">
          Delete Measurement
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async confirmDeleteMeasurement(measurementId, appointmentId) {
    try {
      await DB.db.measurements.delete(measurementId);
      App.closeModal();
      Toast.show('Measurement deleted', 'success');
      App.navigate('appointments', {id: appointmentId});
    } catch (e) {
      console.error('Delete measurement error:', e);
      Toast.show('Failed to delete measurement', 'error');
    }
  }
};

App.registerFeature(MeasureFeature);
