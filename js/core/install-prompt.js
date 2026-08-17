/* ============================================
   ADVISOROS v5.0 — INSTALL PROMPT (PWA perf 5.4)
   Companion-style, one-time "Add Beelo to your home screen" hint.

   Why not the default browser prompt: Chrome/Android fire
   beforeinstallprompt at an arbitrary moment and iOS Safari never fires
   it at all. Instead we capture the event, suppress the native prompt,
   and show a single dismissible bottom sheet on the user's terms — after
   they've settled on Today, never during first-run onboarding, and at
   most once per 30 days until they install (or say "not now" and are
   left alone).

   Behaviour matrix:
     - Installed / standalone (Chrome standalone, iOS full-screen): never
       shown.
     - Chrome/Android: "Add to Home Screen" button calls the captured
       deferred prompt; on accept the browser fires appinstalled, which
       hides the hint permanently.
     - iOS Safari: no native prompt — the sheet shows the three-step
       Share → Add to Home Screen instructions instead.
   ============================================ */

const InstallPrompt = {
  _deferredEvent: null,
  _shown: false,
  _attempts: 0,

  DISMISS_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days

  init() {
    if (this._isStandalone() || this._installed()) return;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this._deferredEvent = e;
      this._schedule();
    });
    window.addEventListener('appinstalled', () => {
      this._markInstalled();
      if (this._shown) {
        this._hide();
        Toast.show('Beelo is now on your home screen', 'success');
      }
    });
    // iOS Safari has no beforeinstallprompt — schedule the instruction
    // sheet directly (the target users are overwhelmingly iOS field staff).
    if (!this._deferredEvent && this._isIOS()) {
      this._schedule();
    }
  },

  _isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    } catch { return false; }
  },

  _isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  },

  _installed() {
    try { return localStorage.getItem('beelo_install_installed') === '1'; } catch { return false; }
  },

  _markInstalled() {
    try {
      localStorage.setItem('beelo_install_installed', '1');
      localStorage.removeItem('beelo_install_dismissed_at');
    } catch {}
  },

  // "Not now" hides the sheet and suppresses it for 30 days.
  _dismissedRecently() {
    try {
      const at = Number(localStorage.getItem('beelo_install_dismissed_at') || 0);
      return at > 0 && Date.now() - at < this.DISMISS_TTL_MS;
    } catch { return false; }
  },

  _schedule() {
    if (this._shown || this._isStandalone() || this._installed() || this._dismissedRecently()) return;
    // Give the app time to boot and the user time to land on Today —
    // never interrupt onboarding or an in-flight task. Retry is bounded so
    // an always-busy session just doesn't get the hint this launch.
    if (this._attempts >= 4) return;
    this._attempts++;
    setTimeout(() => {
      if (this._shown || this._isStandalone() || this._installed() || this._dismissedRecently()) return;
      // Test-mode profiles (browser suites) must never see the hint — it
      // would open a modal mid-journey and trip "no modal layers left"
      // assertions. Real users never set this flag. Checked at show time so
      // a suite can boot with the flag and drop it later (install-prompt
      // verification does exactly that).
      try { if (localStorage.getItem('advisoros_enc_test') === '1') return; } catch {}
      if (typeof App === 'undefined' || App.currentHash === 'onboarding' || App.currentHash === '') return;
      // Companion timing: only interrupt when the user is settled on Today
      // with no sheet already open — never over a task they're in the
      // middle of. Otherwise re-check later (bounded by _attempts).
      if (App.currentHash !== 'today' || document.querySelector('.modal-overlay.active')) {
        this._schedule();
        return;
      }
      this._show();
    }, 12000);
  },

  _hide() {
    try { App.closeModal({ all: true, silent: true }); } catch {}
  },

  _show() {
    if (this._shown || this._isStandalone() || this._installed() || this._dismissedRecently()) return;
    this._shown = true;
    const isIOS = this._isIOS();
    const hasNativePrompt = !!this._deferredEvent;
    const body = isIOS && !hasNativePrompt
      ? `
        <div class="card p-md mb-lg" >
          <div class="fs-14 lh-150 text-secondary">
            1. Tap the <b>Share</b> button in Safari<br>
            2. Choose <b>Add to Home Screen</b><br>
            3. Tap <b>Add</b>
          </div>
        </div>
        <button class="btn btn-primary btn-block" data-action="InstallPrompt.install">Got it</button>`
      : `
        <button class="btn btn-primary btn-block" data-action="InstallPrompt.install">Add to Home Screen</button>`;
    App.openModal(`
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Add Beelo to your home screen</h3>
      </div>
      <div class="sheet-body p-md">
        <p class="text-secondary mb-lg">One tap from your home screen opens Beelo like an app — and it keeps working with no signal, even out on the road.</p>
        ${body}
        <button class="btn btn-ghost btn-block mt-sm" data-action="InstallPrompt.dismiss">Not now</button>
      </div>
    `);
  },

  install() {
    if (this._deferredEvent) {
      const e = this._deferredEvent;
      this._deferredEvent = null;
      // Native prompt: on accept, hide the hint immediately (appinstalled
      // usually follows, but not every browser fires it reliably).
      e.prompt();
      e.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          this._markInstalled();
          this._hide();
        } else {
          this._shown = false; // allow it to be offered again later
        }
      }).catch(() => {});
      return;
    }
    // iOS: no native prompt — acknowledge and stop nagging for now.
    this._dismiss();
    Toast.show('Share → Add to Home Screen in Safari', 'info');
  },

  dismiss() {
    this._dismiss();
  },

  _dismiss() {
    try { localStorage.setItem('beelo_install_dismissed_at', String(Date.now())); } catch {}
    this._shown = true;
    this._hide();
  }
};

document.addEventListener('DOMContentLoaded', () => InstallPrompt.init());
