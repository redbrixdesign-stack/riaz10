/* ============================================
   ADVISOROS — AI SERVICE
   Claude Vision OCR + Haiku message drafting,
   via the serverless proxy (api/claude.mjs).
   Offline/disabled-safe: every call degrades to
   the app's existing non-AI behaviour.
   ============================================ */

const AIService = {
  lastUsage: null, // { inputTokens, outputTokens, model, type, at }

  // ---- config helpers ----
  config() {
    const ai = CONFIG.ai || {};
    return {
      enabled: !!ai.enabled,
      proxyUrl: ai.proxyUrl || '',
      secret: ai.secret || '',
      ocrModel: ai.ocrModel || 'claude-sonnet-4-5',
      draftModel: ai.draftModel || 'claude-haiku-4-5'
    };
  },

  isEnabled() {
    const c = this.config();
    return c.enabled && !!c.proxyUrl;
  },

  // ---- low-level request ----
  async _request(payload, timeoutMs) {
    const c = this.config();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(c.proxyUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(c.secret ? { 'x-ai-key': c.secret } : {})
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON body */ }

      if (res.ok && data && data.ok) {
        this.lastUsage = { ...(data.usage || {}), model: data.model, type: data.type, at: Date.now() };
        return { ok: true, data };
      }
      const reason = (data && data.error) || 'http_' + res.status;
      const message = (data && data.message) || 'AI request failed';
      return { ok: false, reason, message, httpStatus: res.status };
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      return {
        ok: false,
        unavailable: true,
        reason: aborted ? 'timeout' : 'network',
        message: aborted ? 'AI request timed out' : 'AI service unreachable (are you online?)'
      };
    } finally {
      clearTimeout(timer);
    }
  },

  // ---- image handling ----
  // Downsizes to a JPEG the proxy will accept quickly: max 1400px on the
  // long edge, 0.85 quality. If that fails for any reason, sends the raw
  // file — the proxy rejects anything over 2MB with a clear message.
  async _toBase64(file) {
    try {
      const bitmap = typeof createImageBitmap === 'function'
        ? await createImageBitmap(file)
        : await new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = URL.createObjectURL(file);
          });
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mediaType: 'image/jpeg' };
    } catch (e) {
      console.warn('AIService: image downscale failed, sending raw file', e);
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(String(reader.result).split(',')[1] || '');
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      return { base64, mediaType: file.type || 'image/jpeg' };
    }
  },

  // ---- OCR: extract customer/order fields from a photo ----
  async extractFromImage(file) {
    const { base64, mediaType } = await this._toBase64(file);
    // Local guard mirroring the proxy's 2MB limit: the downscaled path
    // stays small, but the raw-file fallback (createImageBitmap unavailable)
    // can exceed it. Failing here with a clear message beats an opaque 413
    // from the proxy — and the caller still falls back to Tesseract.
    if (base64 && (base64.length * 3) / 4 > 2 * 1024 * 1024) {
      return { ok: false, reason: 'too_large', message: 'That photo is too large to analyse — try a sharper, smaller shot' };
    }
    const result = await this._request({
      type: 'ocr',
      model: this.config().ocrModel,
      image: base64,
      mediaType
    }, 30000);

    if (!result.ok) return result;

    const rawText = result.data.text || '';
    const fields = this._parseFields(rawText);
    return { ok: true, fields, rawText, usage: result.data.usage };
  },

  // Claude sometimes wraps its JSON in markdown code fences or adds a line of
  // preamble ("Here you go:"), which breaks a plain JSON.parse and blanks
  // every field even though the extraction is perfect. Work down a ladder:
  // raw JSON -> fence-stripped -> first {...} slice -> give up (the raw panel
  // still shows what came back, so nothing is lost).
  _parseFields(rawText) {
    const expected = ['name', 'phone', 'address', 'town', 'city', 'postcode', 'customerNumber', 'email', 'appointmentDate', 'appointmentTime'];
    const normalize = parsed => {
      const out = {};
      for (const key of expected) {
        out[key] = typeof parsed[key] === 'string' ? parsed[key].trim() : '';
      }
      return out;
    };
    const tryParse = text => {
      try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? normalize(parsed) : null;
      } catch (e) { return null; }
    };

    const direct = tryParse(rawText);
    if (direct) return direct;

    const fencing = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const stripped = tryParse(fencing);
    if (stripped) return stripped;

    const first = rawText.indexOf('{');
    const last = rawText.lastIndexOf('}');
    if (first !== -1 && last > first) {
      const slice = tryParse(rawText.slice(first, last + 1));
      if (slice) return slice;
    }
    return {};
  },

  // ---- draft: personalized follow-up / visit message ----
  async draftMessage(context) {
    const result = await this._request({
      type: 'draft',
      model: this.config().draftModel,
      draftContext: JSON.stringify(context)
    }, 20000);
    if (!result.ok) return result;
    return { ok: true, text: result.data.text || '', usage: result.data.usage };
  },

  // ---- settings: ping the proxy ----
  async testConnection() {
    const started = Date.now();
    const result = await this._request({ type: 'ping' }, 15000);
    if (!result.ok) return result;
    return { ok: true, latencyMs: Date.now() - started, pong: result.data.text, model: result.data.model };
  },

  formatUsage() {
    const u = this.lastUsage;
    if (!u) return null;
    const inTok = u.inputTokens || 0;
    const outTok = u.outputTokens || 0;
    const cost = typeof u.cost === 'number' ? ` · $${u.cost.toFixed(4)}` : '';
    return `${u.type === 'ocr' ? 'Scan' : 'Draft'} · ${u.model} · ${inTok + outTok} tokens${cost}`;
  }
};
