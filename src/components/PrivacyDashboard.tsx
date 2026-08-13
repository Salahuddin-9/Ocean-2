import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ShieldCheck, Clock, AppWindow, KeyRound, EyeOff, Activity, CheckCircle2,
  RotateCcw, Lock, UserCheck, BookOpen, Globe, AlertTriangle,
} from 'lucide-react';

/**
 * Ocean — Privacy Dashboard (FEATURE 133 / Batch B5)
 * --------------------------------------------------
 * Data-access transparency + control. Backed by /api/privacy/* (registered in
 * src/turtlePrivacyDashboardBackend.ts).
 *
 * Sections:
 *   - Summary chips: access-event count, active apps, revoked apps, masks ON.
 *   - Access log: timeline of the user's access events (ip always "masked").
 *   - Third-party apps: cards with scope badges + revoke.
 *   - Permissions: per-app / per-scope toggle matrix.
 *   - Privacy preferences: activity-masking toggles persisted on the user record.
 *
 * Every mutating call goes through the canonical api() helper (relative fetch,
 * Authorization: Bearer token — same pattern as EmergencyView.tsx).
 */

interface AccessEvent {
  id: string;
  userId: string;
  action: string;
  resource: string;
  at: number;
  ip: string;
}

interface ThirdPartyApp {
  id: string;
  name: string;
  logoEmoji: string;
  scopes: string[];
  status: 'active' | 'revoked';
  lastUsedAt: number;
}

interface MaskPrefs {
  maskOnlineStatus: boolean;
  hideReadingList: boolean;
  privateProfile: boolean;
}

interface DashboardSummary {
  accessEvents: number;
  activeApps: number;
  revokedApps: number;
  maskSettings: MaskPrefs;
}

interface PrivacyDashboardProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const DEFAULT_MASK: MaskPrefs = { maskOnlineStatus: false, hideReadingList: false, privateProfile: false };

// ---------------------------------------------------------------------------
// Small presentational helpers (local, typed)
// ---------------------------------------------------------------------------

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

function Toggle({
  on, onChange, disabled, label, key,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  key?: string | number;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      aria-label={label}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function prettyScope(scope: string): string {
  const [area, action] = scope.split(':');
  const a = area ? area.charAt(0).toUpperCase() + area.slice(1).replace(/_/g, ' ') : scope;
  const b = action ? ` · ${action.charAt(0).toUpperCase() + action.slice(1)}` : '';
  return a + b;
}

function prettyAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PrivacyDashboard({ token, currentUser, onClose }: PrivacyDashboardProps) {
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [apps, setApps] = useState<ThirdPartyApp[]>([]);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [prefs, setPrefs] = useState<MaskPrefs>(DEFAULT_MASK);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [maskSaving, setMaskSaving] = useState(false);

  const toast = useCallback((msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  }, []);

  const api = useCallback(
    async (path: string, method = 'POST', body?: any) => {
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
      const [logRes, appsRes, permsRes, sumRes] = await Promise.all([
        api('/api/privacy/access-log?limit=50', 'GET'),
        api('/api/privacy/third-party', 'GET'),
        api('/api/privacy/permissions', 'GET'),
        api('/api/privacy/summary', 'GET'),
      ]);
      setEvents(logRes.events || []);
      setApps(appsRes.apps || []);
      setPermissions(permsRes.permissions || {});
      if (sumRes.summary) {
        setSummary(sumRes.summary);
        setPrefs(sumRes.summary.maskSettings || DEFAULT_MASK);
      }
    } catch (e: any) {
      toast(e.message || 'Failed to load privacy dashboard.', 'destructive');
    }
  }, [api, toast]);

  // Boot: log a dashboard.viewed access event, then load everything.
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        await api('/api/privacy/log-access', 'POST', {
          action: 'dashboard.viewed',
          resource: 'Privacy Dashboard',
        }).catch(() => null);
      } catch (e) {
        /* non-fatal */
      }
      if (!mounted) return;
      await refreshAll();
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [api, refreshAll]);

  const revokeApp = async (appId: string, appName: string) => {
    setRevoking(appId);
    try {
      await api(`/api/privacy/third-party/${appId}/revoke`, 'POST');
      await api('/api/privacy/log-access', 'POST', {
        action: 'third_party.revoked',
        resource: appName,
      }).catch(() => null);
      toast(`${appName} access revoked.`);
      await refreshAll();
    } catch (e: any) {
      toast(e.message || 'Failed to revoke app.', 'destructive');
    }
    setRevoking(null);
  };

  const togglePermission = async (appId: string, scope: string, granted: boolean) => {
    // optimistic update
    setPermissions((prev) => {
      const next: Record<string, string[]> = { ...prev };
      const scopes = Array.isArray(next[appId]) ? [...next[appId]] : [];
      const idx = scopes.indexOf(scope);
      if (granted && idx === -1) scopes.push(scope);
      if (!granted && idx !== -1) scopes.splice(idx, 1);
      next[appId] = scopes;
      return next;
    });
    try {
      await api('/api/privacy/permissions', 'POST', { appId, scope, granted });
      await api('/api/privacy/log-access', 'POST', {
        action: 'permission.toggled',
        resource: `${appId}:${scope} ${granted ? 'granted' : 'revoked'}`,
      }).catch(() => null);
      await refreshAll();
    } catch (e: any) {
      toast(e.message || 'Failed to update permission.', 'destructive');
      await refreshAll();
    }
  };

  const saveMasks = async (next: MaskPrefs) => {
    setPrefs(next);
    setMaskSaving(true);
    try {
      await api('/api/privacy/mask-activity', 'POST', next);
      await api('/api/privacy/log-access', 'POST', {
        action: 'mask_activity.updated',
        resource: 'Privacy preferences',
      }).catch(() => null);
      await refreshAll();
      toast('Privacy preferences saved.');
    } catch (e: any) {
      toast(e.message || 'Failed to save preferences.', 'destructive');
      await refreshAll();
    }
    setMaskSaving(false);
  };

  const masksOn =
    Number(prefs.maskOnlineStatus) + Number(prefs.hideReadingList) + Number(prefs.privateProfile);

  return (
    <AnimatePresence>
      <motion.div
        key="privacy-dashboard"
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
                  Privacy Dashboard
                </h2>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Feature 133 · data access & controls
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

          {loading ? (
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-10 text-center">
              <Clock size={20} className="mx-auto mb-3 text-[#8a8172]" />
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">
                Loading privacy dashboard…
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary chips */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Access events', value: summary ? summary.accessEvents : 0, icon: <Activity size={13} /> },
                  { label: 'Active apps', value: summary ? summary.activeApps : 0, icon: <CheckCircle2 size={13} /> },
                  { label: 'Revoked apps', value: summary ? summary.revokedApps : 0, icon: <AlertTriangle size={13} /> },
                  { label: 'Masks ON', value: masksOn, icon: <EyeOff size={13} /> },
                ].map((chip, i) => (
                  <div
                    key={chip.label}
                    className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-2xl px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-2xl font-bold text-[#3a342a] dark:text-zinc-100">{chip.value}</p>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">{chip.label}</p>
                    </div>
                    <span className="text-[#8a8172]">{chip.icon}</span>
                  </div>
                ))}
              </div>

              {/* Access log */}
              <SectionCard title="Access log" icon={<Clock size={13} />}>
                {events.length === 0 ? (
                  <p className="text-sm text-[#8a8172]">No access events yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {events.map((ev) => (
                      <li
                        key={ev.id}
                        className="flex items-start gap-3 rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-2.5 bg-white/60 dark:bg-zinc-800/60"
                      >
                        <span className="mt-0.5 text-[#8a8172]">
                          <Activity size={12} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#3a342a] dark:text-zinc-100">
                            {prettyAction(ev.action)}
                          </p>
                          {ev.resource ? (
                            <p className="text-xs text-[#8a8172] truncate">{ev.resource}</p>
                          ) : null}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                            {timeAgo(ev.at)}
                          </p>
                          <p className="font-mono text-[9px] text-[#b5ac98]">ip:{ev.ip}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              {/* Third-party apps */}
              <SectionCard title="Third-party apps" icon={<AppWindow size={13} />}>
                {apps.length === 0 ? (
                  <p className="text-sm text-[#8a8172]">No third-party apps.</p>
                ) : (
                  <div className="space-y-3">
                    {apps.map((app) => {
                      const revoked = app.status === 'revoked';
                      return (
                        <div
                          key={app.id}
                          className="flex items-center gap-3 rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-3 bg-white/60 dark:bg-zinc-800/60"
                        >
                          <span className="text-2xl">{app.logoEmoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-[#3a342a] dark:text-zinc-100">{app.name}</p>
                              <span
                                className={`px-1.5 py-0.5 rounded-full font-mono text-[8px] uppercase tracking-wider font-bold ${
                                  revoked
                                    ? 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                }`}
                              >
                                {revoked ? 'Revoked' : 'Active'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(app.scopes || []).map((s) => (
                                <span
                                  key={s}
                                  className="px-1.5 py-0.5 rounded-md bg-[#ebdcca]/70 dark:bg-zinc-700 font-mono text-[8px] text-[#8a8172]"
                                >
                                  {prettyScope(s)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            disabled={revoked || revoking === app.id}
                            onClick={() => revokeApp(app.id, app.name)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                          >
                            <RotateCcw size={11} />
                            {revoking === app.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* Permissions matrix */}
              <SectionCard title="Permissions" icon={<KeyRound size={13} />}>
                <div className="space-y-4">
                  {apps.map((app) => {
                    const scopes = Array.from(
                      new Set([
                        ...(app.scopes || []),
                        ...(Array.isArray(permissions[app.id]) ? permissions[app.id] : []),
                      ])
                    );
                    if (scopes.length === 0) return null;
                    return (
                      <div key={app.id}>
                        <p className="text-xs font-bold text-[#3a342a] dark:text-zinc-100 mb-2 flex items-center gap-1.5">
                          <span>{app.logoEmoji}</span> {app.name}
                        </p>
                        <div className="space-y-1.5">
                          {scopes.map((scope) => {
                            const granted = Array.isArray(permissions[app.id])
                              ? permissions[app.id].includes(scope)
                              : false;
                            return (
                              <div
                                key={scope}
                                className="flex items-center justify-between rounded-lg border border-[#ebdcca] dark:border-zinc-700 px-3 py-2 bg-white/60 dark:bg-zinc-800/60"
                              >
                                <span className="font-mono text-[10px] text-[#3a342a] dark:text-zinc-200">
                                  {prettyScope(scope)}
                                </span>
                                <Toggle
                                  on={granted}
                                  label={`${app.name} ${scope}`}
                                  onChange={(v) => togglePermission(app.id, scope, v)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Privacy preferences */}
              <SectionCard title="Privacy preferences" icon={<EyeOff size={13} />}>
                <div className="space-y-3">
                  {[
                    {
                      key: 'maskOnlineStatus' as const,
                      label: 'Mask online status',
                      hint: 'Appear offline to friends',
                      icon: <UserCheck size={14} />,
                    },
                    {
                      key: 'hideReadingList' as const,
                      label: 'Hide reading list',
                      hint: 'Keep saved items private',
                      icon: <BookOpen size={14} />,
                    },
                    {
                      key: 'privateProfile' as const,
                      label: 'Private profile',
                      hint: 'Require approval for follows',
                      icon: <Globe size={14} />,
                    },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center gap-3 rounded-xl border border-[#ebdcca] dark:border-zinc-700 px-3 py-3 bg-white/60 dark:bg-zinc-800/60"
                    >
                      <span className="text-[#8a8172]">{row.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#3a342a] dark:text-zinc-100">{row.label}</p>
                        <p className="text-xs text-[#8a8172]">{row.hint}</p>
                      </div>
                      <Toggle
                        on={prefs[row.key]}
                        label={row.label}
                        disabled={maskSaving}
                        onChange={(v) => saveMasks({ ...prefs, [row.key]: v })}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[#8a8172] font-mono">
                  <Lock size={10} />
                  Masking preferences are stored on your account. IPs are never logged raw.
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
