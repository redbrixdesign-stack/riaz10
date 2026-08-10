/* ============================================
   ADVISOROS — AI SERVICE (client)
   Talks to the local/hosted AI backend proxy (server/index.js), which
   is the thing that actually holds the Anthropic API key.

   This file NEVER calls api.anthropic.com directly and never touches an
   API key - do not add one here. Point `baseUrl` at wherever you deploy
   the proxy from server/.
   ============================================ */

const AIService = {
  // Change this once you deploy the proxy (e.g. to your VPS/Render URL).
  // Local dev default matches server/index.js's default PORT.
  baseUrl: (window.CONFIG && CONFIG.aiBackendUrl) || 'http://localhost:8787',

  async _post(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  },

  // Converts a File (from an <input type=file>) into a base64 string
  // with no data-URL prefix, plus its mime type.
  async _fileToBase64(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
    const [, base64] = dataUrl.split(',');
    return { base64, mimeType: file.type || 'image/jpeg' };
  },

  // Parses a scanned order screenshot / business card photo with Claude.
  // Returns the same field shape OCRFeature.parseText() produces, so it's
  // a drop-in alternative (or fallback pair) to the Tesseract-based parser
  // in js/features/ocr/ocr.js.
  async parseDocument(file) {
    const { base64, mimeType } = await this._fileToBase64(file);
    const { fields } = await this._post('/api/ai/parse-document', {
      imageBase64: base64,
      mimeType
    });
    return fields;
  },

  // Drafts a WhatsApp-style follow-up message for a given customer/outcome
  // context. Returns plain text - always show it in an editable field
  // before sending, same as the existing template flow in talk.js.
  async draftMessage(context) {
    const { message } = await this._post('/api/ai/draft-message', { context });
    return message;
  }
};
