import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BadgeDollarSign, Coins, Users, Plus, X, Send, Wallet, Clock,
  History as HistoryIcon, Percent, ChevronDown, ChevronUp, Pencil,
} from 'lucide-react';

/**
 * Ocean — Community Revenue Share
 * --------------------------------
 * Ad-revenue split to group admins. Enable monetization for a group, deposit
 * simulated ad revenue, and distribute the pool to admins' coin wallets
 * (community.json balances). Backed by /api/revenue/groups*.
 */

interface HistoryEntry {
  at: number;
  amount: number;
  perAdmin: { userId: string; amount: number }[];
}

interface RevenueGroup {
  id: string;
  groupName: string;
  adRevenuePool: number;
  sharePercent: number;
  admins: string[];
  lastDistributedAt: number;
  history: HistoryEntry[];
}

interface RevenueShareProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtTime(ts: number): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

/** Pending per-admin share: round(pool * sharePercent/100 * (1/adminCount)). */
function estimatePerAdmin(g: RevenueGroup): { userId: string; amount: number }[] {
  const pool = g.adRevenuePool || 0;
  const share = Math.min(100, Math.max(0, Number(g.sharePercent) || 0));
  const admins = (g.admins || []).filter(Boolean);
  if (pool <= 0 || admins.length === 0 || share <= 0) return admins.map(userId => ({ userId, amount: 0 }));
  const weight = 1 / admins.length;
  return admins.map(userId => ({ userId, amount: Math.round(pool * (share / 100) * weight) }));
}

function estimateTotal(g: RevenueGroup): number {
  return estimatePerAdmin(g).reduce((sum, a) => sum + a.amount, 0);
}

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

function RevenueGroupCard({
  group, api, toast, onChanged, me,
}: {
  group: RevenueGroup;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
  onChanged: () => void;
  me: { id: string; name: string } | null;
}) {
  const [deposit, setDeposit] = useState('');
  const [busy, setBusy] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showAdminEdit, setShowAdminEdit] = useState(false);
  const [adminDraft, setAdminDraft] = useState(group.admins.join(', '));

  const pending = estimatePerAdmin(group);
  const pendingTotal = estimateTotal(group);

  const depositTo = async () => {
    const amt = Number(deposit);
    if (!amt || amt <= 0) return toast('Enter a positive deposit amount.');
    setBusy('deposit');
    try {
      const data = await api(`/api/revenue/groups/${group.id}/deposit`, 'POST', { amount: amt });
      setDeposit('');
      toast(`Deposited ${amt} ad-revenue units. Pool is now ${data.pool ?? group.adRevenuePool}.`);
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(''); }
  };

  const distribute = async () => {
    setBusy('distribute');
    try {
      const data = await api(`/api/revenue/groups/${group.id}/distribute`, 'POST');
      if (data.distributed > 0) toast(`Distributed ${data.distributed} coins to ${data.perAdmin?.length || 0} admins.`);
      else toast('Nothing to distribute yet — the pool is empty.');
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(''); }
  };

  const saveAdmins = async () => {
    const admins = adminDraft.split(',').map(s => s.trim()).filter(Boolean);
    if (!admins.length) return toast('At least one admin is required.');
    setBusy('admins');
    try {
      await api(`/api/revenue/groups/${group.id}/admins`, 'POST', { admins });
      toast('Admin list updated.');
      setShowAdminEdit(false);
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(''); }
  };

  return (
    <motion.div layout className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-emerald-600/10 flex items-center justify-center">
          <Coins className="text-emerald-600" size={14} />
        </span>
        <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{group.groupName || group.id}</h3>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
          <Percent size={9} /> {group.sharePercent}% share
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Pool</div>
          <div className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">{group.adRevenuePool || 0}</div>
        </div>
        <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Admins</div>
          <div className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">{group.admins?.length || 0}</div>
        </div>
        <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Pending</div>
          <div className="font-display font-bold text-sm text-emerald-700 dark:text-emerald-400">{pendingTotal}</div>
        </div>
      </div>

      {/* Pending split preview */}
      {pending.length > 0 && pendingTotal > 0 && (
        <div className="mt-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50 p-2 space-y-1">
          <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
            <Wallet size={10} /> Next split (per admin)
          </div>
          {pending.map(a => (
            <div key={a.userId} className="flex justify-between text-[10px] text-[#5c5446] dark:text-zinc-300 font-mono">
              <span className="truncate mr-2">{a.userId}</span>
              <span className="text-emerald-700 dark:text-emerald-300">{a.amount} coins</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <div className="flex flex-1 min-w-0 gap-2">
          <input
            type="number" value={deposit} onChange={e => setDeposit(e.target.value)}
            placeholder="Deposit ad revenue" min={1}
            className="flex-1 min-w-0 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-emerald-400"
          />
          <button
            onClick={depositTo} disabled={busy === 'deposit'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
          >
            <Wallet size={12} /> {busy === 'deposit' ? '…' : 'Deposit'}
          </button>
        </div>
        <button
          onClick={distribute} disabled={busy === 'distribute'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800 disabled:opacity-50"
        >
          <Send size={12} /> {busy === 'distribute' ? '…' : 'Distribute now'}
        </button>
      </div>

      {/* Admins */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
            <Users size={10} /> Admins
          </span>
          <button
            onClick={() => { setShowAdminEdit(!showAdminEdit); setAdminDraft(group.admins.join(', ')); }}
            className="text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100"
            title="Edit admins"
          >
            <Pencil size={11} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {group.admins?.map(a => (
            <span key={a} className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300">{a}</span>
          ))}
        </div>
        {showAdminEdit && (
          <div className="space-y-1.5">
            <input
              value={adminDraft} onChange={e => setAdminDraft(e.target.value)}
              placeholder="Comma-separated user ids"
              className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-400"
            />
            <button
              onClick={saveAdmins} disabled={busy === 'admins'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
            >
              {busy === 'admins' ? 'Saving…' : 'Save admins'}
            </button>
          </div>
        )}
      </div>

      {/* History */}
      <div className="mt-3 border-t border-[#ebdcca]/60 dark:border-zinc-800 pt-2">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between text-[10px] font-mono uppercase font-bold tracking-wider text-[#8a8172] hover:text-[#5c5446] dark:hover:text-zinc-300"
        >
          <span className="flex items-center gap-1"><HistoryIcon size={11} /> Distribution history</span>
          <span className="flex items-center gap-1">{showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <Clock size={11} /> last {timeAgo(group.lastDistributedAt)}</span>
        </button>
        {showHistory && (
          <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
            {(!group.history || group.history.length === 0) ? (
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No distributions yet. Deposits + the 24h auto-split (or “Distribute now”) fill this.</p>
            ) : (
              [...group.history].reverse().map((h, i) => (
                <div key={i} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2 space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-[#5c5446] dark:text-zinc-300">
                    <span>{fmtTime(h.at)}</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">{h.amount} coins</span>
                  </div>
                  {h.perAdmin.map(a => (
                    <div key={a.userId} className="flex justify-between text-[9px] font-mono text-[#8a8172] dark:text-zinc-400">
                      <span className="truncate mr-2">{a.userId}</span>
                      <span>{a.amount}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function RevenueShare({ token, currentUser, onClose }: RevenueShareProps) {
  const [groups, setGroups] = useState<RevenueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [enableOpen, setEnableOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ groupId: '', groupName: '', sharePercent: '50' });

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = async (path: string, method = 'GET', body?: any) => {
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/revenue/groups', 'GET');
      setGroups(data.groups || []);
    } catch (e) {
      console.error('Failed to load revenue groups:', e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const enableMonetization = async () => {
    if (!form.groupId.trim()) return toast('Group id is required.');
    const share = Number(form.sharePercent);
    if (!Number.isFinite(share) || share < 0 || share > 100) return toast('Share percent must be between 0 and 100.');
    setSaving(true);
    try {
      await api('/api/revenue/groups', 'POST', {
        groupId: form.groupId.trim(),
        groupName: form.groupName.trim(),
        sharePercent: Math.round(share),
      });
      toast('Monetization enabled for this group.');
      setEnableOpen(false);
      setForm({ groupId: '', groupName: '', sharePercent: '50' });
      load();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-emerald-600/10 flex items-center justify-center">
              <BadgeDollarSign className="text-emerald-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Revenue Share</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Ad revenue split to group admins</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEnableOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
            >
              <Plus size={12} /> Enable
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Monetize a group you admin: deposit simulated ad revenue into its pool, then split it.
          Each admin is credited <b>round(pool × share% × 1/n)</b> coins into their wallet,
          automatically every 24h — or instantly with <b>Distribute now</b>.
        </p>

        {/* Group list */}
        {loading ? (
          <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading revenue groups…</div>
        ) : groups.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <Coins className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
            <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No monetized groups yet.</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Enable monetization on a group you admin to start</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => (
              <motion.div key={group.id} layout>
                <RevenueGroupCard
                  group={group}
                  api={api}
                  toast={toast}
                  me={currentUser}
                  onChanged={() => load()}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Enable monetization dialog */}
      <AnimatePresence>
        {enableOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setEnableOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <BadgeDollarSign className="text-emerald-600" size={16} /> Enable Monetization
                </h3>
                <button onClick={() => setEnableOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>

              <input
                value={form.groupId} onChange={e => setForm({ ...form, groupId: e.target.value })}
                placeholder="Group id (e.g. group-travel-42)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-emerald-400"
              />
              <input
                value={form.groupName} onChange={e => setForm({ ...form, groupName: e.target.value })}
                placeholder="Group name (optional)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-emerald-400"
              />
              <input
                type="number" value={form.sharePercent} onChange={e => setForm({ ...form, sharePercent: e.target.value })}
                placeholder="Share percent (0-100)"
                min={0} max={100}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-emerald-400"
              />

              <button
                onClick={enableMonetization} disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
              >
                {saving ? 'Enabling…' : 'Enable monetization'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
