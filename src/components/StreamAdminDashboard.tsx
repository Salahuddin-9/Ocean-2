import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  KeyRound, Plus, X, Trash2, Power, Eye, EyeOff, Gauge, RefreshCw,
  ShieldCheck, Activity, Server, Lock, AlertTriangle, Key,
} from 'lucide-react';

/**
 * Ocean — Stream API Admin Dashboard
 * ----------------------------------
 * manus admin CRUD + usage for the Stream video-call keys.
 * Access is admin-only (checked client-side via currentUser.isAdmin; the
 * server also enforces requireAdmin). Runtime keys are stored in
 * database.json and managed here; env keys (STREAM_API_KEY/_2/_3) are
 * read-only and toggling is disabled for them.
 *
 * Endpoints:
 *   GET    /api/admin/stream-keys            -> { keys: [...] }
 *   POST   /api/admin/stream-keys            (add runtime key)
 *   POST   /api/admin/stream-keys/:index/toggle
 *   DELETE /api/admin/stream-keys/:index     (runtime only)
 *   GET    /api/admin/stream-usage           -> { usage: [...] }
 */

type KeyStatus = 'active' | 'inactive';
type KeySource = 'env' | 'runtime';

interface StreamKey {
  id: number;
  label: string;
  apiKeyPreview: string;
  maxConcurrentCalls: number;
  lifetimeMinutes: number;
  minutesUsed: number;
  minutesRemaining: number;
  currentConcurrentCalls: number;
  status: KeyStatus;
  source: KeySource;
}

interface StreamUsage {
  label: string;
  source: KeySource;
  minutesUsed: number;
  minutesRemaining: number;
  currentConcurrentCalls: number;
  status: KeyStatus;
  canUse: boolean;
}

interface StreamAdminDashboardProps {
  token: string | null;
  currentUser: { id: string; name: string; isAdmin?: boolean } | null;
}

type Tab = 'keys' | 'usage';

function fmtMinutes(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return '0m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1).replace(/\.0$/, '')}h`;
  return `${(h / 24).toFixed(1).replace(/\.0$/, '')}d`;
}

function badgeClass(source: KeySource): string {
  return source === 'env'
    ? 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-400'
    : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400';
}

export default function StreamAdminDashboard({ token, currentUser }: StreamAdminDashboardProps) {
  const [tab, setTab] = useState<Tab>('keys');
  const [keys, setKeys] = useState<StreamKey[]>([]);
  const [usage, setUsage] = useState<StreamUsage[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [adminError, setAdminError] = useState('');
  const [form, setForm] = useState({
    label: '', apiKey: '', apiSecret: '', maxConcurrentCalls: '', lifetimeMinutes: '',
  });

  const toast = (message: string, variant?: 'destructive') => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  const authHeaders = useCallback((): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...(adminKey ? { 'x-admin-key': adminKey } : {}),
  }), [token, adminKey]);

  const api = useCallback(async (path: string, method = 'GET', body?: unknown): Promise<any> => {
    const res = await fetch(path, {
      method,
      headers: authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  }, [authHeaders]);

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const data = await api('/api/admin/stream-keys', 'GET');
      setKeys((data.keys || []).map((k: any) => ({
        ...k,
        minutesUsed: Number(k.minutesUsed) || 0,
        minutesRemaining: (Number(k.minutesRemaining) ?? Number(k.lifetimeMinutes)) || 0,
        currentConcurrentCalls: Number(k.currentConcurrentCalls) || 0,
        maxConcurrentCalls: Number(k.maxConcurrentCalls) || 0,
        lifetimeMinutes: Number(k.lifetimeMinutes) || 0,
        status: k.status === 'inactive' ? 'inactive' : 'active',
        source: k.source === 'env' ? 'env' : 'runtime',
      })));
    } catch (e: any) {
      toast(e.message || 'Failed to load stream keys.', 'destructive');
    }
    setLoadingKeys(false);
  }, [api, toast]);

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    try {
      const data = await api('/api/admin/stream-usage', 'GET');
      setUsage(data.usage || []);
    } catch (e: any) {
      toast(e.message || 'Failed to load usage.', 'destructive');
    }
    setLoadingUsage(false);
  }, [api, toast]);

  useEffect(() => { loadKeys(); }, [loadKeys]);
  useEffect(() => { loadUsage(); }, [loadUsage]);

  const toggleKey = async (key: StreamKey) => {
    try {
      await api(`/api/admin/stream-keys/${key.id}/toggle`, 'POST');
      toast(`${key.label} ${key.status === 'active' ? 'paused' : 'activated'}.`);
      loadKeys(); loadUsage();
    } catch (e: any) {
      toast(e.message || 'Failed to toggle key.', 'destructive');
    }
  };

  const deleteKey = async (key: StreamKey) => {
    if (!window.confirm(`Delete "${key.label}"? This removes the key from the runtime registry.`)) return;
    try {
      await api(`/api/admin/stream-keys/${key.id}`, 'DELETE');
      toast(`${key.label} deleted.`);
      loadKeys(); loadUsage();
    } catch (e: any) {
      toast(e.message || 'Failed to delete key.', 'destructive');
    }
  };

  const addKey = async () => {
    if (!form.apiKey.trim() || !form.apiSecret.trim()) {
      return toast('API key and secret are required.', 'destructive');
    }
    setSaving(true);
    try {
      await api('/api/admin/stream-keys', 'POST', {
        label: form.label.trim() || 'custom-key',
        apiKey: form.apiKey.trim(),
        apiSecret: form.apiSecret.trim(),
        maxConcurrentCalls: Number(form.maxConcurrentCalls) || 8,
        lifetimeMinutes: Number(form.lifetimeMinutes) || 60 * 24 * 30,
      });
      toast('Stream key added.');
      setAddOpen(false);
      setForm({ label: '', apiKey: '', apiSecret: '', maxConcurrentCalls: '', lifetimeMinutes: '' });
      setRevealSecret(false);
      loadKeys(); loadUsage();
    } catch (e: any) {
      toast(e.message || 'Failed to add key.', 'destructive');
    } finally {
      setSaving(false);
    }
  };

  // --- Admin access gate (master-key or isAdmin flag) ---
  if (!currentUser?.isAdmin && !adminKey) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
              <Lock className="text-amber-800 dark:text-amber-400" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Stream Admin</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Administrator console</p>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50/60 dark:bg-zinc-800/60 border border-amber-200/60 dark:border-zinc-700 p-3">
            <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={15} />
            <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
              Admin access required. Enter the platform admin key (MASTER_KEY) to view and manage
              the Stream API keys and usage budget.
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Admin key"
              className="flex-1 bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
            />
            <button
              onClick={() => { if (adminKey.trim()) { setAdminError(''); loadKeys(); loadUsage(); } }}
              className="font-mono text-[10px] uppercase font-bold tracking-wider py-2 px-4 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 transition-all"
            >
              Unlock
            </button>
          </div>
          {adminError && <p className="mt-2 text-[10px] text-red-600">{adminError}</p>}
        </div>
      </div>
    );
  }

  const tabBtn = (k: Tab, label: string) => (
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
  );

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
              <KeyRound className="text-amber-800 dark:text-amber-400" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Stream API Admin</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">manus key CRUD + usage budgets</p>
            </div>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="font-mono text-[9px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 py-2 px-3 rounded-xl border border-amber-200/50 dark:border-zinc-700 hover:bg-amber-50/50 dark:hover:bg-zinc-800 transition-all flex items-center gap-1"
          >
            <Plus size={12} /> Add Key
          </button>
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Manage the Stream video-call API pool. <b>Env</b> keys come from{' '}
          <span className="font-mono">STREAM_API_KEY/_2/_3</span> and are read-only;{' '}
          <b>runtime</b> keys are added below and stored in the app database.
        </p>

        {/* Tabs */}
        <div className="flex gap-2">
          {tabBtn('keys', 'Keys')}
          {tabBtn('usage', 'Usage')}
        </div>

        {/* Keys panel */}
        <AnimatePresence mode="wait">
          {tab === 'keys' ? (
            <motion.div
              key="keys"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                  {keys.length} key{keys.length === 1 ? '' : 's'} registered
                </span>
                <button
                  onClick={loadKeys}
                  className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-400 hover:text-amber-800 dark:hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              {loadingKeys ? (
                <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading keys…</div>
              ) : keys.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Key className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No Stream keys configured yet.</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Add a runtime key to enable video calls</p>
                </div>
              ) : (
                keys.map((key) => (
                  <div
                    key={`${key.source}-${key.id}`}
                    className="rounded-[1.5rem] border-2 border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 space-y-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${key.status === 'active' ? 'bg-emerald-500' : 'bg-[#8a8172]'}`} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 truncate">{key.label}</h3>
                        <p className="font-mono text-[10px] text-[#8a8172] dark:text-zinc-400">{key.apiKeyPreview || '—'}</p>
                      </div>
                      <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeClass(key.source)}`}>
                        {key.source}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
                      <span className="flex items-center gap-1"><Activity size={11} /> {key.currentConcurrentCalls}/{key.maxConcurrentCalls} concurrent</span>
                      <span className="flex items-center gap-1"><Gauge size={11} /> {fmtMinutes(key.minutesUsed)} used</span>
                      <span className="flex items-center gap-1"><Server size={11} /> {fmtMinutes(key.minutesRemaining)} left</span>
                      <span className={`flex items-center gap-1 capitalize ${key.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#8a8172]'}`}>
                        <Power size={11} /> {key.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => toggleKey(key)}
                        disabled={key.source === 'env'}
                        title={key.source === 'env' ? 'Env keys are managed by environment variables' : `Toggle ${key.label}`}
                        className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg transition-all flex items-center gap-1 ${
                          key.status === 'active'
                            ? 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70'
                            : 'bg-emerald-700 text-white dark:bg-emerald-600 hover:bg-emerald-800'
                        } ${key.source === 'env' ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <Power size={11} /> {key.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      {key.source === 'runtime' && (
                        <button
                          onClick={() => deleteKey(key)}
                          className="ml-auto font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all flex items-center gap-1"
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div
              key="usage"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                  {usage.length} pool{usage.length === 1 ? '' : 's'} · lifetime budgets
                </span>
                <button
                  onClick={loadUsage}
                  className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-400 hover:text-amber-800 dark:hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              {loadingUsage ? (
                <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading usage…</div>
              ) : usage.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <ShieldCheck className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No usage to report.</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Configure keys to track budgets</p>
                </div>
              ) : (
                usage.map((u) => {
                  const total = (Number(u.minutesUsed) || 0) + (Number(u.minutesRemaining) || 0);
                  const pct = total > 0 ? Math.min(100, Math.max(0, ((Number(u.minutesRemaining) || 0) / total) * 100)) : 100;
                  return (
                    <div
                      key={`${u.source}-${u.label}`}
                      className="rounded-[1.5rem] border-2 border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${u.canUse ? 'bg-emerald-500' : 'bg-[#8a8172]'}`} />
                        <span className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{u.label}</span>
                        <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeClass(u.source)}`}>
                          {u.source}
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px] font-mono text-[#8a8172] dark:text-zinc-400">
                        <span>{fmtMinutes(u.minutesRemaining)} remaining</span>
                        <span>{fmtMinutes(u.minutesUsed)} used · {u.currentConcurrentCalls} live</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#ebdcca]/50 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${u.canUse ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-[#c9bfae] dark:bg-zinc-600'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider">
                        <span className={u.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#8a8172] dark:text-zinc-400'}>
                          {u.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                        <span className={u.canUse ? 'text-amber-800 dark:text-amber-400' : 'text-[#8a8172] dark:text-zinc-400'}>
                          {u.canUse ? 'Can use' : 'Exhausted'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add-key dialog */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setAddOpen(false)}
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
                  <KeyRound className="text-amber-800 dark:text-amber-400" size={16} /> Add Stream Key
                </h3>
                <button onClick={() => setAddOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>

              <input
                value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Label (e.g. production-key)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
              />
              <input
                value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="API key"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 font-mono"
              />

              {/* Secret with reveal toggle */}
              <div className="relative">
                <input
                  type={revealSecret ? 'text' : 'password'}
                  value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                  placeholder="API secret"
                  className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setRevealSecret((r) => !r)}
                  title={revealSecret ? 'Hide secret' : 'Reveal secret'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8a8172] dark:text-zinc-400 hover:text-amber-800 dark:hover:text-amber-400 transition-colors"
                >
                  {revealSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" value={form.maxConcurrentCalls}
                  onChange={(e) => setForm({ ...form, maxConcurrentCalls: e.target.value })}
                  placeholder="Max concurrent (8)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
                <input
                  type="number" value={form.lifetimeMinutes}
                  onChange={(e) => setForm({ ...form, lifetimeMinutes: e.target.value })}
                  placeholder="Lifetime minutes (43200)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
              </div>

              <button
                onClick={addKey} disabled={saving}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 disabled:opacity-50 transition-all"
              >
                {saving ? 'Adding…' : 'Add key'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
