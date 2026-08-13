import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, Plus, Loader2, Check, X as XIcon } from 'lucide-react';

/**
 * Ocean — Halal Dating Timeline (Feature 221)
 * ----------------------------------------------
 * Relationship stage machine: match → getting-to-know → guardian involved →
 * engagement → nikkah. Both partners must confirm each stage.
 * Backed by /api/halal.
 */

interface HalalTimelineProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Rel { id: string; userA: string; userB: string; stage: number; pendingStage?: number; log: { stage: number; by: string; at: number }[] }

const STAGES = ['Match', 'Getting to know (chaperoned)', 'Guardian involved', 'Engagement', 'Nikkah'];

export default function HalalTimeline({ token, currentUser, onClose }: HalalTimelineProps) {
  const [visible, setVisible] = useState(true);
  const [rels, setRels] = useState<Rel[]>([]);
  const [partnerId, setPartnerId] = useState('');
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
      const d = await api('/api/halal', 'GET');
      setRels(d.relationships || []);
    } catch { /* ignore */ }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const start = async () => {
    if (!partnerId.trim()) return toast('Enter partner user id.');
    setBusy(true);
    try {
      await api('/api/halal/start', 'POST', { partnerId: partnerId.trim() });
      toast('Timeline started at Match.');
      setPartnerId('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const act = async (id: string, action: string) => {
    setBusy(true);
    try {
      const d = await api(`/api/halal/${id}/${action}`, 'POST');
      if (action === 'advance' && d.relationship?.pendingStage != null) toast('Proposed next stage — partner must confirm.');
      if (action === 'confirm') toast('Stage confirmed.');
      if (action === 'end') toast('Timeline ended.');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Halal timeline</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 flex items-center justify-center">
                  <Heart className="text-emerald-800 dark:text-emerald-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Halal Timeline</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Respectful, chaperoned progression</p>
                </div>
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to start a timeline.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input className={`${input} flex-1`} value={partnerId} onChange={e => setPartnerId(e.target.value)} placeholder="Partner user id" />
                    <button onClick={start} disabled={busy} className={btnPrimary}><Plus size={11} /> Start</button>
                  </div>
                  {rels.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No timelines yet.</p>}
                  {rels.map(r => {
                    const active = r.stage >= 0;
                    return (
                      <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40">
                        <div className="flex items-center justify-between">
                          <span className={`font-mono text-[9px] uppercase tracking-wider ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-400'}`}>
                            {active ? STAGES[r.stage] : 'Ended'}
                          </span>
                          {r.pendingStage != null && (
                            <span className="font-mono text-[8px] uppercase bg-amber-800/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full animate-pulse">Confirm pending</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-2.5">
                          {STAGES.map((s, i) => (
                            <div key={s} className="flex-1">
                              <div className={`h-1.5 rounded-full ${i <= r.stage ? 'bg-emerald-500' : 'bg-[#ebdcca] dark:bg-zinc-800'}`} />
                              <div className={`text-[7px] font-mono uppercase mt-1 text-center ${i === r.stage ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-[#8a8172]'}`}>{i + 1}</div>
                            </div>
                          ))}
                        </div>
                        {active && (
                          <div className="flex gap-1.5 mt-3">
                            {r.pendingStage != null ? (
                              <button onClick={() => act(r.id, 'confirm')} disabled={busy} className={`${btnPrimary} flex-1 justify-center !bg-emerald-700`}>
                                <Check size={11} /> Confirm stage
                              </button>
                            ) : r.stage < STAGES.length - 1 ? (
                              <button onClick={() => act(r.id, 'advance')} disabled={busy} className={`${btnPrimary} flex-1 justify-center`}>
                                <Heart size={11} /> Propose next stage
                              </button>
                            ) : (
                              <div className="flex-1 text-center font-mono text-[10px] uppercase text-emerald-700 dark:text-emerald-300">Mabrook! 🎉</div>
                            )}
                            <button onClick={() => act(r.id, 'end')} disabled={busy} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#8a8172] hover:bg-rose-50 dark:hover:bg-rose-500/10">
                              <XIcon size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    Every stage needs both partners — stages move only with mutual confirmation.
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
