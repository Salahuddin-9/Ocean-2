import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Plus, Loader2, Check, MapPin } from 'lucide-react';

/**
 * Ocean — Traffic Violation Witness (Feature 235)
 * --------------------------------------------------
 * Report violations with vehicle number + evidence; community confirmations
 * add weight. Backed by /api/traffic.
 */

interface TrafficWitnessProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Report { id: string; vehicleNo: string; category: string; location: string; desc: string; userName: string; confirms: string[]; at: number }

export default function TrafficWitness({ token, currentUser, onClose }: TrafficWitnessProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<Report[]>([]);
  const [vehicleNo, setVehicleNo] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [desc, setDesc] = useState('');
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
      const d = await api('/api/traffic', 'GET');
      setList(d.reports || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!vehicleNo.trim()) return toast('Vehicle number is required.');
    setBusy(true);
    try {
      await api('/api/traffic', 'POST', { vehicleNo, category, location, desc });
      toast('Report filed — confirmations add weight.');
      setVehicleNo(''); setCategory(''); setLocation(''); setDesc('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const confirm = async (id: string) => {
    try {
      await api(`/api/traffic/${id}/confirm`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Traffic witness</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-red-800/10 dark:bg-red-400/10 flex items-center justify-center">
                  <Camera className="text-red-800 dark:text-red-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Traffic Witness</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Community-verified violation reports</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Report a violation</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={`${input} uppercase tracking-widest`} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} placeholder="Vehicle no. (e.g. ঢাকা-মেট্রো-গ-12-3456)" />
                    <select className={input} value={category} onChange={e => setCategory(e.target.value)}>
                      {['Wrong way', 'Signal jump', 'Overtaking on zebra', 'No helmet', 'Dangerous driving', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <input className={input} value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" />
                  <input className={input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description / time" />
                  <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} File report
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {list.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No reports yet.</p>}
                {list.map(r => (
                  <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-red-700 dark:text-red-300">{r.vehicleNo}</span>
                      <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-red-800/10 text-red-700 dark:text-red-300">{r.category}</span>
                      <span className="ml-auto font-mono text-[9px] text-[#8a8172]">{r.confirms.length} confirm{r.confirms.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-0.5">
                      <MapPin size={9} /> {r.location || '—'} · {r.userName} · {new Date(r.at).toLocaleTimeString()}
                    </div>
                    {r.desc && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{r.desc}</p>}
                    {currentUser && !r.confirms.includes(currentUser.id) && (
                      <button onClick={() => confirm(r.id)} className={`${btnPrimary} mt-2`}><Check size={11} /> Confirm</button>
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
