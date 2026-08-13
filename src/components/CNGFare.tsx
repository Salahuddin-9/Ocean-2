import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CarTaxiFront, Loader2, Calculator, Send } from 'lucide-react';

/**
 * Ocean — Real-Time CNG Fare Negotiator (Feature 233)
 * ------------------------------------------------------
 * Distance-based CNG fare calculator + community fare reports so you know
 * what a fair price actually is. Backed by /api/cng/*.
 */

interface CNGFareProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Report { id: string; from: string; to: string; km: number; paid: number; userName: string; note: string; at: number }
interface Fare { km: number; low: number; high: number; perKm: number; flag: number }

export default function CNGFare({ token, currentUser, onClose }: CNGFareProps) {
  const [visible, setVisible] = useState(true);
  const [km, setKm] = useState('');
  const [fare, setFare] = useState<Fare | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rKm, setRKm] = useState('');
  const [paid, setPaid] = useState('');
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
      const d = await api('/api/cng/reports', 'GET');
      setReports(d.reports || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const calc = async () => {
    if (!km || Number(km) <= 0) return toast('Enter a distance in km.');
    setBusy(true);
    try {
      const d = await api('/api/cng/fare', 'POST', { km: Number(km) });
      setFare(d.fare);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const report = async () => {
    if (!rKm || !paid) return toast('km and paid amount are required.');
    setBusy(true);
    try {
      await api('/api/cng/reports', 'POST', { from, to, km: Number(rKm), paid: Number(paid), note });
      toast('Fare report saved — helps everyone negotiate.');
      setFrom(''); setTo(''); setRKm(''); setPaid(''); setNote('');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">CNG fare</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-yellow-800/10 dark:bg-yellow-400/10 flex items-center justify-center">
                  <CarTaxiFront className="text-yellow-800 dark:text-yellow-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">CNG Fare Negotiator</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Fair-price radar + community reports</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Calculator size={11} className="inline" /> Estimate a fare</div>
                <div className="flex gap-2">
                  <input className={`${input} flex-1`} type="number" min={0.1} step={0.1} value={km} onChange={e => setKm(e.target.value)} placeholder="Distance (km)" onKeyDown={e => { if (e.key === 'Enter') calc(); }} />
                  <button onClick={calc} disabled={busy} className={btnPrimary}><Calculator size={11} /> Calc</button>
                </div>
                {fare && (
                  <div className="rounded-xl bg-yellow-800/5 dark:bg-yellow-400/5 border border-yellow-300/50 dark:border-yellow-800/40 p-3 text-center">
                    <div className="font-display text-2xl font-bold text-yellow-800 dark:text-yellow-300">
                      ৳{fare.low} – ৳{fare.high}
                    </div>
                    <div className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-400 mt-1">
                      {fare.km} km · flag ৳{fare.flag} + ৳{fare.perKm}/km · negotiate between these
                    </div>
                  </div>
                )}
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Send size={11} className="inline" /> Report what you paid</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={from} onChange={e => setFrom(e.target.value)} placeholder="From" />
                    <input className={input} value={to} onChange={e => setTo(e.target.value)} placeholder="To" />
                    <input className={input} type="number" value={rKm} onChange={e => setRKm(e.target.value)} placeholder="Distance (km)" />
                    <input className={input} type="number" value={paid} onChange={e => setPaid(e.target.value)} placeholder="Paid (BDT)" />
                  </div>
                  <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Note (meter? negotiated?)" />
                  <button onClick={report} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Report fare
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Community reports</div>
                {reports.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No reports yet — be the first!</p>}
                {reports.map(r => (
                  <div key={r.id} className="rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-[#3a342a] dark:text-zinc-100">
                      <span className="flex-1 min-w-0 truncate">{r.from || '—'} → {r.to || '—'}</span>
                      <span className="font-mono font-bold text-yellow-700 dark:text-yellow-300">৳{r.paid}</span>
                    </div>
                    <div className="text-[9px] font-mono uppercase text-[#8a8172] mt-0.5">{r.km} km · {r.userName}{r.note ? ` · ${r.note}` : ''}</div>
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
