export interface SavedDocument<T> {
  envelope: T;
  revision: string;
}

const STORE = 'vault';

export function encryptedStore<T>(database: string, key: string, parseEnvelope: (input: unknown) => T, label: string) {
  function openDatabase(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) {
      return Promise.reject(new Error('Local encrypted storage is unavailable. Use a supported local browser; no plaintext fallback is used.'));
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => reject(new Error(`Cannot open local ${label} storage. Check disk space and application permissions.`));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Another folio window is blocking storage. Close it and reopen this page.'));
      };
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }

  function parseStored(value: unknown): SavedDocument<T> | null {
    if (value === undefined) return null;
    if (typeof value !== 'object' || value === null || !('envelope' in value) ||
        !('revision' in value) || typeof value.revision !== 'string') {
      throw new Error(`The local ${label} record is damaged. Restore an encrypted export.`);
    }
    return { envelope: parseEnvelope(value.envelope), revision: value.revision };
  }

  async function read(): Promise<SavedDocument<T> | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(key);
      let result: SavedDocument<T> | null = null;
      let failure: unknown;
      request.onsuccess = () => {
        try { result = parseStored(request.result); } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        reject(failure ?? new Error(`Cannot read the local ${label}. Reopen folio or restore an export.`));
      };
    });
  }

  async function write(envelope: T | null, expectedRevision: string | null): Promise<SavedDocument<T> | null> {
    const validated = envelope === null ? null : parseEnvelope(envelope);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get(key);
      let result: SavedDocument<T> | null = null;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const current = parseStored(request.result);
          if ((current?.revision ?? null) !== expectedRevision) {
            throw new Error(`The ${label} changed in another window. Lock and unlock the latest copy before saving.`);
          }
          if (validated === null) store.delete(key);
          else {
            result = { envelope: validated, revision: crypto.randomUUID() };
            store.put(result, key);
          }
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        reject(failure ?? new Error(`The ${label} was not saved. Check disk space and local storage permissions.`));
      };
    });
  }

  async function discardDamaged(): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get(key);
      let failure: Error | undefined;
      request.onsuccess = () => {
        try {
          if (parseStored(request.result) !== null) {
            failure = new Error(`A readable ${label} exists. Reload folio and use its normal delete action instead.`);
            transaction.abort();
          }
        } catch {
          // The caller explicitly confirmed recovery; never replace a readable concurrent record.
          store.delete(key);
        }
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        reject(failure ?? new Error('Local recovery failed. Check application storage permissions.'));
      };
    });
  }

  return { read, write, discardDamaged };
}
