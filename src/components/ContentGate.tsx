import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Loader2, Save } from 'lucide-react';

/**
 * Ocean — Age-Appropriate Content Gate (Feature 203)
 * ----------------------------------------------------
 * Tag posts with a minimum age. Readers under the rating see a gate instead
 * of the content; unknown-age readers get a consent notice.
 * Backed by /api/content-rating.
 */

interface ContentGateProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

export default function ContentGate({ token, currentUser, onClose }: ContentGateProps) {
  const [visible, setVisible] = useState(true);
  const [postId, setPostId] = useState('');
  const [minAge, setMinAge] = useState('18');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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

  const save = async () => {
    if (!postId.trim()) return toast('Post ID is required.');
    setBusy(true);
    try {
      await api(`/api/content-rating/${postId.trim()}`, 'POST', { minAge: Number(minAge) || 0, note });
      setResult(`Rated post ${postId.trim()} for 18+...`);
      toast('Content rating saved.');
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const check = async () => {
    if (!postId.trim()) return toast('Enter a post ID first.');
    try {
      const d = await api(`/api/content-rating/gate/${postId.trim()}`, 'GET');
      setResult(d.allowed
        ? `Allowed (min age ${d.minAge}${d.myAge != null ? `, your age ${d.myAge}` : ', age unknown → consent notice'}).`
        : `Blocked — this post requires ${d.minAge}+ (you are ${d.myAge}).`);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Content gate</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <ShieldAlert className="text-amber-800 dark:text-amber-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Age Content Gate</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Rate your posts · protect younger readers</p>
                </div>
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to rate content. Gate checks work for readers on any account.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    Enter the ID of one of your posts to tag it with a minimum age. Readers under that
                    age (from the DOB on their profile) see a friendly gate instead of the content.
                  </p>
                  <input className={input} value={postId} onChange={e => setPostId(e.target.value)} placeholder="Post ID (e.g. post-1784102659620-655)" />
                  <div className="grid grid-cols-2 gap-2">
                    <select className={input} value={minAge} onChange={e => setMinAge(e.target.value)}>
                      <option value="0">Everyone (0+)</option>
                      <option value="13">13+</option>
                      <option value="16">16+</option>
                      <option value="18">18+</option>
                      <option value="21">21+</option>
                    </select>
                    <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason note (optional)" />
                  </div>
                  <button onClick={save} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save rating
                  </button>
                  <button onClick={check} className="w-full justify-center flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40">
                    <ShieldAlert size={11} /> Check what a reader sees
                  </button>
                  {result && <p className="font-mono text-[10px] text-amber-800 dark:text-amber-300 rounded-xl bg-amber-800/10 px-3 py-2">{result}</p>}
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    Unknown reader age is never hard-blocked — an explicit consent notice is shown instead.
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
