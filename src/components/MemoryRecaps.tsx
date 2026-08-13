import { useEffect, useState } from 'react';
import { X, CalendarHeart, RefreshCw, Users, MessageSquareText, ImageIcon } from 'lucide-react';

/**
 * Ocean — Memory Recaps (160) + Shared Memories (161)
 * "On this day" digest + a shared timeline with a friend.
 */
interface MemoryRecapsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface MemoryEntry {
  kind: 'post' | 'reel' | 'message' | 'voice_note';
  title: string;
  text: string;
  by: string;
  at: number;
}

interface DailyMemory {
  id: string;
  date: string;
  entries: MemoryEntry[];
}

interface SharedEntry {
  kind: 'comment' | 'message' | 'reaction' | 'post';
  text: string;
  byName: string;
  at: number;
}

const kindIcon = (k: string) =>
  k === 'message' ? <MessageSquareText size={12} className="text-cyan-600 dark:text-cyan-400" />
    : k === 'reel' ? <ImageIcon size={12} className="text-violet-600 dark:text-violet-400" />
      : <ImageIcon size={12} className="text-amber-600" />;

export default function MemoryRecaps({ token, currentUser, onClose }: MemoryRecapsProps) {
  const [tab, setTab] = useState<'today' | 'shared'>('today');
  const [memory, setMemory] = useState<DailyMemory | null>(null);
  const [recaps, setRecaps] = useState<DailyMemory[]>([]);
  const [friendRef, setFriendRef] = useState('');
  const [shared, setShared] = useState<{ friend: { id: string; name: string }; entries: SharedEntry[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadToday = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const [r, h] = await Promise.all([
        fetch('/api/memories/recap', { headers }),
        fetch('/api/memories/recaps', { headers }),
      ]);
      const d = await r.json();
      const hd = await h.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setMemory(d.memory);
      setRecaps(hd.recaps || []);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const rebuild = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch('/api/memories/recap', { method: 'POST', headers });
      const d = await r.json();
      setMemory(d.memory);
    } catch { /* non-fatal */ } finally { setBusy(false); }
  };

  const loadShared = async () => {
    if (!friendRef.trim()) return setError('Enter a friend username or ID.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/memories/shared/${encodeURIComponent(friendRef.trim())}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setShared(d);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarHeart size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Memories</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Features 160–161</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['today', 'shared'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                tab === t
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-950'
                  : 'bg-white/70 dark:bg-zinc-900 text-[#8a8172] dark:text-zinc-400 border border-[#ebdcca] dark:border-zinc-800'
              }`}
            >
              {t === 'today' ? 'On this day' : 'With a friend'}
            </button>
          ))}
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {tab === 'today' && (
          <>
            {memory && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarHeart size={14} className="text-amber-700 dark:text-amber-400" />
                  <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100">On this day · {memory.date}</p>
                  <button onClick={rebuild} disabled={busy} className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline">
                    <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>
                <div className="space-y-1.5">
                  {memory.entries.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                      <span className="mt-0.5 shrink-0">{kindIcon(e.kind)}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-[#3a342a] dark:text-zinc-100">{e.title} <span className="font-normal text-[#8a8172]">· {e.by}</span></p>
                        <p className="text-[10px] text-[#5c5446] dark:text-zinc-400">“{e.text}”</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recaps.length > 0 && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Past recaps</p>
                {recaps.map((r) => (
                  <button key={r.id} onClick={() => setMemory(r)} className="w-full text-left rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 mb-1.5 hover:border-amber-400 transition-all">
                    <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{r.date}</p>
                    <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">{r.entries.length} memories</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'shared' && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
                Every interaction you've shared with one friend — comments on each other's posts and chat messages — in a single timeline.
              </p>
              <div className="flex gap-2">
                <input
                  value={friendRef}
                  onChange={(e) => setFriendRef(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadShared()}
                  placeholder="Friend username or ID"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
                />
                <button onClick={loadShared} disabled={busy} className="px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
                  <Users size={13} />
                </button>
              </div>
            </div>

            {shared && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
                <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 mb-2">With {shared.friend.name} · {shared.entries.length} shared moments</p>
                {shared.entries.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No shared interactions yet.</p>}
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {shared.entries.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                      <span className="mt-0.5 shrink-0">{kindIcon(e.kind)}</span>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-[#8a8172] dark:text-zinc-400">{e.byName} · {new Date(e.at).toLocaleString()}</p>
                        <p className="text-[10px] text-[#5c5446] dark:text-zinc-300">{e.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
