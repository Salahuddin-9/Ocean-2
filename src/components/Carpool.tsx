import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CarFront, Bike, Plus, Loader2, Users, Search } from 'lucide-react';

/**
 * Ocean — Office Carpooling Lane (231) + Bike Pooling for Students (232)
 * ------------------------------------------------------------------------
 * Post rides (car or bike), take a seat on others' rides. Backed by /api/carpool.
 */

interface CarpoolProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
  initialKind?: 'car' | 'bike';
}

interface Ride {
  id: string; kind: 'car' | 'bike'; area: string; route: string; time: string; seats: number;
  userId: string; userName: string; riders: { id: string; name: string }[]; note: string;
}

export default function Carpool({ token, currentUser, onClose, initialKind = 'car' }: CarpoolProps) {
  const [visible, setVisible] = useState(true);
  const [kind, setKind] = useState<'car' | 'bike'>(initialKind);
  const [rides, setRides] = useState<Ride[]>([]);
  const [filter, setFilter] = useState('');
  const [area, setArea] = useState('');
  const [route, setRoute] = useState('');
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState('2');
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
      const params = new URLSearchParams({ kind });
      if (filter) params.set('area', filter);
      const d = await api(`/api/carpool?${params.toString()}`, 'GET');
      setRides(d.rides || []);
    } catch { /* ignore */ }
  }, [kind, filter]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!route.trim()) return toast('Route is required.');
    setBusy(true);
    try {
      await api('/api/carpool', 'POST', { kind, area, route, time, seats: Number(seats) || 1, note });
      toast(kind === 'car' ? 'Ride posted — colleagues can join.' : 'Bike pool posted — students can join.');
      setArea(''); setRoute(''); setTime(''); setNote('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const join = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/carpool/${id}/join`, 'POST');
      toast('Seat taken!');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Carpool / bike pool</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-blue-800/10 dark:bg-blue-400/10 flex items-center justify-center">
                  {kind === 'car' ? <CarFront className="text-blue-800 dark:text-blue-400" size={17} /> : <Bike className="text-blue-800 dark:text-blue-400" size={17} />}
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Ride Pooling</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Office carpool lane · student bike pool</p>
                </div>
              </div>

              <div className="flex gap-1.5">
                {(['car', 'bike'] as const).map(k => (
                  <button key={k} onClick={() => setKind(k)}
                    className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${kind === k ? 'bg-blue-800 text-white' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                    {k === 'car' ? 'Car pool' : 'Bike pool'}
                  </button>
                ))}
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Post a ride</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={area} onChange={e => setArea(e.target.value)} placeholder="Area" />
                    <input className={input} value={time} onChange={e => setTime(e.target.value)} placeholder="Time (e.g. 8:30am)" />
                  </div>
                  <input className={input} value={route} onChange={e => setRoute(e.target.value)} placeholder="Route (e.g. Mirpur → Motijheel)" />
                  <div className="flex gap-2">
                    <input className={`${input} w-28`} type="number" min={1} max={6} value={seats} onChange={e => setSeats(e.target.value)} placeholder="Seats" />
                    <input className={`${input} flex-1`} value={note} onChange={e => setNote(e.target.value)} placeholder="Note (cost share, pickup point)" />
                  </div>
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Post {kind === 'car' ? 'car' : 'bike'} ride
                  </button>
                </div>
              )}

              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-[#8a8172]" />
                <input className={`${input} pl-7`} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by area" />
              </div>

              <div className="space-y-2">
                {rides.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No rides yet.</p>}
                {rides.map(r => {
                  const full = r.riders.length >= r.seats;
                  const joinedMe = r.riders.some(x => x.id === currentUser?.id);
                  return (
                    <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        {r.kind === 'car' ? <CarFront size={13} className="text-blue-700 dark:text-blue-300 shrink-0" /> : <Bike size={13} className="text-blue-700 dark:text-blue-300 shrink-0" />}
                        <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{r.route}</span>
                        <span className="flex items-center gap-1 text-[9px] font-mono uppercase text-[#8a8172]"><Users size={10} /> {r.riders.length}/{r.seats}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-0.5">
                        <span>{r.area || '—'}</span>{r.time && <span>· {r.time}</span>}<span>· {r.userName}</span>
                      </div>
                      {r.note && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{r.note}</p>}
                      {currentUser && r.userId !== currentUser.id && !joinedMe && !full && (
                        <button onClick={() => join(r.id)} disabled={busy} className={`${btnPrimary} mt-2`}><Users size={11} /> Take seat</button>
                      )}
                      {joinedMe && <span className="inline-block mt-2 font-mono text-[8px] uppercase bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">You're on this ride</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
