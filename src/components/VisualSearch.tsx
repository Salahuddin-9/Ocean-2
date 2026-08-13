import { useCallback, useState } from 'react';
import { motion } from 'motion/react';
import {
  Search, X, Loader2, Sparkles, Film, Hash, Image as ImageIcon,
  Video as VideoIcon, KeyRound, CheckCircle2, RefreshCw, ArrowRight, FolderOpen,
} from 'lucide-react';
import { captureAndUploadKeyframe } from '../lib/mediaKeyframe';

/**
 * Ocean — Visual Search (FEATURE 110 — Semantic Media Search)
 * -----------------------------------------------------------
 * Natural-language search over reels / media keyframes: type what you want to
 * see ("girl in red saree dancing") and get cosine-similarity ranked hits from
 * `/api/search/media`. Includes an "Index your reels" panel that captures a
 * keyframe from each of the current user's video posts, uploads it, and indexes
 * it so search actually has content to match against.
 */

interface VisualSearchProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface MediaEntry {
  id: string;
  postId: string | null;
  mediaUrl: string | null;
  keyframeUrl: string | null;
  caption: string;
  description: string;
  keywords: string[];
  indexedBy: string;
  indexedAt: number;
}

interface SearchResult {
  entry: MediaEntry;
  similarity: number;
}

interface MyReel {
  id: string;
  videoUrl: string;
  content: string;
}

const EXAMPLES = [
  'girl in red saree dancing',
  'cooking biryani',
  'sunset beach drone shot',
  'cricket match celebration',
];

function timeAgo(ts: number): string {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function VisualSearch({ token, currentUser, onClose }: VisualSearchProps) {
  // ---- state ---------------------------------------------------------------
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const [myReels, setMyReels] = useState<MyReel[]>([]);
  const [reelsLoaded, setReelsLoaded] = useState(false);
  const [loadingReels, setLoadingReels] = useState(false);
  const [indexBusy, setIndexBusy] = useState(false);
  const [indexDone, setIndexDone] = useState(0);
  const [indexTotal, setIndexTotal] = useState(0);
  const [indexStatus, setIndexStatus] = useState('');
  const [backfillBusy, setBackfillBusy] = useState(false);

  const api = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    [token]
  );

  // ---- auth gate (after hooks so render order stays stable) ----------------
  if (!token) {
    return (
      <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
              <Sparkles size={18} className="text-amber-600" /> Visual Search
            </h2>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white">
              <X size={16} />
            </button>
          </div>
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-8 text-center space-y-3">
            <KeyRound className="mx-auto text-[#8a8172]" size={28} />
            <p className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100">Log in to search</p>
            <p className="text-xs text-[#8a8172] max-w-xs mx-auto">
              Visual Search needs a session to index your reels and personalize results.
              Log in first, then come back here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const runSearch = async (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setSearching(true);
    setSearched(true);
    setError('');
    setResults([]);
    try {
      const data = await api(`/api/search/media?q=${encodeURIComponent(clean)}`);
      setResults(data.results || []);
    } catch (e: any) {
      setError(e.message || 'Search failed. Is the server running?');
    } finally {
      setSearching(false);
    }
  };

  const openPost = (postId: string | null) => {
    if (!postId) return;
    // refresh-feed is handled by App.tsx (refetches feed); open-post is a wiring
    // hook for the host to scroll to / open the actual post.
    window.dispatchEvent(new CustomEvent('refresh-feed'));
    window.dispatchEvent(new CustomEvent('open-post', { detail: { postId } }));
    window.dispatchEvent(
      new CustomEvent('show-toast', { detail: { message: 'Opening post in feed…' } })
    );
  };

  // ---- index-your-reels panel ---------------------------------------------
  // Fetches the caller's own posts via GET /api/auth/me (which returns
  // user.profile.posts — the canonical store for a user's posts), filters to
  // those with a videoUrl (i.e. reels), then captures + uploads a keyframe for
  // each and POSTs /api/search/media/index.
  const loadMyReels = async () => {
    if (loadingReels) return;
    setLoadingReels(true);
    setReelsLoaded(true);
    setIndexStatus('');
    try {
      const data = await api('/api/auth/me');
      const posts: any[] = data.user?.profile?.posts || [];
      const reels = posts
        .filter((p: any) => p && p.id && p.videoUrl)
        .map((p: any) => ({ id: p.id, videoUrl: p.videoUrl, content: p.content || p.title || '' }));
      setMyReels(reels);
      setIndexStatus(
        reels.length === 0
          ? 'No reels (video posts) found on your profile.'
          : `${reels.length} reel${reels.length > 1 ? 's' : ''} found.`
      );
    } catch (e: any) {
      setIndexStatus(e.message || 'Could not load your reels.');
    } finally {
      setLoadingReels(false);
    }
  };

  const indexAllReels = async () => {
    if (indexBusy) return;
    setIndexBusy(true);
    setIndexStatus('');
    const reels = myReels;
    if (reels.length === 0) {
      // Nothing client-side: fall back to the server's caption-only backfill.
      try {
        const data = await api('/api/search/media/backfill', 'POST');
        setIndexStatus(
          `Backfilled captions — ${data.indexed || 0} indexed, ${data.skipped || 0} already done.`
        );
      } catch (e: any) {
        setIndexStatus(e.message || 'Backfill failed.');
      }
      setIndexBusy(false);
      return;
    }
    const total = reels.length;
    setIndexTotal(total);
    setIndexDone(0);
    let done = 0;
    let failed = 0;
    for (const reel of reels) {
      try {
        const keyframeUrl = await captureAndUploadKeyframe(reel.videoUrl, token);
        await api('/api/search/media/index', 'POST', {
          postId: reel.id,
          mediaUrl: reel.videoUrl,
          keyframeUrl: keyframeUrl || null,
          caption: reel.content,
        });
        if (!keyframeUrl) failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      setIndexDone(done);
      setIndexStatus(`Indexed ${done}/${total}`);
    }
    setIndexBusy(false);
    setIndexStatus(
      failed > 0
        ? `Done — ${done - failed} indexed with keyframes, ${failed} skipped (frames unavailable).`
        : `Done — ${done}/${total} reels indexed.`
    );
  };

  const runBackfill = async () => {
    if (backfillBusy) return;
    setBackfillBusy(true);
    try {
      const data = await api('/api/search/media/backfill', 'POST');
      setIndexStatus(
        `Backfilled captions — ${data.indexed || 0} new, ${data.skipped || 0} already indexed.`
      );
    } catch (e: any) {
      setIndexStatus(e.message || 'Backfill failed.');
    } finally {
      setBackfillBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-amber-600/10 flex items-center justify-center">
              <Sparkles className="text-amber-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Visual Search</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Semantic media search over reels &amp; keyframes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search box */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 space-y-4">
          <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
            Describe what you want to see — e.g. <b>girl in red saree dancing</b>. Matches are
            ranked by semantic similarity against indexed reel keyframes.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8172]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch(query);
                }}
                placeholder="e.g. girl in red saree dancing"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
              />
            </div>
            <button
              onClick={() => runSearch(query)}
              disabled={searching || !query.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
            >
              {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              Search
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuery(ex);
                  runSearch(ex);
                }}
                className="text-[9px] font-mono uppercase tracking-wide text-[#5c5446] dark:text-zinc-300 bg-[#ebdcca]/40 dark:bg-zinc-800 hover:bg-[#ebdcca]/70 dark:hover:bg-zinc-700 px-2.5 py-1 rounded-full transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div>
          {searching ? (
            <div className="py-14 text-center space-y-2">
              <Loader2 className="mx-auto text-[#8a8172] animate-spin" size={24} />
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">Embedding query…</p>
            </div>
          ) : error ? (
            <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-rose-500">{error}</div>
          ) : searched && results.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <Film className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No matches found.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                Index your reels below, then search again
              </p>
            </div>
          ) : searched ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                  {results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {results.map((r) => {
                  const pct = Math.round(r.similarity * 100);
                  return (
                    <motion.div
                      key={r.entry.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl overflow-hidden"
                    >
                      <div className="aspect-video bg-[#0d0d10] dark:bg-zinc-900 relative">
                        {r.entry.keyframeUrl ? (
                          <img src={r.entry.keyframeUrl} alt="" className="w-full h-full object-cover" />
                        ) : r.entry.mediaUrl ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <VideoIcon className="text-[#f4f1ea]/70" size={30} />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="text-[#f4f1ea]/70" size={30} />
                          </div>
                        )}
                        <span className="absolute top-2 left-2 text-[8px] font-mono uppercase font-bold bg-[#3a342a]/85 text-[#f4f1ea] px-1.5 py-0.5 rounded-full">
                          {pct}% match
                        </span>
                      </div>
                      <div className="p-3 space-y-2">
                        <p className="text-[11px] leading-relaxed text-[#3a342a] dark:text-zinc-100 line-clamp-2">
                          {r.entry.description || r.entry.caption || 'Untitled media'}
                        </p>
                        {r.entry.keywords && r.entry.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.entry.keywords.slice(0, 4).map((k) => (
                              <span
                                key={k}
                                className="flex items-center gap-0.5 text-[8px] font-mono uppercase text-[#5c5446] dark:text-zinc-400 bg-[#ebdcca]/50 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full"
                              >
                                <Hash size={8} /> {k}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[8px] font-mono uppercase tracking-wider text-[#8a8172]">
                            {timeAgo(r.entry.indexedAt)}
                          </span>
                          {r.entry.postId && (
                            <button
                              onClick={() => openPost(r.entry.postId)}
                              className="flex items-center gap-1 text-[8px] font-mono uppercase font-bold text-amber-800 dark:text-amber-400 hover:underline"
                            >
                              Open post <ArrowRight size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="py-14 text-center space-y-2">
              <Sparkles className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">Search the visual memory of the feed.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                Try an example above, or index your reels first
              </p>
            </div>
          )}
        </div>

        {/* Index your reels */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-emerald-600/10 flex items-center justify-center">
              <Film className="text-emerald-600" size={15} />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                Index your reels
              </h3>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                Capture a keyframe from each of your video posts and add it to the search index
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => (reelsLoaded ? indexAllReels() : loadMyReels())}
              disabled={indexBusy || loadingReels}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
            >
              {indexBusy ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
              {reelsLoaded ? 'Index my reels' : 'Find my reels'}
            </button>
            <button
              onClick={runBackfill}
              disabled={backfillBusy || indexBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] text-xs text-[#3a342a] hover:bg-[#f6f1e7] disabled:opacity-50"
            >
              <RefreshCw size={12} className={backfillBusy ? 'animate-spin' : ''} />
              Quick backfill (captions only)
            </button>
          </div>

          {loadingReels && (
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Loading your reels…
            </p>
          )}
          {indexBusy && indexTotal > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#5c5446] dark:text-zinc-300">
                Indexed {indexDone}/{indexTotal}
              </p>
              <div className="h-1.5 rounded-full bg-[#ebdcca]/60 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-600 to-amber-400 rounded-full transition-all"
                  style={{ width: `${Math.round((indexDone / indexTotal) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {indexStatus && !indexBusy && (
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-emerald-600" /> {indexStatus}
            </p>
          )}

          {reelsLoaded && !indexBusy && myReels.length > 0 && (
            <div className="text-[10px] text-[#8a8172] space-y-0.5">
              <p className="font-mono text-[8px] uppercase tracking-wider">Your reels:</p>
              {myReels.slice(0, 6).map((r) => (
                <p key={r.id} className="flex items-center gap-1.5 truncate">
                  <VideoIcon size={10} className="shrink-0" />
                  <span className="truncate">{r.content || r.id}</span>
                </p>
              ))}
              {myReels.length > 6 && <p className="font-mono text-[8px]">+{myReels.length - 6} more</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
