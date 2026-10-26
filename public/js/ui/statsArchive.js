// Full JSON-compatible match records have a separate quota from localStorage's
// small history index. Never replace an archived full record with its summary.
const DB = 'sp.match-details';
const STORE = 'records';
let opened = null;
let pending = Promise.resolve();
function open() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (!opened) opened = new Promise(resolve => {
    let request;
    try { request = globalThis.indexedDB.open(DB, 1); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, {keyPath:'id'});
      store.createIndex('time', 't');
    };
    request.onerror = () => { opened = null; resolve(null); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opened = null; };
      resolve(db);
    };
  });
  return opened;
}
function enqueue(operation) {
  const result = pending.then(operation).catch(() => false);
  pending = result.then(() => {});
  return result;
}
export function archiveStatsRecords(records, limit = 1000) {
  if (!globalThis.indexedDB) return Promise.resolve(false);
  const full = records.filter(r => r?.id && !r.compact && r.test !== true);
  if (!full.length) return Promise.resolve(true);
  // Snapshot before callers update their localStorage envelope or switch pages.
  let snapshot;
  try { snapshot = typeof structuredClone === 'function' ? structuredClone(full) : JSON.parse(JSON.stringify(full)); }
  catch { return Promise.resolve(false); }
  return enqueue(async () => {
    const db = await open(); if (!db) return false;
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      for (const record of snapshot) store.put(record);
      let count = 0;
      const cursor = store.index('time').openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const row = cursor.result; if (!row) return;
        if (++count > limit) row.delete();
        row.continue();
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    });
  });
}
export async function readStatsArchive() {
  await pending;
  try {
    const db = await open(); if (!db) return [];
    return await new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).getAll();
      let records = [];
      request.onsuccess = () => { records = request.result; };
      tx.oncomplete = () => resolve(records);
      tx.onerror = tx.onabort = () => resolve([]);
    });
  } catch { return []; }
}
export function clearStatsArchive() {
  return enqueue(async () => {
    const db = await open(); if (!db) return false;
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    });
  });
}
