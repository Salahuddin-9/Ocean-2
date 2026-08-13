import { useState, useCallback, useMemo } from 'react';
import { 
  generateDataset, 
  rankFeed, 
  DEFAULT_ENGINE_CONFIG,
  ScoredPost,
  EngineConfig,
  UserProfile,
} from '../engine';

function ScoreBar({ value, max = 100, color = 'cyan', label }: { value: number; max?: number; color?: string; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const colors: Record<string, string> = {
    cyan: 'bg-cyan-500',
    green: 'bg-emerald-500',
    red: 'bg-red-500',
    yellow: 'bg-amber-500',
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    pink: 'bg-pink-500',
    orange: 'bg-orange-500',
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-right text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colors[color] || 'bg-cyan-500'} transition-all duration-500`}
          style={{ width: `${Math.max(0, pct)}%` }}
        />
      </div>
      <span className="w-14 text-right font-mono text-slate-300">{value.toFixed(2)}</span>
    </div>
  );
}

function PostCard({ scored, index }: { scored: ScoredPost; index: number; key?: string }) {
  const [expanded, setExpanded] = useState(false);
  const s = scored.scores;
  const p = scored.post;

  if (scored.filtered) {
    return (
      <div className="bg-slate-900/50 border border-red-900/30 rounded-xl p-4 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-900/50 flex items-center justify-center text-red-400 text-xs font-bold">✕</div>
          <div>
            <p className="text-sm text-red-400 font-medium">Filtered: {p.postId}</p>
            <p className="text-xs text-slate-500">{scored.filterReason}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4 hover:border-cyan-500/30 transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          index < 3 ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white' : 'bg-slate-800 text-slate-400'
        }`}>
          #{scored.rank}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{p.postId}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{p.category}</span>
            {p.isBoosted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">⚡ Boosted</span>
            )}
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">{p.language}/{p.country}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {p.totalViews.toLocaleString()} views · {p.viewVelocity.toFixed(0)} v/hr · {p.videoLength}s
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-cyan-400">{scored.finalScore.toFixed(1)}</div>
          <div className="text-xs text-slate-500">score</div>
        </div>
      </div>

      <div className="space-y-1">
        <ScoreBar value={s.watchTimeScore * 100} label="Watch Time" color="cyan" />
        <ScoreBar value={s.engagementScore * 100} label="Engagement" color="green" />
        <ScoreBar value={s.velocityScore * 100} label="Velocity" color="purple" />
        <ScoreBar value={s.recencyScore * 100} label="Recency" color="blue" />
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-1">
          <ScoreBar value={s.rewatchScore * 100} label="Rewatch" color="orange" />
          <ScoreBar value={s.conversionScore * 100} label="Conversion" color="pink" />
          <ScoreBar value={s.feedbackScore * 100} max={100} label="Feedback" color={s.feedbackScore >= 0 ? 'green' : 'red'} />
          <div className="flex items-center gap-2 text-xs mt-2">
            <span className="w-24 text-right text-slate-400">Bounce Pen.</span>
            <span className="font-mono text-slate-300">{s.penaltyFactor.toFixed(3)}</span>
            <span className="w-24 text-right text-slate-400 ml-4">Boost Mult.</span>
            <span className={`font-mono ${s.boostMultiplier > 1 ? 'text-amber-400' : 'text-slate-300'}`}>
              {s.boostMultiplier.toFixed(3)}×
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Raw: {s.rawScore.toFixed(4)} → Penalized: {(s.rawScore * s.penaltyFactor).toFixed(4)} → Boosted: {scored.finalScore.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}

export function InteractiveDemo() {
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_ENGINE_CONFIG);
  const [seed, setSeed] = useState(0);
  const [postCount, setPostCount] = useState(15);

  const dataset = useMemo(() => {
    // seed is used to trigger regeneration
    void seed;
    return generateDataset(postCount);
  }, [seed, postCount]);

  const rankedFeed = useMemo(() => {
    return rankFeed(dataset.user, dataset.posts, config);
  }, [dataset, config]);

  const regenerate = useCallback(() => setSeed(s => s + 1), []);

  const stats = useMemo(() => {
    const scored = rankedFeed.filter(r => !r.filtered);
    const filtered = rankedFeed.filter(r => r.filtered);
    const boosted = scored.filter(r => r.post.isBoosted);
    const avgScore = scored.length > 0 ? scored.reduce((a, b) => a + b.finalScore, 0) / scored.length : 0;
    const maxScore = scored.length > 0 ? Math.max(...scored.map(s => s.finalScore)) : 0;
    return { total: rankedFeed.length, scored: scored.length, filtered: filtered.length, boosted: boosted.length, avgScore, maxScore };
  }, [rankedFeed]);

  const updateWeight = (key: keyof typeof config.weights, value: number) => {
    setConfig(prev => ({
      ...prev,
      weights: { ...prev.weights, [key]: value },
    }));
  };

  const updateUser = (key: keyof UserProfile, value: string) => {
    dataset.user[key] = value as never;
    setSeed(s => s + 0.001); // force re-render
  };
  void updateUser;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-cyan-400 mb-3">⚙️ Engine Controls</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 flex justify-between">
                Posts to generate
                <span className="text-white">{postCount}</span>
              </label>
              <input type="range" min={5} max={30} value={postCount} onChange={e => setPostCount(+e.target.value)}
                className="w-full accent-cyan-500" />
            </div>
            <button onClick={regenerate}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold hover:from-cyan-500 hover:to-blue-500 transition-all">
              🔄 Regenerate Feed
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-purple-400 mb-3">📊 Weight Tuning</h4>
          <div className="space-y-2">
            {([
              ['watchTime', 'Watch Time (α₁)', 0.25],
              ['share', 'Share (α₄)', 0.15],
              ['save', 'Save (α₇)', 0.12],
              ['conversion', 'Conversion (ε)', 0.20],
            ] as const).map(([key, label, _def]) => (
              <div key={key}>
                <label className="text-xs text-slate-400 flex justify-between">
                  {label}
                  <span className="text-white">{config.weights[key].toFixed(2)}</span>
                </label>
                <input type="range" min={0} max={50} value={config.weights[key] * 100}
                  onChange={e => updateWeight(key, +e.target.value / 100)}
                  className="w-full accent-purple-500" />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-emerald-400 mb-3">📈 Feed Statistics</h4>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total Posts" value={stats.total.toString()} />
            <Stat label="Ranked" value={stats.scored.toString()} color="text-cyan-400" />
            <Stat label="Filtered" value={stats.filtered.toString()} color="text-red-400" />
            <Stat label="Boosted" value={stats.boosted.toString()} color="text-amber-400" />
            <Stat label="Avg Score" value={stats.avgScore.toFixed(1)} color="text-emerald-400" />
            <Stat label="Max Score" value={stats.maxScore.toFixed(1)} color="text-purple-400" />
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg">
            👤
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{dataset.user.userId}</p>
            <p className="text-xs text-slate-400">
              {dataset.user.language.toUpperCase()} / {dataset.user.country} · 
              Interests: {dataset.user.interests.join(', ')} · 
              Avg Watch: {(dataset.user.historicalEngagement.avgWatchTimeRatio * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Ranked Feed */}
      <div className="space-y-3">
        {rankedFeed.map((scored, i) => (
          <PostCard key={scored.post.postId + '-' + seed} scored={scored} index={i} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-2 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
