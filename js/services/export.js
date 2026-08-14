/* ============================================
   ADVISOROS v5.0 — EXPORT SERVICE
   CSV, PDF, JSON backup
   ============================================ */

const ExportService = {
  // Export to CSV
  async exportCSV(tableName, filters = {}) {
    const data = await DB.db[tableName].toArray();

    if (data.length === 0) return null;

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      )
    ].join('\n');

    this.downloadFile(csv, `${tableName}_${Utils.formatDate(new Date(), 'iso')}.csv`, 'text/csv');
    return csv;
  },

  // Export tax summary as a downloadable HTML file (open it to view/print).
  // Previously used window.open() on a blob URL, which doesn't actually
  // download anything and is known to silently fail in standalone iOS PWAs -
  // the download icon promised a download it didn't deliver.
  async exportTaxSummary() {
    const taxYear = TaxCalculator.getCurrentTaxYear();
    const summary = await TaxCalculator.getRunningEstimate();
    const formatted = TaxCalculator.formatSummary(summary);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Tax Summary ${taxYear.label}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
    h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .section { margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .total { font-weight: bold; font-size: 18px; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; }
    .highlight { color: #d32f2f; }
  </style>
</head>
<body>
  <h1>Tax Summary ${taxYear.label}</h1>
  <p>Generated: ${new Date().toLocaleDateString('en-GB')}</p>

  <div class="section">
    <div class="row"><span>Total Income</span><span>${formatted.income}</span></div>
    <div class="row"><span>Total Expenses</span><span>${formatted.expenses}</span></div>
    <div class="row"><span>Mileage Claim</span><span>${formatted.mileage}</span></div>
    <div class="row total"><span>Taxable Profit</span><span>${formatted.profit}</span></div>
  </div>

  <div class="section">
    <div class="row"><span>Income Tax</span><span>${formatted.incomeTax}</span></div>
    <div class="row"><span>Class 4 NIC</span><span>${formatted.class4NIC}</span></div>
    <div class="row total highlight"><span>Total Tax Due</span><span>${formatted.taxDue}</span></div>
  </div>

  <div class="section">
    <div class="row"><span>Due 31 January</span><span class="highlight">${formatted.jan31}</span></div>
    <div class="row"><span>Due 31 July</span><span>${formatted.jul31}</span></div>
    <div class="row"><span>Recommended Weekly Save</span><span>${formatted.weeklySave}</span></div>
  </div>

  <p style="margin-top: 40px; font-size: 12px; color: #666;">
    This is an estimate for planning purposes. Please verify with your accountant before filing.
  </p>
</body>
</html>`;

    this.downloadFile(html, `tax_summary_${taxYear.label.replace(/\//g, '-')}.html`, 'text/html');
    return html;
  },

  // Full JSON backup
  // Backup envelope (backupFormatVersion 1):
  //   {
  //     backupFormatVersion: 1,     // the backup FILE format — bump on layout change
  //     databaseSchemaVersion: 2,   // the app's DB schema at export time
  //     appVersion: '5.0',
  //     version: '5.0',             // legacy field, kept for older app builds
  //     exportedAt: <ISO>,
  //     config: <sanitized CONFIG>, // no secrets (proxy key) travel in the file
  //     data: { ...DB.exportAll() } // all 10 tables, incl. photos & settings
  //   }
  // The format version is deliberately separate from the DB schema version:
  // a future schema bump doesn't have to change the file layout, and a
  // layout change doesn't imply a schema change.
  async exportBackup() {
    const data = await DB.exportAll();
    const backup = {
      backupFormatVersion: 1,
      databaseSchemaVersion: DB.schemaVersion ? DB.schemaVersion() : 2,
      appVersion: '5.0',
      version: '5.0',
      exportedAt: new Date().toISOString(),
      config: this._sanitizeConfig(CONFIG),
      data
    };

    const json = JSON.stringify(backup, null, 2);
    this.downloadFile(
      json,
      `advisoros_backup_${Utils.formatDate(new Date(), 'iso')}.json`,
      'application/json'
    );

    return backup;
  },

  // The backup file must never carry secrets: the AI proxy key is
  // device-local credential material and stays out of the exported config.
  // (JSON.stringify drops undefined, so the copy keeps the key shape but not
  // the value.)
  _sanitizeConfig(config) {
    const clean = { ...config };
    if (clean.ai && typeof clean.ai === 'object') {
      clean.ai = { ...clean.ai, secret: undefined };
    }
    return clean;
  },

  // Import from JSON backup
  async importBackup(file) {
    const text = await file.text();
    const backup = JSON.parse(text);

    // Backup format compatibility. Format 1 covers both the explicit
    // backupFormatVersion field (new exports) and the legacy '4.0'/'5.0'
    // version field (old exports, whose data simply lacks photos/settings/
    // sequences — importAll treats missing tables as empty).
    const BACKUP_FORMAT_VERSION = 1;
    const legacyOk = ['4.0', '5.0'].includes(backup.version);
    const formatVersion = typeof backup.backupFormatVersion === 'number'
      ? backup.backupFormatVersion
      : (legacyOk ? BACKUP_FORMAT_VERSION : null);
    if (formatVersion === null) {
      throw new Error('Incompatible backup version');
    }
    if (formatVersion > BACKUP_FORMAT_VERSION) {
      throw new Error('This backup was created by a newer version of the app — please update first');
    }
    if (!backup.data || typeof backup.data !== 'object') {
      throw new Error('Backup file is corrupt: no data found');
    }

    await DB.importAll(backup.data);

    if (backup.config) {
      // A backup file must never be able to inject arbitrary config: only
      // keys that already exist in the running CONFIG get applied, and only
      // when the incoming value's type matches the current one. (Legitimate
      // backups were exported from CONFIG itself, so every real key survives
      // this filter unchanged — corrupt or malicious files can't smuggle in
      // new settings like a disabled AI or a zeroed deposit rule.)
      for (const [key, value] of Object.entries(backup.config)) {
        if (!(key in CONFIG)) continue;
        if (value === null || value === undefined) continue;
        if (typeof value !== typeof CONFIG[key]) continue;
        if (key === 'ai' && value && typeof value === 'object') {
          // The proxy secret is device-local credential material: a backup
          // never carries it (see _sanitizeConfig) and must never overwrite
          // the one already configured on this device.
          CONFIG[key] = { ...value, secret: CONFIG[key].secret || '' };
        } else {
          CONFIG[key] = value;
        }
      }
      if (App.migrateConfig) App.migrateConfig();
      const savedConfig = {
        advisorName: CONFIG.advisorName,
        companyName: CONFIG.companyName || '',
        businessAddress: CONFIG.businessAddress || '',
        businessLatLng: CONFIG.businessLatLng || null,
        weeklyTarget: CONFIG.weeklyTarget,
        weeklySalesTarget: CONFIG.weeklySalesTarget,
        advisorMode: CONFIG.advisorMode,
        trade: CONFIG.trade,
        country: CONFIG.country,
        currency: CONFIG.currency,
        taxSystem: CONFIG.taxSystem,
        dateFormat: CONFIG.dateFormat,
        distanceUnit: CONFIG.distanceUnit,
        measurementUnit: CONFIG.measurementUnit,
        commission: CONFIG.commission,
        onboardingComplete: CONFIG.onboardingComplete !== false
      };
      localStorage.setItem('advisoros_config', JSON.stringify(savedConfig));
      await DB.setSetting('config', savedConfig);
    }

    return backup;
  },

  // Download helper
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Share via device share sheet
  async share(data) {
    if (navigator.share) {
      await navigator.share(data);
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(data.text || data.url || '');
      Toast.show('Copied to clipboard', 'success');
    }
  }
};
