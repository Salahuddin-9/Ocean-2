import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  X, MapPin, BadgeCheck, Loader2, Camera, ShieldCheck, KeyRound,
  LocateFixed, RefreshCw, AlertTriangle, Clock3, ChevronDown,
} from 'lucide-react';

/**
 * Ocean — Verified Live (FEATURE 120 — Proof-of-Location Anti-Fake-News Badge)
 * -----------------------------------------------------------------------------
 * A "Live Reporter" flow: pick one of your video posts, capture device GPS
 * (browser consent prompt), and the server stamps a signed proof (HMAC over
 * postId | userId | coords | server-time). The badge gallery lists every proof
 * with its signature so the tamper-evidence is visible.
 */

interface VerifiedLiveProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Proof {
  id: string;
  postId: string;
  postPreview: string;
  userName: string;
  lat: number;
  lng: number;
  accuracy: number;
  verifiedAt: number;
  signature: string;
  fullSignature?: string;
  revokedAt?: number;
  isMine?: boolean;
}

interface MyPost {
  id: string;
  content: string;
  videoUrl?: string;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function VerifiedLive({ token, currentUser, onClose }: VerifiedLiveProps) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // verify flow
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'done'>('idle');
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

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

  const loadProofs = useCallback(async () => {
    try {
      const data = await api('/api/verified-live');
      setProofs(data.proofs || []);
    } catch (e: any) {
      setError(e.message || 'Could not load proofs.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (token) loadProofs();
  }, [token, loadProofs]);

  if (!token) {
    return (
      <div className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
        <div className="max-w-xl mx-auto">
          <Header onClose={onClose} />
          <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-8 text-center space-y-3">
            <KeyRound className="mx-auto text-[#8a8172]" size={28} />
            <p className="font-display text-base font-bold text-[#3a342a] dark:text-zinc-100">Log in to verify</p>
            <p className="text-xs text-[#8a8172] max-w-xs mx-auto">
              Live Reporter needs a session so proofs can be signed to your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const loadMyPosts = async () => {
    try {
      const data = await api('/api/auth/me');
      const posts: any[] = data.user?.profile?.posts || [];
      setMyPosts(
        posts
          .filter((p: any) => p && p.id && (p.videoUrl || p.imageUrl))
          .map((p: any) => ({ id: p.id, content: p.content || p.title || 'Untitled post', videoUrl: p.videoUrl }))
      );
      setPostsLoaded(true);
    } catch (e: any) {
      setVerifyMsg(e.message || 'Could not load your posts.');
      setPostsLoaded(true);
    }
  };

  const captureGps = () => {
    setGpsState('locating');
    setVerifyMsg('');
    if (!navigator.geolocation) {
      setGpsState('idle');
      setVerifyMsg('Geolocation is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setGpsState('done');
      },
      () => {
        setGpsState('idle');
        setVerifyMsg('Location permission denied. Grant permission or enter coordinates manually.');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const verifyPost = async () => {
    if (!selectedPostId || !gps || verifyBusy) return;
    setVerifyBusy(true);
    setVerifyMsg('');
    try {
      const data = await api('/api/posts/verify-location', 'POST', {
        postId: selectedPostId,
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy,
      });
      setVerifyMsg(`Verified Live — +${data.coins || 15} coins. Signature ${data.proof?.signature || ''}`);
      setProofs((prev) => [data.proof, ...prev.filter((p) => p.postId !== data.proof.postId)]);
      setSelectedPostId('');
      setGps(null);
      setGpsState('idle');
    } catch (e: any) {
      setVerifyMsg(e.message || 'Verification failed.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const revoke = async (postId: string) => {
    try {
      await api('/api/posts/revoke-verification', 'POST', { postId });
      setProofs((prev) => prev.filter((p) => p.postId !== postId));
    } catch (e: any) {
      setVerifyMsg(e.message || 'Revoke failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <Header onClose={onClose} />

        {/* How it works */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-emerald-600" />
            <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">How the proof works</h3>
          </div>
          <p className="text-[11px] leading-relaxed text-[#5c5446] dark:text-zinc-300">
            Device GPS is captured in your browser, then the server signs{' '}
            <code className="text-[10px] font-mono bg-[#ebdcca]/50 dark:bg-zinc-800 px-1 rounded">postId | userId | coords | server-time</code>{' '}
            with an HMAC. The badge means <b>“this person was demonstrably at this location at this time”</b> — any edit
            to the post breaks the signature, making fake “live at the scene” posts costly to fabricate.
          </p>
        </div>

        {/* Verify panel */}
        <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-amber-600/10 flex items-center justify-center">
              <Camera className="text-amber-600" size={15} />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Live Reporter — verify a post</h3>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Requires location permission</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8172] pointer-events-none" />
              <select
                value={selectedPostId}
                onChange={(e) => setSelectedPostId(e.target.value)}
                onClick={() => !postsLoaded && loadMyPosts()}
                className="w-full pl-3 pr-8 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
              >
                <option value="">{postsLoaded ? 'Select your media post…' : 'Load my posts…'}</option>
                {myPosts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.content.slice(0, 40) || p.id}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={captureGps}
              disabled={gpsState === 'locating'}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[10px] font-mono uppercase font-bold transition-colors ${
                gps
                  ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border border-emerald-600/30'
                  : 'bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50'
              }`}
            >
              {gpsState === 'locating' ? <Loader2 size={13} className="animate-spin" /> : gps ? <BadgeCheck size={13} /> : <LocateFixed size={13} />}
              {gps ? `Locked ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'Capture GPS'}
            </button>
          </div>

          {gps && (
            <p className="font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              GPS locked · accuracy ±{gps.accuracy || '?'}m · rounded to ~11m before signing
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={verifyPost}
              disabled={!selectedPostId || !gps || verifyBusy}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-40"
            >
              {verifyBusy ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />}
              Sign Verified Live
            </button>
            <button
              onClick={loadProofs}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-[#cfcac0] text-xs text-[#3a342a] hover:bg-[#f6f1e7]"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {verifyMsg && (
            <p className={`font-mono text-[9px] uppercase tracking-wider ${verifyMsg.startsWith('Verified') ? 'text-emerald-600' : 'text-rose-500'}`}>
              {verifyMsg}
            </p>
          )}
        </div>

        {/* Badge gallery */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5">
              <MapPin size={14} className="text-amber-600" /> Verified Live proofs
              <span className="font-mono text-[9px] text-[#8a8172]">({proofs.length})</span>
            </h3>
          </div>

          {loading ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto text-[#8a8172] animate-spin" size={22} />
            </div>
          ) : error ? (
            <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-rose-500">{error}</div>
          ) : proofs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Camera className="mx-auto text-[#8a8172]" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No proofs yet.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Verify your first video post above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {proofs.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-emerald-600/10 flex items-center justify-center shrink-0">
                        <BadgeCheck className="text-emerald-600" size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#3a342a] dark:text-zinc-100 truncate">{p.postPreview}</p>
                        <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
                          by {p.userName} · {timeAgo(p.verifiedAt)}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[8px] font-mono uppercase font-bold bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                      Verified Live
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] text-[#5c5446] dark:text-zinc-400">
                    <span className="flex items-center gap-1"><MapPin size={9} /> {p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                    <span className="flex items-center gap-1"><Clock3 size={9} /> {new Date(p.verifiedAt).toLocaleString()}</span>
                    {p.accuracy > 0 && <span>±{p.accuracy}m</span>}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[9px] font-mono text-emerald-700 dark:text-emerald-400 bg-[#ebdcca]/40 dark:bg-zinc-800 px-2 py-1 rounded-lg truncate" title={p.fullSignature}>
                      sig: {p.signature}…
                    </code>
                    {p.isMine && (
                      <button
                        onClick={() => revoke(p.postId)}
                        className="flex items-center gap-1 text-[8px] font-mono uppercase font-bold text-rose-500 hover:underline shrink-0"
                      >
                        <AlertTriangle size={9} /> Revoke
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-amber-600/10 flex items-center justify-center">
          <BadgeCheck className="text-amber-600" size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Verified Live</h2>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
            Proof-of-location · anti fake news · 120
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
