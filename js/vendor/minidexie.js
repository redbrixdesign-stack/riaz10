/* ============================================
   ADVISOROS — LOCAL DATABASE ENGINE
   A small Dexie-compatible surface (version().stores(), table
   add/put/get/update/clear/bulkAdd/toArray, where()/filter() queries)
   backed by real IndexedDB.

   Replaces the old approach of re-serialising an entire table to a single
   localStorage key on every write. That had two hard ceilings: localStorage's
   ~5-10MB per-origin quota, and O(table size) cost on every single write.
   IndexedDB has neither problem and is available in effectively every
   browser this PWA targets.

   If IndexedDB is genuinely unavailable (very rare — some locked-down
   private-browsing modes), this falls back to an in-memory store so the
   app doesn't crash, and warns the user that nothing will persist.

   If real Dexie.js is loaded before this file, this file does nothing
   (see the guard below) — this is only the fallback/default engine.
   ============================================ */
(function (global) {
  if (global.Dexie) return;

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  function fieldValue(item, field) {
    return item ? item[field] : undefined;
  }

  function parseKeySpec(definition) {
    const primary = String(definition || '++id').split(',')[0].trim();
    return {
      autoIncrement: primary.startsWith('++'),
      keyPath: primary.replace('++', '').trim() || 'id'
    };
  }

  // ---------- Query builder — operates in memory over table.toArray() ----------
  // (Same behaviour as before; this only ever reasons about a snapshot of a
  // single table, so it doesn't need to know whether that snapshot came from
  // IndexedDB or memory.)
  class MiniQuery {
    constructor(table) {
      this.table = table;
      this.groups = [{ conditions: [], predicates: [] }];
      this.currentField = null;
      this._limit = null;
      this._reverse = false;
    }

    _current() {
      return this.groups[this.groups.length - 1];
    }

    _condition(type, value, extra) {
      this._current().conditions.push({ field: this.currentField, type, value, extra });
      return this;
    }

    equals(value) { return this._condition('equals', value); }
    above(value) { return this._condition('above', value); }
    between(lower, upper, includeLower = true, includeUpper = true) {
      return this._condition('between', lower, { upper, includeLower, includeUpper });
    }
    anyOf(values) { return this._condition('anyOf', values || []); }
    startsWithIgnoreCase(value) { return this._condition('startsWithIgnoreCase', String(value || '').toLowerCase()); }
    startsWith(value) { return this._condition('startsWith', String(value || '')); }

    and(predicate) { this._current().predicates.push(predicate); return this; }
    filter(predicate) { this._current().predicates.push(predicate); return this; }
    or(field) { this.groups.push({ conditions: [], predicates: [] }); this.currentField = field; return this; }
    limit(count) { this._limit = count; return this; }
    reverse() { this._reverse = true; return this; }

    async first() {
      const rows = await this.limit(1).toArray();
      return rows[0];
    }

    async count() {
      const rows = await this.table.toArray();
      return rows.filter(row => this.groups.some(group => this._matchesGroup(row, group))).length;
    }

    // Sorts ALL matches first, then applies the limit - same semantics as
    // Dexie's sortBy(), so limit() must not be applied before sorting.
    async sortBy(field, direction = 'asc') {
      const rows = await this.table.toArray();
      const matches = rows.filter(row => this.groups.some(group => this._matchesGroup(row, group)));
      matches.sort((a, b) => {
        const av = fieldValue(a, field);
        const bv = fieldValue(b, field);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return direction === 'desc' ? 1 : -1;
        if (av > bv) return direction === 'desc' ? -1 : 1;
        return 0;
      });
      if (this._reverse) matches.reverse();
      return typeof this._limit === 'number' ? matches.slice(0, this._limit) : matches;
    }

    // Deletes every row matching the query (the where().equals().delete()
    // chain DB.deleteCustomer relies on). Returns how many rows were removed.
    async delete() {
      const rows = await this.toArray();
      const keys = rows.map(row => fieldValue(row, this.table.keyPath));
      for (const key of keys) {
        await this.table.delete(key);
      }
      return keys.length;
    }

    async toArray() {
      const rows = await this.table.toArray();
      let matches = rows.filter(row => this.groups.some(group => this._matchesGroup(row, group)));
      if (this._reverse) matches = matches.reverse();
      return typeof this._limit === 'number' ? matches.slice(0, this._limit) : matches;
    }

    _matchesGroup(row, group) {
      return group.conditions.every(c => this._matchesCondition(row, c)) &&
        group.predicates.every(p => p(row));
    }

    _matchesCondition(row, condition) {
      const value = fieldValue(row, condition.field);
      if (condition.type === 'equals') return value === condition.value;
      if (condition.type === 'above') return value > condition.value;
      if (condition.type === 'anyOf') return condition.value.includes(value);
      if (condition.type === 'startsWithIgnoreCase') return String(value || '').toLowerCase().startsWith(condition.value);
      if (condition.type === 'startsWith') return String(value || '').startsWith(condition.value);
      if (condition.type === 'between') {
        const lowerOk = condition.extra.includeLower ? value >= condition.value : value > condition.value;
        const upperOk = condition.extra.includeUpper ? value <= condition.extra.upper : value < condition.extra.upper;
        return lowerOk && upperOk;
      }
      return true;
    }
  }

  // ---------- Real IndexedDB-backed table ----------
  class IDBTable {
    constructor(db, name, definition) {
      this.db = db;
      this.name = name;
      const spec = parseKeySpec(definition);
      this.autoIncrement = spec.autoIncrement;
      this.keyPath = spec.keyPath;
    }

    async _store(mode) {
      const idb = await this.db._ready();
      const tx = idb.transaction(this.name, mode);
      return tx.objectStore(this.name);
    }

    _req(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async add(value) {
      const store = await this._store('readwrite');
      return this._req(store.add(clone(value) || {}));
    }

    async put(value) {
      const store = await this._store('readwrite');
      return this._req(store.put(clone(value) || {}));
    }

    async get(key) {
      const store = await this._store('readonly');
      const result = await this._req(store.get(key));
      return result ? clone(result) : undefined;
    }

    async update(key, changes) {
      const idb = await this.db._ready();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(this.name, 'readwrite');
        const store = tx.objectStore(this.name);
        let changed = 0;

        const getReq = store.get(key);
        getReq.onerror = () => reject(getReq.error || tx.error);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (!existing) {
            changed = 0;
            return;
          }

          const next = clone(existing);
          if (typeof changes === 'function') changes(next);
          else Object.assign(next, changes);
          next[this.keyPath] = fieldValue(existing, this.keyPath); // key field can't be changed via update()

          const putReq = store.put(next);
          putReq.onerror = () => reject(putReq.error || tx.error);
          putReq.onsuccess = () => { changed = 1; };
        };

        tx.oncomplete = () => resolve(changed);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error(`Update aborted for ${this.name}`));
      });
    }

    async clear() {
      const store = await this._store('readwrite');
      return this._req(store.clear());
    }

    async delete(key) {
      const store = await this._store('readwrite');
      return this._req(store.delete(key));
    }

    async bulkAdd(values) {
      const idb = await this.db._ready();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(this.name, 'readwrite');
        const store = tx.objectStore(this.name);
        const keys = [];

        for (const value of values || []) {
          const req = store.add(clone(value) || {});
          req.onsuccess = () => keys.push(req.result);
          req.onerror = () => reject(req.error || tx.error);
        }

        tx.oncomplete = () => resolve(keys);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error(`Bulk add aborted for ${this.name}`));
      });
    }

    async toArray() {
      const store = await this._store('readonly');
      const rows = await this._req(store.getAll());
      return clone(rows || []);
    }

    async bulkGet(keys) {
      const store = await this._store('readonly');
      return Promise.all((keys || []).map(key => this._req(store.get(key))));
    }

    async count() {
      const store = await this._store('readonly');
      return this._req(store.count());
    }

    where(field) {
      const query = new MiniQuery(this);
      query.currentField = field;
      return query;
    }

    filter(predicate) {
      return new MiniQuery(this).filter(predicate);
    }
  }

  // ---------- Last-resort in-memory table (only used if IndexedDB truly fails) ----------
  class MemoryTable {
    constructor(db, name, definition) {
      this.db = db;
      this.name = name;
      const spec = parseKeySpec(definition);
      this.autoIncrement = spec.autoIncrement;
      this.keyPath = spec.keyPath;
      this.rows = [];
      this.nextId = 1;
    }

    _key(value) { return fieldValue(value, this.keyPath); }

    _assignKey(item) {
      if (this.autoIncrement && (item[this.keyPath] == null || item[this.keyPath] === '')) {
        item[this.keyPath] = this.nextId++;
      } else if (this.autoIncrement && Number(item[this.keyPath]) >= this.nextId) {
        this.nextId = Number(item[this.keyPath]) + 1;
      }
      return item;
    }

    async add(value) {
      const item = this._assignKey(clone(value) || {});
      const key = this._key(item);
      if (this.rows.some(r => this._key(r) === key)) throw new Error(`Duplicate key in ${this.name}: ${key}`);
      this.rows.push(item);
      return key;
    }

    async put(value) {
      const item = this._assignKey(clone(value) || {});
      const key = this._key(item);
      const idx = this.rows.findIndex(r => this._key(r) === key);
      if (idx >= 0) this.rows[idx] = item; else this.rows.push(item);
      return key;
    }

    async get(key) {
      return clone(this.rows.find(r => this._key(r) === key));
    }

    async update(key, changes) {
      const idx = this.rows.findIndex(r => this._key(r) === key);
      if (idx < 0) return 0;
      const next = clone(this.rows[idx]);
      if (typeof changes === 'function') changes(next);
      else Object.assign(next, changes);
      this.rows[idx] = next;
      return 1;
    }

    async clear() { this.rows = []; }

    async delete(key) {
      const idx = this.rows.findIndex(r => this._key(r) === key);
      if (idx < 0) return;
      this.rows.splice(idx, 1);
    }


    async bulkAdd(values) {
      const keys = [];
      for (const v of values || []) keys.push(await this.add(v));
      return keys;
    }

    async toArray() { return clone(this.rows); }

    async bulkGet(keys) {
      return Promise.all((keys || []).map(key => this.get(key)));
    }

    async count() { return this.rows.length; }

    where(field) {
      const query = new MiniQuery(this);
      query.currentField = field;
      return query;
    }

    filter(predicate) {
      return new MiniQuery(this).filter(predicate);
    }
  }

  // ---------- Persistent fallback for file:// / restricted browsers ----------
  class LocalStorageTable extends MemoryTable {
    constructor(db, name, definition) {
      super(db, name, definition);
      this.storageKey = `advisoros:${db.name}:${name}`;
      this._load();
    }

    _load() {
      try {
        const raw = global.localStorage.getItem(this.storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && Array.isArray(parsed.rows)) {
          this.rows = clone(parsed.rows);
          this.nextId = parsed.nextId || this._deriveNextId();
          return;
        }
      } catch (e) {
        console.warn(`AdvisorOS: localStorage read failed for ${this.name}`, e);
      }
      this._persist();
    }

    _deriveNextId() {
      const max = this.rows.reduce((highest, row) => {
        const value = Number(row?.[this.keyPath] || 0);
        return value > highest ? value : highest;
      }, 0);
      return max + 1;
    }

    _persist() {
      try {
        global.localStorage.setItem(this.storageKey, JSON.stringify({ nextId: this.nextId, rows: clone(this.rows) }));
      } catch (e) {
        console.warn(`AdvisorOS: localStorage write failed for ${this.name}`, e);
        if (global.Toast) {
          global.Toast.show('Storage is full or unavailable. Please export a backup before adding more data.', 'error');
        }
      }
    }

    async add(value) {
      const key = await super.add(value);
      this._persist();
      return key;
    }

    async put(value) {
      const key = await super.put(value);
      this._persist();
      return key;
    }

    async update(key, changes) {
      const result = await super.update(key, changes);
      if (result) this._persist();
      return result;
    }

    async clear() {
      await super.clear();
      this._persist();
    }

    async delete(key) {
      await super.delete(key);
      this._persist();
    }
  }

  // ---------- Migration: import any data left over from the old localStorage-blob engine ----------
  function readLegacyTableRows(dbName, tableName) {
    try {
      const raw = global.localStorage.getItem(`advisoros:${dbName}:${tableName}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && Array.isArray(parsed.rows)) ? parsed.rows : null;
    } catch (e) {
      return null;
    }
  }

  class MiniDexie {
    constructor(name) {
      this.name = name;
      this._version = 1;
      this._schema = {};
      this._dbPromise = null;
      this._idbAvailable = typeof indexedDB !== 'undefined';
      this.storageMode = this._idbAvailable ? 'indexedDB' : 'unknown';
    }

    _useFallbackStorage(reason) {
      if (this._fallbackReady) return;
      this._fallbackReady = true;
      this._idbAvailable = false;

      let canPersist = false;
      try {
        const key = '__advisoros_storage_test__';
        global.localStorage.setItem(key, '1');
        global.localStorage.removeItem(key);
        canPersist = true;
      } catch (e) {
        canPersist = false;
      }

      const Table = canPersist ? LocalStorageTable : MemoryTable;
      Object.keys(this._schema).forEach(tableName => {
        this[tableName] = new Table(this, tableName, this._schema[tableName]);
      });
      this.storageMode = canPersist ? 'localStorage' : 'memory';

      console.warn(`AdvisorOS: using ${canPersist ? 'localStorage' : 'memory'} fallback storage`, reason || '');
      if (global.Toast && !canPersist) {
        global.Toast.show('Could not open local storage — changes will not be saved this session. Please export a backup.', 'error');
      }
    }

    version(versionNumber) {
      this._version = versionNumber || 1;
      return {
        stores: schema => {
          this._schema = { ...this._schema, ...(schema || {}) };
          Object.entries(this._schema).forEach(([tableName, definition]) => {
            this[tableName] = this._idbAvailable
              ? new IDBTable(this, tableName, definition)
              : new MemoryTable(this, tableName, definition);
          });
          return this;
        }
      };
    }

    // Opens (and upgrades, and migrates) the underlying IndexedDB database.
    // Cached so repeated calls from every table method share one open connection.
    _ready() {
      if (!this._idbAvailable) {
        this._useFallbackStorage(new Error('IndexedDB unavailable'));
        return Promise.resolve(null);
      }
      if (this._dbPromise) return this._dbPromise;

      this._dbPromise = new Promise((resolve, reject) => {
        let request;
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('IndexedDB open timed out'));
        }, 2500);

        try {
          request = indexedDB.open(this.name, this._version);
        } catch (e) {
          clearTimeout(timeout);
          settled = true;
          reject(e);
          return;
        }

        request.onupgradeneeded = () => {
          const idb = request.result;
          Object.entries(this._schema).forEach(([tableName, definition]) => {
            if (idb.objectStoreNames.contains(tableName)) return;
            const spec = parseKeySpec(definition);
            idb.createObjectStore(tableName, { keyPath: spec.keyPath, autoIncrement: spec.autoIncrement });
          });
        };

        request.onsuccess = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(request.result);
        };
        request.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(request.error);
        };
        request.onblocked = () => console.warn('AdvisorOS database upgrade blocked — close other open tabs of this app.');
      }).then(async idb => {
        await this._migrateLegacyData(idb);
        this.storageMode = 'indexedDB';
        return idb;
      }).catch(err => {
        this._useFallbackStorage(err);
        return null;
      });

      return this._dbPromise;
    }

    // One-time import of rows left behind by the old localStorage-blob engine.
    // Never overwrites a table that already has real data in IndexedDB.
    async _migrateLegacyData(idb) {
      const FLAG = `advisoros_ls_migrated:${this.name}`;
      try {
        if (global.localStorage.getItem(FLAG)) return;
      } catch (e) {
        return; // no localStorage access at all — nothing to migrate from anyway
      }

      for (const tableName of Object.keys(this._schema)) {
        const legacyRows = readLegacyTableRows(this.name, tableName);
        if (!legacyRows || !legacyRows.length) continue;

        try {
          const tx = idb.transaction(tableName, 'readwrite');
          const store = tx.objectStore(tableName);
          const existingCount = await new Promise((res, rej) => {
            const req = store.count();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });

          if (existingCount === 0) {
            legacyRows.forEach(row => store.add(clone(row)));
            await new Promise((res, rej) => {
              tx.oncomplete = res;
              tx.onerror = () => rej(tx.error);
            });
            console.log(`AdvisorOS: migrated ${legacyRows.length} legacy "${tableName}" row(s) into IndexedDB`);
          }
        } catch (e) {
          console.warn(`AdvisorOS: could not migrate legacy "${tableName}" data`, e);
        }
      }

      try { global.localStorage.setItem(FLAG, '1'); } catch (e) { /* ignore */ }
    }

    async open() {
      await this._ready();
      return this;
    }
  }

  global.Dexie = MiniDexie;
})(window);
