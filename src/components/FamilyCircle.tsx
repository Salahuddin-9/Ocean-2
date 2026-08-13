import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Plus, HeartPulse, MapPin, LogOut, Loader2, ShieldCheck } from 'lucide-react';

/**
 * Ocean — Family Circle Dashboard (Feature 202)
 * -----------------------------------------------
 * Private family circles: roles, join requests, check-ins and opt-in
 * location sharing. Backed by /api/family.
 */

interface FamilyCircleProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Member { id: string; name: string; role: string; joinedAt: number }
interface Circle {
  id: string; name: string; isAdmin: boolean; members: Member[];
  pending: { id: string; name: string; at: number }[];
  checkIns: { userId: string; name: string; at: number; note: string }[];
  locationShare: { userId: string; name: string; lat: number; lng: number; at: number }[];
}

export default function FamilyCircle({ token, currentUser, onClose }: FamilyCircleProps) {
  const [visible, setVisible] = useState(true);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selected, setSelected] = useState<Circle | null>(null);
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [checkNote, setCheckNote] = useState('');
  const [shareLoc, setShareLoc] = useState(false);
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
      const d = await api('/api/family', 'GET');
      setCircles(d.circles || []);
      setSelected((sel) => sel ? d.circles.find((c: Circle) => c.id === sel.id) || null : null);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return toast('Circle name is required.');
    setBusy(true);
    try {
      const d = await api('/api/family', 'POST', { name });
      toast('Family circle created.');
      setName('');
      await load();
      setSelected(d.circle);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const join = async () => {
    if (!joinId.trim()) return toast('Enter the circle ID.');
    setBusy(true);
    try {
      const d = await api(`/api/family/${joinId.trim()}/join`, 'POST');
      toast(d.message || 'Request sent.');
      setJoinId('');
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const approve = async (userId: string) => {
    try {
      await api(`/api/family/${selected!.id}/approve`, 'POST', { userId });
      toast('Member approved.');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const checkIn = async () => {
    try {
      await api(`/api/family/${selected!.id}/check-in`, 'POST', { note: checkNote });
      toast('Checked in!');
      setCheckNote('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const toggleLocation = async () => {
    if (!shareLoc) {
      if (!('geolocation' in navigator)) return toast('Geolocation not supported.');
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          await api(`/api/family/${selected!.id}/location`, 'POST', { lat: pos.coords.latitude, lng: pos.coords.longitude });
          setShareLoc(true);
          toast('Location shared with your circle.');
        } catch (e: any) { toast(e.message, 'destructive'); }
      }, () => toast('Location permission denied.', 'destructive'));
    } else {
      try {
        await api(`/api/family/${selected!.id}/location`, 'POST', {});
        setShareLoc(false);
        toast('Location sharing stopped.');
      } catch (e: any) { toast(e.message, 'destructive'); }
    }
  };

  const leave = async () => {
    try {
      await api(`/api/family/${selected!.id}/leave`, 'POST');
      toast('Left the circle.');
      setSelected(null);
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Family circle</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-pink-800/10 dark:bg-pink-400/10 flex items-center justify-center">
                  <Users className="text-pink-800 dark:text-pink-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Family Circle</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Check-ins · location share · guardians</p>
                </div>
              </div>

              {loading ? (
                <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Loading…
                </div>
              ) : selected ? (
                <div className="space-y-3">
                  <button onClick={() => setSelected(null)} className="text-[10px] font-mono uppercase text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100">← All circles</button>
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">{selected.name}</div>
                        <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{selected.members.length} members</div>
                      </div>
                      <button onClick={leave} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                        <LogOut size={11} /> Leave
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selected.members.map(m => (
                        <span key={m.id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[9px] font-mono uppercase text-[#5c5446] dark:text-zinc-300">
                          {m.role === 'admin' && <ShieldCheck size={9} className="text-amber-700 dark:text-amber-400" />}
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {selected.isAdmin && selected.pending.length > 0 && (
                    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-1.5">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Join requests</div>
                      {selected.pending.map(p => (
                        <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5">
                          <span className="flex-1 text-[11px] text-[#3a342a] dark:text-zinc-100">{p.name}</span>
                          <button onClick={() => approve(p.id)} className="px-2 py-1 rounded-lg bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono uppercase font-bold hover:bg-emerald-800/20">Approve</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><HeartPulse size={11} className="inline" /> Check-ins</div>
                    {selected.checkIns.slice(0, 5).map(c => (
                      <div key={c.at + c.userId} className="text-[10px] text-[#5c5446] dark:text-zinc-300">
                        <b>{c.name}</b> · {new Date(c.at).toLocaleTimeString()}{c.note ? ` — ${c.note}` : ''}
                      </div>
                    ))}
                    <div className="flex gap-1.5">
                      <input className={`${input} flex-1`} value={checkNote} onChange={e => setCheckNote(e.target.value)} placeholder="I'm safe! (optional note)" onKeyDown={e => { if (e.key === 'Enter') checkIn(); }} />
                      <button onClick={checkIn} className={btnPrimary}><HeartPulse size={11} /> Check in</button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 flex items-center gap-2">
                    <MapPin size={14} className={shareLoc ? 'text-pink-600' : 'text-[#8a8172]'} />
                    <span className="flex-1 text-[10px] font-mono uppercase tracking-wide text-[#5c5446] dark:text-zinc-300">
                      {shareLoc ? 'Live location shared' : 'Share live location with circle'}
                    </span>
                    <button onClick={toggleLocation} className={`${btnPrimary} ${shareLoc ? '!bg-rose-700' : ''}`}>
                      {shareLoc ? 'Stop' : 'Share'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    Create a circle for your family, share the circle ID so they can request to join,
                    then use check-ins and live location to keep everyone safe.
                  </p>
                  <div className="flex gap-2">
                    <input className={`${input} flex-1`} value={name} onChange={e => setName(e.target.value)} placeholder="Circle name (e.g. The Rahman Family)" />
                    <button onClick={create} disabled={busy} className={btnPrimary}><Plus size={11} /> Create</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-[#ebdcca] dark:border-zinc-800" />
                    <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">or join</span>
                    <div className="flex-1 border-t border-[#ebdcca] dark:border-zinc-800" />
                  </div>
                  <div className="flex gap-2">
                    <input className={`${input} flex-1`} value={joinId} onChange={e => setJoinId(e.target.value)} placeholder="Circle ID (e.g. fam-123…)" />
                    <button onClick={join} disabled={busy || !joinId.trim()} className={btnPrimary}><Users size={11} /> Join</button>
                  </div>
                  {circles.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">My circles</div>
                      {circles.map(c => (
                        <button key={c.id} onClick={() => setSelected(c)}
                          className="w-full text-left rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40 hover:border-pink-400 hover:bg-pink-50/40 dark:hover:bg-zinc-800/60 transition-all">
                          <div className="font-bold text-xs text-[#3a342a] dark:text-zinc-100">{c.name}</div>
                          <div className="text-[10px] text-[#8a8172] dark:text-zinc-400">{c.members.length} members{c.isAdmin ? ' · you are admin' : ''}</div>
                        </button>
                      ))}
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
