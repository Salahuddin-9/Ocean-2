import { useEffect, useState } from 'react';
import { X, SunMedium, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';

/**
 * Ocean — Uplift Feed Toggle (Feature 156)
 * Flip your feed into "uplift" mode: only positive-toned posts, each scored.
 */
interface UpliftFeedProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface UpliftRow {
  id: string;
  title: string;
  owner: string;
  upliftScore: number;
  type: string;
  createdAt: number;
}

export default function UpliftFeed({ onClose }: UpliftFeedProps) {
  const [on, setOn] = useState(true);
  const [feed, setFeed] = useState<UpliftRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/feed/uplift?limit=15');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setFeed(d.upliftFeed || []);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const mood = (s: number) =>
    s >= 80 ? 'text-emerald-700 dark:text-emerald-400' : s >= 65 ? 'text-amber-700 dark:text-amber-400' : 'text-[#8a8172] dark:text-zinc-400';

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SunMedium size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Uplift Feed</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 156</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100">Uplift mode</p>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">Sentiment-filtered feed — positive tone only (API: <span className="font-mono">/api/feed?mood=uplift</span>)</p>
            </div>
            <button onClick={() => setOn(!on)} className="text-amber-700 dark:text-amber-400" aria-label="Toggle uplift feed">
              {on ? <ToggleRight size={34} /> : <ToggleLeft size={34} className="opacity-50" />}
            </button>
            <button onClick={load} disabled={busy} className="text-[#8a8172] hover:text-amber-700 transition-colors" aria-label="Refresh">
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {on && (
          <div className="space-y-2">
            {feed.length === 0 && !busy && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-6 text-center text-[11px] text-[#8a8172] dark:text-zinc-400">
                No uplifting posts yet — post something kind!
              </div>
            )}
            {feed.map((f) => (
              <div key={f.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-3.5">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
                    <SunMedium size={14} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100">“{f.title}”</p>
                    <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">
                      {f.type} by {f.owner} · {new Date(f.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`font-display font-black text-[15px] shrink-0 ${mood(f.upliftScore)}`}>{f.upliftScore}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${f.upliftScore}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!on && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-6 text-center text-[11px] text-[#8a8172] dark:text-zinc-400">
            Uplift mode is off — the regular feed (with all its moods) is showing.
          </div>
        )}
      </div>
    </div>
  );
}
