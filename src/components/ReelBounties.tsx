import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target, Plus, X, Wallet, CheckCircle2, Clock, User, MessageSquare, ArrowLeft, Trophy, Coins,
} from 'lucide-react';

/**
 * Ocean — Reel Bounties (Feature 115)
 * -------------------------------------
 * Open-source bounties attached to posts/reels. Coins are ESCROWED out of the
 * owner's wallet when the bounty is created; accepting a solution comment
 * transfers the escrow to the commenter. Backed by /api/bounty*.
 *
 * Views:
 *  - List of bounties (Open / Mine / Resolved) with ৳ badge + owner + status.
 *  - Create form (postId, title, desc, amount) with a wallet-balance hint.
 *  - Detail: bounty info + the attached post's comments, each with an
 *    "Accept as solution" button (owner only) and a candidate highlight.
 */

type BountyStatus = 'open' | 'resolved' | 'expired';

interface Bounty {
  id: string;
  postId: string;
  reelId?: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  ownerId: string;
  ownerName?: string;
  status: BountyStatus;
  acceptedCommentId: string | null;
  acceptedBy: string | null;
  acceptedByName?: string | null;
  acceptedAt: number | null;
  createdAt: number;
  expiresAt: number;
  solution?: string;
  candidateCommentId?: string | null;
  candidateCommenterId?: string | null;
}

interface BountyComment {
  id: string;
  senderId?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  text: string;
  timestamp?: string;
  image?: string | null;
  audioUrl?: string | null;
}

interface ReelBountiesProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const TAKA = '৳';

const STATUS_CHIP: Record<BountyStatus, string> = {
  open: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  resolved: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  expired: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ReelBounties({ token, currentUser, onClose }: ReelBountiesProps) {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [filter, setFilter] = useState<'open' | 'mine' | 'resolved'>('open');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ postId: '', title: '', description: '', amount: '' });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Bounty | null>(null);
  const [detailComments, setDetailComments] = useState<BountyComment[]>([]);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'mine' ? '?mine=1' : '';
      const data = await api(`/api/bounty${q}`, 'GET');
      setBounties(data.bounties || []);
    } catch (e) {
      console.error('Failed to load bounties:', e);
    }
    setLoading(false);
  }, [api, filter]);

  useEffect(() => {
    load();
  }, [load]);

  // Wallet-balance hint — only shows if a wallet route (/api/community) is reachable.
  useEffect(() => {
    if (!token || !currentUser?.id) return;
    api('/api/community', 'GET')
      .then((data: any) => {
        const bal = data?.state?.balances?.[currentUser.id];
        if (typeof bal === 'number') setBalance(bal);
      })
      .catch(() => {
        /* wallet route unavailable — skip the hint */
      });
  }, [api, token, currentUser]);

  const createBounty = async () => {
    const amt = Number(form.amount);
    if (!form.postId.trim()) return toast('Post ID is required.', 'destructive');
    if (form.title.trim().length < 3) return toast('Title must be at least 3 characters.', 'destructive');
    if (!amt || amt <= 0) return toast('Enter a positive bounty amount.', 'destructive');
    if (balance !== null && amt > balance) return toast(`Your wallet only has ${TAKA}${balance}.`, 'destructive');
    setSaving(true);
    try {
      const data = await api('/api/bounty', 'POST', {
        postId: form.postId.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        amount: Math.floor(amt),
      });
      if (typeof data.balance === 'number') setBalance(data.balance);
      toast(`Bounty created — ${TAKA}${data.bounty.amount} escrowed from your wallet.`);
      setCreateOpen(false);
      setForm({ postId: '', title: '', description: '', amount: '' });
      load();
    } catch (e: any) {
      toast(e.message || 'Failed to create bounty.', 'destructive');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (b: Bounty) => {
    setDetail(b);
    setDetailComments([]);
    try {
      const data = await api(`/api/bounty/${b.id}`, 'GET');
      setDetail(data.bounty || b);
      setDetailComments(data.comments || []);
    } catch (e: any) {
      toast(e.message, 'destructive');
    }
  };

  const acceptComment = async (b: Bounty, c: BountyComment) => {
    if (!window.confirm(`Accept this comment as the solution and transfer ${TAKA}${b.amount} BDT to the commenter?`)) return;
    try {
      const data = await api(`/api/bounty/${b.id}/accept-comment`, 'POST', {
        commentId: c.id,
        commenterId: c.senderId || '',
      });
      toast(`Solved! ${TAKA}${data.transferred} BDT transferred to the commenter.`);
      setDetail(data.bounty || b);
      load();
    } catch (e: any) {
      toast(e.message, 'destructive');
    }
  };

  const nominateCandidate = async (b: Bounty, c: BountyComment) => {
    try {
      await api(`/api/bounty/${b.id}/comment`, 'POST', { commentId: c.id, commenterId: c.senderId || '' });
      toast('Comment marked as the candidate solution.');
      setDetail({ ...b, candidateCommentId: c.id, candidateCommenterId: c.senderId || '' });
    } catch (e: any) {
      toast(e.message, 'destructive');
    }
  };

  const expireBounty = async (b: Bounty) => {
    if (!window.confirm(`Expire this bounty and refund ${TAKA}${b.amount} to your wallet?`)) return;
    try {
      const data = await api(`/api/bounty/${b.id}/expire`, 'POST');
      if (typeof data.balance === 'number') setBalance(data.balance);
      toast(`Bounty expired — ${TAKA}${data.refunded} refunded to your wallet.`);
      setDetail(data.bounty || b);
      load();
    } catch (e: any) {
      toast(e.message, 'destructive');
    }
  };

  const isOwner = (b: Bounty) => currentUser?.id === b.ownerId;
  const expiredSoon = (b: Bounty) => b.status === 'open' && b.expiresAt < Date.now();
  const myComment = (c: BountyComment) => c.senderId === currentUser?.id;

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-[#3a342a]/10 flex items-center justify-center">
              <Target className="text-[#3a342a] dark:text-zinc-100" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Reel Bounties</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Open-source · escrowed coins
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#3a342a] dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {detail ? (
          /* ── Detail view ─────────────────────────────────────────── */
          <div className="space-y-4">
            <button
              onClick={() => setDetail(null)}
              className="flex items-center gap-1.5 bg-white border border-[#cfcac0] rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-200 hover:bg-[#f6f1e7] transition-colors"
            >
              <ArrowLeft size={12} /> Back to bounties
            </button>

            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-5 md:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full ${STATUS_CHIP[detail.status]}`}>
                      {detail.status}
                    </span>
                    {expiredSoon(detail) && (
                      <span className="text-[8px] font-mono uppercase bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded-full">
                        past expiry
                      </span>
                    )}
                    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-amber-800 text-[#f4f1ea] flex items-center gap-1">
                      <Coins size={10} /> Bounty {TAKA}{detail.amount}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100 mt-2">{detail.title}</h3>
                </div>
              </div>

              {detail.description && (
                <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{detail.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
                <span className="flex items-center gap-1 normal-case">
                  <User size={11} /> {detail.ownerName || detail.ownerId}
                </span>
                <span className="flex items-center gap-1 normal-case">
                  <Clock size={11} /> {timeAgo(detail.createdAt)} · expires {fmtDate(detail.expiresAt)}
                </span>
                <span className="flex items-center gap-1 normal-case">
                  <MessageSquare size={11} /> {detailComments.length} comments
                </span>
              </div>

              {detail.postId && (
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 bg-white/60 dark:bg-zinc-800/60 px-3 py-2 text-[10px] font-mono text-[#8a8172]">
                  Post <span className="text-[#5c5446] dark:text-zinc-300">{detail.postId}</span>
                  {detail.reelId ? ` · reel ${detail.reelId}` : ''}
                </div>
              )}

              {detail.status === 'open' && isOwner(detail) && (
                <button
                  onClick={() => expireBounty(detail)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#cfcac0] text-[10px] font-mono uppercase font-bold text-[#3a342a] dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 hover:bg-[#f6f1e7] transition-colors"
                >
                  <Clock size={11} /> Expire & refund escrow
                </button>
              )}

              {detail.status === 'resolved' && (
                <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/40 p-3 space-y-1">
                  <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Trophy size={11} /> Solved — {TAKA}{detail.amount} transferred to {detail.acceptedByName || detail.acceptedBy}
                  </p>
                  {detail.solution && <p className="text-xs text-[#5c5446] dark:text-zinc-300">{detail.solution}</p>}
                </div>
              )}

              {/* Comments */}
              <div className="space-y-2 pt-1 border-t border-[#ebdcca]/60 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                  <MessageSquare size={11} /> Solution comments
                </div>
                {detailComments.length === 0 ? (
                  <p className="text-xs text-[#8a8172] dark:text-zinc-400">
                    No comments yet. Solvers post solution comments on the post, then the owner accepts one here.
                  </p>
                ) : (
                  detailComments.map((c) => {
                    const accepted = detail.acceptedCommentId === c.id;
                    const candidate = detail.candidateCommentId === c.id && !accepted;
                    return (
                      <div
                        key={c.id}
                        className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                          accepted
                            ? 'border-emerald-300/70 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/40'
                            : candidate
                            ? 'border-amber-300/70 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/30'
                            : 'border-[#ebdcca]/70 dark:border-zinc-700 bg-white/60 dark:bg-zinc-800/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5">
                            {c.senderAvatarUrl ? (
                              <img src={c.senderAvatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                            ) : (
                              <User size={12} className="text-[#8a8172]" />
                            )}
                            {c.senderName || 'Anonymous'}
                          </span>
                          {accepted && (
                            <span className="text-[8px] font-mono uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 size={9} /> Accepted
                            </span>
                          )}
                          {candidate && !accepted && (
                            <span className="text-[8px] font-mono uppercase bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                              Candidate
                            </span>
                          )}
                        </div>
                        <p className="text-[#5c5446] dark:text-zinc-300">{c.text}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-[#8a8172]">{c.timestamp || ''}</span>
                          <div className="flex gap-2">
                            {detail.status === 'open' && isOwner(detail) && (
                              <button
                                onClick={() => acceptComment(detail, c)}
                                className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 flex items-center gap-1 transition-colors"
                              >
                                <Trophy size={10} /> Accept as solution
                              </button>
                            )}
                            {detail.status === 'open' && myComment(c) && !candidate && (
                              <button
                                onClick={() => nominateCandidate(detail, c)}
                                className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-[#5c5446] dark:text-zinc-300 border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#f6f1e7] transition-colors"
                              >
                                Mark as candidate
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── List view ───────────────────────────────────────────── */
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">
                  {filter === 'open' ? 'Open bounties' : filter === 'mine' ? 'My bounties' : 'Resolved bounties'}
                </h3>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 mt-0.5">
                  Post a challenge, escrow coins, reward a solution
                </p>
              </div>
              <button
                onClick={() => setCreateOpen(true)}
                className="font-mono text-[9px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 py-2 px-3 rounded-xl border border-amber-200/50 dark:border-zinc-700 hover:bg-amber-50/50 dark:hover:bg-zinc-800 transition-all flex items-center gap-1"
              >
                <Plus size={12} /> New Bounty
              </button>
            </div>

            {balance !== null && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8a8172] dark:text-zinc-400">
                <Wallet size={11} /> Your wallet: <span className="text-[#3a342a] dark:text-zinc-200 font-bold">{TAKA}{balance}</span>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-2">
              {(
                [
                  ['open', 'Open'],
                  ['mine', 'Mine'],
                  ['resolved', 'Resolved'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
                    filter === k
                      ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                      : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Loading bounties…
              </div>
            ) : bounties.length === 0 ? (
              <div className="py-14 text-center space-y-2">
                <Target className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No bounties here yet.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Attach coins to a post and reward the best solution
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bounties.map((b) => (
                  <motion.div
                    key={b.id}
                    layout
                    onClick={() => openDetail(b)}
                    className="cursor-pointer rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm hover:border-amber-300/70 dark:hover:border-amber-700/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-amber-800 text-[#f4f1ea] flex items-center gap-1">
                        <Coins size={10} /> Bounty {TAKA}{b.amount}
                      </span>
                      <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full ${STATUS_CHIP[b.status]}`}>
                        {b.status}
                      </span>
                      {expiredSoon(b) && (
                        <span className="text-[8px] font-mono uppercase bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded-full">
                          past expiry
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 mt-2">{b.title}</h3>
                    {b.description && (
                      <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-1 line-clamp-2">{b.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
                      <span className="flex items-center gap-1 normal-case">
                        <User size={11} /> {b.ownerName || b.ownerId}
                      </span>
                      <span className="flex items-center gap-1 normal-case">
                        <Clock size={11} /> {timeAgo(b.createdAt)}
                      </span>
                      {b.status === 'resolved' && b.acceptedByName && (
                        <span className="flex items-center gap-1 normal-case text-emerald-600 dark:text-emerald-400">
                          <Trophy size={11} /> solved by {b.acceptedByName}
                        </span>
                      )}
                      {b.status === 'open' && isOwner(b) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            expireBounty(b);
                          }}
                          className="ml-auto flex items-center gap-1 text-[#8a8172] hover:text-rose-600 transition-colors normal-case"
                          title="Expire & refund escrow"
                        >
                          <Clock size={11} /> Expire
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create bounty dialog */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setCreateOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Target className="text-amber-800 dark:text-amber-400" size={16} /> Create Bounty
                </h3>
                <button onClick={() => setCreateOpen(false)} className="text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-200">
                  <X size={16} />
                </button>
              </div>

              {balance !== null && (
                <div className="flex items-center justify-between rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 bg-white/60 dark:bg-zinc-800/60 px-3 py-2 text-[10px] font-mono text-[#8a8172]">
                  <span className="flex items-center gap-1.5">
                    <Wallet size={11} /> Your wallet
                  </span>
                  <span className="text-[#3a342a] dark:text-zinc-200 font-bold">{TAKA}{balance}</span>
                </div>
              )}

              <input
                value={form.postId}
                onChange={(e) => setForm({ ...form, postId: e.target.value })}
                placeholder="Post / reel ID (paste the post id)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
              />
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="What's the challenge? (e.g. Build a logo)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the task, acceptance criteria, reward notes…"
                rows={3}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="Bounty amount (BDT) — escrowed from your wallet"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
              />
              {balance !== null && Number(form.amount) > balance && (
                <p className="text-[10px] font-mono text-rose-500">Amount exceeds your wallet balance ({TAKA}{balance}).</p>
              )}

              <button
                onClick={createBounty}
                disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50 transition-all"
              >
                <Wallet size={12} /> {saving ? 'Escrowing…' : `Create & escrow ${TAKA}${form.amount || '…'}`}
              </button>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-400 leading-relaxed">
                The amount is escrowed out of your wallet immediately. When you accept a solution comment, the coins
                transfer to the commenter. Expiring the bounty refunds the escrow to you.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
