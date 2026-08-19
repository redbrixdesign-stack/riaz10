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
    // The Week segment must show WEEK figures and the Month segment month
    // figures - both previously read the month window, so "This Week" showed
    // this month's expenses and mileage claim (misleading at month start and
    // at every 5-second glance in between).
    const weekStart = Utils.getStartOfWeek();
    const weekEnd = Utils.getEndOfWeek();
    let expenses = [];
    let trips = [];
    let weekExpenses = [];
    let weekTrips = [];

    try {
      expenses = await DB.getExpensesForPeriod(monthStart.toISOString(), now.toISOString());
    } catch (e) {}

    try {
      trips = await DB.getTripsForPeriod(monthStart.toISOString(), now.toISOString());
    } catch (e) {}

    try {
      weekExpenses = await DB.getExpensesForPeriod(weekStart.toISOString(), weekEnd.toISOString());
    } catch (e) {}

    try {
      weekTrips = await DB.getTripsForPeriod(weekStart.toISOString(), weekEnd.toISOString());
    } catch (e) {}

    const monthTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const monthMiles = trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    const weekTotal = weekExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const weekMiles = weekTrips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    const mileageClaim = TaxCalculator.calculateMileageClaim(weekMiles);
    const weekRecordCount = weekExpenses.length + weekTrips.length;
    const weekEarnings = await this.getWeekEarnings();
    const target = CONFIG.weeklyTarget || 600;
    const targetGap = Math.max(0, target - weekEarnings);
    const recordCount = expenses.length + trips.length;
    const progressPct = target > 0 ? Math.min(100, Math.round((weekEarnings / target) * 100)) : 0;

    return `<div class="fade-in">
      ${App.renderTopHeader({ 
        title: 'Money', 
        actions: '<button class="btn btn-sm btn-ghost" aria-label="Invoices and payments" data-action="App.navigate" data-args=\'["invoices"]\'><span class="material-symbols-rounded">receipt_long</span></button><button class="btn btn-sm btn-ghost" aria-label="Download tax summary" data-action="ExportService.exportTaxSummary"><span class="material-symbols-rounded">download</span></button>'
      })}
      <div class="p-md pb-0" >
        <!-- HERO: This Week Earnings -->
        <div class="card" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none;">
          <div class="fs-13 op-90" >This Week · Earnings (commission)</div>
          <div class="fs-40 fw-700 mt-4" >${Utils.formatCurrency(weekEarnings)}</div>
          <div class="fs-16 op-90 mt-2" >
            ${targetGap > 0 
              ? `${Utils.formatCurrency(targetGap)} to target`
              : 'Target reached'}
          </div>
          <div class="progress-bar mt-10" style="background: rgba(255,255,255,0.15);">
            <div class="fill" style="width:${progressPct}%;background:var(--accent);"></div>
          </div>
          <div class="fs-11 op-70 mt-4" >${progressPct}% of £${target} target</div>
        </div>

        <!-- What needs attention -->
        ${targetGap > 0 ? `
        <div class="card card-page-mb" style="border-left: 3px solid var(--accent);">
          <div class="flex items-center justify-between gap-12">
            <div>
              <div class="fw-600" >Earnings gap</div>
              <div class="fs-13 text-tertiary" >£${targetGap} to hit your £${target} weekly target</div>
            </div>
            <span class="badge" style="background: var(--accent); color: var(--accent-contrast);">${Utils.formatCurrency(targetGap)}</span>
          </div>
        </div>
        ` : ''}

        <!-- Tax & Deadlines (progressive disclosure) -->
        ${formatted ? `
        <details class="card card-page-mb" id="tax-section" open="${formatted.profit > 0 ? 'true' : 'false'}">
          <summary class="flex items-center justify-between gap-12 cursor-pointer" style="list-style: none;">
            <div>
              <div class="fw-600" >Tax & deadlines</div>
              <div class="fs-12 text-tertiary" >Tax year ${taxSummary.tax.taxYear.label} · ${formatted.weeksLeft} weeks to 31 Jan</div>
            </div>
            <span class="material-symbols-rounded text-tertiary" style="transition: transform 0.2s;">expand_more</span>
          </summary>
          <div class="mt-12 grid-2 gap-12" style="padding-top: 12px; border-top: 1px solid var(--border-light);">
            <div><div class="fs-12 text-tertiary" >Profit</div><div class="fs-20 fw-700" >${formatted.profit}</div></div>
            <div><div class="fs-12 text-tertiary" >Tax due</div><div class="fs-20 fw-700 text-danger" >${formatted.taxDue}</div></div>
            <div><div class="fs-12 text-tertiary" >Income tax</div><div class="fw-600" >${formatted.incomeTax}</div></div>
            <div><div class="fs-12 text-tertiary" >Class 4 NIC</div><div class="fw-600" >${formatted.class4NIC}</div></div>
          </div>
          <div class="mt-12 flex flex-col gap-10" style="padding-top: 12px; border-top: 1px solid var(--border-light);">
            <div class="flex justify-between items-center">
              <div><div class="fw-500" >31 January ${taxSummary.tax.taxYear.endYear + 1}</div><div class="fs-12 text-tertiary" >${formatted.weeksLeft} weeks away</div></div>
              <div class="fs-18 fw-700 text-danger" >${formatted.jan31}</div>
            </div>
            <div class="progress-bar" style="height: 6px;"><div class="fill danger" style="width:${Math.min(100, Math.round((52 - taxSummary.tax.weeksToJan31) / 52 * 100))}%"></div></div>
            <div class="flex justify-between items-center top-divider-8">
              <div><div class="fw-500" >31 July ${taxSummary.tax.taxYear.endYear + 1}</div><div class="fs-12 text-tertiary" >Payment on account</div></div>
              <div class="fs-16 fw-600 text-secondary" >${formatted.jul31}</div>
            </div>
          </div>
          ${taxSummary.profit > 0 ? `
          <div class="mt-12 p-12 bg-success-light" style="border-radius: var(--radius-sm);">
            <div class="flex items-center gap-12">
              <span class="material-symbols-rounded text-success fs-24">savings</span>
              <div class="flex-1">
                <div class="fw-600 text-success">Save ${formatted.weeklySave} this week</div>
                <div class="fs-13 text-secondary">To cover your January tax bill</div>
              </div>
              <button class="btn btn-sm btn-secondary" data-action="MoneyFeature.markSaved">Saved ✓</button>
            </div>
          </div>
          ` : ''}
        </details>
        ` : `<details class="card card-page-mb">
          <summary class="flex items-center justify-between gap-12 cursor-pointer" style="list-style: none;">
            <div>
              <div class="fw-600">Tax & deadlines</div>
              <div class="fs-12 text-tertiary">No estimate yet — log a visit, expense or mileage</div>
            </div>
            <span class="material-symbols-rounded text-tertiary">expand_more</span>
          </summary>
          <div class="mt-12 flex flex-col gap-sm" style="padding-top: 12px; border-top: 1px solid var(--border-light);">
            <button class="btn btn-outline btn-sm btn-block" data-action="App.navigate" data-args='${JSON.stringify(["appointments"])}'><span class="material-symbols-rounded">event_available</span>Record a visit outcome</button>
            <button class="btn btn-outline btn-sm btn-block" data-action="MoneyFeature.openExpenseModal"><span class="material-symbols-rounded">receipt</span>Log an expense</button>
            <button class="btn btn-outline btn-sm btn-block" data-action="MoneyFeature.openMileageModal"><span class="material-symbols-rounded">route</span>Log mileage</button>
          </div>
        </details>`}

        <!-- This Week | This Month segmented control -->
        <div class="segmented mt-md" id="money-period">
          <button class="segment active" data-period="week" data-action="MoneyFeature.switchPeriod" data-args='${JSON.stringify(["week"])}'>This Week</button>
          <button class="segment" data-period="month" data-action="MoneyFeature.switchPeriod" data-args='${JSON.stringify(["month"])}'>This Month</button>
        </div>

        <!-- This Week details (shown by default) -->
        <div id="money-week" class="mt-md">
          <div class="stats-grid">
            <div class="stat-card" data-action="MoneyFeature.openRecordsModal"><div class="value">${Utils.formatCurrency(mileageClaim)}</div><div class="label">Mileage claim</div></div>
            <div class="stat-card" data-action="MoneyFeature.openRecordsModal"><div class="value">${Utils.formatCurrency(weekTotal)}</div><div class="label">Expenses</div></div>
            <div class="stat-card" data-action="MoneyFeature.openRecordsModal"><div class="value">${weekRecordCount || '—'}</div><div class="label">Records</div></div>
          </div>
        </div>

        <!-- This Month details (hidden by default) -->
        <div id="money-month" class="mt-md" hidden>
          <div class="stats-grid">
            <div class="stat-card" data-action="MoneyFeature.openRecordsModal"><div class="value">${Utils.formatDistance(monthMiles)}</div><div class="label">Mileage</div></div>
            <div class="stat-card" data-action="MoneyFeature.openRecordsModal"><div class="value">${expenses.length}</div><div class="label">Expenses logged</div></div>
            <div class="stat-card" data-action="MoneyFeature.openRecordsModal"><div class="value">${trips.length}</div><div class="label">Trips logged</div></div>
            <div class="stat-card"><div class="value">${formatted ? formatted.effectiveRate : '—'}</div><div class="label">Effective tax</div></div>
          </div>
        </div>

        <!-- Quick Actions - one primary -->
        <div class="p-md mt-md" >
          <div class="grid-2 gap-12" >
            <button class="btn btn-primary btn-sm" data-action="MoneyFeature.openExpenseModal"><span class="material-symbols-rounded">receipt</span>Log Expense</button>
            <button class="btn btn-outline btn-sm" data-action="MoneyFeature.openMileageModal"><span class="material-symbols-rounded">route</span>Log Mileage</button>
            <button class="btn btn-outline btn-sm" data-action="MoneyFeature.openRecordsModal"><span class="material-symbols-rounded">list</span>View Records</button>
            <button class="btn btn-outline btn-sm" data-action="ExportService.exportBackup"><span class="material-symbols-rounded">backup</span>Backup Data</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  switchPeriod(period) {
    document.querySelectorAll('#money-period .segment').forEach(el => {
      el.classList.toggle('active', el.dataset.period === period);
    });
    document.getElementById('money-week').hidden = period !== 'week';
    document.getElementById('money-month').hidden = period !== 'month';
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
        <div class="area-customer-row" data-action="MoneyFeature.openEditExpenseModal" data-args='${JSON.stringify([(e.id)])}'>
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
        <div class="area-customer-row" data-action="MoneyFeature.openEditTripModal" data-args='${JSON.stringify([(t.id)])}'>
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
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
        <button class="btn btn-primary btn-block" data-action="MoneyFeature.saveEditExpense" data-args='${JSON.stringify([(expenseId)])}'>
          Save Changes
        </button>
        <button class="btn btn-danger btn-block mt-sm"  data-action="MoneyFeature.confirmDeleteExpense" data-args='${JSON.stringify([(expenseId)])}'>
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          This can't be undone.
        </div>
        <button class="btn btn-danger btn-block" data-action="MoneyFeature.deleteExpense" data-args='${JSON.stringify([(expenseId)])}'>
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
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
        <button class="btn btn-primary btn-block" data-action="MoneyFeature.saveEditTrip" data-args='${JSON.stringify([(tripId)])}'>
          Save Changes
        </button>
        <button class="btn btn-danger btn-block mt-sm"  data-action="MoneyFeature.confirmDeleteTrip" data-args='${JSON.stringify([(tripId)])}'>
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="fs-14 text-secondary lh-150 mb-14" >
          This can't be undone.
        </div>
        <button class="btn btn-danger btn-block" data-action="MoneyFeature.deleteTrip" data-args='${JSON.stringify([(tripId)])}'>
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
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
          <button class="btn btn-outline btn-sm" type="button" data-file="expense-photo">
            <span class="material-symbols-rounded">photo_camera</span>
            Take Photo
          </button>
          <input type="file" id="expense-photo" accept="image/*" capture="environment" style="display:none;" data-action="MoneyFeature.handleExpensePhoto" data-args='${JSON.stringify(["__event__"])}'>
          <div class="mt-sm" id="expense-photo-preview" ></div>
        </div>
        <button class="btn btn-primary btn-block" data-action="MoneyFeature.saveExpense">
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

    if (!AIService.isEnabled()) return;

    const hintEl = document.getElementById('expense-photo-preview');
    hintEl.innerHTML = `${hintEl.innerHTML}<div class="fs-12 text-tertiary mt-10" >Analysing receipt…</div>`;
    const result = await AIService.extractReceipt(file);

    if (!result.ok || !result.fields) {
      const after = document.getElementById('expense-photo-preview');
      if (after) after.innerHTML = after.innerHTML.replace(/<div class="fs-12 text-tertiary mt-10" >Analysing receipt…<\/div>/, '');
      Toast.show(result.message || 'Could not read the receipt — enter the details manually', 'error');
      return;
    }

    const { amount, vendor, date, description, category } = result.fields;
    const amountEl = document.getElementById('expense-amount');
    const categoryEl = document.getElementById('expense-category');
    const descEl = document.getElementById('expense-description');

    const parsedAmount = parseFloat(String(amount).replace(/[^0-9.]/g, ''));
    if (amountEl && !isNaN(parsedAmount) && parsedAmount > 0) amountEl.value = parsedAmount;

    if (categoryEl) {
      const option = Array.from(categoryEl.options).find(o => o.value === category);
      if (option) categoryEl.value = option.value;
    }

    if (descEl && (description || vendor)) descEl.value = description || vendor;

    const after = document.getElementById('expense-photo-preview');
    if (after) after.innerHTML = after.innerHTML.replace(/<div class="fs-12 text-tertiary mt-10" >Analysing receipt…<\/div>/, '');

    const filled = !isNaN(parsedAmount) && parsedAmount > 0 ? `£${parsedAmount.toFixed(2)} · ${category}` : 'details';
    Toast.show(`Receipt read — ${filled} filled in. Review, then save`, 'success');
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
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <button class="btn btn-primary btn-block mb-md" data-action="MoneyFeature.startLiveTrip" >
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
        <button class="btn btn-outline btn-block" data-action="MoneyFeature.saveTrip">
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
