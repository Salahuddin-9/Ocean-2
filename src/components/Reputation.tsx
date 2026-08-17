import { useEffect, useState } from 'react';
import { X, BadgeCheck, RefreshCw, Trophy } from 'lucide-react';

/**
 * Ocean — Reputation Score (Feature 166)
 * Explainable 0-100 reputation from content quality, help and moderation flags.
 */
interface ReputationProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface HistoryRow {
  id: string;
  score: number;
  reason: string;
  at: number;
}

interface LeaderRow {
  name: string;
  score: number;
  userId?: string;
}

const tierOf = (s: number) =>
  s >= 85 ? { label: 'Ocean Pillar', cls: 'text-emerald-700 dark:text-emerald-400' }
    : s >= 70 ? { label: 'Trusted', cls: 'text-amber-700 dark:text-amber-400' }
      : s >= 50 ? { label: 'Community Member', cls: 'text-cyan-700 dark:text-cyan-400' }
        : { label: 'Needs Attention', cls: 'text-rose-600 dark:text-rose-400' };

export default function Reputation({ token, currentUser, onClose }: ReputationProps) {
  const [score, setScore] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [busy, setBusy] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/reputation', { headers });
      const d = await r.json();
      setScore(d.score);
      setHistory(d.history || []);
    } catch { /* non-fatal */ }
    try {
      const r = await fetch('/api/reputation/leaderboard');
      const d = await r.json();
      setLeaderboard(d.leaderboard || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/reputation/refresh', { method: 'POST', headers });
      const d = await r.json();
      setScore(d.score);
      setReasons(d.reasons || []);
      load();
    } catch { /* non-fatal */ } finally { setBusy(false); }
  };

  const tier = tierOf(score ?? 50);

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BadgeCheck size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Reputation Score</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 166</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ebdcca" strokeWidth="3" className="dark:stroke-zinc-700" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(score ?? 50) * 1} 100`} className="text-amber-700 dark:text-amber-400 transition-all duration-700" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-display font-black text-lg text-[#3a342a] dark:text-zinc-100">{score ?? 50}</span>
            </div>
            <div>
              <p className={`font-bold text-[14px] ${tier.cls}`}>{tier.label}</p>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">Weighted from quality · help · moderation</p>
              <button
                onClick={refresh}
                disabled={busy || !currentUser}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 text-[10px] font-bold hover:brightness-110 transition-all disabled:opacity-40"
              >
                <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Recompute
              </button>
            </div>
          </div>

          {reasons.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
              <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-1">Why this score</p>
              {reasons.map((r, i) => (
                <p key={i} className="text-[10px] text-[#5c5446] dark:text-zinc-300 flex gap-1"><span className="text-amber-600">•</span> {r}</p>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-1">Score history</p>
              <div className="space-y-0.5">
                {history.map((h) => (
                  <p key={h.id} className="text-[9px] text-[#8a8172] dark:text-zinc-500">
                    {new Date(h.at).toLocaleString()} → <strong className="text-[#3a342a] dark:text-zinc-300">{h.score}</strong> · {h.reason}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
            <Trophy size={12} className="text-amber-600" /> Top reputations
          </p>
          {leaderboard.map((row, i) => (
            <div key={row.userId ?? row.name + i} className="flex items-center gap-2 text-[10px] border-b border-[#f0e8da] dark:border-zinc-800 pb-1">
              <span className="w-5 font-mono text-[9px] text-[#8a8172]">#{i + 1}</span>
              <span className="font-bold text-[#3a342a] dark:text-zinc-100 truncate flex-1">{row.name}</span>
              <span className="font-bold text-amber-700 dark:text-amber-400">{row.score}</span>
            </div>
          ))}
          {leaderboard.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No computed reputations yet.</p>}
        </div>
      </div>
    </div>
  );
}
