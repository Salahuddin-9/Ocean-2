import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Vote, Landmark, Plus, Loader2, Video, CalendarClock } from 'lucide-react';

/**
 * Ocean — Ward Budget (213) + Ward Sabha (214)
 * ----------------------------------------------
 * Propose and vote on ward projects, and schedule/join online town-hall
 * meetings (Jitsi). Backed by /api/ward/*.
 */

interface WardCivicProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
  initialTab?: 'projects' | 'meetings';
}

interface Project { id: string; ward: string; title: string; desc: string; cost: string; proposedByName: string; votes: { userId: string }[]; voted: boolean; status: string }
interface Meeting { id: string; ward: string; title: string; agenda: string; meetUrl: string; hostName: string; at: number; live: boolean }

export default function WardCivic({ token, currentUser, onClose, initialTab = 'projects' }: WardCivicProps) {
  const [visible, setVisible] = useState(true);
  const [tab, setTab] = useState<'projects' | 'meetings'>(initialTab);
  const [ward, setWard] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pTitle, setPTitle] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pCost, setPCost] = useState('');
  const [mTitle, setMTitle] = useState('');
  const [mAgenda, setMAgenda] = useState('');
  const [mAt, setMAt] = useState('');
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
    try {
      const params = new URLSearchParams();
      if (ward) params.set('ward', ward);
      const [p, m] = await Promise.all([
        api(`/api/ward/projects?${params.toString()}`, 'GET'),
        api(`/api/ward/meetings?${params.toString()}`, 'GET'),
      ]);
      setProjects(p.projects || []);
      setMeetings(m.meetings || []);
    } catch { /* ignore */ }
  }, [ward]);

  useEffect(() => { load(); }, [load]);

  const propose = async () => {
    if (!ward.trim() || !pTitle.trim()) return toast('Ward and project title are required.');
    setBusy(true);
    try {
      await api('/api/ward/projects', 'POST', { ward, title: pTitle, desc: pDesc, cost: pCost });
      toast('Project proposed — residents can vote.');
      setPTitle(''); setPDesc(''); setPCost('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const vote = async (id: string) => {
    try {
      await api(`/api/ward/projects/${id}/vote`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const schedule = async () => {
    if (!ward.trim() || !mTitle.trim()) return toast('Ward and meeting title are required.');
    setBusy(true);
    try {
      const d = await api('/api/ward/meetings', 'POST', {
        ward, title: mTitle, agenda: mAgenda, at: mAt ? new Date(mAt).getTime() : Date.now(),
      });
      toast('Town hall scheduled — Jitsi link generated.');
      setMTitle(''); setMAgenda(''); setMAt('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Ward civic</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 flex items-center justify-center">
                  {tab === 'projects' ? <Vote className="text-emerald-800 dark:text-emerald-400" size={17} /> : <Landmark className="text-emerald-800 dark:text-emerald-400" size={17} />}
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Ward Civic</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Participatory budget · digital ward sabha</p>
                </div>
              </div>

              <div className="flex gap-1.5">
                {(['projects', 'meetings'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${tab === t ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/40'}`}>
                    {t === 'projects' ? 'Budget votes' : 'Ward sabha'}
                  </button>
                ))}
              </div>

              <input className={input} value={ward} onChange={e => setWard(e.target.value)} placeholder="Ward (e.g. Ward 5, Dhaka North)" />

              {tab === 'projects' ? (
                <div className="space-y-2">
                  {currentUser && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Propose a project</div>
                      <input className={input} value={pTitle} onChange={e => setPTitle(e.target.value)} placeholder="Project title" />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={input} value={pCost} onChange={e => setPCost(e.target.value)} placeholder="Estimated cost" />
                        <input className={input} value={pDesc} onChange={e => setPDesc(e.target.value)} placeholder="Short description" />
                      </div>
                      <button onClick={propose} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Propose
                      </button>
                    </div>
                  )}
                  {projects.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No projects in this ward yet.</p>}
                  {projects.map(p => (
                    <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{p.title}</span>
                        <span className="font-mono text-[9px] text-[#8a8172]">{p.votes.length} vote{p.votes.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-0.5">{p.proposedByName}{p.cost ? ` · ${p.cost}` : ''}</div>
                      {p.desc && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{p.desc}</p>}
                      {currentUser && p.status === 'proposed' && (
                        <button onClick={() => vote(p.id)} className={`${btnPrimary} mt-2 ${p.voted ? '!bg-emerald-700' : ''}`}>
                          <Vote size={11} /> {p.voted ? 'Voted' : 'Vote'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {currentUser && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Schedule town hall</div>
                      <input className={input} value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Meeting title" />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={input} type="datetime-local" value={mAt} onChange={e => setMAt(e.target.value)} />
                        <input className={input} value={mAgenda} onChange={e => setMAgenda(e.target.value)} placeholder="Agenda (comma separated)" />
                      </div>
                      <button onClick={schedule} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Schedule
                      </button>
                    </div>
                  )}
                  {meetings.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No meetings scheduled.</p>}
                  {meetings.map(m => (
                    <div key={m.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{m.title}</span>
                        {m.live && <span className="font-mono text-[8px] uppercase bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full animate-pulse">Live now</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-1">
                        <CalendarClock size={9} /> {new Date(m.at).toLocaleString()} · hosted by {m.hostName}
                      </div>
                      {m.agenda && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{m.agenda}</p>}
                      <a href={m.meetUrl} target="_blank" rel="noreferrer" className={`${btnPrimary} mt-2 inline-flex`}>
                        <Video size={11} /> Join Jitsi
                      </a>
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
