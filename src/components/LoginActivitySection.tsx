import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck, Smartphone, Laptop, LogOut, Loader2, Clock, Globe, MonitorSmartphone,
} from 'lucide-react';

/**
 * Ocean — Login Activity
 * ----------------------
 * Settings-style section listing the signed-in sessions for the current user.
 * Backed by GET /api/auth/sessions and POST /api/auth/sessions/revoke.
 * The current device is badged "This device" and cannot be revoked from here
 * (revoking it would invalidate the very token used for the request).
 */

interface LoginActivitySectionProps {
  token: string | null;
}

interface Session {
  token: string;
  isCurrent: boolean;
  ip: string;
  browser: string;
  os: string;
  createdAt: number;
  lastSeenAt: number;
  active: boolean;
}

/** Compact human-readable "last seen" timestamp. */
function relativeTime(ts?: number): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Smartphone for mobile OSes, laptop for desktop OSes. */
function SessionDeviceIcon({ os }: { os: string }) {
  const o = (os || '').toLowerCase();
  const mobile = o.includes('android') || o.includes('ios') || o.includes('iphone') || o.includes('ipad');
  const Icon = mobile ? Smartphone : Laptop;
  return (
    <span className="w-10 h-10 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center shrink-0">
      <Icon className="text-amber-800 dark:text-amber-400" size={18} />
    </span>
  );
}

export default function LoginActivitySection({ token }: LoginActivitySectionProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const toast = (message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/sessions', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      } else {
        toast('Could not load your sessions.', 'destructive');
      }
    } catch {
      toast('Could not load your sessions.', 'destructive');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (s: Session) => {
    if (s.isCurrent) return;
    setRevoking(s.token);
    try {
      const res = await fetch('/api/auth/sessions/revoke', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ token: s.token }),
      });
      if (res.ok) {
        toast('Signed out from that device.');
        load();
      } else {
        toast('Could not sign out that device.', 'destructive');
      }
    } catch {
      toast('Could not sign out that device.', 'destructive');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
          <ShieldCheck className="text-amber-800 dark:text-amber-400" size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Login Activity</h2>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
            Sessions where your account is signed in
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto text-[#8a8172] dark:text-zinc-500 animate-spin" size={22} />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
            Loading sessions…
          </p>
        </div>
      ) : sessions.length === 0 ? (
        /* Empty state */
        <div className="py-10 text-center space-y-2">
          <MonitorSmartphone className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
          <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No active sessions.</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
            Sign in on a device to see it here
          </p>
        </div>
      ) : (
        /* Session list */
        <div className="space-y-3">
          {sessions.map(s => {
            const revokingThis = revoking === s.token;
            return (
              <motion.div
                key={s.token}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 p-4"
              >
                <SessionDeviceIcon os={s.os} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#3a342a] dark:text-zinc-100">
                      {s.browser || 'Browser'} · {s.os || 'Device'}
                    </span>
                    {s.isCurrent && (
                      <span className="font-mono text-[9px] uppercase tracking-wider font-bold bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 px-2 py-0.5 rounded-full">
                        This device
                      </span>
                    )}
                    {!s.active && (
                      <span className="font-mono text-[9px] uppercase tracking-wider bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#8a8172] dark:text-zinc-400 px-2 py-0.5 rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-[#8a8172] dark:text-zinc-400 uppercase tracking-wide">
                    <span className="flex items-center gap-1">
                      <Globe size={10} /> {s.ip || '—'}
                    </span>
                    <span className="flex items-center gap-1 normal-case">
                      <Clock size={10} /> Last seen {relativeTime(s.lastSeenAt)}
                    </span>
                  </div>
                </div>

                {!s.isCurrent && (
                  <button
                    onClick={() => revoke(s)}
                    disabled={revokingThis}
                    className="font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-3 rounded-xl bg-transparent text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all flex items-center gap-1 disabled:opacity-50 shrink-0"
                  >
                    {revokingThis ? <Loader2 size={11} className="animate-spin" /> : <LogOut size={11} />}
                    Sign out
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
