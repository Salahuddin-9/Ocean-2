import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Send,
  Sparkles,
  MessageSquare,
  Users,
  AlertCircle,
  X,
  Lock,
} from 'lucide-react';
import { useMeetRoomMesh } from '../calling/useMeetRoomMesh';
import { attachToElement } from '../calling/media';
import {
  MATCH_POLL_MS,
  MEET_MESSAGE_POLL_MS,
  SKIP_THRESHOLD,
  SKIP_WINDOW_MS,
  SKIP_COOLDOWN_S,
} from '../calling/types';
import type { MeetPeer } from '../calling/meetRoomMesh';

export interface OmegleRandomVideoCallProps {
  currentUser: {
    id: string;
    name: string;
    avatarUrl?: string;
    countryCode?: string;
  } | null;
  interests?: string[];
  token?: string | null;
  onShowToast?: (msg: string) => void;
  onClose?: () => void;
}

interface MatchedPeer {
  id: string;
  name: string;
  location?: string;
  avatarUrl?: string;
  interests?: string[];
  sharedInterests?: string[];
}

interface RoomMessage {
  id: string;
  text: string;
  displayName: string;
  timestamp: number;
  fromSelf: boolean;
  isSystem?: boolean;
}

/**
 * OmegleRandomVideoCall — "Random Meet / Live Broadcast" room.
 *
 * 100% self-contained open-source WebRTC stack — no getstream.io keys, no
 * Jitsi, no external platform:
 *   - Media: navigator.mediaDevices.getUserMedia (real camera/mic).
 *   - Signaling: the standard SimpleWebRTC mesh over the app's own /ws/chat
 *     socket — 'join-room' → 'all-users' / 'user-connected' →
 *     'sending-signal' / 'returning-signal' (chatServer.ts).
 *   - ICE: getRTCConfiguration() — openrelay.metered.ca STUN + TURN + TURNS,
 *     so calls punch through strict 4G carrier NATs.
 *   - Rendering: native <video autoPlay playsInline> boxes — remote peers in
 *     a grid, local camera as a picture-in-picture box.
 *
 * Two ways in: random pairing via /api/meet/match, or a shared room code
 * (group calling — everyone who enters the same code joins the same mesh).
 */
export default function OmegleRandomVideoCall({
  currentUser,
  interests = ['Design', 'Music', 'Coding', 'Travel', 'Art'],
  token,
  onShowToast,
  onClose,
}: OmegleRandomVideoCallProps) {
  const [tagInput, setTagInput] = useState('');
  const [activeInterests, setActiveInterests] = useState<string[]>(interests);
  const [chatInput, setChatInput] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Local UI state (engine-independent)
  const [searching, setSearching] = useState(false);
  // Live waiting-count from /api/meet/queue-stats (feature #48).
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [stranger, setStranger] = useState<MatchedPeer | null>(null);
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const handleToast = (msg: string) => {
    if (onShowToast) onShowToast(msg);
  };

  // Mesh engine hook
  const {
    roomId,
    joined,
    localStream,
    peers,
    micOn,
    camOn,
    error,
    ensureCamera,
    joinRoom,
    toggleMute,
    toggleCamera,
    leaveRoom,
    stop,
    clearError,
  } = useMeetRoomMesh({
    currentUser: currentUser ? { id: currentUser.id, name: currentUser.name } : null,
    token,
    onToast: handleToast,
  });

  // Refs to avoid stale closures inside polling callbacks
  const activeInterestsRef = useRef(activeInterests);
  activeInterestsRef.current = activeInterests;
  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;
  const messagesRef = useRef<RoomMessage[]>([]);
  const strangerRef = useRef<MatchedPeer | null>(null);
  strangerRef.current = stranger;
  const lastCountRef = useRef(0);
  const lastSkipRef = useRef(0);
  const consecutiveSkipsRef = useRef(0);

  const matchPollRef = useRef<number | null>(null);
  const messagePollRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);

  // Live queue size while searching — polls /api/meet/queue-stats every 5s.
  useEffect(() => {
    if (!searching) return;
    let live = true;
    const pollQueue = async () => {
      try {
        const res = await fetch('/api/meet/queue-stats', { headers: authHeaders() });
        if (!res.ok) return;
        const d = await res.json();
        if (live && typeof d.queueLength === 'number') setQueueCount(d.queueLength);
      } catch {
        /* network blip — keep the last known count */
      }
    };
    pollQueue();
    const iv = setInterval(pollQueue, 5000);
    return () => { live = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  // Video element refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const peersRef = useRef<MeetPeer[]>([]);
  peersRef.current = peers;

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  // ── media rendering (native HTML5 <video>) ───────────────────────────────
  useEffect(() => {
    attachToElement(localVideoRef.current, localStream);
  }, [localStream]);

  const attachRemoteVideo = useCallback((userId: string) => (el: HTMLVideoElement | null) => {
    if (!el) {
      remoteVideoRefs.current.delete(userId);
      return;
    }
    remoteVideoRefs.current.set(userId, el);
    const peer = peersRef.current.find((p) => p.userId === userId);
    if (peer) attachToElement(el, peer.stream);
  }, []);

  // ── polling helpers ───────────────────────────────────────────────────────
  const stopMatchPolling = () => {
    if (matchPollRef.current) {
      clearInterval(matchPollRef.current);
      matchPollRef.current = null;
    }
  };

  const stopMessagePolling = () => {
    if (messagePollRef.current) {
      clearInterval(messagePollRef.current);
      messagePollRef.current = null;
    }
  };

  const startSearching = useCallback(async () => {
    setSearching(true);
    setStranger(null);
    setSharedInterests([]);
    setMessages([]);
    messagesRef.current = [];
    lastCountRef.current = 0;
    stopMatchPolling();

    const poll = async () => {
      try {
        const res = await fetch('/api/meet/match', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ interests: activeInterestsRef.current }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'connected' && data.roomId) {
          stopMatchPolling();
          setSearching(false);
          const peer: MatchedPeer = data.peer || {};
          setStranger(peer);
          setSharedInterests(peer.sharedInterests || []);
          const sys: RoomMessage = {
            id: `sys-${Date.now()}`,
            text: `Connected to ${peer.name || 'Stranger'}. ${
              (peer.sharedInterests || []).length > 0
                ? `Shared interests: ${peer.sharedInterests.join(', ')}`
                : 'You can start talking now.'
            }`,
            displayName: 'System',
            timestamp: Date.now(),
            fromSelf: false,
            isSystem: true,
          };
          messagesRef.current = [sys];
          setMessages([sys]);
          lastCountRef.current = 1;
          handleToast(`🎉 Connected with ${peer.name || 'a stranger'}! Say hi!`);
          await joinRoom(data.roomId);
        }
      } catch (e) {
        console.warn('matchmaking poll error:', e);
      }
    };

    await poll();
    matchPollRef.current = window.setInterval(poll, MATCH_POLL_MS);
  }, [joinRoom]);

  // ── actions (real stream initialization) ─────────────────────────────────
  const handleStart = async () => {
    if (cooldownSeconds > 0) return;
    clearError();
    const stream = await ensureCamera(); // actual getUserMedia
    if (!stream) return;
    await startSearching();
  };

  const handleRoomJoin = async () => {
    const code = roomCodeInput.trim();
    if (!code) {
      handleToast('Enter a room code first — friends join with the same code.');
      return;
    }
    if (cooldownSeconds > 0) return;
    clearError();
    const stream = await ensureCamera();
    if (!stream) return;
    stopMatchPolling();
    setSearching(false);
    setStranger(null);
    setSharedInterests([]);
    setMessages([]);
    messagesRef.current = [];
    lastCountRef.current = 0;
    handleToast(`🎥 Joined room "${code}" — share the code to invite others.`);
    await joinRoom(code);
  };

  const handleSkip = async () => {
    const now = Date.now();
    const since = now - lastSkipRef.current;
    lastSkipRef.current = now;
    consecutiveSkipsRef.current = since < SKIP_WINDOW_MS ? consecutiveSkipsRef.current + 1 : 1;

    if (consecutiveSkipsRef.current >= SKIP_THRESHOLD) {
      consecutiveSkipsRef.current = 0;
      startCooldown(SKIP_COOLDOWN_S);
      return;
    }

    // Leave the mesh room + the matchmaker queue, KEEP the camera for the next search.
    leaveRoom();
    try {
      await fetch('/api/meet/leave', { method: 'POST', headers: authHeaders() });
    } catch (e) {
      /* ignore */
    }
    setMessages([]);
    messagesRef.current = [];
    lastCountRef.current = 0;
    handleToast('⏩ Skipping to next stranger...');
    await startSearching();
  };

  const handleStop = async () => {
    stopMatchPolling();
    stopMessagePolling();
    stop(); // releases camera + closes peers
    try {
      await fetch('/api/meet/leave', { method: 'POST', headers: authHeaders() });
    } catch (e) {
      /* ignore */
    }
    setSearching(false);
    setStranger(null);
    setSharedInterests([]);
    setMessages([]);
    messagesRef.current = [];
    lastCountRef.current = 0;
    setCooldownSeconds(0);
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    handleToast('⏹️ Call disconnected.');
  };

  const startCooldown = (secs: number) => {
    stopMatchPolling();
    stopMessagePolling();
    leaveRoom();
    setSearching(false);
    setStranger(null);
    setCooldownSeconds(secs);
    handleToast(`⏳ Anti-Spam Filter: Please wait ${secs} seconds before matching again.`);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = window.setInterval(() => {
      setCooldownSeconds((s) => {
        if (s <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  // ── room chat (REST relay, same roomId as the mesh) ───────────────────────
  useEffect(() => {
    if (!joined || !roomId) {
      stopMessagePolling();
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(`/api/meet/room/${encodeURIComponent(roomId)}/messages`, {
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        const formatted: RoomMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id || `msg-${m.timestamp}`,
          text: m.text || '',
          displayName: m.senderId === currentUser?.id ? 'You' : strangerRef.current?.name || 'Stranger',
          timestamp: m.timestamp,
          fromSelf: m.senderId === currentUser?.id,
        }));
        const prev = messagesRef.current;
        // Keep the local "Connected to ..." system message until the first
        // real room message arrives (the server room list starts empty).
        const final = formatted.length > 0 ? formatted : prev;
        const changed =
          final.length !== prev.length || final.some((m, i) => m.text !== prev[i]?.text);
        messagesRef.current = final;
        if (changed) {
          setMessages(final);
          if (isChatOpenRef.current) {
            setUnreadCount(0);
          } else if (final.length > lastCountRef.current) {
            setUnreadCount((u) => u + (final.length - lastCountRef.current));
          }
          lastCountRef.current = final.length;
        }
      } catch (e) {
        /* ignore */
      }
    };
    poll();
    messagePollRef.current = window.setInterval(poll, MEET_MESSAGE_POLL_MS);
    return () => stopMessagePolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, roomId]);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      stopMatchPolling();
      stopMessagePolling();
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── interest tags ─────────────────────────────────────────────────────────
  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const tag = tagInput.trim();
    if (tag && !activeInterests.includes(tag)) {
      setActiveInterests([...activeInterests, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setActiveInterests(activeInterests.filter((t) => t !== tagToRemove));
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomId) return;
    try {
      await fetch(`/api/meet/room/${encodeURIComponent(roomId)}/message`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text: chatInput.trim() }),
      });
      setChatInput('');
    } catch (e) {
      console.warn('chat send failed:', e);
    }
  };

  const inCall = searching || joined || cooldownSeconds > 0;
  const showControls = searching || joined;
  const connectedPeers = peers.filter((p) => p.connected);

  return (
    <div
      id="omegle-random-video-call-root"
      className="bg-[#fdfbf7] border-2 border-[#cfcac0] text-[#3a342a] rounded-3xl p-4 sm:p-6 shadow-2xl min-h-[580px] max-w-6xl mx-auto flex flex-col justify-between overflow-hidden relative"
    >
      {/* ── HEADER BAR ── */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#ebdcca] pb-4 mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 text-amber-700 border border-amber-500/30">
            <Video size={22} className={joined ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-base sm:text-lg tracking-tight uppercase text-[#3a342a]">
                Meet Unknow
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status badge */}
          {joined && connectedPeers.length > 0 && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-emerald-700 text-[10px] font-mono uppercase font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              LIVE · {connectedPeers.length} PEER{connectedPeers.length > 1 ? 'S' : ''}
            </div>
          )}

          {joined && connectedPeers.length === 0 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-full text-amber-700 text-[10px] font-mono uppercase font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              {roomId ? 'JOINING ROOM...' : 'CONNECTING...'}
            </div>
          )}

          {searching && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-full text-amber-700 text-[10px] font-mono uppercase font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              SEARCHING...
            </div>
          )}

          {cooldownSeconds > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3.5 py-1.5 rounded-full text-red-700 text-[10px] font-mono uppercase font-bold">
              <Lock size={12} />
              SPAM FILTER ({cooldownSeconds}s)
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#fbf9f4] hover:bg-[#ebdcca] text-[#8a8172] hover:text-[#3a342a] transition-all border border-[#2d2d3e]"
              title="Close component"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── INTEREST TAGS BAR (When Idle) ── */}
      {!inCall && (
        <div className="mb-4 bg-[#f4f1ea] border border-[#ebdcca] rounded-2xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2 text-xs font-mono font-bold text-[#8a8172] uppercase">
            <Sparkles size={14} className="text-amber-700" />
            Match by interest
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeInterests.map((tag) => (
              <span
                key={tag}
                className="bg-white text-[#3a342a] border border-[#ebdcca] px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5 font-medium group"
              >
                #{tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="text-[#8a8172] hover:text-red-700 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add interest tag..."
                className="bg-white border border-[#ebdcca] rounded-xl px-2.5 py-1 text-xs text-[#3a342a] focus:outline-none focus:border-amber-500/50 w-32"
              />
              <button
                onClick={handleAddTag}
                className="bg-[#ebdcca] hover:bg-amber-600 text-[#3a342a] text-xs px-2.5 py-1 rounded-xl font-bold transition-all"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN WORKSPACE / VIEWPORTS AREA ── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 items-stretch justify-center relative min-h-[360px]">
        {/* VIDEO STAGE */}
        <div className="flex-1 relative bg-[#2e2920] border border-[#ebdcca] rounded-2xl overflow-hidden min-h-[340px]">
          {/* COOLDOWN STATE */}
          {cooldownSeconds > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center border border-red-500/30 rounded-2xl p-8 text-center bg-red-50">
              <AlertCircle size={44} className="text-red-700 mb-3 animate-bounce" />
              <h3 className="font-display font-bold text-base uppercase text-red-900">
                Anti-Spam Filter Active
              </h3>
              <p className="text-xs text-red-700 max-w-sm mt-2 font-mono">
                Rapid consecutive skips detected. Please wait{' '}
                <span className="font-bold text-red-700 text-sm">{cooldownSeconds}s</span> before
                looking for another match.
              </p>
            </div>
          )}

          {/* IDLE STATE */}
          {!inCall && cooldownSeconds === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-[#ebdcca] rounded-2xl p-6 sm:p-10 text-center bg-[#fbf9f4] min-h-[320px]">
              <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700 mb-4 shadow-lg shadow-amber-500/5">
                <Video size={38} />
              </div>
              <h2 className="font-display font-bold text-lg sm:text-xl uppercase text-[#3a342a] tracking-wide">
                Start Instant Random Video Call
              </h2>

              <button
                onClick={handleStart}
                className="mt-6 inline-flex items-center gap-2.5 font-mono text-xs uppercase font-bold text-[#3a342a] bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 py-3.5 px-8 rounded-2xl shadow-lg shadow-amber-500/20 hover:scale-102 active:scale-98 transition-all"
              >
                <Sparkles size={16} />
                Start Random Video Call
              </button>

              {/* Room-code group join */}
              <div className="mt-5 flex items-center gap-2 bg-white border border-[#ebdcca] rounded-2xl px-3 py-2">
                <Users size={15} className="text-[#8a8172]" />
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRoomJoin();
                  }}
                  placeholder="Room code (group video room)..."
                  className="bg-transparent text-xs text-[#3a342a] focus:outline-none w-44 placeholder:text-[#b0a896]"
                />
                <button
                  onClick={() => void handleRoomJoin()}
                  className="bg-[#3a342a] hover:bg-[#52493b] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold px-3 py-1.5 rounded-xl transition-all"
                >
                  Join
                </button>
              </div>
            </div>
          )}

          {/* SEARCHING STATE */}
          {searching && !joined && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#2e2920] min-h-[320px] relative overflow-hidden">
              <div className="relative z-10 space-y-4">
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full animate-ping" />
                  <div className="w-20 h-20 rounded-full border-4 border-amber-500 border-t-transparent animate-spin flex items-center justify-center bg-[#3a342a]">
                    <Users size={28} className="text-amber-500" />
                  </div>
                </div>
                <h3 className="font-display font-bold text-base uppercase text-amber-100 tracking-wider">
                  Searching for a stranger...
                </h3>
                <p className="font-mono text-xs text-amber-100/60 max-w-sm mx-auto">
                  Matching with someone who shares your interests or is waiting in queue.
                </p>
                {queueCount !== null && (
                  <p className="font-mono text-[10px] text-amber-100/40 flex items-center justify-center gap-1.5">
                    <Users size={11} />
                    {queueCount === 0
                      ? 'No one is waiting right now — you may be matched first'
                      : `${queueCount} ${queueCount === 1 ? 'person is' : 'people are'} waiting in the queue`}
                  </p>
                )}

                <button
                  onClick={handleStop}
                  className="mt-2 font-mono text-xs uppercase font-bold py-2 px-5 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all border border-red-500/30"
                >
                  Cancel Search
                </button>
              </div>
            </div>
          )}

          {/* CONNECTED / JOINED — REMOTE PEER GRID (native <video> boxes) */}
          {joined && (
            <div
              className={`absolute inset-0 grid gap-1.5 p-1.5 ${
                peers.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {peers.map((peer) => (
                <div
                  key={peer.userId}
                  className="relative bg-black rounded-xl overflow-hidden min-h-[140px]"
                >
                  <video
                    ref={attachRemoteVideo(peer.userId)}
                    autoPlay={true}
                    playsInline={true}
                    muted={false}
                    controls={false}
                    onLoadedMetadata={(e) => e.currentTarget.play().catch(console.error)}
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  {/* Connecting placeholder while the peer's tracks stream in */}
                  {peer.stream.getTracks().length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1c1812]/90 p-4 text-center z-10">
                      <div className="w-14 h-14 rounded-2xl border-2 border-amber-500/40 bg-white flex items-center justify-center text-amber-900 font-display font-bold text-2xl mb-2 animate-pulse">
                        {(peer.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <h4 className="font-bold text-sm text-[#f4f1ea]">{peer.name}</h4>
                      <p className="text-[10px] text-amber-400 font-mono mt-1 animate-pulse">
                        ESTABLISHING WEBRTC MEDIA STREAMS...
                      </p>
                    </div>
                  )}

                  {/* Participant badge */}
                  <div className="absolute top-2 left-2 bg-[#3a342a]/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-[#ebdcca]/20 text-[10px] font-mono uppercase text-[#ebdcca] z-20 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        peer.connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                      }`}
                    ></span>
                    {peer.name}
                  </div>

                  {/* Shared interests hint */}
                  {stranger && stranger.id === peer.userId && sharedInterests.length > 0 && (
                    <div className="absolute bottom-2 left-2 bg-[#3a342a]/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-[#ebdcca]/20 text-[9px] font-mono text-[#ebdcca] z-20">
                      Shared: {sharedInterests.join(', ')}
                    </div>
                  )}
                </div>
              ))}

              {/* No peers yet — waiting in the room */}
              {peers.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-20 h-20 rounded-2xl border-2 border-amber-500/30 bg-white/5 flex items-center justify-center animate-pulse mb-3">
                    <Users size={30} className="text-amber-400" />
                  </div>
                  <h4 className="font-bold text-sm text-[#f4f1ea]">
                    {roomId ? `Room "${roomId}" joined — waiting for peers...` : 'Connecting...'}
                  </h4>
                  <p className="text-[10px] text-amber-100/60 font-mono mt-1">
                    Share the room code so friends can join this video room.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* LOCAL CAMERA — picture-in-picture box (always once camera is on) */}
          {localStream && (
            <div className="absolute bottom-3 right-3 w-36 sm:w-44 aspect-video bg-black rounded-xl border-2 border-[#ebdcca]/30 overflow-hidden shadow-xl z-20">
              <video
                ref={localVideoRef}
                autoPlay={true}
                playsInline={true}
                muted={true}
                controls={false}
                onLoadedMetadata={(e) => e.currentTarget.play().catch(console.error)}
                className="w-full h-full object-cover transform -scale-x-100"
              />
              {!camOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#1c1812]/80">
                  <VideoOff size={20} className="text-[#8a8172]" />
                </div>
              )}
              <div className="absolute bottom-1 left-1.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-mono uppercase text-[#f4f1ea]">
                You {!micOn && '• MUTED'}
              </div>
            </div>
          )}

          {/* Media error banner */}
          {error && joined && (
            <div className="absolute top-2 inset-x-2 z-30 bg-red-500/15 border border-red-500/40 text-red-200 text-[10px] font-mono px-3 py-2 rounded-xl text-center">
              {error}
            </div>
          )}
        </div>

        {/* ── CONTROL TOOLBAR ── */}
        {showControls && (
          <div className="lg:w-72 flex lg:flex-col flex-row flex-wrap items-center justify-center gap-2 sm:gap-3 bg-[#fbf9f4] border border-[#ebdcca] p-3 rounded-2xl self-start">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                !micOn
                  ? 'bg-red-500/20 text-red-700 border border-red-500/40'
                  : 'bg-white text-[#3a342a] hover:bg-[#fbf9f4] border border-[#cfcac0]'
              }`}
              title={micOn ? 'Mute Microphone' : 'Unmute Microphone'}
            >
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>

            <button
              onClick={toggleCamera}
              className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                !camOn
                  ? 'bg-red-500/20 text-red-700 border border-red-500/40'
                  : 'bg-white text-[#3a342a] hover:bg-[#fbf9f4] border border-[#cfcac0]'
              }`}
              title={camOn ? 'Turn Camera Off' : 'Turn Camera On'}
            >
              {camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>

            {/* Chat toggle */}
            <button
              onClick={() => {
                setIsChatOpen(!isChatOpen);
                if (!isChatOpen) setUnreadCount(0);
              }}
              className={`p-3 rounded-xl flex items-center justify-center transition-all relative ${
                isChatOpen
                  ? 'bg-amber-500 text-[#3a342a] font-bold'
                  : 'bg-white text-[#3a342a] hover:bg-[#fbf9f4] border border-[#cfcac0]'
              }`}
              title="Toggle Live Chat"
            >
              <MessageSquare size={18} />
              {unreadCount > 0 && !isChatOpen && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-[#3a342a] text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Skip / next */}
            {joined && (
              <button
                onClick={() => void handleSkip()}
                className="inline-flex items-center gap-2 font-mono text-xs uppercase font-bold py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#3a342a] transition-all shadow-md active:scale-95"
                title="Skip to next stranger immediately"
              >
                <RefreshCw size={15} className="animate-spin" style={{ animationDuration: '6s' }} />
                <span>Skip / Next</span>
              </button>
            )}

            {/* Disconnect */}
            <button
              onClick={() => void handleStop()}
              className="inline-flex items-center gap-1.5 font-mono text-xs uppercase font-bold py-3 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-700 border border-red-500/30 transition-all"
              title={searching ? 'Cancel search' : 'Stop call and disconnect'}
            >
              <PhoneOff size={15} />
              <span>{searching ? 'Cancel' : 'Stop'}</span>
            </button>
          </div>
        )}

        {/* ── CHAT PANEL ── */}
        {(isChatOpen || joined) && (
          <div className="w-full lg:w-80 bg-[#fbf9f4] border border-[#ebdcca] rounded-2xl p-3 sm:p-4 flex flex-col justify-between min-h-[300px]">
            <div className="flex items-center justify-between border-b border-[#ebdcca] pb-2.5 mb-2">
              <span className="font-mono text-xs uppercase font-bold text-amber-700 flex items-center gap-1.5">
                <MessageSquare size={14} /> Live Messenger
              </span>
              {stranger && (
                <span className="text-[10px] font-mono text-[#8a8172] truncate max-w-[120px]">
                  {stranger.name}
                </span>
              )}
            </div>

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[260px] min-h-[180px] text-xs">
              {messages.length === 0 ? (
                <div className="text-center py-10 text-[#8a8172] font-mono text-[10px] uppercase border border-dashed border-[#ebdcca] rounded-xl">
                  {joined ? 'Type a message below' : 'Waiting for connection...'}
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.isSystem ? 'items-center' : msg.fromSelf ? 'items-end' : 'items-start'
                    }`}
                  >
                    {msg.isSystem ? (
                      <div className="bg-white text-amber-900 border border-amber-500/20 text-[10px] font-mono px-2.5 py-1 rounded-lg text-center my-1 w-full">
                        {msg.text}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 leading-relaxed ${
                          msg.fromSelf
                            ? 'bg-amber-500 text-[#3a342a] font-medium rounded-tr-none'
                            : 'bg-white text-[#3a342a] rounded-tl-none border border-[#ebdcca]'
                        }`}
                      >
                        {!msg.fromSelf && (
                          <div className="text-[9px] font-mono text-amber-700 font-bold mb-0.5">
                            {msg.displayName}
                          </div>
                        )}
                        <p className="break-words">{msg.text}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat input form */}
            <form onSubmit={handleSendChat} className="flex gap-1.5 mt-3 border-t border-[#ebdcca] pt-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={joined ? 'Say something...' : 'Join a room to start chat'}
                disabled={!joined}
                maxLength={300}
                className="flex-1 bg-white border border-[#ebdcca] rounded-xl px-3 py-2 text-xs text-[#3a342a] focus:outline-none focus:border-amber-500/60 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!joined || !chatInput.trim()}
                className="p-2.5 rounded-xl bg-amber-500 text-[#3a342a] hover:bg-amber-400 transition-all disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
