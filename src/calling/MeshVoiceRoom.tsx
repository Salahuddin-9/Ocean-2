/**
 * MeshVoiceRoom.tsx — audio-only WebRTC mesh voice channel (feature #254).
 *
 * Drop-in fallback when LiveKit keys are absent: reuses the standalone mesh
 * engine (meetRoomMesh.ts) — real getUserMedia + RTCPeerConnection, signaling
 * relayed over Ocean's authenticated /ws/chat socket (join-room / all-users /
 * user-connected / sending-signal / returning-signal). No LiveKit, no keys.
 *
 * Controls: mic mute, deafen (mute my mic AND silence all remote audio), leave.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, PhoneOff, Loader2, Radio, VolumeX, Volume2 } from 'lucide-react';
import { MeetPeer, MeetRoomMesh, MeetRoomStatus } from './meetRoomMesh';

interface Props {
  roomId: string;
  currentUser: { id: string; name: string } | null;
  token: string | null;
  onClose: () => void;
}

export default function MeshVoiceRoom({ roomId, currentUser, token, onClose }: Props) {
  const engineRef = useRef<MeetRoomMesh | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [peers, setPeers] = useState<MeetPeer[]>([]);
  const [status, setStatus] = useState<MeetRoomStatus>('idle');
  const [micOn, setMicOn] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser || !token) {
        setError('Sign in required to join a voice channel.');
        return;
      }
      try {
        // Audio-only local stream (no camera permission needed).
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const engine = new MeetRoomMesh({
          currentUser,
          token,
          roomId,
          initialStream: stream,
          onPeers: (p) => setPeers(p),
          onLocalStream: () => {},
          onStatus: (s) => setStatus(s),
          onError: (msg) => setError(msg),
        });
        engineRef.current = engine;
        setMicOn(engine.isMicOn());
        engine.joinRoom();
      } catch (e: any) {
        setError(`Could not access microphone: ${e?.message || e}`);
      }
    })();
    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [roomId, currentUser, token]);

  const attachAudio = useCallback((peer: MeetPeer, el: HTMLAudioElement | null) => {
    if (el) {
      el.srcObject = peer.stream;
      audioRefs.current.set(peer.userId, el);
    } else {
      audioRefs.current.delete(peer.userId);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const on = engineRef.current?.toggleMute();
    if (typeof on === 'boolean') setMicOn(on);
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      // Deafen = my mic goes silent AND every remote audio element is muted.
      const mic = engineRef.current?.getLocalStream()?.getAudioTracks()[0];
      if (mic) mic.enabled = !next;
      setMicOn(!next);
      audioRefs.current.forEach((el) => {
        el.muted = next;
      });
      return next;
    });
  }, []);

  const leave = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    onClose();
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[130] bg-zinc-950/98 flex flex-col"
    >
      {/* Remote audio elements — one per peer (mesh delivers each peer's stream) */}
      <div className="hidden">
        {peers.map((p) => (
          <audio
            key={p.userId}
            ref={(el) => attachAudio(p, el)}
            autoPlay
            playsInline
          />
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'connected' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${status === 'connected' ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
        </span>
        <p className="text-white text-[12px] font-bold flex-1 truncate">
          🔊 {roomId} <span className="text-[8px] text-zinc-500 font-mono">P2P mesh voice · {status}</span>
        </p>
        <span className="text-[9px] text-zinc-400 font-mono">{peers.length + 1} in room</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-700" title="Leave"><PhoneOff size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="text-center text-rose-400 text-[11px] py-6 space-y-2">
            <p>⚠️ {error}</p>
            <button onClick={onClose} className="rounded-lg bg-zinc-800 text-zinc-200 px-4 py-2 text-[10px] font-bold">Close</button>
          </div>
        )}
        {!error && (status === 'joining' || status === 'idle') && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400 text-[11px]">
            <Loader2 size={24} className="animate-spin text-emerald-400" />
            Connecting to voice channel…
          </div>
        )}
        {!error && status === 'connected' && (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[11px] text-zinc-200 font-bold flex-1">{currentUser?.name || 'You'} (you)</p>
              {micOn ? <Mic size={12} className="text-emerald-400" /> : <MicOff size={12} className="text-zinc-500" />}
            </div>
            {peers.length === 0 && (
              <p className="text-zinc-500 text-[10px] italic text-center mt-8">
                No one else is here yet — share the room code to invite people.
              </p>
            )}
            <div className="space-y-1.5">
              {peers.map((p) => (
                <div key={p.userId} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${p.connected ? 'border-emerald-500/50 bg-zinc-900/60' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <p className="text-[11px] text-zinc-200 font-bold flex-1 truncate">{p.name}</p>
                  {deafened ? <VolumeX size={12} className="text-zinc-500" /> : <Volume2 size={12} className="text-emerald-400" />}
                  <span className="text-[8px] font-mono uppercase text-zinc-500">{p.connected ? 'connected' : 'connecting…'}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center font-mono text-[8px] uppercase tracking-wider text-zinc-600">
              WebRTC mesh fallback (no LiveKit keys needed) · signaling via Ocean chat socket
            </p>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-center gap-2">
        <button onClick={toggleMute} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-300'}`} title={micOn ? 'Mute' : 'Unmute'}>
          {micOn ? <Mic size={16} /> : <MicOff size={16} />}
        </button>
        <button onClick={toggleDeafen} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${deafened ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-zinc-700 text-zinc-300'}`} title={deafened ? 'Undeafen' : 'Deafen'}>
          {deafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button onClick={leave} className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center" title="Leave room">
          <PhoneOff size={16} />
        </button>
      </div>
    </motion.div>
  );
}
