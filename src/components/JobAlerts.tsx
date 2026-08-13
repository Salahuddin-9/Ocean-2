import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Landmark, Plus, Bookmark, BookmarkCheck, Loader2, CalendarClock } from 'lucide-react';

/**
 * Ocean — Government Job Alert & Circular Tracker (Feature 197)
 * ---------------------------------------------------------------
 * Browse and submit government job circulars, filter by category, bookmark the
 * ones you are chasing. Expired circulars drop off automatically.
 * Backed by /api/jobs/alerts.
 */

interface JobAlertsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Alert {
  id: string; title: string; org: string; circularNo: string; category: string;
  deadline: number; salary: string; education: string; url: string; savedBy: string[];
  createdAt: number;
}

export default function JobAlerts({ token, currentUser, onClose }: JobAlertsProps) {
  const [visible, setVisible] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [saved, setSaved] = useState<Alert[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'alerts' | 'saved' | 'submit'>('alerts');
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [org, setOrg] = useState('');
  const [circularNo, setCircularNo] = useState('');
  const [category, setCategory] = useState('Other');
  const [deadline, setDeadline] = useState('');
  const [salary, setSalary] = useState('');
  const [education, setEducation] = useState('');
  const [url, setUrl] = useState('');
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
      if (cat) params.set('category', cat);
      if (q) params.set('q', q);
      const d = await api(`/api/jobs/alerts?${params.toString()}`, 'GET');
      setAlerts(d.alerts || []);
      setCategories(d.categories || []);
      const s = currentUser ? await api('/api/jobs/alerts/saved', 'GET').catch(() => null) : null;
      setSaved(s?.alerts || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [cat, q, currentUser]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const submit = async () => {
    if (!title.trim() || !org.trim()) return toast('Title and organization are required.');
    setBusy(true);
    try {
      await api('/api/jobs/alerts', 'POST', {
        title, org, circularNo, category,
        deadline: deadline ? new Date(deadline + 'T23:59:59').getTime() : 0,
        salary, education, url,
      });
      toast('Circular submitted.');
      setTitle(''); setOrg(''); setCircularNo(''); setSalary(''); setEducation(''); setUrl(''); setDeadline('');
      setTab('alerts');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const toggleSave = async (id: string) => {
    try {
      await api(`/api/jobs/alerts/${id}/save`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const fmtDeadline = (ts: number) => ts ? new Date(ts).toLocaleDateString() : 'No deadline';

  const shell = 'fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';
  const tabs = ['alerts', 'saved', 'submit'] as const;

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Job circular tracker</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-teal-800/10 dark:bg-teal-400/10 flex items-center justify-center">
                  <Landmark className="text-teal-800 dark:text-teal-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Govt Job Alerts</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Circular tracker · community-fed</p>
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

              {tab === 'submit' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Circular title" />
                    <input className={input} value={org} onChange={e => setOrg(e.target.value)} placeholder="Organization" />
                    <input className={input} value={circularNo} onChange={e => setCircularNo(e.target.value)} placeholder="Circular no." />
                    <select className={input} value={category} onChange={e => setCategory(e.target.value)}>
                      {['BCS', 'Bank', 'Teacher', 'Police', 'Health', 'Engineer', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className={input} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
                    <input className={input} value={salary} onChange={e => setSalary(e.target.value)} placeholder="Salary scale" />
                  </div>
                  <input className={input} value={education} onChange={e => setEducation(e.target.value)} placeholder="Required education" />
                  <input className={input} value={url} onChange={e => setUrl(e.target.value)} placeholder="Official link (optional)" />
                  <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Submit circular
                  </button>
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">Scraper-ready: the same endpoint accepts automated feeds.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tab === 'alerts' && (
                    <div className="flex gap-2">
                      <input className={`${input} flex-1`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search circulars…" />
                      <select className={`${input} w-36 shrink-0`} value={cat} onChange={e => { setCat(e.target.value); }}>
                        <option value="">All</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  {loading ? (
                    <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : (tab === 'alerts' ? alerts : saved).length === 0 ? (
                    <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">Nothing here yet.</p>
                  ) : (
                    (tab === 'alerts' ? alerts : saved).map(a => (
                      <div key={a.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-xs text-[#3a342a] dark:text-zinc-100">{a.title}</div>
                            <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{a.org}{a.circularNo ? ` · ${a.circularNo}` : ''}</div>
                            <div className="flex flex-wrap gap-2 mt-1.5 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500">
                              <span className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-1.5 py-0.5 rounded-full">{a.category}</span>
                              <span className="flex items-center gap-0.5"><CalendarClock size={9} /> {fmtDeadline(a.deadline)}</span>
                              {a.salary && <span>{a.salary}</span>}
                            </div>
                            {a.education && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1.5 line-clamp-2">{a.education}</p>}
                            {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-[10px] text-teal-700 dark:text-teal-300 underline break-all">Official notice →</a>}
                          </div>
                          {currentUser && (
                            <button onClick={() => toggleSave(a.id)} className="shrink-0 text-[#8a8172] hover:text-teal-600 transition-colors" aria-label="Bookmark">
                              {a.savedBy.includes(currentUser.id) ? <BookmarkCheck size={15} className="text-teal-600" /> : <Bookmark size={15} />}
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
