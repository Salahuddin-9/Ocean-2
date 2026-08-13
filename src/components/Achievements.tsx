import { useEffect, useState } from 'react';
import { X, Award, ScanSearch, Sparkles } from 'lucide-react';

/**
 * Ocean — Achievement System (Feature 165)
 * Milestone badges unlocked by real metrics; scan to re-check.
 */
interface AchievementsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface AchievementRow {
  key: string;
  name: string;
  desc: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  value: number;
  threshold?: number;
}

export default function Achievements({ token, currentUser, onClose }: AchievementsProps) {
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [newOnes, setNewOnes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/achievements', { headers });
      const d = await r.json();
      setRows(d.achievements || []);
      setUnlockedCount(d.unlockedCount || 0);
      setTotal(d.total || 0);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const scan = async () => {
    setBusy(true);
    setNewOnes([]);
    try {
      const r = await fetch('/api/achievements/scan', { method: 'POST', headers });
      const d = await r.json();
      if (d.newlyUnlocked && d.newlyUnlocked.length > 0) {
        setNewOnes(d.newlyUnlocked.map((a: any) => `${a.icon} ${a.name}`));
      }
      load();
    } catch { /* non-fatal */ } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Achievements</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 165</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100">
              {unlockedCount}/{total} unlocked
            </p>
            <button
              onClick={scan}
              disabled={busy || !currentUser}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 text-[10px] font-bold hover:brightness-110 transition-all disabled:opacity-40"
            >
              <ScanSearch size={11} className={busy ? 'animate-spin' : ''} /> Scan for unlocks
            </button>
          </div>
          <div className="h-2 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-amber-700 transition-all" style={{ width: `${total ? (unlockedCount / total) * 100 : 0}%` }} />
          </div>
        </div>

        {newOnes.length > 0 && (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 mb-3">
            <p className="flex items-center gap-1.5 font-bold text-[12px] text-amber-800 dark:text-amber-300 mb-1">
              <Sparkles size={13} /> Newly unlocked!
            </p>
            {newOnes.map((n) => (
              <p key={n} className="text-[11px] text-amber-800/90 dark:text-amber-300/90">• {n}</p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {rows.map((a) => (
            <div
              key={a.key}
              className={`rounded-2xl border p-3 transition-all ${
                a.unlocked
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                  : 'border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 opacity-80'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{a.unlocked ? a.icon : '🔒'}</span>
                <p className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">{a.name}</p>
                {a.unlocked && <Award size={12} className="ml-auto text-amber-600" />}
              </div>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mb-1.5">{a.desc}</p>
              <div className="h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                <div className={`h-full ${a.unlocked ? 'bg-amber-600 dark:bg-amber-400' : 'bg-[#b9a98c] dark:bg-zinc-600'}`} style={{ width: `${a.progress}%` }} />
              </div>
              <p className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-500 mt-0.5">{a.value}/{a.threshold}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
