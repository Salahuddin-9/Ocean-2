import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Luggage, Plus, Loader2, Users, Wallet } from 'lucide-react';

/**
 * Ocean — Trip Planner with Group Budget (Feature 230)
 * -------------------------------------------------------
 * Collaborative trips with a shared budget ledger. Backed by /api/trips.
 */

interface GroupTripProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Expense { id: string; label: string; amount: number; byName: string }
interface Trip {
  id: string; name: string; destination: string; startDate: number; budget: number;
  expenses: Expense[]; members: { id: string; name: string }[]; joined: boolean;
}

export default function GroupTrip({ token, currentUser, onClose }: GroupTripProps) {
  const [visible, setVisible] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selected, setSelected] = useState<Trip | null>(null);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [budget, setBudget] = useState('');
  const [expLabel, setExpLabel] = useState('');
  const [expAmount, setExpAmount] = useState('');
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
      const d = await api('/api/trips', 'GET');
      setTrips(d.trips || []);
      setSelected((sel) => sel ? d.trips.find((t: Trip) => t.id === sel.id) || null : null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return toast('Trip name is required.');
    setBusy(true);
    try {
      const d = await api('/api/trips', 'POST', { name, destination, startDate: startDate ? new Date(startDate).getTime() : 0, budget: Number(budget) || 0 });
      setName(''); setDestination(''); setBudget(''); setStartDate('');
      await load();
      setSelected(d.trip);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const toggleJoin = async (id: string) => {
    try {
      await api(`/api/trips/${id}/join`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const addExpense = async () => {
    if (!expLabel.trim() || !expAmount) return toast('Label and amount required.');
    try {
      const d = await api(`/api/trips/${selected!.id}/budget`, 'POST', { label: expLabel, amount: Number(expAmount) });
      setSelected({ ...selected!, expenses: d.expenses });
      setExpLabel(''); setExpAmount('');
      toast('Expense added.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const spent = (t: Trip) => t.expenses.reduce((a, e) => a + e.amount, 0);

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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Group trips</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-violet-800/10 dark:bg-violet-400/10 flex items-center justify-center">
                  <Luggage className="text-violet-800 dark:text-violet-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Trip Planner</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Group itinerary + shared budget</p>
                </div>
              </div>

              {selected ? (
                <div className="space-y-3">
                  <button onClick={() => setSelected(null)} className="text-[10px] font-mono uppercase text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100">← All trips</button>
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">{selected.name}</div>
                        <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">
                          {selected.destination || 'TBD'}{selected.startDate ? ` · ${new Date(selected.startDate).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                      {currentUser && (
                        <button onClick={() => toggleJoin(selected.id)} className={`${btnPrimary} shrink-0`}>
                          <Users size={11} /> {selected.joined ? 'Joined' : 'Join'}
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Wallet size={13} className="text-violet-700 dark:text-violet-300" />
                      <span className="font-mono text-[10px] text-[#5c5446] dark:text-zinc-300">
                        Spent <b>{spent(selected).toLocaleString()}</b> / {selected.budget.toLocaleString()} BDT
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, (spent(selected) / Math.max(1, selected.budget)) * 100)}%` }} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-1.5">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Expenses</div>
                    {selected.expenses.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No expenses logged.</p>}
                    {selected.expenses.map(e => (
                      <div key={e.id} className="flex items-center gap-2 text-[11px] text-[#5c5446] dark:text-zinc-300">
                        <span className="flex-1">{e.label}</span>
                        <span className="text-[9px] font-mono uppercase text-[#8a8172]">{e.byName}</span>
                        <span className="font-mono font-bold text-violet-700 dark:text-violet-300">{e.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    {currentUser && (
                      <div className="flex gap-1.5 pt-1.5">
                        <input className={`${input} flex-1`} value={expLabel} onChange={e => setExpLabel(e.target.value)} placeholder="Expense (e.g. hotel night)" />
                        <input className={`${input} w-24`} type="number" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="Amount" />
                        <button onClick={addExpense} className={btnPrimary}><Plus size={11} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentUser && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Create a trip</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Trip name" />
                        <input className={input} value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination" />
                        <input className={input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <input className={input} type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Group budget (BDT)" />
                      </div>
                      <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create trip
                      </button>
                    </div>
                  )}
                  {trips.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No trips yet.</p>}
                  {trips.map(t => (
                    <button key={t.id} onClick={() => setSelected(t)}
                      className="w-full text-left rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40 hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-zinc-800/60 transition-all">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{t.name}</span>
                        {t.joined && <span className="font-mono text-[8px] uppercase bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">Joined</span>}
                      </div>
                      <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-0.5">
                        {t.destination || 'TBD'} · {t.members.length} members · {spent(t).toLocaleString()} / {t.budget.toLocaleString()} BDT
                      </div>
                    </button>
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
