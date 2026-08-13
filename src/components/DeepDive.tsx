import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BookMarked, Plus, Loader2, Pin, Hash } from 'lucide-react';

/**
 * Ocean — Deep Dive Mode (Feature 246)
 * --------------------------------------
 * Topic hubs: aggregate posts around a subject into one deep-dive view.
 * Backed by /api/hubs.
 */

interface DeepDiveProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Hub { id: string; title: string; description: string; emoji: string; tags: string[]; attached: number; postPreview?: { id: string; text: string } | null }
interface Post { id: string; text?: string; caption?: string; title?: string; authorName?: string }

export default function DeepDive({ token, currentUser, onClose }: DeepDiveProps) {
  const [visible, setVisible] = useState(true);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📚');
  const [desc, setDesc] = useState('');
  const [tags, setTags] = useState('');
  const [attachHub, setAttachHub] = useState<string | null>(null);
  const [postId, setPostId] = useState('');
  const [detail, setDetail] = useState<{ hub: Hub; attached: Post[] } | null>(null);
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
      const d = await api('/api/hubs', 'GET');
      setHubs(d.hubs || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title.trim()) return toast('Give the hub a title.');
    setBusy(true);
    try {
      await api('/api/hubs', 'POST', { title, emoji, description: desc, tags: tags.split(',').map(x => x.trim()).filter(Boolean) });
      toast('Hub created.');
      setTitle(''); setDesc(''); setTags('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const attach = async () => {
    if (!attachHub || !postId.trim()) return toast('Choose a hub and paste a post ID.');
    setBusy(true);
    try {
      await api(`/api/hubs/${attachHub}/attach`, 'POST', { postId });
      toast('Post attached to hub.');
      setPostId(''); setAttachHub(null);
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const openDetail = async (id: string) => {
    try {
      const d = await api(`/api/hubs/${id}`, 'GET');
      setDetail(d);
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Deep dive</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-teal-800/10 dark:bg-teal-400/10 flex items-center justify-center">
                  <BookMarked className="text-teal-800 dark:text-teal-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Deep Dive Mode</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Topic hubs for long-form exploration · feature 246</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Create a hub</div>
                  <div className="grid grid-cols-[56px_1fr] gap-2">
                    <input className={`${input} text-center`} value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 4))} placeholder="📚" />
                    <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Topic (e.g. Urban Farming)" />
                  </div>
                  <input className={input} value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags: garden, rooftop, bd" />
                  <textarea className={`${input} min-h-[50px] resize-none`} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Why this topic matters…" />
                  <button onClick={create} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create hub
                  </button>
                </div>
              )}

              {!detail ? (
                <div className="space-y-2">
                  {hubs.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No hubs yet.</p>}
                  {hubs.map(h => (
                    <div key={h.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{h.emoji}</span>
                        <button onClick={() => openDetail(h.id)} className="font-mono text-[11px] font-bold text-[#3a342a] dark:text-zinc-200 hover:underline flex-1 text-left">{h.title}</button>
                        <span className="font-mono text-[9px] text-[#8a8172]">{h.attached} posts</span>
                      </div>
                      {h.description && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{h.description}</p>}
                      {h.tags.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {h.tags.map(t => <span key={t} className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-teal-800/10 text-teal-700 dark:text-teal-300">#{t}</span>)}
                        </div>
                      )}
                      {currentUser && (
                        attachHub === h.id ? (
                          <div className="flex gap-2 mt-2">
                            <input className={input} value={postId} onChange={e => setPostId(e.target.value)} placeholder="Post ID to attach" />
                            <button onClick={attach} disabled={busy} className={btnPrimary}><Pin size={11} /> Attach</button>
                            <button onClick={() => setAttachHub(null)} className={btnPrimary}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => { setAttachHub(h.id); setPostId(''); }} className={`${btnPrimary} mt-2`}><Pin size={11} /> Attach a post</button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <button onClick={() => setDetail(null)} className={`${btnPrimary} mb-3`}>← All hubs</button>
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{detail.hub.emoji}</span>
                      <div>
                        <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100">{detail.hub.title}</h3>
                        <p className="font-mono text-[8px] uppercase text-[#8a8172]">{detail.attached.length} attached posts</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {detail.attached.length === 0 && <p className="text-center text-[10px] text-[#8a8172] py-2">No posts attached yet.</p>}
                      {detail.attached.map((p: Post) => (
                        <div key={p.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 bg-white/60 dark:bg-zinc-950/40">
                          <div className="flex items-center gap-1.5 text-[#8a8172] font-mono text-[8px] uppercase"><Hash size={9} /> {p.id}</div>
                          <p className="text-[10px] text-[#3a342a] dark:text-zinc-200 mt-0.5 line-clamp-3">{p.text || p.caption || p.title}</p>
                        </div>
                      ))}
                    </div>
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
