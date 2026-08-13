import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clapperboard, X, Play, Pause, Volume2, VolumeX, Link2, Film, Radio,
  GripHorizontal, RefreshCw,
} from 'lucide-react';

/**
 * Ocean — Watch Together
 * -----------------------
 * A Jitsi-style shared-video modal. One participant pastes a YouTube URL and
 * starts playing; every plays/pauses/seeks/mute they perform is echoed to the
 * rest of the conversation via `{ type: 'watch_sync', ... }` WebSocket frames
 * so everyone's player stays in sync. Works solo too (no socket) — the player
 * simply isn't broadcast.
 *
 * Synchronization model:
 *  - Broadcasting is throttled to at most one frame per 5s (a trailing flush
 *    sends the latest pending state so pauses/plays are never lost).
 *  - A local *seek* is detected from the YouTube iframe's periodic
 *    `infoDelivery` when the reported currentTime jumps by more than 5s.
 *  - On receive, the player is only re-seeked when |target - current| > 5s,
 *    then pause/play is applied to match the sender.
 *  - `senderId` is a per-instance id so self-echo (and multi-tab) is ignored.
 */

const EMBED_BASE = 'https://www.youtube.com/embed/';
const THROTTLE_MS = 5000;           // max one broadcast per 5 seconds
const DRIFT_THRESHOLD = 5;          // seconds — seek threshold
const VALID_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

type WatchStatus = 'playing' | 'pause';

interface WatchSyncPayload {
  type: 'watch_sync';
  conversationId: string;
  url: string;
  status: WatchStatus | 'ended';
  time: number;
  muted: boolean;
  senderId: string;
}

interface PlayerState {
  status: WatchStatus;
  time: number;
  muted: boolean;
  ready: boolean;
}

function parseYouTubeId(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  // Bare 11-char video id convenience.
  if (VALID_ID_RE.test(raw)) return raw;
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'm.youtube.com') return null;
  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0] || '';
    return VALID_ID_RE.test(id) ? id : null;
  }
  // /watch?v= /embed/ /v/ /shorts/ /live/
  const m = u.pathname.match(/^\/(?:watch|embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  const v = u.searchParams.get('v');
  if (v && VALID_ID_RE.test(v)) return v;
  return null;
}

interface WatchTogetherModalProps {
  conversationId: string;
  socket: WebSocket | null;
  onClose: () => void;
}

export default function WatchTogetherModal({ conversationId, socket, onClose }: WatchTogetherModalProps) {
  const [visible, setVisible] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [synced, setSynced] = useState(false); // a peer frame has been received

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const myIdRef = useRef<string>(`wt-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  const socketRef = useRef<WebSocket | null>(socket);
  const videoUrlRef = useRef<string | null>(null);
  const playerStateRef = useRef<PlayerState>({ status: 'pause', time: 0, muted: false, ready: false });
  const currentTimeRef = useRef<number>(0);
  const lastSentRef = useRef<number>(0);             // wall-clock of last broadcast
  const throttleTimerRef = useRef<number | null>(null);
  const pendingSyncRef = useRef<WatchSyncPayload | null>(null);
  const pendingApplyRef = useRef<PlayerState | null>(null);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // ---- postMessage helpers -------------------------------------------------
  const post = useCallback((func: string, args: unknown[] = []) => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ event: 'command', func, args }, '*');
    }
  }, []);

  const broadcast = useCallback((state: { status: WatchStatus; time: number; muted: boolean }) => {
    const sock = socketRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    const payload: WatchSyncPayload = {
      type: 'watch_sync',
      conversationId,
      url: videoUrlRef.current || '',
      status: state.status,
      time: state.time,
      muted: state.muted,
      senderId: myIdRef.current,
    };
    const now = Date.now();
    if (now - lastSentRef.current >= THROTTLE_MS) {
      lastSentRef.current = now;
      sock.send(JSON.stringify(payload));
      return;
    }
    // Throttled — stash the latest state and flush it after the window closes.
    pendingSyncRef.current = payload;
    if (throttleTimerRef.current == null) {
      const wait = THROTTLE_MS - (now - lastSentRef.current);
      throttleTimerRef.current = window.setTimeout(() => {
        throttleTimerRef.current = null;
        const pending = pendingSyncRef.current;
        pendingSyncRef.current = null;
        if (pending && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify(pending));
          lastSentRef.current = Date.now();
        }
      }, wait);
    }
  }, [conversationId]);

  const applyRemote = useCallback((remote: PlayerState) => {
    if (!playerStateRef.current.ready) {
      pendingApplyRef.current = { ...remote, ready: false };
      return;
    }
    const current = currentTimeRef.current;
    if (Math.abs(remote.time - current) > DRIFT_THRESHOLD) {
      post('seekTo', [remote.time, true]);
    }
    if (remote.status === 'playing') {
      post('playVideo', []);
      setIsPlaying(true);
    } else {
      post('pauseVideo', []);
      setIsPlaying(false);
    }
    if (typeof remote.muted === 'boolean') {
      post(remote.muted ? 'mute' : 'unMute', []);
      setMuted(remote.muted);
      playerStateRef.current.muted = remote.muted;
    }
  }, [post]);

  // ---- inbound socket sync -------------------------------------------------
  const handleSocketMessage = useCallback((e: MessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(typeof e.data === 'string' ? e.data : '');
    } catch {
      return;
    }
    if (!data || data.type !== 'watch_sync') return;
    if (data.conversationId !== conversationId) return;
    if (data.senderId === myIdRef.current) return;

    if (data.status === 'ended') {
      post('pauseVideo', []);
      setIsPlaying(false);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '🎬 The host ended the Watch Together session.' } }));
      return;
    }

    // A peer is sharing a video we haven't opened yet — load theirs.
    if (typeof data.url === 'string' && data.url) {
      videoUrlRef.current = data.url;
      setVideoUrl(prev => (prev === data.url ? prev : data.url));
    }
    setSynced(true);
    applyRemote({
      status: data.status === 'playing' ? 'playing' : 'pause',
      time: Number(data.time) || 0,
      muted: !!data.muted,
      ready: playerStateRef.current.ready,
    });
  }, [conversationId, applyRemote, post]);

  useEffect(() => {
    const sock = socket;
    if (!sock) return;
    sock.addEventListener('message', handleSocketMessage);
    return () => sock.removeEventListener('message', handleSocketMessage);
  }, [socket, handleSocketMessage]);

  // ---- YouTube iframe player events ---------------------------------------
  const handlePlayerEvent = useCallback((e: MessageEvent) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow || e.source !== iframe.contentWindow) return;
    const data: any = e.data;
    if (!data || typeof data !== 'object') return;

    if (data.event === 'onReady') {
      playerStateRef.current.ready = true;
      setLoading(false);
      const pending = pendingApplyRef.current;
      if (pending) {
        pendingApplyRef.current = null;
        applyRemote(pending);
      }
    } else if (data.event === 'onStateChange') {
      const s = data.info;
      if (s === 1) {
        playerStateRef.current.status = 'playing';
        setIsPlaying(true);
        broadcast({ status: 'playing', time: currentTimeRef.current, muted: playerStateRef.current.muted });
      } else if (s === 2 || s === 0) {
        playerStateRef.current.status = 'pause';
        setIsPlaying(false);
        broadcast({ status: 'pause', time: currentTimeRef.current, muted: playerStateRef.current.muted });
      }
    } else if (data.event === 'infoDelivery') {
      const info = data.info || {};
      if (typeof info.currentTime === 'number') {
        const prev = currentTimeRef.current;
        currentTimeRef.current = info.currentTime;
        // A seek is a >5s jump between consecutive info deliveries.
        if (prev > 0 && Math.abs(info.currentTime - prev) > DRIFT_THRESHOLD) {
          broadcast({ status: playerStateRef.current.status, time: info.currentTime, muted: playerStateRef.current.muted });
        }
      }
      if (typeof info.isMuted === 'boolean' && info.isMuted !== playerStateRef.current.muted) {
        playerStateRef.current.muted = info.isMuted;
        setMuted(info.isMuted);
        broadcast({ status: playerStateRef.current.status, time: currentTimeRef.current, muted: info.isMuted });
      }
    }
  }, [applyRemote, broadcast]);

  useEffect(() => {
    window.addEventListener('message', handlePlayerEvent);
    return () => window.removeEventListener('message', handlePlayerEvent);
  }, [handlePlayerEvent]);

  // Cleanup throttles on unmount.
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current != null) window.clearTimeout(throttleTimerRef.current);
    };
  }, []);

  // ---- user actions --------------------------------------------------------
  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(urlInput);
    if (!id) {
      setError('Paste a valid YouTube link — youtube.com/watch?v=…, youtu.be/… or /embed/…');
      return;
    }
    setError(null);
    const src = `${EMBED_BASE}${id}?enablejsapi=1&autoplay=1&rel=0`;
    videoUrlRef.current = src;
    setVideoUrl(src);
    setLoading(true);
  };

  const handleChangeVideo = () => {
    videoUrlRef.current = null;
    setVideoUrl(null);
    setUrlInput('');
    setError(null);
    setLoading(false);
    setIsPlaying(false);
    playerStateRef.current = { status: 'pause', time: 0, muted: false, ready: false };
    currentTimeRef.current = 0;
  };

  const togglePlay = () => {
    if (!playerStateRef.current.ready) return;
    if (playerStateRef.current.status === 'playing') {
      post('pauseVideo', []);
    } else {
      post('playVideo', []);
    }
    // onStateChange -> broadcast
  };

  const toggleMute = () => {
    if (!playerStateRef.current.ready) return;
    const next = !playerStateRef.current.muted;
    playerStateRef.current.muted = next;
    setMuted(next);
    post(next ? 'mute' : 'unMute', []);
    broadcast({ status: playerStateRef.current.status, time: currentTimeRef.current, muted: next });
  };

  const handleEnd = () => {
    const sock = socketRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      const payload: WatchSyncPayload = {
        type: 'watch_sync',
        conversationId,
        url: videoUrlRef.current || '',
        status: 'ended',
        time: currentTimeRef.current,
        muted: playerStateRef.current.muted,
        senderId: myIdRef.current,
      };
      sock.send(JSON.stringify(payload));
    }
    setVisible(false);
  };

  const socketOpen = !!socket && socket.readyState === WebSocket.OPEN;

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setVisible(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.45 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) setVisible(false);
            }}
            className="w-full max-w-lg mx-auto bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-b-0 border-[#ebdcca] dark:border-zinc-800 rounded-t-[2rem] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="pt-3 pb-1 flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-700" />
              <GripHorizontal size={14} className="text-[#8a8172] dark:text-zinc-500" />
            </div>

            {/* Header */}
            <header className="flex items-center justify-between px-6 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 flex items-center justify-center">
                  <Clapperboard className="text-amber-800 dark:text-amber-400" size={16} />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Watch Together</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                    Shared YouTube session
                  </p>
                </div>
              </div>
              <button
                onClick={handleEnd}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#8a8172] hover:text-[#3a342a] dark:text-zinc-400 dark:hover:text-zinc-100 bg-[#ebdcca]/40 dark:bg-zinc-800 transition-colors"
                title="End session"
              >
                <X size={15} />
              </button>
            </header>

            <div className="px-6 pb-7 space-y-4">
              {/* Status line */}
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider">
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                    socketOpen
                      ? 'text-amber-800 dark:text-amber-400 border-amber-200/60 dark:border-zinc-700 bg-amber-50/50 dark:bg-zinc-800/60'
                      : 'text-[#8a8172] dark:text-zinc-400 border-[#ebdcca] dark:border-zinc-700 bg-[#ebdcca]/30 dark:bg-zinc-800/40'
                  }`}
                >
                  <Radio size={10} className={socketOpen ? 'animate-pulse' : ''} />
                  {socketOpen ? (synced ? 'Sync live' : 'Broadcasting') : 'Solo — no peer socket'}
                </span>
                {isPlaying && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/50">
                    <Play size={10} /> Playing
                  </span>
                )}
              </div>

              {!videoUrl ? (
                /* --- URL entry form --- */
                <form onSubmit={handleStart} className="space-y-3">
                  <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                    <Link2 size={11} className="text-amber-800 dark:text-amber-400" /> YouTube link
                  </label>
                  <input
                    value={urlInput}
                    onChange={e => {
                      setUrlInput(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="https://youtube.com/watch?v=… or youtu.be/…"
                    className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 transition-colors"
                  />
                  {error && (
                    <p className="text-[10px] text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Film size={12} /> Start watching
                  </button>
                  <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                    Everyone in this conversation sees the same player. Play, pause, seek or mute and
                    the group follows along.
                  </p>
                </form>
              ) : (
                /* --- Player --- */
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border-2 border-[#ebdcca] dark:border-zinc-800 bg-black aspect-video">
                    <iframe
                      ref={iframeRef}
                      src={videoUrl}
                      title="Watch Together video"
                      className="absolute inset-0 w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                    {loading && (
                      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                        <div className="w-8 h-8 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
                        <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Loading player…</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlay}
                        disabled={loading}
                        className="w-9 h-9 rounded-full bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 flex items-center justify-center hover:bg-amber-900 dark:hover:bg-amber-300 disabled:opacity-50 transition-all"
                        title={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={toggleMute}
                        disabled={loading}
                        className="w-9 h-9 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 flex items-center justify-center hover:bg-[#ebdcca]/70 transition-all disabled:opacity-50"
                        title={muted ? 'Unmute' : 'Mute'}
                      >
                        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                        {muted ? 'Muted' : 'Unmuted'}
                      </span>
                    </div>
                    <button
                      onClick={handleChangeVideo}
                      className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-all flex items-center gap-1"
                    >
                      <RefreshCw size={11} /> Change video
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
