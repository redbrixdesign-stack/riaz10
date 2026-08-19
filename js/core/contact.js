/* ============================================
   ADVISOROS v5.0 — CONTACT ACTIONS
   Safer customer contact sheet for file/browser builds
   ============================================ */

const ContactFeature = {
  open({ name = 'Customer', phone = '', message = '' } = {}) {
    const cleanedPhone = String(phone || '').trim();
    if (!cleanedPhone) {
      Toast.show('No phone number added yet', 'warning');
      return;
    }

    // web.whatsapp.com is the desktop-pairing URL - it doesn't reliably
    // deep-link into the WhatsApp app on a phone, which is why this button
    // "wasn't going through" on mobile even though the number itself was
    // fine. wa.me is the one WhatsApp documents for opening the app
    // directly on any platform - reuse the same builder Talk already uses,
    // so both places agree on one correct link format.
    const whatsappUrl = message ? Utils.buildWhatsAppUrl(cleanedPhone, message) : Utils.buildWhatsAppUrl(cleanedPhone);
    // Normalize to +44... regardless of how the number is stored locally
    // (07..., 0044..., with stray spaces/dashes) - a bare national number
    // can fail silently on some devices, and this keeps Call and WhatsApp
    // agreeing on the same underlying number.
    const e164Phone = Utils.toE164Phone(cleanedPhone);
    const telUrl = e164Phone ? `tel:${e164Phone}` : `tel:${cleanedPhone.replace(/[^\d+]/g, '')}`;

    const content = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h3>Contact ${Utils.escapeHtml(name || 'Customer')}</h3>
        <button class="btn btn-ghost btn-sm" data-action="App.closeModal" aria-label="Close">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="contact-sheet-number">${Utils.escapeHtml(Utils.formatPhone(cleanedPhone))}</div>
        <div class="contact-sheet-actions">
          ${whatsappUrl ? `
            <button class="btn contact-sheet-primary" data-action="ContactFeature.openWhatsApp" data-args='${Utils.escapeHtml(JSON.stringify([(whatsappUrl)]))}'>
              <span class="material-symbols-rounded">chat</span>
              WhatsApp
            </button>
          ` : ''}
          <button class="btn contact-sheet-secondary" data-action="ContactFeature.openCall" data-args='${Utils.escapeHtml(JSON.stringify([(telUrl)]))}'>
            <span class="material-symbols-rounded">phone</span>
            Call
          </button>
          <button class="btn contact-sheet-secondary" data-action="ContactFeature.copyNumber" data-args='${Utils.escapeHtml(JSON.stringify([(cleanedPhone)]))}'>
            <span class="material-symbols-rounded">content_copy</span>
            Copy Number
          </button>
        </div>
      </div>
    `;

    App.openModal(content);
  },

  openWhatsApp(url) {
    if (!url) {
      Toast.show('This number needs a valid WhatsApp format', 'warning');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    App.closeModal();
  },

  openCall(url) {
    window.location.href = url;
    App.closeModal();
  },

  async copyNumber(phone) {
    try {
      await navigator.clipboard.writeText(phone);
      Toast.show('Number copied', 'success');
    } catch (error) {
      Toast.show(phone, 'info');
    }
  }
};

window.ContactFeature = ContactFeature;
