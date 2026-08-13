/**
 * ringSocket.ts — singleton authenticated WebSocket manager for the `/ws/chat`
 * ring channel.
 *
 * Extracted from P2PCallLayer's inline socket so the chat call path and any
 * future consumer share ONE authenticated connection per tab. The server
 * (chatServer.ts) relays the lightweight ring events between users:
 *   call_offer → call_ringing → call_answer / call_cancel / call_end / call_busy.
 * The actual media plane (SDP/ICE) never travels over this socket — it uses the
 * REST relay (`/api/meet/room/:id/signal`), so this socket is best-effort:
 * a dropped message is always recoverable via the REST hangup signal.
 *
 * Reconnect: 3s base delay, backing off to WS_RECONNECT_BACKOFF_MAX_MS after 5
 * consecutive failures, reset on a successful open. Outbound messages are
 * buffered while the socket is CONNECTING and dropped when closed.
 */

import { WS_RECONNECT_MS, WS_RECONNECT_BACKOFF_MAX_MS } from './types';

export interface RingSocketHandle {
  /** Send a best-effort ring event ({ type: 'call_offer', ... }). */
  send(msg: any): void;
  /** Unsubscribe; the shared socket closes when the last subscriber leaves. */
  close(): void;
}

export interface RingSocketOptions {
  token: string;
  userId: string;
  name: string;
  onEvent: (event: any) => void;
}

interface Subscriber {
  token: string;
  userId: string;
  name: string;
  onEvent: (event: any) => void;
}

let socket: WebSocket | null = null;
let subscribers = new Set<Subscriber>();
let reconnectTimer: any = null;
let reconnectAttempts = 0;
let sendBuffer: any[] = [];

function connect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    socket = ws;

    ws.onopen = () => {
      reconnectAttempts = 0;
      // Authenticate with the first subscriber's identity (one user per tab).
      const first = subscribers.values().next().value as Subscriber | undefined;
      if (first) {
        try {
          ws.send(JSON.stringify({ type: 'auth', token: first.token, userId: first.userId, name: first.name }));
        } catch (e) {
          console.warn('ring auth send failed:', e);
        }
      }
      // Replay anything queued while we were connecting.
      const queued = sendBuffer.splice(0, sendBuffer.length);
      queued.forEach((msg) => {
        try {
          ws.send(JSON.stringify(msg));
        } catch (e) {
          console.warn('ring buffered send failed:', e);
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        subscribers.forEach((s) => {
          try {
            s.onEvent(data);
          } catch (e) {
            console.warn('ring subscriber error:', e);
          }
        });
      } catch (e) {
        console.warn('ring message parse error:', e);
      }
    };

    ws.onclose = () => {
      socket = null;
      if (subscribers.size > 0) {
        reconnectAttempts += 1;
        const backoff = Math.min(
          WS_RECONNECT_MS * Math.pow(2, Math.min(reconnectAttempts - 1, 3)),
          WS_RECONNECT_BACKOFF_MAX_MS
        );
        reconnectTimer = setTimeout(connect, backoff);
      }
    };

    ws.onerror = () => {
      // onclose follows; closing explicitly avoids a lingering dead socket.
      try {
        ws.close();
      } catch (e) {
        /* ignore */
      }
    };
  } catch (e) {
    console.warn('ring socket connect error:', e);
  }
}

/**
 * Subscribe to the shared ring socket. Returns a handle used to send ring
 * events and to unsubscribe.
 */
export function openRingSocket(opts: RingSocketOptions): RingSocketHandle {
  const subscriber: Subscriber = { token: opts.token, userId: opts.userId, name: opts.name, onEvent: opts.onEvent };
  subscribers.add(subscriber);
  connect();

  return {
    send(msg: any) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(msg));
        } catch (e) {
          console.warn('ring send failed:', e);
        }
      } else {
        // Buffer while connecting (best-effort; bounded).
        sendBuffer.push(msg);
        if (sendBuffer.length > 20) sendBuffer.shift();
      }
    },
    close() {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (socket) {
          try {
            socket.onclose = null;
            socket.close();
          } catch (e) {
            /* ignore */
          }
          socket = null;
        }
        sendBuffer = [];
        reconnectAttempts = 0;
      }
    },
  };
}
