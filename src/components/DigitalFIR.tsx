import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Plus, Loader2, FileText } from 'lucide-react';

/**
 * Ocean — Digital FIR / GD Lodge (Feature 212)
 * ----------------------------------------------
 * Lodge a simulated GD entry or FIR draft with a record number and track its
 * status. A live deployment would forward these to the police e-services API.
 * Backed by /api/fir.
 */

interface DigitalFIRProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface FirRecord {
  id: string; recordNo: string; kind: string; userName: string; station: string;
  category: string; description: string; status: string; lodgedAt: number;
}

export default function DigitalFIR({ token, currentUser, onClose }: DigitalFIRProps) {
  const [visible, setVisible] = useState(true);
  const [records, setRecords] = useState<FirRecord[]>([]);
  const [kind, setKind] = useState<'gd' | 'fir'>('gd');
  const [station, setStation] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
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
    if (!currentUser) return;
    try {
      const d = await api('/api/fir', 'GET');
      setRecords(d.records || []);
    } catch { /* ignore */ }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const lodge = async () => {
    if (!description.trim()) return toast('Describe the incident.');
    setBusy(true);
    try {
      const d = await api('/api/fir', 'POST', { kind, station, category, description });
      toast(`Record ${d.record.recordNo} lodged (${d.record.kind.toUpperCase()}).`);
      setStation(''); setCategory(''); setDescription('');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Digital FIR / GD</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-red-800/10 dark:bg-red-400/10 flex items-center justify-center">
                  <ShieldAlert className="text-red-800 dark:text-red-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Digital FIR / GD</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Lodge &amp; track · simulated e-services</p>
                </div>
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to lodge a record.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    In an emergency always call <b>999</b> first. Use a GD for a general diary entry
                    and an FIR draft for a criminal complaint — print it and submit at your station to make it official.
                  </p>
                  <div className="flex gap-1.5">
                    {(['gd', 'fir'] as const).map(k => (
                      <button key={k} onClick={() => setKind(k)}
                        className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all ${kind === k ? 'bg-red-800 text-white' : 'bg-white text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700'}`}>
                        {k === 'gd' ? 'General Diary' : 'FIR Draft'}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={station} onChange={e => setStation(e.target.value)} placeholder="Police station" />
                    <input className={input} value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (e.g. theft, harassment)" />
                  </div>
                  <textarea className={`${input} resize-none`} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the incident with dates, names and any evidence…" />
                  <button onClick={lodge} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Lodge {kind.toUpperCase()}
                  </button>

                  <div className="space-y-1.5">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">My records ({records.length})</div>
                    {records.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No records yet.</p>}
                    {records.map(r => (
                      <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-center gap-2">
                          <FileText size={12} className="text-red-700 dark:text-red-300 shrink-0" />
                          <span className="font-mono text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{r.recordNo}</span>
                          <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-red-800/10 text-red-700 dark:text-red-300">{r.kind}</span>
                          <span className="ml-auto font-mono text-[8px] uppercase text-[#8a8172]">{r.status}</span>
                        </div>
                        <div className="text-[9px] text-[#8a8172] dark:text-zinc-500 mt-1">{r.station}{r.category ? ` · ${r.category}` : ''} · {new Date(r.lodgedAt).toLocaleString()}</div>
                        <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{r.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
