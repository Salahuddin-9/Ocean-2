import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Trophy, Swords, Loader2, Check } from 'lucide-react';

/**
 * Ocean — Red-Team Challenge Platform (Feature 243)
 * ---------------------------------------------------
 * Hunt vulnerabilities in Ocean's AI/ranking/moderation systems, submit
 * findings, get scored, climb the leaderboard. Backed by /api/redteam.
 */

interface RedTeamArenaProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Challenge { id: string; title: string; description: string; system: string; reward: number; status: string; at: number }
interface Sub { id: string; challengeId: string; report: string; severity: string; status: string; score: number; at: number }
interface LBRow { userId: string; count: number; points: number }

export default function RedTeamArena({ token, currentUser, onClose }: RedTeamArenaProps) {
  const [visible, setVisible] = useState(true);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LBRow[]>([]);
  const [mine, setMine] = useState<Sub[]>([]);
  const [report, setReport] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'challenges' | 'mine'>('challenges');

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  const authToken = token || localStorage.getItem('secure_auth_token');
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const load = useCallback(async () => {
    try {
      const [c, lb, m] = await Promise.all([
        api('/api/redteam/challenges'),
        api('/api/redteam/leaderboard'),
        api('/api/redteam/submissions').catch(() => ({ submissions: [] })),
      ]);
      setChallenges(c.challenges || []);
      setLeaderboard(lb.leaderboard || []);
      setMine(m.submissions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (challengeId: string) => {
    if (!report.trim()) return toast('Write your finding first.');
    setBusy(true);
    try {
      await api('/api/redteam/submit', 'POST', { challengeId, report, severity });
      toast('Finding submitted — reviewers will score it.');
      setReport(''); setActiveId(null);
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const sevColor: Record<string, string> = {
    low: 'bg-sky-800/10 text-sky-700 dark:text-sky-300',
    medium: 'bg-amber-800/10 text-amber-700 dark:text-amber-300',
    high: 'bg-orange-800/10 text-orange-700 dark:text-orange-300',
    critical: 'bg-red-800/10 text-red-700 dark:text-red-300',
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Red-team arena</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-red-800/10 dark:bg-red-400/10 flex items-center justify-center">
                  <Swords className="text-red-800 dark:text-red-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Red-Team Arena</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Hunt AI vulnerabilities, earn bounties · feature 243</p>
                </div>
              </div>

              <div className="flex gap-1.5">
                {(['challenges', 'mine'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-xl font-mono text-[9px] uppercase font-bold tracking-wider transition-colors ${tab === t ? 'bg-[#3a342a] text-[#f4f1ea] dark:bg-zinc-100 dark:text-zinc-900' : 'bg-[#ebdcca]/40 text-[#8a8172] dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {t === 'challenges' ? `Challenges (${challenges.length})` : `My findings (${mine.length})`}
                  </button>
                ))}
              </div>

              {tab === 'challenges' && (
                <div className="space-y-2">
                  {challenges.map(c => (
                    <div key={c.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <ShieldAlert size={12} className="text-red-700 dark:text-red-400" />
                        <span className="font-mono text-[11px] font-bold text-[#3a342a] dark:text-zinc-200">{c.title}</span>
                        <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-zinc-800/10 text-[#5c5446] dark:bg-zinc-700 dark:text-zinc-300">{c.system}</span>
                        <span className="ml-auto font-mono text-[9px] text-amber-700 dark:text-amber-400">{c.reward} 🪙</span>
                      </div>
                      <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1">{c.description}</p>
                      {currentUser && (
                        activeId === c.id ? (
                          <div className="mt-2 space-y-2">
                            <textarea className={`${input} min-h-[60px] resize-none`} value={report} onChange={e => setReport(e.target.value)} placeholder="Describe the exploit + reproduction steps" />
                            <div className="flex gap-2">
                              <select className={`${input} flex-1`} value={severity} onChange={e => setSeverity(e.target.value)}>
                                {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <button onClick={() => submit(c.id)} disabled={busy} className={btnPrimary}><Check size={11} /> Submit</button>
                              <button onClick={() => setActiveId(null)} className={btnPrimary}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setActiveId(c.id); setReport(''); }} className={`${btnPrimary} mt-2`}>Attack this system</button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'mine' && (
                <div className="space-y-2">
                  {mine.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No findings yet — pick a challenge.</p>}
                  {mine.map(s => (
                    <div key={s.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${sevColor[s.severity]}`}>{s.severity}</span>
                        <span className={`font-mono text-[9px] uppercase ${s.status === 'accepted' ? 'text-emerald-700 dark:text-emerald-400' : 'text-[#8a8172]'}`}>{s.status}</span>
                        <span className="ml-auto font-mono text-[9px] text-[#3a342a] dark:text-zinc-300">score {s.score}</span>
                      </div>
                      <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{s.report}</p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500 mb-2 flex items-center gap-1"><Trophy size={10} /> Leaderboard</div>
                <div className="space-y-1">
                  {leaderboard.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-2">No accepted findings yet.</p>}
                  {leaderboard.slice(0, 10).map((r, i) => (
                    <div key={r.userId} className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="w-4 text-[#8a8172]">#{i + 1}</span>
                      <span className="flex-1 text-[#3a342a] dark:text-zinc-200 truncate">{r.userId.slice(0, 16)}…</span>
                      <span className="text-[#8a8172]">{r.count} finds</span>
                      <span className="text-amber-700 dark:text-amber-400 font-bold">{r.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
