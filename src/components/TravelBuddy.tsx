import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plane, Plus, Loader2, Users, Search } from 'lucide-react';

/**
 * Ocean — Travel Buddy Matching (Feature 228)
 * ----------------------------------------------
 * Match with fellow travelers on the same route & dates. Backed by /api/travel/plans.
 */

interface TravelBuddyProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Plan {
  id: string; from: string; to: string; date: number; userName: string; mode: string;
  members: { id: string; name: string }[]; note: string; createdAt: number;
  userId?: string;
}

export default function TravelBuddy({ token, currentUser, onClose }: TravelBuddyProps) {
  const [visible, setVisible] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mine, setMine] = useState<Plan[]>([]);
  const [filter, setFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [mode, setMode] = useState('');
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
      if (filter) params.set('to', filter);
      const d = await api(`/api/travel/plans?${params.toString()}`, 'GET');
      setPlans(d.plans || []);
      const m = currentUser ? await api('/api/travel/plans/mine', 'GET').catch(() => null) : null;
      setMine(m?.plans || []);
    } catch { /* ignore */ }
  }, [filter, currentUser]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!from.trim() || !to.trim()) return toast('From and to are required.');
    setBusy(true);
    try {
      await api('/api/travel/plans', 'POST', { from, to, date: date ? new Date(date).getTime() : 0, mode, note });
      toast('Travel plan posted — buddies can join.');
      setFrom(''); setTo(''); setMode(''); setNote(''); setDate('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const join = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/travel/plans/${id}/join`, 'POST');
      toast('Joined — coordinate with the group!');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Travel buddies</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-sky-800/10 dark:bg-sky-400/10 flex items-center justify-center">
                  <Plane className="text-sky-800 dark:text-sky-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Travel Buddy Matching</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Same route · same dates · shared trip</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Post a plan</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={from} onChange={e => setFrom(e.target.value)} placeholder="From" />
                    <input className={input} value={to} onChange={e => setTo(e.target.value)} placeholder="To" />
                    <input className={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
                    <input className={input} value={mode} onChange={e => setMode(e.target.value)} placeholder="Mode (bus/train/plane)" />
                  </div>
                  <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Note (e.g. splitting CNG from station)" />
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Post plan
                  </button>
                </div>
              )}

              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                <input className={`${input} pl-7`} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by destination" />
              </div>

              <div className="space-y-2">
                {plans.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No plans yet.</p>}
                {plans.map(p => (
                  <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{p.from} → {p.to}</span>
                      <span className="flex items-center gap-1 text-[9px] font-mono uppercase text-[#8a8172]"><Users size={10} /> {p.members.length}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-0.5">
                      {p.date ? new Date(p.date).toLocaleDateString() : 'Flexible'} · {p.mode} · by {p.userName}
                    </div>
                    {p.note && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{p.note}</p>}
                    {currentUser && p.userId !== currentUser.id && !p.members.some(m => m.id === currentUser.id) && (
                      <button onClick={() => join(p.id)} disabled={busy} className={`${btnPrimary} mt-2`}><Users size={11} /> Join</button>
                    )}
                  </div>
                ))}
              </div>

              {mine.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-1.5">My plans ({mine.length})</div>
                  {mine.map(p => (
                    <div key={p.id} className="text-[10px] text-[#5c5446] dark:text-zinc-300 mb-1">• {p.from} → {p.to} · {p.members.length} buddy{p.members.length === 1 ? '' : 'ies'}</div>
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
