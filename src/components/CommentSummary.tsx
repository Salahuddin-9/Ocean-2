import { useState } from 'react';
import { X, MessageSquareText, RefreshCw, ThumbsUp, ThumbsDown, Minus, ArrowRight } from 'lucide-react';

/**
 * Ocean — AI Comment Summarizer (Feature 142)
 * Sentiment + themes + key points for any post's comment thread.
 */
interface CommentSummaryProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface SummaryData {
  postId: string;
  commentCount: number;
  summary: string;
  sentiment: string;
  themes: string[];
  keyPoints: string[];
  topCommenters: { id: string; name: string; count: number }[];
  mode: string;
  createdAt: number;
}

const sentIcon = (s: string) =>
  s === 'positive' ? <ThumbsUp size={13} className="text-emerald-600 dark:text-emerald-400" />
    : s === 'negative' ? <ThumbsDown size={13} className="text-rose-600 dark:text-rose-400" />
      : s === 'mixed' ? <Minus size={13} className="text-amber-600 dark:text-amber-400" />
        : <Minus size={13} className="text-[#8a8172]" />;

const sentColor = (s: string) =>
  s === 'positive' ? 'text-emerald-700 dark:text-emerald-400'
    : s === 'negative' ? 'text-rose-700 dark:text-rose-400'
      : 'text-amber-700 dark:text-amber-400';

export default function CommentSummary({ token, onClose }: CommentSummaryProps) {
  const [postId, setPostId] = useState('');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async (id: string, refresh: boolean) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(id)}/comment-summary${refresh ? '/refresh' : ''}`, {
        method: refresh ? 'POST' : 'GET',
        headers,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setSummary(d.summary);
    } catch (e: any) {
      setError(e.message || 'Failed to summarize');
    } finally {
      setBusy(false);
    }
  };

  const go = () => {
    if (!postId.trim()) return setError('Enter a post ID.');
    load(postId.trim(), false);
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquareText size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">AI Comment Summarizer</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 142</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Long threads, one glance: <strong>sentiment, key themes and key points</strong> distilled from every comment on a post.
          </p>
          <div className="flex gap-2">
            <input
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="Post ID"
              className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <button onClick={go} disabled={busy} className="px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
              {busy ? '…' : 'Summarize'}
            </button>
          </div>
          {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
        </div>

        {summary && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              {sentIcon(summary.sentiment)}
              <span className={`font-mono text-[9px] uppercase tracking-widest ${sentColor(summary.sentiment)}`}>
                {summary.sentiment} tone · {summary.commentCount} comments
              </span>
              <span className="ml-auto font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">{summary.mode}</span>
              <button onClick={() => load(postId.trim(), true)} disabled={busy} className="text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1">
                <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            <p className="text-[12px] font-semibold text-[#3a342a] dark:text-zinc-100 leading-relaxed mb-3">{summary.summary}</p>

            <div className="mb-3">
              <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-1">Key points</p>
              <ul className="space-y-1">
                {summary.keyPoints.length === 0 && <li className="text-[10px] text-[#8a8172] dark:text-zinc-500">Not enough substantive comments.</li>}
                {summary.keyPoints.map((k, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#5c5446] dark:text-zinc-300">
                    <ArrowRight size={11} className="mt-0.5 shrink-0 text-amber-600" /> {k}
                  </li>
                ))}
              </ul>
            </div>

            {summary.themes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {summary.themes.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[9px] font-bold text-amber-800 dark:text-amber-300">#{t}</span>
                ))}
              </div>
            )}

            {summary.topCommenters.length > 0 && (
              <div>
                <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-1">Most active</p>
                <div className="flex flex-wrap gap-1.5">
                  {summary.topCommenters.map((c) => (
                    <span key={c.id} className="px-2 py-1 rounded-lg border border-[#ebdcca] dark:border-zinc-800 text-[9px] text-[#5c5446] dark:text-zinc-300">
                      {c.name} <strong className="text-amber-700 dark:text-amber-400">{c.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
