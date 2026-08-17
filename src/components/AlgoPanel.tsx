import { useEffect, useState } from 'react';
import { X, SlidersHorizontal, Save, ListFilter } from 'lucide-react';

/**
 * Ocean — User-Controlled Algo Panel (Feature 151)
 * Tune feed weights; see the personalized feed change in real time.
 */
interface AlgoPanelProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const CATS = [
  ['educational', '📚', 'Educational'],
  ['entertainment', '🎬', 'Entertainment'],
  ['news', '📰', 'News'],
  ['politics', '🏛️', 'Politics'],
  ['sports', '🏏', 'Sports'],
  ['art', '🎨', 'Art'],
] as const;

interface FeedRow {
  id: string;
  title: string;
  owner: string;
  score: number;
  matched: string[];
  boost: number;
  type: string;
}

export default function AlgoPanel({ token, currentUser, onClose }: AlgoPanelProps) {
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadPrefs = async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/algo/preferences', { headers });
      const d = await r.json();
      setWeights(d.weights || {});
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    loadPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const refreshFeed = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch('/api/feed/personalized?limit=8', { headers });
      const d = await r.json();
      setFeed(d.feed || []);
      setWeights(d.weights);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      const r = await fetch('/api/algo/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ weights }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setWeights(d.weights);
      setSaved(true);
      refreshFeed();
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Algo Panel</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 151</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Decide what your feed is made of. Weights multiply the base ranking signals
            (engagement + recency) for matched content — <strong>1 = neutral, 2 = boosted, 0 = minimized</strong>.
          </p>
          <div className="space-y-2.5 mb-3">
            {CATS.map(([key, emoji, label]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{emoji} {label}</span>
                  <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">{weights[key]?.toFixed(1) ?? '1.0'}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.5}
                  value={weights[key] ?? 1}
                  onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                  className="w-full accent-amber-700 dark:accent-amber-400"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !currentUser} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[12px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40">
              <Save size={13} /> {saved ? 'Saved ✓' : 'Save & re-rank'}
            </button>
            <button onClick={refreshFeed} disabled={busy} className="flex items-center gap-1.5 px-4 rounded-xl border border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300 font-bold text-[11px] hover:border-amber-400 transition-all disabled:opacity-40">
              <ListFilter size={13} /> Re-rank
            </button>
          </div>
        </div>

        {feed.length > 0 && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
              Personalized preview · every decision is audit-logged (152)
            </p>
            <div className="space-y-1.5">
              {feed.map((f, i) => (
                <div key={f.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-black text-amber-700 dark:text-amber-400 w-4">{i + 1}</span>
                    <p className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 truncate">{f.title || `(${f.type})`}</p>
                    <span className="ml-auto font-mono text-[9px] text-[#8a8172] dark:text-zinc-500">score {f.score}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 ml-6">
                    {f.matched.length > 0
                      ? f.matched.map((m) => (
                          <span key={m} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-[8px] font-bold text-amber-800 dark:text-amber-300">#{m} ×{f.boost.toFixed(1)}</span>
                        ))
                      : <span className="text-[8px] text-[#8a8172] dark:text-zinc-500">uncategorized · ×{f.boost.toFixed(1)}</span>}
                    <span className="text-[8px] text-[#8a8172] dark:text-zinc-500">by {f.owner}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
