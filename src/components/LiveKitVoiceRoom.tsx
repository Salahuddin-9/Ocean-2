/**
 * Ocean — LiveKit voice room (feature #254)
 * -------------------------------------------
 * Real-time voice/stage audio via `livekit-client`. The server mints scoped
 * tokens from LIVEKIT_API_KEY/SECRET; the client connects to the LiveKit server
 * URL from localStorage (ocean.livekit.url) or VITE_LIVEKIT_URL. When LiveKit is
 * not configured the app gracefully falls back to the existing P2P call layer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Radio, Settings2 } from 'lucide-react';
import { toast, authHeaders } from './FeatureShell';

interface Props {
  roomName: string;
  userName: string;
  token: string | null;
  onClose: () => void;
}

type Phase = 'connecting' | 'connected' | 'error' | 'unconfigured';

export default function LiveKitVoiceRoom({ roomName, userName, token, onClose }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<any>(null); // livekit-client Room instance
  const [phase, setPhase] = useState<Phase>('connecting');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [people, setPeople] = useState<{ identity: string; speaking: boolean }[]>([]);
  const [url, setUrl] = useState(localStorage.getItem('ocean.livekit.url') || (import.meta as any).env?.VITE_LIVEKIT_URL || '');

  const refreshPeople = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const active = new Set((room.activeSpeakers || []).map((p: any) => p.identity));
    const list = [room.localParticipant, ...[...room.remoteParticipants.values()]]
      .filter(Boolean)
      .map((p: any) => ({ identity: p.identity || 'me', speaking: active.has(p.identity) }));
    setPeople(list);
  }, []);

  const attachTracks = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    // remove stale nodes we created
    gridRef.current?.querySelectorAll('[data-lk-video]').forEach((n) => n.remove());
    for (const p of [room.localParticipant, ...[...room.remoteParticipants.values()]]) {
      for (const pub of p.trackPublications?.values() ?? []) {
        if (pub.kind !== 'video' || !pub.track) continue;
        const el = pub.track.attach();
        el.setAttribute('data-lk-video', '1');
        el.className = 'w-full h-full object-cover rounded-xl';
        const wrap = document.createElement('div');
        wrap.className = 'relative aspect-video rounded-xl overflow-hidden bg-black';
        wrap.appendChild(el);
        const label = document.createElement('p');
        label.className = 'absolute bottom-1 left-2 text-[9px] text-white bg-black/50 rounded px-1.5 py-0.5';
        label.textContent = p.identity;
        wrap.appendChild(label);
        gridRef.current?.appendChild(wrap);
      }
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const base = url.trim();
        if (!base) { setPhase('unconfigured'); return; }
        setPhase('connecting');
        const res = await fetch(`/api/livekit/token?room=${encodeURIComponent(roomName)}`, { headers: authHeaders(token) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Token request failed');
        if (!d.configured) { setPhase('unconfigured'); return; }
        const { Room, RoomEvent } = await import('livekit-client');
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        room.on(RoomEvent.ParticipantConnected, refreshPeople);
        room.on(RoomEvent.ParticipantDisconnected, refreshPeople);
        room.on(RoomEvent.ActiveSpeakersChanged, refreshPeople);
        room.on(RoomEvent.TrackSubscribed, () => { attachTracks(); refreshPeople(); });
        room.on(RoomEvent.TrackUnsubscribed, () => { attachTracks(); refreshPeople(); });
        room.on(RoomEvent.TrackMuted, refreshPeople);
        room.on(RoomEvent.Disconnected, () => { if (live) setPhase('error'); });
        await room.connect(base, d.token, { autoSubscribe: true });
        await room.localParticipant.setMicrophoneEnabled(true);
        if (live) { setPhase('connected'); refreshPeople(); attachTracks(); }
      } catch (e: any) {
        if (live) { setPhase('error'); toast(`⛔ LiveKit connect failed: ${e?.message || e}`); }
      }
    })();
    return () => { live = false; try { roomRef.current?.disconnect(); } catch { /* noop */ } roomRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, token]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    setMicOn(next);
    await room.localParticipant.setMicrophoneEnabled(next).catch(() => {});
  };

  const toggleCam = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    setCamOn(next);
    await room.localParticipant.setCameraEnabled(next).catch(() => {});
    setTimeout(attachTracks, 300);
  };

  const saveUrl = () => {
    localStorage.setItem('ocean.livekit.url', url.trim());
    toast('💾 LiveKit server URL saved — reconnect to join');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[130] bg-zinc-950/98 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${phase === 'connected' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${phase === 'connected' ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
        </span>
        <p className="text-white text-[12px] font-bold flex-1 truncate">🔊 {roomName} <span className="text-[8px] text-zinc-500 font-mono">LiveKit · {phase}</span></p>
        <span className="text-[9px] text-zinc-400 font-mono">{people.length} in room</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-700"><PhoneOff size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {phase === 'connecting' && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400 text-[11px]">
            <Loader2 size={24} className="animate-spin text-emerald-400" />
            Connecting to {url || 'LiveKit'}…
          </div>
        )}

        {phase === 'error' && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400 text-[11px]">
            <p>⚠️ Could not join the LiveKit room.</p>
            <button onClick={onClose} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-[10px] font-bold">Back to P2P layer</button>
          </div>
        )}

        {phase === 'unconfigured' && (
          <div className="h-full flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
            <Radio size={28} className="text-emerald-400" />
            <p className="text-zinc-200 text-[12px] font-bold text-center">LiveKit isn't configured yet</p>
            <p className="text-zinc-400 text-[10px] text-center leading-relaxed">
              Set <b className="text-zinc-200">LIVEKIT_API_KEY</b> + <b className="text-zinc-200">LIVEKIT_API_SECRET</b> on the server and enter your LiveKit server URL (e.g. <b className="text-zinc-200">wss://my-livekit.example.com</b>) below. Until then, voice rooms use the app's P2P/Jitsi call layer.
            </p>
            <div className="w-full flex gap-1.5">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://your-livekit-server.com" className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-[11px] text-white outline-none focus:border-emerald-400" />
              <button onClick={saveUrl} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 text-[10px] font-bold flex items-center gap-1"><Settings2 size={11} /> Save</button>
            </div>
          </div>
        )}

        {phase === 'connected' && (
          <>
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 gap-2" />
            {people.length === 0 && <p className="text-zinc-500 text-[10px] italic text-center mt-8">Talking… (video appears here when someone turns on their camera)</p>}
            <div className="mt-4 space-y-1.5">
              {people.map((p) => (
                <div key={p.identity} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${p.speaking ? 'border-emerald-500 bg-emerald-900/20' : 'border-zinc-800 bg-zinc-900/60'}`}>
                  <span className={`w-2 h-2 rounded-full ${p.speaking ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                  <p className="text-[11px] text-zinc-200 font-bold flex-1 truncate">{p.identity === 'me' ? `${userName} (you)` : p.identity}</p>
                  {p.speaking ? <Mic size={12} className="text-emerald-400" /> : <MicOff size={12} className="text-zinc-500" />}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-center gap-2">
        <button onClick={toggleMic} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-300'}`} title={micOn ? 'Mute' : 'Unmute'}>
          {micOn ? <Mic size={16} /> : <MicOff size={16} />}
        </button>
        <button onClick={toggleCam} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${camOn ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'bg-zinc-700 text-zinc-300'}`} title={camOn ? 'Stop camera' : 'Start camera'}>
          {camOn ? <Video size={16} /> : <VideoOff size={16} />}
        </button>
        <button onClick={onClose} className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center" title="Leave">
          <PhoneOff size={16} />
        </button>
      </div>
    </motion.div>
  );
}
