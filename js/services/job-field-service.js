/* Field completion orchestration for jobs. All writes are local DB actions;
   every completion/sign-off remains an explicit advisor confirmation. */
const JobFieldService = {
  async load(jobId, appointmentId = null) {
    const result = await DB.getJob(jobId);
    if (!result) throw new Error('Job not found');
    const job = result.job || result;
    const checklist = typeof DB.getChecklistForJob === 'function'
      ? await DB.getChecklistForJob(job.id, appointmentId || job.appointmentId || null)
      : { template: null, items: [], responses: [] };
    const issues = typeof DB.getJobIssues === 'function' ? await DB.getJobIssues(job.id) : (result.issues || []);
    return { job, checklist: checklist || { items: [], responses: [] }, issues: issues || [] };
  },

  assess(workspace) {
    const responses = new Map((workspace.checklist.responses || []).map(r => [r.checklistItemId, r]));
    const mandatoryIncomplete = (workspace.checklist.items || []).filter(item => item.required !== false && !responses.get(item.id)?.completed);
    const openIssues = (workspace.issues || []).filter(issue => !issue.resolvedAt && issue.status !== 'resolved');
    return { mandatoryIncomplete, openIssues, blocked: mandatoryIncomplete.length > 0 || openIssues.length > 0 };
  },

  render(workspace) {
    const { job, checklist, issues } = workspace;
    const responses = new Map((checklist.responses || []).map(r => [r.checklistItemId, r]));
    const openIssues = issues.filter(issue => !issue.resolvedAt && issue.status !== 'resolved');
    const status = job.status || job.stage;
    return `<section class="card card-page" aria-labelledby="job-checklist-title"><div class="flex justify-between items-center"><h2 class="section-label mb-0" id="job-checklist-title">Fitting checklist</h2><span class="badge">${(checklist.items || []).filter(i => responses.get(i.id)?.completed).length}/${(checklist.items || []).length}</span></div>
      ${(checklist.items || []).length ? `<div class="mt-sm">${checklist.items.map(item => { const done = !!responses.get(item.id)?.completed; return `<label class="flex items-start gap-sm py-8"><input class="job-check-input" type="checkbox" ${done ? 'checked' : ''} data-event="change" data-action="JobsFeature.setChecklistItem" data-args='${JSON.stringify([job.id, item.id, "__event__"])}'><span><strong>${Utils.escapeHtml(item.label || item.title || 'Checklist item')}</strong>${item.required === false ? '<small class="block text-tertiary">Optional</small>' : ''}</span></label>`; }).join('')}</div>` : `<div class="empty-state py-md">No checklist template assigned.</div>`}
    </section>
    <section class="card card-page" aria-labelledby="job-issues-title"><div class="flex justify-between items-center"><h2 class="section-label mb-0" id="job-issues-title">Issues & return visits</h2><button class="btn btn-outline btn-sm" data-action="JobsFeature.openAddIssue" data-args='${JSON.stringify([job.id])}'><span class="material-symbols-rounded">add</span>Issue</button></div>
      ${openIssues.length ? openIssues.map(issue => `<div class="mt-sm p-sm inset-dark"><strong>${Utils.escapeHtml(issue.title || issue.type || 'Job issue')}</strong>${issue.notes ? `<div class="fs-13 text-secondary mt-2">${Utils.escapeHtml(issue.notes)}</div>` : ''}${issue.requiresReturnVisit ? '<span class="badge badge-warning mt-4">Return visit needed</span>' : ''}<button class="btn btn-outline btn-sm mt-sm" data-action="JobsFeature.openResolveIssue" data-args='${JSON.stringify([issue.id, job.id])}'>Resolve</button></div>`).join('') : '<div class="fs-13 text-secondary mt-sm">No open issues.</div>'}
    </section>
    <div class="flex flex-col gap-sm">${!['completed', 'signed_off'].includes(status) ? `<button class="btn btn-primary btn-block" data-action="JobsFeature.openCompleteJob" data-args='${JSON.stringify([job.id])}'><span class="material-symbols-rounded">task_alt</span>Complete job</button>` : ''}${status === 'completed' ? `<button class="btn btn-outline btn-block" data-action="JobsFeature.openSignOff" data-args='${JSON.stringify([job.id])}'><span class="material-symbols-rounded">draw</span>Customer sign-off</button>` : ''}<p class="hint">Completing a job records the operational work only. It does not mark the order or balance as paid.</p></div>`;
  },

  async setChecklistItem(jobId, itemId, event) {
    const completed = !!event?.target?.checked;
    try {
      await DB.setChecklistResponse({ jobId, checklistItemId: itemId, completed });
      Toast.show(completed ? 'Checklist item completed' : 'Checklist item reopened', 'success');
    } catch (e) {
      if (event?.target) event.target.checked = !completed;
      Toast.show('Could not update checklist', 'error');
    }
  },

  openAddIssue(jobId) {
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('job-issue-notes', []);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Add job issue</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body"><div class="form-group"><label for="job-issue-title">Issue</label><input class="input" id="job-issue-title" maxlength="160" required></div><div class="form-group"><label for="job-issue-notes">Details</label><textarea class="textarea" id="job-issue-notes" maxlength="500"></textarea>${typeof NoteCapture !== 'undefined' ? NoteCapture.render('job-issue-notes') : ''}</div><label class="flex items-center gap-sm mb-md"><input type="checkbox" id="job-issue-return">Return visit required</label><button class="btn btn-primary btn-block" data-action="JobsFeature.saveIssue" data-args='${JSON.stringify([jobId])}'>Save issue</button></div>`);
  },

  async saveIssue(jobId) {
    const title = document.getElementById('job-issue-title')?.value.trim();
    if (!title) return Toast.show('Describe the issue', 'warning');
    await DB.addJobIssue(jobId, { title, notes: document.getElementById('job-issue-notes')?.value.trim() || '', audioNotes: typeof NoteCapture !== 'undefined' ? NoteCapture.getRecordings('job-issue-notes') : [], requiresReturnVisit: !!document.getElementById('job-issue-return')?.checked, status: 'open' });
    App.closeModal(); Toast.show('Issue saved', 'success'); App.navigate('jobs', { id: jobId });
  },

  async openResolveIssue(issueId, jobId) {
    const issue = (await DB.getJobIssues(jobId)).find(row => row.id === Number(issueId));
    if (typeof NoteCapture !== 'undefined') NoteCapture.setRecordings('job-issue-resolution', issue?.audioNotes || []);
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Resolve issue</h3></div><div class="sheet-body"><div class="form-group"><label for="job-issue-resolution">Resolution</label><textarea class="textarea" id="job-issue-resolution" required></textarea>${typeof NoteCapture !== 'undefined' ? NoteCapture.render('job-issue-resolution') : ''}</div><label class="flex items-start gap-sm mb-md"><input type="checkbox" id="job-issue-resolved-confirm"><span>I confirm this issue has been resolved.</span></label><button class="btn btn-primary btn-block" data-action="JobsFeature.resolveIssue" data-args='${JSON.stringify([issueId, jobId])}'>Confirm resolution</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`);
  },

  async resolveIssue(issueId, jobId) {
    const confirmed = !!document.getElementById('job-issue-resolved-confirm')?.checked;
    const resolution = document.getElementById('job-issue-resolution')?.value.trim();
    if (!confirmed) return Toast.show('Confirm the issue is resolved', 'warning');
    if (!resolution) return Toast.show('Add the resolution', 'warning');
    await DB.resolveJobIssue(issueId, resolution, { confirmed: true, audioNotes: typeof NoteCapture !== 'undefined' ? NoteCapture.getRecordings('job-issue-resolution') : [] });
    App.closeModal(); Toast.show('Issue resolved', 'success'); App.navigate('jobs', jobId ? { id: jobId } : {});
  },

  async openComplete(jobId) {
    const workspace = await this.load(jobId);
    const assessment = this.assess(workspace);
    this.pendingJob = workspace.job;
    this.pendingCompletionBlocked = assessment.blocked;
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Complete job?</h3><button class="btn btn-ghost btn-sm" aria-label="Close" data-action="App.closeModal"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">${assessment.mandatoryIncomplete.length ? `<div class="alert alert-warning" role="alert">${assessment.mandatoryIncomplete.length} required checklist item${assessment.mandatoryIncomplete.length === 1 ? '' : 's'} incomplete.</div>` : ''}${assessment.openIssues.length ? `<div class="alert alert-warning" role="alert">${assessment.openIssues.length} issue${assessment.openIssues.length === 1 ? '' : 's'} unresolved.</div>` : ''}${assessment.blocked ? `<div class="form-group"><label for="job-complete-override">Override reason</label><textarea class="textarea" id="job-complete-override" required aria-describedby="job-override-help"></textarea><div class="hint" id="job-override-help">Required because work remains incomplete or unresolved.</div></div>` : ''}<label class="flex items-start gap-sm mb-md"><input type="checkbox" id="job-complete-confirm"><span>I confirm the fitting work is operationally complete. This does not record payment.</span></label><button class="btn btn-primary btn-block" data-action="JobsFeature.confirmCompleteJob" data-args='${JSON.stringify([jobId])}'>Confirm job complete</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`);
  },

  async confirmComplete(jobId) {
    if (!document.getElementById('job-complete-confirm')?.checked) return Toast.show('Confirm the work is complete', 'warning');
    const overrideReason = document.getElementById('job-complete-override')?.value.trim() || '';
    if (this.pendingCompletionBlocked && !overrideReason) return Toast.show('Add an override reason for incomplete work or issues', 'warning');
    this.pendingMutations = this.pendingMutations || new Set();
    if (this.pendingMutations.has(`complete:${jobId}`)) return;
    this.pendingMutations.add(`complete:${jobId}`);
    try {
      await DB.completeJob(jobId, { confirmed: true, overrideReason: overrideReason || null, operationId: this.operationId('complete', jobId) });
      App.closeModal(); Toast.show('Job completed — payment unchanged', 'success'); App.navigate('jobs', { id: jobId });
    } catch (e) { Toast.show(e.message || 'Could not complete job', 'error'); }
    finally { this.pendingMutations.delete(`complete:${jobId}`); }
  },

  openSignOff(jobId) {
    App.openModal(`<div class="sheet-handle"></div><div class="sheet-header"><h3>Customer sign-off</h3></div><div class="sheet-body"><div class="form-group"><label for="job-signoff-name">Customer name</label><input class="input" id="job-signoff-name" autocomplete="name" required></div><label class="flex items-start gap-sm mb-md"><input type="checkbox" id="job-signoff-confirm"><span>The customer has reviewed the completed work and confirmed sign-off.</span></label><button class="btn btn-primary btn-block" data-action="JobsFeature.confirmSignOff" data-args='${JSON.stringify([jobId])}'>Record sign-off</button><button class="btn btn-outline btn-block mt-sm" data-action="App.closeModal">Cancel</button></div>`);
  },

  async confirmSignOff(jobId) {
    const customerName = document.getElementById('job-signoff-name')?.value.trim();
    if (!customerName) return Toast.show('Enter the customer name', 'warning');
    if (!document.getElementById('job-signoff-confirm')?.checked) return Toast.show('Confirm customer sign-off', 'warning');
    this.pendingMutations = this.pendingMutations || new Set();
    if (this.pendingMutations.has(`signoff:${jobId}`)) return;
    this.pendingMutations.add(`signoff:${jobId}`);
    try {
      await DB.signOffJob(jobId, { confirmed: true, customerName, method: 'advisor_recorded', operationId: this.operationId('signoff', jobId) });
      App.closeModal(); Toast.show('Customer sign-off recorded', 'success'); App.navigate('jobs', { id: jobId });
    } catch (e) { Toast.show(e.message || 'Could not record sign-off', 'error'); }
    finally { this.pendingMutations.delete(`signoff:${jobId}`); }
  },

  operationId(action, id) { return `job:${action}:${id}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
};
