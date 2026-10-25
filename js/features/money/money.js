/* ============================================
   ADVISOROS v5.0 — MONEY FEATURE
   Tax, expenses, mileage, savings nudge
   ============================================ */

const MoneyFeature = {
  id: 'money',
  name: 'Money',
  icon: 'account_balance_wallet',
  expensePhotoData: null,

  expenseCustomerId(prefix = '') {
    const value = document.getElementById(prefix + 'expense-customer-id')?.value || '';
    return value === '' ? null : Number(value);
  },
  expenseCustomerPending(prefix = '') {
    return !!document.getElementById(prefix + 'expense-customer-id')?._selectingExpenseCustomer;
  },
  expenseCustomerLabel(customer) {
    const name = customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer';
    return name + (customer.customerNumber ? ' · ' + customer.customerNumber : '');
  },
  expenseContextFields(prefix = '', customerId = null) {
    return `<div class="form-group">
      <label for="${prefix}expense-customer-search">Customer (optional)</label>
      <input type="hidden" id="${prefix}expense-customer-id" value="${Utils.escapeHtml(String(customerId ?? ''))}">
      <div class="hint" id="${prefix}expense-customer-summary" role="status">${customerId == null ? 'General business — not linked to a customer.' : 'Checking linked customer…'}</div>
      <input type="search" class="input" id="${prefix}expense-customer-search" placeholder="Find by name, postcode or customer number" autocomplete="off" data-event="input" data-action="MoneyFeature.searchExpenseCustomers" data-args='${Utils.escapeHtml(JSON.stringify(['__event__', prefix]))}' aria-describedby="${prefix}expense-customer-help">
      <div class="hint" id="${prefix}expense-customer-help">Choose a result to link. Searching alone does not change the link. Leave general costs unlinked.</div>
      <div id="${prefix}expense-customer-results" role="status" aria-live="polite"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="MoneyFeature.clearExpenseCustomer" data-args='${Utils.escapeHtml(JSON.stringify([prefix]))}'>Use General business</button>
    </div>`;
  },
  async loadExpenseCustomer(prefix) {
    const field = document.getElementById(prefix + 'expense-customer-id');
    if (!field?.value) return;
    const selected = field.value;
    try {
      const customer = await DB.getCustomer(Number(selected));
      if (document.getElementById(prefix + 'expense-customer-id') !== field || field.value !== selected) return;
      const summary = document.getElementById(prefix + 'expense-customer-summary');
      if (summary) summary.textContent = customer ? this.expenseCustomerLabel(customer) : 'Linked customer unavailable. Choose another customer or General business before saving.';
    } catch (_) {
      if (document.getElementById(prefix + 'expense-customer-id') === field && field.value === selected) document.getElementById(prefix + 'expense-customer-summary').textContent = 'Could not check linked customer. Search again or choose General business.';
    }
  },
  async searchExpenseCustomers(event, prefix = '') {
    if (this._savingExpense || !['', 'edit-'].includes(prefix)) return;
    const input = document.getElementById(prefix + 'expense-customer-search');
    if (!input || event.target !== input) return;
    const query = input.value.trim();
    const results = document.getElementById(prefix + 'expense-customer-results');
    results.textContent = query.length < 2 ? 'Type at least two characters to find a customer.' : 'Searching customers…';
    if (query.length < 2) return;
    const request = input._expenseSearchRequest = {};
    try {
      const customers = await DB.searchCustomers(query);
      if (document.getElementById(prefix + 'expense-customer-search') !== input || input._expenseSearchRequest !== request || input.value.trim() !== query) return;
      results.innerHTML = customers.length ? customers.map(customer => `<button type="button" class="area-customer-row w-full text-left mb-6" data-action="MoneyFeature.selectExpenseCustomer" data-args='${Utils.escapeHtml(JSON.stringify([customer.id, prefix]))}'><span class="flex-1"><strong>${Utils.escapeHtml(this.expenseCustomerLabel(customer))}</strong><small>${Utils.escapeHtml(customer.address?.postcodeFormatted || customer.address?.postcode || '')}</small></span></button>`).join('') + '<div class="hint">Up to 20 matches. Narrow your search if needed.</div>' : 'No matching customers. Try a name, postcode or customer number.';
    } catch (_) {
      if (document.getElementById(prefix + 'expense-customer-search') === input && input._expenseSearchRequest === request) results.textContent = 'Could not search customers. Try again; the current link has not changed.';
    }
  },
  async selectExpenseCustomer(customerId, prefix = '') {
    if (this._savingExpense || !['', 'edit-'].includes(prefix)) return;
    const field = document.getElementById(prefix + 'expense-customer-id');
    const input = document.getElementById(prefix + 'expense-customer-search');
    if (!field || !input) return;
    const query = input.value;
    const request = field._selectingExpenseCustomer = {};
    try {
      const customer = await DB.getCustomer(customerId);
      if (document.getElementById(prefix + 'expense-customer-id') !== field || input.value !== query || field._selectingExpenseCustomer !== request) return;
      if (!customer) { Toast.show('Customer no longer available. Choose another or General business.', 'warning'); return; }
      field.value = String(customer.id);
      document.getElementById(prefix + 'expense-customer-summary').textContent = this.expenseCustomerLabel(customer);
      input.value = ''; input._expenseSearchRequest = null;
      document.getElementById(prefix + 'expense-customer-results').textContent = '';
    } catch (_) { Toast.show('Could not link customer. Try again; the current link has not changed.', 'error'); }
    finally { if (field._selectingExpenseCustomer === request) field._selectingExpenseCustomer = null; }
  },
  clearExpenseCustomer(prefix = '') {
    if (this._savingExpense || !['', 'edit-'].includes(prefix)) return;
    const field = document.getElementById(prefix + 'expense-customer-id');
    if (!field) return;
    field._selectingExpenseCustomer = null;
    field.value = '';
    document.getElementById(prefix + 'expense-customer-summary').textContent = 'General business — not linked to a customer.';
    const input = document.getElementById(prefix + 'expense-customer-search');
    input.value = ''; input._expenseSearchRequest = null;
    document.getElementById(prefix + 'expense-customer-results').textContent = '';
  },

  // Expense dates are UK calendar days, stored as UK-midnight ISO instants
  // so existing indexed date-period queries keep working without a migration.
  expenseDateInstant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1000 || year > 9999) return null;
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return Utils.ukMidnightInstant(year, month, day).toISOString();
  },
  expenseDateValue(value) {
    const instant = new Date(value);
    return value && Number.isFinite(instant.getTime()) ? Utils.formatDateUK(instant, 'iso') : '';
  },
  applyReceiptDate(value, field, previousValue) {
    if (!field || document.getElementById('expense-date') !== field || field.value !== previousValue) return;
    const valid = this.expenseDateInstant(value);
    // Do not guess dd/mm versus mm/dd, roll impossible dates over, or retain
    // today's default as if it had been read from an older receipt.
    field.value = valid ? value : '';
    const hint = document.getElementById('expense-date-hint');
    if (hint) hint.textContent = valid ? 'Date read from receipt — check it before saving.' : 'Receipt date could not be confirmed. Enter the actual expense date.';
    if (!valid) Toast.show('Check the receipt date and enter the actual expense date.', 'warning');
  },
  async readExpensePhoto(file, field) {
    const request = this._expensePhotoRequest = { field, loading: true };
    try {
      const data = await Utils.fileToBase64(file);
      if (this._expensePhotoRequest !== request || document.getElementById('expense-date') !== field) return null;
      return { data, request };
    } catch (_) {
      if (this._expensePhotoRequest === request) Toast.show('Could not attach receipt. Choose it again before saving.', 'error');
      return null;
    } finally { request.loading = false; }
  },

  render(params = {}) {
    if (params.view === 'expenses') return this.renderExpenseFinder();
    return this.renderAsync();
  },

  expenseFinderRows(rows, customers, filters = {}) {
    const names = new Map(customers.map(customer => [Number(customer.id), this.expenseCustomerLabel(customer)]));
    const q = String(filters.q || '').trim().toLowerCase();
    for (const day of [filters.from, filters.to]) if (day && !this.expenseDateInstant(day)) throw Error('Enter valid start and end dates.');
    if (filters.from && filters.to && filters.from > filters.to) throw Error('End date must be on or after start date.');
    const amount = filters.amount === '' || filters.amount == null ? null : Number(filters.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) throw Error('Enter a valid positive amount.');
    return rows.map(row => ({...row, customerLabel:row.customerId == null ? 'General business' : names.get(Number(row.customerId)) || 'Linked customer unavailable', day:this.expenseDateValue(row.date)}))
      .filter(row => (!filters.from || row.day && row.day >= filters.from) && (!filters.to || row.day && row.day <= filters.to)
        && (amount === null || Math.round(Number(row.amount)*100) === Math.round(amount*100))
        && (!filters.category || row.category === filters.category)
        && (!filters.receipt || (filters.receipt === 'yes' ? row.hasReceipt : !row.hasReceipt))
        && (!filters.context || (filters.context === 'general' ? row.customerId == null : row.customerId != null))
        && (!q || q.split(/\s+/).every(term => `${row.description || ''} ${row.customerLabel} ${row.category || ''}`.toLowerCase().includes(term))))
      .sort((a,b) => (b.day || '').localeCompare(a.day || '') || Number(b.id)-Number(a.id));
  },

  async renderExpenseFinder() {
    const filters = this._expenseFinderFilters || {};
    const escape = value => Utils.escapeHtml(String(value ?? ''));
    let rows = [], error = '';
    try {
      const index = await DB.getExpenseEvidenceIndex();
      const customers = await DB.getCustomersByIds([...new Set(index.map(row=>row.customerId).filter(id=>id != null))]);
      rows = this.expenseFinderRows(index, customers, filters);
    } catch (failure) { error = failure.message?.startsWith('Enter ') || failure.message?.startsWith('End date') ? failure.message : 'Could not load your expense records. Nothing has been deleted. Retry when ready.'; }
    const limit = this._expenseFinderLimit || 50;
    const options = (list, selected) => list.map(([value,label])=>`<option value="${escape(value)}" ${selected === value ? 'selected' : ''}>${escape(label)}</option>`).join('');
    return `<div class="fade-in">${App.renderTopHeader({title:'Receipts & expenses',showBack:true,backHref:'money'})}
      <div class="p-md"><p>Find saved expenses from any date. Records stay on this device; this is not an accounting or filing service.</p>
      <div class="card" id="expense-finder-filters">
        <label for="finder-query">Description or customer</label><input class="input" type="search" id="finder-query" maxlength="200" data-event="keydown" data-key="Enter" data-action="MoneyFeature.applyExpenseFinder" value="${escape(filters.q)}" placeholder="e.g. brackets or customer name">
        <details class="mt-sm" ${['from','to','amount','category','receipt','context'].some(key=>filters[key]) ? 'open' : ''}><summary>Filter by date, amount or receipt</summary>
        <div class="grid-2 gap-12 mt-sm"><div><label for="finder-from">From date</label><input class="input" type="date" id="finder-from" value="${escape(filters.from)}"></div><div><label for="finder-to">To date</label><input class="input" type="date" id="finder-to" value="${escape(filters.to)}"></div></div>
        <label for="finder-amount">Exact amount (£, optional)</label><input class="input" type="number" inputmode="decimal" step="0.01" min="0.01" id="finder-amount" value="${escape(filters.amount)}">
        <label for="finder-category">Category</label><select class="select" id="finder-category">${options([['','All categories'],...CONFIG.expenseCategories.map(cat=>[cat.id,cat.name])],filters.category || '')}</select>
        <label for="finder-receipt">Receipt</label><select class="select" id="finder-receipt">${options([['','With or without receipt'],['yes','Receipt attached'],['no','No receipt attached']],filters.receipt || '')}</select>
        <label for="finder-context">Customer link</label><select class="select" id="finder-context">${options([['','All expenses'],['general','General business'],['linked','Customer-linked']],filters.context || '')}</select>
        </details>
        <div class="grid-2 gap-12 mt-sm"><button class="btn btn-primary" data-action="MoneyFeature.applyExpenseFinder">Find records</button><button class="btn btn-outline" data-action="MoneyFeature.clearExpenseFinder">Clear filters</button></div>
      </div>
      <section id="expense-finder-results" aria-live="polite">${error ? `<p role="alert">${escape(error)}</p><button class="btn btn-outline" data-action="MoneyFeature.retryExpenseFinder">Retry</button>` : `<p>${rows.length} matching expense${rows.length === 1 ? '' : 's'} · showing ${Math.min(limit,rows.length)} · newest first</p>${!rows.length ? '<p>No matching expenses. Try clearing filters, or log an expense from Money.</p>' : rows.slice(0,limit).map(row=>`<button type="button" class="area-customer-row w-full text-left mb-sm" data-action="MoneyFeature.openEditExpenseModal" data-args='${JSON.stringify([row.id,true])}'><span aria-hidden="true" class="material-symbols-rounded">receipt_long</span><span class="flex-1"><strong>${row.amount != null && row.amount !== '' && Number.isFinite(Number(row.amount)) ? escape(Utils.formatCurrency(Number(row.amount))) : 'Amount unavailable'} · ${escape(row.description || row.category || 'Expense')}</strong><small>${escape(row.day || 'Date unavailable')} · ${row.hasReceipt ? 'Receipt attached' : 'No receipt attached'}</small><small>${escape(row.customerLabel)}</small></span><span aria-hidden="true" class="material-symbols-rounded">chevron_right</span></button>`).join('')}${rows.length > limit ? '<button class="btn btn-outline btn-block" data-action="MoneyFeature.moreExpenseFinder">Show 50 more</button>' : ''}`}</section></div></div>`;
  },

  applyExpenseFinder() {
    if (!document.getElementById('expense-finder-results')) return;
    this._expenseFinderFilters = Object.fromEntries(['q','from','to','amount','category','receipt','context'].map((key,index)=>[key,document.getElementById(['finder-query','finder-from','finder-to','finder-amount','finder-category','finder-receipt','finder-context'][index]).value]));
    this._expenseFinderLimit = 50;
    App.navigate('money',{view:'expenses'});
  },
  clearExpenseFinder() { this._expenseFinderFilters = {};this._expenseFinderLimit=50;App.navigate('money',{view:'expenses'}); },
  retryExpenseFinder() { App.navigate('money',{view:'expenses'}); },
  moreExpenseFinder() { this._expenseFinderLimit=(this._expenseFinderLimit || 50)+50;App.navigate('money',{view:'expenses'}); },

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
          <div class="fs-13 op-90" >This Week · Earnings (commission + visit fees)</div>
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
            <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='["money",{"view":"expenses"}]'><span aria-hidden="true" class="material-symbols-rounded">search</span>Find receipts & expenses</button>
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
            <small>${Utils.formatDate(e.date, 'short')} · ${Utils.escapeHtml(e.description || '')} · ${e.customerId ? 'Customer-linked' : 'General business'}</small>
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
        <img class="max-w-full br-8" src="${Utils.escapeHtml(expense.photo)}" alt="Saved receipt">
      </div>
    `);
  },

  async openEditExpenseModal(expenseId, fromFinder = false) {
    const revision = App._navigationRevision;
    const request = this._expenseEditorRequest = {};
    const origin = fromFinder ? document.getElementById('expense-finder-results') : null;
    const modalBody = document.querySelector?.('#modal-overlay .sheet-body');
    const expense = await DB.db.expenses.get(expenseId);
    if (document.querySelector?.('#modal-overlay .sheet-body') !== modalBody) return;
    if (App._navigationRevision !== revision || this._expenseEditorRequest !== request || (fromFinder && (!origin || document.getElementById('expense-finder-results') !== origin))) return;
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
          <label for="edit-expense-date">Expense date</label>
          <input type="date" class="input" id="edit-expense-date" value="${this.expenseDateValue(expense.date)}" aria-describedby="edit-expense-date-hint" required>
          <div class="hint" id="edit-expense-date-hint">The date the expense happened, not the date you entered it.</div>
        </div>
        ${this.expenseContextFields('edit-', expense.customerId)}
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
            <img class="max-w-full br-8" src="${Utils.escapeHtml(expense.photo)}" alt="Saved receipt">
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
    const editor = document.getElementById('edit-expense-date');
    if (editor) editor._expenseFinderOrigin = fromFinder;
    this.loadExpenseCustomer('edit-');
  },

  async saveEditExpense(expenseId) {
    if (this._savingExpense) return;
    if (this.expenseCustomerPending('edit-')) { Toast.show('Wait for the customer selection to finish, or choose General business.', 'warning'); return; }
    const dateField = document.getElementById('edit-expense-date');
    const selectedDate = dateField?.value;
    const date = this.expenseDateInstant(selectedDate);
    const amount = Number(document.getElementById('edit-expense-amount')?.value);
    const category = document.getElementById('edit-expense-category')?.value;
    const description = document.getElementById('edit-expense-description')?.value.trim() || '';
    const customerId = this.expenseCustomerId('edit-');

    if (!date) { Toast.show('Please enter a valid expense date', 'error'); return; }
    if (!Number.isFinite(amount) || amount <= 0) {
      Toast.show('Please enter a valid amount', 'error');
      return;
    }

    this._savingExpense = true;
    try {
      const expense = await DB.db.expenses.get(expenseId);
      if (!expense) throw new Error('Expense no longer exists');
      // Editing only amount/text must not rewrite a historical timestamp.
      const storedDate = this.expenseDateValue(expense.date) === selectedDate ? expense.date : date;
      const updated = await DB.updateExpense(expenseId, { customerId, date: storedDate, amount, category, description: description || category });
      if (!updated) throw new Error('Expense no longer exists');
      if (document.getElementById('edit-expense-date') !== dateField) return;
      App.closeModal();
      Toast.show('Expense updated', 'success');
      App.navigate('money',dateField._expenseFinderOrigin ? {view:'expenses'} : {});
    } catch (e) {
      console.error('Save expense error:', e);
      Toast.show(e.message?.includes('customer') ? e.message : 'Failed to save changes', 'error');
    } finally { this._savingExpense = false; }
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
    this._expensePhotoRequest = null;
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
          <label for="expense-date">Expense date</label>
          <input type="date" class="input" id="expense-date" value="${Utils.formatDateUK(new Date(), 'iso')}" aria-describedby="expense-date-hint" required>
          <div class="hint" id="expense-date-hint" role="status">Use the actual expense date, including for older receipts.</div>
        </div>
        ${this.expenseContextFields()}
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
    const dateField = document.getElementById('expense-date');
    const previousDate = dateField?.value;
    const loaded = await this.readExpensePhoto(file, dateField);
    if (!loaded) return;
    const { data: base64, request } = loaded;
    this.expensePhotoData = base64;
    document.getElementById('expense-photo-preview').innerHTML = `<img class="max-w-full br-8" src="${base64}" >`;

    if (!AIService.isEnabled()) return;

    const hintEl = document.getElementById('expense-photo-preview');
    hintEl.innerHTML = `${hintEl.innerHTML}<div class="fs-12 text-tertiary mt-10" >Analysing receipt…</div>`;
    const result = await AIService.extractReceipt(file);
    if (this._savingExpense || this._expensePhotoRequest !== request || document.getElementById('expense-date') !== dateField) return;

    if (!result.ok || !result.fields) {
      const after = document.getElementById('expense-photo-preview');
      if (after) after.innerHTML = after.innerHTML.replace(/<div class="fs-12 text-tertiary mt-10" >Analysing receipt…<\/div>/, '');
      Toast.show(result.message || 'Could not read the receipt — enter the details manually', 'error');
      return;
    }

    const { amount, vendor, date, description, category } = result.fields;
    this.applyReceiptDate(date, dateField, previousDate);
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

  async applyQuickCapture(file, fields = {}) {
    const dateField = document.getElementById('expense-date');
    const previousDate = dateField?.value;
    const loaded = await this.readExpensePhoto(file, dateField);
    if (!loaded) return;
    const { data: base64 } = loaded;
    this.expensePhotoData = base64;
    const preview = document.getElementById('expense-photo-preview');
    if (preview) preview.innerHTML = `<img class="max-w-full br-8" src="${base64}" alt="Receipt preview">`;
    const parsedAmount = parseFloat(String(fields.amount || '').replace(/[^0-9.]/g, ''));
    const amountEl = document.getElementById('expense-amount');
    const categoryEl = document.getElementById('expense-category');
    const descEl = document.getElementById('expense-description');
    if (fields.kind === 'expense') this.applyReceiptDate(fields.date, dateField, previousDate);
    if (amountEl && parsedAmount > 0) amountEl.value = parsedAmount;
    if (categoryEl && Array.from(categoryEl.options).some(option => option.value === fields.category)) categoryEl.value = fields.category;
    if (descEl && (fields.description || fields.vendor)) descEl.value = fields.description || fields.vendor;
    Toast.show(fields.kind === 'expense' ? 'Receipt found — review, then save' : 'Receipt attached — add the details, then save', 'success');
  },

  async saveExpense() {
    if (this._savingExpense) return;
    if (this.expenseCustomerPending()) { Toast.show('Wait for the customer selection to finish, or choose General business.', 'warning'); return; }
    const dateField = document.getElementById('expense-date');
    const date = this.expenseDateInstant(dateField?.value);
    if (this._expensePhotoRequest?.field === dateField && this._expensePhotoRequest.loading) {
      Toast.show('Wait for the receipt to attach before saving.', 'warning'); return;
    }
    const amountEl = document.getElementById('expense-amount');
    const categoryEl = document.getElementById('expense-category');
    const descEl = document.getElementById('expense-description');

    if (!amountEl || !categoryEl) {
      Toast.show('Form not ready', 'error');
      return;
    }

    const amount = Number(amountEl.value);
    const category = categoryEl.value;
    const description = descEl ? descEl.value : '';

    if (!date) { Toast.show('Please enter a valid expense date', 'error'); return; }
    if (!Number.isFinite(amount) || amount <= 0) {
      Toast.show('Please enter a valid amount', 'error');
      return;
    }

    this._savingExpense = true;
    try {
      await DB.addExpense({
        customerId: this.expenseCustomerId(),
        date,
        amount,
        category,
        description: description || category,
        photo: this.expensePhotoData || null
      });
      if (document.getElementById('expense-date') !== dateField) return;
      this.expensePhotoData = null;
      App.closeModal();
      Toast.show('Expense logged', 'success');
      App.navigate('money');
    } catch (e) {
      Toast.show(e.message?.includes('customer') ? e.message : 'Failed to save expense', 'error');
    } finally { this._savingExpense = false; }
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
