import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, HeartHandshake, Loader2, Sparkles } from 'lucide-react';

/**
 * Ocean — Compatibility Matrix (Feature 220)
 * ---------------------------------------------
 * Score compatibility with another user across interests, values, lifestyle
 * and region. Backed by /api/match/compatibility.
 */

interface CompatibilityMatrixProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Detail { dimension: string; score: number; a: string[] | string; b: string[] | string }

export default function CompatibilityMatrix({ token, currentUser, onClose }: CompatibilityMatrixProps) {
  const [visible, setVisible] = useState(true);
  const [targetId, setTargetId] = useState('');
  const [result, setResult] = useState<{ score: number; detail: Detail[]; targetName: string } | null>(null);
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

  const check = async () => {
    if (!targetId.trim()) return toast('Enter the other user id.');
    setBusy(true);
    try {
      const d = await api('/api/match/compatibility', 'POST', { targetUserId: targetId.trim() });
      setResult(d);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const tone = (score: number) => score >= 70 ? 'text-emerald-600' : score >= 45 ? 'text-amber-600' : 'text-rose-600';

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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Compatibility</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-rose-800/10 dark:bg-rose-400/10 flex items-center justify-center">
                  <HeartHandshake className="text-rose-800 dark:text-rose-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Compatibility Matrix</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Interests · values · lifestyle · region</p>
                </div>
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to check compatibility.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input className={`${input} flex-1`} value={targetId} onChange={e => setTargetId(e.target.value)} placeholder="Other user id" />
                    <button onClick={check} disabled={busy} className={btnPrimary}>
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Check
                    </button>
                  </div>
                  {result && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40 text-center space-y-3">
                      <div>
                        <div className={`font-display text-5xl font-bold ${tone(result.score)}`}>{result.score}</div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 mt-1">with {result.targetName}</div>
                      </div>
                      <div className="space-y-1.5">
                        {result.detail.map(d => (
                          <div key={d.dimension} className="flex items-center gap-2">
                            <span className="w-24 text-left font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">{d.dimension}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                              <div className={`h-full rounded-full ${d.score >= 70 ? 'bg-emerald-500' : d.score >= 45 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${d.score}%` }} />
                            </div>
                            <span className={`w-8 text-right font-mono text-[10px] font-bold ${tone(d.score)}`}>{d.score}</span>
                          </div>
                        ))}
                      </div>
                      <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                        Unknown preferences score neutral — fill your profile for accurate matches.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
