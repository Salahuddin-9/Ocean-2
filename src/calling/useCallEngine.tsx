/**
 * useCallEngine.tsx — React bridge over the framework-agnostic CallEngine.
 *
 * Exposes two entry points:
 *   1. CallEngineProvider (mounted once at the App root) — owns the CHAT engine
 *      (audio + video 1:1 calls), the shared /ws/chat ring socket, ringtone
 *      playback, and renders the incoming-call popup + active-call screen.
 *      Consumers reach it via useCallEngineContext() (e.g. StartCallButton).
 *   2. useCallEngine(...) — a standalone hook for the MEET (video-only random
 *      video call) flow, used by OmegleRandomVideoCall with a JSX-identical
 *      return shape to the old useRandomVideoCall.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { CallEngine, createDefaultState, EngineState } from './callEngine';
import { openRingSocket } from './ringSocket';
import { attachToElement } from './media';
import { AudioService } from '../audioService';
import ActiveCallScreen from './ActiveCallScreen';
import IncomingCallPopup from './IncomingCallPopup';
import type { CallType, IncomingCall, CallPhase, CallMode } from './types';

// ── Provider context (chat) ─────────────────────────────────────────────────

export interface CallEngineContextValue {
  startCall: (targetUserId: string, callType?: CallType, peerName?: string) => Promise<void>;
  endCall: () => void;
  phase: CallPhase;
  callId: string | null;
  incomingCall: IncomingCall | null;
}

const CallEngineContext = createContext<CallEngineContextValue | null>(null);

export function useCallEngineContext(): CallEngineContextValue | null {
  return useContext(CallEngineContext);
}

interface CallEngineProviderProps {
  user: { id: string; name: string; avatarUrl?: string } | null;
  token?: string | null;
  onToast?: (msg: string) => void;
  children: ReactNode;
}

export function CallEngineProvider({ user, token, onToast, children }: CallEngineProviderProps) {
  const [state, setState] = useState<EngineState>(() => createDefaultState());
  const engineRef = useRef<CallEngine | null>(null);

  // Create the chat engine once auth is available.
  if (!engineRef.current && user && token) {
    engineRef.current = new CallEngine({
      currentUser: user,
      token,
      mode: 'chat',
      onState: (s) => setState(s),
      onToast,
    });
  }

  // Keep session in sync as auth hydrates/refreshes. Dispose on unmount only.
  useEffect(() => {
    if (user && token) {
      if (!engineRef.current) {
        engineRef.current = new CallEngine({
          currentUser: user,
          token,
          mode: 'chat',
          onState: (s) => setState(s),
          onToast,
        });
      } else {
        engineRef.current.setSession(user, token);
      }
    }
  }, [user, token]);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Shared /ws/chat ring socket — routes ring events to the engine.
  useEffect(() => {
    if (!user || !token) return;
    const engine = engineRef.current;
    if (!engine) return;

    const handle = openRingSocket({
      token,
      userId: user.id,
      name: user.name || 'User',
      onEvent: (data) => {
        try {
          if (!data || typeof data.type !== 'string') return;
          if (data.fromUserId === user.id) return; // ignore self-relayed events
          const st = engine.getState();
          switch (data.type) {
            case 'call_offer': {
              const busy = st.phase !== 'idle' && st.phase !== 'ended';
              if (!busy) AudioService.playRisingChime();
              engine.onIncomingOffer({
                callId: data.callId,
                fromUserId: data.fromUserId,
                fromName: data.fromName || 'User',
                callType: data.callType === 'video' ? 'video' : 'audio',
              });
              break;
            }
            case 'call_ringing':
              if (st.phase === 'outgoing' && st.callId === data.callId) {
                AudioService.playRisingChime(); // ringback once the callee acks
              }
              break;
            case 'call_answer':
              if (st.callId === data.callId) engine.onAnswer(!!data.accepted, data.callId);
              break;
            case 'call_cancel':
            case 'call_end':
              if (st.callId === data.callId) engine.onRemoteEnd();
              break;
            case 'call_busy':
              if (st.callId === data.callId) engine.onBusy();
              break;
            case 'call_unreachable':
              if (st.callId === data.callId) engine.onUnreachable();
              break;
          }
        } catch (e) {
          console.warn('ring event handler error:', e);
        }
      },
    });
    // CRITICAL: give the engine the socket so its OUTGOING ring events
    // (call_offer / call_ringing / call_answer / ...) actually leave the tab.
    // Without this, sendWs() no-ops and the callee never rings — chat calls
    // could never establish even though the socket itself was open.
    engine.setRingSocket(handle);
    return () => {
      engine.setRingSocket(null);
      handle.close();
    };
  }, [user, token]);

  const value = useMemo<CallEngineContextValue>(() => {
    const engine = engineRef.current;
    return {
      startCall: async (targetUserId: string, callType: CallType = 'audio', peerName?: string) => {
        await engine?.startCall(targetUserId, callType, peerName);
      },
      endCall: () => engine?.hangUp(),
      phase: state.phase,
      callId: state.callId,
      incomingCall: state.incomingCall,
    };
  }, [state.phase, state.callId, state.incomingCall]);

  const engine = engineRef.current;
  const chatActive =
    !!state.callId && ['outgoing', 'connecting', 'connected', 'ending', 'ended'].includes(state.phase);

  return (
    <CallEngineContext.Provider value={value}>
      {children}

      {state.phase === 'ringing' && state.incomingCall && engine && (
        <IncomingCallPopup
          callerName={state.incomingCall.fromName}
          callType={state.incomingCall.callType}
          onAccept={() => void engine.acceptIncoming()}
          onReject={() => engine.rejectIncoming()}
        />
      )}

      {chatActive && engine && (
        <ActiveCallScreen
          phase={state.phase}
          callType={state.callType}
          peerName={state.peer?.name || 'Call'}
          localStream={state.localStream}
          remoteStream={state.remoteStream}
          remoteConnected={state.remoteConnected}
          isMuted={state.isMuted}
          isCameraOff={state.isCameraOff}
          callSeconds={state.callSeconds}
          mediaError={state.mediaError}
          connectionQuality={state.connectionQuality}
          disposition={state.disposition}
          onAccept={() => void engine.acceptIncoming()}
          onReject={() => engine.rejectIncoming()}
          onCancel={() => engine.cancelOutgoing()}
          onHangUp={() => engine.hangUp()}
          onClose={() => engine.dismissEnded()}
          onMute={() => engine.toggleMute()}
          onToggleCamera={() => engine.toggleCamera()}
          onSwitchDevice={(kind, deviceId) => void engine.switchDevice(kind, deviceId)}
        />
      )}
    </CallEngineContext.Provider>
  );
}

// ── Standalone hook (meet) ──────────────────────────────────────────────────

export interface UseCallEngineOptions {
  currentUser: { id: string; name: string; avatarUrl?: string } | null;
  token?: string | null;
  interests?: string[];
  mode?: CallMode;
  onToast?: (msg: string) => void;
  ws?: ReturnType<typeof openRingSocket> | null;
}

export function useCallEngine({
  currentUser,
  token,
  interests = [],
  mode = 'meet',
  onToast,
  ws = null,
}: UseCallEngineOptions) {
  const [state, setState] = useState<EngineState>(() => createDefaultState());
  const engineRef = useRef<CallEngine | null>(null);
  const interestsRef = useRef<string[]>(interests);

  if (!engineRef.current) {
    engineRef.current = new CallEngine({
      currentUser,
      token,
      mode,
      ws,
      onState: (s) => setState(s),
      onToast,
    });
  }
  const engine = engineRef.current;

  useEffect(() => {
    engine.setSession(currentUser, token);
  }, [currentUser, token, engine]);

  useEffect(() => {
    interestsRef.current = interests;
  }, [interests]);

  useEffect(() => {
    return () => engine.dispose();
  }, [engine]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // Meet's <video> elements only mount when the phase becomes 'connected', but
  // the remote tracks can arrive while still 'connecting' (ontrack fires on
  // answer). Keying on [stream] alone would no-op against a null ref and never
  // re-run after the element mounts → blank remote video. Including `phase`
  // makes the attach re-run exactly when the elements appear.
  useEffect(() => {
    attachToElement(localVideoRef.current, state.localStream);
  }, [state.localStream, state.phase]);
  useEffect(() => {
    attachToElement(remoteVideoRef.current, state.remoteStream);
  }, [state.remoteStream, state.phase]);

  const startSearch = useCallback(() => {
    void engine.startSearch(interestsRef.current);
  }, [engine]);

  return {
    status: state.phase,
    stranger: state.stranger,
    sharedInterests: state.sharedInterests,
    roomId: state.roomId,
    isMuted: state.isMuted,
    isCameraOff: state.isCameraOff,
    isVideoConsented: state.isVideoConsented,
    setIsVideoConsented: engine.setIsVideoConsented,
    localStream: state.localStream,
    remoteStreamConnected: state.remoteConnected,
    messages: state.messages,
    unreadCount: state.unreadCount,
    setUnreadCount: engine.setUnreadCount,
    isChatOpen: state.isChatOpen,
    setIsChatOpen: engine.setIsChatOpen,
    cooldownSeconds: state.cooldownSeconds,
    localVideoRef,
    remoteVideoRef,
    startSearch,
    skipMatch: engine.skipMatch,
    stopCall: engine.stopCall,
    sendMessage: engine.sendMessage,
    toggleMute: engine.toggleMute,
    toggleCamera: engine.toggleCamera,
  };
}
