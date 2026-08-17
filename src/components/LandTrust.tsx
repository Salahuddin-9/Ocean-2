import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, LandPlot, Plus, Loader2, Vote, MapPin } from 'lucide-react';

/**
 * Ocean — Community Land Trust (Feature 217)
 * ---------------------------------------------
 * Simplified DAO-style land ownership: parcels, members and approval votes.
 * A parcel becomes "approved" when a majority of members vote yes.
 * Backed by /api/clt.
 */

interface LandTrustProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Parcel {
  id: string; name: string; location: string; purpose: string;
  members: string[]; approvals: string[]; status: string; createdAt: number;
}

export default function LandTrust({ token, currentUser, onClose }: LandTrustProps) {
  const [visible, setVisible] = useState(true);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [purpose, setPurpose] = useState('');
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
      const d = await api('/api/clt', 'GET');
      setParcels(d.parcels || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return toast('Parcel name is required.');
    setBusy(true);
    try {
      await api('/api/clt', 'POST', { name, location, purpose });
      toast('Parcel created — invite members to approve.');
      setName(''); setLocation(''); setPurpose('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const approve = async (id: string) => {
    setBusy(true);
    try {
      const d = await api(`/api/clt/${id}/approve`, 'POST');
      toast(d.parcel.status === 'approved' ? 'Trust approved by the community! 🎉' : 'Approval recorded.');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Land trust</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-lime-800/10 dark:bg-lime-400/10 flex items-center justify-center">
                  <LandPlot className="text-lime-800 dark:text-lime-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Community Land Trust</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Community-owned land · DAO-style votes</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Register a parcel</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Parcel name" />
                    <input className={input} value={location} onChange={e => setLocation(e.target.value)} placeholder="Location / khatian" />
                  </div>
                  <input className={input} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Purpose (e.g. community garden, housing)" />
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Register parcel
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {parcels.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No parcels yet.</p>}
                {parcels.map(p => (
                  <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-bold text-xs text-[#3a342a] dark:text-zinc-100">{p.name}</span>
                      <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${p.status === 'approved' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-800/10 text-amber-700 dark:text-amber-300'}`}>{p.status}</span>
                    </div>
                    {p.location && <div className="flex items-center gap-1 text-[9px] text-[#8a8172] dark:text-zinc-500 mt-0.5"><MapPin size={9} /> {p.location}</div>}
                    {p.purpose && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{p.purpose}</p>}
                    <div className="text-[9px] font-mono uppercase text-[#8a8172] dark:text-zinc-500 mt-1.5">
                      {p.approvals.length} approval{p.approvals.length === 1 ? '' : 's'} · {p.members.length} member{p.members.length === 1 ? '' : 's'}
                    </div>
                    {currentUser && (
                      <button onClick={() => approve(p.id)} disabled={busy || p.approvals.includes(currentUser.id)}
                        className={`${btnPrimary} mt-2 ${p.approvals.includes(currentUser.id) ? '!bg-emerald-700' : ''}`}>
                        <Vote size={11} /> {p.approvals.includes(currentUser.id) ? 'Approved by you' : 'Approve'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                Majority approval (min 3 members) transfers stewardship to the community trust.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
