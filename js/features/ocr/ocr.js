/* ============================================
   ADVISOROS v5.0 — OCR FEATURE
   Document scanning, text extraction
   ============================================ */

const OCRFeature = {
  id: 'ocr',
  name: 'Scan',
  icon: 'document_scanner',
  route: false,
  extractedData: null,
  tesseractLoading: false,

  tesseractLoadFailed: false,

  init() {
    this.loadTesseract();
  },

  // Loads the Tesseract CDN script if it isn't already loaded or loading.
  // Callable again later (e.g. from processImage) so a failed load — say the
  // app was opened offline — doesn't disable OCR for the rest of the session
  // once connectivity comes back; previously this only ever ran once, at
  // feature init, with no way to retry.
  loadTesseract() {
    if (window.Tesseract || this.tesseractLoading) return;
    this.tesseractLoading = true;
    this.tesseractLoadFailed = false;
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/tesseract.js@4/dist/tesseract.min.js';
    script.onload = () => {
      console.log('Tesseract loaded');
      this.tesseractLoading = false;
    };
    script.onerror = () => {
      console.error('Tesseract failed to load');
      this.tesseractLoading = false;
      this.tesseractLoadFailed = true;
    };
    document.head.appendChild(script);
  },

  render() {
    return `<div class="fade-in">
      <div class="top-header">
        <button class="btn btn-ghost btn-sm" onclick="App.navigate('appointments', {action: 'add'})"><span class="material-symbols-rounded">arrow_back</span></button>
        <h1 style="flex:1;text-align:center;font-size:18px;">Scan Document</h1>
        <div style="width:40px;"></div>
      </div>
      <div style="padding:16px;">
        <div style="text-align:center;padding:32px 24px;">
          <span class="material-symbols-rounded" style="font-size:64px;color:var(--text-tertiary);margin-bottom:16px;">document_scanner</span>
          <div style="font-weight:600;margin-bottom:8px;">Capture from Order Screenshot or Business Card</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:24px;">Take a photo and we'll extract the details automatically</div>
          <button class="btn btn-primary btn-lg btn-block" onclick="document.getElementById('ocr-input').click()">
            <span class="material-symbols-rounded">photo_camera</span>Take Photo
          </button>
          <input type="file" id="ocr-input" accept="image/*" capture="environment" style="display:none;" onchange="OCRFeature.processImage(event)">
        </div>
        <div id="ocr-result" style="display:none;">
          <div class="divider-text">Extracted Data</div>
          <div class="card"><div id="ocr-fields"></div><button class="btn btn-primary btn-block" style="margin-top:16px;" onclick="OCRFeature.saveToCustomer()">Save to Customer</button></div>
        </div>
        <div id="ocr-loading" style="display:none;text-align:center;padding:48px;">
          <div class="skeleton" style="width:48px;height:48px;border-radius:50%;margin:0 auto 16px;"></div>
          <div style="color:var(--text-secondary);">Reading document...</div>
        </div>
        <div id="ocr-manual" style="display:none;">
          <div class="divider-text">Enter Manually</div>
          <div class="card">
            <div class="form-group"><label>Name</label><input type="text" class="input" id="ocr-manual-name" placeholder="Customer name"></div>
            <div class="form-group"><label>Phone</label><input type="tel" class="input" id="ocr-manual-phone" placeholder="Phone number"></div>
            <div class="form-group"><label>Address</label><input type="text" class="input" id="ocr-manual-address" placeholder="Address"></div>
            <button class="btn btn-primary btn-block" onclick="OCRFeature.saveManual()">Save Customer</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  async processImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('ocr-loading').style.display = 'block';
    document.getElementById('ocr-result').style.display = 'none';
    document.getElementById('ocr-manual').style.display = 'none';

    // If the previous load attempt failed (e.g. app was opened offline),
    // retry now — connectivity may have returned since then.
    if (!window.Tesseract && this.tesseractLoadFailed) {
      this.loadTesseract();
    }

    // Wait for Tesseract if loading
    let attempts = 0;
    while ((!window.Tesseract) && attempts < 30 && this.tesseractLoading) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!window.Tesseract) {
      document.getElementById('ocr-loading').style.display = 'none';
      document.getElementById('ocr-manual').style.display = 'block';
      Toast.show('OCR unavailable. Please enter details manually.', 'warning');
      return;
    }

    try {
      const result = await this.withTimeout(
        Tesseract.recognize(file, 'eng'),
        15000,
        'OCR timed out'
      );

      // The Hillarys screens Riaz scans put a real address card on the left
      // and a Google Map on the right - and that map has its own baked-in
      // text (road names, place labels, "WRONG LOCATION? PRESS TO FIX", the
      // Google logo) that a flat text dump can't distinguish from the actual
      // address. Tesseract gives per-line bounding boxes, so if that data's
      // present, build a left-column-only text stream from lines whose left
      // edge sits in roughly the left half of the photo, and use THAT
      // specifically for address extraction - it's the one field actually
      // vulnerable to map content bleeding in. Everything else (name, phone,
      // customer number, email, date/time) lives in the full-width header,
      // so it isn't affected and keeps using the full text as before.
      let leftColumnText = '';
      try {
        const bitmap = await createImageBitmap(file);
        const imageWidth = bitmap.width;
        const ocrLines = result.data.lines || [];
        if (imageWidth && ocrLines.length) {
          leftColumnText = ocrLines
            .filter(l => l.bbox && l.bbox.x0 < imageWidth * 0.55)
            .map(l => l.text)
            .join('\n');
        }
      } catch (e) {
        // createImageBitmap unsupported, or Tesseract didn't return line bboxes
        // this run - fall through and just use the full text for address too.
      }

      this.extractedData = this.parseText(result.data.text, leftColumnText);
      this.lastRawText = result.data.text;
      document.getElementById('ocr-loading').style.display = 'none';
      document.getElementById('ocr-result').style.display = 'block';

      // Always show Name (it's required to save) even if extraction came up
      // empty, so a miss is an obviously-blank editable field, not a silently
      // vanished one - which is exactly what made this confusing to spot last time.
      const orderedKeys = ['name', 'phone', 'address', 'customerNumber', 'email', 'appointmentDate', 'appointmentTime'];
      const fieldsHtml = orderedKeys
        .filter(k => k === 'name' || this.extractedData[k])
        .map(k => {
          const v = this.extractedData[k] || '';
          return `<div class="form-group"><label style="text-transform:capitalize;">${Utils.escapeHtml(k.replace(/([A-Z])/g,' $1').trim())}</label><input type="text" class="input" id="ocr-${Utils.escapeAttr(k)}" value="${Utils.escapeAttr(v)}"></div>`;
        }).join('');
      document.getElementById('ocr-fields').innerHTML = fieldsHtml;

      // Collapsible raw text - if a field's wrong or missing, this shows exactly
      // what Tesseract actually read, so it's fixable on the spot rather than a guess.
      const rawTextHtml = `
        <details style="margin-top:12px;">
          <summary style="cursor:pointer;color:var(--text-secondary);font-size:13px;">Show raw scanned text</summary>
          <pre style="white-space:pre-wrap;font-size:12px;color:var(--text-secondary);background:var(--bg-secondary,#00000011);padding:8px;border-radius:8px;margin-top:8px;max-height:200px;overflow-y:auto;">${Utils.escapeHtml(this.lastRawText || '')}</pre>
        </details>
      `;
      document.getElementById('ocr-fields').insertAdjacentHTML('afterend', rawTextHtml);
    } catch(err) {
      document.getElementById('ocr-loading').style.display = 'none';
      document.getElementById('ocr-manual').style.display = 'block';
      const timedOut = err && err.message === 'OCR timed out';
      Toast.show(timedOut ? 'OCR taking too long — please enter details manually.' : 'OCR failed. Please enter manually.', 'error');
    }
  },

  // Races a promise against a timeout so a slow/hung external call (Tesseract downloading
  // its core+language files on first use) can't leave the UI stuck indefinitely.
  withTimeout(promise, ms, timeoutMessage = 'Timed out') {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms))
    ]);
  },

  // Lines that are screen furniture, not customer data - seen across CRM/job
  // screens (Hillarys' app included). Extend this list if new screens surface
  // other recurring headers/nav labels that get mistaken for real fields.
  UI_CHROME: [
    'customer details', 'address details', 'appointment details', 'scan document',
    'extracted data', 'save to customer', 'enter manually', 'take a photo',
    'capture from order screenshot or business card', 'wrong location',
    'send text notification', 'contacted customer', 'home', 'visits', 'money',
    'talk', 'tools', 'interest', 'other / dont know', 'other / don\'t know'
  ],

  isChrome(line) {
    const l = line.toLowerCase().trim();
    if (this.UI_CHROME.includes(l)) return true;
    // Generic section-header shape: "X Details" / "X details" with nothing else on the line
    if (/^[a-z]+\s+details$/i.test(l)) return true;
    return false;
  },

  parseText(text, leftColumnText = '') {
    const rawLines = text.split('\n').map(l => l.trim()).filter(l => l);
    const lines = rawLines.filter(l => !this.isChrome(l));
    const data = { name: '', phone: '', address: '', customerNumber: '', email: '', appointmentDate: '', appointmentTime: '' };

    const phoneRe = /(\+?44\s?)?(\(?\d{5}\)?\s?\d{3}\s?\d{3}|\(?\d{4}\)?\s?\d{3}\s?\d{3})/;
    const emailRe = /\S+@\S+\.\S+/;
    // Strict-ish UK postcode: outward (1-2 letters, 1-2 digits, optional letter) + inward (digit + 2 letters)
    const postcodeRe = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
    const timeOfDayRe = /\d{1,2}:\d{2}/; // used to disqualify postcode false-matches on timestamp lines

    // ---- Phone & email: first clean match, skipping timestamp-only lines ----
    for (const line of lines) {
      if (!data.phone && phoneRe.test(line)) data.phone = line.match(phoneRe)?.[0] || '';
      if (!data.email && emailRe.test(line)) data.email = line.match(emailRe)?.[0] || '';
    }

    // ---- Address: anchor on a genuine postcode line, then pull the 1-3 lines
    // immediately above it (street, town) rather than trusting the first
    // vaguely postcode-shaped line in the whole document (which, on a phone
    // screenshot, is often the status bar clock/date, not the real address).
    // Search the left-column-only text when we have it (see processImage) -
    // a screen with a map alongside the address card will otherwise happily
    // anchor on a place name or route label baked into the map image itself. ----
    const addressLines = leftColumnText
      ? leftColumnText.split('\n').map(l => l.trim()).filter(l => l && !this.isChrome(l))
      : lines;
    let postcodeLineIndex = -1;
    for (let i = 0; i < addressLines.length; i++) {
      const line = addressLines[i];
      if (timeOfDayRe.test(line)) continue; // e.g. "15:35 Sun 12 Jul" - not a postcode
      if (phoneRe.test(line) || emailRe.test(line)) continue;
      // Don't require the line to be *only* the postcode - real screens
      // sometimes merge the town name onto the same OCR'd line as the
      // postcode (e.g. "Manchester M14 7ND"), which the old strict check
      // rejected outright, making the whole address silently disappear.
      if (postcodeRe.test(line) && line.length <= 40) {
        postcodeLineIndex = i;
        break;
      }
    }
    let usedAddressLines = new Set();
    if (postcodeLineIndex >= 0) {
      const addressParts = [];
      for (let i = Math.max(0, postcodeLineIndex - 3); i < postcodeLineIndex; i++) {
        const candidate = addressLines[i];
        if (!candidate) continue;
        if (phoneRe.test(candidate) || emailRe.test(candidate) || timeOfDayRe.test(candidate)) continue;
        if (/^[A-Z]{2,}$/.test(candidate.replace(/\s/g, ''))) continue; // all-caps brand/logo line, not an address line
        addressParts.push(candidate);
      }
      addressParts.push(addressLines[postcodeLineIndex]);
      data.address = addressParts.join(', ');
      usedAddressLines = new Set(addressParts);
    }

    // ---- Customer number: prefer an explicit "Customer Number" label, since
    // relying on a bare prefix regex (old version: /(HIL|ADV)\w+/) also matches
    // the word "HILLARYS" itself - a company logo isn't a customer number. ----
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const labelMatch = line.match(/customer\s*number[:\s]*([A-Z0-9-]{4,})?/i);
      if (labelMatch) {
        if (labelMatch[1]) {
          data.customerNumber = labelMatch[1];
        } else if (lines[i + 1] && /^[A-Z0-9-]{4,}$/i.test(lines[i + 1])) {
          data.customerNumber = lines[i + 1];
        }
        if (data.customerNumber) break;
      }
    }
    if (!data.customerNumber) {
      for (const line of lines) {
        // Require digits straight after the prefix so a bare brand word can't match
        const m = line.match(/\b(HIL|ADV)-?\d{3,}\b/i);
        if (m) { data.customerNumber = m[0]; break; }
      }
    }

    // ---- Name: a titled "Mr/Mrs/Ms/Miss/Dr/Mx Firstname Lastname" pattern is a
    // far stronger signal than "first line with a space that isn't a number" -
    // the old heuristic picked up screen headers like "Customer details"
    // before ever reaching the actual name further down the screen.
    // NOT anchored to the whole line (^...$): large stylised header text on a
    // coloured background is exactly the kind of thing Tesseract mis-reads
    // with a stray leading/trailing character, which would silently fail a
    // whole-line match and made the name field vanish entirely (empty fields
    // are hidden, not shown blank). Matching the pattern anywhere in the line
    // and taking just that substring is far more tolerant of that noise. ----
    const titleNameRe = /(Mrs|Miss|Mr|Ms|Mx|Dr)\.?\s*[A-Z][a-z'-]+(\s+[A-Z][a-z'-]+)+/;
    for (const line of lines) {
      const m = line.match(titleNameRe);
      if (m) {
        data.name = m[0].replace(/\s+/g, ' ').trim().replace(/^(Mrs|Miss|Mr|Ms|Mx|Dr)\.?\s*/, '$1 ');
        break;
      }
    }
    if (!data.name) {
      // Fallback: a Title Case run of 2-3 real words (each 3+ letters) found
      // anywhere in the line. Previously this accepted single-letter "words"
      // too, which is how status-bar/icon noise (e.g. stray capital letters
      // OCR'd from small icons, sitting next to a month abbreviation like
      // "Jul") could get picked up as a name - a real first/last name is
      // essentially never 1-2 characters, so requiring 3+ rules that out.
      const monthDayAbbrev = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i;
      const streetSuffixRe = /\b(Road|Street|Avenue|Lane|Drive|Close|Way|Court|Place|Gardens|Grove|Crescent|Terrace|Square|Hill|Park|Row)\b\s*$/i;
      const titleCaseRunRe = /([A-Z][a-z'-]{2,}\s+){1,2}[A-Z][a-z'-]{2,}/;
      for (const line of lines) {
        if (emailRe.test(line) || phoneRe.test(line) || postcodeRe.test(line) || timeOfDayRe.test(line)) continue;
        if (/\bnumber\b/i.test(line)) continue; // label line (Customer Number, Order Number, etc.), never a real name
        if (line.length < 3 || line.length > 40) continue;
        // A line already used to build the address (or one that's shaped like
        // a street address - starts with a house number, or ends in "Road" /
        // "Street" / etc.) is never a person's name, even if it happens to be
        // two Title Case words. Without this, a garbled or missing name
        // header on the real screen silently falls back to grabbing the
        // street name instead - the field ends up populated (looks fine at a
        // glance) but wrong, which is worse than an obviously empty field.
        if (usedAddressLines.has(line)) continue;
        if (/^\d/.test(line.trim())) continue;
        if (streetSuffixRe.test(line)) continue;
        const m = line.match(titleCaseRunRe);
        if (m && m[0].trim().includes(' ') && !m[0].split(/\s+/).some(w => monthDayAbbrev.test(w))) {
          data.name = m[0].trim();
          break;
        }
      }
    }

    // ---- Appointment date: "<Weekday> <day> <Month>", e.g. "Monday 13 July" ----
    const monthNames = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
    const dateRe = new RegExp(`\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})[a-z]*\\b`, 'i');
    for (const line of lines) {
      if (timeOfDayRe.test(line)) continue; // status bar clock, e.g. "15:35 Sun 12 Jul" - not the appointment date
      const m = line.match(dateRe);
      if (m) {
        const day = parseInt(m[2], 10);
        const monthIndex = monthNames.split('|').findIndex(mo => mo.toLowerCase() === m[3].slice(0, 3).toLowerCase());
        if (monthIndex >= 0) {
          const now = new Date();
          let year = now.getFullYear();
          let candidate = new Date(year, monthIndex, day);
          // If that date is more than ~2 months in the past, it's probably next year's occurrence
          if (candidate < now && (now - candidate) / 86400000 > 60) candidate = new Date(year + 1, monthIndex, day);
          data.appointmentDate = Utils.formatDate(candidate, 'iso');
        }
        break;
      }
    }

    // ---- Appointment time: prefer an explicit "Arriving H:MMam/pm" slot start,
    // since that's the actual appointment time, not just any clock-shaped text ----
    const timeRe = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
    let timeMatch = null;
    for (const line of lines) {
      if (/arriv/i.test(line)) { timeMatch = line.match(timeRe); if (timeMatch) break; }
    }
    if (!timeMatch) {
      for (const line of lines) {
        if (/^\d{1,2}:\d{2}\s*(AM|PM)/i.test(line.trim()) || (/time/i.test(line) && timeRe.test(line))) {
          timeMatch = line.match(timeRe);
          if (timeMatch) break;
        }
      }
    }
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2];
      const isPM = /pm/i.test(timeMatch[3]);
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      data.appointmentTime = `${String(hour).padStart(2, '0')}:${minute}`;
    }

    return data;
  },

  // Both save paths were storing postcode/postcodeNormalized as permanently
  // empty strings, regardless of what's actually in the address - this
  // silently broke precise postcode search for every customer saved this
  // way, which is the main way customers get added in this app.
  extractPostcodeFromAddress(address) {
    const m = (address || '').match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i);
    if (!m) return { postcode: '', postcodeNormalized: '' };
    const postcode = m[0].toUpperCase();
    const postcodeNormalized = typeof Utils.normalizePostcode === 'function'
      ? Utils.normalizePostcode(postcode)
      : postcode.replace(/\s/g, '');
    return { postcode, postcodeNormalized };
  },

  async saveToCustomer() {
    const name = document.getElementById('ocr-name')?.value || '';
    const phone = document.getElementById('ocr-phone')?.value || '';
    const address = document.getElementById('ocr-address')?.value || '';
    const date = document.getElementById('ocr-appointmentDate')?.value || '';
    const time = document.getElementById('ocr-appointmentTime')?.value || '';
    if (!name) { Toast.show('Name is required', 'error'); return; }
    try {
      const { postcode, postcodeNormalized } = this.extractPostcodeFromAddress(address);
      await DB.addCustomer({ firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || '', fullName: name, phone, postcodeNormalized, address: { line1: address, postcode, postcodeNormalized }, source: 'company_system' });
      Toast.show('Customer saved', 'success');
      App.navigate('appointments', {action: 'add', name, phone, address, date: date || undefined, time: time || undefined});
    } catch (e) {
      Toast.show('Failed to save customer', 'error');
    }
  },

  async saveManual() {
    const name = document.getElementById('ocr-manual-name').value.trim();
    const phone = document.getElementById('ocr-manual-phone').value.trim();
    const address = document.getElementById('ocr-manual-address').value.trim();
    if (!name) { Toast.show('Name is required', 'error'); return; }
    try {
      const { postcode, postcodeNormalized } = this.extractPostcodeFromAddress(address);
      await DB.addCustomer({ firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || '', fullName: name, phone, postcodeNormalized, address: { line1: address, postcode, postcodeNormalized }, source: 'manual' });
      Toast.show('Customer saved', 'success');
      App.navigate('appointments', {action: 'add', name, phone, address});
    } catch (e) {
      Toast.show('Failed to save customer', 'error');
    }
  }
};

App.registerFeature(OCRFeature);
