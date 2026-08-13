import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Globe, Send, Download, Inbox } from 'lucide-react';

/**
 * Ocean — ActivityPub / Fediverse Bridge (Feature 236)
 * ------------------------------------------------------
 * Federate a note to the ActivityPub-shaped outbox, ingest remote posts from
 * the inbox, browse the federation feed. Backed by /api/fediverse.
 */

interface FediverseBridgeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Activity { id: string; actor: string; type: string; at: number }
interface RemotePost { id: string; actor: string; content: string; url: string; at: number }

export default function FediverseBridge({ token, currentUser, onClose }: FediverseBridgeProps) {
  const [visible, setVisible] = useState(true);
  const [outbox, setOutbox] = useState<Activity[]>([]);
  const [remote, setRemote] = useState<RemotePost[]>([]);
  const [content, setContent] = useState('');
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
      const [o, r] = await Promise.all([api('/api/fediverse/outbox'), api('/api/fediverse/remote')]);
      setOutbox(o.outbox || []);
      setRemote(r.posts || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const federate = async () => {
    if (!content.trim()) return toast('Write something to federate.');
    setBusy(true);
    try {
      await api('/api/fediverse/outbox', 'POST', { content });
      toast('Federated — payload ready for ActivityPub delivery.');
      setContent('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const ingest = async () => {
    setBusy(true);
    try {
      await api('/api/fediverse/inbox', 'POST', {
        actor: 'https://social.example/users/neighbor',
        content: 'Hello from the fediverse! 🌐',
        url: 'https://social.example/@neighbor/status/1',
      });
      toast('Ingested a remote post.');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Fediverse bridge</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-indigo-800/10 dark:bg-indigo-400/10 flex items-center justify-center">
                  <Globe className="text-indigo-800 dark:text-indigo-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Fediverse Bridge</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">ActivityPub outbox · feature 236</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Send size={11} className="inline" /> Federate a note</div>
                  <input className={input} value={content} onChange={e => setContent(e.target.value)} placeholder="Write something for the open network…" />
                  <div className="flex gap-2">
                    <button onClick={federate} disabled={busy} className={`${btnPrimary} flex-1 justify-center`}><Send size={11} /> Publish to outbox</button>
                    <button onClick={ingest} disabled={busy} className={btnPrimary}><Download size={11} /> Ingest demo</button>
                  </div>
                </div>
              )}

              <div>
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500 mb-2 flex items-center gap-1"><Download size={10} /> Remote inbox</div>
                <div className="space-y-2">
                  {remote.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-3">No remote posts yet.</p>}
                  {remote.map(r => (
                    <div key={r.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500">{r.actor} · {new Date(r.at).toLocaleString()}</div>
                      <p className="text-[11px] text-[#3a342a] dark:text-zinc-200 mt-1">{r.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500 mb-2 flex items-center gap-1"><Globe size={10} /> Outbox</div>
                <div className="space-y-2">
                  {outbox.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-3">Nothing federated yet.</p>}
                  {outbox.map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 bg-white/60 dark:bg-zinc-950/40">
                      <span className="font-mono text-[10px] text-[#3a342a] dark:text-zinc-300">{a.type} · {a.actor.split('/').pop()}</span>
                      <span className="font-mono text-[9px] text-[#8a8172]">{new Date(a.at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
