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
    // URL-hash params arrive as raw strings and are interpolated into inline
    // handlers below - only accept well-formed positive integers, never the
    // raw value (a crafted #measure?appointmentId=1})alert(1)// link would
    // otherwise execute inside the onclick attribute).
    const safeAppointmentId = Number.isInteger(Number(appointmentId)) && Number(appointmentId) > 0 ? Number(appointmentId) : null;
    const safeMeasurementId = Number.isInteger(Number(measurementId)) && Number(measurementId) > 0 ? Number(measurementId) : null;
    if (!safeAppointmentId) {
      return `<div class="empty-state"><span class="material-symbols-rounded">straighten</span><div>Select a visit to measure</div></div>`;
    }
    const unit = this.getUnitLabel();
    let tolerance = this.mmToDisplay(10);
    const step = CONFIG.measurementUnit === 'inches' ? '0.125' : CONFIG.measurementUnit === 'cm' ? '0.1' : '1';

    let existing = null;
    if (safeMeasurementId) {
      try { existing = await DB.db.measurements.get(safeMeasurementId); } catch (e) {}
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
      ${App.renderTopHeader({ 
        title: existing ? 'Edit Measurement' : 'Measure', 
        showBack: true, 
        backHref: `appointments?id=${safeAppointmentId}` 
      })}
      <div class="p-md" >
        <div class="form-group"><label>Window / Location</label><input type="text" class="input" id="meas-name" placeholder="e.g. Living Room Bay - Left" value="${existing ? Utils.escapeHtml(existing.windowName || '') : ''}"></div>

        <div class="form-group"><label>Fitting Type</label>
          <div class="segmented">
            <button class="segment ${this.fittingType === 'recess' ? 'active' : ''}" onclick="MeasureFeature.setFittingType('recess')" id="fit-recess">Recess</button>
            <button class="segment ${this.fittingType === 'exact' ? 'active' : ''}" onclick="MeasureFeature.setFittingType('exact')" id="fit-exact">Exact</button>
          </div>
        </div>

        <div class="card mb-md" >
          <div class="fw-600 mb-12 flex items-center gap-sm" ><span class="material-symbols-rounded">width</span>Width (${unit})</div>
          <div class="form-row">
            <div class="form-group mb-0" ><label>Top</label><input type="number" class="input" inputmode="decimal" id="meas-w-top" placeholder="0" step="${step}" value="${v(existing?.widthTop)}" onchange="MeasureFeature.calculate()"></div>
            <div class="form-group mb-0" ><label>Middle</label><input type="number" class="input" inputmode="decimal" id="meas-w-mid" placeholder="0" step="${step}" value="${v(existing?.widthMiddle)}" onchange="MeasureFeature.calculate()"></div>
          </div>
          <div class="form-group mt-12 mb-0" ><label>Bottom</label><input type="number" class="input" inputmode="decimal" id="meas-w-bot" placeholder="0" step="${step}" value="${v(existing?.widthBottom)}" onchange="MeasureFeature.calculate()"></div>
          <div class="mt-12 top-divider flex justify-between items-center" >
            <span class="fs-13 text-secondary" >Least: <strong id="calc-w-least">--</strong></span>
            <span class="fs-13 text-brand fw-600" >Use: <strong id="calc-w-use">--</strong></span>
          </div>
        </div>

        <div class="card mb-md" >
          <div class="fw-600 mb-12 flex items-center gap-sm" ><span class="material-symbols-rounded">height</span>Drop (${unit})</div>
          <div class="form-row">
            <div class="form-group mb-0" ><label>Left</label><input type="number" class="input" inputmode="decimal" id="meas-d-left" placeholder="0" step="${step}" value="${v(existing?.dropLeft)}" onchange="MeasureFeature.calculate()"></div>
            <div class="form-group mb-0" ><label>Centre</label><input type="number" class="input" inputmode="decimal" id="meas-d-centre" placeholder="0" step="${step}" value="${v(existing?.dropCentre)}" onchange="MeasureFeature.calculate()"></div>
          </div>
          <div class="form-group mt-12 mb-0" ><label>Right</label><input type="number" class="input" inputmode="decimal" id="meas-d-right" placeholder="0" step="${step}" value="${v(existing?.dropRight)}" onchange="MeasureFeature.calculate()"></div>
          <div class="mt-12 top-divider flex justify-between items-center" >
            <span class="fs-13 text-secondary" >Least: <strong id="calc-d-least">--</strong></span>
            <span class="fs-13 text-brand fw-600" >Use: <strong id="calc-d-use">--</strong></span>
          </div>
        </div>

        <div class="card mb-md" >
          <div class="fw-600 mb-12 flex items-center gap-sm" ><span class="material-symbols-rounded">square_foot</span>Diagonal Check</div>
          <div class="form-row">
            <div class="form-group mb-0" ><label>TL → BR (${unit})</label><input type="number" class="input" inputmode="decimal" id="meas-diag-1" placeholder="0" step="${step}" value="${v(existing?.diagonalTlBr)}" onchange="MeasureFeature.calculate()"></div>
            <div class="form-group mb-0" ><label>TR → BL (${unit})</label><input type="number" class="input" inputmode="decimal" id="meas-diag-2" placeholder="0" step="${step}" value="${v(existing?.diagonalTrBl)}" onchange="MeasureFeature.calculate()"></div>
          </div>
          <div class="mt-12 flex items-center gap-sm" >
            <span id="diag-status-icon" class="material-symbols-rounded text-tertiary" >help</span>
            <span class="fs-13 text-secondary" id="diag-status" >Enter diagonals to check squareness</span>
          </div>
        </div>

        <div class="form-group"><label>Tolerance (${unit}) — for recess fitting</label><input type="number" class="input" inputmode="decimal" id="meas-tolerance" value="${tolerance}" step="${step}" onchange="MeasureFeature.calculate()"></div>
        <div class="form-group"><label>Notes</label><textarea class="textarea" id="meas-notes" placeholder="e.g. Slight bow in sill, handle obstruction...">${existing ? Utils.escapeHtml(existing.notes || '') : ''}</textarea></div>

        <div class="form-group">
          <label>Photo</label>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('meas-photo').click()"><span class="material-symbols-rounded">photo_camera</span>Take Photo</button>
          <input type="file" id="meas-photo" accept="image/*" capture="environment" style="display:none;" onchange="MeasureFeature.handlePhoto(event)">
          <div class="mt-sm" id="meas-photo-preview" >${this.photoData ? `<img class="max-w-full br-8" src="${this.photoData}" >` : ''}</div>
        </div>

        <button class="btn btn-primary btn-block mt-sm"  onclick="MeasureFeature.save(${safeAppointmentId}, ${existing ? existing.id : 'null'})">${existing ? 'Save Changes' : 'Save Measurement'}</button>
        ${existing ? `
          <button class="btn btn-danger btn-block mt-sm"  onclick="MeasureFeature.deleteMeasurement(${existing.id}, ${safeAppointmentId})">
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

  /* Parsing a measurement field keeps every state distinct:
       missing/empty/unparseable  -> null  (stored as null — never 0)
       explicit zero or negative  -> parsed number, so save() can reject it
       valid positive             -> number (mm after unit conversion)
     A window is never 0 mm wide, so an incomplete entry must never
     silently become a valid zero in storage. */
  displayToMm(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (s === '') return null;
    const num = parseFloat(s);
    if (Number.isNaN(num)) return null;
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

  /* Least/used for a group of three measurements (mm or null). A group is
     only complete when all three are present AND positive — an explicit 0
     or a negative can never be a real window size, so it counts as absent
     here and the derived values stay null instead of becoming 0 or, worse,
     a negative widthUsed (least - tolerance). */
  computeGroupLeast(a, b, c, tolerance, applyTolerance) {
    if (!(a > 0) || !(b > 0) || !(c > 0)) return { least: null, used: null };
    const least = Math.min(a, b, c);
    return { least, used: applyTolerance ? least - tolerance : least };
  },

  /* Squareness check. Both diagonals are required: with one missing the
     check simply hasn't happened, so variance and isSquare stay null —
     a missing diagonal must never be recorded as "not square" (or worse,
     "square" because 0 variance passes the 5 mm rule). */
  computeDiagCheck(diag1, diag2) {
    if (!(diag1 > 0) || !(diag2 > 0)) return { variance: null, isSquare: null };
    const variance = Math.abs(diag1 - diag2);
    return { variance, isSquare: variance <= 5 };
  },

  /* Save-time validation: values here are parsed mm numbers or null
     (missing — allowed, stays missing). An explicitly-entered zero or
     negative is not a measurement; it is rejected with the field's label
     instead of being silently stored as a valid figure. */
  firstInvalidMeasurement(values) {
    const labels = {
      widthTop: 'Width (top)',
      widthMiddle: 'Width (middle)',
      widthBottom: 'Width (bottom)',
      dropLeft: 'Drop (left)',
      dropCentre: 'Drop (centre)',
      dropRight: 'Drop (right)',
      diagonalTlBr: 'Diagonal (TL → BR)',
      diagonalTrBl: 'Diagonal (TR → BL)',
      tolerance: 'Tolerance'
    };
    for (const [key, label] of Object.entries(labels)) {
      const mm = values[key];
      if (mm != null && !(mm > 0)) return label;
    }
    return null;
  },

  formatMeasurement(mm) {
    return mm > 0 ? Utils.formatMeasurement(Math.round(mm * 10) / 10) : '--';
  },

  calculate() {
    const wTop = this.readMeasurement('meas-w-top');
    const wMid = this.readMeasurement('meas-w-mid');
    const wBot = this.readMeasurement('meas-w-bot');
    const tolerance = this.readMeasurement('meas-tolerance') || 10;
    const wGroup = this.computeGroupLeast(wTop, wMid, wBot, tolerance, this.fittingType === 'recess');
    document.getElementById('calc-w-least').textContent = this.formatMeasurement(wGroup.least);
    document.getElementById('calc-w-use').textContent = this.formatMeasurement(wGroup.used);

    const dLeft = this.readMeasurement('meas-d-left');
    const dCentre = this.readMeasurement('meas-d-centre');
    const dRight = this.readMeasurement('meas-d-right');
    // Drop is vertical — tolerance is never subtracted from it.
    const dGroup = this.computeGroupLeast(dLeft, dCentre, dRight, tolerance, false);
    document.getElementById('calc-d-least').textContent = this.formatMeasurement(dGroup.least);
    document.getElementById('calc-d-use').textContent = this.formatMeasurement(dGroup.used);

    const diag1 = this.readMeasurement('meas-diag-1');
    const diag2 = this.readMeasurement('meas-diag-2');
    const { variance, isSquare } = this.computeDiagCheck(diag1, diag2);
    const statusEl = document.getElementById('diag-status');
    const iconEl = document.getElementById('diag-status-icon');
    if (variance === null) {
      // Incomplete check: reset the verdict so a stale "Square" from a
      // previously-entered pair can't survive a cleared diagonal.
      statusEl.textContent = 'Enter diagonals to check squareness';
      statusEl.style.color = '';
      iconEl.textContent = 'help';
      iconEl.style.color = '';
    } else if (isSquare) {
      statusEl.textContent = `Square (variance: ${Utils.formatMeasurement(variance)})`;
      statusEl.style.color = 'var(--secondary)';
      iconEl.textContent = 'check_circle';
      iconEl.style.color = 'var(--secondary)';
    } else {
      statusEl.textContent = `Not square (variance: ${Utils.formatMeasurement(variance)})`;
      statusEl.style.color = 'var(--warning)';
      iconEl.textContent = 'warning';
      iconEl.style.color = 'var(--warning)';
    }
  },

  async handlePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const base64 = await Utils.fileToBase64(file);
    this.photoData = base64;
    document.getElementById('meas-photo-preview').innerHTML = `<img class="max-w-full br-8" src="${base64}" >`;
  },

  async save(appointmentId, measurementId) {
    const name = document.getElementById('meas-name').value.trim();
    if (!name) { Toast.show('Please enter a window name', 'error'); return; }

    const values = {
      widthTop: this.readMeasurement('meas-w-top'),
      widthMiddle: this.readMeasurement('meas-w-mid'),
      widthBottom: this.readMeasurement('meas-w-bot'),
      dropLeft: this.readMeasurement('meas-d-left'),
      dropCentre: this.readMeasurement('meas-d-centre'),
      dropRight: this.readMeasurement('meas-d-right'),
      diagonalTlBr: this.readMeasurement('meas-diag-1'),
      diagonalTrBl: this.readMeasurement('meas-diag-2'),
      tolerance: this.readMeasurement('meas-tolerance')
    };

    // Explicit 0 / negative entries are rejected — they are not measurements
    // and must not become zeros in storage. Missing (null) stays missing.
    const invalid = this.firstInvalidMeasurement(values);
    if (invalid) {
      Toast.show(`${invalid} must be a positive number — 0 is not a valid measurement`, 'error');
      return;
    }

    const tolerance = values.tolerance || 10;
    const wGroup = this.computeGroupLeast(values.widthTop, values.widthMiddle, values.widthBottom, tolerance, this.fittingType === 'recess');
    const dGroup = this.computeGroupLeast(values.dropLeft, values.dropCentre, values.dropRight, tolerance, false);
    const diag = this.computeDiagCheck(values.diagonalTlBr, values.diagonalTrBl);

    const data = {
      appointmentId, windowName: name, fittingType: this.fittingType,
      inputUnit: CONFIG.measurementUnit || 'mm',
      widthTop: values.widthTop,
      widthMiddle: values.widthMiddle,
      widthBottom: values.widthBottom,
      dropLeft: values.dropLeft,
      dropCentre: values.dropCentre,
      dropRight: values.dropRight,
      diagonalTlBr: values.diagonalTlBr,
      diagonalTrBl: values.diagonalTrBl,
      tolerance,
      notes: document.getElementById('meas-notes')?.value || '',
      photos: this.photoData ? [this.photoData] : []
    };

    if (measurementId) {
      await DB.db.measurements.update(measurementId, {
        ...data,
        widthLeast: wGroup.least,
        dropLeast: dGroup.least,
        widthUsed: wGroup.used,
        dropUsed: dGroup.used,
        diagonalVariance: diag.variance,
        isSquare: diag.isSquare
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
        <div class="fs-14 text-secondary lh-150 mb-14" >
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
