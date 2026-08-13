import { useEffect, useState } from 'react';
import { X, EyeOff, Inbox, Send, TrendingUp } from 'lucide-react';

/**
 * Ocean — Stealth Recommend (Feature 168)
 * Recommend posts to friends as a silent ranking signal.
 */
interface StealthRecProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Rec {
  id: string;
  fromName: string;
  toId: string;
  postId: string;
  postTitle: string;
  at: number;
}

export default function StealthRec({ token, currentUser, onClose }: StealthRecProps) {
  const [tab, setTab] = useState<'recommend' | 'inbox' | 'mine'>('recommend');
  const [postId, setPostId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [inbox, setInbox] = useState<Rec[]>([]);
  const [mine, setMine] = useState<Rec[]>([]);
  const [boost, setBoost] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    if (!token) return;
    try {
      const [i, m] = await Promise.all([
        fetch('/api/stealthrec/inbox', { headers }),
        fetch('/api/stealthrec/mine', { headers }),
      ]);
      const id = await i.json();
      const md = await m.json();
      setInbox(id.recs || []);
      setMine(md.recs || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const recommend = async () => {
    if (!postId.trim() || !friendId.trim()) return setError('Enter both a post ID and a friend ID.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/stealthrec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ postId: postId.trim(), toUserId: friendId.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setBoost(d.stealthBoost);
      setPostId('');
      setFriendId('');
      load();
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <EyeOff size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Stealth Recommend</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 168</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['recommend', 'inbox', 'mine'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                tab === t
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-950'
                  : 'bg-white/70 dark:bg-zinc-900 text-[#8a8172] dark:text-zinc-400 border border-[#ebdcca] dark:border-zinc-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {tab === 'recommend' && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
                Recommend a post to a friend <strong>without posting anything</strong>. The signal quietly bumps the post's
                ranking boost and lands in their inbox — no comment, no announcement.
              </p>
              <input value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="Post ID" className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500 mb-2" />
              <input value={friendId} onChange={(e) => setFriendId(e.target.value)} placeholder="Friend user ID" className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] focus:outline-none focus:border-amber-500 mb-2" />
              <button onClick={recommend} disabled={busy || !currentUser} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[12px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40">
                <Send size={13} /> Recommend silently
              </button>
            </div>
            {boost !== null && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  <TrendingUp size={13} /> Stealth boost is now ×{boost} for this post
                </p>
              </div>
            )}
          </>
        )}

        {tab === 'inbox' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
              <Inbox size={12} className="text-amber-600" /> Recommended to me
            </p>
            {inbox.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No stealth recommendations yet.</p>}
            {inbox.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 mb-1.5">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">“{r.postTitle}”</p>
                <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">{r.fromName} recommended this · {new Date(r.at).toLocaleString()}</p>
                <p className="font-mono text-[8px] text-amber-700 dark:text-amber-400">{r.postId}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'mine' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Posts I recommended</p>
            {mine.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">Nothing recommended yet.</p>}
            {mine.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 mb-1.5">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">“{r.postTitle}”</p>
                <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">to {r.toId} · {new Date(r.at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
