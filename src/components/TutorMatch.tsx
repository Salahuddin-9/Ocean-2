import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GraduationCap, Plus, Handshake, Loader2, Search } from 'lucide-react';

/**
 * Ocean — Home Tutor Matchmaking (Feature 198)
 * ---------------------------------------------
 * Post as a tutor or a student, filter by subject & area, and offer to match
 * with a complementary request. Backed by /api/tutor.
 */

interface TutorMatchProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface TutorReq {
  id: string; kind: 'tutor' | 'student'; userId: string; userName: string;
  subject: string; level: string; area: string; rate: string; availability: string;
  note: string; status: string; matchedTo?: string; createdAt: number;
  compatibilityScore?: number;
}

export default function TutorMatch({ token, currentUser, onClose }: TutorMatchProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<TutorReq[]>([]);
  const [mine, setMine] = useState<TutorReq[]>([]);
  const [subject, setSubject] = useState('');
  const [area, setArea] = useState('');
  const [tab, setTab] = useState<'browse' | 'post' | 'mine'>('browse');
  const [kind, setKind] = useState<'tutor' | 'student'>('student');
  const [subj, setSubj] = useState('');
  const [level, setLevel] = useState('');
  const [where, setWhere] = useState('');
  const [rate, setRate] = useState('');
  const [availability, setAvailability] = useState('');
  const [note, setNote] = useState('');
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
      if (subject) params.set('subject', subject);
      if (area) params.set('area', area);
      const d = await api(`/api/tutor?${params.toString()}`, 'GET');
      setList(d.requests || []);
      const m = currentUser ? await api('/api/tutor/mine', 'GET').catch(() => null) : null;
      setMine(m?.requests || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [subject, area, currentUser]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!subj.trim()) return toast('Subject is required.');
    setBusy(true);
    try {
      await api('/api/tutor', 'POST', { kind, subject: subj, level, area: where, rate, availability, note });
      toast(kind === 'tutor' ? 'Tutor request posted.' : 'Study request posted.');
      setSubj(''); setLevel(''); setWhere(''); setRate(''); setAvailability(''); setNote('');
      setTab('browse');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const offer = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/tutor/${id}/offer`, 'POST');
      toast('Matched! Coordinate via chat or comments.');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Tutor matchmaking</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-orange-800/10 dark:bg-orange-400/10 flex items-center justify-center">
                  <GraduationCap className="text-orange-800 dark:text-orange-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Tutor Matchmaking</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Home tutors ↔ students by subject &amp; area</p>
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
                    {(['student', 'tutor'] as const).map(k => (
                      <button key={k} onClick={() => setKind(k)}
                        className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${kind === k ? 'bg-orange-800 text-white' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                        {k === 'student' ? 'I need a tutor' : 'I am a tutor'}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={subj} onChange={e => setSubj(e.target.value)} placeholder="Subject (e.g. HSC Math)" />
                    <input className={input} value={level} onChange={e => setLevel(e.target.value)} placeholder="Level / class" />
                    <input className={input} value={where} onChange={e => setWhere(e.target.value)} placeholder="Area / thana" />
                    <input className={input} value={rate} onChange={e => setRate(e.target.value)} placeholder={kind === 'tutor' ? 'Rate (Tk/hr)' : 'Budget (Tk/hr)'} />
                  </div>
                  <input className={input} value={availability} onChange={e => setAvailability(e.target.value)} placeholder="Availability (e.g. after 4pm, weekends)" />
                  <textarea className={`${input} resize-none`} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Extra info" />
                  <button onClick={post} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Post request
                  </button>
                </div>
              ) : tab === 'mine' ? (
                <div className="space-y-2">
                  {mine.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">No requests yet.</p>}
                  {mine.map(r => (
                    <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${r.kind === 'tutor' ? 'bg-orange-800/10 text-orange-700 dark:text-orange-300' : 'bg-sky-800/10 text-sky-700 dark:text-sky-300'}`}>{r.kind}</span>
                        <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{r.subject} · {r.level || '—'}</span>
                        <span className="font-mono text-[8px] uppercase text-[#8a8172]">{r.status}</span>
                      </div>
                      <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-1">{r.area}{r.rate ? ` · ${r.rate}` : ''}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                      <input className={`${input} pl-7`} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject filter" />
                    </div>
                    <input className={input} value={area} onChange={e => setArea(e.target.value)} placeholder="Area filter" />
                  </div>
                  {loading ? (
                    <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : list.length === 0 ? (
                    <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-6">No open requests match.</p>
                  ) : (
                    list.map(r => (
                      <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${r.kind === 'tutor' ? 'bg-orange-800/10 text-orange-700 dark:text-orange-300' : 'bg-sky-800/10 text-sky-700 dark:text-sky-300'}`}>{r.kind}</span>
                              <span className="font-bold text-xs text-[#3a342a] dark:text-zinc-100">{r.subject}</span>
                              {typeof r.compatibilityScore === 'number' && r.compatibilityScore > 0 && (
                                <span className={`font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-full ${r.compatibilityScore >= 70 ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' : r.compatibilityScore >= 40 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-zinc-500/10 text-[#8a8172]'}`}>
                                  {r.compatibilityScore}% match
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-1">{r.userName}{r.level ? ` · ${r.level}` : ''}{r.area ? ` · ${r.area}` : ''}{r.rate ? ` · ${r.rate}` : ''}</div>
                            {r.note && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{r.note}</p>}
                          </div>
                          {currentUser && r.userId !== currentUser.id && (
                            <button onClick={() => offer(r.id)} disabled={busy} className={`${btnPrimary} shrink-0`}>
                              <Handshake size={11} /> Match
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
