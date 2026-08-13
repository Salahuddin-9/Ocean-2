import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserRound, Plus, Loader2, Check, Trash2, Sparkles } from 'lucide-react';

/**
 * Ocean — Contextual Personas (Feature 244)
 * --------------------------------------------
 * Multiple identities per account: work / family / hobby. Switch personas to
 * post and interact under a curated identity. Backed by /api/personas.
 */

interface PersonasProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Persona { id: string; name: string; tagline: string; color: string; interests: string[]; active: boolean }

export default function Personas({ token, currentUser, onClose }: PersonasProps) {
  const [visible, setVisible] = useState(true);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [interests, setInterests] = useState('');
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
      const d = await api('/api/personas', 'GET');
      setPersonas(d.personas || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return toast('Give this persona a name.');
    setBusy(true);
    try {
      await api('/api/personas', 'POST', {
        name,
        tagline,
        interests: interests.split(',').map(x => x.trim()).filter(Boolean),
      });
      toast('Persona created.');
      setName(''); setTagline(''); setInterests('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const activate = async (id: string) => {
    try {
      await api(`/api/personas/${id}/activate`, 'POST');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/personas/${id}`, 'DELETE');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Contextual personas</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-violet-800/10 dark:bg-violet-400/10 flex items-center justify-center">
                  <Sparkles className="text-violet-800 dark:text-violet-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Contextual Personas</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Multiple identities, one account · feature 244</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> New persona</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Name (e.g. Dev Self)" />
                    <input className={input} value={interests} onChange={e => setInterests(e.target.value)} placeholder="Interests (comma separated)" />
                  </div>
                  <input className={input} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Tagline" />
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create persona
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {personas.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No personas yet — create one above.</p>}
                {personas.map(p => (
                  <div key={p.id} className={`rounded-2xl border p-3 bg-white/60 dark:bg-zinc-950/40 transition-all ${p.active ? 'border-amber-400/70 dark:border-amber-400/50' : 'border-[#ebdcca] dark:border-zinc-800'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: p.color }}>
                        <UserRound size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-[#3a342a] dark:text-zinc-200">{p.name}</span>
                          {p.active && <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-800/10 text-emerald-700 dark:text-emerald-300">active</span>}
                        </div>
                        {p.tagline && <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 truncate">{p.tagline}</p>}
                        {p.interests.length > 0 && (
                          <p className="text-[9px] font-mono uppercase tracking-wider text-[#5c5446] dark:text-zinc-400 truncate mt-0.5">{p.interests.join(' · ')}</p>
                        )}
                      </div>
                      {!p.active && (
                        <button onClick={() => activate(p.id)} className={btnPrimary}><Check size={11} /> Use</button>
                      )}
                      <button onClick={() => remove(p.id)} className="text-[#8a8172] hover:text-red-600 transition-colors" aria-label="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
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
