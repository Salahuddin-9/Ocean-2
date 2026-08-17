import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Scale, Plus, Loader2, FileText, HandHeart, Search } from 'lucide-react';

/**
 * Ocean — Pro-Bono Lawyer Matchmaking (Feature 208)
 * ---------------------------------------------------
 * Lawyers register with practice areas and pro-bono availability; users file
 * cases and lawyers accept them. Backed by /api/lawyers + /api/cases.
 */

interface LawyerMatchProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Lawyer { id: string; userId: string; name: string; areas: string[]; proBono: boolean; bio: string }
interface Case { id: string; userId: string; userName: string; category: string; description: string; urgency: string; status: string; createdAt: number }

export default function LawyerMatch({ token, currentUser, onClose }: LawyerMatchProps) {
  const [visible, setVisible] = useState(true);
  const [tab, setTab] = useState<'cases' | 'lawyers' | 'register' | 'file'>('cases');
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [areaFilter, setAreaFilter] = useState('');
  const [areas, setAreas] = useState('');
  const [proBono, setProBono] = useState(true);
  const [bio, setBio] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('normal');
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
      if (areaFilter) params.set('area', areaFilter);
      const [l, c] = await Promise.all([
        api(`/api/lawyers?${params.toString()}`, 'GET'),
        currentUser ? api('/api/cases', 'GET').catch(() => null) : Promise.resolve(null),
      ]);
      setLawyers(l.lawyers || []);
      setCases(c?.cases || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [areaFilter, currentUser]);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!areas.trim()) return toast('At least one practice area is required.');
    setBusy(true);
    try {
      await api('/api/lawyers', 'POST', { areas: areas.split(',').map(s => s.trim()).filter(Boolean), proBono, bio });
      toast('Lawyer profile saved.');
      setTab('lawyers');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const fileCase = async () => {
    if (!category.trim() || !description.trim()) return toast('Category and description are required.');
    setBusy(true);
    try {
      await api('/api/cases', 'POST', { category, description, urgency });
      toast('Case filed — lawyers in your category have been notified.');
      setCategory(''); setDescription(''); setUrgency('normal');
      setTab('cases');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const accept = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/cases/${id}/accept`, 'POST');
      toast('Case accepted — coordinate via chat.');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';
  const tabs = ['cases', 'lawyers', 'register', 'file'] as const;

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Legal aid</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-slate-800/10 dark:bg-slate-400/10 flex items-center justify-center">
                  <Scale className="text-slate-800 dark:text-slate-300" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Pro-Bono Lawyers</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Case ↔ lawyer matching</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {tabs.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${tab === t ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/40'}`}>
                    {t}
                  </button>
                ))}
              </div>

              {tab === 'register' ? (
                <div className="space-y-2">
                  <input className={input} value={areas} onChange={e => setAreas(e.target.value)} placeholder="Practice areas (e.g. Family, Cyber, Labour)" />
                  <textarea className={`${input} resize-none`} rows={2} value={bio} onChange={e => setBio(e.target.value)} placeholder="Short bio / bar details" />
                  <label className="flex items-center gap-2 text-[11px] text-[#5c5446] dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={proBono} onChange={e => setProBono(e.target.checked)} className="accent-slate-700" />
                    Offer pro-bono (free) consultations
                  </label>
                  <button onClick={register} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Save lawyer profile
                  </button>
                </div>
              ) : tab === 'file' ? (
                <div className="space-y-2">
                  <input className={input} value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (e.g. Harassment, Land, Tenancy)" />
                  <textarea className={`${input} resize-none`} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your situation (facts, dates, evidence you have)" />
                  <div className="flex gap-1.5">
                    {(['normal', 'urgent'] as const).map(u => (
                      <button key={u} onClick={() => setUrgency(u)}
                        className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${urgency === u ? 'bg-slate-800 text-white' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                        {u}
                      </button>
                    ))}
                  </div>
                  <button onClick={fileCase} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} File case
                  </button>
                </div>
              ) : tab === 'lawyers' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                    <input className={`${input} pl-7`} value={areaFilter} onChange={e => setAreaFilter(e.target.value)} placeholder="Filter by practice area" />
                  </div>
                  {loading ? (
                    <div className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : lawyers.length === 0 ? (
                    <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">No lawyers registered yet.</p>
                  ) : (
                    lawyers.map(l => (
                      <div key={l.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{l.name}</span>
                          {l.proBono && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 font-mono text-[8px] uppercase font-bold">
                              <HandHeart size={9} /> Pro-bono
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {l.areas.map(a => (
                            <span key={a} className="px-1.5 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-mono uppercase text-[#8a8172]">{a}</span>
                          ))}
                        </div>
                        {l.bio && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1.5 line-clamp-2">{l.bio}</p>}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {loading ? (
                    <div className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : cases.length === 0 ? (
                    <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">No cases yet — file one to get matched.</p>
                  ) : (
                    cases.map(c => (
                      <div key={c.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${c.urgency === 'urgent' ? 'bg-rose-800/10 text-rose-700 dark:text-rose-300' : 'bg-slate-800/10 text-slate-700 dark:text-slate-300'}`}>{c.urgency}</span>
                          <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{c.category}</span>
                          <span className="font-mono text-[8px] uppercase text-[#8a8172]">{c.status}</span>
                        </div>
                        <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{c.description}</p>
                        {c.status === 'open' && currentUser && c.userId !== currentUser.id && (
                          <button onClick={() => accept(c.id)} disabled={busy} className={`${btnPrimary} mt-2`}>
                            <HandHeart size={11} /> Accept case
                          </button>
                        )}
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
