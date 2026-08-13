import { useEffect, useState } from 'react';
import { X, Lightbulb, History, Sparkles } from 'lucide-react';

/**
 * Ocean — AI Personal Feed Explanation (Feature 140)
 * Explains "Why did I see this?" using the real ranking signals.
 */
interface FeedExplainerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Reason {
  signal: string;
  label: string;
  value: number;
  weight: number;
  detail: string;
}

interface Explanation {
  id: string;
  postId: string;
  postSnippet: string;
  reasons: Reason[];
  blurb: string;
  topReason: string;
  createdAt: number;
}

export default function FeedExplainer({ token, currentUser, onClose }: FeedExplainerProps) {
  const [postId, setPostId] = useState('');
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [history, setHistory] = useState<Explanation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'explain' | 'history'>('explain');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadHistory = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/feed/explain-history', { headers });
      const d = await r.json();
      setHistory(d.explanations || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const explain = async (id?: string) => {
    const target = (id || postId).trim();
    if (!target) return setError('Enter a post ID.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/feed/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ postId: target }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Explain failed');
      setExplanation(d.explanation);
      setPostId('');
      loadHistory();
    } catch (e: any) {
      setError(e.message || 'Explain failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">AI Feed Explanation</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 140</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['explain', 'history'] as const).map((t) => (
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

        {tab === 'explain' && (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
                Find a post you're curious about in your feed and paste its ID here. Ocean decomposes the
                <strong> real ranking signals</strong> — engagement, recency, author trust, topic match and content type —
                into an honest, human-readable explanation.
              </p>
              <div className="flex gap-2">
                <input
                  value={postId}
                  onChange={(e) => setPostId(e.target.value)}
                  placeholder="Post ID (e.g. post-1784102659620-655)"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => explain()}
                  disabled={busy || !currentUser}
                  className="px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40"
                >
                  {busy ? '…' : 'Explain'}
                </button>
              </div>
              {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
              {!currentUser && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 mt-2">Log in to get personalized explanations.</p>}
            </div>

            {explanation && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-1">
                  <Sparkles size={12} className="text-amber-600" /> Why this appeared
                </p>
                <p className="text-[11px] italic text-[#5c5446] dark:text-zinc-300 mb-1">“{explanation.postSnippet}”</p>
                <p className="text-[12px] font-semibold text-[#3a342a] dark:text-zinc-100 mb-3">{explanation.blurb}</p>
                <div className="space-y-2">
                  {explanation.reasons.map((r) => (
                    <div key={r.signal} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">
                          {r.label} <span className="opacity-60">· {r.detail}</span>
                        </span>
                        <span className={`font-bold text-[11px] ${r.signal === explanation.topReason ? 'text-amber-700 dark:text-amber-400' : 'text-[#5c5446] dark:text-zinc-300'}`}>
                          {r.value}{r.signal === explanation.topReason && ' ★'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                        <div className={`h-full ${r.signal === explanation.topReason ? 'bg-amber-600 dark:bg-amber-400' : 'bg-[#b9a98c] dark:bg-zinc-600'}`} style={{ width: `${r.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
              <History size={12} className="text-amber-600" /> Past explanations
            </p>
            {history.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">Nothing explained yet.</p>}
            <div className="space-y-1.5">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => { setExplanation(h); setTab('explain'); }}
                  className="w-full text-left rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5 hover:border-amber-400 transition-all"
                >
                  <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 line-clamp-1 mb-0.5">“{h.postSnippet}”</p>
                  <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">
                    {new Date(h.createdAt).toLocaleString()} · top signal: {h.topReason}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
