import { useEffect, useState } from 'react';
import { X, Ghost, EyeOff, History, ShieldCheck } from 'lucide-react';

/**
 * Ocean — Dynamic Contextual Ghosting (Feature 145)
 * View any post invisibly: ghost views never feed the ranking engine.
 */
interface GhostModeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface GhostView {
  id: string;
  postId: string;
  viewedAt: number;
}

export default function GhostMode({ token, currentUser, onClose }: GhostModeProps) {
  const [postId, setPostId] = useState('');
  const [result, setResult] = useState<{ totalGhostViews: number; ghosted: boolean } | null>(null);
  const [mine, setMine] = useState<GhostView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadMine = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/posts/ghost/my', { headers });
      const d = await r.json();
      setMine(d.views || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const ghost = async () => {
    if (!postId.trim()) return setError('Enter a post ID.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(postId.trim())}/ghost-view`, {
        method: 'POST',
        headers,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ghost view failed');
      setResult(d);
      loadMine();
    } catch (e: any) {
      setError(e.message || 'Ghost view failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Ghost size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Ghost Mode</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 145</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="flex items-center gap-1.5 text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            <EyeOff size={13} className="shrink-0 text-amber-700 dark:text-amber-400" />
            Curious about a post but don't want to influence its ranking? Ghost-view it: the view is recorded in a
            <strong> separate ledger</strong> that never touches views, engagement or author-trust signals.
          </p>
          <div className="flex gap-2">
            <input
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ghost()}
              placeholder="Post ID to ghost-view"
              className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={ghost}
              disabled={busy || !currentUser}
              className="px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40 flex items-center gap-1.5"
            >
              <Ghost size={13} /> Ghost-view
            </button>
          </div>
          {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
        </div>

        {result && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <p className="flex items-center gap-1.5 font-bold text-[12px] text-emerald-700 dark:text-emerald-400 mb-1">
              <ShieldCheck size={14} /> {result.ghosted ? 'Ghost view recorded' : 'Already ghost-viewed recently (10 min cooldown)'}
            </p>
            <p className="text-[11px] text-[#5c5446] dark:text-zinc-300">
              {result.totalGhostViews} ghost view{result.totalGhostViews === 1 ? '' : 's'} total on this post · ranking impact: <strong>none</strong>
            </p>
          </div>
        )}

        {mine.length > 0 && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
              <History size={12} className="text-amber-600" /> My recent ghost views
            </p>
            <div className="space-y-1">
              {mine.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-[10px] text-[#5c5446] dark:text-zinc-300 border-b border-[#f0e8da] dark:border-zinc-800 pb-1">
                  <span className="font-mono">{v.postId}</span>
                  <span>{new Date(v.viewedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
