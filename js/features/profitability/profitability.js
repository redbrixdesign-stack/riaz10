/* Phase 5 profitability — additive, review-first job economics. */
const ProfitabilityFeature = {
  id: 'profitability',
  name: 'Profitability',
  icon: 'monitoring',
  route: false,
  actions: ['openJob', 'openAddCost', 'saveCost', 'openPolicy', 'savePolicy'],

  async render() {
    const policies = await DB.getFinancialPolicies();
    const current = policies[policies.length - 1];
    return `<div class="fade-in">${App.renderTopHeader({ title: 'Profitability settings', showBack: true, backHref: 'control', actions: `<button class="btn btn-primary btn-sm" data-action="ProfitabilityFeature.openPolicy"><span class="material-symbols-rounded">add</span>New policy</button>` })}<div class="p-md"><div class="card mb-md"><div class="fw-600">Effective-dated costing</div><div class="fs-13 text-secondary mt-xs">A new policy applies only from its start date. Historic quotes and jobs keep the policy that applied at the time.</div></div>${current ? `<div class="card"><div class="fw-600">Current: ${Utils.escapeHtml(current.mode.replaceAll('_',' '))}</div><div class="fs-13 text-secondary mt-xs">From ${Utils.formatDate(current.effectiveFrom,'short')} · commission ${current.commissionRate}% · mileage ${Utils.formatCurrency(current.mileageRate)}/mile · labour ${Utils.formatCurrency(current.labourHourlyCost)}/hour</div></div>` : `<div class="empty-state"><span class="material-symbols-rounded">monitoring</span><div>No costing policy yet</div></div>`}</div></div>`;
  },

  openPolicy() {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>New financial policy</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><div class="form-group"><label for="policy-mode">Business mode</label><select class="select" id="policy-mode"><option value="sole_trader">Sole trader</option><option value="commission_advisor">Commission advisor</option><option value="hybrid">Hybrid</option></select></div><div class="form-group"><label for="policy-date">Effective from</label><input class="input" id="policy-date" type="date" value="${Utils.formatDate(tomorrow,'iso')}"></div><div class="form-row"><div class="form-group"><label for="policy-commission">Commission %</label><input class="input" id="policy-commission" type="number" min="0" max="100" step="0.01" value="0"></div><div class="form-group"><label for="policy-fee">Payment fee %</label><input class="input" id="policy-fee" type="number" min="0" max="100" step="0.01" value="0"></div></div><div class="form-row"><div class="form-group"><label for="policy-mileage">Mileage per mile</label><input class="input" id="policy-mileage" type="number" min="0" step="0.01" value="${CONFIG.mileageRate || 0}"></div><div class="form-group"><label for="policy-labour">Labour per hour</label><input class="input" id="policy-labour" type="number" min="0" step="0.01" value="${CONFIG.minHourlyRate || 0}"></div></div><button class="btn btn-primary btn-block" data-action="ProfitabilityFeature.savePolicy">Start policy</button></div>`);
  },

  async savePolicy() {
    try {
      await DB.createFinancialPolicy({ mode: document.getElementById('policy-mode')?.value, effectiveFrom: new Date(`${document.getElementById('policy-date')?.value}T00:00:00`).toISOString(), commissionRate: document.getElementById('policy-commission')?.value, paymentFeeRate: document.getElementById('policy-fee')?.value, mileageRate: document.getElementById('policy-mileage')?.value, labourHourlyCost: document.getElementById('policy-labour')?.value });
      App.closeModal(); Toast.show('New policy started; history is unchanged', 'success'); App.navigate('profitability');
    } catch (e) { Toast.show(e.message || 'Could not save policy', 'error'); }
  },

  async openJob(jobId) {
    const job = await DB.getJob(jobId);
    if (!job) return Toast.show('Job not found', 'error');
    const costs = await DB.getJobCosts({ jobId });
    const metrics = await DB.calculateJobProfitability(jobId, this.estimatedHours(job));
    const rows = costs.length ? costs.map(cost => `<div class="list-row"><span><strong>${Utils.escapeHtml(cost.category.replace('_', ' '))}</strong><small>${Utils.escapeHtml(cost.description || Utils.formatDate(cost.incurredAt, 'short'))}</small></span><strong>${Utils.formatCurrency(cost.amount)}</strong></div>`).join('') : '<p class="hint">No actual job costs logged yet.</p>';
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Job profitability</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><div class="stats-grid"><div class="stat-card"><div class="value">${Utils.formatCurrency(metrics.revenue)}</div><div class="label">Revenue</div></div><div class="stat-card"><div class="value">${Utils.formatCurrency(metrics.directCost)}</div><div class="label">Direct cost</div></div><div class="stat-card"><div class="value">${Utils.formatCurrency(metrics.grossProfit)}</div><div class="label">Gross profit</div></div><div class="stat-card"><div class="value">${metrics.marginPercent.toFixed(2)}%</div><div class="label">Margin</div></div><div class="stat-card"><div class="value">${metrics.effectiveHourlyValue == null ? '—' : Utils.formatCurrency(metrics.effectiveHourlyValue)}</div><div class="label">Profit per hour</div></div></div><p class="hint">${metrics.financialMode ? Utils.escapeHtml(metrics.financialMode.replace('_', ' ')) : 'No dated financial policy'} · ${Utils.escapeHtml(metrics.basis.replaceAll('_', ' '))}. Payments remain in the separate ledger.</p><h4 class="mt-md">Actual direct costs</h4>${rows}<button class="btn btn-primary btn-block mt-md" data-action="ProfitabilityFeature.openAddCost" data-args='${JSON.stringify([job.id, job.orderId])}'>Log direct cost</button></div>`);
  },

  estimatedHours(job) {
    const start = new Date(job.scheduledStart), end = new Date(job.scheduledEnd);
    return !isNaN(start) && !isNaN(end) && end > start ? (end - start) / 3600000 : 0;
  },

  openAddCost(jobId, orderId) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Log direct cost</h3></div><div class="sheet-body"><div class="form-group"><label for="job-cost-category">Category</label><select class="select" id="job-cost-category"><option value="materials">Materials</option><option value="subcontractor">Subcontractor</option><option value="travel">Travel allocation</option><option value="payment_fee">Payment fee</option><option value="labour">Labour</option><option value="other">Other</option></select></div><div class="form-group"><label for="job-cost-amount">Amount (£)</label><input class="input" id="job-cost-amount" type="number" inputmode="decimal" min="0.01" step="0.01"></div><div class="form-group"><label for="job-cost-description">Description</label><input class="input" id="job-cost-description"></div><button class="btn btn-primary btn-block" data-action="ProfitabilityFeature.saveCost" data-args='${JSON.stringify([jobId, orderId])}'>Save cost</button><button class="btn btn-outline btn-block mt-sm" data-action="ProfitabilityFeature.openJob" data-args='${JSON.stringify([jobId])}'>Cancel</button></div>`);
  },

  async saveCost(jobId, orderId) {
    const amount = Number(document.getElementById('job-cost-amount')?.value);
    if (!(amount > 0)) return Toast.show('Enter a positive cost', 'error');
    await DB.addJobCost({ jobId, orderId, category: document.getElementById('job-cost-category')?.value, amount, description: document.getElementById('job-cost-description')?.value.trim() || '', incurredAt: new Date().toISOString(), operationId: `job-cost:${jobId}:${Date.now()}` });
    Toast.show('Cost logged', 'success'); return this.openJob(jobId);
  }
};
App.registerFeature(ProfitabilityFeature);
