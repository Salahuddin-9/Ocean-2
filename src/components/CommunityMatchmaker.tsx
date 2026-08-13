import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, HeartHandshake, Plus, Loader2, Check, X as XIcon } from 'lucide-react';

/**
 * Ocean — Community Matchmaker (Feature 222)
 * ---------------------------------------------
 * Trusted community members suggest matches. Both sides accept/decline; a
 * match happens when both accept. Backed by /api/matchmaker.
 */

interface CommunityMatchmakerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Suggestion {
  id: string; suggestedByName: string; forId: string; withId: string; note: string;
  status: string; forResponse?: string; withResponse?: string;
}

export default function CommunityMatchmaker({ token, currentUser, onClose }: CommunityMatchmakerProps) {
  const [visible, setVisible] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [forId, setForId] = useState('');
  const [withId, setWithId] = useState('');
  const [note, setNote] = useState('');
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
      const d = await api('/api/matchmaker', 'GET');
      setSuggestions(d.suggestions || []);
    } catch { /* ignore */ }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const suggest = async () => {
    if (!forId.trim() || !withId.trim()) return toast('Enter both user ids.');
    setBusy(true);
    try {
      await api('/api/matchmaker', 'POST', { forId: forId.trim(), withId: withId.trim(), note });
      toast('Suggestion sent — both parties will decide.');
      setForId(''); setWithId(''); setNote('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const respond = async (id: string, accept: boolean) => {
    setBusy(true);
    try {
      await api(`/api/matchmaker/${id}/respond`, 'POST', { accept });
      toast(accept ? 'Accepted.' : 'Declined.');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Community matchmaker</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <HeartHandshake className="text-amber-800 dark:text-amber-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Community Matchmaker</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Elders &amp; trusted members suggest matches</p>
                </div>
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to receive suggestions.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Suggest a match</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={input} value={forId} onChange={e => setForId(e.target.value)} placeholder="Person A user id" />
                      <input className={input} value={withId} onChange={e => setWithId(e.target.value)} placeholder="Person B user id" />
                    </div>
                    <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Why would they suit each other?" />
                    <button onClick={suggest} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <HeartHandshake size={11} />} Suggest
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Suggestions about me ({suggestions.length})</div>
                    {suggestions.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No suggestions yet.</p>}
                    {suggestions.map(s => {
                      const iAmA = s.forId === currentUser.id;
                      const iAmB = s.withId === currentUser.id;
                      const needMyResponse = s.status === 'pending' && (iAmA ? !s.forResponse : !s.withResponse);
                      return (
                        <div key={s.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                          <div className="flex items-center gap-2">
                            <span className="flex-1 text-[11px] text-[#3a342a] dark:text-zinc-100">
                              Suggested by <b>{s.suggestedByName}</b> · A: {iAmA ? 'you' : 'A'} ↔ B: {iAmB ? 'you' : 'B'}
                            </span>
                            <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${s.status === 'accepted' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : s.status === 'pending' ? 'bg-amber-800/10 text-amber-700 dark:text-amber-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>{s.status}</span>
                          </div>
                          {s.note && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1">“{s.note}”</p>}
                          {needMyResponse && (
                            <div className="flex gap-1.5 mt-2">
                              <button onClick={() => respond(s.id, true)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-800/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono uppercase font-bold hover:bg-emerald-800/20"><Check size={11} /> Accept</button>
                              <button onClick={() => respond(s.id, false)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-800/10 text-rose-700 dark:text-rose-300 text-[10px] font-mono uppercase font-bold hover:bg-rose-800/20"><XIcon size={11} /> Decline</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
