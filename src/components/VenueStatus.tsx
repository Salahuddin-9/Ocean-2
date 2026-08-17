import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, Plus, Loader2, Clock } from 'lucide-react';

/**
 * Ocean — Religious Venue Live Status (Feature 225)
 * ----------------------------------------------------
 * Community-reported live status of venues (open/busy/closed/event).
 * Statuses expire after 12 hours. Backed by /api/venues.
 */

interface VenueStatusProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Status { id: string; venue: string; type: string; status: string; note: string; reportedByName: string; at: number }

const STATUS_TONES: Record<string, string> = {
  open: 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300',
  busy: 'bg-amber-800/10 text-amber-700 dark:text-amber-300',
  closed: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  event: 'bg-indigo-800/10 text-indigo-700 dark:text-indigo-300',
};

export default function VenueStatus({ token, currentUser, onClose }: VenueStatusProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<Status[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [venue, setVenue] = useState('');
  const [type, setType] = useState('Mosque');
  const [status, setStatus] = useState('open');
  const [note, setNote] = useState('');
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
      if (filter) params.set('type', filter);
      const d = await api(`/api/venues?${params.toString()}`, 'GET');
      setList(d.statuses || []);
      setTypes(d.types || []);
    } catch { /* ignore */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const report = async () => {
    if (!venue.trim()) return toast('Venue name is required.');
    setBusy(true);
    try {
      await api('/api/venues', 'POST', { venue, type, status, note });
      toast('Status reported — visible for 12 hours.');
      setVenue(''); setNote('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Venue status</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-indigo-800/10 dark:bg-indigo-400/10 flex items-center justify-center">
                  <Building2 className="text-indigo-800 dark:text-indigo-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Venue Live Status</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Crowd &amp; opening status, community-reported</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Report a status</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={venue} onChange={e => setVenue(e.target.value)} placeholder="Venue name" />
                    <select className={input} value={type} onChange={e => setType(e.target.value)}>
                      {(types.length ? types : ['Mosque', 'Temple', 'Church', 'Mandir', 'Community hall']).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-1.5">
                    {['open', 'busy', 'closed', 'event'].map(s => (
                      <button key={s} onClick={() => setStatus(s)}
                        className={`flex-1 px-2 py-1.5 rounded-xl text-[9px] font-mono uppercase font-bold transition-all ${status === s ? 'bg-indigo-800 text-white' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Note (e.g. Eid jamaat at 8:30am)" />
                  <button onClick={report} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Report
                  </button>
                </div>
              )}

              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setFilter('')} className={`px-2 py-1 rounded-full text-[9px] font-mono uppercase transition-all ${!filter ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-white border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>All</button>
                {types.map(t => (
                  <button key={t} onClick={() => setFilter(t)} className={`px-2 py-1 rounded-full text-[9px] font-mono uppercase transition-all ${filter === t ? 'bg-[#3a342a] text-[#f4f1ea]' : 'bg-white border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>{t}</button>
                ))}
              </div>

              <div className="space-y-2">
                {list.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No reports yet.</p>}
                {list.map(s => (
                  <div key={s.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{s.venue}</span>
                      <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${STATUS_TONES[s.status] || STATUS_TONES.open}`}>{s.status}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-1">
                      <Clock size={9} /> {new Date(s.at).toLocaleTimeString()} · {s.reportedByName}
                    </div>
                    {s.note && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1">{s.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
