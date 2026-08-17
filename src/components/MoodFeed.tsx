import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sun, BookOpen, LayoutList, Loader2 } from 'lucide-react';

/**
 * Ocean — Mood Feed (Feature 245)
 * ---------------------------------
 * Browse the feed filtered by sentiment: uplifting only, educational only, or
 * everything. Backed by /api/feed/mood.
 */

interface MoodFeedProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface FeedPost { id: string; text?: string; caption?: string; title?: string; moodSentiment?: string; timestamp?: number; authorName?: string }

export default function MoodFeed({ token, currentUser, onClose }: MoodFeedProps) {
  const [visible, setVisible] = useState(true);
  const [mood, setMood] = useState<'all' | 'positive' | 'educational' | 'uplift'>('positive');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [busy, setBusy] = useState(false);

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  const authToken = token || localStorage.getItem('secure_auth_token');
  const api = async (path: string) => {
    const res = await fetch(path, {
      headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api(`/api/mood/feed?mood=${mood}`);
      setPosts(d.posts || []);
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  }, [mood]);

  useEffect(() => { load(); }, [load]);

  const moods: Array<{ id: typeof mood; label: string; icon: ReactNode }> = [
    { id: 'positive', label: 'Uplifting', icon: <Sun size={11} /> },
    { id: 'educational', label: 'Educational', icon: <BookOpen size={11} /> },
    { id: 'uplift', label: 'No negativity', icon: <LayoutList size={11} /> },
    { id: 'all', label: 'Everything', icon: <LayoutList size={11} /> },
  ];

  const textOf = (p: FeedPost) => p.text || p.caption || p.title || '';

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Mood feed</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <Sun className="text-amber-800 dark:text-amber-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Mood Feed</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Sentiment-filtered feed · feature 245</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {moods.map(m => (
                  <button key={m.id} onClick={() => setMood(m.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-[9px] uppercase font-bold tracking-wider transition-colors ${mood === m.id ? 'bg-amber-700 text-[#f4f1ea] dark:bg-amber-400 dark:text-zinc-900' : 'bg-[#ebdcca]/40 text-[#8a8172] dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {busy && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4"><Loader2 size={11} className="animate-spin inline" /> scanning sentiment…</p>}
                {!busy && posts.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No posts match this mood yet.</p>}
                {posts.map(p => (
                  <div key={p.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${p.moodSentiment === 'positive' ? 'bg-emerald-800/10 text-emerald-700 dark:text-emerald-300' : p.moodSentiment === 'educational' ? 'bg-sky-800/10 text-sky-700 dark:text-sky-300' : 'bg-zinc-800/10 text-[#8a8172]'}`}>
                        {p.moodSentiment}
                      </span>
                      {p.timestamp && <span className="font-mono text-[8px] text-[#8a8172] ml-auto">{new Date(p.timestamp).toLocaleDateString()}</span>}
                    </div>
                    <p className="text-[11px] text-[#3a342a] dark:text-zinc-200 mt-1 line-clamp-3">{textOf(p)}</p>
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
