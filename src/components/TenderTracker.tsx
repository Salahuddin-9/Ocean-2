import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Gavel, Plus, Loader2, AlertTriangle, CalendarClock } from 'lucide-react';

/**
 * Ocean — Transparent Tender Tracker (Feature 216)
 * ---------------------------------------------------
 * Tender listings with bids; a scanner flags bid-rigging anomalies (bids
 * within 2% of each other). Backed by /api/tenders.
 */

interface TenderTrackerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Bid { id: string; bidder: string; amount: number; at: number }
interface Tender { id: string; title: string; dept: string; budget: string; deadline: number; bids: Bid[]; status: string }
interface Anomaly { tenderId: string; title: string; pairs: { a: string; b: string; diffPct: number }[] }

export default function TenderTracker({ token, currentUser, onClose }: TenderTrackerProps) {
  const [visible, setVisible] = useState(true);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState('');
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [bidAmount, setBidAmount] = useState('');
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
      const [t, a] = await Promise.all([
        api('/api/tenders', 'GET'),
        api('/api/tenders/scan-anomalies', 'GET'),
      ]);
      setTenders(t.tenders || []);
      setAnomalies(a.anomalies || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title.trim()) return toast('Tender title is required.');
    setBusy(true);
    try {
      await api('/api/tenders', 'POST', { title, dept, budget, deadline: deadline ? new Date(deadline + 'T23:59:59').getTime() : 0 });
      toast('Tender listed.');
      setTitle(''); setDept(''); setBudget(''); setDeadline('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const bid = async (id: string) => {
    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast('Enter a positive bid amount.');
    setBusy(true);
    try {
      await api(`/api/tenders/${id}/bids`, 'POST', { amount });
      toast('Bid submitted.');
      setBidAmount('');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Tenders</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-teal-800/10 dark:bg-teal-400/10 flex items-center justify-center">
                  <Gavel className="text-teal-800 dark:text-teal-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Tender Tracker</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Transparent bidding · anomaly alerts</p>
                </div>
                {anomalies.length > 0 && (
                  <button onClick={() => setShowAnomalies(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${showAnomalies ? 'bg-amber-600 text-white' : 'bg-amber-800/10 text-amber-700 dark:text-amber-300'}`}>
                    <AlertTriangle size={11} /> {anomalies.length}
                  </button>
                )}
              </div>

              {showAnomalies && anomalies.length > 0 && (
                <div className="rounded-2xl border border-amber-300/60 dark:border-amber-700/40 bg-amber-800/5 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-amber-700 dark:text-amber-300">Possible bid-rigging (bids within 2%)</div>
                  {anomalies.map(a => (
                    <div key={a.tenderId} className="text-[10px] text-[#5c5446] dark:text-zinc-300">
                      <b>{a.title}</b>
                      {a.pairs.map((p, i) => (
                        <div key={i} className="font-mono text-[9px] text-amber-700 dark:text-amber-300 ml-2">
                          {p.a} ≈ {p.b} (Δ {p.diffPct}%)
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> List a tender</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Tender title" />
                    <input className={input} value={dept} onChange={e => setDept(e.target.value)} placeholder="Department" />
                    <input className={input} value={budget} onChange={e => setBudget(e.target.value)} placeholder="Budget range" />
                    <input className={input} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
                  </div>
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} List tender
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {tenders.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No tenders yet.</p>}
                {tenders.map(t => (
                  <div key={t.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{t.title}</span>
                      <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${t.status === 'open' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>{t.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-0.5">
                      <span>{t.dept}</span>{t.budget && <span>· {t.budget}</span>}
                      <span className="flex items-center gap-0.5"><CalendarClock size={9} /> {t.deadline ? new Date(t.deadline).toLocaleDateString() : 'no deadline'}</span>
                    </div>
                    {t.bids.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {t.bids.map(b => (
                          <div key={b.id} className="text-[10px] text-[#5c5446] dark:text-zinc-300">
                            <span className="font-mono text-[9px] text-[#8a8172]">{b.bidder}</span> — <b>{b.amount.toLocaleString()}</b>
                          </div>
                        ))}
                      </div>
                    )}
                    {currentUser && t.status === 'open' && (
                      <div className="flex gap-1.5 mt-2">
                        <input className={`${input} flex-1`} type="number" placeholder="Your bid amount" value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
                        <button onClick={() => bid(t.id)} disabled={busy} className={btnPrimary}>Bid</button>
                      </div>
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
