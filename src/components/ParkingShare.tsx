import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ParkingSquare, Plus, Loader2, KeyRound, Search } from 'lucide-react';

/**
 * Ocean — Parking Space Sharing (Feature 234)
 * ----------------------------------------------
 * Rent out or find parking spots by area with hourly rates. Backed by /api/parking.
 */

interface ParkingShareProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Spot {
  id: string; area: string; address: string; hourlyRate: number; userName: string; note: string;
}

export default function ParkingShare({ token, currentUser, onClose }: ParkingShareProps) {
  const [visible, setVisible] = useState(true);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [filter, setFilter] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
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
      if (filter) params.set('area', filter);
      const d = await api(`/api/parking?${params.toString()}`, 'GET');
      setSpots(d.spots || []);
    } catch { /* ignore */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!address.trim()) return toast('Address is required.');
    if (!hourlyRate || Number(hourlyRate) <= 0) return toast('A positive hourly rate is required.');
    setBusy(true);
    try {
      await api('/api/parking', 'POST', { area, address, hourlyRate: Number(hourlyRate), note });
      toast('Spot listed for rent.');
      setArea(''); setAddress(''); setHourlyRate(''); setNote('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const book = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/parking/${id}/book`, 'POST');
      toast('Booked! Coordinate with the owner via chat.');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Parking share</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-slate-800/10 dark:bg-slate-400/10 flex items-center justify-center">
                  <ParkingSquare className="text-slate-800 dark:text-slate-300" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Parking Space Sharing</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Rent driveways &amp; garages by the hour</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> List a spot</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={area} onChange={e => setArea(e.target.value)} placeholder="Area" />
                    <input className={input} type="number" min={0} step="0.5" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="Hourly rate (BDT)" />
                  </div>
                  <input className={input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Address / landmark" />
                  <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Note (gated? camera? timing)" />
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} List spot
                  </button>
                </div>
              )}

              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                <input className={`${input} pl-7`} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by area" />
              </div>

              <div className="space-y-2">
                {spots.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No available spots.</p>}
                {spots.map(s => (
                  <div key={s.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <ParkingSquare size={13} className="text-slate-700 dark:text-slate-300 shrink-0" />
                      <span className="flex-1 min-w-0 font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate">{s.address}</span>
                      <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{s.hourlyRate}/hr</span>
                    </div>
                    <div className="text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-0.5">{s.area || '—'} · by {s.userName}</div>
                    {s.note && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{s.note}</p>}
                    {currentUser && (
                      <button onClick={() => book(s.id)} disabled={busy} className={`${btnPrimary} mt-2`}><KeyRound size={11} /> Book</button>
                    )}
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
