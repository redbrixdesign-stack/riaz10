/* ============================================
   ADVISOROS v5.0 — LEGAL & CONSENT (Phase 2)
   Privacy policy + terms of service pages (in-app, offline-capable),
   the operator/company details block, and a one-time consent sheet.

   Principles (from the launch audit):
   - Honest by default: every claim here matches what the app actually
     does (local-only storage, AES-GCM at rest, optional Claude AI via a
     user-configured proxy, OSM map tiles, CDN code fetches).
   - No invented facts: operator details below are placeholders that
     MUST be filled before public launch (see TODO(launch)).
   ============================================ */

const Legal = {
  /* Operator details. TODO(launch): replace the em-dashes with the real
     operator's details before any public marketing launch — the audit
     flagged "company details in footer" as a P0 legal item. */
  COMPANY: {
    name: '—',
    address: '—',
    email: '—',
    companyNumber: '—'
  },

  LAST_UPDATED: '18 August 2026',

  openPage(page) {
    App.navigate('legal', { page: page === 'terms' ? 'terms' : 'privacy' });
  },
  openPrivacy() { this.openPage('privacy'); },
  openTerms() { this.openPage('terms'); },

  companyBlock() {
    const c = this.COMPANY;
    const rows = [
      ['Operator', c.name],
      ['Address', c.address],
      ['Email', c.email],
      ['Company number', c.companyNumber]
    ];
    return `
      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Operator</h2>
        ${rows.map(([k, v]) => `<div class="fs-13 lh-150"><span class="text-tertiary">${k}:</span> ${Utils.escapeHtml(v)}</div>`).join('')}
      </div>`;
  },

  lastUpdated() {
    return `<div class="fs-12 text-tertiary mb-14" >Last updated: ${this.LAST_UPDATED}</div>`;
  },

  renderPage(params = {}) {
    const page = params.page === 'terms' ? 'terms' : 'privacy';
    return `
      <div class="fade-in">
        ${App.renderTopHeader({ title: page === 'terms' ? 'Terms of Service' : 'Privacy Policy', showBack: true, backHref: 'settings?section=privacy' })}
        <div class="p-md pad-scroll">
          ${this.lastUpdated()}
          ${this.companyBlock()}
          ${page === 'terms' ? this.termsBody() : this.privacyBody()}
          <div class="fs-12 text-tertiary mt-14 lh-150" >Beelo v5.0 · ${this.LAST_UPDATED}</div>
        </div>
      </div>`;
  },

  privacyBody() {
    return `
      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >What we store — and where</h2>
        <div class="fs-13 lh-160 text-secondary">
          Beelo is an offline-first app. There is no Beelo account and no Beelo server:
          everything you enter — customers, visits, orders, expenses, photos and
          messages — is stored <strong>only on your own device</strong>, in this
          browser's local storage. Nothing is uploaded to us, sold, or shared.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Encryption at rest</h2>
        <div class="fs-13 lh-160 text-secondary">
          The personal details that identify people (names, phone numbers, email
          addresses, postal addresses) are encrypted on your device before they are
          stored, using AES-256-GCM with a key derived from the passphrase you set
          on first launch (PBKDF2, 100,000 iterations). The passphrase is never
          stored in plain text or sent to Beelo. If you enable an unlock grace
          period, a wrapped copy is protected by a non-exportable key on this
          device and is not included in backups. Beelo cannot recover a forgotten
          passphrase or decrypt your records remotely.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >What never leaves your device</h2>
        <div class="fs-13 lh-160 text-secondary">
          Your customer database, visits, orders, expenses, measurements, message
          history and photos stay local. Backups are files you export and keep
          yourself — they never leave your device unless you move or share them.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >What may leave your device</h2>
        <div class="fs-13 lh-160 text-secondary">
          Three things, each explained here so there are no surprises:
          <ul class="mt-8" style="padding-left:18px;list-style:disc;">
            <li class="mb-6"><strong>Map tiles.</strong> The Route map loads map tiles
              from OpenStreetMap's servers, so the map view sends a standard tile
              request (which includes your IP address) to openstreetmap.org.</li>
            <li class="mb-6"><strong>Claude AI (optional, off by default).</strong> If you
              turn on AI in Settings, photos you scan and message drafts are sent to
              the AI proxy URL you configure (for example your own Vercel function),
              which forwards them to Anthropic's Claude. The app never ships an API
              key — the key lives in your own proxy. Turn the toggle off at any time
              to stop this.</li>
            <li class="mb-6"><strong>Code libraries.</strong> A few open-source scripts
              (Leaflet for maps, Tesseract for offline OCR) load from public CDNs when
              you use those features. This is code, not your data.</li>
          </ul>
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Cookies and tracking</h2>
        <div class="fs-13 lh-160 text-secondary">
          Beelo does not use cookies and has no analytics or advertising tracking.
          The only "storage" is the app's own local storage on your device, which is
          essential for the app to work and is never read by third parties.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Your rights</h2>
        <div class="fs-13 lh-160 text-secondary">
          Because your data is on your device, you can exercise your UK GDPR rights
          directly:
          <ul class="mt-8" style="padding-left:18px;list-style:disc;">
            <li class="mb-6"><strong>Access &amp; portability</strong> — export your data
              anytime: Settings → Data &amp; Backup → Export backup (or CSV).</li>
            <li class="mb-6"><strong>Rectification</strong> — edit any customer, visit or
              order record in the app.</li>
            <li class="mb-6"><strong>Erasure</strong> — Settings → Data &amp; Backup →
              Delete all data erases every record on this device permanently. You can
              also delete individual records at any time.</li>
            <li class="mb-6"><strong>Withdraw consent</strong> — the optional Claude AI
              feature is off by default; switch it off in Settings → Claude AI.</li>
          </ul>
          You may also contact us (details below) or the UK Information
          Commissioner's Office (ico.org.uk) with any concern.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >How long we keep data</h2>
        <div class="fs-13 lh-160 text-secondary">
          Records are kept until you delete them (individually or via Delete all
          data). Backups you export are files you control; when you delete a backup
          file it is gone. We hold nothing on our side to retain or delete.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Children</h2>
        <div class="fs-13 lh-160 text-secondary">
          Beelo is a business tool for adults. It is not directed at children under
          13 and should not be used to store children's data without a parent or
          guardian's involvement.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Changes to this policy</h2>
        <div class="fs-13 lh-160 text-secondary">
          We may update this policy as the app changes. The "last updated" date at
          the top of this page always reflects the current version.
        </div>
      </div>`;
  },

  termsBody() {
    return `
      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >The service</h2>
        <div class="fs-13 lh-160 text-secondary">
          Beelo is an offline-first companion app for self-employed field-service
          professionals to keep their own customer and business records. It is
          provided free of charge and runs entirely on your device.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Your data, your role</h2>
        <div class="fs-13 lh-160 text-secondary">
          You are responsible for the records you create in Beelo and for your own
          compliance with data-protection law in how you use customer information.
          Beelo stores that information locally for you; it does not collect it for
          our own purposes.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Acceptable use</h2>
        <div class="fs-13 lh-160 text-secondary">
          Use Beelo for lawful purposes only. Do not use it to store unlawful
          material, and make sure you have the right to hold any personal data you
          enter (for example, a customer's consent or your legitimate business
          interest).
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Backups and data loss</h2>
        <div class="fs-13 lh-160 text-secondary">
          Data lives on the device you use, so it can be lost if the device is lost,
          damaged, or its storage is cleared. Export a backup regularly
          (Settings → Data &amp; Backup) — you are responsible for keeping your own
          backups safe.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >No warranty</h2>
        <div class="fs-13 lh-160 text-secondary">
          Beelo is provided "as is" without warranty of any kind. While we work hard
          to keep it reliable, we do not guarantee uninterrupted or error-free
          operation.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Liability</h2>
        <div class="fs-13 lh-160 text-secondary">
          To the fullest extent permitted by law, we are not liable for any loss of
          data, loss of profits, or other indirect loss arising from your use of
          Beelo. Nothing in these terms limits liability that cannot be limited by
          law.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Intellectual property</h2>
        <div class="fs-13 lh-160 text-secondary">
          The Beelo app itself (its code, design and content) belongs to us. Your
          data belongs to you. You may not copy, resell or reverse-engineer the app.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Changes to these terms</h2>
        <div class="fs-13 lh-160 text-secondary">
          We may update these terms from time to time. The "last updated" date at
          the top of this page reflects the current version; continuing to use the
          app after a change means you accept the updated terms.
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="fs-15 fw-700 mb-10" >Governing law</h2>
        <div class="fs-13 lh-160 text-secondary">
          These terms are governed by the laws of England and Wales.
        </div>
      </div>`;
  }
};

/* The legal pages are a normal (unlisted) feature so they're hash-addressable,
   offline-capable and covered by the same focus/back behaviour as every screen. */
const LegalFeature = {
  id: 'legal',
  name: 'Legal',
  icon: 'policy',
  route: false,
  render(params = {}) { return Legal.renderPage(params); }
};

App.registerFeature(LegalFeature);

/* ============================================
   CONSENT SHEET — shown once, after the user settles on Today.
   Beelo has no cookies/tracking, so this is not a cookie banner: it's a
   plain-language notice that (a) data stays on the device, and (b) the one
   optional feature that sends anything out (Claude AI) is off by default.
   Acknowledging records advisoros_consent locally; "Delete all data"
   clears it, so a fresh start asks again.
   ============================================ */
const ConsentPrompt = {
  _shown: false,
  _attempts: 0,

  init() {
    if (this._acknowledged()) return;
    this._schedule();
  },

  _acknowledged() {
    try { return !!localStorage.getItem('advisoros_consent'); } catch { return true; }
  },

  _schedule() {
    if (this._shown || this._acknowledged()) return;
    if (this._attempts >= 4) return;
    this._attempts++;
    setTimeout(() => {
      if (this._shown || this._acknowledged()) return;
      try { if (localStorage.getItem('advisoros_enc_test') === '1') return; } catch {}
      if (typeof App === 'undefined' || App.currentHash === 'onboarding' || App.currentHash === '') return;
      // Don't interrupt a task the user is mid-way through; retry (bounded).
      if (App.currentHash !== 'today' || document.querySelector('.modal-overlay.active')) {
        this._schedule();
        return;
      }
      this._show();
    }, 5000);
  },

  _show() {
    if (this._shown || this._acknowledged()) return;
    this._shown = true;
    App.openModal(`
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Your data stays on this phone</h3>
      </div>
      <div class="sheet-body p-md">
        <p class="text-secondary mb-lg lh-150 fs-14">
          Beelo has no account and no servers. Every customer, visit and photo lives
          on <strong>this device</strong>, encrypted — nothing is uploaded or sold.
        </p>
        <p class="text-secondary mb-lg lh-150 fs-14">
          The one optional feature that sends anything out is <strong>Claude AI</strong>
          (photo scanning and message drafting), which is <strong>off by default</strong>
          and stays off until you switch it on in Settings.
        </p>
        <button class="btn btn-primary btn-block" data-action="ConsentPrompt.acknowledge">I understand</button>
        <button class="btn btn-ghost btn-block mt-sm" data-action="ConsentPrompt.openPrivacy">Read our privacy policy</button>
        <div class="fs-11 text-tertiary text-center mt-12" >No cookies · no tracking · nothing leaves your phone unless you choose to</div>
      </div>
    `);
  },

  acknowledge() {
    try {
      localStorage.setItem('advisoros_consent', JSON.stringify({ v: 1, at: new Date().toISOString() }));
    } catch (e) {}
    this._shown = true;
    App.closeModal({ all: true, silent: true });
    Toast.show('Thanks — everything stays on this phone', 'success');
  },

  openPrivacy() {
    Legal.openPage('privacy');
  }
};

document.addEventListener('DOMContentLoaded', () => ConsentPrompt.init());
