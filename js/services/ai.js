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
    // The shared secret is restored from encrypted device storage into
    // CONFIG.ai.secret during app boot. sessionStorage remains a synchronous
    // fallback for callers that run before that restore completes.
    let secret = ai.secret || '';
    if (!secret) {
      try { secret = sessionStorage.getItem('advisoros_ai_secret') || ''; } catch (e) { /* private mode */ }
    }
    return {
      enabled: !!ai.enabled,
      proxyUrl: ai.proxyUrl || '',
      secret,
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
  // long edge, 0.85 quality. iPhone photos are HEIC, which neither the
  // proxy allowlist (jpeg/png/webp/gif) nor Tesseract can decode — so if
  // createImageBitmap can't decode the file (unsupported format, older
  // iOS), fall back to <img> decoding (iOS decodes HEIC natively there)
  // and re-encode to JPEG. Only if BOTH decoders fail do we send the raw
  // file, which the proxy rejects with a clear message.
  async _toBase64(file) {
    let bitmap = null;
    try {
      bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : null;
    } catch (e) { bitmap = null; }
    if (!bitmap) {
      try {
        bitmap = await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = URL.createObjectURL(file);
        });
      } catch (e) {
        console.warn('AIService: image decode failed, sending raw file', e);
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result).split(',')[1] || '');
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        return { base64, mediaType: file.type || 'image/jpeg' };
      }
    }
    try {
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mediaType: 'image/jpeg' };
    } catch (e) {
      console.warn('AIService: canvas encode failed, sending raw file', e);
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

  // ---- OCR: extract expense-receipt fields from a photo ----
  async extractReceipt(file) {
    const { base64, mediaType } = await this._toBase64(file);
    if (base64 && (base64.length * 3) / 4 > 2 * 1024 * 1024) {
      return { ok: false, reason: 'too_large', message: 'That photo is too large to analyse — try a sharper, smaller shot' };
    }
    const result = await this._request({
      type: 'receipt',
      model: this.config().ocrModel,
      image: base64,
      mediaType
    }, 30000);

    if (!result.ok) return result;

    const rawText = result.data.text || '';
    const fields = this._parseReceipt(rawText);
    return { ok: true, fields, rawText, usage: result.data.usage };
  },

  // Supplier quotes stay attached to the relevant purchasing record. Vision
  // reads only the small set of fields needed to start that workflow; the
  // advisor reviews them before anything is saved.
  async extractSupplierQuote(file) {
    const { base64, mediaType } = await this._toBase64(file);
    if (base64 && (base64.length * 3) / 4 > 2 * 1024 * 1024) {
      return { ok: false, reason: 'too_large', message: 'That quote photo is too large to analyse — try a sharper, smaller shot' };
    }
    const result = await this._request({
      type: 'supplier_quote',
      model: this.config().ocrModel,
      image: base64,
      mediaType
    }, 30000);
    if (!result.ok) return result;
    const rawText = result.data.text || '';
    return { ok: true, fields: this._parseSupplierQuote(rawText), rawText, usage: result.data.usage };
  },

  async extractQuickCapture(file) {
    const { base64, mediaType } = await this._toBase64(file);
    if (base64 && (base64.length * 3) / 4 > 2 * 1024 * 1024) return { ok: false, reason: 'too_large', message: 'That photo is too large to analyse' };
    const result = await this._request({ type: 'quick_capture', model: this.config().ocrModel, image: base64, mediaType }, 30000);
    if (!result.ok) return result;
    const rawText = result.data.text || '';
    return { ok: true, fields: this._parseQuickCapture(rawText), rawText, usage: result.data.usage };
  },

  _parseQuickCapture(rawText) {
    const normalize = value => {
      const kind = ['visit', 'expense'].includes(value.kind) ? value.kind : 'unknown';
      const text = key => typeof value[key] === 'string' ? value[key].trim() : '';
      return { kind, name:text('name'), phone:text('phone'), address:text('address'), town:text('town'), city:text('city'), postcode:text('postcode').toUpperCase(), appointmentDate:text('appointmentDate'), appointmentTime:this._normalizeTimeOrRange(text('appointmentTime')), amount:text('amount').replace(/[^0-9.-]/g, ''), vendor:text('vendor'), expenseDate:text('expenseDate'), description:text('description'), category:text('category').toLowerCase() };
    };
    const parse = text => { try { const value = JSON.parse(text); return value && typeof value === 'object' ? normalize(value) : null; } catch (error) { return null; } };
    return parse(rawText) || parse(String(rawText).replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()) || (() => { const first=String(rawText).indexOf('{'),last=String(rawText).lastIndexOf('}'); return first>=0&&last>first?parse(String(rawText).slice(first,last+1)):null; })() || normalize({});
  },

  _parseSupplierQuote(rawText) {
    const normalize = value => ({
      supplier: typeof value.supplier === 'string' ? value.supplier.trim() : '',
      reference: typeof value.reference === 'string' ? value.reference.trim() : '',
      quoteDate: typeof value.quoteDate === 'string' ? value.quoteDate.trim() : '',
      validUntil: typeof value.validUntil === 'string' ? value.validUntil.trim() : '',
      amount: typeof value.amount === 'string' || typeof value.amount === 'number' ? String(value.amount).replace(/[^0-9.-]/g, '') : '',
      description: typeof value.description === 'string' ? value.description.trim() : ''
    });
    const parse = text => { try { const value = JSON.parse(text); return value && typeof value === 'object' ? normalize(value) : null; } catch (error) { return null; } };
    return parse(rawText)
      || parse(String(rawText).replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim())
      || (() => { const first = String(rawText).indexOf('{'); const last = String(rawText).lastIndexOf('}'); return first >= 0 && last > first ? parse(String(rawText).slice(first, last + 1)) : null; })()
      || normalize({});
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
      // Appointment screens print slots like "3:00 PM - 6:00 PM"; keep the
      // whole range so the visit lands in the block, in one canonical shape.
      out.appointmentTime = this._normalizeTimeOrRange(out.appointmentTime);
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

  // Appointment time arrives as "15:00", "3:00 PM" or a slot range like
  // "3:00 PM - 6:00 PM" / "3pm to 6pm". Canonicalize to "HH:MM" or
  // "HH:MM-HH:MM" (24h); anything unparseable passes through untouched so
  // the raw value is never silently lost.
  _normalizeTimeOrRange(value) {
    if (!value) return '';
    const v = String(value).trim();
    const to24 = t => {
      let m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?\s*$/);
      let hour, minute, meridian;
      if (m) {
        hour = parseInt(m[1], 10);
        minute = m[2];
        meridian = m[3];
      } else {
        m = t.match(/^(\d{1,2})\s*(AM|PM|am|pm)\s*$/);
        if (!m) return null;
        hour = parseInt(m[1], 10);
        minute = '00';
        meridian = m[2];
      }
      if (meridian) {
        if (hour < 1 || hour > 12) return null;
        if (/pm/i.test(meridian) && hour < 12) hour += 12;
        if (/am/i.test(meridian) && hour === 12) hour = 0;
      }
      if (hour > 23 || parseInt(minute, 10) > 59) return null;
      return `${String(hour).padStart(2, '0')}:${minute}`;
    };

    const parts = v.split(/\s*(?:-|–|—|to|until)\s*/i).filter(Boolean);
    if (parts.length === 2) {
      const start = to24(parts[0]);
      const end = to24(parts[1]);
      if (start && end && end > start) return `${start}-${end}`;
    }
    if (parts.length === 1) {
      const single = to24(parts[0]);
      if (single) return single;
    }
    return v;
  },

  // Receipt fields: amount (string, parsed later), vendor, date (ISO),
  // description, and a category guaranteed to be one of the app's real
  // expense category ids — anything Claude invents falls back to "other".
  _parseReceipt(rawText) {
    const validCategories = (CONFIG.expenseCategories || []).map(c => c.id);
    const normalize = parsed => {
      const out = {
        amount: typeof parsed.amount === 'string' ? parsed.amount.trim() : '',
        vendor: typeof parsed.vendor === 'string' ? parsed.vendor.trim() : '',
        date: typeof parsed.date === 'string' ? parsed.date.trim() : '',
        description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
        category: typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase() : ''
      };
      if (!validCategories.includes(out.category)) out.category = 'other';
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
    return { amount: '', vendor: '', date: '', description: '', category: 'other' };
  },

  // ---- draft: personalized follow-up / visit message ----
  // The proxy is told to answer with { nudge, draft_message } JSON (see the
  // Beelo communication spec in docs/Communication.md). Everything else is
  // unchanged: the template remains the starting point, the draft is a
  // suggestion the advisor reviews and edits.
  async draftMessage(context) {
    const result = await this._request({
      type: 'draft',
      model: this.config().draftModel,
      draftContext: JSON.stringify(context)
    }, 20000);
    if (!result.ok) return result;
    const rawText = result.data.text || '';
    const parsed = this._parseDraft(rawText);
    return { ok: true, text: parsed.draft_message || rawText, nudge: parsed.nudge || '', rawText, usage: result.data.usage };
  },

  // Optional phrasing for Home's customer brief. The caller supplies only
  // already-extracted operational facts — never names, phone numbers,
  // addresses, postcodes or raw Customer 360 records.
  async customerBrief({ facts = [] } = {}) {
    const safeFacts = facts.map(v => String(v || '').trim()).filter(Boolean).slice(0, 5);
    if (!safeFacts.length) return { ok: false, reason: 'empty' };
    const result = await this._request({
      type: 'customer_brief',
      model: this.config().draftModel,
      facts: safeFacts
    }, 12000);
    if (!result.ok) return result;
    const parsed = this._parseCustomerBrief(result.data.text || '');
    return parsed ? { ok: true, text: parsed.slice(0, 180), usage: result.data.usage } : { ok: false, reason: 'invalid_response' };
  },

  _parseCustomerBrief(rawText) {
    const parse = text => {
      try {
        const value = JSON.parse(text);
        return value && typeof value.brief === 'string' ? value.brief.trim() : '';
      } catch (e) { return ''; }
    };
    return parse(rawText) || parse(rawText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()) || (() => {
      const start = rawText.indexOf('{'); const end = rawText.lastIndexOf('}');
      return start >= 0 && end > start ? parse(rawText.slice(start, end + 1)) : '';
    })();
  },

  // Claude wraps the draft answer in {nudge, draft_message} JSON — the same
  // fence/preamble ladder as the OCR parsers, since a markdown fence or a
  // "Here you go:" preamble would otherwise blank the draft.
  _parseDraft(rawText) {
    const tryParse = text => {
      try {
        const p = JSON.parse(text);
        if (p && typeof p === 'object' && typeof p.draft_message === 'string') {
          return {
            nudge: typeof p.nudge === 'string' ? p.nudge.trim() : '',
            draft_message: p.draft_message.trim()
          };
        }
      } catch (e) { /* keep walking the ladder */ }
      return null;
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
    return { nudge: '', draft_message: rawText };
  },

  // ---- settings: ping the proxy ----
  async testConnection() {
    const started = Date.now();
    const result = await this._request({ type: 'ping' }, 15000);
    if (!result.ok) return result;
    return { ok: true, latencyMs: Date.now() - started, pong: result.data.text, model: result.data.model };
  },

  // ---- companion fact-panel (rule-built answers do the work; Claude only
  // phrases the reply + suggests the next chip) ----
  async assistantTurn({ snapshot, turnText, history = '' }) {
    const result = await this._request({
      type: 'assistant',
      model: this.config().draftModel,
      snapshot: JSON.stringify(snapshot),
      turnText,
      history
    }, 20000);
    if (!result.ok) return result;
    const parsed = this._parseAssistant(result.data.text || '');
    return {
      ok: true,
      reply: parsed.reply || result.data.text || '',
      suggestions: parsed.suggestions,
      rawText: result.data.text || '',
      usage: result.data.usage
    };
  },

  // Same fence/preamble ladder as the other parsers: Claude should answer
  // with {reply, suggestions} JSON, but a markdown fence or a "Here you go:"
  // preamble must not blank the reply.
  _parseAssistant(rawText) {
    const tryParse = text => {
      try {
        const p = JSON.parse(text);
        if (p && typeof p === 'object' && typeof p.reply === 'string') {
          const allowed = new Set(['today', 'my day', 'week', 'money', 'follow-ups', 'next visit', 'log expense', 'messages', 'orders', 'weather', 'help']);
          const suggestions = Array.isArray(p.suggestions)
            ? p.suggestions.map(s => String(s).trim().toLowerCase()).filter(s => allowed.has(s)).slice(0, 3)
            : [];
          return { reply: p.reply.trim(), suggestions };
        }
      } catch (e) { /* keep walking the ladder */ }
      return null;
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
    return { reply: rawText, suggestions: [] };
  },

  // AI router: classify which rule command answers the advisor's question.
  // The proxy never feeds business data to the model here — the companion
  // runs the real handler after this returns.
  async routeCommand(text) {
    const result = await this._request({
      type: 'route',
      model: this.config().draftModel,
      text: String(text || '')
    }, 12000);
    if (!result.ok) return result;
    const parsed = this._parseRoute(result.data.text || '');
    return {
      ok: true,
      command: parsed.command,
      rawText: result.data.text || '',
      usage: result.data.usage
    };
  },

  _parseRoute(rawText) {
    const allowed = new Set(['today', 'my day', 'week', 'money', 'follow-ups', 'next visit', 'log expense', 'messages', 'orders', 'weather', 'person', 'help', 'greeting', 'default']);
    const tryParse = text => {
      try {
        const p = JSON.parse(text);
        if (p && typeof p === 'object' && typeof p.command === 'string') {
          const command = p.command.trim().toLowerCase();
          return allowed.has(command) ? { command } : { command: 'default' };
        }
      } catch (e) { /* keep walking the ladder */ }
      return null;
    };
    let parsed = tryParse(rawText);
    if (!parsed) {
      const fenced = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
      parsed = tryParse(fenced);
    }
    if (!parsed) {
      const first = rawText.indexOf('{');
      const last = rawText.lastIndexOf('}');
      if (first !== -1 && last > first) parsed = tryParse(rawText.slice(first, last + 1));
    }
    return parsed || { command: 'default' };
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
