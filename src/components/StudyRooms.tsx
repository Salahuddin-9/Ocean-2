import { useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, Users, Timer, Play, Square, ArrowLeft, CheckCircle2 } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Room {
  id: string;
  name: string;
  category: string;
  description: string;
  memberCount: number;
  studyingNow: number;
  members: string[];
}

interface Presence { userId: string; name: string; studying: boolean; at: number }

export default function StudyRooms({ token, currentUser, onClose }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [studyingNow, setStudyingNow] = useState(0);
  const [pomodoro, setPomodoro] = useState<any>(null);
  const [stats, setStats] = useState<{ sessions: number; totalFocusMs: number }>({ sessions: 0, totalFocusMs: 0 });
  const [remaining, setRemaining] = useState(0);
  const [joined, setJoined] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const heartbeatRef = useRef<any>(null);

  const loadRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch { /* offline */ }
  };

  useEffect(() => { loadRooms(); }, []);
  useEffect(() => () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); }, []);

  const loadRoom = async (id: string) => {
    const res = await fetch(`/api/rooms/${id}`, { headers: authHeaders(token) });
    if (!res.ok) return;
    const data = await res.json();
    setActiveRoom(data.room);
    setPresence(data.presence || []);
    setMembers(data.members || []);
    setStudyingNow(data.studyingNow || 0);
    setStats(data.myStats || { sessions: 0, totalFocusMs: 0 });
    setJoined((data.members || []).some((m: any) => m.userId === currentUser?.id) || data.room.members.includes(currentUser?.id));
    if (data.myPomodoro) {
      setPomodoro({ ...data.myPomodoro });
      setRemaining(data.myPomodoro.remainingSec || 0);
    }
  };

  const openRoom = async (id: string) => {
    await loadRoom(id);
    // heartbeat while in the room
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(async () => {
      if (!id) return;
      await fetch(`/api/rooms/${id}/presence`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ studying: true }),
      }).catch(() => {});
    }, 20000);
  };

  const joinRoom = async (id: string) => {
    const res = await fetch(`/api/rooms/${id}/join`, { method: 'POST', headers: authHeaders(token) });
    if (res.ok) { setJoined(true); toast('✅ Joined the room — happy studying'); }
  };

  const leaveRoom = async (id: string) => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    await fetch(`/api/rooms/${id}/leave`, { method: 'POST', headers: authHeaders(token) });
    setActiveRoom(null);
    setJoined(false);
    loadRooms();
  };

  const createRoom = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: newName, category: newCategory }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      toast('✅ Room created');
      setNewName('');
      loadRooms();
    } else {
      toast(`⛔ ${data.error || 'Could not create room'}`);
    }
  };

  const startPomodoro = async (phase: 'focus' | 'break') => {
    const res = await fetch(`/api/rooms/${activeRoom.id}/pomodoro`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ action: 'start', phase }),
    });
    const data = await res.json();
    if (res.ok) {
      setPomodoro(data);
      setRemaining(data.remainingSec);
      toast(phase === 'focus' ? '🍅 Focus session started — 25 min' : '☕ Break started — 5 min');
    }
  };

  const stopPomodoro = async () => {
    const res = await fetch(`/api/rooms/${activeRoom.id}/pomodoro`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ action: 'stop' }),
    });
    const data = await res.json();
    setPomodoro(null);
    setRemaining(0);
    setStats((s) => ({ ...s, sessions: data.sessions || s.sessions }));
    toast('⏹ Pomodoro stopped');
  };

  useEffect(() => {
    if (!pomodoro || pomodoro.phase === 'idle') return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setStats((s) => ({ ...s, sessions: s.sessions + (pomodoro.phase === 'focus' ? 1 : 0) }));
          setPomodoro(null);
          toast(pomodoro.phase === 'focus' ? '🍅 Focus complete — take a break!' : '☕ Break over — back to focus');
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pomodoro]);

  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <FeatureShell title="Study Rooms" badge="6" icon={<BookOpen size={18} className="text-indigo-700 dark:text-indigo-400" />} onClose={onClose}>
      {!activeRoom ? (
        <>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 mb-4">
            <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Create a focus room</span>
            <div className="flex gap-2 mt-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Room name (e.g. SSC 2026)" className="flex-1 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-600" />
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-lg px-2 text-xs">
                {['General', 'Exam Prep', 'Coding', 'Admission', 'Language'].map((c) => <option key={c}>{c}</option>)}
              </select>
              <button onClick={createRoom} disabled={creating} className="flex items-center gap-1 px-3 rounded-lg bg-indigo-800 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40">
                <Plus size={12} /> {creating ? '…' : 'Create'}
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {rooms.map((r) => (
              <button key={r.id} onClick={() => openRoom(r.id)}
                className="text-left bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-zinc-800/60 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{r.name}</span>
                  <span className="font-mono text-[8px] uppercase text-[#8a8172] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded px-1.5 py-0.5">{r.category}</span>
                </div>
                <p className="text-[10px] text-[#8a8172] mt-1 line-clamp-2">{r.description}</p>
                <div className="flex items-center gap-3 mt-2 text-[9px] font-mono text-[#8a8172]">
                  <span className="flex items-center gap-1"><Users size={10} /> {r.memberCount}</span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={10} /> {r.studyingNow} studying now</span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => leaveRoom(activeRoom.id)} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100 transition-all">
              <ArrowLeft size={13} /> All rooms
            </button>
            {joined ? (
              <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">✓ joined · heartbeats active</span>
            ) : (
              <button onClick={() => joinRoom(activeRoom.id)} className="px-3 py-1.5 rounded-lg bg-indigo-800 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase tracking-wider">Join room</button>
            )}
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#3a342a] dark:text-zinc-100">{activeRoom.name}</span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">{studyingNow} studying now</span>
            </div>
            <p className="text-[10px] text-[#8a8172] mt-0.5">{activeRoom.description}</p>

            <div className="mt-4">
              <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider">Presence grid — who is studying</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {presence.filter((p) => p.studying).map((p) => (
                  <div key={p.userId} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-full px-2.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-semibold text-[#3a342a] dark:text-zinc-100">{p.name}</span>
                  </div>
                ))}
                {presence.filter((p) => p.studying).length === 0 && <p className="text-[10px] text-[#8a8172] italic">Nobody studying right now — be the first.</p>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {presence.filter((p) => !p.studying).map((p) => (
                  <span key={p.userId} className="text-[9px] text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 rounded-full px-2 py-0.5">{p.name} (idle)</span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold text-[#8a8172] uppercase tracking-wider flex items-center gap-1.5"><Timer size={11} /> Pomodoro</span>
              <span className="text-[9px] font-mono text-[#8a8172]">{stats.sessions} sessions · {Math.round(stats.totalFocusMs / 60000)} focus min</span>
            </div>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {pomodoro && pomodoro.phase !== 'idle' ? (
                <>
                  <div className={`text-center rounded-2xl px-6 py-3 border ${pomodoro.phase === 'focus' ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300' : 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300'}`}>
                    <p className="text-[9px] font-mono uppercase tracking-widest">{pomodoro.phase === 'focus' ? 'Focus 🍅' : 'Break ☕'}</p>
                    <p className="text-3xl font-bold tabular-nums">{fmt(remaining)}</p>
                  </div>
                  <button onClick={stopPomodoro} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[10px] font-bold uppercase tracking-wider text-[#8a8172] hover:text-rose-600 transition-all">
                    <Square size={11} /> Stop
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => startPomodoro('focus')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold uppercase tracking-wider transition-all">
                    <Play size={12} /> Start focus (25')
                  </button>
                  <button onClick={() => startPomodoro('break')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-[11px] font-bold uppercase tracking-wider transition-all">
                    <Play size={12} /> Start break (5')
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </FeatureShell>
  );
}
