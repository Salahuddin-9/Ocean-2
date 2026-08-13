/**
 * Server-side matchmaking queue.
 * Pairs users randomly, but prefers users who share at least one interest tag.
 */

export interface QueueEntry {
  socketId: string;
  userId: string;
  displayName: string;
  interests: string[];
  joinedAt: number;
}

export interface MatchResult {
  userA: QueueEntry;
  userB: QueueEntry;
  callId: string;
  sharedInterests: string[];
}

const queue: QueueEntry[] = [];

/** Maximum wait before ignoring interest matching and pairing with anyone (ms) */
const INTEREST_MATCH_TIMEOUT_MS = 8_000;

function generateCallId(): string {
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sharedInterests(a: string[], b: string[]): string[] {
  const setB = new Set(b.map(t => t.toLowerCase()));
  return a.filter(t => setB.has(t.toLowerCase()));
}

/**
 * Add a user to the matchmaking queue.
 * Returns a MatchResult immediately if a suitable partner is found, otherwise null.
 */
export function enqueue(entry: QueueEntry): MatchResult | null {
  // Remove any stale entry for the same socket (re-queue after skip)
  dequeue(entry.socketId);

  const now = Date.now();

  // 1. Try to find a partner with shared interests
  let partnerIndex = queue.findIndex(
    candidate =>
      candidate.socketId !== entry.socketId &&
      sharedInterests(entry.interests, candidate.interests).length > 0
  );

  // 2. If no interest match found, try anyone who has been waiting long enough
  if (partnerIndex === -1) {
    partnerIndex = queue.findIndex(
      candidate =>
        candidate.socketId !== entry.socketId &&
        now - candidate.joinedAt >= INTEREST_MATCH_TIMEOUT_MS
    );
  }

  // 3. If still no match, just take the first available person
  if (partnerIndex === -1 && queue.length > 0) {
    partnerIndex = 0;
  }

  if (partnerIndex !== -1) {
    const partner = queue.splice(partnerIndex, 1)[0];
    const shared = sharedInterests(entry.interests, partner.interests);
    return {
      userA: entry,
      userB: partner,
      callId: generateCallId(),
      sharedInterests: shared,
    };
  }

  // No partner yet — add to queue
  queue.push({ ...entry, joinedAt: now });
  return null;
}

/**
 * Remove a user from the queue (e.g. on disconnect or stop).
 */
export function dequeue(socketId: string): void {
  const idx = queue.findIndex(e => e.socketId === socketId);
  if (idx !== -1) queue.splice(idx, 1);
}

/** Return current queue length (for diagnostics). */
export function queueLength(): number {
  return queue.length;
}

/** Clear the entire queue — for testing only. */
export function clearQueue(): void {
  queue.splice(0, queue.length);
}
