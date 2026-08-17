import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GraduationCap, Plus, Loader2, Users, Building2 } from 'lucide-react';

/**
 * Ocean — Alumni Network Bridge (Feature 248)
 * ---------------------------------------------
 * Alumni directory by institution: register your alma mater, browse classmates
 * and batchmates, find mentors. Backed by /api/alumni.
 */

interface AlumniNetworkProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Alumni { id: string; userId: string; name: string; institution: string; batch: string; field: string; bio: string; at: number }
interface Group { institution: string; count: number; members: Alumni[] }

export default function AlumniNetwork({ token, currentUser, onClose }: AlumniNetworkProps) {
  const [visible, setVisible] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [institution, setInstitution] = useState('');
  const [batch, setBatch] = useState('');
  const [field, setField] = useState('');
  const [bio, setBio] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
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
      const d = await api('/api/alumni', 'GET');
      setGroups(d.groups || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!institution.trim()) return toast('Institution is required.');
    setBusy(true);
    try {
      await api('/api/alumni', 'POST', { institution, batch, field, bio });
      toast('Registered to the alumni network.');
      setInstitution(''); setBatch(''); setField(''); setBio('');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Alumni network</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-indigo-800/10 dark:bg-indigo-400/10 flex items-center justify-center">
                  <GraduationCap className="text-indigo-800 dark:text-indigo-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Alumni Network</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Find your batchmates · feature 248</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Register your alma mater</div>
                  <input className={input} value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Institution (e.g. Dhaka University)" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={batch} onChange={e => setBatch(e.target.value)} placeholder="Batch / year (e.g. 2019)" />
                    <input className={input} value={field} onChange={e => setField(e.target.value)} placeholder="Field (e.g. CSE)" />
                  </div>
                  <input className={input} value={bio} onChange={e => setBio(e.target.value)} placeholder="Bio — open to mentoring?" />
                  <button onClick={register} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Join the directory
                  </button>
                </div>
              )}

              {groups.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No alumni registered yet.</p>}

              {groups.map(g => (
                <div key={g.institution} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 overflow-hidden">
                  <button onClick={() => setSelected(selected === g.institution ? null : g.institution)}
                    className="w-full flex items-center gap-2 p-3 bg-white/60 dark:bg-zinc-950/40 hover:bg-[#ebdcca]/30 dark:hover:bg-zinc-800/50 transition-colors text-left">
                    <Building2 size={13} className="text-indigo-700 dark:text-indigo-400" />
                    <span className="font-mono text-[11px] font-bold text-[#3a342a] dark:text-zinc-200 flex-1">{g.institution}</span>
                    <span className="flex items-center gap-1 font-mono text-[9px] text-[#8a8172]"><Users size={10} /> {g.count}</span>
                  </button>
                  {selected === g.institution && (
                    <div className="space-y-1.5 p-3 pt-1">
                      {g.members.map(m => (
                        <div key={m.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 bg-white/60 dark:bg-zinc-950/40">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-[#3a342a] dark:text-zinc-200">{m.name}</span>
                            {m.batch && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-800/10 text-indigo-700 dark:text-indigo-300">{m.batch}</span>}
                            {m.field && <span className="font-mono text-[8px] text-[#8a8172]">{m.field}</span>}
                          </div>
                          {m.bio && <p className="text-[9px] text-[#8a8172] mt-0.5">{m.bio}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
