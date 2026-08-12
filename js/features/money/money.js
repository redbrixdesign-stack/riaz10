/* ============================================
   ADVISOROS v5.0 — MONEY FEATURE
   Tax, expenses, mileage, savings nudge
   ============================================ */

const MoneyFeature = {
  id: 'money',
  name: 'Money',
  icon: 'account_balance_wallet',
  expensePhotoData: null,

  render() {
    return this.renderAsync();
  },

  async renderAsync() {
    let taxSummary = null;
    try { taxSummary = await TaxCalculator.getRunningEstimate(); } catch(e) {}
    const formatted = taxSummary ? TaxCalculator.formatSummary(taxSummary) : null;

    const now = new Date();
    const monthStart = Utils.getStartOfMonth(now);
    let expenses = [];
    let trips = [];

    try {
      expenses = await DB.getExpensesForPeriod(monthStart.toISOString(), now.toISOString());
    } catch (e) {}

    try {
      trips = await DB.getTripsForPeriod(monthStart.toISOString(), now.toISOString());
    } catch (e) {}

    const monthTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const monthMiles = trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    const mileageClaim = TaxCalculator.calculateMileageClaim(monthMiles);
    const weekEarnings = await this.getWeekEarnings();
    const target = CONFIG.weeklyTarget || 600;
    const targetGap = Math.max(0, target - weekEarnings);
    const recordCount = expenses.length + trips.length;

    return `<div class="fade-in">
      <div class="top-header">
        <h1>Money</h1>
        <div class="header-actions">
          <button class="btn btn-sm btn-ghost" aria-label="Download tax summary" onclick="ExportService.exportTaxSummary()"><span class="material-symbols-rounded">download</span></button>
        </div>
      </div>

      <div class="p-md pb-0" >
        <div class="card hero-card" >
          <div class="fs-13 op-90" >This Week · Earnings (commission)</div>
          <div class="fs-32 fw-700 mt-6" >${Utils.formatCurrency(weekEarnings)}</div>
          <div class="fs-15 op-90 mt-xs" >${targetGap > 0 ? `${Utils.formatCurrency(targetGap)} to earnings target` : 'Earnings target reached'}</div>
          <div class="progress-bar mt-14 bg-soft-light" >
            <div class="fill ${weekEarnings >= target ? 'success' : 'accent'}" style="width:${Math.min(100, target > 0 ? (weekEarnings / target) * 100 : 0)}%;background:${weekEarnings >= target ? 'var(--secondary)' : 'var(--accent)'};"></div>
          </div>
          <div class="fs-11 op-70 mt-6" >Today shows sales value; this shows your commission. Both share the same weekly target.</div>
        </div>

        <div class="stats-grid">
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View upcoming visits" onclick="App.navigate('appointments', {tab: 'upcoming'})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.navigate('appointments', {tab: 'upcoming'});}"><div class="value">${Utils.formatCurrency(targetGap)}</div><div class="label">Earnings Gap</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View this month's records" onclick="MoneyFeature.openRecordsModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();MoneyFeature.openRecordsModal();}"><div class="value">${Utils.formatCurrency(mileageClaim)}</div><div class="label">Mileage Claim</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View this month's records" onclick="MoneyFeature.openRecordsModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();MoneyFeature.openRecordsModal();}"><div class="value">${Utils.formatCurrency(monthTotal)}</div><div class="label">Expenses</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View this month's records" onclick="MoneyFeature.openRecordsModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();MoneyFeature.openRecordsModal();}"><div class="value">${recordCount || '—'}</div><div class="label">Records This Month</div></div>
        </div>
      </div>

      ${formatted ? `
      <div class="card card-page-mb" id="tax-estimate-card" >
        <div class="flex justify-between gap-12 items-start mb-12" >
          <div>
            <div class="fw-600" >Tax Estimate</div>
            <div class="fs-12 text-tertiary" >Tax year ${taxSummary.tax.taxYear.label}</div>
          </div>
          <span class="badge badge-primary">Estimate</span>
        </div>
        <div class="grid-2 gap-12" >
          <div><div class="fs-12 text-tertiary" >Profit</div><div class="fs-20 fw-700" >${formatted.profit}</div></div>
          <div><div class="fs-12 text-tertiary" >Tax due</div><div class="fs-20 fw-700 text-danger" >${formatted.taxDue}</div></div>
          <div><div class="fs-12 text-tertiary" >Income tax</div><div class="fw-600" >${formatted.incomeTax}</div></div>
          <div><div class="fs-12 text-tertiary" >Class 4 NIC</div><div class="fw-600" >${formatted.class4NIC}</div></div>
        </div>
      </div>

      <div class="card card-page-gap" >
        <div class="fw-600 mb-12" >Payment Deadlines</div>
        <div class="flex flex-col gap-12" >
          <div class="flex justify-between items-center" >
            <div><div class="fw-500" >31 January ${taxSummary.tax.taxYear.endYear + 1}</div><div class="fs-12 text-tertiary" >${formatted.weeksLeft} weeks away</div></div>
            <div class="fs-18 fw-700 text-danger" >${formatted.jan31}</div>
          </div>
          <div class="progress-bar"><div class="fill danger" style="width:${Math.min(100,(52-taxSummary.tax.weeksToJan31)/52*100)}%"></div></div>
          <div class="flex justify-between items-center top-divider-8" >
            <div><div class="fw-500" >31 July ${taxSummary.tax.taxYear.endYear + 1}</div><div class="fs-12 text-tertiary" >Payment on account</div></div>
            <div class="fs-16 fw-600 text-secondary" >${formatted.jul31}</div>
          </div>
        </div>
      </div>

      ${taxSummary.profit > 0 ? `
      <div class="card card-page-gap bg-success-light" >
        <div class="flex items-center gap-12" >
          <span class="material-symbols-rounded text-success fs-28" >savings</span>
          <div class="flex-1" >
            <div class="fw-600 text-success" >Save ${formatted.weeklySave} this week</div>
            <div class="fs-13 text-secondary" >To cover your January tax bill</div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="MoneyFeature.markSaved()">Saved ✓</button>
        </div>
      </div>
      ` : ''}
      ` : `<div class="card card-empty-center" >
        <span class="material-symbols-rounded fs-32 text-tertiary" >receipt_long</span>
        <div class="fw-600 mt-sm" >No tax estimate yet</div>
        <div class="text-tertiary fs-13 mt-xs" >Log one of these to get started - your estimate builds automatically from there</div>
        <div class="flex flex-col gap-sm mt-md" >
          <button class="btn btn-outline btn-sm btn-block" onclick="App.navigate('appointments')"><span class="material-symbols-rounded">event_available</span>Record a visit outcome</button>
          <button class="btn btn-outline btn-sm btn-block" onclick="MoneyFeature.openExpenseModal()"><span class="material-symbols-rounded">receipt</span>Log an expense</button>
          <button class="btn btn-outline btn-sm btn-block" onclick="MoneyFeature.openMileageModal()"><span class="material-symbols-rounded">route</span>Log mileage</button>
        </div>
      </div>`}

      <div class="px-md mt-md" >
        <div class="divider-text">This Month</div>
        <div class="stats-grid">
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View this month's records" onclick="MoneyFeature.openRecordsModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();MoneyFeature.openRecordsModal();}"><div class="value">${Utils.formatDistance(monthMiles)}</div><div class="label">Mileage</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View this month's records" onclick="MoneyFeature.openRecordsModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();MoneyFeature.openRecordsModal();}"><div class="value">${expenses.length}</div><div class="label">Expenses Logged</div></div>
          <div class="stat-card stat-card-clickable" role="button" tabindex="0" aria-label="View this month's records" onclick="MoneyFeature.openRecordsModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();MoneyFeature.openRecordsModal();}"><div class="value">${trips.length}</div><div class="label">Trips Logged</div></div>
          <div class="stat-card ${formatted ? 'stat-card-clickable' : ''}" ${formatted ? `role="button" tabindex="0" aria-label="View tax estimate" onclick="MoneyFeature.scrollToTaxEstimate()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();MoneyFeature.scrollToTaxEstimate();}"` : ''}><div class="value">${formatted ? formatted.effectiveRate : '—'}</div><div class="label">Effective Tax</div></div>
        </div>
      </div>

      <div class="p-md" >
        <div class="divider-text">Quick Actions</div>
        <div class="grid-2 gap-12" >
          <button class="btn btn-outline btn-sm" onclick="MoneyFeature.openExpenseModal()"><span class="material-symbols-rounded">receipt</span>Log Expense</button>
          <button class="btn btn-outline btn-sm" onclick="MoneyFeature.openMileageModal()"><span class="material-symbols-rounded">route</span>Log Mileage</button>
          <button class="btn btn-outline btn-sm" onclick="MoneyFeature.openRecordsModal()"><span class="material-symbols-rounded">list</span>View Records</button>
          <button class="btn btn-outline btn-sm" onclick="ExportService.exportBackup()"><span class="material-symbols-rounded">backup</span>Backup Data</button>
        </div>
      </div>
    </div>`;
  },

  async getWeekEarnings() {
    const start = Utils.getStartOfWeek();
    const end = Utils.getEndOfWeek();
    const stats = await DB.getWeekStats(start.toISOString(), end.toISOString());
    return stats.earnings;
  },

  markSaved() { Toast.show('Marked as saved for this week', 'success'); },

  scrollToTaxEstimate() {
    document.getElementById('tax-estimate-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // Lists this month's expenses and trips in a sheet so the advisor can see
  // the individual entries behind the month totals — not just the aggregate.
  async openRecordsModal() {
    const now = new Date();
    const monthStart = Utils.getStartOfMonth(now);
    let expenses = [];
    let trips = [];
    try {
      expenses = await DB.getExpensesForPeriod(monthStart.toISOString(), now.toISOString());
    } catch (e) {}
    try {
      trips = await DB.getTripsForPeriod(monthStart.toISOString(), now.toISOString());
    } catch (e) {}

    const renderExpense = e => {
      const cat = CONFIG.expenseCategories.find(c => c.id === e.category);
      return `
        <div class="area-customer-row" onclick="MoneyFeature.openEditExpenseModal(${e.id})">
          <span class="material-symbols-rounded">${cat?.icon || 'receipt'}</span>
          <span>
            <strong>${Utils.formatCurrency(e.amount)} · ${Utils.escapeHtml(cat?.name || e.category || 'Expense')}</strong>
            <small>${Utils.formatDate(e.date, 'short')} · ${Utils.escapeHtml(e.description || '')}</small>
          </span>
          <span class="material-symbols-rounded">chevron_right</span>
        </div>
      `;
    };
    const renderTrip = t => {
      const dist = CONFIG.distanceUnit === 'miles' ? (t.distanceKm || 0) * 0.621371 : (t.distanceKm || 0);
      return `
        <div class="area-customer-row" onclick="MoneyFeature.openEditTripModal(${t.id})">
          <span class="material-symbols-rounded">route</span>
          <span>
            <strong>${dist.toFixed(1)} ${CONFIG.distanceUnit} · ${Utils.escapeHtml(t.startLocation || '')} → ${Utils.escapeHtml(t.endLocation || '')}</strong>
            <small>${Utils.formatDate(t.date, 'short')}${t.autoTracked ? ' · auto-tracked' : ''}</small>
          </span>
          <span class="material-symbols-rounded">chevron_right</span>
        </div>
      `;
    };

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>This Month's Records</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fw-700 mb-sm" >Trips (${trips.length})</div>
        ${trips.length ? trips.map(renderTrip).join('') : `<div class="fs-13 text-secondary mb-md" >No trips logged this month.</div>`}
        <div class="fw-700 mt-md mb-sm" >Expenses (${expenses.length})</div>
        ${expenses.length ? expenses.map(renderExpense).join('') : `<div class="fs-13 text-secondary" >No expenses logged this month.</div>`}
      </div>
    `;
    App.openModal(content);
  },
  async viewReceipt(expenseId) {
    let expense = null;
    try { expense = await DB.db.expenses.get(expenseId); } catch (e) {}
    if (!expense?.photo) { Toast.show('No receipt photo found', 'error'); return; }
    App.openModal(`
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Receipt</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <img class="max-w-full br-8" src="${expense.photo}" >
      </div>
    `);
  },

  async openEditExpenseModal(expenseId) {
    const expense = await DB.db.expenses.get(expenseId);
    if (!expense) { Toast.show('Expense not found', 'error'); return; }
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Edit Expense</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label>Amount (&pound;)</label>
          <input type="number" class="input" inputmode="decimal" id="edit-expense-amount" placeholder="0.00" step="0.01" min="0" value="${expense.amount || ''}">
        </div>
        <div class="form-group">
          <label>Category</label>
          <select class="select" id="edit-expense-category">
            ${CONFIG.expenseCategories.map(c => `<option value="${c.id}" ${c.id === expense.category ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" class="input" id="edit-expense-description" placeholder="What was this for?" value="${Utils.escapeHtml(expense.description || '')}">
        </div>
        ${expense.photo ? `
          <div class="form-group">
            <label>Receipt</label>
            <img class="max-w-full br-8" src="${expense.photo}" >
          </div>
        ` : ''}
        <button class="btn btn-primary btn-block" onclick="MoneyFeature.saveEditExpense(${expenseId})">
          Save Changes
        </button>
        <button class="btn btn-danger btn-block mt-sm"  onclick="MoneyFeature.confirmDeleteExpense(${expenseId})">
          <span class="material-symbols-rounded">delete</span> Delete Expense
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveEditExpense(expenseId) {
    const amount = parseFloat(document.getElementById('edit-expense-amount')?.value);
    const category = document.getElementById('edit-expense-category')?.value;
    const description = document.getElementById('edit-expense-description')?.value.trim() || '';

    if (!amount || amount <= 0) {
      Toast.show('Please enter a valid amount', 'error');
      return;
    }

    try {
      await DB.db.expenses.update(expenseId, { amount, category, description: description || category });
      App.closeModal();
      Toast.show('Expense updated', 'success');
      App.navigate('money');
    } catch (e) {
      console.error('Save expense error:', e);
      Toast.show('Failed to save changes', 'error');
    }
  },

  confirmDeleteExpense(expenseId) {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Delete Expense</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          This can't be undone.
        </div>
        <button class="btn btn-danger btn-block" onclick="MoneyFeature.deleteExpense(${expenseId})">
          Delete Expense
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async deleteExpense(expenseId) {
    try {
      await DB.db.expenses.delete(expenseId);
      App.closeModal();
      Toast.show('Expense deleted', 'success');
      App.navigate('money');
    } catch (e) {
      console.error('Delete expense error:', e);
      Toast.show('Failed to delete expense', 'error');
    }
  },

  async openEditTripModal(tripId) {
    const trip = await DB.db.trips.get(tripId);
    if (!trip) { Toast.show('Trip not found', 'error'); return; }
    const dist = CONFIG.distanceUnit === 'miles' ? (trip.distanceKm || 0) * 0.621371 : (trip.distanceKm || 0);
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Edit Trip</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label>From</label>
          <input type="text" class="input" id="edit-trip-from" placeholder="Start location" value="${Utils.escapeHtml(trip.startLocation || '')}">
        </div>
        <div class="form-group">
          <label>To</label>
          <input type="text" class="input" id="edit-trip-to" placeholder="Destination" value="${Utils.escapeHtml(trip.endLocation || '')}">
        </div>
        <div class="form-group">
          <label>Distance (${CONFIG.distanceUnit})</label>
          <input type="number" class="input" inputmode="decimal" id="edit-trip-distance" step="0.1" min="0" value="${dist.toFixed(1)}">
        </div>
        <button class="btn btn-primary btn-block" onclick="MoneyFeature.saveEditTrip(${tripId})">
          Save Changes
        </button>
        <button class="btn btn-danger btn-block mt-sm"  onclick="MoneyFeature.confirmDeleteTrip(${tripId})">
          <span class="material-symbols-rounded">delete</span> Delete Trip
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async saveEditTrip(tripId) {
    const from = document.getElementById('edit-trip-from')?.value.trim() || '';
    const to = document.getElementById('edit-trip-to')?.value.trim() || '';
    const distance = parseFloat(document.getElementById('edit-trip-distance')?.value);

    if (!distance || distance <= 0) {
      Toast.show('Please enter a valid distance', 'error');
      return;
    }

    try {
      await DB.db.trips.update(tripId, {
        startLocation: from || 'Home',
        endLocation: to || 'Unknown',
        distanceKm: CONFIG.distanceUnit === 'miles' ? distance * 1.60934 : distance
      });
      App.closeModal();
      Toast.show('Trip updated', 'success');
      App.navigate('money');
    } catch (e) {
      console.error('Save trip error:', e);
      Toast.show('Failed to save changes', 'error');
    }
  },

  confirmDeleteTrip(tripId) {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Delete Trip</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          This can't be undone.
        </div>
        <button class="btn btn-danger btn-block" onclick="MoneyFeature.deleteTrip(${tripId})">
          Delete Trip
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async deleteTrip(tripId) {
    try {
      await DB.db.trips.delete(tripId);
      App.closeModal();
      Toast.show('Trip deleted', 'success');
      App.navigate('money');
    } catch (e) {
      console.error('Delete trip error:', e);
      Toast.show('Failed to delete trip', 'error');
    }
  },

  activate() {},

  openExpenseModal() {
    this.expensePhotoData = null;
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Quick Expense</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label>Amount (&pound;)</label>
          <input type="number" class="input" inputmode="decimal" id="expense-amount" placeholder="0.00" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label>Category</label>
          <select class="select" id="expense-category">
            ${CONFIG.expenseCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" class="input" id="expense-description" placeholder="What was this for?">
        </div>
        <div class="form-group">
          <label>Receipt</label>
          <button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('expense-photo').click()">
            <span class="material-symbols-rounded">photo_camera</span>
            Take Photo
          </button>
          <input type="file" id="expense-photo" accept="image/*" capture="environment" style="display:none;" onchange="MoneyFeature.handleExpensePhoto(event)">
          <div class="mt-sm" id="expense-photo-preview" ></div>
        </div>
        <button class="btn btn-primary btn-block" onclick="MoneyFeature.saveExpense()">
          Save Expense
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async handleExpensePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const base64 = await Utils.fileToBase64(file);
    this.expensePhotoData = base64;
    document.getElementById('expense-photo-preview').innerHTML = `<img class="max-w-full br-8" src="${base64}" >`;
  },

  async saveExpense() {
    const amountEl = document.getElementById('expense-amount');
    const categoryEl = document.getElementById('expense-category');
    const descEl = document.getElementById('expense-description');

    if (!amountEl || !categoryEl) {
      Toast.show('Form not ready', 'error');
      return;
    }

    const amount = parseFloat(amountEl.value);
    const category = categoryEl.value;
    const description = descEl ? descEl.value : '';

    if (!amount || amount <= 0) {
      Toast.show('Please enter a valid amount', 'error');
      return;
    }

    try {
      await DB.addExpense({
        date: new Date().toISOString(),
        amount,
        category,
        description: description || category,
        photo: this.expensePhotoData || null
      });
      this.expensePhotoData = null;
      App.closeModal();
      Toast.show('Expense logged', 'success');
      App.navigate('money');
    } catch (e) {
      Toast.show('Failed to save expense', 'error');
    }
  },

  openMileageModal() {
    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Log Mileage</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <button class="btn btn-primary btn-block mb-md" onclick="MoneyFeature.startLiveTrip()" >
          <span class="material-symbols-rounded">directions_car</span>
          Start Live Trip
        </button>
        <div class="hint mt-neg-10 mb-md" >Uses GPS + real road distance. Add a destination and it checks for arrival whenever you reopen the app (handy if you navigate elsewhere in the meantime) — or leave it blank and tap Finish yourself.</div>
        <div class="form-group">
          <label>From</label>
          <input type="text" class="input" id="trip-from" placeholder="Start location">
        </div>
        <div class="form-group">
          <label>To</label>
          <input type="text" class="input" id="trip-to" placeholder="Destination">
        </div>
        <div class="divider-text">or enter manually</div>
        <div class="form-group">
          <label>Distance (${CONFIG.distanceUnit})</label>
          <input type="number" class="input" inputmode="decimal" id="trip-distance" placeholder="0.0" step="0.1" min="0">
        </div>
        <button class="btn btn-outline btn-block" onclick="MoneyFeature.saveTrip()">
          Log Trip
        </button>
      </div>
    `;
    App.openModal(content);
  },

  async startLiveTrip() {
    const toEl = document.getElementById('trip-to');
    const destinationAddress = toEl ? toEl.value.trim() : '';
    App.closeModal();
    await Geo.startTrip({ destinationAddress });
  },

  async saveTrip() {
    const fromEl = document.getElementById('trip-from');
    const toEl = document.getElementById('trip-to');
    const distEl = document.getElementById('trip-distance');

    if (!distEl) {
      Toast.show('Form not ready', 'error');
      return;
    }

    const from = fromEl ? fromEl.value : '';
    const to = toEl ? toEl.value : '';
    const distance = parseFloat(distEl.value);

    if (!distance || distance <= 0) {
      Toast.show('Please enter a valid distance', 'error');
      return;
    }

    try {
      await DB.addTrip({
        date: new Date().toISOString(),
        startLocation: from || 'Home',
        endLocation: to || 'Unknown',
        distanceKm: CONFIG.distanceUnit === 'miles' ? distance * 1.60934 : distance,
        purpose: 'business'
      });
      App.closeModal();
      Toast.show('Trip logged', 'success');
      App.navigate('money');
    } catch (e) {
      Toast.show('Failed to save trip', 'error');
    }
  }
};

App.registerFeature(MoneyFeature);
