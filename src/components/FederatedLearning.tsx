import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BrainCircuit, Upload, Loader2, Activity } from 'lucide-react';
import SimulationModeBadge from './SimulationModeBadge';

/**
 * Ocean — Federated Learning Node (Feature 241)
 * ----------------------------------------------
 * Your device trains a tiny model on YOUR engagement data and reports only
 * deltas. The server aggregates into the global recommendation model.
 * Raw data never leaves the device. Backed by /api/fed.
 */

interface FederatedLearningProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface FedModel { name: string; version: number; globalParams: Record<string, number> }
interface FedStatus { contributions: number; totalSamples: number; lastAt: number | null }

export default function FederatedLearning({ token, currentUser, onClose }: FederatedLearningProps) {
  const [visible, setVisible] = useState(true);
  const [model, setModel] = useState<FedModel | null>(null);
  const [status, setStatus] = useState<FedStatus | null>(null);
  const [deltas, setDeltas] = useState<Record<string, number>>({
    engagementWeight: 0.02, diversityWeight: -0.01, trustWeight: 0.01, freshnessWeight: 0,
  });
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
      const [m, s] = await Promise.all([api('/api/fed/model', 'GET'), api('/api/fed/status', 'GET')]);
      setModel(m.model || null);
      setStatus(s || null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/fed/update', 'POST', { delta: deltas, samples: 120 });
      toast('Local delta accepted — global model updated (FedAvg).');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Federated learning</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-cyan-800/10 dark:bg-cyan-400/10 flex items-center justify-center">
                  <BrainCircuit className="text-cyan-800 dark:text-cyan-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Federated Learning Node</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Train locally, share only deltas · feature 241</p>
                </div>
              </div>

              <SimulationModeBadge
                title="Hand-tuned deltas stand in for real on-device training"
                detail="The sliders let you express a local-model delta, and the server aggregates it FedAvg-style — but no real gradient descent runs on this device. A production node would train a small model on-device (TF.js / ONNX Runtime) from actual engagement data, add secure aggregation + differential privacy, and upload only encrypted weight deltas."
              />

              {model && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Activity size={11} className="inline" /> Global model · v{model.version}</span>
                  </div>
                  <div className="space-y-1.5">
                    {(Object.entries(model.globalParams) as [string, number][]).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500 w-36">{k}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                          <div className="h-full bg-cyan-700 dark:bg-cyan-400 rounded-full" style={{ width: `${Math.min(100, v * 100)}%` }} />
                        </div>
                        <span className="font-mono text-[9px] text-[#3a342a] dark:text-zinc-300 w-12 text-right">{v.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Upload size={11} className="inline" /> Report local training delta</div>
                  <div className="space-y-1.5">
                    {(Object.entries(deltas) as [string, number][]).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500 w-36">{k}</span>
                        <input
                          type="range" min={-0.1} max={0.1} step={0.005}
                          value={v}
                          onChange={e => setDeltas(d => ({ ...d, [k]: Number(e.target.value) }))}
                          className="flex-1 accent-cyan-700 dark:accent-cyan-400"
                        />
                        <span className="font-mono text-[9px] text-[#3a342a] dark:text-zinc-300 w-12 text-right">{v.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Submit delta ({status?.totalSamples || 0} samples so far)
                  </button>
                  <p className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-500">Raw data never leaves your device — the server only sees aggregated deltas.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
