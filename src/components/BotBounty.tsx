import { useEffect, useState } from 'react';
import { X, Bot, BadgeCheck, Trophy, Coins, AlertTriangle } from 'lucide-react';

/**
 * Ocean — Community Bot-Bounty (Feature 138)
 * Report suspicious accounts as bots; confirmed reports pay Ocean Coins.
 */
interface BotBountyProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Report {
  id: string;
  targetUserId: string;
  targetName: string;
  botScore: number;
  verdict: string;
  reward: number;
  signals: string[];
  createdAt: number;
}

interface LeaderRow {
  userId: string;
  name: string;
  confirmed: number;
  coinsEarned: number;
}  const verdictStyle = (v: string) =>
  v === 'confirmed'
    ? 'text-emerald-700 dark:text-emerald-400'
    : v === 'pending'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-[#8a8172] dark:text-zinc-400';

export default function BotBounty({ token, currentUser, onClose }: BotBountyProps) {
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ verdict: string; botScore: number; signals: string[]; reward: number; balance?: number } | null>(null);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [stats, setStats] = useState({ reports: 0, confirmed: 0, rejected: 0, coinsEarned: 0 });
  const [tab, setTab] = useState<'report' | 'history' | 'leaderboard'>('report');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (token) {
      try {
        const r = await fetch('/api/botbounty/reports', { headers });
        const d = await r.json();
        setReports(d.reports || []);
        setStats(d.stats || { reports: 0, confirmed: 0, rejected: 0, coinsEarned: 0 });
      } catch { /* non-fatal */ }
    }
    try {
      const r = await fetch('/api/botbounty/leaderboard');
      const d = await r.json();
      setLeaderboard(d.leaderboard || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async () => {
    if (!target.trim()) return setError('Enter a username or user ID to report.');
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/botbounty/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ targetUserId: target.trim(), reason: reason.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Report failed');
      setResult(d);
      setTarget('');
      setReason('');
      load();
    } catch (e: any) {
      setError(e.message || 'Report failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Community Bot-Bounty</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 138</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['report', 'history', 'leaderboard'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                tab === t
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-950'
                  : 'bg-white/70 dark:bg-zinc-900 text-[#8a8172] dark:text-zinc-400 border border-[#ebdcca] dark:border-zinc-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'report' && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
                Report an account you believe is a bot. The backend checks profile completeness, posting velocity,
                link-heavy content and (if available) their Humanity Score. <strong>Confirmed bots pay a coin bounty</strong> to the reporter.
              </p>
              <label className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">Username or user ID</label>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. dhanondi_sales_bot"
                className="w-full mt-1 mb-2 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
              />
              <label className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">Reason (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. spams identical promo links every hour"
                className="w-full mt-1 mb-3 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 resize-none"
              />
              <button
                onClick={submit}
                disabled={busy || !currentUser}
                className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-3 hover:brightness-110 transition-all disabled:opacity-40"
              >
                {busy ? 'Analyzing…' : 'Report & analyze'}
              </button>
              {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
            </div>

            {result && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BadgeCheck size={16} className={verdictStyle(result.verdict)} />
                  <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 uppercase tracking-wide">Verdict: {result.verdict}</p>
                  <span className="ml-auto font-mono text-[10px] text-[#8a8172] dark:text-zinc-400">botScore {result.botScore}/100</span>
                </div>
                {result.signals.length > 0 && (
                  <ul className="text-[10px] text-[#5c5446] dark:text-zinc-300 space-y-0.5 mb-2">
                    {result.signals.map((s, i) => (
                      <li key={i} className="flex items-center gap-1"><span className="text-amber-600">•</span> {s}</li>
                    ))}
                  </ul>
                )}
                {result.verdict === 'confirmed' && (
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-2.5">
                    <Coins size={14} /> +{result.reward} Ocean Coins paid to your wallet{typeof result.balance === 'number' ? ` (balance ${result.balance})` : ''}
                  </p>
                )}
                {result.verdict === 'pending' && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-xl p-2.5">
                    Strong suspicion but below the confirm threshold — held for human moderation.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                ['Reports', stats.reports],
                ['Confirmed', stats.confirmed],
                ['Rejected', stats.rejected],
                ['Coins earned', stats.coinsEarned],
              ].map(([label, val]) => (
                <div key={label as string} className="rounded-xl bg-[#f6f1e7] dark:bg-zinc-800 p-2 text-center">
                  <p className="font-display font-black text-lg text-[#3a342a] dark:text-zinc-100">{val}</p>
                  <p className="font-mono text-[7px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">{label}</p>
                </div>
              ))}
            </div>
            {reports.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No reports yet.</p>}
            <div className="space-y-1.5">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 text-[10px]">
                  <div>
                    <p className="font-bold text-[#3a342a] dark:text-zinc-100">@{r.targetName}</p>
                    <p className="text-[#8a8172] dark:text-zinc-500">{new Date(r.createdAt).toLocaleString()} · score {r.botScore}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold uppercase ${verdictStyle(r.verdict)}`}>{r.verdict}</p>
                    {r.reward > 0 && <p className="text-emerald-600 dark:text-emerald-400 font-bold">+{r.reward} 🪙</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
              <Trophy size={12} className="text-amber-600" /> Top bot hunters
            </p>
            {leaderboard.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No confirmed bounties yet — be the first.</p>}
            <div className="space-y-1">
              {leaderboard.map((row, i) => (
                <div key={row.userId} className="flex items-center gap-2 text-[11px] text-[#5c5446] dark:text-zinc-300 border-b border-[#f0e8da] dark:border-zinc-800 pb-1">
                  <span className="w-5 text-center font-mono text-[9px] text-[#8a8172]">#{i + 1}</span>
                  <span className="font-bold text-[#3a342a] dark:text-zinc-100">{row.name}</span>
                  <span className="ml-auto text-[#8a8172]">{row.confirmed} confirmed</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{row.coinsEarned} 🪙</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
