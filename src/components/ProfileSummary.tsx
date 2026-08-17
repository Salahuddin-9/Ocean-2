import { useState } from 'react';
import { X, UserRound, RefreshCw, Sparkles, Zap } from 'lucide-react';

/**
 * Ocean — AI Profile Summary (Feature 141)
 * One-line AI summary of any profile, cached for 6h.
 */
interface ProfileSummaryProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface SummaryData {
  text: string;
  mode: 'llm' | 'template';
  generatedAt: number;
  stats: { posts: number; reels: number; topHashtags: string[]; topTopic: string; mostEngaged: string };
}

export default function ProfileSummary({ token, currentUser, onClose }: ProfileSummaryProps) {
  const [ref, setRef] = useState('');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchSummary = async (id: string, refresh: boolean) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(id)}/summary${refresh ? '/refresh' : ''}`, {
        method: refresh ? 'POST' : 'GET',
        headers,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setSummary(d.summary);
    } catch (e: any) {
      setError(e.message || 'Failed to load summary');
    } finally {
      setBusy(false);
    }
  };

  const lookup = () => {
    if (!ref.trim()) return;
    fetchSummary(ref.trim(), false);
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserRound size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">AI Profile Summary</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 141</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Paste a username or user ID to get a <strong>one-line AI summary</strong> built from their bio, interests and
            recent posts. Cached for 6 hours; refresh for a fresh take.
          </p>
          <div className="flex gap-2 mb-2">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
              placeholder="username or user ID"
              className="flex-1 px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <button onClick={lookup} disabled={busy} className="px-4 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] hover:brightness-110 transition-all disabled:opacity-40">
              Summarize
            </button>
          </div>
          {error && <p className="text-[10px] text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        {summary && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className={summary.mode === 'llm' ? 'text-violet-600 dark:text-violet-400' : 'text-amber-600'} />
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">
                {summary.mode === 'llm' ? 'AI generated' : 'Template'} · {new Date(summary.generatedAt).toLocaleString()}
              </p>
              <button
                onClick={() => fetchSummary(ref.trim() || (currentUser?.id || ''), true)}
                disabled={busy}
                className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
                title="Regenerate"
              >
                <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            <p className="text-[13px] font-semibold text-[#3a342a] dark:text-zinc-100 leading-relaxed mb-3">“{summary.text}”</p>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                ['Posts', summary.stats.posts],
                ['Reels', summary.stats.reels],
                ['Top topic', summary.stats.topTopic || '—'],
              ].map(([label, val]) => (
                <div key={label as string} className="rounded-xl bg-[#f6f1e7] dark:bg-zinc-800 p-2 text-center">
                  <p className="font-display font-black text-sm text-[#3a342a] dark:text-zinc-100 truncate" title={String(val)}>{val}</p>
                  <p className="font-mono text-[7px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">{label}</p>
                </div>
              ))}
            </div>

            {summary.stats.topHashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {summary.stats.topHashtags.map((h) => (
                  <span key={h} className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[9px] font-bold text-amber-800 dark:text-amber-300">
                    {h}
                  </span>
                ))}
              </div>
            )}
            {summary.stats.mostEngaged && (
              <p className="flex items-center gap-1 text-[10px] text-[#8a8172] dark:text-zinc-400 mt-2">
                <Zap size={11} className="text-amber-600" /> Most engaged: “{summary.stats.mostEngaged}”
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
