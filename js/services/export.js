/* ============================================
   ADVISOROS v5.0 — EXPORT SERVICE
   CSV, PDF, JSON backup
   ============================================ */

const ExportService = {
  // Track last backup for UI
  _LAST_BACKUP_KEY: 'beelo_last_backup',

  // Record last backup metadata
  async _recordBackup(backup) {
    try {
      const data = await DB.exportAll();
      const counts = {};
      let totalRecords = 0;
      let photoCount = 0;
      for (const [table, rows] of Object.entries(backup.data || {})) {
        if (Array.isArray(rows)) {
          counts[table] = rows.length;
          totalRecords += rows.length;
          if (table === 'photos') photoCount = rows.length;
        }
      }
      const meta = {
        timestamp: new Date().toISOString(),
        totalRecords,
        photoCount,
        tableCounts: counts,
        backupVersion: 1,
        filename: `beelo_backup_${Utils.formatDateUK(new Date(), 'iso')}.json`
      };
      localStorage.setItem(this._LAST_BACKUP_KEY, JSON.stringify(meta));
      return meta;
    } catch (e) {
      console.warn('Failed to record backup metadata:', e);
      return null;
    }
  },

  // Get last backup metadata
  getLastBackupMeta() {
    try {
      const stored = localStorage.getItem('beelo_last_backup');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  },

  // Check if backup is stale (older than 14 days)
  isBackupStale() {
    const meta = this.getLastBackupMeta();
    if (!meta) return true;
    const daysSince = (Date.now() - new Date(meta.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 14;
  },

  // Get human-readable backup age
  getBackupAgeLabel() {
    const meta = this.getLastBackupMeta();
    if (!meta) return 'Never backed up';
    const daysSince = Math.floor((Date.now() - new Date(meta.timestamp).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince === 0) return 'Today';
    if (daysSince === 1) return 'Yesterday';
    if (daysSince < 7) return `${daysSince} days ago`;
    if (daysSince < 14) return `${Math.floor(daysSince / 7)} week${daysSince < 14 ? '' : 's'} ago`;
    if (daysSince < 30) return `${Math.floor(daysSince / 7)} weeks ago`;
    return `${Math.floor(daysSince / 30)} month${daysSince < 60 ? '' : 's'} ago`;
  },

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

    this.downloadFile(csv, `${tableName}_${Utils.formatDateUK(new Date(), 'iso')}.csv`, 'text/csv');
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
      appVersion: CONFIG.appVersion || '5.0',
      version: CONFIG.appVersion || '5.0',
      exportedAt: new Date().toISOString(),
      config: this._sanitizeConfig(CONFIG),
      data
    };

    const json = JSON.stringify(backup, null, 2);
    this.downloadFile(
      json,
      `beelo_backup_${Utils.formatDateUK(new Date(), 'iso')}.json`,
      'application/json'
    );

    // Record backup metadata for UI
    await this._recordBackup(backup);

    Toast.show('Backup saved to your downloads', 'success');
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

  // Import from JSON backup with user-friendly errors
  async importBackup(file) {
    const text = await file.text();
    let backup;
    try {
      backup = JSON.parse(text);
    } catch (e) {
      throw new Error('This file is not a valid Beelo backup (not valid JSON)');
    }

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
      throw new Error('This backup is from an incompatible version of Beelo. Please update the app and try again.');
    }
    if (formatVersion > BACKUP_FORMAT_VERSION) {
      throw new Error('This backup was created by a newer version of Beelo — please update the app first');
    }
    if (!backup.data || typeof backup.data !== 'object') {
      throw new Error('This backup file appears to be empty or corrupt');
    }

    // Show preview of what will be restored
    const counts = {};
    let totalRecords = 0;
    for (const [table, rows] of Object.entries(backup.data || {})) {
      if (Array.isArray(rows)) {
        counts[table] = rows.length;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // In browser, show confirmation dialog; in tests, skip confirmation
    if (typeof window !== 'undefined' && typeof confirm === 'function') {
      const confirmMsg = `Restore this backup?\n\n` +
        `Created: ${Utils.formatDateUK(new Date(backup.exportedAt), 'long')} ${Utils.formatTimeUK(new Date(backup.exportedAt))}\n` +
        `Records: ~${total} (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')})\n\n` +
        `⚠️ This will REPLACE all data on this device.`;

      if (!confirm(confirmMsg)) {
        throw new Error('Restore cancelled');
      }
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

    Toast.show('Backup restored successfully', 'success');
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
