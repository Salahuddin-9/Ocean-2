/**
 * types.ts — unified vocabulary for the self-contained calling engine.
 *
 * The engine (callEngine.ts) powers BOTH chat 1:1 calls (audio + video) and the
 * random "Meet" video calls with a single shared state machine. This module is
 * the single source of truth for:
 *   - the phase / disposition enums (Tinode supplies the event/terminal
 *     taxonomy, Fonoster the persisted CallStatus disposition set),
 *   - the signaling message types relayed by Ocean's own server,
 *   - every named timeout/constant (ported from Tinode calls.go, Jitsi RTC,
 *     Fonoster voice, and Ocean's existing useP2PCall / useRandomVideoCall).
 */

export type CallMode = 'chat' | 'meet';

export type CallType = 'audio' | 'video';

/**
 * Live UI phase. Chat uses outgoing/ringing; meet uses searching/cooldown;
 * connecting/connected/ending/ended/idle are shared.
 */
export type CallPhase =
  | 'idle'
  | 'outgoing'
  | 'ringing'
  | 'searching'
  | 'connecting'
  | 'connected'
  | 'ending'
  | 'cooldown'
  | 'ended';

/**
 * Terminal disposition of a finished call. This is the vocabulary written to
 * `/api/calls` (Fonoster CallStatus mapping, see DISPOSITION mapping below).
 */
export type CallDisposition =
  | 'completed'
  | 'declined'
  | 'missed'
  | 'busy'
  | 'cancelled'
  | 'failed'
  | 'disconnected';

/** Payload-opaque signal types carried by the REST relay. */
export type SignalType = 'offer' | 'answer' | 'candidate' | 'hangup';

/** Ring events relayed over /ws/chat (chat 1:1 only). */
export type RingType = 'call_offer' | 'call_answer' | 'call_cancel' | 'call_end' | 'call_ringing' | 'call_busy';

export interface IncomingCall {
  callId: string;
  fromUserId: string;
  fromName: string;
  callType: CallType;
}

export interface PeerInfo {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface StrangerProfile {
  id: string;
  displayName: string;
  interests: string[];
  avatarUrl?: string;
  ageGroup?: string;
  countryCode?: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  displayName: string;
  timestamp: number;
  fromSelf: boolean;
  isSystem?: boolean;
}

// ── Constants (ported) ──────────────────────────────────────────────────────

/** Chat ring timeout: unanswered outgoing auto-cancels, ringing auto-declines. (Tinode callEstablishmentTimeout) */
export const CALL_ESTABLISHMENT_TIMEOUT_MS = 45_000;

/** Accept/match → ICE connected. Fires → 'failed' (after one ICE restart). */
export const CALL_CONNECT_TIMEOUT_MS = 20_000;

/** Connected + ICE disconnected for this long → auto-hangup 'disconnected'. (Jitsi) */
export const ICE_FAILURE_GRACE_MS = 5_000;

/** ICE restarts attempted on a failed pre-connect before giving up. (Jitsi) */
export const ICE_RESTART_RETRIES = 1;

/** Chat REST signal poll interval (Ocean existing). */
export const POLL_INTERVAL_MS = 700;

/** Meet signal poll interval (Ocean existing). */
export const MEET_SIGNAL_POLL_MS = 1_200;

/** Meet room text-message poll interval (Ocean existing). */
export const MEET_MESSAGE_POLL_MS = 1_500;

/** Meet matchmaking poll interval (Ocean existing). */
export const MATCH_POLL_MS = 2_000;

/** Ring WS reconnect base delay. */
export const WS_RECONNECT_MS = 3_000;

/** Ring WS reconnect cap after consecutive failures. */
export const WS_RECONNECT_BACKOFF_MAX_MS = 15_000;

/** Grace before pc.close() so the final media frames flush (Fonoster 2000ms trimmed). */
export const HANGUP_GRACE_MS = 500;

/** Server FIFO cap per room (50) — the poller must tolerate drops. */
export const SIGNAL_CAP = 50;

/** Meet anti-spam: 4 rapid skips within SKIP_WINDOW_MS → SKIP_COOLDOWN_S. */
export const SKIP_THRESHOLD = 4;
export const SKIP_WINDOW_MS = 4_000;
export const SKIP_COOLDOWN_S = 8;

/** UI countdown shown on the incoming-call popup (engine hard-enforces 45s). */
export const RING_UI_COUNTDOWN_S = 30;

// ── Disposition → /api/calls status ─────────────────────────────────────────
// Fonoster CallStatus mapping: NORMAL_CLEARING=CALL completed, CALL_REJECTED,
// NO_ANSWER, USER_BUSY, CANCEL, SERVICE_UNAVAILABLE, CHANUNAVAIL.

export const DISPOSITION_LABELS: Record<CallDisposition, string> = {
  completed: 'Completed',
  declined: 'Declined',
  missed: 'Missed',
  busy: 'Busy',
  cancelled: 'Cancelled',
  failed: 'Failed',
  disconnected: 'Disconnected',
};

/**
 * Deterministic call/room id so both peers converge on one signal room even
 * when they call each other simultaneously (glare avoidance — Tinode 486 rule).
 */
export function buildCallId(a: string, b: string): string {
  return `call-${[a, b].sort().join('-')}`;
}
