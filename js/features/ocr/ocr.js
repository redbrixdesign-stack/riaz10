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
      ${App.renderTopHeader({ 
        title: 'Scan Document', 
        showBack: true, 
        backHref: "appointments?action=add" 
      })}
      <div class="p-md" >
        <div class="center-box" >
          <span class="material-symbols-rounded fs-64 text-tertiary mb-md" >document_scanner</span>
          <div class="fw-600 mb-sm" >Capture from Order Screenshot or Business Card</div>
          <div class="fs-13 text-secondary mb-lg" >Take a photo and we'll extract the details automatically</div>
          <button class="btn btn-primary btn-lg btn-block" onclick="document.getElementById('ocr-input').click()">
            <span class="material-symbols-rounded">photo_camera</span>Take Photo
          </button>
          ${AIService.isEnabled() ? '<div class="fs-12 text-tertiary mt-10" >Photos are analysed by Claude AI — you can turn this off in Settings.</div>' : ''}
          <input type="file" id="ocr-input" accept="image/*" style="display:none;" onchange="OCRFeature.processImage(event)">
        </div>
        <div id="ocr-result" style="display:none;">
          <div class="divider-text">Extracted Data</div>
          <div class="card"><div id="ocr-fields"></div><button class="btn btn-primary btn-block mt-md"  onclick="OCRFeature.saveToCustomer()">Save Customer &amp; Visit</button></div>
        </div>
        <div id="ocr-loading" style="display:none;text-align:center;padding:48px;">
          <div class="skeleton w-48 h-48 round mx-auto mb-md" ></div>
          <div class="text-secondary" id="ocr-loading-text" >Reading document...</div>
        </div>
        <div id="ocr-manual" style="display:none;">
          <div class="divider-text">Enter Manually</div>
          <div class="card">
            <div class="form-group"><label>Name</label><input type="text" class="input" id="ocr-manual-name" placeholder="Customer name"></div>
            <div class="form-group"><label>Phone</label><input type="tel" class="input" id="ocr-manual-phone" inputmode="tel" placeholder="Phone number"></div>
            <div class="form-group"><label>Address</label><input type="text" class="input" id="ocr-manual-address" placeholder="House number and street, town"></div>
            <div class="form-group"><label>Postcode</label><input type="text" class="input text-uppercase" id="ocr-manual-postcode" placeholder="e.g. M14 7FZ" ></div>
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

    // AI path first: Claude Vision reads the photo directly. Any failure
    // (disabled, offline, error, timeout) falls through to Tesseract below,
    // so the feature never regresses when AI isn't available.
    if (AIService.isEnabled()) {
      this.setLoadingText('Reading document with Claude AI…');
      try {
        const ai = await AIService.extractFromImage(file);
        if (ai.ok) {
          this.extractedData = ai.fields || {};
          this.lastRawText = ai.rawText || '';
          this.renderResult();
          return;
        }
        console.warn('AI extraction unavailable, falling back to Tesseract:', ai.reason, ai.message);
        this.setLoadingText('Reading document…');
      } catch (err) {
        console.warn('AI extraction failed, falling back to Tesseract:', err);
        this.setLoadingText('Reading document…');
      }
    }

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
      const result = await Utils.withTimeout(
        Tesseract.recognize(file, 'eng'),
        15000,
        { message: 'OCR timed out' }
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
      this.renderResult();
    } catch(err) {
      document.getElementById('ocr-loading').style.display = 'none';
      document.getElementById('ocr-manual').style.display = 'block';
      const timedOut = err && err.message === 'OCR timed out';
      Toast.show(timedOut ? 'OCR taking too long — please enter details manually.' : 'OCR failed. Please enter manually.', 'error');
    }
  },

  setLoadingText(text) {
    const el = document.getElementById('ocr-loading-text');
    if (el) el.textContent = text;
  },

  // Shared result renderer for both extraction engines (Claude / Tesseract).
  renderResult() {
    document.getElementById('ocr-loading').style.display = 'none';
    document.getElementById('ocr-result').style.display = 'block';

    const orderedKeys = ['name', 'phone', 'address', 'town', 'city', 'postcode', 'customerNumber', 'email', 'appointmentDate', 'appointmentTime'];
    const fieldLabels = { address: 'Address Line 1', town: 'Town', city: 'City' };
    const fieldsHtml = `
      <div id="ocr-save-error" style="display:none;background:var(--danger,#e5484d22);color:var(--danger,#e5484d);border:1px solid var(--danger,#e5484d44);border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:12px;">
        A required field is missing — the highlighted boxes below must be filled in before saving.
      </div>
      ${orderedKeys
        .filter(k => k === 'name' || k === 'postcode' || this.extractedData[k])
        .map(k => {
          const v = this.extractedData[k] || '';
          const upper = k === 'postcode' ? ' style="text-transform:uppercase;"' : '';
          const label = fieldLabels[k] || k.replace(/([A-Z])/g,' $1').trim();
          return `<div class="form-group"><label class="text-capitalize" >${Utils.escapeHtml(label)}</label><input type="text" class="input" id="ocr-${Utils.escapeHtml(k)}" value="${Utils.escapeHtml(v)}"${upper}></div>`;
        }).join('')}`;
    document.getElementById('ocr-fields').innerHTML = fieldsHtml;

    // Collapsible raw text - if a field's wrong or missing, this shows exactly
    // what was actually read, so it's fixable on the spot rather than a guess.
    // A fixed id + cleanup means scanning a second document in the same visit
    // replaces the old block instead of stacking them.
    document.getElementById('ocr-raw-text')?.remove();
    const rawTextHtml = `
      <details class="mt-12" id="ocr-raw-text" >
        <summary class="cursor-pointer text-secondary fs-13" >Show raw scanned text</summary>
        <pre class="raw-text fs-12 text-secondary" >${Utils.escapeHtml(this.lastRawText || '')}</pre>
      </details>
    `;
    document.getElementById('ocr-fields').insertAdjacentHTML('afterend', rawTextHtml);
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

  parseText(text, leftColumnText = '', now = new Date()) {
    const rawLines = text.split('\n').map(l => l.trim()).filter(l => l);
    const lines = rawLines.filter(l => !this.isChrome(l));
    const data = { name: '', phone: '', address: '', town: '', city: '', postcode: '', customerNumber: '', email: '', appointmentDate: '', appointmentTime: '' };

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
    // Strips a trailing cluster of 1-3 stray symbols (icon glyphs, chevrons,
    // the odd misread character) that OCR sometimes tacks onto the end of an
    // otherwise-clean line - e.g. "Fallowfield &" or "Manchester §@". Doesn't
    // touch normal punctuation like a comma or full stop.
    const stripTrailingJunk = (s) => s.replace(/\s+[^\w\s,.'-]{1,3}$/, '').trim();
    if (postcodeLineIndex >= 0) {
      const addressParts = [];
      const rawCandidates = [];
      for (let i = Math.max(0, postcodeLineIndex - 3); i < postcodeLineIndex; i++) {
        const candidate = addressLines[i];
        if (!candidate) continue;
        if (phoneRe.test(candidate) || emailRe.test(candidate) || timeOfDayRe.test(candidate)) continue;
        if (/^[A-Z]{2,}$/.test(candidate.replace(/\s/g, ''))) continue; // all-caps brand/logo line, not an address line
        addressParts.push(stripTrailingJunk(candidate));
        rawCandidates.push(candidate);
      }
      // UK addresses conventionally get their own postcode field, separate
      // from the street/town line (e.g. a driver typing "M14 7FZ" straight
      // into a sat-nav). Split it out here rather than leaving it buried at
      // the end of one long address string. The postcode line sometimes has
      // the town name run into it too (e.g. "Manchester M14 7ND" as a single
      // OCR'd line) - keep that leading text as part of the address rather
      // than silently dropping it.
      const postcodeLine = addressLines[postcodeLineIndex];
      const pcMatch = postcodeLine.match(postcodeRe);
      const beforePostcode = pcMatch ? stripTrailingJunk(postcodeLine.slice(0, pcMatch.index).trim().replace(/[,;]+$/, '')) : '';
      if (beforePostcode) addressParts.push(beforePostcode);
      data.postcode = pcMatch ? pcMatch[0].toUpperCase().replace(/\s+/g, ' ') : '';
      usedAddressLines = new Set(rawCandidates.concat([postcodeLine]));
      // Positional split, matching the normal UK form layout: house/street on
      // its own row, then town, then city - rather than one long comma-joined
      // string the person has to edit as a whole. Whatever's left over (rare -
      // an extra line of noise) folds into the city field rather than being
      // silently dropped.
      data.address = addressParts[0] || '';
      data.town = addressParts[1] || '';
      data.city = addressParts.length > 3 ? addressParts.slice(2).join(', ') : (addressParts[2] || '');
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
      // If the strict title match found nothing, the name header either
      // failed to OCR or genuinely wasn't in frame. On this screen layout a
      // real name only ever appears above the "Customer Number" line -
      // everything after that is address text or, worse, a Google Map
      // rendered alongside it with its own place-name labels ("Eat Meat
      // Halal Steakhouse", park names, road names) that Tesseract reads in
      // the same line sequence. Unbounded, the fallback has previously
      // grabbed a street name and a nearby restaurant's name off the map -
      // both looked like a plausible two-word title case name and both were
      // wrong. Two independent guards against that: restrict to the same
      // left-column-only text used for the address (so right-side map labels
      // are never even in the candidate pool, regardless of where they land
      // in reading order), AND stop at the "Customer Number" boundary. Either
      // guard alone turned out not to be enough on its own - together they
      // leave Name blank rather than guessing when the real header didn't
      // scan, which is the safer failure since the field is always shown
      // and editable regardless.
      const nameSearchPool = leftColumnText
        ? leftColumnText.split('\n').map(l => l.trim()).filter(l => l && !this.isChrome(l))
        : lines;
      const numberLineIdx = nameSearchPool.findIndex(l => /customer\s*number/i.test(l));
      const candidateLines = numberLineIdx >= 0 ? nameSearchPool.slice(0, numberLineIdx) : nameSearchPool;
      for (const line of candidateLines) {
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
    // A real CRM screenshot can carry more than one date — a phone status-bar
    // date, "previous appointment" / "last visit" history lines — and the
    // first match in reading order isn't always the actual appointment (that's
    // how a document reading "Tuesday 11 August" could end up booked on the
    // 10th). So collect every "<Weekday> <day> <Month>" occurrence and rank
    // them: hard-reject weekday/date mismatches (e.g. "Monday 11" when the
    // 11th isn't a Monday), penalise history lines, prefer lines that mention
    // the appointment, and break ties by closeness to today.
    const monthNames = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
    const dateRe = new RegExp(`\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})[a-z]*\\b`, 'i');
    const weekdayIndex = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    let bestDate = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (timeOfDayRe.test(line)) continue; // status bar clock, e.g. "15:35 Sun 12 Jul" - not the appointment date
      const m = line.match(dateRe);
      if (!m) continue;
      const day = parseInt(m[2], 10);
      if (day < 1 || day > 31) continue;
      const monthIndex = monthNames.split('|').findIndex(mo => mo.toLowerCase() === m[3].slice(0, 3).toLowerCase());
      if (monthIndex < 0) continue;
      let year = now.getFullYear();
      const thisYear = new Date(year, monthIndex, day);
      // If that date is more than ~2 months in the past, it's probably next year's occurrence
      let candidate = thisYear;
      if (candidate < now && (now - candidate) / 86400000 > 60) candidate = new Date(year + 1, monthIndex, day);
      // The printed weekday must be the date's actual weekday — but a stale
      // document can refer to next year's occurrence of that date, so check
      // both years before rejecting the line (a mismatch means a stale or
      // typo'd entry, not the appointment).
      const printedWeekday = weekdayIndex[m[1].slice(0, 3).toLowerCase()];
      if (printedWeekday !== thisYear.getDay() && printedWeekday !== new Date(year + 1, monthIndex, day).getDay()) continue;
      const lower = line.toLowerCase();
      // History lines ("Previous appointment:", "Last visit:") must never win —
      // the "appoint/visit" keyword bonus would otherwise cancel the penalty.
      const isHistory = /previous|last|original|cancell|old|past/.test(lower);
      let score = 0;
      if (!isHistory && /appoint|arriv|visit|book|deliver|when|slot/.test(lower)) score += 4;
      if (isHistory) score -= 4;
      if (i === 0) score += 1; // real appointments usually sit near the top header
      const diffDays = Math.abs(now - candidate) / 86400000;
      if (diffDays < 1) score += 3;
      else if (diffDays <= 7) score += 2;
      else if (diffDays <= 31) score += 1;
      if (!bestDate || score > bestDate.score || (score === bestDate.score && i > bestDate.index)) {
        bestDate = { score, index: i, candidate };
      }
    }
    data.appointmentDate = bestDate ? Utils.formatDate(bestDate.candidate, 'iso') : '';

    // ---- Appointment time: an "Arriving" line can print a whole slot
    // ("Arriving 3:00 PM - 6:00 PM") or a single time. Prefer the slot and
    // keep BOTH ends — the visit then lands in that block, not just its
    // start, so the arrival window matches what the customer was promised.
    const rangeRe = /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i;
    const timeRe = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
    let rangeMatch = null;
    let timeMatch = null;
    for (const line of lines) {
      if (/arriv/i.test(line)) {
        rangeMatch = line.match(rangeRe);
        if (rangeMatch) break;
        timeMatch = line.match(timeRe);
        if (timeMatch) break;
      }
    }
    if (!rangeMatch && !timeMatch) {
      const keywordRe = /appoint|arriv|visit|book|deliver|when|slot|time/i;
      for (const line of lines) {
        if (/^\d{1,2}:\d{2}\s*(AM|PM)/i.test(line.trim()) || (keywordRe.test(line) && (rangeRe.test(line) || timeRe.test(line)))) {
          rangeMatch = line.match(rangeRe);
          if (rangeMatch) break;
          timeMatch = line.match(timeRe);
          if (timeMatch) break;
        }
      }
    }
    if (rangeMatch) {
      const start = this._to24h(rangeMatch[1], rangeMatch[2], rangeMatch[3]);
      // A "9:00 AM - 11:00" range prints the meridian once — the second time
      // inherits it. An "9:00 AM - 12:00 PM" range carries its own.
      const end = this._to24h(rangeMatch[4], rangeMatch[5], rangeMatch[6] || rangeMatch[3]);
      data.appointmentTime = start && end && end > start ? `${start}-${end}` : (start || '');
    } else if (timeMatch) {
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

  // Prefers whatever's in the dedicated Postcode field (it's now editable on
  // its own row), but still falls back to pulling one out of the address
  // text - covers manual entry where someone types the postcode straight
  // into the address box out of habit, or a scan where postcode splitting
  // didn't find a clean anchor line.
  resolvePostcode(explicitPostcode, address) {
    if (explicitPostcode && explicitPostcode.trim()) {
      const postcode = explicitPostcode.trim().toUpperCase();
      const postcodeNormalized = typeof Utils.normalizePostcode === 'function'
        ? Utils.normalizePostcode(postcode)
        : postcode.replace(/\s/g, '');
      return { postcode, postcodeNormalized };
    }
    return this.extractPostcodeFromAddress(address);
  },

  // The date field can arrive in several shapes depending on which engine
  // extracted it — "2026-08-11" from Claude, "11 Aug 2026" or a typed edit —
  // and an unexpected shape used to flow straight into new Date(...) where
  // toISOString() would throw and silently fail the whole save.
  normalizeDateField(value) {
    if (!value) return '';
    const v = String(value).trim();
    const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      const y = +iso[1], m = +iso[2], d = +iso[3];
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (dmy) {
      let y = +dmy[3];
      if (y < 100) y += 2000;
      const m = +dmy[2], d = +dmy[1];
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // "Tuesday 11 August" / "Tue 11 Aug 2026" — the generic Date() parser
    // mangles these (V8 turns "Tuesday 11 August" into the year 2001), so
    // parse weekday-prefixed dates explicitly with the current year when no
    // year is printed.
    const wdm = v.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s*(\d{4})?$/i);
    if (wdm) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = months.findIndex(mo => mo.toLowerCase() === wdm[3].slice(0, 3).toLowerCase());
      const y = wdm[4] ? +wdm[4] : new Date().getFullYear();
      const d = new Date(y, monthIndex, +wdm[2]);
      if (monthIndex >= 0 && !isNaN(d)) return Utils.formatDate(d, 'iso');
    }
    const parsed = new Date(v);
    if (!isNaN(parsed)) return Utils.formatDate(parsed, 'iso');
    return '';
  },

  // Safety net against stale-year extraction: neither the AI nor Tesseract
  // is guaranteed to see a year on the document, and a date without one can
  // be resolved against the model's training data instead of reality — a
  // visit booked "11 August" can silently land a year in the past and
  // vanish from Home/Diary. Roll any implausibly old date forward one year
  // at a time (max 5) until it's no longer more than 60 days behind today.
  rollStaleYearForward(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      if (now - d.getTime() <= 60 * 86400000) break;
      d.setFullYear(d.getFullYear() + 1);
    }
    return Utils.formatDate(d, 'iso');
  },

  // Prevents the same document (or the same customer) creating a second
  // visit on the same date — scanning a doc twice, or saving it then
  // re-scanning, used to stack identical appointments in the diary with no
  // warning. Checks by customer id first, then falls back to phone/address
  // matching on the day, which catches duplicates where the phone OCR'd
  // differently on a later pass and a whole new customer row was created
  // instead of reusing the existing one.
  async findExistingVisit(customerId, isoDate, phone, address) {
    const dayStart = new Date(isoDate + 'T00:00:00');
    const byCustomer = await DB.db.appointments.where('customerId').equals(customerId).toArray();
    const existing = byCustomer.find(a => a.status !== 'cancelled' && Utils.isSameDay(new Date(a.date), dayStart));
    if (existing) return existing;
    const phoneNorm = phone ? AppointmentsFeature.normalizePhone(phone) : '';
    const addressNorm = address ? AppointmentsFeature.normalizeBookingText(address) : '';
    if (!phoneNorm && !addressNorm) return null;
    const all = await DB.getAppointmentsForDate(dayStart.toISOString());
    return all.find(a => {
      if (phoneNorm && AppointmentsFeature.normalizePhone(a.phone || '') === phoneNorm) return true;
      if (addressNorm && AppointmentsFeature.normalizeBookingText(a.address || '') === addressNorm) return true;
      return false;
    }) || null;
  },

  // Converts hour/minute/meridian pieces to 24h "HH:MM" (null when invalid).
  _to24h(hour, minute, meridian) {
    let h = parseInt(hour, 10);
    const min = String(minute == null ? 0 : minute).padStart(2, '0');
    if (isNaN(h) || h < 0 || parseInt(min, 10) > 59) return null;
    if (meridian) {
      if (h < 1 || h > 12) return null;
      if (/pm/i.test(meridian) && h < 12) h += 12;
      if (/am/i.test(meridian) && h === 12) h = 0;
    }
    if (h > 23) return null;
    return `${String(h).padStart(2, '0')}:${min}`;
  },

  // A slot time like "15:00-18:00", "3:00 PM - 6:00 PM" or "3pm to 6pm".
  // Returns { start, end } as 24h HH:MM, or null when it isn't a valid range
  // (a single time, garbage, or an end that isn't later than the start).
  splitTimeRange(value) {
    if (!value) return null;
    const v = String(value).trim();
    const m = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
    if (!m) return null;
    const start = this._to24h(m[1], m[2] || '00', m[3]);
    // When only one meridian is printed, the second time shares it.
    const end = this._to24h(m[4], m[5] || '00', m[6] || m[3]);
    if (!start || !end || end <= start) return null;
    return { start, end };
  },

  // The appointment time can arrive as "15:00", "3:00 PM", "15:00:00" or
  // "3pm" depending on the engine — everything except 24h HH:MM breaks
  // new Date(...) and kills the whole save. Normalize to HH:MM, else ''.
  normalizeTimeField(value) {
    if (!value) return '';
    const v = String(value).trim();
    let m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?\s*$/i);
    if (!m) {
      // "3pm" / "3PM" without a colon
      m = v.match(/^(\d{1,2})\s*(AM|PM|am|pm)\s*$/i);
      if (m) {
        let hour = parseInt(m[1], 10);
        if (hour < 1 || hour > 12) return '';
        const isPM = /pm/i.test(m[2]);
        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:00`;
      }
      return '';
    }
    let hour = parseInt(m[1], 10);
    const minute = m[2];
    if (hour > 23) return '';
    if (m[3]) {
      if (hour < 1 || hour > 12) return '';
      const isPM = /pm/i.test(m[3]);
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    }
    return `${String(hour).padStart(2, '0')}:${minute}`;
  },

  // Builds the ISO date for a visit from the normalized fields, falling back
  // to today 09:00 when either is unusable — a bad value must never abort
  // the whole save (that used to surface as a dead-end "Failed to save").
  // A slot range ("15:00-18:00") anchors on its START: the diary plans the
  // exact start while the window itself is stored separately on the visit.
  resolveVisitIso(visitDate, visitTime) {
    const range = this.splitTimeRange(visitTime);
    const time = this.normalizeTimeField(range ? range.start : visitTime) || '09:00';
    let d = new Date(visitDate + 'T' + time);
    if (isNaN(d.getTime())) {
      const fallback = Utils.formatDate(new Date(), 'iso');
      d = new Date(fallback + 'T' + time);
      if (isNaN(d.getTime())) d = new Date(fallback + 'T09:00');
    }
    return { iso: d.toISOString(), time };
  },

  async saveToCustomer() {
    const name = document.getElementById('ocr-name')?.value || '';
    const phone = document.getElementById('ocr-phone')?.value || '';
    const address = document.getElementById('ocr-address')?.value || '';
    const town = document.getElementById('ocr-town')?.value || '';
    const city = document.getElementById('ocr-city')?.value || '';
    const postcodeInput = document.getElementById('ocr-postcode')?.value || '';
    const date = document.getElementById('ocr-appointmentDate')?.value || '';
    const time = document.getElementById('ocr-appointmentTime')?.value || '';
    if (!name) {
      // A missed extraction used to just flash a toast and return — easy to
      // miss mid-demo, which reads as "it didn't save". Point straight at the
      // blank field instead so the fix is obvious.
      const nameField = document.getElementById('ocr-name');
      if (nameField) {
        nameField.style.outline = '2px solid var(--danger, #e5484d)';
        nameField.focus();
        nameField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const banner = document.getElementById('ocr-save-error');
      if (banner) banner.style.display = 'block';
      Toast.show('Name is required — add the customer name above', 'error');
      return;
    }
    try {
      const line1 = [address, town, city].filter(Boolean).join(', ');
      const { postcode, postcodeNormalized } = this.resolvePostcode(postcodeInput, line1);
      // The full string (line1 + town + city + postcode) is what actually
      // goes to the geocoder for routing, since a partial address without
      // its postcode is far more likely to resolve to the wrong place or
      // fail outright - splitting the fields on screen is for the person
      // editing them, not for what gets sent to the map.
      const fullAddress = [line1, postcode].filter(Boolean).join(', ');

      // An order screenshot can belong to a customer already on record —
      // reuse them instead of creating a duplicate, exactly like the
      // New Visit form does.
      let customer = phone ? await DB.db.customers.where('phone').equals(phone).first() : null;
      if (!customer) {
        customer = await DB.addCustomer({ firstName: Utils.firstNameFrom(name), lastName: String(name).trim().replace(Utils.HONORIFICS, '').split(/\s+/).slice(1).join(' ') || '', fullName: name, phone, postcodeNormalized, address: { line1: address, town, city, postcode, postcodeNormalized }, source: 'company_system' });
      }

      // Saving from a scanned document should land the visit in the diary
      // immediately — no second form to stumble over. The extracted date
      // (or today, when only a business card was read) is used as-is.
      const visitDate = this.rollStaleYearForward(this.normalizeDateField(date) || Utils.formatDate(new Date(), 'iso'));
      const visitTime = time || '09:00';

      // A second scan of the same document must not stack a duplicate visit
      // on the same date — open the existing one instead.
      const existing = await this.findExistingVisit(customer.id, visitDate, phone, [address, town, city].filter(Boolean).join(', '));
      if (existing) {
        Toast.show(`${existing.clientName || name} already has a visit that day — opened it instead of saving a duplicate`, 'warning');
        App.navigate('appointments', { id: existing.id });
        return;
      }
      const allowed = typeof AppointmentsFeature?.getAllowedTypesForDate === 'function'
        ? AppointmentsFeature.getAllowedTypesForDate(visitDate + 'T00:00:00')
        : [];
      const type = (allowed && allowed.length ? allowed[0] : CONFIG.appointmentTypes?.[0]?.id) || 'consultation';

      const { iso: dateIso } = this.resolveVisitIso(visitDate, visitTime);

      // A slot time ("15:00-18:00") is a promise, not a pin: record it as
      // the arrival window so the visit lands in the whole block and Talk
      // messages say "at 15:00–18:00". The diary still anchors on the start.
      const range = this.splitTimeRange(visitTime);

      const appointment = await DB.addAppointment({
        customerId: customer.id,
        clientName: name,
        phone,
        address: fullAddress,
        date: dateIso,
        durationSlots: 1,
        type,
        source: 'company_system',
        notes: '',
        status: 'confirmed',
        ...(range ? { arrivalStart: range.start, arrivalEnd: range.end } : {})
      });

      if (typeof MessageScheduler !== 'undefined') MessageScheduler.reschedule();

      // Warn-not-block validation: extracted values are saved as-is (a scan
      // must never dead-end), but obviously off-looking fields get flagged so
      // a bad OCR read isn't silently written into the customer record.
      const issues = this.checkExtractedFields({ phone, postcode, date });
      if (issues.length) {
        Toast.show('Saved, but please double-check: ' + issues.join('; '), 'warning', 6000);
      } else {
        Toast.show('Customer and visit saved', 'success');
      }
      App.navigate('appointments', { id: appointment.id });
      this.offerFriendlyBookingIntro(appointment, type, phone);
    } catch (e) {
      // The raw error (Dexie constraint strings, etc.) is noise to the
      // person on the phone — log the detail, keep the message human.
      console.error('OCR save failed:', e);
      Toast.show('Failed to save — please try again', 'error');
    }
  },

  // A scanned/typed booking must fire the same "send booking confirmation?"
  // message as the diary form — otherwise a booking received from the
  // company system (e.g. a visit for next week or further out) sits silent
  // with no draft and no way to know it owes the customer a message.
  offerFriendlyBookingIntro(appointment, type, phone) {
    if (!phone) return;
    const bookingAskTypes = ['consultation', 'measure', 'fitting', 'review', 'service_call'];
    if (!bookingAskTypes.includes(type)) return;
    if (typeof AppointmentsFeature !== 'undefined' && typeof AppointmentsFeature.offerBookingConfirmation === 'function') {
      try { AppointmentsFeature.offerBookingConfirmation(appointment.id); } catch (e) {
        console.warn('Booking intro offer failed:', e);
      }
    }
  },

  // Shared warn-only sanity checks for scanned/manual fields. Returns a list
  // of human-readable issues (empty when everything looks plausible). Never
  // rejects anything — saving must keep working even when the OCR read badly.
  checkExtractedFields({ phone, postcode, date }) {
    const issues = [];
    if (phone && !Utils.isValidPhone?.(phone)) issues.push('the phone number looks unusual');
    if (postcode && !Utils.isValidPostcode?.(postcode)) issues.push('the postcode looks unusual');
    if (date) {
      const normalized = this.normalizeDateField(date);
      if (!normalized) {
        issues.push('the date couldn\'t be read — booked for today instead');
      } else {
        const farFuture = new Date(normalized + 'T00:00:00');
        if (!isNaN(farFuture.getTime()) && farFuture.getTime() > Date.now() + 730 * 86400000) {
          issues.push('the appointment date is more than 2 years away — please check it');
        }
      }
    }
    return issues;
  },

  async saveManual() {
    const name = document.getElementById('ocr-manual-name').value.trim();
    const phone = document.getElementById('ocr-manual-phone').value.trim();
    const address = document.getElementById('ocr-manual-address').value.trim();
    const postcodeInput = document.getElementById('ocr-manual-postcode')?.value.trim() || '';
    if (!name) { Toast.show('Name is required', 'error'); return; }
    try {
      const { postcode, postcodeNormalized } = this.resolvePostcode(postcodeInput, address);
      const fullAddress = [address, postcode].filter(Boolean).join(', ');

      let customer = phone ? await DB.db.customers.where('phone').equals(phone).first() : null;
      if (!customer) {
        customer = await DB.addCustomer({ firstName: Utils.firstNameFrom(name), lastName: String(name).trim().replace(Utils.HONORIFICS, '').split(/\s+/).slice(1).join(' ') || '', fullName: name, phone, postcodeNormalized, address: { line1: address, postcode, postcodeNormalized }, source: 'manual' });
      }

      // Same rule as the scanned flow: saving a customer books the visit
      // too, so it shows up in the diary and Today immediately. No date
      // was captured from a manual card, so it defaults to today at 09:00 —
      // tap the visit to reschedule if the real one is different.
      const visitDate = Utils.formatDate(new Date(), 'iso');

      // Never stack a second visit for the same customer on the same day.
      const existing = await this.findExistingVisit(customer.id, visitDate, phone, address);
      if (existing) {
        Toast.show(`${existing.clientName || name} already has a visit today — opened it instead of saving a duplicate`, 'warning');
        App.navigate('appointments', { id: existing.id });
        return;
      }
      const allowed = typeof AppointmentsFeature?.getAllowedTypesForDate === 'function'
        ? AppointmentsFeature.getAllowedTypesForDate(visitDate + 'T00:00:00')
        : [];
      const type = (allowed && allowed.length ? allowed[0] : CONFIG.appointmentTypes?.[0]?.id) || 'consultation';

      const appointment = await DB.addAppointment({
        customerId: customer.id,
        clientName: name,
        phone,
        address: fullAddress,
        date: new Date(visitDate + 'T09:00').toISOString(),
        durationSlots: 1,
        type,
        source: 'manual',
        notes: '',
        status: 'confirmed'
      });

      if (typeof MessageScheduler !== 'undefined') MessageScheduler.reschedule();
      const issues = this.checkExtractedFields({ phone, postcode });
      if (issues.length) {
        Toast.show('Saved, but please double-check: ' + issues.join('; '), 'warning', 6000);
      } else {
        Toast.show('Customer and visit saved', 'success');
      }
      App.navigate('appointments', { id: appointment.id });
      this.offerFriendlyBookingIntro(appointment, type, phone);
    } catch (e) {
      console.error('Manual save failed:', e);
      Toast.show('Failed to save — please try again', 'error');
    }
  }
};

App.registerFeature(OCRFeature);
