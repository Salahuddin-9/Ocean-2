/**
 * Ocean — Offline Emergency Queue bridge (Feature 239)
 * ------------------------------------------------------
 * Client bridge to the offline relay service worker (public/sw.js).
 * - queueEmergencyMessage() stores the message in the SW's IndexedDB queue
 *   (auto-delivered on reconnect) with a localStorage mirror for the UI.
 * - flushSatQueue() forces delivery immediately when online.
 * - listenDelivered() lets the UI remove delivered entries live.
 */

export interface QueuedEmergency {
  id: string;
  toId: string;
  payload: string;
  token?: string | null;
  at: number;
}

const LOCAL_KEY = 'ocean_satellite_queue';

async function swActive(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.active;
  } catch {
    return null;
  }
}

function readLocal(): QueuedEmergency[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(q: QueuedEmergency[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(q));
  } catch {
    /* storage full / blocked — non-fatal */
  }
}

export async function queueEmergencyMessage(
  toId: string,
  payload: string,
  token?: string | null,
): Promise<QueuedEmergency> {
  const item: QueuedEmergency = {
    id: `sat-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    toId,
    payload,
    token: token || null,
    at: Date.now(),
  };
  // localStorage mirror — durable even if the SW isn't active yet.
  writeLocal([item, ...readLocal()]);
  const sw = await swActive();
  if (sw) sw.postMessage({ type: 'OCEAN_ENQUEUE', item });
  return item;
}

/** Force a flush through the service worker; resolves with the delivered ids. */
export async function flushSatQueue(): Promise<string[]> {
  const sw = await swActive();
  if (sw) {
    return new Promise((resolve) => {
      const onMsg = (e: MessageEvent) => {
        if (e.data && e.data.type === 'OCEAN_DELIVERED') {
          navigator.serviceWorker.removeEventListener('message', onMsg);
          removeLocal(e.data.ids || []);
          resolve(e.data.ids || []);
        }
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      sw.postMessage({ type: 'OCEAN_FLUSH' });
      // The SW may have nothing queued — settle after a short window.
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', onMsg);
        resolve([]);
      }, 3000);
    });
  }
  return [];
}

export function readSatQueue(): QueuedEmergency[] {
  return readLocal();
}

export function clearSatQueueLocal(ids?: string[]) {
  if (ids && ids.length) removeLocal(ids);
  else writeLocal([]);
}

function removeLocal(ids: string[]) {
  writeLocal(readLocal().filter((m) => !ids.includes(m.id)));
}

/** Subscribe to SW "delivered" notifications. Returns an unsubscribe fn. */
export function listenDelivered(cb: (ids: string[]) => void): () => void {
  const onMsg = (e: MessageEvent) => {
    if (e.data && e.data.type === 'OCEAN_DELIVERED') cb(e.data.ids || []);
  };
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', onMsg);
  }
  return () => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', onMsg);
    }
  };
}
