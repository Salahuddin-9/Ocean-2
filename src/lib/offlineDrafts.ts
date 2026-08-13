/**
 * Ocean — Offline Drafts & Smart Sync (Feature 14)
 * --------------------------------------------------
 * Drafts survive offline typing: the composer auto-saves to localStorage while
 * the user types, an outbox queue holds unsent items, and when the connection
 * returns the queue is flushed automatically (navigator.onLine + online event).
 */
export type DraftKind = 'post' | 'message' | 'reel';

export interface Draft {
  id: string;
  kind: DraftKind;
  text: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  syncedAt?: number;
}

export interface QueuedItem {
  id: string;
  kind: DraftKind;
  text: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}

const DRAFTS_KEY = 'ocean_drafts_v1';
const QUEUE_KEY = 'ocean_draft_queue_v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — drafts degrade gracefully */
  }
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** Subscribe to connectivity changes; returns an unsubscribe fn. */
export function onOnlineChange(cb: (online: boolean) => void): () => void {
  const go = () => cb(isOnline());
  window.addEventListener('online', go);
  window.addEventListener('offline', go);
  return () => {
    window.removeEventListener('online', go);
    window.removeEventListener('offline', go);
  };
}

export function saveDraft(kind: DraftKind, text: string, meta?: Record<string, unknown>): Draft {
  const drafts = listDrafts();
  // One live draft per (kind + meta.draftKey) so autosave replaces, not duplicates.
  const key = typeof meta?.draftKey === 'string' ? meta.draftKey : 'default';
  const existingIdx = drafts.findIndex(
    (d) => d.kind === kind && (typeof d.meta?.draftKey === 'string' ? d.meta.draftKey : 'default') === key
  );
  const draft: Draft = {
    id: existingIdx >= 0 ? drafts[existingIdx].id : `draft-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    kind,
    text,
    meta: meta ? { ...meta, draftKey: key } : { draftKey: key },
    createdAt: existingIdx >= 0 ? drafts[existingIdx].createdAt : Date.now(),
    syncedAt: existingIdx >= 0 ? drafts[existingIdx].syncedAt : undefined,
  };
  if (existingIdx >= 0) drafts[existingIdx] = draft;
  else drafts.unshift(draft);
  write(DRAFTS_KEY, drafts.slice(0, 30));
  return draft;
}

export function listDrafts(): Draft[] {
  return read<Draft[]>(DRAFTS_KEY, []);
}

export function removeDraft(id: string): void {
  write(DRAFTS_KEY, listDrafts().filter((d) => d.id !== id));
}

export function markSynced(id: string, at = Date.now()): void {
  write(
    DRAFTS_KEY,
    listDrafts().map((d) => (d.id === id ? { ...d, syncedAt: at } : d))
  );
}

export function clearDrafts(): void {
  localStorage.removeItem(DRAFTS_KEY);
}

/** Move a draft into the outbox queue (it was "sent" but we're offline). */
export function enqueueSend(kind: DraftKind, text: string, meta?: Record<string, unknown>): QueuedItem {
  const queue = pendingQueue();
  const item: QueuedItem = {
    id: `queued-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    kind,
    text,
    meta,
    createdAt: Date.now(),
  };
  queue.unshift(item);
  write(QUEUE_KEY, queue.slice(0, 50));
  return item;
}

export function pendingQueue(): QueuedItem[] {
  return read<QueuedItem[]>(QUEUE_KEY, []);
}

export function dequeueSend(id: string): void {
  write(QUEUE_KEY, pendingQueue().filter((q) => q.id !== id));
}

/**
 * Flush the outbox by handing each item to `sender`. Sender returns true on
 * success; successful items are dropped, failures stay queued.
 */
export async function flushQueue(
  sender: (item: QueuedItem) => Promise<boolean>
): Promise<{ synced: number; failed: number }> {
  const queue = pendingQueue();
  let synced = 0;
  let failed = 0;
  for (const item of queue) {
    try {
      const ok = await sender(item);
      if (ok) {
        dequeueSend(item.id);
        synced += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
}
