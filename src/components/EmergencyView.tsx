import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Siren, Plus, X, MapPin, Users, Wallet, Gavel, CheckCircle2, AlertTriangle,
  ShieldAlert, Clock, HeartHandshake,
} from 'lucide-react';

/**
 * Ocean — Emergency Community Pools
 * ---------------------------------
 * Ported from base44-social-media's Emergency page (EmergencyPoolCard /
 * CreatePoolDialog / PoolFundingPanel). Backed by /api/emergency/pools*.
 * Lifecycle: active -> funding -> voting -> disbursed / resolved / expired.
 */

type Urgency = 'low' | 'medium' | 'high' | 'critical';
type PoolStatus = 'active' | 'funding' | 'voting' | 'disbursed' | 'expired' | 'resolved';
type Category = 'medical' | 'security' | 'fire' | 'natural_disaster' | 'stranded' | 'football' | 'blood' | 'local_help' | 'study_help' | 'event_volunteer' | 'other';

interface Pool {
  id: string;
  title: string;
  description: string;
  urgency: Urgency;
  category: Category;
  status: PoolStatus;
  locationLabel?: string;
  createdById: string;
  createdByName?: string;
  participantIds: string[];
  helperCount: number;
  targetFunding: number;
  currentFunding: number;
  voteThresholdPct: number;
  createdAt: number;
  expiresAt: number;
}

interface PoolRequest {
  id: string;
  poolId: string;
  beneficiaryId: string;
  beneficiaryName?: string;
  requestedAmount: number;
  description: string;
  evidenceLinks: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

interface PoolVote {
  id: string;
  requestId: string;
  voterId: string;
  vote: 'approve' | 'reject';
}

interface EmergencyViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
}

const URGENCY_COLOR: Record<Urgency, string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-emerald-500',
};

const CATEGORY_LABEL: Record<string, string> = {
  medical: 'Medical help', security: 'Security', fire: 'Fire / evacuation',
  natural_disaster: 'Natural disaster', stranded: 'Stranded', football: 'Team fill-in',
  blood: 'Blood needed', local_help: 'Local help', study_help: 'Study help',
  event_volunteer: 'Event volunteer', other: 'Other',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Pool card + funding panel
// ---------------------------------------------------------------------------

function EmergencyPoolCard({
  pool, me, token, onChanged, expanded, onToggleExpand, api, toast, joinPool, resolvePool,
}: {
  pool: Pool; me: { id: string; name: string } | null; token: string | null;
  onChanged: () => void; expanded: boolean; onToggleExpand: () => void;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
  joinPool: (p: Pool) => void; resolvePool: (p: Pool) => void;
}) {
  const isOwner = me?.id === pool.createdById;
  const joined = pool.participantIds.includes(me?.id || '');
  const [contributeAmt, setContributeAmt] = useState('');
  const [contributeBusy, setContributeBusy] = useState(false);
  const [requests, setRequests] = useState<PoolRequest[]>([]);
  const [votes, setVotes] = useState<PoolVote[]>([]);
  const [reqForm, setReqForm] = useState({ amount: '', description: '' });
  const [reportOpen, setReportOpen] = useState(false);

  const pct = pool.targetFunding > 0 ? Math.min(100, Math.round(((pool.currentFunding || 0) / pool.targetFunding) * 100)) : 0;

  const loadDetails = async () => {
    try {
      const data = await api(`/api/emergency/pools/${pool.id}`, 'GET');
      setRequests(data.requests || []);
      setVotes(data.votes || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { if (expanded) loadDetails(); }, [expanded, pool.id]);

  const contribute = async () => {
    const amt = Number(contributeAmt);
    if (!amt || amt <= 0) return;
    setContributeBusy(true);
    try {
      const data = await api(`/api/emergency/pools/${pool.id}/contribute`, 'POST', { amount: amt });
      setContributeAmt('');
      toast(`Contributed ${amt} unit${amt > 1 ? 's' : ''}.`);
      onChanged();
      setRequests(prev => prev);
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setContributeBusy(false); }
  };

  const submitRequest = async () => {
    if (!reqForm.amount || !reqForm.description.trim()) return toast('Amount and description required.');
    try {
      await api(`/api/emergency/pools/${pool.id}/requests`, 'POST', {
        amount: Number(reqForm.amount), description: reqForm.description.trim(),
      });
      setReqForm({ amount: '', description: '' });
      toast('Disbursement claim submitted for vote.');
      loadDetails(); onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const castVote = async (req: PoolRequest, vote: 'approve' | 'reject') => {
    try {
      await api(`/api/emergency/pools/${pool.id}/requests/${req.id}/vote`, 'POST', { vote });
      toast(vote === 'approve' ? 'Approved.' : 'Rejected.');
      loadDetails(); onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const reportPool = async () => {
    try {
      await api(`/api/emergency/pools/${pool.id}/report`, 'POST', { reason: 'fake_request' });
      toast('Report submitted. Fake pools are removed after 3 reports.');
      setReportOpen(false);
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const reqVotes = (reqId: string) => votes.filter(v => v.requestId === reqId);
  const myVoteOn = (req: PoolRequest) => votes.find(v => v.requestId === req.id && v.voterId === me?.id);

  return (
    <motion.div layout className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${URGENCY_COLOR[pool.urgency]} ${pool.urgency === 'critical' ? 'animate-pulse' : ''}`} />
        <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">{pool.title}</h3>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 capitalize text-[#5c5446] dark:text-zinc-300">{pool.status}</span>
      </div>
      {pool.description && <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">{pool.description}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
        <span className="capitalize">{CATEGORY_LABEL[pool.category] || pool.category}</span>
        {pool.locationLabel && <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {pool.locationLabel}</span>}
        <span className="flex items-center gap-1"><Users size={11} /> {pool.helperCount} helpers</span>
        <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(pool.createdAt)}</span>
      </div>

      <div className="flex gap-2 mt-3">
        {pool.status === 'active' && (
          <button
            onClick={() => joinPool(pool)}
            className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg transition-all ${
              joined ? 'bg-[#ebdcca]/50 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300' : 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
            }`}
          >
            {joined ? 'Leave pool' : 'Join & help'}
          </button>
        )}
        {isOwner && pool.status === 'active' && (
          <button onClick={() => resolvePool(pool)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-300/50 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all flex items-center gap-1">
            <CheckCircle2 size={11} /> Resolve
          </button>
        )}
        {pool.targetFunding > 0 && (
          <button onClick={onToggleExpand} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-all">
            {expanded ? 'Hide funding' : 'Funding & claims'}
          </button>
        )}
        <button onClick={() => setReportOpen(true)} className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors" title="Report fake pool">
          <ShieldAlert size={14} />
        </button>
      </div>

      {expanded && pool.targetFunding > 0 && (
        <div className="mt-3 border-t border-[#ebdcca]/60 dark:border-zinc-800 pt-3 space-y-3">
          {/* Funding progress */}
          <div>
            <div className="flex justify-between text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono mb-1">
              <span>Funded {pct}%</span>
              <span>{pool.currentFunding || 0} / {pool.targetFunding} units</span>
            </div>
            <div className="h-2 rounded-full bg-[#ebdcca]/50 dark:bg-zinc-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Contribute */}
          {(joined || isOwner) && pool.status !== 'disbursed' && pool.status !== 'resolved' && (
            <div className="flex gap-2">
              <input
                type="number" value={contributeAmt} onChange={e => setContributeAmt(e.target.value)}
                placeholder="Contribute amount" className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-amber-400"
              />
              <button onClick={contribute} disabled={contributeBusy} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white dark:bg-emerald-600 disabled:opacity-50 hover:bg-emerald-800 flex items-center gap-1">
                <Wallet size={11} /> Give
              </button>
            </div>
          )}

          {/* Request disbursement */}
          {(joined || isOwner) && (pool.currentFunding || 0) > 0 && pool.status !== 'disbursed' && pool.status !== 'resolved' && (
            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
              <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                <Gavel size={11} /> Request disbursement
              </div>
              <input
                type="number" value={reqForm.amount} onChange={e => setReqForm({ ...reqForm, amount: e.target.value })}
                placeholder="Amount" className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none"
              />
              <textarea
                value={reqForm.description} onChange={e => setReqForm({ ...reqForm, description: e.target.value })}
                placeholder="What is this for? Add proof links." rows={2}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none resize-none"
              />
              <button onClick={submitRequest} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900">Submit claim</button>
            </div>
          )}

          {/* Claim votes */}
          {requests.length > 0 && (
            <div className="space-y-2">
              {requests.map(r => {
                const rv = reqVotes(r.id);
                const approves = rv.filter(v => v.vote === 'approve').length;
                return (
                  <div key={r.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-[#3a342a] dark:text-zinc-100">{r.requestedAmount} units</span>
                      <span className="font-mono text-[9px] uppercase text-[#8a8172] capitalize">{r.status}</span>
                    </div>
                    <p className="text-[#5c5446] dark:text-zinc-300">{r.description}</p>
                    <div className="text-[10px] font-mono text-[#8a8172]">{approves}/{rv.length} approve · threshold {pool.voteThresholdPct || 66}%</div>
                    {(joined || isOwner) && !myVoteOn(r) && r.status === 'pending' && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => castVote(r, 'approve')} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">Approve</button>
                        <button onClick={() => castVote(r, 'reject')} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-200">Reject</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {reportOpen && (
        <div className="mt-3 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-950/30 p-3 space-y-2">
          <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-red-700 dark:text-red-300 flex items-center gap-1">
            <AlertTriangle size={11} /> Report this pool
          </p>
          <p className="text-[10px] text-[#5c5446] dark:text-zinc-300">Fake, spammy or commercial pools are removed after 3 reports.</p>
          <div className="flex gap-2">
            <button onClick={reportPool} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700">Report</button>
            <button onClick={() => setReportOpen(false)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700">Cancel</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
export default function EmergencyView({ token, currentUser }: EmergencyViewProps) {
  const [pools, setPools] = useState<Pool[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [filter, setFilter] = useState<'active' | 'resolved' | 'mine'>('active');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    title: '', description: '', urgency: 'medium' as Urgency, category: 'other' as Category,
    locationLabel: '', targetFunding: 0, voteThresholdPct: 66,
  });
  const [saving, setSaving] = useState(false);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const load = useCallback(async (status = filter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/emergency/pools?status=${status}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPools(data.pools || []);
        if (data.categories?.length) setCategories(data.categories);
      }
    } catch (e) {
      console.error('Failed to load emergency pools:', e);
    }
    setLoading(false);
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const api = async (path: string, method = 'POST', body?: any) => {
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

  const createPool = async () => {
    if (form.title.trim().length < 5) return toast('Title must be at least 5 characters.');
    setSaving(true);
    try {
      await api('/api/emergency/pools', 'POST', {
        ...form,
        targetFunding: Number(form.targetFunding) || 0,
        voteThresholdPct: Number(form.voteThresholdPct) || 66,
      });
      toast('Emergency pool created.');
      setCreateOpen(false);
      setForm({ title: '', description: '', urgency: 'medium', category: 'other', locationLabel: '', targetFunding: 0, voteThresholdPct: 66 });
      load();
    } catch (e: any) {
      toast(e.message || 'Failed to create pool.', 'destructive');
    } finally { setSaving(false); }
  };

  const joinPool = async (pool: Pool) => {
    try {
      const isMember = pool.participantIds.includes(currentUser?.id || '');
      const data = await api(`/api/emergency/pools/${pool.id}/join`, 'POST', { join: !isMember });
      setPools(prev => prev.map(p => p.id === pool.id ? data.pool : p));
      toast(isMember ? 'Left the pool.' : 'Joined & helping!');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const resolvePool = async (pool: Pool) => {
    try {
      const data = await api(`/api/emergency/pools/${pool.id}/resolve`, 'POST');
      setPools(prev => prev.map(p => p.id === pool.id ? data.pool : p));
      toast('Pool marked resolved.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-red-600/10 flex items-center justify-center">
              <Siren className="text-red-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Emergency Pools</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Community-funded assistance</p>
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="font-mono text-[9px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 py-2 px-3 rounded-xl border border-amber-200/50 dark:border-zinc-700 hover:bg-amber-50/50 dark:hover:bg-zinc-800 transition-all flex items-center gap-1"
          >
            <Plus size={12} /> New Pool
          </button>
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Crowdfunded community help: create a pool, neighbors <b>Join &amp; help</b>, contribute funds,
          then approve disbursement claims by vote. Location is a fuzzy area — never your exact position.
        </p>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {([['active', 'Active'], ['resolved', 'Resolved'], ['mine', 'Mine']] as const).map(([k, label]) => (
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

        {/* Pool list */}
        {loading ? (
          <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading pools…</div>
        ) : pools.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
            <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No emergency pools here yet.</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Create one to start a community effort</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pools.map(pool => (
              <motion.div key={pool.id} layout>
                <EmergencyPoolCard
                  pool={pool}
                  me={currentUser}
                  token={token}
                  onChanged={() => load()}
                  expanded={expandedPool === pool.id}
                  onToggleExpand={() => setExpandedPool(expandedPool === pool.id ? null : pool.id)}
                  api={api}
                  toast={toast}
                  joinPool={joinPool}
                  resolvePool={resolvePool}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create pool dialog */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setCreateOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Siren className="text-red-600" size={16} /> Create Emergency Pool
                </h3>
                <button onClick={() => setCreateOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>

              <input
                value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="What's the emergency?"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
              />
              <textarea
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What's happening? What help is needed?"
                rows={3}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value as Urgency })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm capitalize"
                >
                  {['low', 'medium', 'high', 'critical'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <select
                  value={form.category} onChange={e => setForm({ ...form, category: e.target.value as Category })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                >
                  {categories.length > 0
                    ? categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)
                    : Object.entries(CATEGORY_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
              <input
                value={form.locationLabel} onChange={e => setForm({ ...form, locationLabel: e.target.value })}
                placeholder="Approximate area (e.g. North Beach)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" value={form.targetFunding || ''}
                  onChange={e => setForm({ ...form, targetFunding: Number(e.target.value) })}
                  placeholder="Target funding (optional)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
                <input
                  type="number" value={form.voteThresholdPct || 66}
                  onChange={e => setForm({ ...form, voteThresholdPct: Number(e.target.value) })}
                  placeholder="Vote threshold %"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
              </div>

              <button
                onClick={createPool} disabled={saving}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                {saving ? 'Creating…' : 'Create pool'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

