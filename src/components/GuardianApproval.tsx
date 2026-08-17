import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, UserPlus, Loader2, Check, X as XIcon } from 'lucide-react';

/**
 * Ocean — Trusted Guardian for Minors (Feature 205)
 * ---------------------------------------------------
 * Request a guardian by user id; the guardian approves or rejects the request.
 * Approved guardians see a safety dashboard marker (no message content).
 * Backed by /api/guardian.
 */

interface GuardianApprovalProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Approval {
  id: string; minorId: string; minorName: string;
  guardianId: string; guardianName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: number;
}

export default function GuardianApproval({ token, currentUser, onClose }: GuardianApprovalProps) {
  const [visible, setVisible] = useState(true);
  const [guardianId, setGuardianId] = useState('');
  const [asMinor, setAsMinor] = useState<Approval[]>([]);
  const [asGuardian, setAsGuardian] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      const d = await api('/api/guardian', 'GET');
      setAsMinor(d.asMinor || []);
      setAsGuardian(d.asGuardian || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const request = async () => {
    if (!guardianId.trim()) return toast('Enter the guardian user id.');
    setBusy(true);
    try {
      const d = await api('/api/guardian/request', 'POST', { guardianId: guardianId.trim() });
      toast(`Request sent to ${d.approval.guardianName}.`);
      setGuardianId('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const respond = async (id: string, status: string) => {
    setBusy(true);
    try {
      await api(`/api/guardian/${id}/respond`, 'POST', { status });
      toast(status === 'approved' ? 'Approved — you are now their trusted guardian.' : 'Request rejected.');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/guardian/${id}/remove`, 'POST');
      toast('Pairing removed.');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const statusBadge = (s: string) => {
    const tone = s === 'approved' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : s === 'pending' ? 'bg-amber-800/10 text-amber-700 dark:text-amber-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
    return <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${tone}`}>{s}</span>;
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Trusted guardian</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-sky-800/10 dark:bg-sky-400/10 flex items-center justify-center">
                  <ShieldCheck className="text-sky-800 dark:text-sky-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Trusted Guardian</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Guardian approval workflow</p>
                </div>
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to manage guardians.</p>
              ) : loading ? (
                <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Loading…
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    Ask a trusted adult (by their user id) to be your guardian, or approve requests you receive.
                    Guardians never see private message content — only a safety dashboard marker.
                  </p>
                  <div className="flex gap-2">
                    <input className={`${input} flex-1`} value={guardianId} onChange={e => setGuardianId(e.target.value)} placeholder="Guardian user id" />
                    <button onClick={request} disabled={busy} className={btnPrimary}><UserPlus size={11} /> Request</button>
                  </div>

                  <div>
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-2">My guardians ({asMinor.length})</div>
                    {asMinor.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No guardian requests yet.</p>}
                    {asMinor.map(a => (
                      <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 px-3 py-2 mb-1.5 bg-white/60 dark:bg-zinc-950/40">
                        <span className="flex-1 text-xs text-[#3a342a] dark:text-zinc-100">{a.guardianName}</span>
                        {statusBadge(a.status)}
                        {a.status === 'approved' && (
                          <button onClick={() => remove(a.id)} className="text-[#8a8172] hover:text-rose-500"><XIcon size={13} /></button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-2">Requests to me ({asGuardian.length})</div>
                    {asGuardian.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No one has requested you yet.</p>}
                    {asGuardian.map(a => (
                      <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 px-3 py-2 mb-1.5 bg-white/60 dark:bg-zinc-950/40">
                        <ShieldCheck size={13} className="text-sky-700 dark:text-sky-300 shrink-0" />
                        <span className="flex-1 text-xs text-[#3a342a] dark:text-zinc-100">{a.minorName}</span>
                        {a.status === 'pending' ? (
                          <>
                            <button onClick={() => respond(a.id, 'approved')} disabled={busy} className="px-2 py-1 rounded-lg bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono uppercase font-bold hover:bg-emerald-800/20"><Check size={10} className="inline" /> Approve</button>
                            <button onClick={() => respond(a.id, 'rejected')} disabled={busy} className="px-2 py-1 rounded-lg bg-rose-800/10 text-rose-700 dark:text-rose-300 text-[9px] font-mono uppercase font-bold hover:bg-rose-800/20">Reject</button>
                          </>
                        ) : statusBadge(a.status)}
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
