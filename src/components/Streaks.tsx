import { useEffect, useState } from 'react';
import { X, Flame, Trophy, Check } from 'lucide-react';

/**
 * Ocean — Meaningful Streaks (Feature 164)
 * Daily check-ins for learning, creating and helping.
 */
interface StreaksProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface StreakRow {
  type: string;
  label: string;
  icon: string;
  current: number;
  best: number;
  lastCheckIn: string | null;
}

interface LeaderRow {
  name: string;
  current: number;
  best: number;
  userId?: string;
}

export default function Streaks({ token, currentUser, onClose }: StreaksProps) {
  const [streaks, setStreaks] = useState<StreakRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [leaderType, setLeaderType] = useState('creator');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/streaks', { headers });
      const d = await r.json();
      setStreaks(d.streaks || []);
    } catch { /* non-fatal */ }
  };

  const loadBoard = async () => {
    try {
      const r = await fetch(`/api/streaks/leaderboard?type=${leaderType}`);
      const d = await r.json();
      setLeaderboard(d.leaderboard || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderType]);

  const checkin = async (type: string) => {
    setBusy(true);
    setToast('');
    try {
      const r = await fetch('/api/streaks/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ type }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setToast(`${d.note}`);
      load();
      loadBoard();
    } catch (e: any) {
      setToast(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const checkedToday = (s: StreakRow) => {
    const today = new Date().toISOString().slice(0, 10);
    return s.lastCheckIn === today;
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Meaningful Streaks</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 164</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {toast && <p className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 mb-3">{toast}</p>}

        <div className="grid grid-cols-3 gap-2 mb-3">
          {streaks.map((s) => (
            <div key={s.type} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-3 text-center">
              <p className="text-xl mb-1">{s.icon}</p>
              <p className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">{s.label}</p>
              <p className="font-display font-black text-2xl text-amber-700 dark:text-amber-400">{s.current}<span className="text-[10px] font-bold text-[#8a8172]"> days</span></p>
              <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">best {s.best}</p>
              <button
                onClick={() => checkin(s.type)}
                disabled={busy || checkedToday(s) || !currentUser}
                className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-full text-[9px] font-bold transition-all ${
                  checkedToday(s)
                    ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 cursor-default'
                    : 'bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 hover:brightness-110 disabled:opacity-40'
                }`}
              >
                {checkedToday(s) ? <><Check size={10} /> Done today</> : 'Check in'}
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy size={13} className="text-amber-600" />
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">Leaderboard</p>
            <div className="ml-auto flex rounded-full border border-[#ebdcca] dark:border-zinc-700 overflow-hidden">
              {['learning', 'creator', 'helper'].map((t) => (
                <button
                  key={t}
                  onClick={() => setLeaderType(t)}
                  className={`px-2.5 py-1 text-[9px] font-bold transition-all ${leaderType === t ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' : 'bg-white dark:bg-zinc-950 text-[#8a8172]'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {leaderboard.map((row, i) => (
              <div key={row.userId ?? row.name + i} className="flex items-center gap-2 text-[10px] border-b border-[#f0e8da] dark:border-zinc-800 pb-1">
                <span className="w-5 font-mono text-[9px] text-[#8a8172]">#{i + 1}</span>
                <span className="font-bold text-[#3a342a] dark:text-zinc-100 truncate flex-1">{row.name}</span>
                <span className="font-mono text-[8px] text-[#8a8172]">best {row.best}</span>
                <span className="font-bold text-amber-700 dark:text-amber-400">{row.current} 🔥</span>
              </div>
            ))}
            {leaderboard.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No {leaderType} streaks yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
