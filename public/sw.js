/**
 * Ocean — Offline Emergency Relay Service Worker (Feature 239)
 * --------------------------------------------------------------
 * Queues emergency messages in IndexedDB while the device is offline and
 * delivers them to POST /api/sat/relay as soon as connectivity returns.
 *
 * This is the realistic offline-queue + network-detection half of the
 * "satellite fallback" feature: no actual satellite uplink exists here —
 * wiring a real sat-com / SMS / IoT gateway is a production integration
 * that plugs into the same relay contract (/api/sat/relay).
 */
const DB_NAME = 'ocean-sat-queue';
const STORE = 'pending';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addPending(item: any): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function allPending(): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as any[]) || []);
    req.onerror = () => reject(req.error);
  });
}

async function removePending(ids: string[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    (ids || []).forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const MAX_ATTEMPTS = 10;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // drop items stuck for a week

async function flushQueue(): Promise<void> {
  try {
    const pending = await allPending();
    if (pending.length === 0) return;
    const delivered: string[] = [];
    const expired: string[] = [];
    const now = Date.now();
    for (const item of pending) {
      // Permanently failing items (e.g. expired auth token) must not retry
      // forever: drop after MAX_ATTEMPTS or a week in the queue.
      if ((item.attempts || 0) >= MAX_ATTEMPTS || now - (item.at || now) > MAX_AGE_MS) {
        expired.push(item.id);
        continue;
      }
      try {
        const res = await fetch('/api/sat/relay', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(item.token ? { Authorization: `Bearer ${item.token}` } : {}),
          },
          body: JSON.stringify({ toId: item.toId, payload: item.payload }),
        });
        if (res.ok) delivered.push(item.id);
        else await bumpAttempts(item);
      } catch (e) {
        /* still offline / transient failure — keep for the next attempt */
        await bumpAttempts(item);
      }
    }
    if (delivered.length > 0 || expired.length > 0) {
      await removePending([...delivered, ...expired]);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: 'OCEAN_DELIVERED', ids: delivered }));
    }
  } catch (e) {
    /* indexdb unavailable — non-fatal */
  }
}

async function bumpAttempts(item: any): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const get = store.get(item.id);
      get.onsuccess = () => {
        const rec = get.result;
        if (rec) store.put({ ...rec, attempts: (rec.attempts || 0) + 1 });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    /* non-fatal */
  }
}

self.addEventListener('install', (e: any) => self.skipWaiting());
self.addEventListener('activate', (e: any) => e.waitUntil((self as any).clients.claim()));

self.addEventListener('message', (e: any) => {
  const data = e.data || {};
  if (data.type === 'OCEAN_ENQUEUE') {
    e.waitUntil(addPending({
      id: data.item.id,
      toId: data.item.toId,
      payload: data.item.payload,
      token: data.item.token || null,
      at: data.item.at || Date.now(),
    }));
  } else if (data.type === 'OCEAN_FLUSH') {
    e.waitUntil(flushQueue());
  } else if (data.type === 'OCEAN_REMOVE') {
    e.waitUntil(removePending(Array.isArray(data.ids) ? data.ids : [data.id]));
  }
});

// Reconnect — the `online` event fires in the SW scope too: flush immediately
// and (where supported) register a background sync as a safety net.
self.addEventListener('online', () => {
  (self.registration as any)?.sync?.register('ocean-flush').catch(() => {});
  flushQueue();
});

// Periodic Background Sync (Chrome) — same handler tag.
self.addEventListener('sync', (e: any) => {
  if (e.tag === 'ocean-flush') e.waitUntil(flushQueue());
});
