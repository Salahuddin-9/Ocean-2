import { useCallback, useEffect, useRef, useState } from 'react';
import { getRTCConfiguration } from '../lib/rtcConfig';

/**
 * P2PCall — a keyless WebRTC audio/video call hook.
 *
 * Used as the built-in fallback for 1:1 chat calls when Stream Video is not
 * configured (no STREAM_API_KEY). It reuses the exact signalling pattern that
 * already powers the working "Meet" random-video-chat feature:
 *   - Media + SDP/ICE are exchanged through the REST relay
 *     `/api/meet/room/:id/signal` + `/api/meet/room/:id/signals` (auth via JWT).
 *   - The lightweight "ring" (call_offer / call_answer / call_cancel / call_end)
 *     is relayed over the existing `/ws/chat` WebSocket by chatServer.ts.
 *
 * ICE servers come from the shared rtcConfig (tinode-style): public STUN by
 * default, plus an optional VITE_TURN_URL server for strict-NAT connectivity.
 */

export type P2PCallStatus = 'idle' | 'outgoing' | 'ringing' | 'connected' | 'ended';

export interface P2PIncomingCall {
  callId: string;
  fromUserId: string;
  fromName: string;
  callType: 'audio' | 'video';
}

interface UseP2PCallOptions {
  currentUser: { id: string; name: string; avatarUrl?: string } | null;
  token?: string | null;
  /** Sends an event to the chat WebSocket (call_offer / call_answer / ...). */
  sendWsEvent?: (msg: any) => void;
}

const ICE_CONFIG: RTCConfiguration = getRTCConfiguration();

const POLL_INTERVAL_MS = 700;

// Call establishment timeout (ported from chat-master/tinode calls.go's
// `callEstablishmentTimeout`): if the callee never answers, the caller
// auto-cancels and the callee auto-declines instead of ringing forever.
const CALL_ESTABLISHMENT_TIMEOUT_MS = 45_000;

function buildCallId(a: string, b: string): string {
  return `call-${[a, b].sort().join('-')}`;
}

export function useP2PCall({ currentUser, token, sendWsEvent }: UseP2PCallOptions) {
  const [status, setStatus] = useState<P2PCallStatus>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [peerUserId, setPeerUserId] = useState<string | null>(null);
  const [peerName, setPeerName] = useState('');
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  const [incomingCall, setIncomingCall] = useState<P2PIncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [iceState, setIceState] = useState<RTCIceConnectionState | 'new'>('new');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pollTimerRef = useRef<any>(null);
  const lastSignalTimeRef = useRef(0);
  const callIdRef = useRef<string | null>(null);
  const callSecondsTimerRef = useRef<any>(null);
  const endedRef = useRef(false);
  const iceRecoveryTimerRef = useRef<any>(null);
  const iceRestartCountRef = useRef(0);
  const needIceRestartRef = useRef(false);

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
    if (callSecondsTimerRef.current) clearInterval(callSecondsTimerRef.current);
    callSecondsTimerRef.current = null;
    if (iceRecoveryTimerRef.current) clearTimeout(iceRecoveryTimerRef.current);
    iceRecoveryTimerRef.current = null;
    iceRestartCountRef.current = 0;
    needIceRestartRef.current = false;
  }, []);

  const stopLocalTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, []);

  const cleanupCall = useCallback(() => {
    endedRef.current = true;
    clearTimers();
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {
        /* ignore */
      }
      pcRef.current = null;
    }
    stopLocalTracks();
    setLocalStream(null);
    setRemoteStream(null);
    setCallSeconds(0);
    setIceState('new');
    setStatus('idle');
    setCallId(null);
    setPeerUserId(null);
    setPeerName('');
    setIncomingCall(null);
    callIdRef.current = null;
  }, [clearTimers, stopLocalTracks]);

  // Attach remote tracks to a MediaStream so <video> can render them.
  const wireRemoteStream = useCallback((pc: RTCPeerConnection) => {
    const stream = new MediaStream();
    pc.getReceivers().forEach((r) => {
      if (r.track) stream.addTrack(r.track);
    });
    pc.ontrack = (event) => {
      event.streams.forEach((s) => {
        setRemoteStream((prev) => {
          if (!prev) return s;
          // Merge any new tracks into the existing stream (prevents flicker).
          const merged = new MediaStream();
          prev.getTracks().forEach((t) => merged.addTrack(t));
          s.getTracks().forEach((t) => {
            if (!merged.getTracks().some((mt) => mt.id === t.id)) merged.addTrack(t);
          });
          return merged;
        });
      });
    };
    if (stream.getTracks().length > 0) setRemoteStream(stream);
  }, []);

  const postSignal = useCallback(async (rId: string, type: string, payload: any) => {
    try {
      await fetch(`/api/meet/room/${rId}/signal`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type, payload }),
      });
    } catch (e) {
      console.warn('P2P signal post failed:', e);
    }
  }, [authHeaders]);

  const pollSignals = useCallback(async (rId: string) => {
    try {
      const res = await fetch(`/api/meet/room/${rId}/signals?lastTimestamp=${lastSignalTimeRef.current}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!res.ok) return;
      const data = await res.json();

      for (const signal of data.signals || []) {
        if (signal.timestamp > lastSignalTimeRef.current) {
          lastSignalTimeRef.current = signal.timestamp;
        }
        if (signal.senderId === currentUser?.id) continue;

        const pc = pcRef.current;
        if (!pc) continue;

        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await postSignal(rId, 'answer', answer);
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        } else if (signal.type === 'candidate') {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
          } catch (e) {
            console.error('P2P addIceCandidate error:', e);
          }
        } else if (signal.type === 'hangup') {
          handleRemoteHangup();
        }
      }
    } catch (e) {
      console.warn('P2P signal poll error:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, token, postSignal]);

  const startPolling = useCallback((rId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      pollSignals(rId);
    }, POLL_INTERVAL_MS);
  }, [pollSignals]);

  const startCallSecondsTimer = useCallback(() => {
    if (callSecondsTimerRef.current) clearInterval(callSecondsTimerRef.current);
    setCallSeconds(0);
    callSecondsTimerRef.current = setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
  }, []);

  const handleRemoteHangup = useCallback(() => {
    if (endedRef.current) return;
    cleanupCall();
    setStatus('ended');
  }, [cleanupCall]);

  /**
   * ICE recovery (Phase 5): after a transient disconnect/failure, wait a grace
   * period, then restart ICE (renegotiate with fresh credentials). Gives up
   * after two restarts to avoid an endless reconnect loop.
   */
  const scheduleIceRecovery = useCallback((pc: RTCPeerConnection, delayMs: number, reason: string) => {
    if (endedRef.current) return;
    if (iceRecoveryTimerRef.current) return; // one recovery at a time
    iceRecoveryTimerRef.current = setTimeout(() => {
      iceRecoveryTimerRef.current = null;
      if (endedRef.current || !pcRef.current || pcRef.current !== pc) return;
      if (iceRestartCountRef.current >= 2) {
        console.warn(`P2P: giving up after ${iceRestartCountRef.current} ICE restarts (${reason})`);
        handleRemoteHangup();
        return;
      }
      iceRestartCountRef.current += 1;
      console.warn(`P2P: connection ${reason} — restarting ICE (attempt ${iceRestartCountRef.current})`);
      needIceRestartRef.current = true;
      try {
        pc.restartIce();
      } catch (e) {
        // Engines without restartIce(): force negotiation manually.
        try {
          (pc.onnegotiationneeded as unknown as (() => void) | null)?.();
        } catch (e2) { console.error('P2P ICE restart failed:', e2); }
      }
      // If the link is still dead after the restart grace period, end the call.
      setTimeout(() => {
        if (!endedRef.current && pcRef.current === pc &&
            (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed' || pc.connectionState === 'disconnected')) {
          handleRemoteHangup();
        }
      }, 8000);
    }, delayMs);
  }, [handleRemoteHangup]);

  const initPeerConnection = useCallback(async (video: boolean) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;
    wireRemoteStream(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        postSignal(callIdRef.current, 'candidate', event.candidate.toJSON());
      }
    };

    // Connection + ICE monitoring with automatic recovery (Phase 5).
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        iceRestartCountRef.current = 0;
        if (iceRecoveryTimerRef.current) { clearTimeout(iceRecoveryTimerRef.current); iceRecoveryTimerRef.current = null; }
      } else if (pc.connectionState === 'disconnected') {
        scheduleIceRecovery(pc, 5000, 'disconnected');
      } else if (pc.connectionState === 'failed') {
        scheduleIceRecovery(pc, 1200, 'failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceState(pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        scheduleIceRecovery(pc, 1500, 'ice-failed');
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        iceRestartCountRef.current = 0;
        if (iceRecoveryTimerRef.current) { clearTimeout(iceRecoveryTimerRef.current); iceRecoveryTimerRef.current = null; }
      }
    };

    // Renegotiation (used by ICE-restart recovery): sends a fresh offer with
    // new ICE credentials through the same signal relay the call uses.
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer(needIceRestartRef.current ? { iceRestart: true } : undefined);
        needIceRestartRef.current = false;
        await pc.setLocalDescription(offer);
        if (callIdRef.current) {
          await postSignal(callIdRef.current, 'offer', offer);
        }
      } catch (e) {
        console.warn('P2P renegotiation failed:', e);
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        video ? { audio: true, video: { width: 1280, height: 720 } } : { audio: true, video: false }
      );
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      localStreamRef.current = stream;
      setLocalStream(stream);
      return pc;
    } catch (err) {
      console.error('P2P getUserMedia failed:', err);
      return null;
    }
  }, [postSignal, wireRemoteStream, handleRemoteHangup]);

  /**
   * Caller: initiate a call to targetUserId.
   * Sets up media + peer connection, posts the SDP offer, and pings the target
   * over WebSocket so their IncomingCallPopup rings.
   */
  const startOutgoingCall = useCallback(async (targetUserId: string, video: 'audio' | 'video') => {
    if (!currentUser || !targetUserId) return;
    cleanupCall();
    endedRef.current = false;

    const rId = buildCallId(currentUser.id, targetUserId);
    callIdRef.current = rId;
    setCallId(rId);
    setPeerUserId(targetUserId);
    setCallType(video);
    setStatus('outgoing');

    const pc = await initPeerConnection(video === 'video');
    if (!pc) {
      setStatus('ended');
      return;
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postSignal(rId, 'offer', offer);
    lastSignalTimeRef.current = 0;
    startPolling(rId);

    sendWsEvent?.({
      type: 'call_offer',
      to: targetUserId,
      callId: rId,
      callType: video,
      fromName: currentUser.name || 'User',
    });
  }, [currentUser, cleanupCall, initPeerConnection, postSignal, sendWsEvent, startPolling]);

  /**
   * Callee: accept the incoming call. The caller's SDP offer is already in the
   * signal store; we answer it once the poll picks it up.
   */
  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall || !currentUser) return;
    endedRef.current = false;

    const rId = incomingCall.callId;
    callIdRef.current = rId;
    setCallId(rId);
    setPeerUserId(incomingCall.fromUserId);
    setPeerName(incomingCall.fromName);
    setCallType(incomingCall.callType);
    setStatus('connected');
    setIncomingCall(null);

    const pc = await initPeerConnection(incomingCall.callType === 'video');
    if (!pc) {
      cleanupCall();
      setStatus('ended');
      return;
    }
    lastSignalTimeRef.current = 0;
    startPolling(rId);
    startCallSecondsTimer();

    sendWsEvent?.({ type: 'call_answer', to: incomingCall.fromUserId, callId: rId, accepted: true });
  }, [incomingCall, currentUser, initPeerConnection, startPolling, startCallSecondsTimer, sendWsEvent, cleanupCall]);

  const rejectIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    sendWsEvent?.({ type: 'call_answer', to: incomingCall.fromUserId, callId: incomingCall.callId, accepted: false });
    setIncomingCall(null);
    // Reset from 'ringing' so the full-screen ringing overlay doesn't persist
    // after the callee declines.
    setStatus('idle');
  }, [incomingCall, sendWsEvent]);

  const cancelOutgoingCall = useCallback(() => {
    const rId = callIdRef.current;
    const peer = peerUserId;
    cleanupCall();
    setStatus('ended');
    if (rId && peer) {
      sendWsEvent?.({ type: 'call_cancel', to: peer, callId: rId });
    }
  }, [cleanupCall, peerUserId, sendWsEvent]);

  const hangUp = useCallback(() => {
    const rId = callIdRef.current;
    const peer = peerUserId;
    if (rId) postSignal(rId, 'hangup', {});
    cleanupCall();
    setStatus('ended');
    if (rId && peer) {
      sendWsEvent?.({ type: 'call_end', to: peer, callId: rId });
    }
  }, [cleanupCall, peerUserId, postSignal, sendWsEvent]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOff(!videoTrack.enabled);
    }
  }, []);

  /** Callee: an incoming call_offer arrived over the WS. */
  const onIncomingOffer = useCallback((call: P2PIncomingCall) => {
    if (status !== 'idle' && status !== 'ended') {
      // Busy — automatically decline.
      sendWsEvent?.({ type: 'call_answer', to: call.fromUserId, callId: call.callId, accepted: false });
      return;
    }
    setIncomingCall(call);
    setStatus('ringing');
  }, [status, sendWsEvent]);

  /** Caller: the target answered / declined. */
  const onAnswer = useCallback((accepted: boolean, answeredCallId: string) => {
    if (callIdRef.current !== answeredCallId) return;
    if (accepted) {
      setStatus('connected');
      startCallSecondsTimer();
    } else {
      cleanupCall();
      setStatus('ended');
    }
  }, [cleanupCall, startCallSecondsTimer]);

  /** Caller: the target cancelled/left before answering. */
  const onCancelOrEnd = useCallback(() => {
    if (endedRef.current) return;
    cleanupCall();
    setStatus('ended');
  }, [cleanupCall]);

  // Auto-cancel an unanswered outgoing call (tinode callEstablishmentTimeout).
  useEffect(() => {
    if (status !== 'outgoing') return;
    const t = setTimeout(() => {
      if (callIdRef.current && peerUserId) {
        sendWsEvent?.({ type: 'call_cancel', to: peerUserId, callId: callIdRef.current });
      }
      cleanupCall();
      setStatus('ended');
    }, CALL_ESTABLISHMENT_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Auto-decline a ringing incoming call that was never answered.
  useEffect(() => {
    if (status !== 'ringing' || !incomingCall) return;
    const t = setTimeout(() => {
      sendWsEvent?.({ type: 'call_answer', to: incomingCall.fromUserId, callId: incomingCall.callId, accepted: false });
      setIncomingCall(null);
      setStatus('idle');
    }, CALL_ESTABLISHMENT_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, incomingCall]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {
          /* ignore */
        }
      }
      stopLocalTracks();
    };
  }, [clearTimers, stopLocalTracks]);

  return {
    status,
    callId,
    peerUserId,
    peerName,
    callType,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    callSeconds,
    iceState,
    startOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    cancelOutgoingCall,
    hangUp,
    toggleMute,
    toggleCamera,
    onIncomingOffer,
    onAnswer,
    onCancelOrEnd,
    handleRemoteHangup,
  };
}
