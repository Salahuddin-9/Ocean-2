import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Database, ShieldCheck, Download, Trash2, Clock, AlertTriangle,
  CheckCircle2, Copy, RotateCcw, FileJson, KeyRound, EyeOff, Activity,
} from 'lucide-react';

/**
 * Ocean — Data Sovereignty & Account Portability (FEATURE 134 / Batch B5)
 * ------------------------------------------------------------------------
 * Full ownership of your data. Backed by /api/sovereignty/* (registered in
 * src/turtleDataSovereigntyBackend.ts).
 *
 *   - My Data tab: a live inventory of everything Ocean stores about you, and
 *     a one-click "Download my data" button that fetches a sanitized portable
 *     JSON bundle (passwords / DEK wrappers / OTP secrets / tokens redacted,
 *     IPs masked, oversized base64 omitted) and saves it as a file.
 *   - Export history tab: a log of every export you generated.
 *   - Delete account tab: the right-to-be-forgotten flow. Request deletion →
 *     receive a one-time confirmation token (kept client-side; only its SHA-256
 *     hash is ever stored) → after a 48h cool-down, confirm with that token to
 *     erase your account. You can cancel any time before confirming.
 *
 * Every mutating call goes through the canonical api() helper (relative fetch,
 * Authorization: Bearer token — same pattern as EmergencyView.tsx).
 */

interface Inventory {
  posts: number;
  comments: number;
  reactions: number;
  conversations: number;
  messagesSent: number;
  messagesInConversations: number;
  following: number;
  friends: number;
  followers: number;
  savedPosts: number;
  notifications: number;
  sessions: number;
  exports: number;
}

interface DeletionState {
  status: string;
  requestedAt: number;
  confirmAfter: number;
  expiresAt: number;
  deletedAt?: number | null;
}

interface ExportItem {
  id: string;
  requestedAt: number;
  status: string;
}

interface DataSovereigntyViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

type Tab = 'data' | 'exports' | 'delete';

const INVENTORY_ROWS: { key: keyof Inventory; label: string }[] = [
  { key: 'posts', label: 'Posts' },
  { key: 'comments', label: 'Comments' },
  { key: 'reactions', label: 'Reactions' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'messagesSent', label: 'Messages sent' },
  { key: 'savedPosts', label: 'Saved posts' },
  { key: 'following', label: 'Following' },
  { key: 'friends', label: 'Friends' },
  { key: 'followers', label: 'Followers' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'sessions', label: 'Active sessions' },
  { key: 'exports', label: 'Exports' },
];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function SectionCard({
  title, icon, children, key,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  key?: string | number;
}) {
  return (
    <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#3a342a] text-[#f4f1ea]">
          {icon}
        </span>
        <h3 className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 uppercase font-mono tracking-wider">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

export default function DataSovereigntyView({ token, currentUser, onClose }: DataSovereigntyViewProps) {
  const [tab, setTab] = useState<Tab>('data');
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [deletion, setDeletion] = useState<DeletionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState<'request' | 'confirm' | 'cancel' | null>(null);
  const [confirmToken, setConfirmToken] = useState('');
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toast = useCallback((msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  }, []);

  const api = useCallback(
    async (path: string, method = 'GET', body?: any) => {
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

  const refreshAll = useCallback(async () => {
    try {
      const [invRes, expRes, delRes] = await Promise.all([
        api('/api/sovereignty/inventory', 'GET'),
        api('/api/sovereignty/exports', 'GET'),
        api('/api/sovereignty/delete/status', 'GET'),
      ]);
      setInventory(invRes.inventory || null);
      setExports(expRes.exports || []);
      setDeletion(delRes.request || null);
    } catch (e: any) {
      toast(e.message || 'Failed to load sovereignty data.', 'destructive');
    }
  }, [api, toast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await refreshAll();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshAll]);

  const downloadMyData = async () => {
    setExporting(true);
    try {
      const data = await api('/api/sovereignty/export', 'GET');
      const bundle = data.export || data;
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocean-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Your data export was downloaded.');
      setExports((prev) => [
        { id: `local-${Date.now()}`, requestedAt: Date.now(), status: 'generated' },
        ...prev,
      ]);
      const invRes = await api('/api/sovereignty/inventory', 'GET').catch(() => null);
      if (invRes && invRes.inventory) setInventory(invRes.inventory);
    } catch (e: any) {
      toast(e.message || 'Export failed.', 'destructive');
    }
    setExporting(false);
  };

  const requestDeletion = async () => {
    setBusy('request');
    try {
      const data = await api('/api/sovereignty/delete/request', 'POST', {});
      setLastToken(data.token || null);
      setDeletion({
        status: 'pending',
        requestedAt: data.requestedAt,
        confirmAfter: data.confirmAfter,
        expiresAt: data.expiresAt,
      });
      toast('Deletion requested. Copy your confirmation token now.');
    } catch (e: any) {
      toast(e.message || 'Failed to request deletion.', 'destructive');
      await refreshAll();
    }
    setBusy(null);
  };

  const cancelDeletion = async () => {
    if (!confirmToken.trim()) return toast('Enter your confirmation token to cancel.');
    setBusy('cancel');
    try {
      await api('/api/sovereignty/delete/cancel', 'POST', { token: confirmToken.trim() });
      toast('Deletion request cancelled. Your account is safe.');
      setConfirmToken('');
      setDeletion(null);
    } catch (e: any) {
      toast(e.message || 'Failed to cancel.', 'destructive');
    }
    setBusy(null);
  };

  const confirmDeletion = async () => {
    if (!confirmToken.trim()) return toast('Enter your confirmation token to continue.');
    if (!window.confirm('This permanently erases your account, posts, comments and reactions. Chat history you sent will be anonymized. Continue?')) return;
    setBusy('confirm');
    try {
      await api('/api/sovereignty/delete/confirm', 'POST', { token: confirmToken.trim() });
      toast('Your account was erased. Please log out.');
      setDeletion(null);
      setConfirmToken('');
      if (localStorage.getItem('secure_auth_token')) localStorage.removeItem('secure_auth_token');
    } catch (e: any) {
      toast(e.message || 'Failed to confirm deletion.', 'destructive');
      await refreshAll();
    }
    setBusy(null);
  };

  const copyToken = async () => {
    if (!lastToken) return;
    try {
      await navigator.clipboard.writeText(lastToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast('Confirmation token copied.');
    } catch (e) {
      toast('Could not copy — save the token manually.');
    }
  };

  const cooldownRemaining = deletion && deletion.status === 'pending'
    ? Math.max(0, deletion.confirmAfter - Date.now())
    : 0;
  const canConfirm = deletion && deletion.status === 'pending' && cooldownRemaining <= 0;

  const chip: { label: string; value: number; icon: React.ReactNode }[] = inventory
    ? INVENTORY_ROWS.map((r) => ({
        label: r.label,
        value: inventory[r.key] ?? 0,
        icon: <Database size={13} />,
      }))
    : [];

  return (
    <AnimatePresence>
      <motion.div
        key="data-sovereignty"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
      >
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#3a342a] text-[#f4f1ea]">
                <ShieldCheck size={20} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-[#3a342a] dark:text-zinc-100">
                  Data Sovereignty
                </h2>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Feature 134 · your data, your rules
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
            >
              <X size={12} /> Close
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {([
              ['data', 'My Data'],
              ['exports', 'Export history'],
              ['delete', 'Delete account'],
            ] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
                  tab === k
                    ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                    : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-10 text-center">
              <Clock size={20} className="mx-auto mb-3 text-[#8a8172]" />
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">
                Loading your data sovereignty panel…
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* ---------- MY DATA TAB ---------- */}
              {tab === 'data' && (
                <>
                  <SectionCard
                    title="What Ocean stores about you"
                    icon={<Database size={13} />}
                  >
                    {inventory ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {chip.map((c) => (
                          <div
                            key={c.label}
                            className="flex items-center justify-between rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2.5 bg-white/60 dark:bg-zinc-800/60"
                          >
                            <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                              {c.label}
                            </span>
                            <span className="text-lg font-bold text-[#3a342a] dark:text-zinc-100">
                              {c.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#8a8172]">No inventory data.</p>
                    )}
                    <div className="mt-4 flex items-center gap-1.5 text-[10px] text-[#8a8172] font-mono">
                      <EyeOff size={10} />
                      Counts only — nothing sensitive is fetched to render this view.
                    </div>
                    {currentUser && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#8a8172] font-mono">
                        <ShieldCheck size={10} />
                        Signed in as {currentUser.name || currentUser.id}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard
                    title="Download my data"
                    icon={<FileJson size={13} />}
                  >
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-4">
                      Get a portable JSON bundle of your profile, posts, comments, reactions,
                      conversations, messages, saved posts and notifications. Sensitive material
                      is redacted before it leaves the server.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={downloadMyData}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                      >
                        <Download size={11} />
                        {exporting ? 'Building export…' : 'Download my data'}
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[#8a8172] font-mono">
                      <KeyRound size={10} />
                      Passwords, DEK wrappers, OTP secrets, recovery phrases and session tokens
                      are redacted. IPs are masked. Oversized base64 media is omitted.
                    </div>
                  </SectionCard>
                </>
              )}

              {/* ---------- EXPORT HISTORY TAB ---------- */}
              {tab === 'exports' && (
                <SectionCard title="Export history" icon={<Activity size={13} />}>
                  {exports.length === 0 ? (
                    <p className="text-sm text-[#8a8172]">You have not generated any exports yet.</p>
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {exports.map((ex) => (
                        <li
                          key={ex.id}
                          className="flex items-center justify-between rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2.5 bg-white/60 dark:bg-zinc-800/60"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[#3a342a] dark:text-zinc-100">
                              {fmtDate(ex.requestedAt)}
                            </p>
                            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                              Export #{String(ex.id).slice(-6)}
                            </p>
                          </div>
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-mono text-[8px] uppercase tracking-wider font-bold">
                            {ex.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              )}

              {/* ---------- DELETE ACCOUNT TAB ---------- */}
              {tab === 'delete' && (
                <>
                  {!deletion ? (
                    <SectionCard
                      title="Right to be forgotten"
                      icon={<Trash2 size={13} />}
                    >
                      <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                        Request permanent erasure of your account. You will receive a one-time
                        confirmation token (only its SHA-256 hash is stored). After a{' '}
                        <b>48-hour cool-down</b> you can confirm with that token to erase your
                        account, posts, comments and reactions; chat messages you sent are
                        anonymized so other people keep a readable history. You can cancel any
                        time before confirming.
                      </p>
                      <button
                        onClick={requestDeletion}
                        disabled={busy !== null}
                        className="mt-4 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-800 disabled:opacity-50"
                      >
                        <AlertTriangle size={11} />
                        {busy === 'request' ? 'Requesting…' : 'Request account deletion'}
                      </button>
                    </SectionCard>
                  ) : (
                    <SectionCard
                      title={`Deletion request — ${deletion.status}`}
                      icon={<Trash2 size={13} />}
                    >
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono uppercase tracking-wider text-[#8a8172]">
                          <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2">
                            Requested
                            <p className="text-[#3a342a] dark:text-zinc-100 normal-case text-xs mt-0.5">
                              {timeAgo(deletion.requestedAt)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2">
                            Cool-down
                            <p className="text-[#3a342a] dark:text-zinc-100 normal-case text-xs mt-0.5">
                              {cooldownRemaining > 0 ? fmtRemaining(cooldownRemaining) : 'elapsed'}
                            </p>
                          </div>
                          <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2">
                            Expires
                            <p className="text-[#3a342a] dark:text-zinc-100 normal-case text-xs mt-0.5">
                              {timeAgo(deletion.expiresAt)}
                            </p>
                          </div>
                        </div>

                        {lastToken && (
                          <div className="rounded-xl border border-amber-300/60 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-2">
                            <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1">
                              <KeyRound size={11} /> Your one-time confirmation token
                            </p>
                            <p className="text-[10px] text-[#5c5446] dark:text-zinc-300">
                              Save it now — it is shown only once and only its hash is stored.
                            </p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-3 py-2 text-xs font-mono text-[#3a342a] dark:text-zinc-100 break-all">
                                {lastToken}
                              </code>
                              <button
                                onClick={copyToken}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                              >
                                <Copy size={11} />
                                {copied ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-1.5">
                            Enter your token
                          </p>
                          <input
                            value={confirmToken}
                            onChange={(e) => setConfirmToken(e.target.value)}
                            placeholder="Confirmation token"
                            className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={cancelDeletion}
                            disabled={busy !== null}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                          >
                            <RotateCcw size={11} />
                            {busy === 'cancel' ? 'Cancelling…' : 'Cancel deletion'}
                          </button>
                          <button
                            onClick={confirmDeletion}
                            disabled={busy !== null || !canConfirm}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-800 disabled:opacity-50"
                          >
                            <CheckCircle2 size={11} />
                            {busy === 'confirm'
                              ? 'Erasing…'
                              : canConfirm
                                ? 'Erase my account'
                                : `Confirm after cool-down (${fmtRemaining(cooldownRemaining)})`}
                          </button>
                        </div>
                      </div>
                    </SectionCard>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
