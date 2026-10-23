/* ============================================
   BEELO — SOCIAL POST ASSISTANT
   Consent-first, advisor-reviewed social drafts.
   Media remains on the device and is shared only
   through the operating system's native share UI.
   ============================================ */

const SocialFeature = {
  id: 'social',
  name: 'Create Social Post',
  icon: 'campaign',
  route: false,
  mediaFile: null,
  appointmentId: null,
  drafts: null,

  async render(params = {}) {
    this.invalidateApproval();
    const revision = this._renderRevision = (this._renderRevision || 0) + 1;
    const id = Number(params.appointmentId || params.id);
    const appt = Number.isInteger(id) && id > 0 ? await DB.getAppointment(id) : null;
    if (revision !== this._renderRevision) return '';
    this.appointmentId = null;
    this.mediaFile = null;
    this.drafts = null;
    if (!appt || appt.type !== 'fitting') {
      return `<div class="fade-in">${App.renderTopHeader({ title: 'Social post', showBack: true, backHref: 'appointments' })}<div class="empty-state"><span class="material-symbols-rounded">photo_library</span><div>Open a fitting visit to create a post.</div></div></div>`;
    }
    this.appointmentId = appt.id;
    this.mediaFile = null;
    this.drafts = appt.socialDrafts || null;
    const existingConsent = !!appt.socialMediaConsentAt;
    return `<div class="fade-in">
      ${App.renderTopHeader({ title: 'Create Social Post', showBack: true, backHref: 'appointments' })}
      <div class="p-md">
        <div class="card mb-md">
          <div class="flex items-start gap-sm"><span class="material-symbols-rounded text-brand">auto_awesome</span><div><div class="fw-700">Turn today’s craftsmanship into a post</div><div class="fs-13 text-secondary mt-4 lh-145">Add the finished result, confirm the customer is comfortable with sharing it, and Beelo will prepare three editable captions. Nothing is published automatically.</div></div></div>
        </div>

        <div class="card mb-md">
          <div class="fw-700 mb-sm">1. Permission first</div>
          <label class="flex items-start gap-sm mb-sm"><input type="checkbox" id="social-consent" ${existingConsent ? 'checked' : ''}><span><strong>The customer has agreed</strong> that this finished-room photo or video may be used on my business social media.</span></label>
          <div class="hint">Ask clearly before taking or sharing content. This permission is recorded against the fitting and can be withdrawn.</div>
          <div id="social-withdraw">${existingConsent ? this.renderWithdrawal() : ''}</div>
        </div>

        <div class="card mb-md">
          <div class="fw-700 mb-sm">2. Choose the finished result</div>
          <button class="btn btn-outline btn-block" data-file="social-media-input"><span class="material-symbols-rounded">add_photo_alternate</span>Choose photo or short video</button>
          <input type="file" id="social-media-input" accept="image/*,video/*" style="display:none" data-action="SocialFeature.selectMedia" data-args='["__event__"]'>
          <div id="social-media-preview" class="fs-13 text-secondary mt-sm">No media selected.</div>
          <div class="hint mt-sm">Changing media clears the checks below. Confirm permission and privacy for the selected file, then create fresh post options before sharing.</div>
          <div class="alert alert-warning mt-sm" role="note"><strong>Privacy check:</strong> avoid faces or children without separate permission, house numbers, paperwork, screens, family photos and identifying reflections.</div>
          <label class="flex items-start gap-sm mt-sm"><input type="checkbox" id="social-privacy"><span>I have checked the full photo/video and no private or identifying details are visible.</span></label>
        </div>

        <div class="card mb-md">
          <div class="fw-700 mb-sm">3. What made this job special?</div>
          <div class="form-group"><label for="social-room">Room</label><input class="input" id="social-room" maxlength="60" placeholder="e.g. living room"></div>
          <div class="form-group"><label for="social-product">Blind or curtain style</label><input class="input" id="social-product" maxlength="80" placeholder="e.g. warm-neutral Roman blinds"></div>
          <div class="form-group"><label for="social-benefit">What improved?</label><input class="input" id="social-benefit" maxlength="120" placeholder="e.g. privacy without losing natural light"></div>
          <div class="form-group"><label for="social-area">Local area only <span class="text-tertiary fw-400">— optional</span></label><input class="input" id="social-area" maxlength="50" placeholder="e.g. Stockport"><div class="hint">Never enter the customer’s street or full address.</div></div>
          <button class="btn btn-primary btn-block" data-action="SocialFeature.generate"><span class="material-symbols-rounded">auto_awesome</span>Create three post options</button>
        </div>

        <div id="social-results">${this.drafts ? this.renderDrafts(this.drafts) : ''}</div>
      </div>
    </div>`;
  },

  selectMedia(event) {
    const file = event?.target?.files?.[0];
    if (event?.target) event.target.value = '';
    if (!file) return;
    this.invalidateApproval(true);
    this.mediaFile = null;
    const preview = document.getElementById('social-media-preview');
    if (preview) preview.textContent = 'No media selected. Choose a finished photo or video.';
    if (!/^(image|video)\//.test(file.type || '')) return Toast.show('Choose a photo or video', 'warning');
    if (file.size > 100 * 1024 * 1024) return Toast.show('Choose a file smaller than 100 MB', 'warning');
    this.mediaFile = file;
    const el = document.getElementById('social-media-preview');
    if (el) el.innerHTML = `<span class="material-symbols-rounded fs-18 align-middle">${file.type.startsWith('video/') ? 'videocam' : 'photo'}</span> ${Utils.escapeHtml(file.name || 'Selected media')} · ${Math.max(1, Math.round(file.size / 1024 / 1024))} MB`;
  },

  invalidateApproval(resetChecks = false) {
    this._generationRevision = (this._generationRevision || 0) + 1;
    this._shareApproval = null;
    this._generation = null;
    if (resetChecks) for (const id of ['social-consent', 'social-privacy']) {
      const input = document.getElementById(id);
      if (input) input.checked = false;
    }
  },

  deactivate() {
    this._renderRevision = (this._renderRevision || 0) + 1;
    this.invalidateApproval();
    this.mediaFile = null;
  },

  contextApproved(context) {
    return !!context && context.appointmentId === this.appointmentId && context.mediaFile === this.mediaFile &&
      context.revision === this._generationRevision && !!this.mediaFile &&
      !!document.getElementById('social-consent')?.checked && !!document.getElementById('social-privacy')?.checked;
  },

  values() {
    const value = id => (document.getElementById(id)?.value || '').trim();
    return { room: value('social-room'), product: value('social-product'), benefit: value('social-benefit'), area: value('social-area') };
  },

  renderWithdrawal() {
    return '<button class="btn btn-ghost btn-sm mt-sm text-danger" data-action="SocialFeature.withdrawConsent">Withdraw recorded permission</button>';
  },

  fallbackDrafts(fields) {
    const subject = [fields.product || 'made-to-measure window dressings', fields.room ? `for this ${fields.room}` : ''].filter(Boolean).join(' ');
    const benefit = fields.benefit ? ` The result brings ${fields.benefit}.` : '';
    const area = fields.area ? ` in ${fields.area}` : '';
    return {
      warm: `A lovely finish to this recent project${area}. We fitted ${subject}.${benefit} It’s always rewarding to see a room come together. Message me if you’re planning something similar.`,
      professional: `Recently completed${area}: ${subject}.${benefit} Designed, measured and fitted with care for a clean, made-to-measure finish. Get in touch to arrange a home consultation.`,
      short: `A fresh made-to-measure finish${area}. ${fields.product || 'Beautiful new window dressings'}, fitted with care. Message me to discuss your windows.`,
      hashtags: ['#MadeToMeasure', '#WindowDressings', '#Blinds', ...(fields.area ? [`#${fields.area.replace(/[^A-Za-z0-9]/g, '')}`] : [])]
    };
  },

  async generate() {
    if (this._generation) return Toast.show('Post options are being prepared', 'info');
    if (!Number.isInteger(this.appointmentId) || this.appointmentId <= 0) return Toast.show('Open the fitting visit again first', 'warning');
    if (!document.getElementById('social-consent')?.checked) return Toast.show('Confirm the customer has agreed first', 'warning');
    if (!this.mediaFile) return Toast.show('Choose a finished photo or video first', 'warning');
    if (!document.getElementById('social-privacy')?.checked) return Toast.show('Complete the privacy check first', 'warning');
    const fields = this.values();
    if (!fields.product && !fields.room && !fields.benefit) return Toast.show('Add one detail about the finished job', 'warning');
    const context = { appointmentId: this.appointmentId, mediaFile: this.mediaFile, revision: this._generationRevision };
    this._shareApproval = null;
    this._generation = context;
    try {
    let drafts = this.fallbackDrafts(fields);
    if (typeof AIService !== 'undefined' && AIService.isEnabled() && typeof AIService.createSocialPosts === 'function') {
      const result = await AIService.createSocialPosts(fields);
      if (result.ok) drafts = result.drafts;
      else Toast.show('Using polished offline captions — AI is unavailable', 'info');
    }
    if (!this.contextApproved(context) || this._generation !== context) return;
    try {
      const consentAt = new Date().toISOString();
      await DB.updateAppointment(context.appointmentId, { socialMediaConsentAt: consentAt, socialMediaConsentMethod: 'advisor_confirmed', socialDrafts: drafts });
      const saved = await DB.getAppointment(context.appointmentId);
      if (!saved || saved.type !== 'fitting' || saved.socialMediaConsentAt !== consentAt || !saved.socialDrafts) {
        throw new Error('Post permission was not retained against this fitting');
      }
    } catch (e) {
      console.warn('Could not persist social draft', e);
      if (this._generation === context) Toast.show('Could not save post options or permission. Please try again.', 'error');
      return;
    }
    if (!this.contextApproved(context) || this._generation !== context) return;
    this.drafts = drafts;
    this._shareApproval = context;
    const withdrawal = document.getElementById('social-withdraw');
    if (withdrawal) withdrawal.innerHTML = this.renderWithdrawal();
    const results = document.getElementById('social-results');
    if (results) results.innerHTML = this.renderDrafts(drafts);
    results?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    Toast.show('Three editable options are ready', 'success');
    } finally {
      if (this._generation === context) this._generation = null;
    }
  },

  async withdrawConsent() {
    if (!this.appointmentId) return;
    const appointmentId = this.appointmentId;
    this.invalidateApproval(true);
    try { await DB.updateAppointment(appointmentId, { socialMediaConsentAt: null, socialMediaConsentMethod: null, socialDrafts: null }); }
    catch (e) { Toast.show('Could not save the withdrawal. Sharing is blocked here; please retry.', 'error'); return; }
    this.drafts = null;
    this.mediaFile = null;
    Toast.show('Social sharing permission withdrawn', 'success');
    App.navigate('appointments', { id: appointmentId });
  },

  renderDrafts(drafts) {
    const options = [['warm', 'Warm and personal'], ['professional', 'Professional and polished'], ['short', 'Short and local']];
    const tags = Array.isArray(drafts.hashtags) ? drafts.hashtags.join(' ') : '';
    return `<div class="card mb-md"><div class="fw-700 mb-sm">4. Choose, edit and share</div><div class="hint mb-md">You remain in control. Check every claim before sharing.</div>${options.map(([key, label]) => `<div class="form-group"><label for="social-draft-${key}">${label}</label><textarea class="textarea" id="social-draft-${key}" rows="6">${Utils.escapeHtml(drafts[key] || '')}</textarea><button class="btn btn-outline btn-sm btn-block mt-sm" data-action="SocialFeature.share" data-args='${JSON.stringify([key])}'><span class="material-symbols-rounded">ios_share</span>Share this version</button></div>`).join('')}<div class="form-group"><label for="social-hashtags">Suggested hashtags</label><textarea class="textarea" id="social-hashtags" rows="2">${Utils.escapeHtml(tags)}</textarea></div></div>`;
  },

  async share(key) {
    if (this._sharing) return;
    if (!document.getElementById('social-consent')?.checked) return Toast.show('Confirm the customer has agreed before sharing', 'warning');
    if (!document.getElementById('social-privacy')?.checked) return Toast.show('Check the selected photo or video for private details before sharing', 'warning');
    const approval = this._shareApproval;
    if (!this.contextApproved(approval)) return Toast.show('Choose the finished media and create fresh post options before sharing', 'warning');
    const caption = (document.getElementById(`social-draft-${key}`)?.value || '').trim();
    const tags = (document.getElementById('social-hashtags')?.value || '').trim();
    const text = [caption, tags].filter(Boolean).join('\n\n');
    if (!text) return Toast.show('Add a caption first', 'warning');
    const files = [approval.mediaFile];
    this._sharing = true;
    try {
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
        await navigator.share({ text, files });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    if (!this.contextApproved(approval)) return;
    try {
      await navigator.clipboard.writeText(text);
      Toast.show('Caption copied — attach the selected media in your social app', 'success');
    } catch (e) { Toast.show('Could not open sharing on this device', 'error'); }
    } finally { this._sharing = false; }
  }
};

App.registerFeature(SocialFeature);
