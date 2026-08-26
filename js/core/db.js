/* ============================================
   ADVISOROS v5.0 — DATABASE LAYER
   IndexedDB via Dexie.js
   ============================================ */

// Every table a backup can carry. exportAll() and importAll() speak this
// exact list; adding a table here is a backup-format change and must be
// mirrored in the backup envelope's versioning (js/services/export.js).
const DATABASE_SCHEMA_VERSION = 8;
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_TABLES = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications', 'photos', 'leads', 'tasks', 'taskEvents', 'quotes', 'quoteItems', 'jobs', 'checklistTemplates', 'checklistItems', 'checklistResponses', 'jobIssues', 'payments', 'invoices', 'invoiceItems', 'creditNotes', 'documents', 'suppliers', 'products', 'purchaseOrders', 'purchaseOrderItems', 'jobCosts', 'availabilityBlocks', 'financialPolicies', 'retentionRecords', 'contactPreferences', 'communicationEvents', 'integrationLinks', 'integrationConflicts', 'integrationOutbox', 'settings', 'sequences'];

// ============================================
// Field-level encryption (AES-GCM 256-bit, key from passphrase via PBKDF2)
// ============================================
const PII_FIELDS = ['firstName', 'lastName', 'phone', 'email', 'address'];
const ADDRESS_PII_FIELDS = ['line1', 'town', 'city', 'postcode', 'postcodeNormalized'];
// Appointment rows carry their own copy of customer-identifying fields at
// booking time (the visit card shows them without a customer lookup), plus
// notes that routinely hold Access:/Parking: details. Encrypt them at rest
// like customer PII, so a copied IndexedDB file doesn't leak who/where/when.
const APPT_PII_FIELDS = ['clientName', 'phone', 'address', 'notes'];
const LEAD_PII_FIELDS = ['name', 'firstName', 'lastName', 'phone', 'email', 'address', 'notes', 'lossReason'];
const TASK_PII_FIELDS = ['title', 'notes'];
const QUOTE_PII_FIELDS = ['notes', 'termsSnapshot', 'acceptanceName', 'rejectionReason'];
const QUOTE_ITEM_PII_FIELDS = ['description'];
const JOB_PII_FIELDS = ['notes', 'signoffName', 'completionOverrideReason'];
const CHECKLIST_RESPONSE_PII_FIELDS = ['value', 'notes'];
const JOB_ISSUE_PII_FIELDS = ['title', 'description', 'owner', 'resolution'];
const PAYMENT_PII_FIELDS = ['reference', 'notes'];
const INVOICE_PII_FIELDS = ['customerSnapshot', 'terms', 'notes'];
const INVOICE_ITEM_PII_FIELDS = ['description'];
const CREDIT_PII_FIELDS = ['reason', 'itemSnapshot'];
const DOCUMENT_PII_FIELDS = ['filename', 'contentData', 'extractedText'];
const JOB_COST_PII_FIELDS = ['description', 'supplier', 'reference'];
const AVAILABILITY_PII_FIELDS = ['label'];
const RETENTION_PII_FIELDS = ['notes', 'outcome'];
const CONTACT_PREFERENCE_PII_FIELDS = ['notes', 'consentSource'];
const COMMUNICATION_EVENT_PII_FIELDS = ['detail', 'error'];
const INTEGRATION_CONFLICT_PII_FIELDS = ['localSnapshot', 'remoteSnapshot', 'resolutionNotes'];
const INTEGRATION_OUTBOX_PII_FIELDS = ['payload', 'lastError'];
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const DEVICE_AI_SECRET_SETTING = '__device_ai_secret__';

let encryptionKey = null;
let encryptionSalt = null;

async function deriveKey(passphrase, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

async function getOrCreateSalt() {
  if (encryptionSalt) return encryptionSalt;
  const stored = localStorage.getItem('advisoros_enc_salt');
  if (stored) {
    encryptionSalt = new Uint8Array(JSON.parse(stored));
    return encryptionSalt;
  }
  encryptionSalt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem('advisoros_enc_salt', JSON.stringify(Array.from(encryptionSalt)));
  return encryptionSalt;
}

async function initEncryption(passphrase) {
  const salt = await getOrCreateSalt();
  encryptionKey = await deriveKey(passphrase, salt);
  // Verify the key works by encrypting/decrypting a test value
  const test = await encryptField('__test__');
  const decrypted = await decryptField(test);
  if (decrypted !== '__test__') throw new Error('Encryption verification failed');
  return true;
}

function clearEncryptionKey() {
  encryptionKey = null;
}

function hasEncryptionKey() {
  return encryptionKey !== null;
}

async function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  if (typeof plaintext !== 'string') plaintext = String(plaintext);
  if (!encryptionKey) throw new Error('Encryption key not initialized');
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    encoder.encode(plaintext)
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
}

async function decryptField(encrypted) {
  if (!encrypted || typeof encrypted !== 'object') return encrypted;
  if (typeof encrypted === 'string') return encrypted; // already plaintext (legacy)
  if (!encryptionKey) throw new Error('Encryption key not initialized');
  const iv = new Uint8Array(atob(encrypted.iv).split('').map(c => c.charCodeAt(0)));
  const ct = new Uint8Array(atob(encrypted.ct).split('').map(c => c.charCodeAt(0)));
  const decoder = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    ct
  );
  return decoder.decode(plaintext);
}

function isEncrypted(value) {
  return value && typeof value === 'object' && 'iv' in value && 'ct' in value;
}

async function encryptCustomer(customer) {
  const encrypted = { ...customer };
  for (const field of PII_FIELDS) {
    if (field === 'address' && encrypted.address) {
      const addr = { ...encrypted.address };
      for (const afield of ADDRESS_PII_FIELDS) {
        if (addr[afield] !== undefined && addr[afield] !== null && !isEncrypted(addr[afield])) {
          addr[afield] = await encryptField(addr[afield]);
        }
      }
      encrypted.address = addr;
    } else if (encrypted[field] !== undefined && encrypted[field] !== null && !isEncrypted(encrypted[field])) {
      encrypted[field] = await encryptField(encrypted[field]);
    }
  }
  return encrypted;
}

async function decryptCustomer(customer) {
  if (!customer) return customer;
  const decrypted = { ...customer };
  for (const field of PII_FIELDS) {
    if (field === 'address' && decrypted.address) {
      const addr = { ...decrypted.address };
      for (const afield of ADDRESS_PII_FIELDS) {
        if (addr[afield] !== undefined && addr[afield] !== null && isEncrypted(addr[afield])) {
          addr[afield] = await decryptField(addr[afield]);
        }
      }
      decrypted.address = addr;
    } else if (decrypted[field] !== undefined && decrypted[field] !== null && isEncrypted(decrypted[field])) {
      decrypted[field] = await decryptField(decrypted[field]);
    }
  }
  return decrypted;
}

async function migratePlaintextCustomers() {
  if (!encryptionKey) return;
  const customers = await DB.db.customers.toArray();
  let migrated = 0;
  for (const customer of customers) {
    let needsUpdate = false;
    for (const field of PII_FIELDS) {
      if (field === 'address' && customer.address) {
        for (const afield of ADDRESS_PII_FIELDS) {
          if (customer.address[afield] !== undefined && customer.address[afield] !== null && !isEncrypted(customer.address[afield])) {
            needsUpdate = true;
            break;
          }
        }
      } else if (customer[field] !== undefined && customer[field] !== null && !isEncrypted(customer[field])) {
        needsUpdate = true;
      }
      if (needsUpdate) break;
    }
    if (needsUpdate) {
      const encrypted = await encryptCustomer(customer);
      await DB.db.customers.put(encrypted);
      migrated++;
    }
  }
  if (migrated) {
    console.log(`Encrypted ${migrated} customer record(s)`);
  }
}

// Appointment PII — encrypts clientName/phone/address/notes (string fields
// only; non-string values such as latLng are left untouched).
async function encryptAppointment(appointment) {
  const encrypted = { ...appointment };
  for (const field of APPT_PII_FIELDS) {
    const value = encrypted[field];
    if (typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
      encrypted[field] = await encryptField(value);
    }
  }
  return encrypted;
}

async function decryptAppointment(appointment) {
  if (!appointment) return appointment;
  const decrypted = { ...appointment };
  for (const field of APPT_PII_FIELDS) {
    if (isEncrypted(decrypted[field])) {
      decrypted[field] = await decryptField(decrypted[field]);
    }
  }
  return decrypted;
}

async function migratePlaintextAppointments() {
  if (!encryptionKey) return;
  const rows = await DB.db.appointments.toArray();
  let migrated = 0;
  for (const appt of rows) {
    let needsUpdate = false;
    for (const field of APPT_PII_FIELDS) {
      if (typeof appt[field] === 'string' && appt[field].length > 0 && !isEncrypted(appt[field])) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate) {
      await DB.db.appointments.put(await encryptAppointment(appt));
      migrated++;
    }
  }
  if (migrated) {
    console.log(`Encrypted ${migrated} appointment record(s)`);
  }
}

async function encryptStringFields(record, fields) {
  const encrypted = { ...record };
  for (const field of fields) {
    const value = encrypted[field];
    if (typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
      encrypted[field] = await encryptField(value);
    }
  }
  return encrypted;
}

async function decryptStringFields(record, fields) {
  if (!record) return record;
  const decrypted = { ...record };
  for (const field of fields) {
    if (isEncrypted(decrypted[field])) decrypted[field] = await decryptField(decrypted[field]);
  }
  return decrypted;
}

async function encryptLead(lead) {
  const encrypted = await encryptStringFields(lead, LEAD_PII_FIELDS);
  if (lead && lead.address && typeof lead.address === 'object' && !isEncrypted(lead.address)) {
    encrypted.address = await encryptField(JSON.stringify(lead.address));
  }
  return encrypted;
}
async function decryptLead(lead) {
  const decrypted = await decryptStringFields(lead, LEAD_PII_FIELDS);
  if (decrypted && typeof decrypted.address === 'string' && decrypted.address.startsWith('{')) {
    try { decrypted.address = JSON.parse(decrypted.address); } catch (e) { /* legacy free-text address */ }
  }
  return decrypted;
}
const encryptTask = task => encryptStringFields(task, TASK_PII_FIELDS);
const decryptTask = task => decryptStringFields(task, TASK_PII_FIELDS);
const encryptQuote = quote => encryptStringFields(quote, QUOTE_PII_FIELDS);
const decryptQuote = quote => decryptStringFields(quote, QUOTE_PII_FIELDS);
const encryptQuoteItem = item => encryptStringFields(item, QUOTE_ITEM_PII_FIELDS);
const decryptQuoteItem = item => decryptStringFields(item, QUOTE_ITEM_PII_FIELDS);
const encryptJob = job => encryptStringFields(job, JOB_PII_FIELDS);
const decryptJob = job => decryptStringFields(job, JOB_PII_FIELDS);
const encryptChecklistResponse = row => encryptStringFields(row, CHECKLIST_RESPONSE_PII_FIELDS);
const decryptChecklistResponse = row => decryptStringFields(row, CHECKLIST_RESPONSE_PII_FIELDS);
const encryptJobIssue = row => encryptStringFields(row, JOB_ISSUE_PII_FIELDS);
const decryptJobIssue = row => decryptStringFields(row, JOB_ISSUE_PII_FIELDS);
const encryptPayment = row => encryptStringFields(row, PAYMENT_PII_FIELDS);
const decryptPayment = row => decryptStringFields(row, PAYMENT_PII_FIELDS);
async function encryptInvoice(row) { const out = await encryptStringFields(row, INVOICE_PII_FIELDS); if (row?.customerSnapshot && typeof row.customerSnapshot === 'object') out.customerSnapshot = await encryptField(JSON.stringify(row.customerSnapshot)); return out; }
async function decryptInvoice(row) { const out = await decryptStringFields(row, INVOICE_PII_FIELDS); if (typeof out?.customerSnapshot === 'string' && out.customerSnapshot.startsWith('{')) try { out.customerSnapshot = JSON.parse(out.customerSnapshot); } catch (e) {} return out; }
const encryptInvoiceItem = row => encryptStringFields(row, INVOICE_ITEM_PII_FIELDS);
const decryptInvoiceItem = row => decryptStringFields(row, INVOICE_ITEM_PII_FIELDS);
async function encryptCreditNote(row) { const out = await encryptStringFields(row, CREDIT_PII_FIELDS); if (Array.isArray(row?.itemSnapshot)) out.itemSnapshot = await encryptField(JSON.stringify(row.itemSnapshot)); return out; }
async function decryptCreditNote(row) { const out = await decryptStringFields(row, CREDIT_PII_FIELDS); if (typeof out?.itemSnapshot === 'string' && out.itemSnapshot.startsWith('[')) try { out.itemSnapshot = JSON.parse(out.itemSnapshot); } catch (e) {} return out; }
const encryptDocument = row => encryptStringFields(row, DOCUMENT_PII_FIELDS);
const decryptDocument = row => decryptStringFields(row, DOCUMENT_PII_FIELDS);
const encryptJobCost = row => encryptStringFields(row, JOB_COST_PII_FIELDS);
const decryptJobCost = row => decryptStringFields(row, JOB_COST_PII_FIELDS);
const encryptAvailabilityBlock = row => encryptStringFields(row, AVAILABILITY_PII_FIELDS);
const decryptAvailabilityBlock = row => decryptStringFields(row, AVAILABILITY_PII_FIELDS);
const encryptRetentionRecord = row => encryptStringFields(row, RETENTION_PII_FIELDS);
const decryptRetentionRecord = row => decryptStringFields(row, RETENTION_PII_FIELDS);
const encryptContactPreference = row => encryptStringFields(row, CONTACT_PREFERENCE_PII_FIELDS);
const decryptContactPreference = row => decryptStringFields(row, CONTACT_PREFERENCE_PII_FIELDS);
const encryptCommunicationEvent = row => encryptStringFields(row, COMMUNICATION_EVENT_PII_FIELDS);
const decryptCommunicationEvent = row => decryptStringFields(row, COMMUNICATION_EVENT_PII_FIELDS);
async function encryptIntegrationConflict(row) { const copy={...row};for(const field of ['localSnapshot','remoteSnapshot'])if(copy[field]&&typeof copy[field]==='object')copy[field]=JSON.stringify(copy[field]);return encryptStringFields(copy,INTEGRATION_CONFLICT_PII_FIELDS); }
async function decryptIntegrationConflict(row) { const out=await decryptStringFields(row,INTEGRATION_CONFLICT_PII_FIELDS);for(const field of ['localSnapshot','remoteSnapshot'])if(typeof out?.[field]==='string'&&/^[\[{]/.test(out[field]))try{out[field]=JSON.parse(out[field]);}catch(e){}return out; }
async function encryptIntegrationOutbox(row) { const copy={...row};if(copy.payload&&typeof copy.payload==='object')copy.payload=JSON.stringify(copy.payload);return encryptStringFields(copy,INTEGRATION_OUTBOX_PII_FIELDS); }
async function decryptIntegrationOutbox(row) { const out=await decryptStringFields(row,INTEGRATION_OUTBOX_PII_FIELDS);if(typeof out?.payload==='string'&&/^[\[{]/.test(out.payload))try{out.payload=JSON.parse(out.payload);}catch(e){}return out; }

async function migratePlaintextWorkItems() {
  if (!encryptionKey) return;
  for (const [table, fields, encrypt] of [
    ['leads', LEAD_PII_FIELDS, encryptLead],
    ['tasks', TASK_PII_FIELDS, encryptTask],
    ['quotes', QUOTE_PII_FIELDS, encryptQuote],
    ['quoteItems', QUOTE_ITEM_PII_FIELDS, encryptQuoteItem],
    ['jobs', JOB_PII_FIELDS, encryptJob],
    ['checklistResponses', CHECKLIST_RESPONSE_PII_FIELDS, encryptChecklistResponse],
    ['jobIssues', JOB_ISSUE_PII_FIELDS, encryptJobIssue]
    ,['payments', PAYMENT_PII_FIELDS, encryptPayment]
    ,['invoices', INVOICE_PII_FIELDS, encryptInvoice]
    ,['invoiceItems', INVOICE_ITEM_PII_FIELDS, encryptInvoiceItem]
    ,['creditNotes', CREDIT_PII_FIELDS, encryptCreditNote]
    ,['documents', DOCUMENT_PII_FIELDS, encryptDocument]
    ,['jobCosts', JOB_COST_PII_FIELDS, encryptJobCost]
    ,['availabilityBlocks', AVAILABILITY_PII_FIELDS, encryptAvailabilityBlock]
    ,['retentionRecords', RETENTION_PII_FIELDS, encryptRetentionRecord]
    ,['contactPreferences', CONTACT_PREFERENCE_PII_FIELDS, encryptContactPreference]
    ,['communicationEvents', COMMUNICATION_EVENT_PII_FIELDS, encryptCommunicationEvent]
    ,['integrationConflicts', INTEGRATION_CONFLICT_PII_FIELDS, encryptIntegrationConflict]
    ,['integrationOutbox', INTEGRATION_OUTBOX_PII_FIELDS, encryptIntegrationOutbox]
  ]) {
    const rows = await DB.db[table].toArray();
    for (const row of rows) {
      if (fields.some(field => (typeof row[field] === 'string' && row[field].length > 0) || (field === 'address' && row[field] && typeof row[field] === 'object' && !isEncrypted(row[field])))) {
        await DB.db[table].put(await encrypt(row));
      }
    }
  }
}

const DB = {
  db: null,

  // Safe JSON.parse wrapper with debugging for corrupted stored data
  safeJSONParse(str, key) {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch (e) {
      const preview = str.slice(0, 500);
      console.error(`JSON.parse failed for localStorage key "${key}":`, e.message);
      console.error(`Corrupted value preview: ${preview}`);
      try { localStorage.removeItem(key); } catch (err) {}
      throw e;
    }
  },

  async init() {
    // 'advisoros_v6' (NOT 'advisoros_v5'): the old storage engine (the
    // bundled mini-Dexie shim) created its IndexedDB stores without any
    // indexes under the name 'advisoros_v5'. Opening that same database with
    // real Dexie and a declared schema would put the upgrade into
    // unknown-schema territory - risky for user data. Instead we use a fresh
    // database name and copy the old records across once (see
    // _migrateFromLegacyDb), leaving the shim's database untouched as a
    // safety net.
    this.db = new Dexie('advisoros_v6');

    this.db.version(1).stores({
      // Core tables
      customers: '++id, customerNumber, firstName, lastName, phone, email, postcodeNormalized, source, status, createdAt',
      appointments: '++id, customerId, date, type, status, outcome, source, createdAt',
      orders: '++id, customerId, appointmentId, orderNumber, supplierOrderNumber, status, createdAt',
      expenses: '++id, date, category, amount, tripId, createdAt',
      trips: '++id, date, appointmentId, purpose, confirmed, createdAt',
      measurements: '++id, appointmentId, windowName, createdAt',
      communications: '++id, customerId, type, template, sentAt',

      // Settings & config
      settings: 'key',

      // Sequences for numbering
      sequences: 'name'
    });

    // Photos were added after the original v6 store — additive migration, so
    // existing databases keep their data and simply gain the new table.
    this.db.version(DATABASE_SCHEMA_VERSION).stores({
      photos: '++id, customerId, jobId, appointmentId, createdAt',
      appointments: '++id, customerId, jobId, date, type, status, outcome, source, createdAt',
      orders: '++id, customerId, appointmentId, quoteId, orderNumber, supplierOrderNumber, status, createdAt',
      leads: '++id, customerId, appointmentId, status, source, receivedAt, nextActionAt, createdAt',
      tasks: '++id, status, type, dueAt, snoozedUntil, priority, leadId, customerId, appointmentId, orderId, sourceKey, createdAt',
      taskEvents: '++id, taskId, type, occurredAt, idempotencyKey, createdAt',
      quotes: '++id, customerId, appointmentId, quoteNumber, version, status, issueDate, expiryDate, createdAt',
      quoteItems: '++id, quoteId, displayOrder, createdAt',
      jobs: '++id, customerId, orderId, type, status, sourceKey, scheduledStart, scheduledEnd, createdAt',
      checklistTemplates: '++id, visitType, active, createdAt',
      checklistItems: '++id, templateId, required, displayOrder, createdAt',
      checklistResponses: '++id, jobId, appointmentId, checklistItemId, completed, updatedAt',
      jobIssues: '++id, jobId, appointmentId, type, status, dueAt, createdAt'
      ,payments: '++id, customerId, orderId, invoiceId, direction, kind, status, date, operationId, reversesPaymentId, createdAt'
      ,invoices: '++id, customerId, orderId, jobId, invoiceNumber, status, issueDate, dueDate, createdAt'
      ,invoiceItems: '++id, invoiceId, displayOrder, createdAt'
      ,creditNotes: '++id, customerId, invoiceId, creditNumber, status, issueDate, createdAt'
      ,documents: '++id, customerId, type, invoiceId, paymentId, jobId, generatedAt, createdAt'
      ,suppliers: '++id, name, status, createdAt'
      ,products: '++id, supplierId, sku, active, createdAt'
      ,purchaseOrders: '++id, supplierId, orderId, jobId, status, expectedAt, operationId, createdAt'
      ,purchaseOrderItems: '++id, purchaseOrderId, productId, createdAt'
      ,jobCosts: '++id, customerId, orderId, jobId, category, incurredAt, operationId, createdAt'
      ,availabilityBlocks: '++id, type, startAt, endAt, recurringDay, createdAt'
      ,financialPolicies: '++id, effectiveFrom, mode, createdAt'
      ,retentionRecords: '++id, customerId, orderId, jobId, type, status, dueAt, operationId, createdAt'
      ,contactPreferences: '++id, customerId, channel, status, effectiveAt, operationId, createdAt'
      ,communicationEvents: '++id, communicationId, customerId, state, occurredAt, operationId, createdAt'
      ,integrationLinks: '++id, provider, entityType, localId, remoteId, updatedAt'
      ,integrationConflicts: '++id, integrationLinkId, status, detectedAt, operationId, createdAt'
      ,integrationOutbox: '++id, provider, entityType, localId, action, status, nextAttemptAt, operationId, createdAt'
    });

    if (typeof this.db.open === 'function') {
      await this.db.open();
    }

    // Real Dexie doesn't have storageMode; set it so the storage
    // diagnostics (App.verifyStorage, Settings > Data) can report properly.
    if (!this.db.storageMode) {
      this.db.storageMode = ('indexedDB' in window && !!window.indexedDB) ? 'indexedDB' : 'memory';
    }

    // One-time copy of records left in the previous storage engine's
    // database ('advisoros_v5', created by the bundled mini-Dexie shim).
    await this._migrateFromLegacyDb();

    // Initialize sequences if not exist
    await this.initSequences();

    // One-time fixup: earlier versions had duplicate outcome ids that have
    // since been merged (see js/core/config.js). Rewrite any appointments
    // still carrying the old ids so filters/reports don't silently miss them.
    await this.migrateLegacyOutcomes();

    // Legacy sales were recorded as appointment outcomes only (v5-era apps,
    // or any sale logged before the orders table existed) — they never got
    // an order row, so the Orders kanban (driven purely by the orders table)
    // showed ZERO orders for real sales while the Quoted column filled. Turn
    // every sold appointment with no linked order into a proper order record.
    await this.backfillLegacyOrders();

    // One-time migration: encrypt any plaintext customer PII fields
    await migratePlaintextCustomers();

    // One-time migration: encrypt any plaintext appointment PII fields
    await migratePlaintextAppointments();

    await migratePlaintextWorkItems();

    console.log('Database initialized');
  },

  // Creates an order row for every appointment with outcome 'ordered' that
  // does not already have a linked order (by appointmentId). Idempotent —
  // runs on every boot, but the appointmentId link check means it can never
  // duplicate an existing order. Heals existing installed apps whose sales
  // predate the orders table (the phone report: "4 orders but the kanban
  // shows zero").
  async backfillLegacyOrders() {
    let sold = [];
    try { sold = await this.db.appointments.where('outcome').equals('ordered').toArray(); } catch (e) { return; }
    if (!sold.length) return;
    let orders = [];
    try { orders = await this.db.orders.toArray(); } catch (e) { return; }
    const linkedApptIds = new Set(orders.map(o => o.appointmentId).filter(Boolean));
    let created = 0;
    for (const appt of sold) {
      if (linkedApptIds.has(appt.id)) continue;
      const total = Number(appt.value) || 0;
      if (total <= 0 && !appt.customerId) continue; // nothing meaningful to backfill
      const deposit = (typeof App !== 'undefined' && typeof App.calculateDeposit === 'function')
        ? App.calculateDeposit(total)
        : { amount: total > 0 ? Math.round((total * 0.5) * 100) / 100 : 0 };
      const seq = await this.getNextSequence('order');
      const orderNumber = `ORD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
      await this.db.orders.add({
        customerId: appt.customerId || null,
        appointmentId: appt.id,
        orderNumber,
        total,
        depositRequired: deposit.amount,
        depositPaid: 0,
        balanceDue: total,
        status: 'deposit_pending',
        stage: 'ordered',
        supplierOrderNumber: '',
        reviewRequested: false,
        referralRequested: false,
        createdAt: appt.date ? new Date(appt.date).toISOString() : new Date().toISOString()
      });
      linkedApptIds.add(appt.id);
      if (appt.customerId) { try { await this.refreshCustomerTotals(appt.customerId); } catch (e) {} }
      created++;
    }
    if (created) console.log(`Backfilled ${created} legacy order(s) from sold appointments`);
  },

  async migrateLegacyOutcomes() {
    // Straight renames - same meaning, just a merged/renamed id.
    const outcomeRemap = {
      measured_quoted_sold: 'ordered',
      measured_quoted: 'quoted',
      no_sale: 'other_no_sale'
    };

    const legacyIds = Object.keys(outcomeRemap);
    const affected = await this.db.appointments.where('outcome').anyOf(legacyIds).toArray();

    for (const appt of affected) {
      const newOutcome = outcomeRemap[appt.outcome];
      await this.db.appointments.update(appt.id, { outcome: newOutcome });
    }

    // 'measure_only' isn't a straight rename - no quote was actually given,
    // so mapping it to 'quoted' would wrongly trigger quote follow-up
    // messaging. Clear the outcome (visit stays logged, just un-set) and
    // flag it in notes so the history is still visible.
    //
    // IMPORTANT: must use `null` here, NOT `undefined`. Dexie's update()
    // (and the bundled mini-Dexie shim in js/vendor/minidexie.js) implement
    // field updates via Object.assign(target, changes). Object.assign
    // SILENTLY SKIPS properties whose value is `undefined`, so writing
    // `outcome: undefined` was a no-op - the old 'measure_only' value was
    // left untouched, defeating the whole point of this migration. `null`
    // is a real value and properly clears the field.
    const measureOnly = await this.db.appointments.where('outcome').equals('measure_only').toArray();
    for (const appt of measureOnly) {
      const existingNotes = appt.notes || '';
      const flag = '[Legacy outcome: Measure Only - re-review, no quote was given]';
      await this.db.appointments.update(appt.id, {
        outcome: null,
        notes: [existingNotes, flag].filter(Boolean).join('\n\n')
      });
    }

    const total = affected.length + measureOnly.length;
    if (total) {
      console.log(`Migrated ${total} appointment(s) from legacy outcome ids`);
    }
  },

  // One-time migration from the previous storage engine. Everything up to
  // v5.x stored records in an IndexedDB database named 'advisoros_v5'
  // created by the bundled mini-Dexie shim (js/vendor/minidexie.js) - raw
  // object stores, no indexes, same table names. On the first boot of the
  // Dexie-backed version, copy every non-empty table into this database.
  // The old database is left in place untouched as a safety net.
  async _migrateFromLegacyDb() {
    const LEGACY_DB = 'advisoros_v5';
    const FLAG = '__v6_legacy_migrated__';
    if (!('indexedDB' in window)) return;

    try {
      if (await this.getSetting(FLAG)) return;

      const legacyDb = await new Promise((resolve, reject) => {
        const req = indexedDB.open(LEGACY_DB);
        req.onerror = () => reject(req.error);
        req.onblocked = () => {};
        req.onsuccess = () => resolve(req.result);
      });

      const tables = ['customers', 'appointments', 'orders', 'expenses', 'trips', 'measurements', 'communications', 'settings', 'sequences'];
      let copied = 0;
      for (const table of tables) {
        // Never overwrite: this table already has data in the new database
        // (e.g. an import/restore happened before the migration ran).
        if (await this.db[table].count() > 0) continue;

        let rows = null;
        if (legacyDb.objectStoreNames.contains(table)) {
          rows = await new Promise((resolve, reject) => {
            const tx = legacyDb.transaction(table, 'readonly');
            const req = tx.objectStore(table).getAll();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result || []);
          });
        }

        // Users whose browser couldn't open IndexedDB (shim-era fallback)
        // have their rows in localStorage under 'advisoros:<dbName>:<table>'
        // instead of the legacy database. The old shim would only use this
        // path when IDB was genuinely unavailable, so few users have it —
        // but they'd otherwise boot to an empty app with no way back.
        if (!rows || !rows.length) {
          rows = this._readLegacyLocalStorageRows(table);
        }

        if (rows && rows.length) {
          await this.db[table].bulkAdd(rows);
          copied += rows.length;
        }
      }

      // Guard the sequence counters: never start numbering below the highest
      // number the migrated records already carry.
      for (const name of ['customer', 'order']) {
        const seq = await this.db.sequences.get(name);
        if (!seq) continue;
        const prefix = name === 'customer' ? 'CUS-' : 'ORD-';
        const year = new Date().getFullYear();
        const re = new RegExp(`^${prefix}\\d{4}-(\\d+)$`);
        const maxSeq = Math.max(...(await this.db[name + 's'].toArray()).map(r => {
          const m = String(r[name + 'Number'] || '').match(re);
          return m ? parseInt(m[1], 10) : 0;
        }));
        if (maxSeq > seq.value) {
          await this.db.sequences.update(name, { value: maxSeq });
        }
      }

      // Close the legacy connection: leaving it open would block any later
      // version upgrade of that database (and is the kind of connection the
      // old engine itself would have kept around in other tabs).
      legacyDb.close();

      if (copied) {
        console.log(`AdvisorOS: migrated ${copied} record(s) from the previous storage engine`);
      }
      await this.setSetting(FLAG, true);
    } catch (e) {
      // Nothing to migrate, or migration failed - either way the app runs
      // fine with an empty database; don't block startup over it.
      console.warn('AdvisorOS: legacy data migration skipped:', e);
    }
  },

  // Shim-era localStorage fallback rows: 'advisoros:<dbName>:<table>' ->
  // JSON { nextId, rows }. The dbName is unknown to us now, so match any
  // 'advisoros:' key that ends in ':table'.
  _readLegacyLocalStorageRows(table) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('advisoros:') || !key.endsWith(':' + table)) continue;
        const parsed = this.safeJSONParse(localStorage.getItem(key), key);
        if (parsed && Array.isArray(parsed.rows) && parsed.rows.length) {
          return parsed.rows;
        }
      }
    } catch (e) {
      console.warn('AdvisorOS: legacy localStorage read failed for', table, e);
    }
    return null;
  },

  async initSequences() {
    const sequences = ['customer', 'order', 'quote', 'invoice', 'credit'];
    for (const name of sequences) {
      const exists = await this.db.sequences.get(name);
      if (!exists) {
        await this.db.sequences.put({ name, value: 0 });
      }
    }
  },

  async getNextSequence(name) {
    // Real Dexie: increment + read inside ONE readwrite transaction so two
    // interleaved calls can never hand out the same number. (The mini-Dexie
    // shim has no transaction() - fall back to the old update-then-read,
    // which is fine there because its calls are serialized in practice.)
    if (typeof this.db.transaction === 'function') {
      return await this.db.transaction('rw', this.db.sequences, async () => {
        const seq = await this.db.sequences.get(name);
        const next = (seq ? seq.value : 0) + 1;
        await this.db.sequences.put({ name, value: next });
        return next;
      });
    }
    await this.db.sequences.update(name, seq => {
      seq.value += 1;
    });
    const seq = await this.db.sequences.get(name);
    return seq.value;
  },

  async _runWrite(tables, operation) {
    const resolved = tables.map(name => this.db[name]);
    if (typeof this.db.transaction === 'function') {
      return this.db.transaction('rw', resolved, operation);
    }
    return operation();
  },

  async _nextSequenceUnsafe(name) {
    const seq = await this.db.sequences.get(name);
    const next = (seq ? seq.value : 0) + 1;
    await this.db.sequences.put({ name, value: next });
    return next;
  },

  // Customer operations
  async addCustomer(data) {
    const seq = await this.getNextSequence('customer');
    const prefix = 'CUS';
    const customerNumber = `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

    const customer = {
      ...data,
      customerNumber,
      status: 'active',
      totalOrdersValue: 0,
      totalCommission: 0,
      orderCount: 0,
      referralCount: 0,
      referralValue: 0,
      createdAt: new Date().toISOString()
    };

    const encryptedCustomer = await encryptCustomer(customer);
    const id = await this.db.customers.add(encryptedCustomer);
    return { ...encryptedCustomer, id };
  },

  // Deletes the customer plus everything keyed to them - appointments and
  // their measurements and trips, orders, communications, and photos.
  // Customer data is an operational-memory graph: measurements and trips
  // hang off appointments (not the customer row), so the customer's
  // appointment IDs are collected first and used to clear both tables before
  // the appointments themselves go. A customer row alone doesn't show up
  // anywhere by itself; it's always reached through one of these related
  // records, so leaving them behind after "deleting" a customer would just
  // produce orphaned visits/orders that still show a name but silently fail
  // to open (or worse, point at a different customer if IDs get reused).
  // Returns how many of each were removed so the caller can tell the person
  // what actually happened, not just "done".
  async deleteCustomer(customerId) {
    return this._runWrite(
      ['customers', 'appointments', 'orders', 'communications', 'photos', 'measurements', 'trips', 'leads', 'tasks', 'taskEvents', 'quotes', 'quoteItems', 'jobs', 'checklistResponses', 'jobIssues', 'payments', 'invoices', 'invoiceItems', 'creditNotes', 'documents', 'purchaseOrders', 'purchaseOrderItems', 'jobCosts', 'retentionRecords', 'contactPreferences', 'communicationEvents'],
      async () => {
        const [appts, orders, comms] = await Promise.all([
          this.db.appointments.where('customerId').equals(customerId).toArray(),
          this.db.orders.where('customerId').equals(customerId).toArray(),
          this.db.communications.where('customerId').equals(customerId).toArray()
        ]);
        const photoCount = await this.db.photos.where('customerId').equals(customerId).count();
        const apptIds = appts.map(a => a.id);
        const orderIds = orders.map(o => o.id);
        const quotes = await this.db.quotes.where('customerId').equals(customerId).toArray();
        const quoteIds = quotes.map(q => q.id);
        const jobs = await this.db.jobs.where('customerId').equals(customerId).toArray();
        const jobIds = jobs.map(j => j.id);
        const purchaseOrders = (await this.db.purchaseOrders.toArray()).filter(row => orderIds.includes(row.orderId) || jobIds.includes(row.jobId));
        const purchaseOrderIds = purchaseOrders.map(row => row.id);
        const invoices = await this.db.invoices.where('customerId').equals(customerId).toArray(); const invoiceIds=invoices.map(i=>i.id);
        const leads = await this.db.leads.where('customerId').equals(customerId).toArray();
        const leadIds = leads.map(l => l.id);
        const allTasks = await this.db.tasks.toArray();
        const tasks = allTasks.filter(t => t.customerId === customerId || leadIds.includes(t.leadId) || apptIds.includes(t.appointmentId) || orderIds.includes(t.orderId));
        const taskIds = tasks.map(t => t.id);
        if (taskIds.length) await this.db.taskEvents.where('taskId').anyOf(taskIds).delete();
        for (const task of tasks) await this.db.tasks.delete(task.id);
        await this.db.leads.where('customerId').equals(customerId).delete();
        if (quoteIds.length) await this.db.quoteItems.where('quoteId').anyOf(quoteIds).delete();
        await this.db.quotes.where('customerId').equals(customerId).delete();
        if (jobIds.length) {
          await this.db.checklistResponses.where('jobId').anyOf(jobIds).delete();
          await this.db.jobIssues.where('jobId').anyOf(jobIds).delete();
        }
        await this.db.jobs.where('customerId').equals(customerId).delete();
        if (purchaseOrderIds.length) await this.db.purchaseOrderItems.where('purchaseOrderId').anyOf(purchaseOrderIds).delete();
        for (const row of purchaseOrders) await this.db.purchaseOrders.delete(row.id);
        await this.db.jobCosts.where('customerId').equals(customerId).delete();
        await this.db.retentionRecords.where('customerId').equals(customerId).delete();
        await this.db.contactPreferences.where('customerId').equals(customerId).delete();
        await this.db.communicationEvents.where('customerId').equals(customerId).delete();
        if(invoiceIds.length)await this.db.invoiceItems.where('invoiceId').anyOf(invoiceIds).delete();
        await this.db.payments.where('customerId').equals(customerId).delete(); await this.db.creditNotes.where('customerId').equals(customerId).delete(); await this.db.documents.where('customerId').equals(customerId).delete(); await this.db.invoices.where('customerId').equals(customerId).delete();
        const measurementCount = apptIds.length ? await this.db.measurements.where('appointmentId').anyOf(apptIds).delete() : 0;
        const tripCount = apptIds.length ? await this.db.trips.where('appointmentId').anyOf(apptIds).delete() : 0;
        await this.db.appointments.where('customerId').equals(customerId).delete();
        await this.db.orders.where('customerId').equals(customerId).delete();
        await this.db.communications.where('customerId').equals(customerId).delete();
        await this.db.photos.where('customerId').equals(customerId).delete();
        await this.db.customers.delete(customerId);
        return { appointments: appts.length, orders: orders.length, communications: comms.length, photos: photoCount, measurements: measurementCount, trips: tripCount, leads: leads.length, tasks: tasks.length, taskEvents: taskIds.length, quotes: quotes.length, jobs: jobs.length };
      }
    );
  },

  // ---- Full factory reset ----
  // Clears every table (customers, visits, orders, photos, config, ...) plus
  // all app-prefixed localStorage keys (config, auto-message flags, active
  // trip), so the next page load boots back into onboarding. No undo —
  // callers must confirm first.
  async deleteAllData() {
    const tables = BACKUP_TABLES;
    await Promise.all(tables.map(t => this.db[t] ? this.db[t].clear() : Promise.resolve()));
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('advisoros') === 0) doomed.push(key);
    }
    doomed.forEach(key => localStorage.removeItem(key));
  },

  // ---- Customer photos (gallery stored in the local database) ----
  // Photos arrive as base64 strings (the UI downscales + encodes them), not
  // Blobs: the bundled mini-Dexie fallback serializes records through JSON,
  // which would silently turn every Blob into an empty object. Base64 rides
  // through both engines intact and renders straight into <img> data URLs.
  // Photos are part of the operational customer record (window/wall photos an
  // advisor may rely on), so they ARE included in exportAll()/importAll() —
  // a restored backup must reconstruct them, not leave them behind.
  async addPhoto({ customerId, jobId = null, appointmentId = null, data, mimeType = 'image/jpeg', caption = '' }) {
    // Be defensive at the storage boundary: callers must not persist a full
    // data URL because renderers add their own MIME prefix. Normalising here
    // also keeps backups smaller and makes all photo rows use one contract.
    const normalised = (typeof Utils !== 'undefined' && Utils.imagePayloadFromDataUrl)
      ? Utils.imagePayloadFromDataUrl(data, mimeType)
      : { data, mimeType };
    const photo = {
      customerId,
      jobId,
      appointmentId,
      data: normalised.data,
      mimeType: normalised.mimeType,
      caption: caption || '',
      createdAt: new Date().toISOString()
    };
    const id = await this.db.photos.add(photo);
    return { ...photo, id };
  },

  async getPhotosForCustomer(customerId) {
    const photos = await this.db.photos.where('customerId').equals(customerId).toArray();
    photos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return photos;
  },

  async deletePhoto(photoId) {
    await this.db.photos.delete(photoId);
  },

  async searchCustomers(query) {
    const normalized = query.toLowerCase().trim();

    const customers = await this.db.customers.toArray();
    const results = [];
    for (const c of customers) {
      const decrypted = await decryptCustomer(c);
      if ((decrypted.firstName && decrypted.firstName.toLowerCase().includes(normalized)) ||
          (decrypted.lastName && decrypted.lastName.toLowerCase().includes(normalized)) ||
          (decrypted.fullName && decrypted.fullName.toLowerCase().includes(normalized)) ||
          (decrypted.customerNumber && decrypted.customerNumber.toLowerCase().includes(normalized)) ||
          (decrypted.phone && decrypted.phone.includes(normalized)) ||
          ((decrypted.postcodeNormalized || decrypted.address?.postcodeNormalized || '').includes(normalized.replace(/\s/g, '').toUpperCase())) ||
          (decrypted.address && decrypted.address.line1 && decrypted.address.line1.toLowerCase().includes(normalized))) {
        results.push(decrypted);
        if (results.length >= 20) break;
      }
    }
    return results;
  },

  // Fetch one customer by id, decrypting PII fields (the raw row carries
  // encrypted {iv,ct} values; features must not read DB.db.customers.get()).
  async getCustomer(customerId) {
    if (!customerId) return null;
    const row = await this.db.customers.get(customerId);
    return row ? decryptCustomer(row) : null;
  },

  // Fetch every customer, decrypting PII fields.
  async getAllCustomers() {
    const rows = await this.db.customers.toArray();
    return Promise.all(rows.map(c => decryptCustomer(c)));
  },

  // Batch-fetch customers by id, decrypting PII fields (bulkGet returns the
  // raw rows, which carry encrypted {iv,ct} values under field-level
  // encryption — features must not read DB.db.customers directly).
  async getCustomersByIds(ids) {
    const valid = [...new Set((ids || []).filter(Boolean))];
    if (!valid.length) return [];
    const rows = await this.db.customers.bulkGet(valid);
    return Promise.all(rows.filter(Boolean).map(c => decryptCustomer(c)));
  },

  // Find a customer by phone number. The phone column is encrypted at rest
  // (PII_FIELDS), so an indexed .where('phone') query can never match —
  // scan + decrypt instead, mirroring searchCustomers.
  async findCustomerByPhone(phone) {
    if (!phone) return null;
    const normalized = String(phone).trim();
    const customers = await this.db.customers.toArray();
    for (const c of customers) {
      const decrypted = await decryptCustomer(c);
      if (decrypted.phone && String(decrypted.phone).trim() === normalized) {
        return decrypted;
      }
    }
    return null;
  },

  // Update a customer row, encrypting PII fields so updates never write
  // plaintext into the encrypted columns (raw DB.db.customers.update()
  // would leave mixed-state rows that break the at-rest guarantee).
  async updateCustomer(customerId, fields) {
    const encrypted = await encryptCustomer(fields);
    await this.db.customers.update(customerId, encrypted);
  },

  // Appointment operations
  async addAppointment(data) {
    const appointment = {
      ...data,
      status: data.status || 'confirmed',
      outcome: data.outcome || null,
      value: data.value || 0,
      commission: data.commission || 0,
      createdAt: new Date().toISOString()
    };

    const encrypted = await encryptAppointment(appointment);
    const id = await this.db.appointments.add(encrypted);
    if (typeof NotificationService !== 'undefined') NotificationService.queueVisitReminderRefresh();
    return { ...appointment, id };
  },

  // Update an appointment row, encrypting PII fields so updates never write
  // plaintext into the encrypted columns (mirrors updateCustomer).
  async updateAppointment(id, fields) {
    const encrypted = await encryptAppointment(fields);
    await this.db.appointments.update(id, encrypted);
    if (typeof NotificationService !== 'undefined') NotificationService.queueVisitReminderRefresh();
  },

  // Single appointment with PII decrypted. All detail screens must use this
  // rather than DB.db.appointments.get(id) directly.
  async getAppointment(id) {
    const row = await this.db.appointments.get(id);
    return row ? decryptAppointment(row) : null;
  },

  // All appointments with PII decrypted (used by search, area analytics and
  // features that scan the whole table for date/outcome logic).
  async getAllAppointments() {
    const rows = await this.db.appointments.toArray();
    return Promise.all(rows.map(a => decryptAppointment(a)));
  },

  // Every appointment for a customer, decrypted (customer-360 timeline).
  async getAppointmentsByCustomer(customerId) {
    const rows = await this.db.appointments.where('customerId').equals(customerId).toArray();
    return Promise.all(rows.map(a => decryptAppointment(a)));
  },

  // Appointment rows can hold `date` as a Date object (older storage
  // engines, imports) or an ISO string (every current save path). A
  // string-bounded index range (between) silently skips Date-object rows —
  // IndexedDB orders Date keys before all strings — leaving that visit
  // searchable by customer yet invisible in the diary, Today and the
  // calendar. Compare in JS after parsing instead, so every storage shape
  // lands in the right day/range.
  _inDateWindow(value, start, end) {
    const d = value instanceof Date ? value : new Date(value);
    return !isNaN(d.getTime()) && d >= start && d < end;
  },

  _ukCalendarBoundary(date, dayOffset = 0) {
    const p = Utils.ukParts(new Date(date));
    // Normalise the calendar arithmetic in UTC, then ask the UK helper for
    // the real midnight instant. This remains correct across 23/25-hour UK
    // days and when the device itself is in a different timezone.
    const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset));
    return Utils.ukMidnightInstant(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate()
    );
  },

  async getAppointmentsBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      throw new Error('Invalid appointment date window');
    }

    const rows = await this.db.appointments.toArray();
    const matched = rows
      .filter(a => a.status !== 'cancelled' && this._inDateWindow(a.date, start, end))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return Promise.all(matched.map(a => decryptAppointment(a)));
  },

  async getAppointmentsForUKDate(date) {
    // The day window is [UK midnight, next UK midnight) of the instant's
    // UK calendar day — the app's date contract everywhere else. The old version did
    // setHours(0,0,0,0) in the DEVICE's timezone, so on any non-UK device
    // the "today" list silently started/finished hours off (early-morning
    // UK visits dropped, late-evening ones bleeding across days).
    const start = this._ukCalendarBoundary(date);
    const end = this._ukCalendarBoundary(date, 1);
    return this.getAppointmentsBetween(start, end);
  },

  // Compatibility name retained for existing day-view callers.
  async getAppointmentsForDate(date) {
    return this.getAppointmentsForUKDate(date);
  },

  // Generic date-range fetch — used by the standard month calendar view.
  async getAppointmentsForRange(startDate, endDate) {
    // startDate/endDate arrive as UK-midnight instants (Utils week/month
    // windows); use them exactly. The old version re-mangled them through
    // device-local setHours, which on a non-UK device shrank the range to a
    // few hours and cut the week/month view to a sliver of appointments.
    return this.getAppointmentsBetween(startDate, endDate);
  },

  async getAppointmentsForUKCalendarDays(days = 7, anchor = new Date()) {
    // Window starts at today's UK midnight (not the current instant) so
    // appointments earlier today are still "upcoming" — the Home feed and
    // "next visit" queries must count every visit for today, otherwise a
    // morning appointment vanishes from Home the moment its time passes
    // (Home showed 3 of 4 today visits while the diary showed all 4).
    if (!Number.isInteger(days) || days < 0) throw new Error('days must be a non-negative integer');
    const start = this._ukCalendarBoundary(anchor);
    const end = this._ukCalendarBoundary(anchor, days);
    return this.getAppointmentsBetween(start, end);
  },

  async getFutureAppointmentsUntil(endDate, now = new Date()) {
    return this.getAppointmentsBetween(now, endDate);
  },

  // Compatibility name: this is a UK calendar-day window, not a rolling
  // duration. It intentionally includes earlier-today visits for Home.
  async getUpcomingAppointments(days = 7) {
    return this.getAppointmentsForUKCalendarDays(days);
  },

  // Canonical weekly stats: sales value, earnings (commission) and order
  // count for a period, counting ONLY appointments that actually happened
  // (status !== 'cancelled') AND were sold (outcome === 'ordered').
  //
  // This is the single source of truth for "how am I doing this week" -
  // Today's dashboard, the Money screen and the Home screen all call this
  // instead of running their own query (the old copies drifted apart, and
  // none of them excluded cancelled visits, so cancelling a sold visit kept
  // counting toward the weekly target).
  async getWeekStats(startISO, endISO) {
    const start = new Date(startISO);
    const end = new Date(endISO);
    const rows = await this.db.appointments.toArray();
    const appts = rows.filter(a => a.status !== 'cancelled' && a.outcome === 'ordered' && this._inDateWindow(a.date, start, end));

    let sales = 0;
    let earnings = 0;
    for (const a of appts) {
      sales += a.value || 0;
      if (typeof a.commission === 'number' && a.commission > 0) {
        earnings += a.commission;
      } else {
        earnings += TaxCalculator.estimateCommission(a.value || 0);
      }
    }
    return { sales, earnings, orderedCount: appts.length };
  },

  async getPipeline() {
    const now = new Date().toISOString();

    // FIX: Dexie 3 doesn't support sortBy() after filter/and
    // Get results first, then sort in JavaScript.
    // Cancelled visits are excluded so a cancelled quote/thinking lead can't
    // keep generating follow-up nudges forever.
    const results = await this.db.appointments
      .where('outcome')
      .anyOf([
        'quoted',
        'thinking',
        'partner',
        'compare_quotes',
        'expensive',
        'customer_no_show',
        'advisor_unavailable'
      ])
      .and(a => a.status !== 'cancelled')
      .and(a => new Date(a.date) <= new Date(now))
      .toArray();

    // Sort by date ascending (oldest first = most urgent)
    const sorted = results.sort((a, b) => new Date(a.date) - new Date(b.date));
    return Promise.all(sorted.map(a => decryptAppointment(a)));
  },

  // Order operations
  async addOrder(data) {
    return this._runWrite(['orders', 'customers', 'sequences'], async () => {
      const seq = await this._nextSequenceUnsafe('order');
      const order = {
        ...data,
        orderNumber: `ORD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`,
        depositRequired: App.calculateDeposit(data.total || 0).amount,
        depositPaid: 0,
        balanceDue: data.total || 0,
        status: 'deposit_pending',
        reviewRequested: false,
        referralRequested: false,
        createdAt: new Date().toISOString()
      };
      const id = await this.db.orders.add(order);
      await this._refreshCustomerTotalsUnsafe(data.customerId);
      return { ...order, id };
    });
  },

  async setOrderStage(orderId, stage) {
    await this.db.orders.update(orderId, { stage });
  },

  async setOrderSupplierNumber(orderId, supplierOrderNumber) {
    await this.db.orders.update(orderId, { supplierOrderNumber: supplierOrderNumber || null });
  },

  async _recordOrderPaymentUnsafe(orderId, amount, operationId = null) {
    const order = await this.db.orders.get(orderId);
    if (!order) return null;
    await this._migrateLegacyOrderPaymentUnsafe(order);
    if (operationId) {
      const existing = await this.db.payments.where('operationId').equals(operationId).first();
      if (existing) { const summary = await this._reconcileOrderLedgerUnsafe(orderId); return { order: summary.order, applied: 0, balanceDue: summary.balanceDue, fullyPaid: summary.balanceDue <= 0, payment: existing }; }
    }
    const summaryBefore = await this._ledgerSummaryUnsafe(orderId);
    const applied = Math.max(0, Math.min(Number(amount) || 0, Math.max(0, (order.total || 0) - summaryBefore.paid)));
    let payment = null;
    if (applied > 0) { const now = new Date().toISOString(); payment = { customerId: order.customerId, orderId, amount: applied, direction: 'in', kind: 'payment', status: 'cleared', date: now, method: 'unspecified', operationId: operationId || null, createdAt: now }; payment.id = await this.db.payments.add(payment); }
    const summary = await this._reconcileOrderLedgerUnsafe(orderId);
    return { order: summary.order, applied, balanceDue: summary.balanceDue, fullyPaid: summary.balanceDue <= 0, payment };
  },

  async recordOrderPayment(orderId, amount, operationId = null) {
    return this._runWrite(['orders', 'payments'], () => this._recordOrderPaymentUnsafe(orderId, amount, operationId));
  },

  async setOrderPaid(orderId) {
    return this._runWrite(['orders', 'payments'], async () => {
      const order = await this.db.orders.get(orderId);
      if (!order) return null;
      const result = await this._recordOrderPaymentUnsafe(orderId, order.balanceDue ?? order.total ?? 0, `set-paid:${orderId}:${order.balanceDue ?? order.total ?? 0}`);
      return result && result.order;
    });
  },

  async _migrateLegacyOrderPaymentUnsafe(order) {
    const existing = await this.db.payments.where('orderId').equals(order.id).toArray();
    if (existing.length || !(Number(order.depositPaid) > 0)) return null;
    const paid = Math.round(Number(order.depositPaid) * 100) / 100;
    if (Math.round(((Number(order.total) || 0) - paid) * 100) / 100 !== Math.round((Number(order.balanceDue) || 0) * 100) / 100) return null;
    const now = new Date().toISOString(); const row = { customerId: order.customerId, orderId: order.id, amount: paid, direction: 'in', kind: 'opening_migrated', status: 'cleared', date: order.createdAt || now, method: 'legacy', operationId: `legacy-order:${order.id}`, provenance: 'unambiguous depositPaid compatibility value', createdAt: now };
    row.id = await this.db.payments.add(row); return row;
  },
  async migrateLegacyOrderPayment(orderId) { return this._runWrite(['orders', 'payments'], async () => { const order = await this.db.orders.get(orderId); return order ? this._migrateLegacyOrderPaymentUnsafe(order) : null; }); },
  async _ledgerSummaryUnsafe(orderId) {
    const rows = (await this.db.payments.where('orderId').equals(orderId).toArray()).filter(p => p.status === 'cleared');
    const paid = Math.round(rows.reduce((sum, p) => sum + (p.direction === 'in' ? Number(p.amount) || 0 : -(Number(p.amount) || 0)), 0) * 100) / 100;
    return { paid: Math.max(0, paid), entries: rows };
  },
  async _reconcileOrderLedgerUnsafe(orderId) {
    const order = await this.db.orders.get(orderId); if (!order) throw new Error('Order not found');
    const summary = await this._ledgerSummaryUnsafe(orderId); const depositPaid = Math.min(order.total || 0, summary.paid); const balanceDue = Math.max(0, Math.round(((order.total || 0) - depositPaid) * 100) / 100);
    const fields = { depositPaid, balanceDue, stage: balanceDue <= 0 ? 'paid' : (order.stage === 'paid' ? 'ordered' : (order.stage || 'ordered')) };
    await this.db.orders.update(orderId, fields); return { order: { ...order, ...fields }, paid: depositPaid, balanceDue, entries: summary.entries };
  },
  async reconcileOrderLedger(orderId) { return this._runWrite(['orders', 'payments'], async () => { const order = await this.db.orders.get(orderId); if (!order) throw new Error('Order not found'); await this._migrateLegacyOrderPaymentUnsafe(order); return this._reconcileOrderLedgerUnsafe(orderId); }); },
  async reconcileOrderBalance(orderId) { return this.reconcileOrderLedger(orderId); },
  async recordPayment(data) {
    if (!data || !Number.isInteger(data.orderId) || !(Number(data.amount) > 0) || !data.operationId) throw new Error('Order, positive amount and operation id are required');
    if(data.direction&&!['in','out'].includes(data.direction))throw new Error('Invalid payment direction');if(data.status&&!['pending','cleared','void'].includes(data.status))throw new Error('Invalid payment status');
    const prepared = await encryptPayment({ ...data, amount: Math.round(Number(data.amount) * 100) / 100, direction: data.direction || 'in', kind: data.kind || 'payment', status: data.status || 'cleared', date: data.date || new Date().toISOString(), createdAt: new Date().toISOString() });
    const row = await this._runWrite(['orders', 'payments', 'invoices'], async () => {
      const order = await this.db.orders.get(data.orderId); if (!order) throw new Error('Order not found'); await this._migrateLegacyOrderPaymentUnsafe(order);
      if (data.invoiceId != null && !await this.db.invoices.get(data.invoiceId)) throw new Error('Invoice not found');
      let row = await this.db.payments.where('operationId').equals(data.operationId).first(); if (!row) { const id = await this.db.payments.add({ ...prepared, customerId: order.customerId }); row = { ...prepared, customerId: order.customerId, id }; }
      await this._reconcileOrderLedgerUnsafe(data.orderId); return row;
    });
    return decryptPayment(row);
  },
  async recordLedgerPayment(data) { return this.recordPayment(data); },
  async reversePayment(paymentId, options = {}) {
    const original = await this.db.payments.get(paymentId); if (!original) throw new Error('Payment not found');
    if (original.status !== 'cleared' || original.direction !== 'in' || !['payment','opening_migrated'].includes(original.kind)) throw new Error('Only a cleared incoming payment can be reversed');
    const linked=(await this.db.payments.where('reversesPaymentId').equals(paymentId).toArray()).filter(p=>p.status==='cleared'); const remaining=original.amount-linked.reduce((s,p)=>s+(p.amount||0),0); if(!(remaining>0))throw new Error('Payment already fully reversed or refunded');
    return this.recordPayment({ orderId: original.orderId, invoiceId: original.invoiceId || null, amount: remaining, direction: 'out', kind: 'reversal', reversesPaymentId: paymentId, method: original.method, reference: options.reason || '', date: options.date, operationId: options.operationId });
  },
  async reverseLedgerEntry(id, options = {}) { return this.reversePayment(id, options); },
  async refundPayment(paymentId, options = {}) {
    const original = await this.db.payments.get(paymentId); if (!original) throw new Error('Payment not found');
    if (original.status !== 'cleared' || original.direction !== 'in' || !['payment','opening_migrated'].includes(original.kind)) throw new Error('Only a cleared incoming payment can be refunded');
    const linked=(await this.db.payments.where('reversesPaymentId').equals(paymentId).toArray()).filter(p=>p.status==='cleared'); const remaining=original.amount-linked.reduce((s,p)=>s+(p.amount||0),0); const amount=Number(options.amount)||remaining; if(!(amount>0)||amount>remaining)throw new Error('Refund exceeds remaining payment');
    return this.recordPayment({ orderId: original.orderId, invoiceId: original.invoiceId || null, amount, direction: 'out', kind: 'refund', reversesPaymentId: paymentId, method: options.method || original.method, reference: options.reference || '', notes: options.notes || '', operationId: options.operationId });
  },
  async getPayments(filters = {}) { let rows = await this.db.payments.toArray(); for (const f of ['customerId','orderId','invoiceId','status','kind']) if (filters[f] != null) rows = rows.filter(r => r[f] === filters[f]); rows.sort((a,b)=>new Date(b.date)-new Date(a.date)); return Promise.all(rows.map(decryptPayment)); },
  async getLedgerEntries(filters = {}) { return this.getPayments(filters); },

  _invoiceTotals(items) { const money=v=>Math.round((Number(v)||0)*100)/100; const subtotal=money((items||[]).reduce((s,i)=>s+(Number(i.quantity)||0)*(Number(i.unitPrice)||0),0)); const taxAmount=money((items||[]).reduce((s,i)=>s+(Number(i.quantity)||0)*(Number(i.unitPrice)||0)*(Number(i.taxRate)||0)/100,0)); return { subtotal, taxAmount, total: money(subtotal+taxAmount) }; },
  async _prepareInvoiceItems(items, invoiceId = null) { if (!Array.isArray(items)||!items.length) throw new Error('Invoice items are required'); return Promise.all(items.map(async(i,n)=>{ if(!String(i.description||'').trim()||!(Number(i.quantity)>0)||Number(i.unitPrice)<0) throw new Error('Invoice item is invalid'); return encryptInvoiceItem({...i,invoiceId,description:String(i.description).trim(),quantity:Number(i.quantity),unitPrice:Number(i.unitPrice),taxRate:Math.max(0,Number(i.taxRate)||0),displayOrder:i.displayOrder??n,createdAt:i.createdAt||new Date().toISOString()}); })); },
  async createInvoice(data, items = null) {
    items = items || data?.items; if (!data || !Number.isInteger(data.customerId)) throw new Error('Invoice customer is required');
    const customer = await this.getCustomer(data.customerId); if (!customer) throw new Error('Customer not found');
    if(data.orderId!=null){const order=await this.db.orders.get(data.orderId);if(!order||order.customerId!==data.customerId)throw new Error('Invoice order relationship is invalid');}
    if(data.jobId!=null){const job=await this.db.jobs.get(data.jobId);if(!job||job.customerId!==data.customerId)throw new Error('Invoice job relationship is invalid');}
    const preparedItems = await this._prepareInvoiceItems(items); const totals=this._invoiceTotals(items); const now=new Date().toISOString();
    const base=await encryptInvoice({...data,items:undefined,...totals,customerSnapshot:data.customerSnapshot||{name:customer.fullName||`${customer.firstName||''} ${customer.lastName||''}`.trim(),address:customer.address||null,email:customer.email||''},status:'draft',createdAt:now,updatedAt:now}); let invoiceId;
    await this._runWrite(['invoices','invoiceItems','sequences'],async()=>{const seq=await this._nextSequenceUnsafe('invoice'); invoiceId=await this.db.invoices.add({...base,invoiceNumber:`INV-${new Date().getFullYear()}-${String(seq).padStart(4,'0')}`}); for(const item of preparedItems) await this.db.invoiceItems.add({...item,invoiceId});}); return this.getInvoice(invoiceId);
  },
  async getInvoice(id){const row=await this.db.invoices.get(id);if(!row)return null;const items=await this.db.invoiceItems.where('invoiceId').equals(id).toArray();items.sort((a,b)=>(a.displayOrder||0)-(b.displayOrder||0));return{invoice:await decryptInvoice(row),items:await Promise.all(items.map(decryptInvoiceItem))};},
  async getInvoices(filters={}){let rows=await this.db.invoices.toArray();for(const f of ['customerId','orderId','jobId','status'])if(filters[f]!=null)rows=rows.filter(r=>r[f]===filters[f]);return Promise.all(rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(decryptInvoice));},
  async updateInvoice(id,changes={},items=null){const current=await this.getInvoice(id);if(!current)throw new Error('Invoice not found');if(current.invoice.status!=='draft')throw new Error('Issued invoices are immutable');const plain=items||current.items;const totals=this._invoiceTotals(plain);const safe={...changes};delete safe.id;delete safe.invoiceNumber;delete safe.status;delete safe.customerId;const encrypted=await encryptInvoice({...safe,...totals,updatedAt:new Date().toISOString()});const prepared=items?await this._prepareInvoiceItems(items,id):null;await this._runWrite(['invoices','invoiceItems'],async()=>{await this.db.invoices.update(id,encrypted);if(prepared){await this.db.invoiceItems.where('invoiceId').equals(id).delete();for(const item of prepared)await this.db.invoiceItems.add(item);}});return this.getInvoice(id);},
  async issueInvoice(id){const current=await this.getInvoice(id);if(!current||current.invoice.status!=='draft')throw new Error('Only draft invoices can be issued');const now=new Date().toISOString();await this.db.invoices.update(id,{status:'issued',issueDate:current.invoice.issueDate||now,updatedAt:now});return(await this.getInvoice(id)).invoice;},
  async getInvoiceBalance(id){const pack=await this.getInvoice(id);if(!pack)throw new Error('Invoice not found');const payments=(await this.db.payments.where('invoiceId').equals(id).toArray()).filter(p=>p.status==='cleared');const paid=payments.reduce((s,p)=>s+(p.direction==='in'?p.amount:-p.amount),0);const credits=(await this.db.creditNotes.where('invoiceId').equals(id).toArray()).filter(c=>c.status==='issued').reduce((s,c)=>s+(c.amount||0),0);return{total:pack.invoice.total,paid:Math.max(0,paid),credits,balanceDue:Math.max(0,Math.round((pack.invoice.total-paid-credits)*100)/100)};},
  async createCreditNote(invoiceId,data={}){const pack=await this.getInvoice(invoiceId);if(!pack||pack.invoice.status==='draft')throw new Error('Credit notes require an issued invoice');const amount=Math.round((Number(data.amount)||0)*100)/100;const existing=(await this.db.creditNotes.where('invoiceId').equals(invoiceId).toArray()).filter(c=>c.status==='issued').reduce((s,c)=>s+(c.amount||0),0);if(!(amount>0)||amount>Math.max(0,pack.invoice.total-existing))throw new Error('Credit amount exceeds invoice balance');const snapshot=data.itemSnapshot||pack.items;if(!Array.isArray(snapshot)||!snapshot.length)throw new Error('Credit item snapshot is required');const now=new Date().toISOString();const base=await encryptCreditNote({...data,invoiceId,customerId:pack.invoice.customerId,amount,itemSnapshot:snapshot,status:'issued',issueDate:data.issueDate||now,createdAt:now});let id;await this._runWrite(['creditNotes','sequences'],async()=>{const seq=await this._nextSequenceUnsafe('credit');id=await this.db.creditNotes.add({...base,creditNumber:`CRN-${new Date().getFullYear()}-${String(seq).padStart(4,'0')}`});});return decryptCreditNote(await this.db.creditNotes.get(id));},
  async getCreditNote(id){const row=await this.db.creditNotes.get(id);return row?decryptCreditNote(row):null;},
  async getCreditNotes(filters={}){let rows=await this.db.creditNotes.toArray();for(const f of ['customerId','invoiceId','status'])if(filters[f]!=null)rows=rows.filter(r=>r[f]===filters[f]);return Promise.all(rows.map(decryptCreditNote));},
  async addDocumentMetadata(data){if(!data||!data.type)throw new Error('Document type is required');const plain={...data,generatedAt:data.generatedAt||new Date().toISOString(),createdAt:new Date().toISOString()};const row=await encryptDocument(plain);const id=await this.db.documents.add(row);return{...plain,id};},
  async getDocument(id){const row=await this.db.documents.get(id);return row?decryptDocument(row):null;},
  async getDocuments(filters={}){let rows=await this.db.documents.toArray();for(const field of ['customerId','invoiceId','paymentId','jobId','purchaseOrderId','type'])if(filters[field]!=null)rows=rows.filter(row=>row[field]===filters[field]);rows.sort((a,b)=>new Date(b.createdAt||b.generatedAt)-new Date(a.createdAt||a.generatedAt));return Promise.all(rows.map(decryptDocument));},
  async getReceipt(paymentId){const payment=await this.db.payments.get(paymentId);if(!payment)return null;const document=await this.db.documents.where('paymentId').equals(paymentId).first();return{payment:await decryptPayment(payment),document:document?await decryptDocument(document):null};},

  async _refreshCustomerTotalsUnsafe(customerId) {
    if (!customerId) return;
    const orders = await this.db.orders.where('customerId').equals(customerId).toArray();
    await this.db.customers.update(customerId, {
      totalOrdersValue: orders.reduce((sum, o) => sum + (o.total || 0), 0),
      orderCount: orders.length,
      totalCommission: orders.reduce((sum, o) => sum + (o.commission || 0), 0)
    });
  },

  async completeVisitOutcome({ appointmentId, appointmentFields, paymentAmount = 0, paymentOperationId = null }) {
    const current = await this.getAppointment(appointmentId);
    if (!current) throw new Error('Appointment not found');
    const encryptedFields = await encryptAppointment(appointmentFields);
    const customerId = current.customerId;
    return this._runWrite(['appointments', 'orders', 'customers', 'sequences', 'payments'], async () => {
      const linked = await this.db.orders.where('appointmentId').equals(appointmentId).toArray();
      linked.sort((a, b) => (a.id || 0) - (b.id || 0));
      let order = linked[0] || null;
      for (const duplicate of linked.slice(1)) await this.db.orders.delete(duplicate.id);
      if (appointmentFields.outcome === 'ordered' && (appointmentFields.value || 0) > 0) {
        const total = appointmentFields.value;
        const depositRequired = App.calculateDeposit(total).amount;
        if (order) {
          await this._migrateLegacyOrderPaymentUnsafe(order);
          const ledger = await this._ledgerSummaryUnsafe(order.id);
          const depositPaid = Math.min(ledger.paid || 0, total);
          const balanceDue = Math.max(0, total - depositPaid);
          const fields = { total, depositRequired, depositPaid, balanceDue, status: 'deposit_pending', stage: balanceDue <= 0 ? 'paid' : (order.stage === 'paid' ? 'ordered' : (order.stage || 'ordered')) };
          await this.db.orders.update(order.id, fields);
          order = { ...order, ...fields };
        } else {
          const seq = await this._nextSequenceUnsafe('order');
          order = { customerId, appointmentId, total, orderNumber: `ORD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`, depositRequired, depositPaid: 0, balanceDue: total, status: 'deposit_pending', stage: 'ordered', reviewRequested: false, referralRequested: false, createdAt: new Date().toISOString() };
          order.id = await this.db.orders.add(order);
        }
      } else if (order && current.outcome === 'ordered') {
        for (const linkedOrder of linked) await this.db.orders.delete(linkedOrder.id);
        order = null;
      }
      let payment = null;
      if ((Number(paymentAmount) || 0) > 0 && customerId) {
        const openOrders = (await this.db.orders.where('customerId').equals(customerId).toArray())
          .filter(candidate => (candidate.balanceDue || 0) > 0)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        if (openOrders[0]) payment = await this._recordOrderPaymentUnsafe(openOrders[0].id, paymentAmount, paymentOperationId);
      }
      await this._refreshCustomerTotalsUnsafe(customerId);
      await this.db.appointments.update(appointmentId, encryptedFields);
      return { order, payment };
    });
  },

  // Recomputes a customer's order aggregates from the orders table itself.
  // Single source of truth: called after add/update/delete of any order.
  async refreshCustomerTotals(customerId) {
    return this._runWrite(['orders', 'customers'], () => this._refreshCustomerTotalsUnsafe(customerId));
  },

  // Deletes an order and refreshes the owning customer's totals.
  // Returns the deleted order (or null if it didn't exist).
  async removeOrder(orderId) {
    return this._runWrite(['orders', 'customers'], async () => {
      const order = await this.db.orders.get(orderId);
      if (!order) return null;
      await this.db.orders.delete(orderId);
      await this._refreshCustomerTotalsUnsafe(order.customerId);
      return order;
    });
  },

  // Expense operations
  async addExpense(data) {
    const expense = {
      ...data,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.expenses.add(expense);
    return { ...expense, id };
  },

  async getExpensesForPeriod(startDate, endDate) {
    return await this.db.expenses
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  },

  // Trip operations
  async addTrip(data) {
    const trip = {
      ...data,
      purpose: data.purpose || 'business',
      confirmed: false,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.trips.add(trip);
    return { ...trip, id };
  },

  async getTripsForPeriod(startDate, endDate) {
    return await this.db.trips
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  },

  // Measurement operations
  async addMeasurement(data) {
    // Auto-calculate least measurements. A group is only complete when all
    // three values are present and positive: a missing, zero or negative
    // entry means the measurement is incomplete, so the derived fields stay
    // null — incomplete data must never become a valid zero (or a negative
    // widthUsed from least - tolerance).
    const complete = (a, b, c) => (a > 0 && b > 0 && c > 0) ? Math.min(a, b, c) : null;
    const widthLeast = complete(data.widthTop, data.widthMiddle, data.widthBottom);
    const dropLeast = complete(data.dropLeft, data.dropCentre, data.dropRight);
    const diagVariance = (data.diagonalTlBr > 0 && data.diagonalTrBl > 0)
      ? Math.abs(data.diagonalTlBr - data.diagonalTrBl)
      : null;

    const tolerance = data.tolerance > 0 ? data.tolerance : 10;
    const fittingType = data.fittingType || 'recess';

    const measurement = {
      ...data,
      widthLeast,
      dropLeast,
      widthUsed: widthLeast === null ? null : (fittingType === 'recess' ? widthLeast - tolerance : widthLeast),
      dropUsed: dropLeast,
      diagonalVariance: diagVariance,
      isSquare: diagVariance === null ? null : diagVariance <= 5,
      createdAt: new Date().toISOString()
    };

    const id = await this.db.measurements.add(measurement);
    return { ...measurement, id };
  },

  // Communication operations
  async addCommunication(data) {
    const comm = {
      ...data,
      sentAt: new Date().toISOString()
    };

    const id = await this.db.communications.add(comm);
    return { ...comm, id };
  },

  // Phase 2 structured quotes -------------------------------------------
  _quoteTotals(items, fields = {}) {
    const money = value => Math.round((Number(value) || 0) * 100) / 100;
    const subtotal = money((items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0));
    const percent = Math.max(0, Math.min(100, Number(fields.discountPercent) || 0));
    const discountAmount = money(fields.discountAmount !== undefined ? fields.discountAmount : subtotal * percent / 100);
    const discounted = money(Math.max(0, subtotal - discountAmount));
    const taxTreatment = fields.taxTreatment || 'none';
    const taxRate = Math.max(0, Number(fields.taxRate) || 0);
    const taxAmount = taxTreatment === 'exclusive' ? money(discounted * taxRate / 100) : 0;
    const total = taxTreatment === 'inclusive' ? discounted : money(discounted + taxAmount);
    const totalCost = money((items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.cost) || 0), 0));
    return { subtotal, discountAmount, discountPercent: percent, taxTreatment, taxRate, taxAmount, total, totalCost };
  },

  async _prepareQuoteItems(items, quoteId = null) {
    if (!Array.isArray(items) || !items.length) throw new Error('At least one quote item is required');
    return Promise.all(items.map(async (item, index) => {
      if (!String(item.description || '').trim()) throw new Error('Quote item description is required');
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!(quantity > 0) || unitPrice < 0 || !Number.isFinite(unitPrice)) throw new Error('Quote item quantity and price are invalid');
      return encryptQuoteItem({ ...item, quoteId, description: String(item.description).trim(), quantity, unitPrice, cost: Math.max(0, Number(item.cost) || 0), displayOrder: item.displayOrder ?? index, createdAt: item.createdAt || new Date().toISOString() });
    }));
  },

  async createQuote(data) {
    if (!data || !Number.isInteger(data.customerId) || data.customerId < 1) throw new Error('Quote customer is required');
    if (!await this.db.customers.get(data.customerId)) throw new Error('Customer not found');
    const plainItems = data.items || [];
    const encryptedItems = await this._prepareQuoteItems(plainItems);
    const totals = this._quoteTotals(plainItems, data);
    const now = new Date().toISOString();
    const quoteBase = await encryptQuote({ ...data, items: undefined, ...totals, version: 1, status: 'draft', createdAt: now, updatedAt: now });
    let result;
    await this._runWrite(['quotes', 'quoteItems', 'sequences'], async () => {
      const seq = await this._nextSequenceUnsafe('quote');
      const quote = { ...quoteBase, quoteNumber: `QUO-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}` };
      const quoteId = await this.db.quotes.add(quote);
      for (const item of encryptedItems) await this.db.quoteItems.add({ ...item, quoteId });
      result = quoteId;
    });
    return this.getQuote(result);
  },

  async getQuoteItems(quoteId) {
    const rows = await this.db.quoteItems.where('quoteId').equals(quoteId).toArray();
    rows.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return Promise.all(rows.map(row => decryptQuoteItem(row)));
  },

  async getQuote(id) {
    const row = await this.db.quotes.get(id);
    if (!row) return null;
    return { quote: await decryptQuote(row), items: await this.getQuoteItems(id) };
  },

  async getQuotes(filters = {}) {
    let rows = await this.db.quotes.toArray();
    for (const field of ['customerId', 'appointmentId', 'status', 'quoteNumber']) {
      if (filters[field] !== undefined && filters[field] !== null) rows = rows.filter(row => row[field] === filters[field]);
    }
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return Promise.all(rows.map(row => decryptQuote(row)));
  },

  async updateQuote(id, changes = {}, items = null) {
    const current = await this.getQuote(id);
    if (!current) throw new Error('Quote not found');
    if (current.quote.status !== 'draft') throw new Error('Only draft quotes can be edited');
    const plainItems = items || current.items;
    const encryptedItems = items ? await this._prepareQuoteItems(items, id) : null;
    const totals = this._quoteTotals(plainItems, { ...current.quote, ...changes });
    const allowedChanges = { ...changes };
    delete allowedChanges.quoteNumber; delete allowedChanges.version; delete allowedChanges.status; delete allowedChanges.id; delete allowedChanges.customerId;
    const encryptedChanges = await encryptQuote({ ...allowedChanges, ...totals, updatedAt: new Date().toISOString() });
    await this._runWrite(['quotes', 'quoteItems'], async () => {
      await this.db.quotes.update(id, encryptedChanges);
      if (encryptedItems) {
        await this.db.quoteItems.where('quoteId').equals(id).delete();
        for (const item of encryptedItems) await this.db.quoteItems.add(item);
      }
    });
    return this.getQuote(id);
  },

  async issueQuote(id) {
    const current = await this.getQuote(id);
    if (!current || current.quote.status !== 'draft') throw new Error('Only a draft quote can be issued');
    const now = new Date().toISOString();
    await this.db.quotes.update(id, { status: 'issued', issueDate: current.quote.issueDate || now, updatedAt: now });
    return (await this.getQuote(id)).quote;
  },

  async acceptQuote(id, metadata = {}) {
    const current = await this.getQuote(id);
    if (!current || !['issued', 'accepted'].includes(current.quote.status)) throw new Error('Only an issued quote can be accepted');
    if (current.quote.status === 'accepted') return current.quote;
    const now = new Date().toISOString();
    await this.db.quotes.update(id, await encryptQuote({ status: 'accepted', acceptedAt: now, acceptanceName: metadata.acceptanceName || '', acceptanceMethod: metadata.acceptanceMethod || 'advisor_recorded', updatedAt: now }));
    return (await this.getQuote(id)).quote;
  },

  async rejectQuote(id, reason = '') {
    const current = await this.getQuote(id);
    if (!current || !['issued', 'rejected'].includes(current.quote.status)) throw new Error('Only an issued quote can be rejected');
    if (current.quote.status === 'rejected') return current.quote;
    const now = new Date().toISOString();
    await this.db.quotes.update(id, await encryptQuote({ status: 'rejected', rejectedAt: now, rejectionReason: reason, updatedAt: now }));
    return (await this.getQuote(id)).quote;
  },

  async expireQuote(id) {
    const current = await this.getQuote(id);
    if (!current || !['issued', 'expired'].includes(current.quote.status)) throw new Error('Only an issued quote can be expired');
    if (current.quote.status === 'expired') return current.quote;
    const now = new Date().toISOString();
    await this.db.quotes.update(id, { status: 'expired', expiredAt: now, updatedAt: now });
    return (await this.getQuote(id)).quote;
  },

  async createQuoteVersion(id, changes = {}, items = null) {
    const current = await this.getQuote(id);
    if (!current) throw new Error('Quote not found');
    if (current.quote.status === 'accepted') throw new Error('Accepted quotes cannot be superseded');
    const plainItems = items || current.items;
    const encryptedItems = await this._prepareQuoteItems(plainItems);
    const totals = this._quoteTotals(plainItems, { ...current.quote, ...changes });
    const now = new Date().toISOString();
    const quoteBase = await encryptQuote({ ...current.quote, ...changes, ...totals, id: undefined, version: (current.quote.version || 1) + 1, status: 'draft', supersedesQuoteId: id, issueDate: null, acceptedAt: null, rejectedAt: null, createdAt: now, updatedAt: now });
    let newId;
    await this._runWrite(['quotes', 'quoteItems'], async () => {
      newId = await this.db.quotes.add(quoteBase);
      for (const item of encryptedItems) await this.db.quoteItems.add({ ...item, quoteId: newId, id: undefined });
      await this.db.quotes.update(id, { status: 'superseded', supersededByQuoteId: newId, updatedAt: now });
    });
    return this.getQuote(newId);
  },

  async convertAcceptedQuoteToOrder(id, operationId = null) {
    const run = async () => {
      const quote = await this.db.quotes.get(id);
      if (!quote) throw new Error('Quote not found');
      if (quote.status !== 'accepted') throw new Error('Quote must be accepted before conversion');
      let order = await this.db.orders.where('quoteId').equals(id).first();
      if (order) return { quote, order, created: false };
      const seq = await this._nextSequenceUnsafe('order');
      const total = Number(quote.total) || 0;
      order = { customerId: quote.customerId, appointmentId: quote.appointmentId || null, quoteId: id, orderNumber: `ORD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`, total, depositRequired: App.calculateDeposit(total).amount, depositPaid: 0, balanceDue: total, status: 'deposit_pending', stage: 'ordered', quoteConversionOperationId: operationId || null, reviewRequested: false, referralRequested: false, createdAt: new Date().toISOString() };
      order.id = await this.db.orders.add(order);
      await this.db.quotes.update(id, { convertedOrderId: order.id, convertedAt: new Date().toISOString() });
      await this._refreshCustomerTotalsUnsafe(quote.customerId);
      return { quote: { ...quote, convertedOrderId: order.id }, order, created: true };
    };
    let result;
    if (typeof this.db.transaction === 'function') {
      result = await this._runWrite(['quotes', 'orders', 'customers', 'sequences'], run);
    } else {
      if (!this._quoteConversionLocks) this._quoteConversionLocks = new Map();
      const pending = this._quoteConversionLocks.get(id);
      if (pending) result = { ...(await pending), created: false };
      else {
        const promise = run().finally(() => this._quoteConversionLocks.delete(id));
        this._quoteConversionLocks.set(id, promise);
        result = await promise;
      }
    }
    result.quote = await decryptQuote(result.quote);
    return result;
  },

  // Phase 3 job execution -----------------------------------------------
  async createJobFromOrder(orderId, data = {}, operationId = null) {
    const order = await this.db.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    const sourceKey = operationId || `order:${orderId}:default`;
    const now = new Date().toISOString();
    const prepared = await encryptJob({ ...data, customerId: order.customerId, orderId, type: data.type || 'fitting', status: data.status || 'materials_ordered', sourceKey, createdAt: now, updatedAt: now });
    let job; let created = false;
    const run = async () => {
      job = await this.db.jobs.where('sourceKey').equals(sourceKey).first();
      if (!job) { const id = await this.db.jobs.add(prepared); job = { ...prepared, id }; created = true; }
    };
    if (typeof this.db.transaction === 'function') await this.db.transaction('rw', this.db.jobs, run); else await run();
    return { job: await decryptJob(job), created };
  },

  async getJob(id) { const row = await this.db.jobs.get(id); return row ? decryptJob(row) : null; },
  async getJobs(filters = {}) {
    let rows = await this.db.jobs.toArray();
    for (const field of ['customerId', 'orderId', 'status', 'type']) if (filters[field] !== undefined && filters[field] !== null) rows = rows.filter(row => row[field] === filters[field]);
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return Promise.all(rows.map(row => decryptJob(row)));
  },
  async updateJob(id, fields) {
    const job = await this.getJob(id); if (!job) throw new Error('Job not found');
    const protectedFields = { ...fields }; delete protectedFields.id; delete protectedFields.customerId; delete protectedFields.orderId; delete protectedFields.sourceKey;
    await this.db.jobs.update(id, await encryptJob({ ...protectedFields, updatedAt: new Date().toISOString() }));
    return this.getJob(id);
  },
  async transitionJob(id, stage, metadata = {}) {
    const stages = ['materials_ordered', 'materials_received', 'fitting_scheduled', 'on_site', 'blocked', 'return_visit_required', 'completed', 'signed_off'];
    if (!stages.includes(stage)) throw new Error('Invalid job stage');
    const job = await this.getJob(id); if (!job) throw new Error('Job not found');
    if (metadata.operationId && job.lastTransitionOperationId === metadata.operationId) return job;
    if (['completed', 'signed_off'].includes(stage)) throw new Error('Use the explicit completion or sign-off action');
    return this.updateJob(id, { status: stage, lastTransitionOperationId: metadata.operationId || null, stageChangedAt: new Date().toISOString() });
  },
  async setJobStage(id, stage, metadata = {}) { return this.transitionJob(id, stage, metadata); },

  async linkAppointmentToJob(jobId, appointmentId, role = null) {
    const job = await this.db.jobs.get(jobId); if (!job) throw new Error('Job not found');
    const appointment = await this.getAppointment(appointmentId); if (!appointment) throw new Error('Appointment not found');
    if (appointment.customerId && appointment.customerId !== job.customerId) throw new Error('Appointment belongs to a different customer');
    await this.db.appointments.update(appointmentId, { jobId, jobRole: role || appointment.jobRole || 'work_visit' });
    return this.getAppointment(appointmentId);
  },
  async linkJobAppointment(jobId, appointmentId, role = null) { return this.linkAppointmentToJob(jobId, appointmentId, role); },
  async getJobAppointments(jobId) {
    const rows = await this.db.appointments.where('jobId').equals(jobId).toArray(); rows.sort((a, b) => new Date(a.date) - new Date(b.date));
    return Promise.all(rows.map(row => decryptAppointment(row)));
  },
  async scheduleJobVisit(jobId, appointmentData) {
    const job = await this.getJob(jobId); if (!job) throw new Error('Job not found');
    if (!appointmentData || !appointmentData.date) throw new Error('Visit date is required');
    const operationId = appointmentData.operationId || null;
    const plain = { ...appointmentData, operationId: undefined, customerId: job.customerId, jobId, jobScheduleOperationId: operationId, type: appointmentData.type || job.type || 'fitting', status: appointmentData.status || 'confirmed', outcome: appointmentData.outcome || null, value: appointmentData.value || 0, commission: appointmentData.commission || 0, createdAt: new Date().toISOString() };
    const encrypted = await encryptAppointment(plain);
    const run = async () => {
      let existing = null;
      if (operationId) existing = (await this.db.appointments.where('jobId').equals(jobId).toArray()).find(a => a.jobScheduleOperationId === operationId);
      if (existing) return existing;
      const id = await this.db.appointments.add(encrypted);
      if (job.status === 'materials_received' || job.status === 'materials_ordered') await this.db.jobs.update(jobId, { status: 'fitting_scheduled', scheduledStart: plain.arrivalStart || plain.date, scheduledEnd: plain.arrivalEnd || null, updatedAt: new Date().toISOString() });
      return { ...encrypted, id };
    };
    let row;
    if (typeof this.db.transaction === 'function') row = await this.db.transaction('rw', [this.db.appointments, this.db.jobs], run);
    else {
      if (!this._jobScheduleLocks) this._jobScheduleLocks = new Map();
      const key = `${jobId}:${operationId || 'new'}`;
      if (operationId && this._jobScheduleLocks.has(key)) row = await this._jobScheduleLocks.get(key);
      else { const pending = run().finally(() => this._jobScheduleLocks.delete(key)); if (operationId) this._jobScheduleLocks.set(key, pending); row = await pending; }
    }
    return decryptAppointment(row);
  },

  async createChecklistTemplate(data, items) {
    if (!data || !data.visitType || !Array.isArray(items) || !items.length) throw new Error('Checklist template and items are required');
    const now = new Date().toISOString(); let templateId;
    await this._runWrite(['checklistTemplates', 'checklistItems'], async () => {
      templateId = await this.db.checklistTemplates.add({ ...data, active: data.active !== false, createdAt: now, updatedAt: now });
      for (let i = 0; i < items.length; i++) {
        if (!String(items[i].label || '').trim()) throw new Error('Checklist item label is required');
        await this.db.checklistItems.add({ ...items[i], templateId, label: String(items[i].label).trim(), required: items[i].required !== false, displayOrder: items[i].displayOrder ?? i, createdAt: now });
      }
    });
    return { template: await this.db.checklistTemplates.get(templateId), items: await this.db.checklistItems.where('templateId').equals(templateId).toArray() };
  },
  async getChecklistForJob(jobId, appointmentId = null) {
    const job = await this.getJob(jobId); if (!job) throw new Error('Job not found');
    let visitType = job.type;
    if (appointmentId) { const appt = await this.getAppointment(appointmentId); if (appt) visitType = appt.type || visitType; }
    const templates = (await this.db.checklistTemplates.where('visitType').equals(visitType).toArray()).filter(t => t.active !== false).sort((a, b) => (b.id || 0) - (a.id || 0));
    const template = templates[0] || null;
    const items = template ? (await this.db.checklistItems.where('templateId').equals(template.id).toArray()).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)) : [];
    let responses = await this.db.checklistResponses.where('jobId').equals(jobId).toArray();
    if (appointmentId) responses = responses.filter(r => r.appointmentId === appointmentId || r.appointmentId == null);
    responses = await Promise.all(responses.map(r => decryptChecklistResponse(r)));
    return { template, items, responses };
  },
  async setChecklistResponse(data) {
    if (!data || !Number.isInteger(data.jobId) || !Number.isInteger(data.checklistItemId)) throw new Error('Job and checklist item are required');
    if (!await this.db.jobs.get(data.jobId) || !await this.db.checklistItems.get(data.checklistItemId)) throw new Error('Checklist relationship not found');
    const prepared = await encryptChecklistResponse({ ...data, completed: data.completed === true, updatedAt: new Date().toISOString() });
    const rows = await this.db.checklistResponses.where('jobId').equals(data.jobId).toArray();
    const existing = rows.find(r => r.checklistItemId === data.checklistItemId && (r.appointmentId || null) === (data.appointmentId || null));
    if (existing) { await this.db.checklistResponses.update(existing.id, prepared); return decryptChecklistResponse({ ...existing, ...prepared }); }
    const id = await this.db.checklistResponses.add({ ...prepared, createdAt: new Date().toISOString() }); return decryptChecklistResponse({ ...prepared, id });
  },

  async addJobIssue(jobId, data) {
    if (!await this.db.jobs.get(jobId)) throw new Error('Job not found');
    if (!data || !String(data.title || '').trim()) throw new Error('Issue title is required');
    const now = new Date().toISOString(); const issue = await encryptJobIssue({ ...data, jobId, title: String(data.title).trim(), status: 'open', createdAt: now, updatedAt: now });
    const id = await this.db.jobIssues.add(issue); return decryptJobIssue({ ...issue, id });
  },
  async getJobIssues(jobId) { const rows = await this.db.jobIssues.where('jobId').equals(jobId).toArray(); return Promise.all(rows.map(r => decryptJobIssue(r))); },
  async resolveJobIssue(issueId, resolution, options = {}) {
    if (options.confirmed !== true) throw new Error('Issue resolution requires explicit confirmation');
    const issue = await this.db.jobIssues.get(issueId); if (!issue) throw new Error('Issue not found');
    if (issue.status === 'resolved') return decryptJobIssue(issue);
    const fields = await encryptJobIssue({ status: 'resolved', resolution: resolution || '', resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await this.db.jobIssues.update(issueId, fields); return decryptJobIssue({ ...issue, ...fields });
  },

  async completeJob(jobId, options = {}) {
    if (options.confirmed !== true) throw new Error('Job completion requires explicit confirmation');
    const job = await this.getJob(jobId); if (!job) throw new Error('Job not found');
    if (options.operationId && job.lastCompletionOperationId === options.operationId) return job;
    const checklist = await this.getChecklistForJob(jobId);
    const completedIds = new Set(checklist.responses.filter(r => r.completed).map(r => r.checklistItemId));
    const missing = checklist.items.filter(item => item.required && !completedIds.has(item.id));
    const openIssues = (await this.getJobIssues(jobId)).filter(issue => issue.status !== 'resolved');
    if ((missing.length || openIssues.length) && !String(options.overrideReason || '').trim()) throw new Error('Mandatory checklist items or issues remain; an override reason is required');
    const now = new Date().toISOString();
    return this.updateJob(jobId, { status: 'completed', completedAt: now, completionOverrideReason: options.overrideReason || '', lastCompletionOperationId: options.operationId || null });
  },
  async signOffJob(jobId, options = {}) {
    if (options.confirmed !== true) throw new Error('Customer sign-off requires explicit confirmation');
    const job = await this.getJob(jobId); if (!job) throw new Error('Job not found');
    if (options.operationId && job.lastSignoffOperationId === options.operationId) return job;
    if (job.status !== 'completed' && job.status !== 'signed_off') throw new Error('Complete the job before sign-off');
    if (job.status === 'signed_off') return job;
    const now = new Date().toISOString();
    return this.updateJob(jobId, { status: 'signed_off', signedOffAt: now, signoffName: options.customerName || '', signoffMethod: options.method || 'advisor_recorded', lastSignoffOperationId: options.operationId || null });
  },

  // Phase 1 durable work management ------------------------------------
  async addLead(data) {
    const now = new Date().toISOString();
    if (data.status && !['new', 'contacted', 'qualified', 'converted', 'lost'].includes(data.status)) throw new Error('Invalid lead status');
    if (data.status === 'lost' && !data.lossReason) throw new Error('A loss reason is required');
    const lead = {
      ...data,
      status: data.status || 'new',
      receivedAt: data.receivedAt || now,
      createdAt: now,
      updatedAt: now
    };
    const id = await this.db.leads.add(await encryptLead(lead));
    return { ...lead, id };
  },

  async getLead(id) {
    const row = await this.db.leads.get(id);
    return row ? decryptLead(row) : null;
  },

  async getLeads(filters = {}) {
    let rows = await this.db.leads.toArray();
    if (filters.status) rows = rows.filter(row => row.status === filters.status);
    if (filters.customerId) rows = rows.filter(row => row.customerId === filters.customerId);
    rows.sort((a, b) => new Date(b.receivedAt || b.createdAt) - new Date(a.receivedAt || a.createdAt));
    return Promise.all(rows.map(row => decryptLead(row)));
  },

  async updateLead(id, fields) {
    const existing = await this.getLead(id);
    if (!existing) throw new Error('Lead not found');
    const status = fields.status || existing.status;
    if (!['new', 'contacted', 'qualified', 'converted', 'lost'].includes(status)) throw new Error('Invalid lead status');
    if (status === 'lost' && !(fields.lossReason || existing.lossReason)) throw new Error('A loss reason is required');
    const changes = { ...fields, updatedAt: new Date().toISOString() };
    await this.db.leads.update(id, await encryptLead(changes));
    return this.getLead(id);
  },

  async convertLeadToCustomer(leadId) {
    let lead = await this.getLead(leadId);
    if (!lead) throw new Error('Lead not found');
    let customer = lead.customerId ? await this.getCustomer(lead.customerId) : null;
    if (!customer) {
      customer = await this.addCustomer({
        firstName: lead.firstName || lead.name || 'Enquiry',
        lastName: lead.lastName || '',
        phone: lead.phone || '', email: lead.email || '', address: lead.address || '',
        source: lead.source || 'lead'
      });
      lead = await this.updateLead(leadId, { customerId: customer.id });
    }
    return { lead, customer };
  },

  async convertLeadToVisit(leadId, appointmentData = {}) {
    let { lead, customer } = await this.convertLeadToCustomer(leadId);
    let appointment = lead.appointmentId ? await this.getAppointment(lead.appointmentId) : null;
    if (!appointment) {
      if (!appointmentData.date) throw new Error('Visit date is required');
      appointment = await this.addAppointment({ ...appointmentData, customerId: customer.id });
      lead = await this.updateLead(leadId, { appointmentId: appointment.id, customerId: customer.id, status: 'converted', convertedAt: new Date().toISOString() });
    } else if (lead.status !== 'converted') {
      lead = await this.updateLead(leadId, { status: 'converted', convertedAt: new Date().toISOString() });
    }
    return { lead, customer, appointment };
  },

  async addTask(data) {
    if (!data || !String(data.title || '').trim()) throw new Error('Task title is required');
    if (data.status && !['open', 'completed', 'cancelled'].includes(data.status)) throw new Error('Invalid task status');
    const now = new Date().toISOString();
    const task = { ...data, title: String(data.title).trim(), status: data.status || 'open', priority: data.priority || 'normal', createdAt: now, updatedAt: now };
    const id = await this.db.tasks.add(await encryptTask(task));
    return { ...task, id };
  },

  async getTask(id) {
    const row = await this.db.tasks.get(id);
    return row ? decryptTask(row) : null;
  },

  async getTasks(filters = {}) {
    let rows = await this.db.tasks.toArray();
    if (filters.status) rows = rows.filter(row => row.status === filters.status);
    if (filters.leadId) rows = rows.filter(row => row.leadId === filters.leadId);
    if (filters.customerId) rows = rows.filter(row => row.customerId === filters.customerId);
    rows.sort((a, b) => new Date(a.snoozedUntil || a.dueAt || a.createdAt) - new Date(b.snoozedUntil || b.dueAt || b.createdAt));
    return Promise.all(rows.map(row => decryptTask(row)));
  },

  async updateTask(id, fields) {
    const existing = await this.getTask(id);
    if (!existing) throw new Error('Task not found');
    if (fields.status && !['open', 'completed', 'cancelled'].includes(fields.status)) throw new Error('Invalid task status');
    const changes = { ...fields, updatedAt: new Date().toISOString() };
    await this.db.tasks.update(id, await encryptTask(changes));
    return this.getTask(id);
  },

  async createTaskFromSuggestion(sourceKey, data) {
    if (!sourceKey || typeof sourceKey !== 'string') throw new Error('Suggestion key is required');
    if (!data || !String(data.title || '').trim()) throw new Error('Task title is required');
    const now = new Date().toISOString();
    const task = { ...data, title: String(data.title).trim(), sourceKey, status: data.status || 'open', priority: data.priority || 'normal', createdAt: now, updatedAt: now };
    const encrypted = await encryptTask(task);
    let row;
    if (typeof this.db.transaction === 'function') {
      await this.db.transaction('rw', this.db.tasks, async () => {
        row = await this.db.tasks.where('sourceKey').equals(sourceKey).first();
        if (!row) {
          const id = await this.db.tasks.add(encrypted);
          row = { ...encrypted, id };
        }
      });
    } else {
      row = await this.db.tasks.where('sourceKey').equals(sourceKey).first();
      if (!row) {
        const id = await this.db.tasks.add(encrypted);
        row = { ...encrypted, id };
      }
    }
    return decryptTask(row);
  },

  async _transitionTask(taskId, type, changes, operationId) {
    if (!operationId || typeof operationId !== 'string') throw new Error('Operation id is required');
    if (typeof this.db.transaction === 'function') {
      await this.db.transaction('rw', [this.db.tasks, this.db.taskEvents], async () => {
        const prior = await this.db.taskEvents.where('idempotencyKey').equals(operationId).first();
        if (prior) return;
        const rawTask = await this.db.tasks.get(taskId);
        if (!rawTask) throw new Error('Task not found');
        const now = new Date().toISOString();
        await this.db.tasks.update(taskId, { ...changes, updatedAt: now });
        await this.db.taskEvents.add({ taskId, type, occurredAt: now, idempotencyKey: operationId, createdAt: now, details: changes });
      });
      return this.getTask(taskId);
    }
    const run = async () => {
      const prior = await this.db.taskEvents.where('idempotencyKey').equals(operationId).first();
      if (prior) return this.getTask(taskId);
      const task = await this.getTask(taskId);
      if (!task) throw new Error('Task not found');
      const now = new Date().toISOString();
      await this.db.tasks.update(taskId, { ...changes, updatedAt: now });
      await this.db.taskEvents.add({ taskId, type, occurredAt: now, idempotencyKey: operationId, createdAt: now, details: changes });
      return this.getTask(taskId);
    };
    return run();
  },

  async completeTask(taskId, operationId) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status === 'completed') return task;
    return this._transitionTask(taskId, 'completed', { status: 'completed', completedAt: new Date().toISOString() }, operationId);
  },

  async snoozeTask(taskId, snoozedUntil, operationId) {
    const until = new Date(snoozedUntil);
    if (isNaN(until.getTime())) throw new Error('Invalid snooze date');
    return this._transitionTask(taskId, 'snoozed', { status: 'open', snoozedUntil: until.toISOString() }, operationId);
  },

  async reopenTask(taskId, operationId) {
    return this._transitionTask(taskId, 'reopened', { status: 'open', completedAt: null }, operationId);
  },

  async addSupplier(data) { if (!data || !String(data.name || '').trim()) throw new Error('Supplier name is required'); const status=data.status||'active';if(!['active','inactive'].includes(status))throw new Error('Supplier status is invalid');const now=new Date().toISOString(),row={...data,name:String(data.name).trim(),status,createdAt:now,updatedAt:now};row.id=await this.db.suppliers.add(row);return row; },
  async getSuppliers(filters={}) { let rows=await this.db.suppliers.toArray();if(filters.status)rows=rows.filter(r=>r.status===filters.status);return rows.sort((a,b)=>a.name.localeCompare(b.name)); },
  async addProduct(data) { if(!data||!Number.isInteger(data.supplierId)||!await this.db.suppliers.get(data.supplierId))throw new Error('Product supplier is required');if(!String(data.name||'').trim())throw new Error('Product name is required');const now=new Date().toISOString(),row={...data,name:String(data.name).trim(),sku:String(data.sku||'').trim(),active:data.active!==false,createdAt:now,updatedAt:now};row.id=await this.db.products.add(row);return row; },
  async getProducts(filters={}) { let rows=await this.db.products.toArray();for(const field of ['supplierId','active'])if(filters[field]!=null)rows=rows.filter(r=>r[field]===filters[field]);return rows.sort((a,b)=>a.name.localeCompare(b.name)); },
  async _hydratePurchaseOrder(row) { if(!row)return null;const supplier=await this.db.suppliers.get(row.supplierId),items=await this.db.purchaseOrderItems.where('purchaseOrderId').equals(row.id).toArray(),events=(Array.isArray(row.events)?row.events:[]).slice().sort((a,b)=>new Date(a.occurredAt)-new Date(b.occurredAt)),resolved=new Set(events.filter(e=>e.type==='issue_resolved'&&e.resolvesEventId).map(e=>e.resolvesEventId));return{...row,supplierName:supplier?.name||'Unknown supplier',items,events,openIssueCount:events.filter(e=>['shortage','damage'].includes(e.type)&&!resolved.has(e.id)).length}; },
  async getPurchaseOrder(id){return this._hydratePurchaseOrder(await this.db.purchaseOrders.get(id));},
  async getPurchaseOrders(filters={}){let rows=await this.db.purchaseOrders.toArray();for(const field of ['supplierId','orderId','jobId','status'])if(filters[field]!=null)rows=rows.filter(r=>r[field]===filters[field]);rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));return Promise.all(rows.map(r=>this._hydratePurchaseOrder(r)));},
  async createPurchaseOrder(data,items=[],operationId=null){if(!data||!Number.isInteger(data.supplierId)||!await this.db.suppliers.get(data.supplierId))throw new Error('Purchase order supplier is required');if(!Number.isInteger(data.orderId)||!await this.db.orders.get(data.orderId))throw new Error('Commercial order is required');if(data.jobId!=null){const job=await this.db.jobs.get(data.jobId);if(!job||job.orderId!==data.orderId)throw new Error('Purchase order job is invalid');}if(operationId){const existing=await this.db.purchaseOrders.where('operationId').equals(operationId).first();if(existing)return{purchaseOrder:await this._hydratePurchaseOrder(existing),created:false};}const statuses=['draft','submitted','acknowledged','part_received','received','issue','returned','cancelled'],status=data.status||'draft';if(!statuses.includes(status))throw new Error('Purchase order status is invalid');if(!Array.isArray(items)||!items.length)throw new Error('At least one purchase order item is required');const now=new Date().toISOString();let id;await this._runWrite(['purchaseOrders','purchaseOrderItems'],async()=>{id=await this.db.purchaseOrders.add({...data,status,operationId:operationId||null,events:[],createdAt:now,updatedAt:now});for(const item of items){const quantity=Number(item.quantity);if(!(quantity>0))throw new Error('Purchase order quantity must be positive');if(item.productId!=null){const product=await this.db.products.get(item.productId);if(!product||product.supplierId!==data.supplierId)throw new Error('Purchase order product is invalid');}await this.db.purchaseOrderItems.add({...item,purchaseOrderId:id,quantity,unitCost:Math.max(0,Number(item.unitCost)||0),createdAt:now});}});return{purchaseOrder:await this.getPurchaseOrder(id),created:true};},
  async updatePurchaseOrder(id,patch={}){const row=await this.db.purchaseOrders.get(id);if(!row)throw new Error('Purchase order not found');const allowed={};for(const field of ['reference','expectedAt'])if(patch[field]!==undefined)allowed[field]=patch[field];await this.db.purchaseOrders.update(id,{...allowed,updatedAt:new Date().toISOString()});return this.getPurchaseOrder(id);},
  async recordPurchaseOrderEvent(id,type,data={},operationId=null){const allowed=['submitted','acknowledged','received','shortage','damage','returned','issue_resolved','note'];if(!allowed.includes(type))throw new Error('Purchase order event is invalid');const row=await this.db.purchaseOrders.get(id);if(!row)throw new Error('Purchase order not found');const events=Array.isArray(row.events)?row.events.slice():[];if(operationId&&events.some(e=>e.operationId===operationId))return this.getPurchaseOrder(id);const occurredAt=new Date(data.occurredAt||new Date());if(isNaN(occurredAt.getTime()))throw new Error('Purchase order event date is invalid');events.push({...data,id:`${id}:${events.length+1}`,type,operationId:operationId||null,occurredAt:occurredAt.toISOString()});const statusMap={submitted:'submitted',acknowledged:'acknowledged',received:'received',shortage:'issue',damage:'issue',returned:'returned'};await this.db.purchaseOrders.update(id,{events,status:statusMap[type]||row.status,updatedAt:new Date().toISOString()});return this.getPurchaseOrder(id);},

  async addAvailabilityBlock(data){const types=['working','leave','unavailable'];if(!data||!types.includes(data.type))throw new Error('Availability type is invalid');const start=new Date(data.startAt),end=new Date(data.endAt);if(isNaN(start.getTime())||isNaN(end.getTime())||start>=end)throw new Error('Availability start must be before end');if(data.recurringDay!=null&&(data.type!=='working'||!Number.isInteger(data.recurringDay)||data.recurringDay<0||data.recurringDay>6))throw new Error('Recurring day is invalid');const now=new Date().toISOString(),row=await encryptAvailabilityBlock({...data,startAt:start.toISOString(),endAt:end.toISOString(),createdAt:now,updatedAt:now});row.id=await this.db.availabilityBlocks.add(row);return decryptAvailabilityBlock(row);},
  async updateAvailabilityBlock(id,data={}){const current=await this.db.availabilityBlocks.get(id);if(!current)throw new Error('Availability block not found');const plain=await decryptAvailabilityBlock(current),merged={...plain,...data},start=new Date(merged.startAt),end=new Date(merged.endAt);if(isNaN(start.getTime())||isNaN(end.getTime())||start>=end)throw new Error('Availability start must be before end');const encrypted=await encryptAvailabilityBlock({...data,startAt:start.toISOString(),endAt:end.toISOString(),updatedAt:new Date().toISOString()});await this.db.availabilityBlocks.update(id,encrypted);return decryptAvailabilityBlock({...current,...encrypted,id});},
  async deleteAvailabilityBlock(id){return this.db.availabilityBlocks.delete(id);},
  async getAvailabilityBlocks(filters={}){let rows=await this.db.availabilityBlocks.toArray();if(filters.type)rows=rows.filter(r=>r.type===filters.type);if(filters.from){const from=new Date(filters.from);rows=rows.filter(r=>new Date(r.endAt)>from);}if(filters.to){const to=new Date(filters.to);rows=rows.filter(r=>new Date(r.startAt)<to);}rows.sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));return Promise.all(rows.map(decryptAvailabilityBlock));},

  // Phase 5: immutable policy selection and explicit, idempotent job costs.
  async createFinancialPolicy(data) {
    const modes = ['commission_advisor', 'sole_trader', 'hybrid'];
    if (!data || !modes.includes(data.mode)) throw new Error('Financial mode is invalid');
    const effectiveFrom = new Date(data.effectiveFrom);
    if (isNaN(effectiveFrom.getTime())) throw new Error('Policy effective date is invalid');
    const rows = await this.db.financialPolicies.toArray();
    const latest = rows.sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom))[0];
    if (latest && effectiveFrom <= new Date(latest.effectiveFrom)) throw new Error('A new policy must start after the current policy');
    const percent = (value, name) => { const n = Number(value || 0); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${name} must be between 0 and 100`); return Math.round(n * 10000) / 10000; };
    const money = (value, name) => { const n = Number(value || 0); if (!Number.isFinite(n) || n < 0) throw new Error(`${name} cannot be negative`); return Math.round(n * 100) / 100; };
    const row = { mode: data.mode, effectiveFrom: effectiveFrom.toISOString(), commissionRate: percent(data.commissionRate, 'Commission rate'), paymentFeeRate: percent(data.paymentFeeRate, 'Payment fee rate'), mileageRate: money(data.mileageRate, 'Mileage rate'), labourHourlyCost: money(data.labourHourlyCost, 'Hourly labour cost'), createdAt: new Date().toISOString() };
    row.id = await this.db.financialPolicies.add(row); return row;
  },
  async getFinancialPolicies() { const rows = await this.db.financialPolicies.toArray(); return rows.sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom)); },
  async getEffectiveFinancialPolicy(at) { const date = new Date(at || new Date()); if (isNaN(date.getTime())) throw new Error('Policy date is invalid'); const rows = (await this.getFinancialPolicies()).filter(row => new Date(row.effectiveFrom) <= date); return rows[rows.length - 1] || null; },
  async addJobCost(data) {
    const categories = ['materials', 'subcontractor', 'travel', 'payment_fee', 'labour', 'other'];
    if (!data || !Number.isInteger(data.jobId) || !Number.isInteger(data.orderId)) throw new Error('Job and order are required');
    const job = await this.db.jobs.get(data.jobId), order = await this.db.orders.get(data.orderId);
    if (!job || !order || job.orderId !== order.id || job.customerId !== order.customerId) throw new Error('Job cost relationships are invalid');
    if (!categories.includes(data.category)) throw new Error('Job cost category is invalid');
    const amount = Math.round(Number(data.amount) * 100) / 100; if (!(amount > 0) || !Number.isFinite(amount)) throw new Error('Job cost amount must be positive');
    if (data.operationId) { const existing = await this.db.jobCosts.where('operationId').equals(data.operationId).first(); if (existing) return decryptJobCost(existing); }
    const incurredAt = new Date(data.incurredAt || new Date()); if (isNaN(incurredAt.getTime())) throw new Error('Job cost date is invalid');
    const row = await encryptJobCost({ ...data, customerId: job.customerId, amount, incurredAt: incurredAt.toISOString(), createdAt: new Date().toISOString() }); row.id = await this.db.jobCosts.add(row); return decryptJobCost(row);
  },
  async getJobCosts(filters = {}) { let rows = await this.db.jobCosts.toArray(); for (const field of ['customerId', 'orderId', 'jobId', 'category']) if (filters[field] != null) rows = rows.filter(row => row[field] === filters[field]); rows.sort((a, b) => new Date(a.incurredAt) - new Date(b.incurredAt)); return Promise.all(rows.map(decryptJobCost)); },
  _effectiveRevenue(saleValue, policy) { const gross = Math.round((Number(saleValue) || 0) * 100) / 100; if (policy?.mode === 'commission_advisor') return Math.round(gross * (Number(policy.commissionRate) || 0)) / 100; return gross; },
  _profitabilityMetrics(revenue, directCost, hours, policy, context = {}) { const money = value => Math.round((Number(value) || 0) * 100) / 100; revenue = money(revenue); directCost = money(directCost); hours = Math.max(0, Number(hours) || 0); const grossProfit = money(revenue - directCost); return { ...context, revenue, directCost, grossProfit, marginPercent: revenue > 0 ? Math.round(grossProfit / revenue * 10000) / 100 : 0, effectiveHourlyValue: hours > 0 ? money(grossProfit / hours) : null, hours: Math.round(hours * 100) / 100, policyId: policy?.id || null, financialMode: policy?.mode || null }; },
  async calculateQuoteProfitability(quoteId, hours = 0) { const result = await this.getQuote(quoteId); if (!result) throw new Error('Quote not found'); const quote = result.quote, asOf = quote.issueDate || quote.createdAt, policy = await this.getEffectiveFinancialPolicy(asOf); const cost = result.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.cost || 0), 0); return this._profitabilityMetrics(this._effectiveRevenue(quote.total, policy), cost, hours, policy, { quoteId, saleValue: quote.total, basis: 'quoted_estimate', asOf }); },
  async calculateJobProfitability(jobId, hours = 0) { const job = await this.getJob(jobId); if (!job) throw new Error('Job not found'); const order = await this.db.orders.get(job.orderId); if (!order) throw new Error('Order not found'); const costs = await this.getJobCosts({ jobId }), asOf = order.createdAt || job.createdAt, policy = await this.getEffectiveFinancialPolicy(asOf); return this._profitabilityMetrics(this._effectiveRevenue(order.total, policy), costs.reduce((sum, row) => sum + Number(row.amount || 0), 0), hours, policy, { jobId, orderId: order.id, saleValue: order.total, basis: 'actual_job_costs', asOf }); },

  // Phase 6 retention, consent, communication state, and offline sync -----
  async addRetentionRecord(data) {
    const types=['satisfaction_check','review_request','referral','warranty','service','repeat_opportunity'];
    if(!data||!Number.isInteger(data.customerId)||!await this.db.customers.get(data.customerId))throw new Error('Retention customer is required');
    if(!types.includes(data.type))throw new Error('Retention type is invalid');
    if(data.orderId!=null){const order=await this.db.orders.get(data.orderId);if(!order||order.customerId!==data.customerId)throw new Error('Retention order is invalid');}
    if(data.jobId!=null){const job=await this.db.jobs.get(data.jobId);if(!job||job.customerId!==data.customerId)throw new Error('Retention job is invalid');}
    if(data.operationId){const existing=await this.db.retentionRecords.where('operationId').equals(data.operationId).first();if(existing)return decryptRetentionRecord(existing);}
    if(data.score!=null&&(!Number.isInteger(data.score)||data.score<1||data.score>5))throw new Error('Satisfaction score must be from 1 to 5');
    const dueAt=data.dueAt?new Date(data.dueAt):null;if(dueAt&&isNaN(dueAt.getTime()))throw new Error('Retention due date is invalid');
    const now=new Date().toISOString(),row=await encryptRetentionRecord({...data,status:data.status||'planned',dueAt:dueAt?.toISOString()||null,createdAt:now,updatedAt:now});row.id=await this.db.retentionRecords.add(row);return decryptRetentionRecord(row);
  },
  async getRetentionRecords(filters={}){let rows=await this.db.retentionRecords.toArray();for(const field of ['customerId','orderId','jobId','type','status'])if(filters[field]!=null)rows=rows.filter(r=>r[field]===filters[field]);if(filters.dueBefore){const end=new Date(filters.dueBefore);rows=rows.filter(r=>r.dueAt&&new Date(r.dueAt)<=end);}rows.sort((a,b)=>new Date(a.dueAt||a.createdAt)-new Date(b.dueAt||b.createdAt));return Promise.all(rows.map(decryptRetentionRecord));},
  async updateRetentionRecord(id,patch={}){const current=await this.db.retentionRecords.get(id);if(!current)throw new Error('Retention record not found');const allowed={};for(const field of ['status','dueAt','completedAt','score','notes','outcome'])if(patch[field]!==undefined)allowed[field]=patch[field];if(allowed.status&&!['planned','due','completed','cancelled'].includes(allowed.status))throw new Error('Retention status is invalid');if(allowed.score!=null&&(!Number.isInteger(allowed.score)||allowed.score<1||allowed.score>5))throw new Error('Satisfaction score must be from 1 to 5');for(const field of ['dueAt','completedAt'])if(allowed[field]!=null){const date=new Date(allowed[field]);if(isNaN(date.getTime()))throw new Error('Retention date is invalid');allowed[field]=date.toISOString();}const encrypted=await encryptRetentionRecord({...allowed,updatedAt:new Date().toISOString()});await this.db.retentionRecords.update(id,encrypted);return decryptRetentionRecord({...current,...encrypted,id});},

  async setContactPreference(data,operationId=null){const channels=['phone','email','sms','whatsapp','post'],statuses=['opted_in','opted_out','unknown','blocked'];if(!data||!Number.isInteger(data.customerId)||!await this.db.customers.get(data.customerId))throw new Error('Preference customer is required');if(!channels.includes(data.channel)||!statuses.includes(data.status))throw new Error('Contact preference is invalid');const op=operationId||data.operationId||null;if(op){const existing=await this.db.contactPreferences.where('operationId').equals(op).first();if(existing)return decryptContactPreference(existing);}const effectiveAt=new Date(data.effectiveAt||new Date());if(isNaN(effectiveAt.getTime()))throw new Error('Preference effective date is invalid');const now=new Date().toISOString(),row=await encryptContactPreference({...data,operationId:op,effectiveAt:effectiveAt.toISOString(),createdAt:now});row.id=await this.db.contactPreferences.add(row);return decryptContactPreference(row);},
  async setContactPreferences(data){return this.setContactPreference(data,data?.operationId||null);},
  async recordConsentEvent(data,operationId=null){return this.setContactPreference(data,operationId);},
  async getContactPreferences(input){const filters=Number.isInteger(input)?{customerId:input}:(input||{});if(!Number.isInteger(filters.customerId))throw new Error('Customer is required');let rows=await this.db.contactPreferences.where('customerId').equals(filters.customerId).toArray();rows.sort((a,b)=>new Date(a.effectiveAt)-new Date(b.effectiveAt));const history=await Promise.all(rows.map(decryptContactPreference)),current={};for(const row of history)current[row.channel]=row;if(filters.channel)return current[filters.channel]?[current[filters.channel]]:[];current.history=history;return current;},

  async recordCommunicationEvent(communicationId,state,data={},operationId=null){if(communicationId&&typeof communicationId==='object'){const input=communicationId;communicationId=input.communicationId;state=input.state;data=input;operationId=input.operationId||null;}const states=['drafted','queued','handed_off','attempted','sent','advisor_confirmed_sent','delivered','read','replied','failed','cancelled'];const communication=await this.db.communications.get(communicationId);if(!communication)throw new Error('Communication not found');if(!states.includes(state))throw new Error('Communication state is invalid');if(operationId){const existing=await this.db.communicationEvents.where('operationId').equals(operationId).first();if(existing)return decryptCommunicationEvent(existing);}const occurredAt=new Date(data.occurredAt||new Date());if(isNaN(occurredAt.getTime()))throw new Error('Communication event date is invalid');const now=new Date().toISOString(),row=await encryptCommunicationEvent({...data,communicationId,customerId:communication.customerId||null,state,operationId:operationId||null,occurredAt:occurredAt.toISOString(),createdAt:now});row.id=await this.db.communicationEvents.add(row);return decryptCommunicationEvent(row);},
  async getCommunicationEvents(input){const communicationId=Number.isInteger(input)?input:input?.communicationId;if(!Number.isInteger(communicationId))throw new Error('Communication is required');const rows=await this.db.communicationEvents.where('communicationId').equals(communicationId).toArray();rows.sort((a,b)=>new Date(a.occurredAt)-new Date(b.occurredAt));return Promise.all(rows.map(decryptCommunicationEvent));},

  async upsertIntegrationLink(data){if(!data||!String(data.provider||'').trim()||!String(data.entityType||'').trim()||!Number.isInteger(data.localId)||!String(data.remoteId||'').trim())throw new Error('Integration link is invalid');const rows=await this.db.integrationLinks.where('provider').equals(data.provider).toArray();const existing=rows.find(r=>r.entityType===data.entityType&&r.localId===data.localId);const now=new Date().toISOString();if(existing){await this.db.integrationLinks.update(existing.id,{remoteId:String(data.remoteId),remoteVersion:data.remoteVersion||null,updatedAt:now});return this.db.integrationLinks.get(existing.id);}const row={...data,remoteId:String(data.remoteId),createdAt:now,updatedAt:now};row.id=await this.db.integrationLinks.add(row);return row;},
  async getIntegrationLinks(filters={}){let rows=await this.db.integrationLinks.toArray();for(const field of ['provider','entityType','localId','remoteId'])if(filters[field]!=null)rows=rows.filter(r=>r[field]===filters[field]);return rows;},
  async addIntegrationConflict(data,operationId=null){if(!data||!Number.isInteger(data.integrationLinkId)||!await this.db.integrationLinks.get(data.integrationLinkId))throw new Error('Integration link is required');if(operationId){const existing=await this.db.integrationConflicts.where('operationId').equals(operationId).first();if(existing)return decryptIntegrationConflict(existing);}const now=new Date().toISOString(),row=await encryptIntegrationConflict({...data,status:'open',operationId:operationId||null,detectedAt:data.detectedAt||now,createdAt:now});row.id=await this.db.integrationConflicts.add(row);return decryptIntegrationConflict(row);},
  async resolveIntegrationConflict(id,resolution,data={}){const current=await this.db.integrationConflicts.get(id);if(!current)throw new Error('Integration conflict not found');if(!['keep_local','accept_remote','merged'].includes(resolution))throw new Error('Conflict resolution is invalid');const fields=await encryptIntegrationConflict({status:'resolved',resolution,resolutionNotes:data.notes||'',resolvedAt:new Date().toISOString()});await this.db.integrationConflicts.update(id,fields);return decryptIntegrationConflict({...current,...fields,id});},
  async getIntegrationConflicts(filters={}){let rows=await this.db.integrationConflicts.toArray();for(const field of ['integrationLinkId','status'])if(filters[field]!=null)rows=rows.filter(r=>r[field]===filters[field]);return Promise.all(rows.map(decryptIntegrationConflict));},
  async enqueueIntegrationOutbox(data,operationId=null){if(!data||!String(data.provider||'')||!String(data.entityType||'')||!Number.isInteger(data.localId)||!String(data.action||''))throw new Error('Outbox item is invalid');const op=operationId||data.operationId||null;if(op){const existing=await this.db.integrationOutbox.where('operationId').equals(op).first();if(existing)return decryptIntegrationOutbox(existing);}const now=new Date().toISOString(),row=await encryptIntegrationOutbox({...data,status:'pending',attempts:0,operationId:op,nextAttemptAt:data.nextAttemptAt||now,createdAt:now,updatedAt:now});row.id=await this.db.integrationOutbox.add(row);return decryptIntegrationOutbox(row);},
  async claimIntegrationOutbox(provider,now=new Date().toISOString()){const rows=(await this.db.integrationOutbox.where('provider').equals(provider).toArray()).filter(r=>['pending','retry'].includes(r.status)&&new Date(r.nextAttemptAt)<=new Date(now)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));const row=rows[0];if(!row)return null;await this.db.integrationOutbox.update(row.id,{status:'processing',attempts:(row.attempts||0)+1,updatedAt:new Date().toISOString()});return decryptIntegrationOutbox({...row,status:'processing',attempts:(row.attempts||0)+1});},
  async completeIntegrationOutbox(id,metadata={}){const row=await this.db.integrationOutbox.get(id);if(!row)throw new Error('Outbox item not found');await this.db.integrationOutbox.update(id,{status:'completed',remoteId:metadata.remoteId||row.remoteId||null,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return decryptIntegrationOutbox({...row,status:'completed'});},
  async failIntegrationOutbox(id,error,retryAt=null){const row=await this.db.integrationOutbox.get(id);if(!row)throw new Error('Outbox item not found');const fields=await encryptIntegrationOutbox({status:retryAt?'retry':'failed',lastError:String(error||'Integration failed'),nextAttemptAt:retryAt?new Date(retryAt).toISOString():null,updatedAt:new Date().toISOString()});await this.db.integrationOutbox.update(id,fields);return decryptIntegrationOutbox({...row,...fields,id});},
  async getIntegrationOutbox(filters={}){let rows=await this.db.integrationOutbox.toArray();for(const field of ['provider','entityType','localId','status'])if(filters[field]!=null)rows=rows.filter(r=>r[field]===filters[field]);return Promise.all(rows.map(decryptIntegrationOutbox));},

  async getTaskEvents(taskId) {
    const rows = await this.db.taskEvents.where('taskId').equals(taskId).toArray();
    return rows.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  },

  // Settings
  async getSetting(key, defaultValue = null) {
    const setting = await this.db.settings.get(key);
    return setting ? setting.value : defaultValue;
  },

  async setSetting(key, value) {
    await this.db.settings.put({ key, value });
  },

  // Device-only credentials use the same passphrase-derived AES-GCM key as
  // customer PII. They stay out of CONFIG, localStorage and every backup.
  async getPrivateSetting(key, defaultValue = null) {
    const setting = await this.db.settings.get(key);
    if (!setting) return defaultValue;
    return isEncrypted(setting.value) ? decryptField(setting.value) : setting.value;
  },

  async setPrivateSetting(key, value) {
    if (!value) {
      await this.db.settings.delete(key);
      return;
    }
    await this.db.settings.put({ key, value: await encryptField(String(value)) });
  },

  async deletePrivateSetting(key) {
    await this.db.settings.delete(key);
  },

  // Schema version of the current database. Real Dexie reports it as `verno`
  // once opened; the bundled shim keeps it internally without exposing it, so
  // fall back to the current schema constant (8 = Phase 6 retention added).
  schemaVersion() {
    return typeof this.db.verno === 'number' ? this.db.verno : DATABASE_SCHEMA_VERSION;
  },

  storageContract() {
    return {
      databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      backupTables: BACKUP_TABLES.slice()
    };
  },

  // Export
  // Full operational backup of the database: every record an advisor's
  // operational memory consists of - customers, appointments with their
  // measurements and trips, orders, expenses, communications, photos,
  // settings and sequences. Photos are included: they are part of the
  // working customer record, not optional cosmetics, and a backup that
  // drops them cannot reconstruct the advisor's working memory.
  // Runtime-only settings rows (migration/storage probes, demo flags) are
  // excluded - they are transient state, not advisor data, and must never
  // travel inside a backup.
  async exportAll() {
    const data = {};
    const tables = BACKUP_TABLES.filter(table => table !== 'settings' && table !== 'sequences');
    for (const table of tables) {
      data[table] = await this.db[table].toArray();
    }
    // Customer rows carry field-level ciphertext in the store. The backup
    // must carry the readable record instead: a restore re-encrypts on the
    // way in (importAll), so exporting ciphertext would lock every row
    // under the OLD key — unreadable after a reinstall or on a new device,
    // which is the entire point of a backup. Importing a backup is the
    // only write path that adds records without going through addCustomer.
    if (data.customers && data.customers.length) {
      data.customers = await Promise.all(data.customers.map(c => decryptCustomer(c)));
    }
    // Same for appointment PII (clientName/phone/address/notes): export the
    // readable record, re-encrypt on import.
    if (data.appointments && data.appointments.length) {
      data.appointments = await Promise.all(data.appointments.map(a => decryptAppointment(a)));
    }
    if (data.leads && data.leads.length) data.leads = await Promise.all(data.leads.map(row => decryptLead(row)));
    if (data.tasks && data.tasks.length) data.tasks = await Promise.all(data.tasks.map(row => decryptTask(row)));
    if (data.quotes && data.quotes.length) data.quotes = await Promise.all(data.quotes.map(row => decryptQuote(row)));
    if (data.quoteItems && data.quoteItems.length) data.quoteItems = await Promise.all(data.quoteItems.map(row => decryptQuoteItem(row)));
    if (data.jobs && data.jobs.length) data.jobs = await Promise.all(data.jobs.map(row => decryptJob(row)));
    if (data.checklistResponses && data.checklistResponses.length) data.checklistResponses = await Promise.all(data.checklistResponses.map(row => decryptChecklistResponse(row)));
    if (data.jobIssues && data.jobIssues.length) data.jobIssues = await Promise.all(data.jobIssues.map(row => decryptJobIssue(row)));
    if(data.payments?.length)data.payments=await Promise.all(data.payments.map(decryptPayment));if(data.invoices?.length)data.invoices=await Promise.all(data.invoices.map(decryptInvoice));if(data.invoiceItems?.length)data.invoiceItems=await Promise.all(data.invoiceItems.map(decryptInvoiceItem));if(data.creditNotes?.length)data.creditNotes=await Promise.all(data.creditNotes.map(decryptCreditNote));
    if(data.documents?.length)data.documents=await Promise.all(data.documents.map(decryptDocument));
    if(data.jobCosts?.length)data.jobCosts=await Promise.all(data.jobCosts.map(decryptJobCost));
    if(data.availabilityBlocks?.length)data.availabilityBlocks=await Promise.all(data.availabilityBlocks.map(decryptAvailabilityBlock));
    if(data.retentionRecords?.length)data.retentionRecords=await Promise.all(data.retentionRecords.map(decryptRetentionRecord));
    if(data.contactPreferences?.length)data.contactPreferences=await Promise.all(data.contactPreferences.map(decryptContactPreference));
    if(data.communicationEvents?.length)data.communicationEvents=await Promise.all(data.communicationEvents.map(decryptCommunicationEvent));
    if(data.integrationConflicts?.length)data.integrationConflicts=await Promise.all(data.integrationConflicts.map(decryptIntegrationConflict));
    if(data.integrationOutbox?.length)data.integrationOutbox=await Promise.all(data.integrationOutbox.map(decryptIntegrationOutbox));
    const RUNTIME_SETTING_KEYS = ['__v6_legacy_migrated__', '__storage_probe__', 'pitchDemoSeeded', DEVICE_AI_SECRET_SETTING];
    data.settings = (await this.db.settings.toArray()).filter(s => !RUNTIME_SETTING_KEYS.includes(s.key));
    data.sequences = await this.db.sequences.toArray();
    return data;
  },

  async importAll(data) {
    // Validate the whole backup — table shapes, record structure, primary
    // ID types, duplicate keys, date fields and every cross-table
    // relationship — BEFORE anything is touched on disk. A corrupt backup
    // is rejected wholesale; partial imports are impossible by construction.
    await this._validateBackup(data);

    // Prepare encrypted customer/appointment records before the transaction
    // (encryption is async and would otherwise yield, causing the transaction
    // to become inactive).
    let importData = data;
    if (encryptionKey && data.customers) {
      importData = { ...data };
      importData.customers = await Promise.all(data.customers.map(c => encryptCustomer(c)));
    }
    if (encryptionKey && importData.appointments) {
      importData = { ...importData };
      importData.appointments = await Promise.all(importData.appointments.map(a => encryptAppointment(a)));
    }
    if (encryptionKey && importData.leads) {
      importData = { ...importData };
      importData.leads = await Promise.all(importData.leads.map(row => encryptLead(row)));
    }
    if (encryptionKey && importData.tasks) {
      importData = { ...importData };
      importData.tasks = await Promise.all(importData.tasks.map(row => encryptTask(row)));
    }
    if (encryptionKey && importData.quotes) {
      importData = { ...importData };
      importData.quotes = await Promise.all(importData.quotes.map(row => encryptQuote(row)));
    }
    if (encryptionKey && importData.quoteItems) {
      importData = { ...importData };
      importData.quoteItems = await Promise.all(importData.quoteItems.map(row => encryptQuoteItem(row)));
    }
    if (encryptionKey && importData.jobs) {
      importData = { ...importData }; importData.jobs = await Promise.all(importData.jobs.map(row => encryptJob(row)));
    }
    if (encryptionKey && importData.checklistResponses) {
      importData = { ...importData }; importData.checklistResponses = await Promise.all(importData.checklistResponses.map(row => encryptChecklistResponse(row)));
    }
    if (encryptionKey && importData.jobIssues) {
      importData = { ...importData }; importData.jobIssues = await Promise.all(importData.jobIssues.map(row => encryptJobIssue(row)));
    }
    if(encryptionKey&&importData.payments){importData={...importData};importData.payments=await Promise.all(importData.payments.map(encryptPayment));}if(encryptionKey&&importData.invoices){importData={...importData};importData.invoices=await Promise.all(importData.invoices.map(encryptInvoice));}if(encryptionKey&&importData.invoiceItems){importData={...importData};importData.invoiceItems=await Promise.all(importData.invoiceItems.map(encryptInvoiceItem));}if(encryptionKey&&importData.creditNotes){importData={...importData};importData.creditNotes=await Promise.all(importData.creditNotes.map(encryptCreditNote));}
    if(encryptionKey&&importData.documents){importData={...importData};importData.documents=await Promise.all(importData.documents.map(encryptDocument));}
    if(encryptionKey&&importData.jobCosts){importData={...importData};importData.jobCosts=await Promise.all(importData.jobCosts.map(encryptJobCost));}
    if(encryptionKey&&importData.availabilityBlocks){importData={...importData};importData.availabilityBlocks=await Promise.all(importData.availabilityBlocks.map(encryptAvailabilityBlock));}
    if(encryptionKey&&importData.retentionRecords){importData={...importData};importData.retentionRecords=await Promise.all(importData.retentionRecords.map(encryptRetentionRecord));}
    if(encryptionKey&&importData.contactPreferences){importData={...importData};importData.contactPreferences=await Promise.all(importData.contactPreferences.map(encryptContactPreference));}
    if(encryptionKey&&importData.communicationEvents){importData={...importData};importData.communicationEvents=await Promise.all(importData.communicationEvents.map(encryptCommunicationEvent));}
    if(encryptionKey&&importData.integrationConflicts){importData={...importData};importData.integrationConflicts=await Promise.all(importData.integrationConflicts.map(encryptIntegrationConflict));}
    if(encryptionKey&&importData.integrationOutbox){importData={...importData};importData.integrationOutbox=await Promise.all(importData.integrationOutbox.map(encryptIntegrationOutbox));}

    // On the real engine this is a single atomic readwrite transaction
    // across every table: a failure anywhere aborts the whole import and
    // the previous data comes back untouched. (The mini-Dexie shim fallback
    // has no transaction(), so it keeps the snapshot-and-restore path below.)
    if (typeof this.db.transaction === 'function') {
      try {
        await this.db.transaction('rw', BACKUP_TABLES.map(t => this.db[t]), async () => {
          for (const table of BACKUP_TABLES) {
            await this.db[table].clear();
            if (importData[table]) {
              await this.db[table].bulkAdd(importData[table]);
            }
          }
        });
      } catch (err) {
        console.error('Import failed:', err);
        throw new Error('Import failed and was rolled back. Your previous data should be intact — please check Money, Visits and Customers.');
      }
    } else {
      // Snapshot current data so a failure partway through the import (e.g. a
      // bad record on table 4 of 7) can be rolled back, instead of leaving some
      // tables replaced with the new backup and others cleared-but-not-refilled.
      // Note: this isn't a true atomic DB transaction (the shim fallback
      // doesn't support one across tables) — it's a best-effort restore, and
      // rollback itself could theoretically fail (e.g. storage completely full).
      const snapshot = {};
      for (const table of BACKUP_TABLES) {
        snapshot[table] = await this.db[table].toArray();
      }

      try {
        for (const table of BACKUP_TABLES) {
          await this.db[table].clear();
          if (importData[table]) {
            await this.db[table].bulkAdd(importData[table]);
          }
        }
      } catch (err) {
        console.error('Import failed partway through — rolling back to pre-import state:', err);
        for (const table of BACKUP_TABLES) {
          try {
            await this.db[table].clear();
            if (snapshot[table].length) await this.db[table].bulkAdd(snapshot[table]);
          } catch (rollbackErr) {
            console.error(`Rollback failed for "${table}" — this table's data may be lost:`, rollbackErr);
          }
        }
        throw new Error('Import failed and was rolled back. Your previous data should be restored — please check Money, Visits and Customers.');
      }
    }

    // Restored sequence counters must never sit below the highest number the
    // imported records carry — otherwise the next customer/order could get a
    // freshly-issued duplicate number. Imported sequence rows are trusted
    // as-is when already at or above that (mirrors the legacy-migration guard
    // in _migrateFromLegacyDb, so it also covers old backups with no
    // sequences table at all).
    await this._guardSequences(data);
  },

  // Full backup validation: never "is this an array?" alone. Checks record
  // shapes, primary-ID types, duplicate primary keys, date fields, and every
  // operational relationship in the customer memory graph:
  //
  //   appointment.customerId        -> existing customer
  //   order.customerId              -> existing customer
  //   order.appointmentId           -> existing appointment (when supplied)
  //   measurement.appointmentId     -> existing appointment
  //   trip.appointmentId            -> existing appointment
  //   communication.customerId      -> existing customer
  //   photo.customerId              -> existing customer
  //
  // Throws on the first problem; nothing has been written by then.
  async _validateBackup(data) {
    const isPosInt = v => Number.isInteger(v) && v > 0;
    const isValidDate = v =>
      (v instanceof Date && !isNaN(v.getTime())) ||
      (typeof v === 'string' && v.length > 0 && !isNaN(new Date(v).getTime()));

    // 1. Every supplied table must be a list of records; a backup carrying no
    // tables at all is corrupt (importing it would wipe the database with
    // nothing to restore).
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Backup file is corrupt: data is not an object');
    }
    const unknownTables = Object.keys(data).filter(table => !BACKUP_TABLES.includes(table));
    if (unknownTables.length) {
      throw new Error(`Backup file is incompatible: unknown table "${unknownTables[0]}"`);
    }
    const present = [];
    for (const table of BACKUP_TABLES) {
      if (data[table] === undefined) continue;
      if (!Array.isArray(data[table])) {
        throw new Error(`Backup file is corrupt: "${table}" is not a list of records`);
      }
      present.push(table);
    }
    if (present.length === 0) {
      throw new Error('Backup file is corrupt: no tables found');
    }

    // 2. Record structure, primary-key types and duplicate primary keys.
    // id-keyed tables use 'id'; settings use 'key'; sequences use 'name'.
    const keyField = table => (table === 'settings' ? 'key' : table === 'sequences' ? 'name' : 'id');
    for (const table of present) {
      const field = keyField(table);
      const seen = new Set();
      for (const record of data[table]) {
        if (record === null || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error(`Backup file is corrupt: "${table}" contains a malformed record`);
        }
        const key = record[field];
        const keyOk = field === 'key' || field === 'name'
          ? (typeof key === 'string' && key.length > 0)
          : isPosInt(key);
        if (!keyOk) {
          throw new Error(`Backup file is corrupt: "${table}" record has an invalid ${field}`);
        }
        if (table === 'sequences' && typeof record.value !== 'number') {
          throw new Error('Backup file is corrupt: sequence record has an invalid value');
        }
        if (seen.has(key)) {
          throw new Error(`Backup file is corrupt: duplicate ${field} ${JSON.stringify(key)} in "${table}"`);
        }
        seen.add(key);
      }
    }

    // 3. Cross-table relationships. A reference must exist in the matching
    // table and be a positive integer; records without their required
    // relationship field are rejected outright.
    const customerIds = new Set((data.customers || []).map(c => c.id));
    const appointmentIds = new Set((data.appointments || []).map(a => a.id));
    const orderIds = new Set((data.orders || []).map(o => o.id));
    const leadIds = new Set((data.leads || []).map(l => l.id));
    const taskIds = new Set((data.tasks || []).map(t => t.id));
    const quoteIds = new Set((data.quotes || []).map(q => q.id));
    const jobIds = new Set((data.jobs || []).map(j => j.id));
    const checklistTemplateIds = new Set((data.checklistTemplates || []).map(t => t.id));
    const checklistItemIds = new Set((data.checklistItems || []).map(i => i.id));
    const invoiceIds = new Set((data.invoices || []).map(i => i.id));
    const paymentIds = new Set((data.payments || []).map(p => p.id));
    const supplierIds = new Set((data.suppliers || []).map(r => r.id));
    const productIds = new Set((data.products || []).map(r => r.id));
    const purchaseOrderIds = new Set((data.purchaseOrders || []).map(r => r.id));
    const communicationIds = new Set((data.communications || []).map(r => r.id));
    const integrationLinkIds = new Set((data.integrationLinks || []).map(r => r.id));
    const checkRef = (table, record, field, validIds) => {
      const v = record[field];
      if (v === null || v === undefined) {
        throw new Error(`Backup file is corrupt: "${table}" record is missing ${field}`);
      }
      if (!isPosInt(v) || !validIds.has(v)) {
        throw new Error(`Backup file is corrupt: "${table}" references a missing ${field} (${v})`);
      }
    };

    for (const record of data.appointments || []) {
      // customerId is OPTIONAL on appointments: phone conversions can be
      // typed straight onto the visit with no customer record yet (the
      // follow-ups "first-time customer" path and the visit card both handle
      // customerId-less rows). Validate only when a customerId is supplied.
      if (record.customerId !== null && record.customerId !== undefined) {
        checkRef('appointments', record, 'customerId', customerIds);
      }
      if (record.jobId !== null && record.jobId !== undefined) checkRef('appointments', record, 'jobId', jobIds);
    }
    for (const record of data.orders || []) {
      checkRef('orders', record, 'customerId', customerIds);
      // appointmentId is optional on orders (some orders are created without
      // a linked visit) — validated only when supplied.
      if (record.appointmentId !== null && record.appointmentId !== undefined) {
        if (!isPosInt(record.appointmentId) || !appointmentIds.has(record.appointmentId)) {
          throw new Error(`Backup file is corrupt: "orders" references a missing appointmentId (${record.appointmentId})`);
        }
      }
    }
    for (const record of data.measurements || []) {
      checkRef('measurements', record, 'appointmentId', appointmentIds);
    }
    for (const record of data.trips || []) {
      // appointmentId is OPTIONAL on trips: standalone mileage logs (money
      // screen "Log Mileage") have no linked visit. Validate only when set.
      if (record.appointmentId !== null && record.appointmentId !== undefined) {
        checkRef('trips', record, 'appointmentId', appointmentIds);
      }
    }
    for (const record of data.communications || []) {
      // customerId is OPTIONAL on communications: EOD notes (Today screen
      // "Complete day") and app-level notes are written without a customer.
      if (record.customerId !== null && record.customerId !== undefined) {
        checkRef('communications', record, 'customerId', customerIds);
      }
    }
    for (const record of data.photos || []) {
      checkRef('photos', record, 'customerId', customerIds);
      if (record.jobId !== null && record.jobId !== undefined) checkRef('photos', record, 'jobId', jobIds);
      if (record.appointmentId !== null && record.appointmentId !== undefined) checkRef('photos', record, 'appointmentId', appointmentIds);
      if (typeof record.data !== 'string' || record.data.length === 0) {
        throw new Error('Backup file is corrupt: a photo record is missing its image data');
      }
    }
    for (const record of data.leads || []) {
      if (record.customerId !== null && record.customerId !== undefined) checkRef('leads', record, 'customerId', customerIds);
      if (record.appointmentId !== null && record.appointmentId !== undefined) checkRef('leads', record, 'appointmentId', appointmentIds);
      if (!['new', 'contacted', 'qualified', 'converted', 'lost'].includes(record.status)) throw new Error('Backup file is corrupt: lead has an invalid status');
    }
    for (const record of data.tasks || []) {
      if (!['open', 'completed', 'cancelled'].includes(record.status)) throw new Error('Backup file is corrupt: task has an invalid status');
      if (typeof record.title !== 'string' || !record.title.trim()) throw new Error('Backup file is corrupt: task is missing its title');
      for (const [field, ids] of [['leadId', leadIds], ['customerId', customerIds], ['appointmentId', appointmentIds], ['orderId', orderIds]]) {
        if (record[field] !== null && record[field] !== undefined) checkRef('tasks', record, field, ids);
      }
    }
    for (const record of data.taskEvents || []) {
      checkRef('taskEvents', record, 'taskId', taskIds);
      if (typeof record.type !== 'string' || !record.type) throw new Error('Backup file is corrupt: task event has an invalid type');
    }
    const quoteStatuses = ['draft', 'issued', 'accepted', 'rejected', 'superseded', 'expired'];
    const quoteNumbers = new Set();
    for (const record of data.quotes || []) {
      checkRef('quotes', record, 'customerId', customerIds);
      if (record.appointmentId !== null && record.appointmentId !== undefined) checkRef('quotes', record, 'appointmentId', appointmentIds);
      if (!quoteStatuses.includes(record.status)) throw new Error('Backup file is corrupt: quote has an invalid status');
      if (typeof record.quoteNumber !== 'string' || !record.quoteNumber || !Number.isInteger(record.version) || record.version < 1) throw new Error('Backup file is corrupt: quote identity is invalid');
      const versionKey = `${record.quoteNumber}:${record.version}`;
      if (quoteNumbers.has(versionKey)) throw new Error('Backup file is corrupt: duplicate quote version');
      quoteNumbers.add(versionKey);
      for (const field of ['subtotal', 'discountAmount', 'taxAmount', 'total']) if (!Number.isFinite(record[field]) || record[field] < 0) throw new Error(`Backup file is corrupt: quote has an invalid ${field}`);
      if (record.convertedOrderId !== null && record.convertedOrderId !== undefined) checkRef('quotes', record, 'convertedOrderId', orderIds);
    }
    for (const record of data.quoteItems || []) {
      checkRef('quoteItems', record, 'quoteId', quoteIds);
      if (typeof record.description !== 'string' || !record.description.trim() || !(Number(record.quantity) > 0) || !Number.isFinite(Number(record.unitPrice)) || Number(record.unitPrice) < 0) throw new Error('Backup file is corrupt: quote item is invalid');
    }
    for (const record of data.orders || []) {
      if (record.quoteId !== null && record.quoteId !== undefined) checkRef('orders', record, 'quoteId', quoteIds);
    }
    const jobStatuses = ['materials_ordered', 'materials_received', 'fitting_scheduled', 'on_site', 'blocked', 'return_visit_required', 'completed', 'signed_off'];
    for (const record of data.jobs || []) {
      checkRef('jobs', record, 'customerId', customerIds); checkRef('jobs', record, 'orderId', orderIds);
      if (!jobStatuses.includes(record.status) || typeof record.sourceKey !== 'string' || !record.sourceKey) throw new Error('Backup file is corrupt: job state is invalid');
    }
    for (const record of data.checklistTemplates || []) {
      if (typeof record.visitType !== 'string' || !record.visitType) throw new Error('Backup file is corrupt: checklist template is invalid');
    }
    for (const record of data.checklistItems || []) {
      checkRef('checklistItems', record, 'templateId', checklistTemplateIds);
      if (typeof record.label !== 'string' || !record.label) throw new Error('Backup file is corrupt: checklist item is invalid');
    }
    for (const record of data.checklistResponses || []) {
      checkRef('checklistResponses', record, 'jobId', jobIds); checkRef('checklistResponses', record, 'checklistItemId', checklistItemIds);
      if (record.appointmentId !== null && record.appointmentId !== undefined) checkRef('checklistResponses', record, 'appointmentId', appointmentIds);
      if (typeof record.completed !== 'boolean') throw new Error('Backup file is corrupt: checklist response is invalid');
    }
    for (const record of data.jobIssues || []) {
      checkRef('jobIssues', record, 'jobId', jobIds);
      if (record.appointmentId !== null && record.appointmentId !== undefined) checkRef('jobIssues', record, 'appointmentId', appointmentIds);
      if (!['open', 'resolved'].includes(record.status) || typeof record.title !== 'string' || !record.title) throw new Error('Backup file is corrupt: job issue is invalid');
    }
    for(const r of data.invoices||[]){checkRef('invoices',r,'customerId',customerIds);if(r.orderId!=null)checkRef('invoices',r,'orderId',orderIds);if(r.jobId!=null)checkRef('invoices',r,'jobId',jobIds);if(!['draft','issued','paid','void'].includes(r.status)||typeof r.invoiceNumber!=='string'||!Number.isFinite(r.total))throw new Error('Backup file is corrupt: invoice is invalid');}
    for(const r of data.invoiceItems||[]){checkRef('invoiceItems',r,'invoiceId',invoiceIds);if(typeof r.description!=='string'||!(Number(r.quantity)>0)||Number(r.unitPrice)<0)throw new Error('Backup file is corrupt: invoice item is invalid');}
    for(const r of data.payments||[]){checkRef('payments',r,'customerId',customerIds);if(r.orderId!=null)checkRef('payments',r,'orderId',orderIds);if(r.invoiceId!=null)checkRef('payments',r,'invoiceId',invoiceIds);if(r.reversesPaymentId!=null)checkRef('payments',r,'reversesPaymentId',paymentIds);if(!(r.amount>0)||!['in','out'].includes(r.direction)||!['pending','cleared','void'].includes(r.status))throw new Error('Backup file is corrupt: payment is invalid');}
    for(const r of data.creditNotes||[]){checkRef('creditNotes',r,'customerId',customerIds);checkRef('creditNotes',r,'invoiceId',invoiceIds);if(!(r.amount>0)||!['issued','void'].includes(r.status)||typeof r.creditNumber!=='string')throw new Error('Backup file is corrupt: credit note is invalid');}
    for(const r of data.documents||[]){checkRef('documents',r,'customerId',customerIds);if(r.invoiceId!=null)checkRef('documents',r,'invoiceId',invoiceIds);if(r.paymentId!=null)checkRef('documents',r,'paymentId',paymentIds);if(r.jobId!=null)checkRef('documents',r,'jobId',jobIds);if(r.purchaseOrderId!=null)checkRef('documents',r,'purchaseOrderId',purchaseOrderIds);if(typeof r.type!=='string'||!r.type)throw new Error('Backup file is corrupt: document metadata is invalid');}
    for(const r of data.suppliers||[]){if(typeof r.name!=='string'||!r.name||!['active','inactive'].includes(r.status))throw new Error('Backup file is corrupt: supplier is invalid');}
    for(const r of data.products||[]){checkRef('products',r,'supplierId',supplierIds);if(typeof r.name!=='string'||!r.name)throw new Error('Backup file is corrupt: product is invalid');}
    for(const r of data.purchaseOrders||[]){checkRef('purchaseOrders',r,'supplierId',supplierIds);checkRef('purchaseOrders',r,'orderId',orderIds);if(r.jobId!=null)checkRef('purchaseOrders',r,'jobId',jobIds);if(!['draft','submitted','acknowledged','part_received','received','issue','returned','cancelled'].includes(r.status))throw new Error('Backup file is corrupt: purchase order is invalid');}
    for(const r of data.purchaseOrderItems||[]){checkRef('purchaseOrderItems',r,'purchaseOrderId',purchaseOrderIds);if(r.productId!=null)checkRef('purchaseOrderItems',r,'productId',productIds);if(!(Number(r.quantity)>0)||Number(r.unitCost)<0)throw new Error('Backup file is corrupt: purchase order item is invalid');}
    for(const r of data.jobCosts||[]){checkRef('jobCosts',r,'customerId',customerIds);checkRef('jobCosts',r,'orderId',orderIds);checkRef('jobCosts',r,'jobId',jobIds);if(!(r.amount>0)||!['materials','subcontractor','travel','payment_fee','labour','other'].includes(r.category))throw new Error('Backup file is corrupt: job cost is invalid');}
    for(const r of data.availabilityBlocks||[]){if(!['working','leave','unavailable'].includes(r.type)||isNaN(new Date(r.startAt).getTime())||isNaN(new Date(r.endAt).getTime())||new Date(r.startAt)>=new Date(r.endAt))throw new Error('Backup file is corrupt: availability block is invalid');}
    let lastPolicyTime=-Infinity;for(const r of data.financialPolicies||[]){const time=new Date(r.effectiveFrom).getTime();if(!['commission_advisor','sole_trader','hybrid'].includes(r.mode)||!Number.isFinite(time)||time<=lastPolicyTime)throw new Error('Backup file is corrupt: financial policy is invalid');for(const field of ['commissionRate','paymentFeeRate','mileageRate','labourHourlyCost'])if(!Number.isFinite(r[field])||r[field]<0)throw new Error('Backup file is corrupt: financial policy rate is invalid');lastPolicyTime=time;}
    for(const r of data.retentionRecords||[]){checkRef('retentionRecords',r,'customerId',customerIds);if(r.orderId!=null)checkRef('retentionRecords',r,'orderId',orderIds);if(r.jobId!=null)checkRef('retentionRecords',r,'jobId',jobIds);if(!['satisfaction_check','review_request','referral','warranty','service','repeat_opportunity'].includes(r.type)||!['planned','due','completed','cancelled'].includes(r.status))throw new Error('Backup file is corrupt: retention record is invalid');}
    for(const r of data.contactPreferences||[]){checkRef('contactPreferences',r,'customerId',customerIds);if(!['phone','email','sms','whatsapp','post'].includes(r.channel)||!['opted_in','opted_out','unknown','blocked'].includes(r.status))throw new Error('Backup file is corrupt: contact preference is invalid');}
    for(const r of data.communicationEvents||[]){checkRef('communicationEvents',r,'communicationId',communicationIds);if(r.customerId!=null)checkRef('communicationEvents',r,'customerId',customerIds);if(!['drafted','queued','handed_off','attempted','sent','advisor_confirmed_sent','delivered','read','replied','failed','cancelled'].includes(r.state))throw new Error('Backup file is corrupt: communication event is invalid');}
    for(const r of data.integrationLinks||[]){if(typeof r.provider!=='string'||!r.provider||typeof r.entityType!=='string'||!r.entityType||!Number.isInteger(r.localId)||typeof r.remoteId!=='string'||!r.remoteId)throw new Error('Backup file is corrupt: integration link is invalid');}
    for(const r of data.integrationConflicts||[]){checkRef('integrationConflicts',r,'integrationLinkId',integrationLinkIds);if(!['open','resolved'].includes(r.status))throw new Error('Backup file is corrupt: integration conflict is invalid');}
    for(const r of data.integrationOutbox||[]){if(typeof r.provider!=='string'||!r.provider||!['pending','processing','retry','failed','completed'].includes(r.status)||!Number.isInteger(r.localId))throw new Error('Backup file is corrupt: integration outbox item is invalid');}

    // 4. Dates. Appointment dates drive the diary, trips and expenses drive
    // mileage/money — those must parse. The remaining date-bearing fields
    // (sentAt, createdAt) are validated when present.
    for (const record of data.appointments || []) {
      if (!isValidDate(record.date)) {
        throw new Error('Backup file is corrupt: appointment has an invalid date');
      }
    }
    for (const [table, field] of [['trips', 'date'], ['expenses', 'date'], ['communications', 'sentAt']]) {
      for (const record of data[table] || []) {
        if (record[field] !== undefined && record[field] !== null && !isValidDate(record[field])) {
          throw new Error(`Backup file is corrupt: "${table}" record has an invalid ${field}`);
        }
      }
    }
    for (const [table, fields] of [
      ['leads', ['receivedAt', 'nextActionAt', 'convertedAt']],
      ['tasks', ['dueAt', 'snoozedUntil', 'completedAt']],
      ['taskEvents', ['occurredAt']]
      ,['quotes', ['issueDate', 'expiryDate', 'acceptedAt', 'rejectedAt', 'convertedAt']]
      ,['jobs', ['scheduledStart', 'scheduledEnd', 'completedAt', 'signedOffAt', 'stageChangedAt']]
      ,['jobIssues', ['dueAt', 'resolvedAt']]
      ,['payments',['date']]
      ,['invoices',['issueDate','dueDate']]
      ,['creditNotes',['issueDate']]
      ,['documents',['generatedAt']]
      ,['purchaseOrders',['expectedAt']]
      ,['jobCosts',['incurredAt']]
      ,['availabilityBlocks',['startAt','endAt']]
      ,['financialPolicies',['effectiveFrom']]
      ,['retentionRecords',['dueAt','completedAt']]
      ,['contactPreferences',['effectiveAt']]
      ,['communicationEvents',['occurredAt']]
      ,['integrationConflicts',['detectedAt','resolvedAt']]
      ,['integrationOutbox',['nextAttemptAt','completedAt']]
    ]) {
      for (const record of data[table] || []) {
        for (const field of fields) {
          if (record[field] !== undefined && record[field] !== null && !isValidDate(record[field])) throw new Error(`Backup file is corrupt: "${table}" record has an invalid ${field}`);
        }
      }
    }
    for (const table of present) {
      for (const record of data[table]) {
        if (record.createdAt !== undefined && record.createdAt !== null && !isValidDate(record.createdAt)) {
          throw new Error(`Backup file is corrupt: "${table}" record has an invalid createdAt`);
        }
      }
    }
  },

  // Raises the customer/order sequence counters to cover the highest number
  // found in the imported records (same CUS-/ORD-YYYY-#### pattern and year
  // scoping the legacy migration uses). Never lowers an existing counter.
  async _guardSequences(data) {
    for (const name of ['customer', 'order', 'quote', 'invoice', 'credit']) {
      const prefix = name === 'customer' ? 'CUS-' : name === 'order' ? 'ORD-' : name === 'quote' ? 'QUO-' : name === 'invoice' ? 'INV-' : 'CRN-';
      const year = new Date().getFullYear();
      const re = new RegExp(`^${prefix}\\d{4}-(\\d+)$`);
      const table = name === 'quote' ? 'quotes' : name === 'invoice' ? 'invoices' : name === 'credit' ? 'creditNotes' : name + 's';
      const numberField = name === 'quote' ? 'quoteNumber' : name === 'credit' ? 'creditNumber' : name + 'Number';
      const maxSeq = (data[table] || []).reduce((max, r) => {
        const m = String(r[numberField] || '').match(re);
        return Math.max(max, m ? parseInt(m[1], 10) : 0);
      }, 0);
      if (!maxSeq) continue;
      const seq = await this.db.sequences.get(name);
if (!seq || seq.value < maxSeq) {
        await this.db.sequences.put({ name, value: maxSeq });
      }
    }
  }
};

// Expose encryption functions globally for app.js
if (typeof window !== 'undefined') {
  window.initEncryption = initEncryption;
  window.clearEncryptionKey = clearEncryptionKey;
  window.hasEncryptionKey = hasEncryptionKey;
  window.encryptCustomer = encryptCustomer;
  window.decryptCustomer = decryptCustomer;
  window.migratePlaintextCustomers = migratePlaintextCustomers;
  window.encryptAppointment = encryptAppointment;
  window.decryptAppointment = decryptAppointment;
  window.migratePlaintextAppointments = migratePlaintextAppointments;
  window.isEncrypted = isEncrypted;
  window.encryptField = encryptField;
  window.decryptField = decryptField;
}
