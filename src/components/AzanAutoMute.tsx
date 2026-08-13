import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BellOff, Bell, Loader2 } from 'lucide-react';

/**
 * Ocean — Azan Auto-Mute (Feature 223)
 * --------------------------------------
 * Shows today's prayer times and lets you mute Ocean notifications during
 * prayer windows (with a configurable city offset). Backed by /api/azan/*.
 */

interface AzanAutoMuteProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface TimeItem { name: string; at: number; label: string }

export default function AzanAutoMute({ token, currentUser, onClose }: AzanAutoMuteProps) {
  const [visible, setVisible] = useState(true);
  const [items, setItems] = useState<TimeItem[]>([]);
  const [next, setNext] = useState<TimeItem | null>(null);
  const [inMute, setInMute] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  const authToken = token || localStorage.getItem('secure_auth_token');
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/azan/times?offset=${offset}`, 'GET');
      setItems(d.items || []);
      setNext(d.next || null);
      setInMute(Boolean(d.inMute));
      if (currentUser) {
        const p = await api('/api/azan/prefs', 'GET').catch(() => null);
        if (p?.prefs) {
          setEnabled(Boolean(p.prefs.enabled));
          if (p.prefs.offsetMin) setOffset(p.prefs.offsetMin);
        }
      }
    } catch { /* ignore */ }
  }, [offset, currentUser]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setEnabled(on);
    try {
      if (currentUser) {
        await api('/api/azan/prefs', 'POST', { enabled: on, offsetMin: offset });
        toast(on ? 'Notifications will auto-mute during prayer windows.' : 'Auto-mute disabled.');
      } else {
        toast('Sign in to persist this across devices.');
      }
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Azan auto-mute</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 flex items-center justify-center">
                  {enabled ? <BellOff className="text-emerald-800 dark:text-emerald-400" size={17} /> : <Bell className="text-emerald-800 dark:text-emerald-400" size={17} />}
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Azan Auto-Mute</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Quiet during prayer — peace during salah</p>
                </div>
              </div>

              {next && (
                <div className={`rounded-2xl p-4 border ${inMute ? 'bg-emerald-800/10 border-emerald-300/60 dark:border-emerald-800/40' : 'bg-white/60 dark:bg-zinc-950/40 border-[#ebdcca] dark:border-zinc-800'}`}>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">{inMute ? 'In prayer window — notifications muted' : 'Next prayer'}</div>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="font-display text-2xl font-bold text-[#3a342a] dark:text-zinc-100">{next.name}</span>
                    <span className="font-mono text-sm text-emerald-700 dark:text-emerald-300">{next.label}</span>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 divide-y divide-[#ebdcca]/60 dark:divide-zinc-800">
                {items.map((t) => (
                  <div key={t.name} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-bold text-[#3a342a] dark:text-zinc-100">{t.name}</span>
                    <span className={`font-mono text-xs ${next?.name === t.name ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-[#8a8172]'}`}>{t.label}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input className={input} type="number" min={-60} max={60} value={offset} onChange={e => setOffset(Math.max(-60, Math.min(60, Number(e.target.value) || 0)))} placeholder="City offset (min)" />
                <button onClick={toggle.bind(null, !enabled)} disabled={busy} className={`${btnPrimary} flex-1 justify-center ${enabled ? '!bg-emerald-700' : ''}`}>
                  {busy ? <Loader2 size={11} className="animate-spin" /> : enabled ? <BellOff size={11} /> : <Bell size={11} />}
                  {enabled ? 'Auto-mute on' : 'Enable auto-mute'}
                </button>
              </div>
              <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                Times are a deterministic approximation for Dhaka — adjust the offset for your city, or wire an aladhan-style API for exact times.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
