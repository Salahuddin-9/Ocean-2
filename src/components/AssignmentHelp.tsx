import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, PenTool, Plus, HandCoins, CheckCheck, Loader2, Search } from 'lucide-react';

/**
 * Ocean — Assignment Help Exchange (Feature 199)
 * -----------------------------------------------
 * Ask for help (with optional coin rewards) or offer your help. Claimed asks
 * pay the helper coins when completed. Backed by /api/assignment-help.
 */

interface AssignmentHelpProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface HelpPost {
  id: string; kind: 'ask' | 'offer'; userId: string; userName: string; subject: string;
  title: string; description: string; rewardCoins: number; status: string;
  claimedBy?: string; claimedByName?: string; createdAt: number;
}

export default function AssignmentHelp({ token, currentUser, onClose }: AssignmentHelpProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<HelpPost[]>([]);
  const [mine, setMine] = useState<HelpPost[]>([]);
  const [tab, setTab] = useState<'browse' | 'post' | 'mine'>('browse');
  const [kind, setKind] = useState<'ask' | 'offer'>('ask');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('subject', filter);
      const d = await api(`/api/assignment-help?${params.toString()}`, 'GET');
      setList(d.posts || []);
      const m = currentUser ? await api('/api/assignment-help/mine', 'GET').catch(() => null) : null;
      setMine(m?.posts || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filter, currentUser]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!subject.trim() || !title.trim()) return toast('Subject and title are required.');
    setBusy(true);
    try {
      await api('/api/assignment-help', 'POST', { kind, subject, title, description, rewardCoins: reward ? Number(reward) : 0 });
      toast(kind === 'ask' ? 'Help request posted.' : 'Help offer posted.');
      setSubject(''); setTitle(''); setDescription(''); setReward('');
      setTab('browse');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const claim = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/assignment-help/${id}/claim`, 'POST');
      toast('Claimed — help them out!');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const complete = async (id: string) => {
    setBusy(true);
    try {
      const d = await api(`/api/assignment-help/${id}/complete`, 'POST');
      toast(d.paid > 0 ? `Completed — ${d.paid} coins paid to ${d.to}.` : 'Completed. Thanks for the exchange!');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const statusBadge = (s: string) => {
    const tone = s === 'open' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : s === 'claimed' ? 'bg-amber-800/10 text-amber-700 dark:text-amber-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
    return <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${tone}`}>{s}</span>;
  };

  const shell = 'fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';
  const tabs = ['browse', 'post', 'mine'] as const;

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Assignment help</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-fuchsia-800/10 dark:bg-fuchsia-400/10 flex items-center justify-center">
                  <PenTool className="text-fuchsia-800 dark:text-fuchsia-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Assignment Help</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Skill exchange · coin rewards</p>
                </div>
              </div>

              <div className="flex gap-1.5">
                {tabs.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${tab === t ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/40'}`}>
                    {t}
                  </button>
                ))}
              </div>

              {tab === 'post' ? (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {(['ask', 'offer'] as const).map(k => (
                      <button key={k} onClick={() => setKind(k)}
                        className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${kind === k ? 'bg-fuchsia-800 text-white' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                        {k === 'ask' ? 'I need help' : 'I can help'}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
                    <input className={input} type="number" min={0} value={reward} onChange={e => setReward(e.target.value)} placeholder={kind === 'ask' ? 'Reward coins (0 = free)' : 'Reward coins (optional)'} />
                  </div>
                  <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g. Solve physics chapter 4 problems)" />
                  <textarea className={`${input} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Details…" />
                  <button onClick={post} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Post
                  </button>
                  {kind === 'ask' && Number(reward) > 0 && (
                    <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">Reward is held from your wallet and paid to the helper on completion.</p>
                  )}
                </div>
              ) : tab === 'mine' ? (
                <div className="space-y-2">
                  {mine.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">Nothing yet.</p>}
                  {mine.map(p => (
                    <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[#3a342a] dark:text-zinc-100">{p.title}</span>
                            {statusBadge(p.status)}
                          </div>
                          <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-0.5">{p.subject}{p.kind === 'ask' && p.rewardCoins > 0 ? ` · ${p.rewardCoins} coins` : ''}</div>
                          {p.claimedByName && <div className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1">Helper: {p.claimedByName}</div>}
                        </div>
                        {p.userId === currentUser?.id && p.status === 'claimed' && (
                          <button onClick={() => complete(p.id)} disabled={busy} className={`${btnPrimary} shrink-0`}>
                            <CheckCheck size={11} /> Complete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                    <input className={`${input} pl-7`} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by subject" />
                  </div>
                  {loading ? (
                    <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : list.length === 0 ? (
                    <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">No posts match.</p>
                  ) : (
                    list.map(p => (
                      <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${p.kind === 'ask' ? 'bg-fuchsia-800/10 text-fuchsia-700 dark:text-fuchsia-300' : 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300'}`}>{p.kind}</span>
                              <span className="font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate">{p.title}</span>
                            </div>
                            <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-0.5">{p.subject} · {p.userName}</div>
                            {p.description && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{p.description}</p>}
                            {p.rewardCoins > 0 && (
                              <span className="inline-flex items-center gap-0.5 mt-1.5 text-[9px] font-mono uppercase bg-amber-800/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                                <HandCoins size={9} /> {p.rewardCoins} coins
                              </span>
                            )}
                          </div>
                          {currentUser && p.status === 'open' && p.kind === 'ask' && p.userId !== currentUser.id && (
                            <button onClick={() => claim(p.id)} disabled={busy} className={`${btnPrimary} shrink-0`}>
                              <HandCoins size={11} /> Claim
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
