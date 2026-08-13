import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Eye, Plus, Loader2, Trash2 } from 'lucide-react';

/**
 * Ocean — Chaperone Mode (Feature 219)
 * ---------------------------------------
 * Add a read-only participant (chaperone) to a chat conversation. They see
 * messages but cannot post. Backed by /api/chaperone.
 */

interface ChaperoneModeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Observer { id: string; observerId: string; observerName: string; at: number }

export default function ChaperoneMode({ token, currentUser, onClose }: ChaperoneModeProps) {
  const [visible, setVisible] = useState(true);
  const [conversationId, setConversationId] = useState('');
  const [observerId, setObserverId] = useState('');
  const [observers, setObservers] = useState<Observer[]>([]);
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
    if (!conversationId.trim()) return;
    try {
      const d = await api(`/api/chaperone/${conversationId.trim()}`, 'GET');
      setObservers(d.observers || []);
    } catch { /* ignore */ }
  }, [conversationId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!conversationId.trim() || !observerId.trim()) return toast('Conversation id and chaperone user id are required.');
    setBusy(true);
    try {
      await api(`/api/chaperone/${conversationId.trim()}`, 'POST', { observerId: observerId.trim() });
      toast('Chaperone added (read-only).');
      setObserverId('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const remove = async (obsId: string) => {
    try {
      await api(`/api/chaperone/${conversationId.trim()}/${obsId}`, 'DELETE');
      toast('Chaperone removed.');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Chaperone mode</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-sky-800/10 dark:bg-sky-400/10 flex items-center justify-center">
                  <Eye className="text-sky-800 dark:text-sky-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Chaperone Mode</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Read-only participants in chats</p>
                </div>
              </div>

              <div className="space-y-2">
                <input className={input} value={conversationId} onChange={e => setConversationId(e.target.value)} placeholder="Conversation id" />
                <div className="flex gap-2">
                  <input className={`${input} flex-1`} value={observerId} onChange={e => setObserverId(e.target.value)} placeholder="Chaperone user id" />
                  <button onClick={add} disabled={busy} className={btnPrimary}><Plus size={11} /> Add</button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Chaperones ({observers.length})</div>
                {observers.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No chaperones in this conversation yet.</p>}
                {observers.map(o => (
                  <div key={o.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5">
                    <Eye size={11} className="text-sky-600 shrink-0" />
                    <span className="flex-1 text-[11px] text-[#3a342a] dark:text-zinc-100">{o.observerName}</span>
                    <span className="font-mono text-[8px] uppercase text-emerald-600">read-only</span>
                    <button onClick={() => remove(o.observerId)} className="text-[#8a8172] hover:text-rose-500" aria-label="Remove"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                Chaperones can read but never post — enforced by the messaging server.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
