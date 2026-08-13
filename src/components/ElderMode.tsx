import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Accessibility, Loader2, Check } from 'lucide-react';

/**
 * Ocean — Elder Mode (Feature 204)
 * ---------------------------------
 * Senior-friendly theme: large fonts, high contrast and simplified buttons.
 * Applies the `elder-mode` CSS class to <html> (persisted to localStorage
 * immediately) and syncs the preference to the server for other devices.
 * Backed by /api/prefs/elder-mode.
 */

interface ElderModeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const PREVIEW_CLASSES = ['text-[#3a342a] dark:text-zinc-100 font-display font-bold', 'text-[#5c5446] dark:text-zinc-300', 'text-[#8a8172] dark:text-zinc-500'];

export default function ElderMode({ token, currentUser, onClose }: ElderModeProps) {
  const [visible, setVisible] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const apply = (on: boolean) => {
    const root = document.documentElement;
    if (on) root.classList.add('elder-mode');
    else root.classList.remove('elder-mode');
    localStorage.setItem('elder_mode', on ? '1' : '0');
  };

  const load = useCallback(async () => {
    const local = localStorage.getItem('elder_mode') === '1';
    setEnabled(local);
    apply(local);
    if (currentUser) {
      try {
        const d = await api('/api/prefs/elder-mode', 'GET');
        setEnabled(Boolean(d.enabled));
        apply(Boolean(d.enabled));
      } catch { /* offline ok */ }
    }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => apply(false), []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setEnabled(on);
    apply(on);
    try {
      if (currentUser) {
        await api('/api/prefs/elder-mode', 'POST', { enabled: on });
        toast(on ? 'Elder Mode on — synced across devices.' : 'Elder Mode off.');
      } else {
        toast(on ? 'Elder Mode on (this device).' : 'Elder Mode off.');
      }
    } catch { /* local still applied */ } finally { setBusy(false); }
  };

  const shell = 'fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Elder mode</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 flex items-center justify-center">
                  <Accessibility className="text-emerald-800 dark:text-emerald-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Elder Mode</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Big fonts · high contrast · calm UI</p>
                </div>
              </div>

              {loading ? (
                <div className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Loading…
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    Turns on larger text, bolder contrast and simplified interactions across Ocean.
                    The setting is saved on this device and, when you are signed in, synced to your account.
                  </p>
                  <button onClick={() => toggle(!enabled)} disabled={busy}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${enabled ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-400/10' : 'border-[#ebdcca] dark:border-zinc-700 bg-white/60 dark:bg-zinc-950/40 hover:border-emerald-400'}`}>
                    <span className="flex items-center gap-2">
                      <Accessibility size={16} className={enabled ? 'text-emerald-600' : 'text-[#8a8172]'} />
                      <span className={`font-display font-bold ${enabled ? 'text-emerald-700 dark:text-emerald-300 text-base' : 'text-[#3a342a] dark:text-zinc-100'}`}>
                        Elder Mode {enabled ? 'On' : 'Off'}
                      </span>
                    </span>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center ${enabled ? 'bg-emerald-600 text-white' : 'bg-[#ebdcca] dark:bg-zinc-700 text-[#8a8172]'}`}>
                      {enabled && <Check size={13} />}
                    </span>
                  </button>

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40 space-y-2">
                    <div className={`font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 ${enabled ? '' : ''}`}>Preview</div>
                    <div className="text-lg font-display font-bold text-[#3a342a] dark:text-zinc-100">Larger headline text</div>
                    <div className="text-base text-[#5c5446] dark:text-zinc-300 leading-relaxed">Body copy is larger and easier to read, with stronger contrast between text and background.</div>
                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-sm font-mono uppercase font-bold">Big action button</div>
                    <div className="text-xs text-[#8a8172] dark:text-zinc-500">Simplified navigation: fewer choices, bigger targets.</div>
                  </div>
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    Tip: pair with Sensory-Safe Mode for the calmest experience.
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
