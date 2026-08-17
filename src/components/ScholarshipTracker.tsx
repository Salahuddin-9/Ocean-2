import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Award, Plus, Bookmark, BookmarkCheck, Loader2, Search, CalendarClock } from 'lucide-react';

/**
 * Ocean — Scholarship Aggregator (Feature 201)
 * ---------------------------------------------
 * Community-maintained scholarships with eligibility, amount, deadline and
 * links. Bookmark the ones you are chasing. Backed by /api/scholarships.
 */

interface ScholarshipTrackerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Scholarship {
  id: string; name: string; org: string; amount: string; eligibility: string;
  deadline: number; link: string; savedByMe?: boolean; createdAt: number;
}

export default function ScholarshipTracker({ token, currentUser, onClose }: ScholarshipTrackerProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<Scholarship[]>([]);
  const [saved, setSaved] = useState<Scholarship[]>([]);
  const [tab, setTab] = useState<'list' | 'saved' | 'add'>('list');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [amount, setAmount] = useState('');
  const [eligibility, setEligibility] = useState('');
  const [deadline, setDeadline] = useState('');
  const [link, setLink] = useState('');
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
      if (q) params.set('q', q);
      const d = await api(`/api/scholarships?${params.toString()}`, 'GET');
      setList(d.scholarships || []);
      const s = currentUser ? await api('/api/scholarships/saved', 'GET').catch(() => null) : null;
      setSaved(s?.scholarships || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [q, currentUser]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const add = async () => {
    if (!name.trim()) return toast('Scholarship name is required.');
    setBusy(true);
    try {
      await api('/api/scholarships', 'POST', {
        name, org, amount, eligibility,
        deadline: deadline ? new Date(deadline + 'T23:59:59').getTime() : 0,
        link,
      });
      toast('Scholarship added.');
      setName(''); setOrg(''); setAmount(''); setEligibility(''); setLink(''); setDeadline('');
      setTab('list');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const toggleSave = async (id: string) => {
    try {
      await api(`/api/scholarships/${id}/save`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';
  const tabs = ['list', 'saved', 'add'] as const;

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Scholarships</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-sky-800/10 dark:bg-sky-400/10 flex items-center justify-center">
                  <Award className="text-sky-800 dark:text-sky-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Scholarship Aggregator</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Track &amp; apply — deadlines never missed</p>
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

              {tab === 'add' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Scholarship name" />
                    <input className={input} value={org} onChange={e => setOrg(e.target.value)} placeholder="Organization" />
                    <input className={input} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (e.g. 25,000 Tk)" />
                    <input className={input} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
                  </div>
                  <input className={input} value={eligibility} onChange={e => setEligibility(e.target.value)} placeholder="Eligibility criteria" />
                  <input className={input} value={link} onChange={e => setLink(e.target.value)} placeholder="Official link" />
                  <button onClick={add} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add scholarship
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {tab === 'list' && (
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                      <input className={`${input} pl-7`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search scholarships…" />
                    </div>
                  )}
                  {loading ? (
                    <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : (tab === 'list' ? list : saved).length === 0 ? (
                    <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">Nothing here yet.</p>
                  ) : (
                    (tab === 'list' ? list : saved).map(s => (
                      <div key={s.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-xs text-[#3a342a] dark:text-zinc-100">{s.name}</div>
                            <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{s.org}{s.amount ? ` · ${s.amount}` : ''}</div>
                            {s.eligibility && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{s.eligibility}</p>}
                            <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500">
                              <span className="flex items-center gap-0.5"><CalendarClock size={9} /> {s.deadline ? new Date(s.deadline).toLocaleDateString() : 'No deadline'}</span>
                            </div>
                            {s.link && <a href={s.link} target="_blank" rel="noreferrer" className="text-[10px] text-sky-700 dark:text-sky-300 underline break-all">Apply →</a>}
                          </div>
                          {currentUser && (
                            <button onClick={() => toggleSave(s.id)} className="shrink-0 text-[#8a8172] hover:text-sky-600 transition-colors" aria-label="Bookmark">
                              {s.savedByMe ? <BookmarkCheck size={15} className="text-sky-600" /> : <Bookmark size={15} />}
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
