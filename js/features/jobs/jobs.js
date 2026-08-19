/* ============================================
   BEELO — JOBS
   Operational work created from commercial orders.
   Jobs link fitting/service/return visits while the
   existing diary remains the scheduling authority.
   ============================================ */

const JobsFeature = {
  id: 'jobs',
  name: 'Jobs',
  icon: 'construction',
  route: false,

  STAGES: [
    ['materials_ordered', 'Materials ordered', 'inventory_2'],
    ['materials_received', 'Materials received', 'inventory'],
    ['fitting_scheduled', 'Fitting scheduled', 'event'],
    ['on_site', 'On site', 'home_repair_service'],
    ['blocked', 'Blocked', 'warning'],
    ['return_visit_required', 'Return required', 'assignment_return'],
    ['completed', 'Completed', 'task_alt'],
    ['signed_off', 'Signed off', 'verified']
  ],

  render(params = {}) {
    if (params.id) return this.renderJob(Number(params.id));
    return this.renderList(params);
  },

  stageMeta(stage) {
    const found = this.STAGES.find(item => item[0] === stage) || this.STAGES[0];
    return { id: found[0], label: found[1], icon: found[2] };
  },

  async renderList(params = {}) {
    const orderId = Number(params.orderId) || null;
    const customerId = Number(params.customerId) || null;
    let jobs = [];
    try { jobs = await DB.getJobs({ ...(orderId ? { orderId } : {}), ...(customerId ? { customerId } : {}) }); } catch (error) { console.error('Jobs load failed:', error); }
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: orderId ? 'Order jobs' : 'Jobs', showBack: true, backHref: orderId ? `orders?id=${orderId}` : 'control', actions: orderId ? `<button class="btn btn-sm btn-primary" data-action="JobsFeature.createFromOrder" data-args='${JSON.stringify([orderId])}'><span class="material-symbols-rounded">add</span>Job</button>` : '' })}
      <div class="px-md pb-lg">
        ${jobs.length ? jobs.map(job => this.renderJobCard(job)).join('') : `<div class="empty-state empty-state-lg"><span class="material-symbols-rounded">construction</span><div class="fw-600">No jobs yet</div><div class="fs-13">Create a job from an order when operational work begins.</div>${orderId ? `<button class="btn btn-primary btn-sm mt-md" data-action="JobsFeature.createFromOrder" data-args='${JSON.stringify([orderId])}'>Create job</button>` : ''}</div>`}
        ${orderId && jobs.length ? '<div class="hint mt-md">An order can have more than one job. Use + Job only when the work genuinely needs a separate operational record.</div>' : ''}
      </div>
    </div>`;
  },

  renderJobCard(job) {
    const stage = this.stageMeta(job.status);
    return `<button class="card mb-sm w-full text-left" data-action="App.navigate" data-args='${JSON.stringify(['jobs', { id: job.id }])}'>
      <div class="flex justify-between gap-sm"><strong>${Utils.escapeHtml(job.jobNumber || `Job ${job.id}`)}</strong><span class="badge"><span class="material-symbols-rounded fs-14">${stage.icon}</span>${Utils.escapeHtml(stage.label)}</span></div>
      ${job.summary ? `<div class="fs-13 text-secondary mt-6">${Utils.escapeHtml(job.summary)}</div>` : ''}
    </button>`;
  },

  async createFromOrder(orderId) {
    if (this._creating) return;
    this._creating = true;
    try {
      const operationId = `job:${orderId}:${Date.now()}`;
      const result = await DB.createJobFromOrder(orderId, {}, operationId);
      Toast.show(result.created ? 'Job created' : 'Job already created', 'success');
      App.navigate('jobs', { id: result.job.id });
    } catch (error) {
      console.error('Create job failed:', error);
      Toast.show('Could not create job', 'error');
    } finally { this._creating = false; }
  },

  async renderJob(id) {
    const job = await DB.getJob(id);
    if (!job) return `<div class="empty-state"><span class="material-symbols-rounded">error</span><div>Job not found</div></div>`;
    const visits = await DB.getJobAppointments(id);
    let fieldWorkspace = null;
    try { if (typeof JobFieldService !== 'undefined') fieldWorkspace = await JobFieldService.load(id); } catch (error) { console.error('Job field workspace failed:', error); }
    let customer = null;
    try { if (job.customerId) customer = await DB.getCustomer(job.customerId); } catch (error) {}
    const stage = this.stageMeta(job.status);
    const name = customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Customer';
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: job.jobNumber || `Job ${job.id}`, showBack: true, backHref: job.orderId ? `jobs?orderId=${job.orderId}` : 'jobs' })}
      <div class="p-md">
        <div class="card card-page"><div class="flex justify-between gap-sm"><div><strong>${Utils.escapeHtml(name)}</strong><div class="fs-12 text-tertiary">${job.orderId ? `Order linked · ${visits.length} visit${visits.length === 1 ? '' : 's'}` : `${visits.length} linked visits`}</div></div><span class="badge"><span class="material-symbols-rounded fs-14">${stage.icon}</span>${Utils.escapeHtml(stage.label)}</span></div></div>

        <div class="card card-page"><div class="section-label">Operational stage</div><div class="grid-2 gap-sm">${this.STAGES.filter(([value]) => !['completed', 'signed_off'].includes(value)).map(([value, label, icon]) => `<button class="btn ${job.status === value ? 'btn-primary' : 'btn-outline'} btn-sm" data-action="JobsFeature.transition" data-args='${JSON.stringify([job.id, value])}' aria-pressed="${job.status === value}"><span class="material-symbols-rounded fs-16">${icon}</span>${Utils.escapeHtml(label)}</button>`).join('')}</div><div class="hint mt-sm">Completion and customer sign-off use the checked actions below; they do not change payment status.</div></div>

        <div class="card card-page"><div class="flex items-center justify-between mb-sm"><div class="section-label mb-0">Visits</div><button class="btn btn-outline btn-sm" data-action="JobsFeature.openSchedule" data-args='${JSON.stringify([job.id])}'><span class="material-symbols-rounded">add</span>Schedule</button></div>
          ${visits.length ? visits.map(visit => `<button class="area-customer-row w-full text-left mb-6" data-action="App.navigate" data-args='${JSON.stringify(['appointments', { id: visit.id }])}'><span class="material-symbols-rounded">${visit.type === 'fitting' ? 'handyman' : visit.type === 'service_call' ? 'build' : 'event'}</span><span class="flex-1"><strong>${Utils.escapeHtml((CONFIG.appointmentTypes.find(type => type.id === visit.type)?.name) || visit.type || 'Visit')}</strong><small>${Utils.formatDate(visit.date, 'short')} · ${visit.arrivalStart && visit.arrivalEnd ? `${visit.arrivalStart}–${visit.arrivalEnd}` : Utils.formatTime(visit.date)}</small></span><span class="material-symbols-rounded">chevron_right</span></button>`).join('') : '<div class="fs-13 text-tertiary">No fitting, service or return visits linked yet.</div>'}
        </div>

        ${fieldWorkspace ? JobFieldService.render(fieldWorkspace) : ''}
        <div class="grid-2 gap-sm">
          ${job.orderId ? `<button class="btn btn-outline btn-sm" data-action="OrdersFeature.openOrderSheet" data-args='${JSON.stringify([job.orderId])}'><span class="material-symbols-rounded">receipt</span>Order</button>` : ''}
          <button class="btn btn-outline btn-sm" data-action="ProfitabilityFeature.openJob" data-args='${JSON.stringify([job.id])}'><span class="material-symbols-rounded">monitoring</span>Profitability</button>
          <button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['suppliers', { jobId: job.id, orderId: job.orderId }])}'><span class="material-symbols-rounded">local_shipping</span>Supplier orders</button>
          ${job.customerId ? `<button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['retention', { customerId: job.customerId, jobId: job.id, orderId: job.orderId }])}'><span class="material-symbols-rounded">handshake</span>Aftercare</button>` : ''}
          ${job.customerId ? `<button class="btn btn-outline btn-sm" data-action="App.navigate" data-args='${JSON.stringify(['customer', { id: job.customerId }])}'><span class="material-symbols-rounded">person</span>Customer 360</button>` : ''}
        </div>
      </div>
    </div>`;
  },

  async transition(id, stage) {
    if (!this.STAGES.some(item => item[0] === stage)) return Toast.show('Unknown job stage', 'error');
    try {
      await DB.setJobStage(id, stage, { changedAt: new Date().toISOString() });
      Toast.show(`Job moved to ${this.stageMeta(stage).label}`, 'success');
      App.navigate('jobs', { id });
    } catch (error) { console.error('Job transition failed:', error); Toast.show('Could not update job', 'error'); }
  },

  openSchedule(jobId) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Schedule job visit</h3><button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">
      <button class="btn btn-outline btn-block" data-close="1" data-action="JobsFeature.scheduleVisit" data-args='${JSON.stringify([jobId, 'fitting', 'fitting'])}'><span class="material-symbols-rounded">handyman</span>Fitting</button>
      <button class="btn btn-outline btn-block mt-sm" data-close="1" data-action="JobsFeature.scheduleVisit" data-args='${JSON.stringify([jobId, 'service_call', 'service'])}'><span class="material-symbols-rounded">build</span>Service call</button>
      <button class="btn btn-outline btn-block mt-sm" data-close="1" data-action="JobsFeature.scheduleVisit" data-args='${JSON.stringify([jobId, 'service_call', 'return_visit'])}'><span class="material-symbols-rounded">assignment_return</span>Return visit</button>
    </div>`);
  },

  scheduleVisit(jobId, type, jobRole = type) {
    App.closeModal();
    App.navigate('appointments', { action: 'add', jobId, type, jobRole });
  },

  setChecklistItem(...args) { return JobFieldService.setChecklistItem(...args); },
  openAddIssue(id) { return JobFieldService.openAddIssue(id); },
  saveIssue(id) { return JobFieldService.saveIssue(id); },
  openResolveIssue(issueId, jobId) { return JobFieldService.openResolveIssue(issueId, jobId); },
  resolveIssue(issueId, jobId) { return JobFieldService.resolveIssue(issueId, jobId); },
  openCompleteJob(id) { return JobFieldService.openComplete(id); },
  confirmCompleteJob(id) { return JobFieldService.confirmComplete(id); },
  openSignOff(id) { return JobFieldService.openSignOff(id); },
  confirmSignOff(id) { return JobFieldService.confirmSignOff(id); }
};

App.registerFeature(JobsFeature);
