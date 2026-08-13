import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Crown, Wallet, Users, Lock, Unlock, HeartHandshake, BadgeCheck, RefreshCw, HandCoins,
} from 'lucide-react';

/**
 * Ocean — Micro-Subscriptions "10-Taka Patron"
 * ---------------------------------------------
 * Monthly paid subscriptions between users, billed in Ocean Coins.
 * Backed by /api/subscriptions* (turtleSubscriptionsBackend.ts).
 *
 * Two tabs:
 *  - "Subscriptions": browse creators, subscribe for 10 coins/month, cancel.
 *  - "My Patrons": your active patrons + monthly earnings, and the
 *    "Gate a post" tool that marks a post subscriber-only.
 */

interface MicroSubscriptionsProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface CreatorBrief {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  subscribed: boolean;
}

interface SubWithCreator {
  id: string;
  subscriberId: string;
  creatorId: string;
  amount: number;
  currency: string;
  monthly: boolean;
  status: 'active' | 'paused' | 'cancelled';
  startDate: number;
  nextBillingAt: number;
  lastBilledAt: number | null;
  gatedPosts: string[];
  creator: { id: string; name: string; username: string; avatarUrl: string };
}

interface PatronSub {
  id: string;
  subscriberId: string;
  creatorId: string;
  amount: number;
  status: 'active' | 'paused' | 'cancelled';
  startDate: number;
  nextBillingAt: number;
  lastBilledAt: number | null;
  subscriber: { id: string; name: string; username: string; avatarUrl: string };
}

const MONTHLY_AMOUNT = 10;

function fmtDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function initials(name: string): string {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

export default function MicroSubscriptions({ token, currentUser, onClose }: MicroSubscriptionsProps) {
  const [tab, setTab] = useState<'patrons' | 'subscriptions'>('subscriptions');
  const [balance, setBalance] = useState<number | null>(null);
  const [creators, setCreators] = useState<CreatorBrief[]>([]);
  const [subs, setSubs] = useState<SubWithCreator[]>([]);
  const [patrons, setPatrons] = useState<PatronSub[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [gatedPosts, setGatedPosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [gatePostId, setGatePostId] = useState('');

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = async (path: string, method = 'GET', body?: unknown) => {
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
  };

  const loadBalance = useCallback(async () => {
    try {
      const data = await api('/api/community', 'GET');
      setBalance((data?.state?.balances?.[currentUser?.id || '']) ?? 0);
    } catch {
      /* balance is optional — skip silently */
    }
  }, [token, currentUser]);

  const loadCreators = useCallback(async () => {
    try {
      const data = await api('/api/subscriptions/creators', 'GET');
      setCreators(data.creators || []);
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadSubs = useCallback(async () => {
    try {
      const data = await api('/api/subscriptions', 'GET');
      setSubs(data.subscriptions || []);
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadPatrons = useCallback(async () => {
    try {
      const data = await api('/api/subscriptions/mine', 'GET');
      setPatrons(data.patrons || []);
      setMonthlyTotal(data.monthlyEarnings || 0);
      setGatedPosts(data.gatedPosts || []);
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadBalance(), loadCreators(), loadSubs(), loadPatrons()]);
    setLoading(false);
  }, [loadBalance, loadCreators, loadSubs, loadPatrons]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const subscribe = async (c: CreatorBrief) => {
    setBusy(`sub-${c.id}`);
    try {
      const data = await api('/api/subscriptions', 'POST', { creatorId: c.id, amount: MONTHLY_AMOUNT });
      setBalance(data.balance ?? balance);
      toast(`Subscribed to ${c.name} — ${MONTHLY_AMOUNT} Ocean Coins / month.`);
      await Promise.all([loadBalance(), loadCreators(), loadSubs(), loadPatrons()]);
    } catch (e: any) {
      toast(e.message || 'Subscription failed.', 'destructive');
      await loadBalance();
    } finally {
      setBusy(null);
    }
  };

  const cancelSub = async (s: SubWithCreator) => {
    setBusy(`cancel-${s.id}`);
    try {
      await api(`/api/subscriptions/${s.id}`, 'DELETE');
      toast(`Subscription to ${s.creator.name} cancelled.`);
      await Promise.all([loadCreators(), loadSubs(), loadPatrons()]);
    } catch (e: any) {
      toast(e.message || 'Cancel failed.', 'destructive');
    } finally {
      setBusy(null);
    }
  };

  const toggleGate = async (postId: string, subscriberOnly: boolean) => {
    setBusy(`gate-${postId}`);
    try {
      const data = await api('/api/subscriptions/gate', 'POST', { postId, subscriberOnly });
      setGatedPosts(data.gatedPosts || []);
      toast(subscriberOnly ? `Post ${postId} is now subscriber-only.` : `Post ${postId} is public again.`);
    } catch (e: any) {
      toast(e.message || 'Gate update failed.', 'destructive');
    } finally {
      setBusy(null);
    }
  };

  const avatarBlock = (name: string, avatarUrl: string, cls: string) =>
    avatarUrl ? (
      <img src={avatarUrl} alt={name} className={`${cls} rounded-full object-cover`} />
    ) : (
      <span className={`${cls} rounded-full bg-amber-700/15 text-amber-800 dark:text-amber-300 flex items-center justify-center font-mono font-bold`}>
        {initials(name)}
      </span>
    );

  const tabBtn = (key: 'patrons' | 'subscriptions', label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(key)}
      className={`flex items-center gap-1.5 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
        tab === key
          ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
          : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-xs">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-amber-600/15 flex items-center justify-center">
                <Crown className="text-amber-700 dark:text-amber-400" size={18} />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">10-Taka Patron</h2>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                  Monthly micro-subscriptions · Ocean Coins
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
            Support creators with a <b>{MONTHLY_AMOUNT}-coin monthly patronage</b> — billed
            automatically from your Ocean Coin wallet every 30 days. Creators can
            <b> gate posts</b> so only their active patrons see the full content.
          </p>

          {/* Balance */}
          <div className="flex items-center justify-between rounded-2xl border border-[#ebdcca]/70 bg-white/40 dark:bg-zinc-900/40 px-4 py-3">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1.5">
              <Wallet size={12} /> Ocean Coin balance
            </span>
            <span className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100">
              {balance === null ? '…' : `${balance} coins`}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            {tabBtn('subscriptions', 'Subscriptions', <HandCoins size={11} />)}
            {tabBtn('patrons', 'My Patrons', <Users size={11} />)}
            <button
              onClick={() => loadAll()}
              className="ml-auto flex items-center gap-1.5 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60 transition-all"
              title="Refresh"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {/* ── Content ─────────────────────────────────────────────────────── */}
          {loading ? (
            <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              Loading patrons…
            </div>
          ) : tab === 'subscriptions' ? (
            /* ── Subscriptions tab ─────────────────────────────────────── */
            <div className="space-y-3">
              {creators.length === 0 ? (
                <div className="py-14 text-center space-y-2">
                  <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No other creators to follow yet.</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    Invite friends to start a patron economy
                  </p>
                </div>
              ) : (
                creators.map((c) => {
                  const my = subs.find((s) => s.creatorId === c.id);
                  const isBusy = busy === `sub-${c.id}` || (my && busy === `cancel-${my.id}`);
                  return (
                    <motion.div
                      key={c.id}
                      layout
                      className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4"
                    >
                      <div className="flex items-center gap-3">
                        {avatarBlock(c.name, c.avatarUrl, 'w-9 h-9')}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</span>
                            {my?.status === 'active' && <BadgeCheck size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />}
                          </div>
                          <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                            @{c.username || 'creator'}
                          </span>
                        </div>
                        {my?.status === 'active' && (
                          <span className="font-mono text-[8px] uppercase tracking-wider bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full shrink-0">
                            Active patron
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#ebdcca]/50 dark:border-zinc-800">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                          {my ? (
                            my.status === 'active' ? (
                              <>Next billing {fmtDate(my.nextBillingAt)} · {my.amount} coins</>
                            ) : (
                              <>Status: {my.status} · {my.amount} coins</>
                            )
                          ) : (
                            <>{MONTHLY_AMOUNT} coins / month</>
                          )}
                        </div>
                        {my?.status === 'active' ? (
                          <button
                            onClick={() => cancelSub(my)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[#3a342a] dark:text-zinc-200 text-[10px] font-mono uppercase font-bold hover:bg-[#ebdcca]/40 disabled:opacity-50 transition-all"
                          >
                            <Unlock size={11} /> Cancel
                          </button>
                        ) : (
                          <button
                            onClick={() => subscribe(c)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50 transition-all"
                          >
                            <HandCoins size={11} />
                            {isBusy ? 'Paying…' : my ? `Reactivate · ${MONTHLY_AMOUNT}` : `Subscribe · ${MONTHLY_AMOUNT}`}
                          </button>
                        )}
                        {my && my.status !== 'active' && (
                          <button
                            onClick={() => cancelSub(my)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#cfcac0] dark:border-zinc-700 text-[#3a342a] dark:text-zinc-200 text-[10px] font-mono uppercase font-bold hover:bg-[#ebdcca]/40 disabled:opacity-50 transition-all"
                          >
                            <Unlock size={11} /> Cancel
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          ) : (
            /* ── My Patrons tab ─────────────────────────────────────────── */
            <div className="space-y-4">
              {/* Monthly earnings */}
              <div className="flex items-center justify-between rounded-2xl border border-[#ebdcca]/70 bg-white/40 dark:bg-zinc-900/40 px-4 py-3">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1.5">
                  <HandCoins size={12} /> Monthly earnings
                </span>
                <span className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100">{monthlyTotal} coins</span>
              </div>

              {/* Gate a post */}
              <div className="rounded-2xl border border-[#ebdcca]/70 bg-white/40 dark:bg-zinc-900/40 p-4 space-y-2">
                <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1.5">
                  <Lock size={11} /> Gate a post
                </div>
                <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                  Paste a post id to make it subscriber-only. Only your active patrons can view it.
                  Find the id in a post object (e.g. <span className="font-mono">post-1784102659620-655</span>).
                </p>
                <div className="flex gap-2">
                  <input
                    value={gatePostId}
                    onChange={(e) => setGatePostId(e.target.value)}
                    placeholder="post-123…"
                    className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => {
                      const id = gatePostId.trim();
                      if (!id) return toast('Enter a post id first.');
                      toggleGate(id, true);
                      setGatePostId('');
                    }}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50 transition-all"
                  >
                    <Lock size={11} /> Gate
                  </button>
                </div>
              </div>

              {/* Gated posts */}
              {gatedPosts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500">
                    Gated posts ({gatedPosts.length})
                  </div>
                  {gatedPosts.map((pid) => (
                    <div
                      key={pid}
                      className="flex items-center justify-between rounded-xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 px-3 py-2"
                    >
                      <span className="font-mono text-[10px] text-[#5c5446] dark:text-zinc-300 truncate mr-2">{pid}</span>
                      <button
                        onClick={() => toggleGate(pid, false)}
                        disabled={busy !== null}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#cfcac0] dark:border-zinc-700 text-[#3a342a] dark:text-zinc-200 text-[9px] font-mono uppercase font-bold hover:bg-[#ebdcca]/40 disabled:opacity-50 transition-all shrink-0"
                      >
                        <Unlock size={10} /> Unlock
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Patrons */}
              {patrons.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Users className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No patrons yet.</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    When someone subscribes, they appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500">
                    Active patrons ({patrons.length})
                  </div>
                  {patrons.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {avatarBlock(p.subscriber.name, p.subscriber.avatarUrl, 'w-8 h-8')}
                        <div className="min-w-0">
                          <div className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">
                            {p.subscriber.name}
                          </div>
                          <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                            @{p.subscriber.username || 'patron'} · since {fmtDate(p.startDate)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-bold text-[#3a342a] dark:text-zinc-100">{p.amount} coins</div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                          next {fmtDate(p.nextBillingAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
