/**
 * callEngine.ts — framework-agnostic WebRTC calling engine.
 *
 * One engine powers BOTH flows, derived from the three source systems:
 *   - Tinode (chat-master): message taxonomy (offer/answer/candidate/hangup +
 *     ring events), call-establishment timeout, busy/glare semantics,
 *     caller-owned call history.
 *   - Jitsi: split audio/video GUM fallback, track.enabled mute vs
 *     replaceTrack device switch, connection-state machine (ICE restart once,
 *     disconnected grace → auto-hangup), connection-quality sampling, remote
 *     stream merging.
 *   - Fonoster: the terminal CallStatus vocabulary written to `/api/calls`.
 *
 * Signaling is Ocean's own server:
 *   - SDP/ICE via REST relay `/api/meet/room/:id/signal` + `/signals` poll.
 *   - Lightweight ring events (chat 1:1 only) via `/ws/chat` (RingSocketHandle).
 *
 * The class holds no React — it emits immutable state snapshots through
 * `onState`, which the React hook (useCallEngine.tsx) mirrors.
 */

import { getRTCConfiguration } from '../lib/rtcConfig';
import {
  CallMode,
  CallType,
  CallPhase,
  CallDisposition,
  SignalType,
  IncomingCall,
  PeerInfo,
  StrangerProfile,
  ChatMessage,
  CALL_ESTABLISHMENT_TIMEOUT_MS,
  CALL_CONNECT_TIMEOUT_MS,
  ICE_FAILURE_GRACE_MS,
  ICE_RESTART_RETRIES,
  POLL_INTERVAL_MS,
  MEET_SIGNAL_POLL_MS,
  MEET_MESSAGE_POLL_MS,
  MATCH_POLL_MS,
  HANGUP_GRACE_MS,
  SKIP_THRESHOLD,
  SKIP_WINDOW_MS,
  SKIP_COOLDOWN_S,
  buildCallId,
} from './types';
import { acquireMedia, wireRemoteStream, replaceTrack, normalizeMediaError } from './media';
import type { RingSocketHandle } from './ringSocket';

export interface EngineState {
  phase: CallPhase;
  callId: string | null;
  peer: PeerInfo | null;
  callType: CallType;
  incomingCall: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteConnected: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  callSeconds: number;
  cooldownSeconds: number;
  mediaError: 'audio' | 'video' | null;
  connectionQuality: number;
  disposition: CallDisposition | null;
  // meet
  stranger: StrangerProfile | null;
  sharedInterests: string[];
  roomId: string | null;
  messages: ChatMessage[];
  unreadCount: number;
  isChatOpen: boolean;
  isVideoConsented: boolean;
}

export interface CallEngineOptions {
  currentUser: { id: string; name: string; avatarUrl?: string } | null;
  token?: string | null;
  mode: CallMode;
  ws?: RingSocketHandle | null;
  onState: (state: EngineState) => void;
  onToast?: (msg: string) => void;
}

export function createDefaultState(): EngineState {
  return {
    phase: 'idle',
    callId: null,
    peer: null,
    callType: 'video',
    incomingCall: null,
    localStream: null,
    remoteStream: null,
    remoteConnected: false,
    isMuted: false,
    isCameraOff: false,
    callSeconds: 0,
    cooldownSeconds: 0,
    mediaError: null,
    connectionQuality: 0,
    disposition: null,
    stranger: null,
    sharedInterests: [],
    roomId: null,
    messages: [],
    unreadCount: 0,
    isChatOpen: false,
    isVideoConsented: true,
  };
}

export class CallEngine {
  readonly mode: CallMode;
  private currentUser: CallEngineOptions['currentUser'];
  private token?: string | null;
  private ws: RingSocketHandle | null;
  private onState: (state: EngineState) => void;
  private onToast?: (msg: string) => void;

  private state: EngineState;
  private pcRef: RTCPeerConnection | null = null;
  private localStreamRef: MediaStream | null = null;

  // refs (chat + meet)
  private callIdRef: string | null = null;
  private roomIdRef: string | null = null;
  private peerIdRef: string | null = null;
  private isCallerRef = false;
  private isInitiatorRef = false;
  private endedRef = false;
  private loggedRef = false;
  private negotiatingRef = false;
  private iceRestartsRef = 0;
  private disconnectedAtRef: number | null = null;
  private lastSignalTimeRef = 0;
  private lastSkipTimeRef = 0;
  private consecutiveSkipsRef = 0;
  private currentInterests: string[] = [];
  private lastMessageCount = 0;

  // timers
  private signalTimerRef: any = null;
  private messageTimerRef: any = null;
  private matchTimerRef: any = null;
  private cooldownTimerRef: any = null;
  private secondsTimerRef: any = null;
  private connectTimerRef: any = null;
  private iceGraceTimerRef: any = null;
  private hangupTimerRef: any = null;
  private ringTimerRef: any = null;
  private qualityTimerRef: any = null;

  constructor(opts: CallEngineOptions) {
    this.currentUser = opts.currentUser;
    this.token = opts.token;
    this.mode = opts.mode;
    this.ws = opts.ws || null;
    this.onState = opts.onState;
    this.onToast = opts.onToast;
    this.state = createDefaultState();
  }

  // ── state accessors ───────────────────────────────────────────────────────

  /** Update the session identity after the provider hydrates auth. */
  setSession(currentUser: CallEngineOptions['currentUser'], token?: string | null): void {
    this.currentUser = currentUser;
    this.token = token;
  }

  getState(): EngineState {
    return { ...this.state };
  }

  private emit(): void {
    this.onState({ ...this.state });
  }

  private toast(msg: string): void {
    try {
      this.onToast?.(msg);
    } catch (e) {
      console.warn('toast failed:', e);
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private postSignal = async (roomId: string, type: SignalType, payload: any): Promise<void> => {
    try {
      await fetch(`/api/meet/room/${encodeURIComponent(roomId)}/signal`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ type, payload }),
      });
    } catch (e) {
      console.warn('signal post failed:', e);
    }
  };

  private sendWs(msg: any): void {
    try {
      this.ws?.send(msg);
    } catch (e) {
      console.warn('ring send failed:', e);
    }
  }

  private stopLocalTracks(): void {
    if (this.localStreamRef) {
      try {
        this.localStreamRef.getTracks().forEach((t) => t.stop());
      } catch (e) {
        /* ignore */
      }
      this.localStreamRef = null;
    }
  }

  private closePeerConnection(): void {
    if (this.pcRef) {
      try {
        this.pcRef.close();
      } catch (e) {
        /* ignore */
      }
      this.pcRef = null;
    }
  }

  private clearRoomTimers(): void {
    if (this.signalTimerRef) {
      clearInterval(this.signalTimerRef);
      this.signalTimerRef = null;
    }
    if (this.messageTimerRef) {
      clearInterval(this.messageTimerRef);
      this.messageTimerRef = null;
    }
    if (this.matchTimerRef) {
      clearInterval(this.matchTimerRef);
      this.matchTimerRef = null;
    }
    if (this.connectTimerRef) {
      clearTimeout(this.connectTimerRef);
      this.connectTimerRef = null;
    }
    if (this.iceGraceTimerRef) {
      clearTimeout(this.iceGraceTimerRef);
      this.iceGraceTimerRef = null;
    }
    if (this.hangupTimerRef) {
      clearTimeout(this.hangupTimerRef);
      this.hangupTimerRef = null;
    }
    if (this.ringTimerRef) {
      clearTimeout(this.ringTimerRef);
      this.ringTimerRef = null;
    }
    if (this.secondsTimerRef) {
      clearInterval(this.secondsTimerRef);
      this.secondsTimerRef = null;
    }
    if (this.qualityTimerRef) {
      clearInterval(this.qualityTimerRef);
      this.qualityTimerRef = null;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimerRef) {
      clearTimeout(this.connectTimerRef);
      this.connectTimerRef = null;
    }
  }

  private clearIceGraceTimer(): void {
    if (this.iceGraceTimerRef) {
      clearTimeout(this.iceGraceTimerRef);
      this.iceGraceTimerRef = null;
    }
  }

  private clearRingTimer(): void {
    if (this.ringTimerRef) {
      clearTimeout(this.ringTimerRef);
      this.ringTimerRef = null;
    }
  }

  private clearMatchPoll(): void {
    if (this.matchTimerRef) {
      clearInterval(this.matchTimerRef);
      this.matchTimerRef = null;
    }
  }

  private clearSignalPoll(): void {
    if (this.signalTimerRef) {
      clearInterval(this.signalTimerRef);
      this.signalTimerRef = null;
    }
  }

  private clearMessagePoll(): void {
    if (this.messageTimerRef) {
      clearInterval(this.messageTimerRef);
      this.messageTimerRef = null;
    }
  }

  private clearSecondsTimer(): void {
    if (this.secondsTimerRef) {
      clearInterval(this.secondsTimerRef);
      this.secondsTimerRef = null;
    }
  }

  private resetRoomState(): void {
    this.state.callId = null;
    this.state.peer = null;
    this.state.incomingCall = null;
    this.state.remoteStream = null;
    this.state.remoteConnected = false;
    this.state.callSeconds = 0;
    this.state.mediaError = null;
    this.state.connectionQuality = 0;
    this.state.disposition = null;
    this.callIdRef = null;
    this.roomIdRef = null;
    this.peerIdRef = null;
    this.isInitiatorRef = false;
    this.iceRestartsRef = 0;
    this.disconnectedAtRef = null;
    this.lastSignalTimeRef = 0;
    this.endedRef = false;
    this.loggedRef = false;
  }

  /** Full teardown (chat + meet stop): closes pc, stops local media, resets. */
  private cleanupCall(): void {
    this.closePeerConnection();
    this.clearRoomTimers();
    this.stopLocalTracks();
    this.state.localStream = null;
    this.resetRoomState();
    this.emit();
  }

  /** Meet "skip" teardown: closes pc + timers but KEEPS the local media. */
  private cleanupMeetRoom(): void {
    this.closePeerConnection();
    this.clearRoomTimers();
    this.state.remoteStream = null;
    this.state.remoteConnected = false;
    this.state.roomId = null;
    this.state.stranger = null;
    this.state.callSeconds = 0;
    this.roomIdRef = null;
    this.peerIdRef = null;
    this.isInitiatorRef = false;
    this.iceRestartsRef = 0;
    this.endedRef = false;
  }

  // ── signaling ─────────────────────────────────────────────────────────────

  private async pollSignals(roomId: string): Promise<void> {
    try {
      const res = await fetch(
        `/api/meet/room/${encodeURIComponent(roomId)}/signals?lastTimestamp=${this.lastSignalTimeRef}`,
        { headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} }
      );
      if (!res.ok) return;
      const data = await res.json();
      for (const signal of data.signals || []) {
        if (signal.timestamp > this.lastSignalTimeRef) this.lastSignalTimeRef = signal.timestamp;
        if (signal.senderId === this.currentUser?.id) continue;
        await this.handleSignal(signal);
      }
    } catch (e) {
      console.warn('signal poll error:', e);
    }
  }

  private async handleSignal(signal: { type: string; payload: any }): Promise<void> {
    const pc = this.pcRef;
    if (!pc) return;
    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (this.roomIdRef) await this.postSignal(this.roomIdRef, 'answer', answer);
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      } else if (signal.type === 'candidate') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
        } catch (e) {
          // Expected when an ICE candidate arrives between setRemoteDescription calls.
          console.warn('addIceCandidate skipped:', e);
        }
      } else if (signal.type === 'hangup') {
        this.handleRemoteHangup();
      }
    } catch (e) {
      console.warn('handleSignal error:', e);
    }
  }

  private async pollMessages(roomId: string): Promise<void> {
    try {
      const res = await fetch(`/api/meet/room/${encodeURIComponent(roomId)}/messages`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      const formatted: ChatMessage[] = (data.messages || []).map((m: any) => ({
        id: m.id || `msg-${m.timestamp}`,
        text: m.text,
        displayName: m.senderId === this.currentUser?.id ? 'You' : this.state.stranger?.displayName || 'Stranger',
        timestamp: m.timestamp,
        fromSelf: m.senderId === this.currentUser?.id,
      }));
      if (this.state.isChatOpen) this.state.unreadCount = 0;
      else if (formatted.length > this.lastMessageCount) {
        this.state.unreadCount += formatted.length - this.lastMessageCount;
      }
      const changed =
        formatted.length !== this.state.messages.length ||
        formatted.some((m: ChatMessage, i: number) => m.text !== this.state.messages[i]?.text);
      this.lastMessageCount = formatted.length;
      if (changed) {
        this.state.messages = formatted;
        this.emit();
      }
    } catch (e) {
      console.warn('message poll error:', e);
    }
  }

  // ── RTC ───────────────────────────────────────────────────────────────────

  private initPeerConnection(stream: MediaStream | null): RTCPeerConnection {
    const pc = new RTCPeerConnection(getRTCConfiguration());
    this.pcRef = pc;

    wireRemoteStream(pc, (merged) => {
      this.state.remoteStream = merged;
      this.state.remoteConnected = true;
      this.emit();
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomIdRef) {
        this.postSignal(this.roomIdRef, 'candidate', event.candidate.toJSON());
      }
    };

    pc.onnegotiationneeded = async () => {
      const roomId = this.roomIdRef;
      if (!this.isInitiatorRef || !roomId || this.negotiatingRef) return;
      this.negotiatingRef = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.postSignal(roomId, 'offer', offer);
      } catch (e) {
        console.warn('negotiation offer failed:', e);
      } finally {
        this.negotiatingRef = false;
      }
    };

    pc.onconnectionstatechange = () => this.handleConnectionState(pc);

    if (stream && stream.getTracks().length > 0) {
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    }
    this.localStreamRef = stream;
    this.state.localStream = stream;
    this.state.isCameraOff = false;
    return pc;
  }

  private handleConnectionState(pc: RTCPeerConnection): void {
    const cs = pc.connectionState;
    if (cs === 'connected') {
      this.clearConnectTimer();
      this.clearIceGraceTimer();
      this.disconnectedAtRef = null;
      if (this.state.phase !== 'connected' && this.state.phase !== 'ended' && this.state.phase !== 'ending') {
        this.state.phase = 'connected';
        this.state.callSeconds = 0;
        if (this.mode === 'chat') this.startSecondsTimer(); // meet UI has no call timer
        this.startQualityMonitor();
        this.emit();
      }
    } else if (cs === 'failed') {
      if (this.iceRestartsRef < ICE_RESTART_RETRIES) {
        this.iceRestartsRef += 1;
        this.iceRestart();
      } else {
        this.finish('failed');
      }
    } else if (cs === 'disconnected') {
      if (this.state.phase === 'connected' && this.disconnectedAtRef == null) {
        this.disconnectedAtRef = Date.now();
        this.clearIceGraceTimer();
        this.iceGraceTimerRef = setTimeout(() => {
          if (this.state.phase === 'connected' && this.pcRef?.connectionState === 'disconnected') {
            this.finish('disconnected');
          }
        }, ICE_FAILURE_GRACE_MS);
      }
    }
  }

  private async iceRestart(): Promise<void> {
    const pc = this.pcRef;
    if (!pc) return;
    try {
      pc.restartIce(); // triggers onnegotiationneeded → initiator re-offers
    } catch (e) {
      console.warn('ICE restart failed:', e);
      this.finish('failed');
    }
  }

  private startSecondsTimer(): void {
    this.clearSecondsTimer();
    this.secondsTimerRef = setInterval(() => {
      this.state.callSeconds += 1;
      this.emit();
    }, 1000);
  }

  private startQualityMonitor(): void {
    if (this.qualityTimerRef) clearInterval(this.qualityTimerRef);
    this.qualityTimerRef = setInterval(async () => {
      const pc = this.pcRef;
      if (!pc || this.state.phase !== 'connected') return;
      try {
        const stats = await pc.getStats();
        let quality = 100;
        stats.forEach((report: any) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
            const rtt = report.currentRoundTripTime ?? report.totalRoundTripTime ?? 0;
            quality = Math.max(0, Math.round(100 - rtt * 100));
          }
        });
        if (quality !== this.state.connectionQuality) {
          this.state.connectionQuality = quality;
          this.emit();
        }
      } catch (e) {
        /* ignore */
      }
    }, 2000);
  }

  private startConnectTimer(): void {
    this.clearConnectTimer();
    this.connectTimerRef = setTimeout(() => {
      if (this.endedRef) return;
      // ICE restart attempts are owned by the connection-state machine
      // (handleConnectionState 'failed' → iceRestart). A connection that never
      // establishes within the window simply fails.
      this.finish('failed');
    }, CALL_CONNECT_TIMEOUT_MS);
  }

  private startRingTimer(): void {
    this.clearRingTimer();
    this.ringTimerRef = setTimeout(() => {
      if (this.state.phase === 'outgoing') {
        this.sendWs({ type: 'call_cancel', to: this.peerIdRef, callId: this.callIdRef });
        this.finish('missed');
      } else if (this.state.phase === 'ringing' && this.state.incomingCall) {
        this.sendWs({
          type: 'call_answer',
          to: this.state.incomingCall.fromUserId,
          callId: this.state.incomingCall.callId,
          accepted: false,
        });
        this.finish('missed', false);
      }
    }, CALL_ESTABLISHMENT_TIMEOUT_MS);
  }

  // ── call termination ──────────────────────────────────────────────────────

  /**
   * Terminal transition. `log` is true only on the caller side in chat mode
   * (the caller owns the /api/calls record — exactly one record per call).
   */
  private finish(disposition: CallDisposition, log: boolean = this.isCallerRef && this.mode === 'chat'): void {
    if (this.endedRef) return;
    this.endedRef = true;
    this.state.disposition = disposition;
    this.state.phase = 'ending';
    this.clearConnectTimer();
    this.clearIceGraceTimer();
    if (log) this.logHistory(disposition);
    this.emit();
    this.hangupTimerRef = setTimeout(() => {
      this.closePeerConnection();
      this.clearRoomTimers();
      this.stopLocalTracks();
      this.state.localStream = null;
      this.resetRoomState();
      // Meet has no 'ended' UI — a failed/torn-down call returns to idle so the
      // user can Start again. Chat shows the ended overlay for a few seconds.
      if (this.mode === 'meet') {
        this.state.phase = 'idle';
        this.toast('Call ended.');
      } else {
        this.state.phase = 'ended';
      }
      this.emit();
    }, HANGUP_GRACE_MS);
  }

  private logHistory(disposition: CallDisposition): void {
    if (this.loggedRef || !this.peerIdRef || !this.token) return;
    this.loggedRef = true;
    try {
      fetch('/api/calls', {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({
          targetUserId: this.peerIdRef,
          callType: this.state.callType,
          durationSec: this.state.callSeconds,
          status: disposition,
        }),
      }).catch((e) => console.warn('Failed to log call:', e));
    } catch (e) {
      console.warn('Failed to log call:', e);
    }
  }

  private handleRemoteHangup(): void {
    if (this.endedRef) return;
    const wasConnected = this.state.phase === 'connected';
    if (wasConnected) {
      this.finish('completed');
    } else {
      this.finish(this.isCallerRef ? 'missed' : 'cancelled', this.isCallerRef && this.mode === 'chat');
    }
  }

  // ── CHAT API ──────────────────────────────────────────────────────────────

  startCall = async (targetUserId: string, callType: CallType = 'audio', peerName?: string): Promise<void> => {
    if (!this.currentUser || !targetUserId) return;
    if (this.state.phase !== 'idle' && this.state.phase !== 'ended') return; // busy
    this.cleanupCall();
    this.endedRef = false;

    const rId = buildCallId(this.currentUser.id, targetUserId);
    this.callIdRef = rId;
    this.roomIdRef = rId;
    this.peerIdRef = targetUserId;
    this.isCallerRef = true;
    this.isInitiatorRef = true;
    this.state.callId = rId;
    this.state.callType = callType;
    this.state.peer = { id: targetUserId, name: peerName || '' };
    this.state.phase = 'outgoing';
    this.emit();

    // Audio calls never request the camera.
    const acq = await acquireMedia({ audio: true, video: callType === 'video' });
    if (!acq.stream) {
      this.state.mediaError = normalizeMediaError(acq.mediaError) ?? 'audio';
      this.toast('⚠️ Microphone unavailable — cannot start the call');
      this.finish('failed');
      return;
    }
    if (callType === 'video' && acq.mediaError === 'video') {
      this.state.mediaError = 'video';
      this.toast('⚠️ Camera unavailable — continuing with audio only');
    }

    // The initial offer is sent by the onnegotiationneeded handler after
    // addTrack (single negotiation path for initial + ICE-restart re-offers).
    this.lastSignalTimeRef = 0;
    this.signalTimerRef = setInterval(() => this.pollSignals(rId), POLL_INTERVAL_MS);
    this.startRingTimer();
    this.sendWs({ type: 'call_offer', to: targetUserId, callId: rId, callType, fromName: this.currentUser.name || 'User' });
  };

  acceptIncoming = async (): Promise<void> => {
    const inc = this.state.incomingCall;
    if (!inc || !this.currentUser) return;
    this.endedRef = false;
    this.callIdRef = inc.callId;
    this.roomIdRef = inc.callId;
    this.peerIdRef = inc.fromUserId;
    this.isCallerRef = false;
    this.isInitiatorRef = false;
    this.state.callId = inc.callId;
    this.state.peer = { id: inc.fromUserId, name: inc.fromName };
    this.state.callType = inc.callType;
    this.state.incomingCall = null;
    this.state.phase = 'connecting';
    this.emit();

    const acq = await acquireMedia({ audio: true, video: inc.callType === 'video' });
    if (!acq.stream) {
      this.state.mediaError = normalizeMediaError(acq.mediaError) ?? 'audio';
      this.toast('⚠️ Microphone unavailable — cannot answer');
      this.sendWs({ type: 'call_answer', to: inc.fromUserId, callId: inc.callId, accepted: false });
      if (inc.callId) this.postSignal(inc.callId, 'hangup', {});
      this.finish('failed', false);
      return;
    }
    if (inc.callType === 'video' && acq.mediaError === 'video') {
      this.state.mediaError = 'video';
      this.toast('⚠️ Camera unavailable — continuing with audio only');
    }

    this.initPeerConnection(acq.stream);
    this.lastSignalTimeRef = 0;
    this.signalTimerRef = setInterval(() => this.pollSignals(inc.callId), POLL_INTERVAL_MS);
    this.startConnectTimer();
    this.sendWs({ type: 'call_answer', to: inc.fromUserId, callId: inc.callId, accepted: true });
  };

  rejectIncoming = (): void => {
    const inc = this.state.incomingCall;
    if (!inc) return;
    this.sendWs({ type: 'call_answer', to: inc.fromUserId, callId: inc.callId, accepted: false });
    if (inc.callId) this.postSignal(inc.callId, 'hangup', {});
    this.finish('declined', false);
  };

  cancelOutgoing = (): void => {
    const rId = this.callIdRef;
    const peer = this.peerIdRef;
    if (rId && peer) this.sendWs({ type: 'call_cancel', to: peer, callId: rId });
    if (rId) this.postSignal(rId, 'hangup', {});
    this.finish('cancelled');
  };

  hangUp = (): void => {
    const rId = this.callIdRef;
    const peer = this.peerIdRef;
    if (rId) this.postSignal(rId, 'hangup', {});
    if (rId && peer) this.sendWs({ type: 'call_end', to: peer, callId: rId });
    const wasConnected = this.state.phase === 'connected';
    // Caller logs the terminal disposition (exactly one /api/calls record per
    // call); the callee's hang-up is logged by the caller via handleRemoteHangup.
    this.finish(wasConnected ? 'completed' : this.isCallerRef ? 'cancelled' : 'missed');
  };

  /** Dismiss the ended-state overlay after a call has finished. */
  dismissEnded = (): void => {
    if (this.state.phase === 'ended') {
      this.resetRoomState();
      this.state.phase = 'idle';
      this.emit();
    }
  };

  /**
   * Incoming offer via WS ring (the callee side).
   *
   * If this user is already in a call the offer is auto-declined (Tinode
   * 486 / USER_BUSY). Because both peers derive the same deterministic callId,
   * a simultaneous dial converges on one signal room and only the non-busy
   * side answers; the busy side's auto-decline resolves the glare.
   */
  onIncomingOffer = (incoming: IncomingCall): void => {
    if (this.state.phase !== 'idle' && this.state.phase !== 'ended') {
      // Busy — auto-decline (Tinode 486 / USER_BUSY).
      this.sendWs({ type: 'call_answer', to: incoming.fromUserId, callId: incoming.callId, accepted: false });
      if (incoming.callId) this.postSignal(incoming.callId, 'hangup', {});
      return;
    }
    this.isCallerRef = false;
    this.isInitiatorRef = false;
    this.state.incomingCall = incoming;
    this.state.callType = incoming.callType;
    this.state.callId = incoming.callId;
    this.state.phase = 'ringing';
    this.callIdRef = incoming.callId;
    this.peerIdRef = incoming.fromUserId;
    this.roomIdRef = incoming.callId;
    this.startRingTimer();
    this.sendWs({ type: 'call_ringing', to: incoming.fromUserId, callId: incoming.callId });
    this.emit();
  };

  /** Callee's answer arrives on the caller's WS ring. */
  onAnswer = (accepted: boolean, answeredCallId: string): void => {
    if (this.callIdRef !== answeredCallId) return;
    if (accepted) {
      this.state.phase = 'connecting';
      this.startConnectTimer();
      this.emit();
    } else {
      this.finish('declined');
    }
  };

  /** Remote end (call_cancel / call_end) on the WS ring. */
  onRemoteEnd = (): void => {
    if (this.endedRef) return;
    const wasConnected = this.state.phase === 'connected';
    if (wasConnected) {
      this.finish('completed');
    } else {
      this.finish(this.isCallerRef ? 'missed' : 'cancelled', this.isCallerRef && this.mode === 'chat');
    }
  };

  onBusy = (): void => {
    if (this.endedRef) return;
    this.toast('User is busy in another call');
    this.finish('busy');
  };

  toggleMute = (): void => {
    const track = this.localStreamRef?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    this.state.isMuted = !track.enabled;
    this.emit();
  };

  toggleCamera = (): void => {
    const track = this.localStreamRef?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    this.state.isCameraOff = !track.enabled;
    this.emit();
  };

  /** Switch a device mid-call via replaceTrack (Jitsi) — no renegotiation. */
  switchDevice = async (kind: 'audio' | 'video', deviceId: string): Promise<void> => {
    if (!this.pcRef) return;
    const acq = await acquireMedia({
      audio: kind === 'audio',
      video: kind === 'video',
      videoConstraints: kind === 'video' ? { deviceId: { exact: deviceId } } : undefined,
    });
    if (!acq.stream) return;
    const ok = await replaceTrack(this.pcRef, kind, acq.stream);
    if (ok && this.localStreamRef) {
      const old = this.localStreamRef.getTracks().find((t) => t.kind === kind);
      if (old) {
        this.localStreamRef.removeTrack(old);
        try {
          old.stop();
        } catch (e) {
          /* ignore */
        }
      }
      const fresh = acq.stream.getTracks().find((t) => t.kind === kind);
      if (fresh) this.localStreamRef.addTrack(fresh);
      this.emit();
    }
  };

  // ── MEET API ──────────────────────────────────────────────────────────────

  startSearch = async (interests: string[] = []): Promise<void> => {
    if (
      this.state.phase === 'searching' ||
      this.state.phase === 'connecting' ||
      this.state.phase === 'connected' ||
      this.state.phase === 'cooldown'
    ) {
      return;
    }
    this.closePeerConnection();
    this.clearRoomTimers();
    this.endedRef = false;
    this.state.localStream = this.localStreamRef;
    this.state.phase = 'searching';
    this.state.stranger = null;
    this.state.roomId = null;
    this.state.messages = [];
    this.state.mediaError = null;
    this.emit();

    if (!this.localStreamRef) {
      const acq = await acquireMedia({
        audio: true,
        video: true,
        videoConstraints: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (acq.stream) {
        this.localStreamRef = acq.stream;
        this.state.localStream = acq.stream;
      } else {
        this.state.mediaError = normalizeMediaError(acq.mediaError) ?? 'audio';
      }
      if (acq.mediaError === 'video' && acq.stream) {
        this.state.mediaError = 'video';
        this.toast('⚠️ Camera unavailable — continuing with mic + limited video');
      } else if (!acq.stream) {
        this.toast('⚠️ Camera/mic unavailable — you can still chat after matching');
      }
    }

    this.currentInterests = interests;
    this.pollMatchmaking();
    this.matchTimerRef = setInterval(() => this.pollMatchmaking(), MATCH_POLL_MS);
  };

  private pollMatchmaking = async (): Promise<void> => {
    try {
      const res = await fetch('/api/meet/match', {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ interests: this.currentInterests }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'connected') {
        this.clearMatchPoll();
        const peerInfo: StrangerProfile = {
          id: data.peer.id,
          displayName: data.peer.name || 'Stranger',
          interests: data.peer.interests || [],
          avatarUrl: data.peer.avatarUrl || '',
        };
        const mine = new Set(this.currentInterests.map((i) => String(i).toLowerCase()));
        const shared = (data.peer.interests || []).filter((i: string) => mine.has(String(i).toLowerCase()));
        this.state.roomId = data.roomId;
        this.state.stranger = peerInfo;
        this.state.sharedInterests = shared;
        this.state.messages = [
          {
            id: `sys-${Date.now()}`,
            text: `Connected to ${peerInfo.displayName}. ${
              shared.length > 0 ? `Shared interests: ${shared.join(', ')}` : 'You can start talking now.'
            }`,
            displayName: 'System',
            timestamp: Date.now(),
            fromSelf: false,
            isSystem: true,
          },
        ];
        this.lastMessageCount = 1;
        this.state.phase = 'connecting';
        this.emit();
        this.toast(`🎉 Connected with ${peerInfo.displayName}! Say hi!`);
        this.startRoomPolls(data.roomId, data.peer.id);
      }
    } catch (e) {
      console.error('matchmaking poll error:', e);
    }
  };

  private startRoomPolls(roomId: string, peerId: string): void {
    this.clearSignalPoll();
    this.clearMessagePoll();
    this.clearSecondsTimer();
    this.messageTimerRef = setInterval(() => this.pollMessages(roomId), MEET_MESSAGE_POLL_MS);
    this.signalTimerRef = setInterval(() => this.pollSignals(roomId), MEET_SIGNAL_POLL_MS);
    this.lastSignalTimeRef = 0;
    this.roomIdRef = roomId;
    this.peerIdRef = peerId;
    this.isInitiatorRef = this.currentUser ? this.currentUser.id.localeCompare(peerId) < 0 : false;
    this.initMeetWebRTC(roomId);
    this.startConnectTimer();
  }

  private async initMeetWebRTC(roomId: string): Promise<void> {
    try {
      const pc = new RTCPeerConnection(getRTCConfiguration());
      this.pcRef = pc;

      wireRemoteStream(pc, (merged) => {
        this.state.remoteStream = merged;
        this.state.remoteConnected = true;
        this.emit();
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && this.roomIdRef) {
          this.postSignal(this.roomIdRef, 'candidate', event.candidate.toJSON());
        }
      };

      pc.onnegotiationneeded = async () => {
        const rid = this.roomIdRef;
        if (!this.isInitiatorRef || !rid || this.negotiatingRef) return;
        this.negotiatingRef = true;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await this.postSignal(rid, 'offer', offer);
        } catch (e) {
          console.warn('meet negotiation failed:', e);
        } finally {
          this.negotiatingRef = false;
        }
      };

      pc.onconnectionstatechange = () => this.handleConnectionState(pc);

      if (this.localStreamRef && this.localStreamRef.getTracks().length > 0) {
        this.localStreamRef.getTracks().forEach((t) => pc.addTrack(t, this.localStreamRef!));
      } else {
        // Camera/mic denied — receive-only transceivers (limited fallback).
        try {
          pc.addTransceiver('video', { direction: 'recvonly' });
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch (e) {
          console.warn('recvonly transceiver note:', e);
        }
      }
      // The initiator's initial offer is sent by the onnegotiationneeded
      // handler after addTrack/addTransceiver (single negotiation path).
    } catch (e) {
      console.error('meet WebRTC init error:', e);
      this.finish('failed', false);
    }
  }

  sendMessage = async (text: string): Promise<void> => {
    if (!text.trim() || !this.state.roomId) return;
    try {
      await fetch(`/api/meet/room/${encodeURIComponent(this.state.roomId)}/message`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ text: text.trim() }),
      });
      await this.pollMessages(this.state.roomId);
    } catch (e) {
      console.error('Failed to send text:', e);
    }
  };

  skipMatch = async (): Promise<void> => {
    const now = Date.now();
    const since = now - this.lastSkipTimeRef;
    this.lastSkipTimeRef = now;
    this.consecutiveSkipsRef = since < SKIP_WINDOW_MS ? this.consecutiveSkipsRef + 1 : 1;

    if (this.consecutiveSkipsRef >= SKIP_THRESHOLD) {
      this.consecutiveSkipsRef = 0;
      this.triggerCooldown(SKIP_COOLDOWN_S);
      return;
    }

    if (this.roomIdRef) this.postSignal(this.roomIdRef, 'hangup', {});
    try {
      await fetch('/api/meet/leave', {
        method: 'POST',
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
    } catch (e) {
      /* ignore */
    }
    this.cleanupMeetRoom();
    this.toast('⏩ Skipping to next stranger...');
    this.startSearch(this.currentInterests);
  };

  stopCall = async (): Promise<void> => {
    this.clearMatchPoll();
    this.clearSignalPoll();
    this.clearMessagePoll();
    this.clearConnectTimer();
    if (this.roomIdRef) this.postSignal(this.roomIdRef, 'hangup', {});
    try {
      await fetch('/api/meet/leave', {
        method: 'POST',
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
    } catch (e) {
      /* ignore */
    }
    this.closePeerConnection();
    this.clearRoomTimers();
    this.stopLocalTracks();
    this.state.localStream = null;
    this.state.remoteStream = null;
    this.state.remoteConnected = false;
    this.state.roomId = null;
    this.state.stranger = null;
    this.state.messages = [];
    this.state.phase = 'idle';
    this.resetRoomState();
    this.emit();
    this.toast('⏹️ Call disconnected.');
  };

  private triggerCooldown(seconds: number): void {
    this.clearMatchPoll();
    this.clearSignalPoll();
    this.clearMessagePoll();
    this.closePeerConnection();
    this.state.phase = 'cooldown';
    this.state.cooldownSeconds = seconds;
    this.emit();
    this.toast(`⏳ Anti-Spam Filter: Please wait ${seconds} seconds before matching again.`);
    if (this.cooldownTimerRef) clearInterval(this.cooldownTimerRef);
    this.cooldownTimerRef = setInterval(() => {
      this.state.cooldownSeconds -= 1;
      if (this.state.cooldownSeconds <= 0) {
        clearInterval(this.cooldownTimerRef!);
        this.cooldownTimerRef = null;
        this.state.phase = 'idle';
        this.emit();
        return;
      }
      this.emit();
    }, 1000);
  }

  // meet UI state setters
  setIsVideoConsented = (v: boolean): void => {
    this.state.isVideoConsented = v;
    this.emit();
  };

  setIsChatOpen = (v: boolean): void => {
    this.state.isChatOpen = v;
    if (v) this.state.unreadCount = 0;
    this.emit();
  };

  setUnreadCount = (n: number): void => {
    this.state.unreadCount = Math.max(0, n);
    this.emit();
  };

  dispose(): void {
    this.clearRoomTimers();
    this.closePeerConnection();
    this.stopLocalTracks();
  }
}
