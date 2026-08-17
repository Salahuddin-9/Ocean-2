import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Briefcase, Plus, Send, Loader2, MapPin, UserRound } from 'lucide-react';

/**
 * Ocean — Internship Board (Feature 196)
 * ---------------------------------------
 * Browse/post internships and apply with a note. Posters review applications
 * and accept or reject. Backed by /api/internships.
 */

interface InternshipBoardProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface App { id: string; userId: string; userName: string; note: string; status: string; at: number }
interface Internship {
  id: string; company: string; role: string; location: string; type: string;
  stipend: string; duration: string; description: string; postedByName: string;
  postedBy: string; applications: App[] | number; appliedByMe?: boolean; createdAt: number;
}

export default function InternshipBoard({ token, currentUser, onClose }: InternshipBoardProps) {
  const [visible, setVisible] = useState(true);
  const [tab, setTab] = useState<'browse' | 'post' | 'mine'>('browse');
  const [list, setList] = useState<Internship[]>([]);
  const [posted, setPosted] = useState<Internship[]>([]);
  const [applied, setApplied] = useState<Internship[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('remote');
  const [stipend, setStipend] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
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
      const [b, m] = await Promise.all([
        api('/api/internships', 'GET'),
        currentUser ? api('/api/internships/mine', 'GET').catch(() => null) : Promise.resolve(null),
      ]);
      setList(b.internships || []);
      setPosted(m?.posted || []);
      setApplied(m?.applied || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!company.trim() || !role.trim()) return toast('Company and role are required.');
    setBusy(true);
    try {
      await api('/api/internships', 'POST', { company, role, location, type, stipend, duration, description });
      toast('Internship posted.');
      setCompany(''); setRole(''); setLocation(''); setStipend(''); setDuration(''); setDescription('');
      setTab('browse');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const apply = async (id: string) => {
    const note = window.prompt('Short note to the recruiter (optional):') || '';
    if (note === null) return;
    setBusy(true);
    try {
      await api(`/api/internships/${id}/apply`, 'POST', { note });
      toast('Application sent.');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const respond = async (id: string, appId: string, status: string) => {
    try {
      await api(`/api/internships/${id}/applications/${appId}/respond`, 'POST', { status });
      toast(status === 'accepted' ? 'Application accepted.' : 'Application rejected.');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Internship board</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-indigo-800/10 dark:bg-indigo-400/10 flex items-center justify-center">
                  <Briefcase className="text-indigo-800 dark:text-indigo-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Internship Board</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Postings &amp; applications</p>
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

              {loading ? (
                <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Loading…
                </div>
              ) : tab === 'post' ? (
                <div className="space-y-2">
                  <input className={input} value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" />
                  <input className={input} value={role} onChange={e => setRole(e.target.value)} placeholder="Role (e.g. Frontend Intern)" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" />
                    <select className={input} value={type} onChange={e => setType(e.target.value)}>
                      <option value="remote">Remote</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option>
                    </select>
                    <input className={input} value={stipend} onChange={e => setStipend(e.target.value)} placeholder="Stipend (e.g. 8,000/mo)" />
                    <input className={input} value={duration} onChange={e => setDuration(e.target.value)} placeholder="Duration (e.g. 3 months)" />
                  </div>
                  <textarea className={`${input} resize-none`} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description & requirements" />
                  <button onClick={post} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Post internship
                  </button>
                </div>
              ) : tab === 'mine' ? (
                <div className="space-y-4">
                  <div>
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-2">My postings ({posted.length})</div>
                    {posted.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">Nothing posted yet.</p>}
                    {posted.map(p => (
                      <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 mb-2 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{p.role} @ {p.company}</span>
                          <span className="font-mono text-[9px] text-[#8a8172]">{Array.isArray(p.applications) ? p.applications.length : p.applications} app{(Array.isArray(p.applications) ? p.applications.length : p.applications) === 1 ? '' : 's'}</span>
                        </div>
                        {Array.isArray(p.applications) && p.applications.map(a => (
                          <div key={a.id} className="mt-2 rounded-xl bg-white dark:bg-zinc-800 p-2 border border-[#ebdcca] dark:border-zinc-700">
                            <div className="flex items-center gap-2">
                              <UserRound size={11} className="text-[#8a8172]" />
                              <span className="flex-1 text-[10px] font-bold text-[#3a342a] dark:text-zinc-100">{a.userName}</span>
                              <span className="font-mono text-[8px] uppercase text-[#8a8172]">{a.status}</span>
                            </div>
                            {a.note && <p className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-1">{a.note}</p>}
                            {a.status === 'pending' && (
                              <div className="flex gap-1.5 mt-2">
                                <button onClick={() => respond(p.id, a.id, 'accepted')} className="px-2 py-1 rounded-lg bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono uppercase font-bold hover:bg-emerald-800/20">Accept</button>
                                <button onClick={() => respond(p.id, a.id, 'rejected')} className="px-2 py-1 rounded-lg bg-rose-800/10 text-rose-700 dark:text-rose-300 text-[9px] font-mono uppercase font-bold hover:bg-rose-800/20">Reject</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-2">My applications ({applied.length})</div>
                    {applied.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No applications yet.</p>}
                    {applied.map(p => (
                      <div key={p.id} className="flex items-center gap-2 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 px-3 py-2 mb-2 bg-white/60 dark:bg-zinc-950/40">
                        <span className="flex-1 text-xs text-[#3a342a] dark:text-zinc-100">{p.role} @ {p.company}</span>
                        <span className="font-mono text-[8px] uppercase text-[#8a8172]">{(p as any).myApp?.status || 'pending'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {list.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">No internships yet — post the first one!</p>}
                  {list.map(p => (
                    <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs text-[#3a342a] dark:text-zinc-100">{p.role}</div>
                          <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{p.company}</div>
                          <div className="flex flex-wrap gap-2 mt-1.5 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500">
                            <span className="flex items-center gap-0.5"><MapPin size={9} /> {p.location || 'Remote'}</span>
                            <span>{p.type}</span>
                            {p.stipend && <span>{p.stipend}</span>}
                            {p.duration && <span>{p.duration}</span>}
                          </div>
                          {p.description && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1.5 line-clamp-3">{p.description}</p>}
                        </div>
                        {currentUser && !p.appliedByMe && p.postedBy !== currentUser.id && (
                          <button onClick={() => apply(p.id)} disabled={busy} className={`${btnPrimary} shrink-0`}>
                            <Send size={10} /> Apply
                          </button>
                        )}
                        {p.appliedByMe && <span className="font-mono text-[8px] uppercase bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full shrink-0">Applied</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
