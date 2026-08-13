import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Music, TrendingUp, ListMusic, X, RefreshCw, Plus, Loader2,
} from 'lucide-react';

/**
 * Ocean — Trending Sounds
 * ------------------------
 * Predicts which sounds (reel music) are going viral and shows the top 5,
 * with a full tracked-sound list and an inline "track a sound" form.
 * Backed by /api/sounds/trending, /api/sounds and /api/sounds/track.
 */

interface TrendingSoundsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface TrendSound {
  id: string;
  soundId?: string;
  name: string;
  artist?: string;
  usageCount: number;
  growthRate: number;
  score: number;
  lastUpdatedAt?: number;
}

const RANK_BADGES = ['text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10', 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800', 'text-[#b45309] bg-orange-100 dark:bg-orange-400/10'];

export default function TrendingSounds({ token, currentUser, onClose }: TrendingSoundsProps) {
  const [visible, setVisible] = useState(true);
  const [trending, setTrending] = useState<TrendSound[]>([]);
  const [allSounds, setAllSounds] = useState<TrendSound[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
  const [busy, setBusy] = useState(false);

  const toast = (message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  const authToken = token || localStorage.getItem('secure_auth_token');

  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const loadTrending = useCallback(async () => {
    try {
      const data = await api('/api/sounds/trending', 'GET');
      setTrending(data.trending || []);
    } catch (e) { /* guest-safe read; ignore */ }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const data = await api('/api/sounds', 'GET');
      setAllSounds(data.sounds || []);
    } catch (e) { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTrending(), loadAll()]);
    setLoading(false);
  }, [loadTrending, loadAll]);

  useEffect(() => { refresh(); }, [refresh]);

  const trackSound = async () => {
    if (!name.trim()) return toast('Enter a sound name.');
    setBusy(true);
    try {
      await api('/api/sounds/track', 'POST', {
        name: name.trim(),
        artist: artist.trim() || undefined,
      });
      toast(`Tracked "${name.trim()}".`);
      setName('');
      setArtist('');
      await refresh();
    } catch (e: any) {
      toast(e.message || 'Failed to track sound.', 'destructive');
    } finally { setBusy(false); }
  };

  const growthBadge = (g: number) => {
    const pct = Math.round((g - 1) * 100);
    if (pct >= 0) {
      return (
        <span className="flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wide bg-emerald-50 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
          <TrendingUp size={9} /> +{pct}%
        </span>
      );
    }
    return (
      <span className="flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wide bg-rose-50 dark:bg-rose-400/10 text-rose-500 dark:text-rose-400 px-1.5 py-0.5 rounded-full">
        {pct}%
      </span>
    );
  };

  const rankBadge = (i: number) => {
    const tone = RANK_BADGES[i] || 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800';
    return (
      <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ${tone}`}>
        {i + 1}
      </span>
    );
  };

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
        >
          {/* Header row */}
          <div className="flex items-center justify-between max-w-xl mx-auto mb-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">
              Sound predictor
            </span>
            <button
              onClick={() => setVisible(false)}
              className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-w-xl mx-auto space-y-4">
            {/* Panel card */}
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
              {/* Title */}
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <Music className="text-amber-800 dark:text-amber-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Trending Sounds</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                    Viral-predicted reel music · top 5
                  </p>
                </div>
                <button
                  onClick={refresh}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                  disabled={loading}
                  title="Refresh"
                >
                  <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                Every sound used on a reel is counted. Sounds are ranked by a viral score — usage ×
                daily growth² — so the fastest-rising tracks surface at the top.
              </p>

              {/* Trending top 5 */}
              {loading ? (
                <div className="py-10 text-center flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                  <Loader2 size={13} className="animate-spin" /> Scanning sounds…
                </div>
              ) : trending.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Play className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No sounds tracked yet.</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    Track one below to start predicting virality
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trending.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 px-3 py-2.5"
                    >
                      {rankBadge(i)}
                      <span className="w-8 h-8 shrink-0 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center text-amber-800 dark:text-amber-400">
                        <Play size={13} fill="currentColor" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-[#3a342a] dark:text-zinc-100 truncate">{s.name}</div>
                        {s.artist ? (
                          <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 truncate">{s.artist}</div>
                        ) : (
                          <div className="text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
                            {s.usageCount} use{s.usageCount === 1 ? '' : 's'}
                          </div>
                        )}
                      </div>
                      {growthBadge(s.growthRate || 1)}
                      <span className="font-mono text-[9px] text-[#8a8172] dark:text-zinc-500 hidden sm:inline">
                        {s.score}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* View all / top 5 toggle */}
              {allSounds.length > 0 && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:text-zinc-100 hover:bg-[#ebdcca]/40 transition-all"
                >
                  <ListMusic size={11} />
                  {showAll ? 'Show top 5' : `View all ${allSounds.length} sounds`}
                </button>
              )}

              {showAll && allSounds.length > 0 && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/40 divide-y divide-[#ebdcca]/60 dark:divide-zinc-800">
                  {allSounds.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                      <Play size={11} className="text-[#8a8172] dark:text-zinc-500 shrink-0" fill="currentColor" />
                      <span className="flex-1 min-w-0 text-xs text-[#3a342a] dark:text-zinc-100 truncate">{s.name}</span>
                      <span className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500">
                        {s.usageCount} use{s.usageCount === 1 ? '' : 's'}
                      </span>
                      {growthBadge(s.growthRate || 1)}
                    </div>
                  ))}
                </div>
              )}

              {/* Track a sound form */}
              {currentUser ? (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2 bg-white/40 dark:bg-zinc-950/30">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                    <Plus size={11} /> Track a sound
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') trackSound(); }}
                      placeholder="Sound name (e.g. Ocean Wave Drift)"
                      className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors"
                    />
                    <button
                      onClick={trackSound}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Track
                    </button>
                  </div>
                  <input
                    value={artist}
                    onChange={e => setArtist(e.target.value)}
                    placeholder="Artist / original creator (optional)"
                    className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors"
                  />
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    Log a usage now — the scan also picks up sounds from reel captions (e.g. “#sound name”).
                  </p>
                </div>
              ) : (
                <p className="font-mono text-[9px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500 text-center">
                  Sign in to track new sounds — the top 5 is visible to everyone.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
