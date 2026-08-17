import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, Droplets, Plus, CalendarDays, Loader2 } from 'lucide-react';

/**
 * Ocean — Period Tracker (Feature 206)
 * -------------------------------------
 * 100% client-side and encrypted: cycle data is AES-GCM encrypted with a
 * passphrase-derived key (PBKDF2) and stored only in localStorage. Nothing is
 * ever sent to the server. Forgetting the passphrase means the data is gone.
 */

interface PeriodTrackerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface CycleData {
  logs: { start: string; duration: number; note?: string }[];
}

const KEY = 'ocean_period_vault';

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(data: CycleData, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  const payload = new Uint8Array(salt.length + iv.length + ct.byteLength);
  payload.set(salt, 0);
  payload.set(iv, salt.length);
  payload.set(new Uint8Array(ct), salt.length + iv.length);
  return btoa(String.fromCharCode(...payload));
}

async function decrypt(b64: string, passphrase: string): Promise<CycleData | null> {
  try {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const salt = raw.slice(0, 16);
    const iv = raw.slice(16, 28);
    const ct = raw.slice(28);
    const key = await deriveKey(passphrase, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

export default function PeriodTracker({ token, currentUser, onClose }: PeriodTrackerProps) {
  const [visible, setVisible] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [savedPass, setSavedPass] = useState(false);
  const [data, setData] = useState<CycleData>({ logs: [] });
  const [busy, setBusy] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newDuration, setNewDuration] = useState('5');
  const [newNote, setNewNote] = useState('');

  const toast = (message: string, variant?: string) =>
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));

  const hasVault = !!localStorage.getItem(KEY);
  // Remember the passphrase in-session only (never persisted anywhere).
  const sessionPass = () => (window as any).__oceanPeriodPass as string | undefined;

  useEffect(() => {
    if ((window as any).__oceanPeriodPass && localStorage.getItem(KEY)) {
      setPassphrase((window as any).__oceanPeriodPass);
      unlock((window as any).__oceanPeriodPass, false);
    }
  }, []);

  const unlock = async (pass: string, showToast = true) => {
    setBusy(true);
    try {
      if (!localStorage.getItem(KEY)) {
        setData({ logs: [] });
        setUnlocked(true);
        (window as any).__oceanPeriodPass = pass;
        setSavedPass(true);
        if (showToast) toast('Vault created — store your passphrase somewhere safe!');
        return;
      }
      const d = await decrypt(localStorage.getItem(KEY)!, pass);
      if (!d) {
        if (showToast) toast('Wrong passphrase.', 'destructive');
        return;
      }
      setData(d);
      setUnlocked(true);
      (window as any).__oceanPeriodPass = pass;
      setSavedPass(true);
      if (showToast) toast('Vault unlocked — decrypting locally.');
    } finally { setBusy(false); }
  };

  const save = useCallback(async (next: CycleData) => {
    setData(next);
    const pass = sessionPass();
    if (!pass) return;
    const b64 = await encrypt(next, pass);
    localStorage.setItem(KEY, b64);
  }, []);

  const addLog = async () => {
    if (!newDate) return toast('Pick a start date.');
    const next: CycleData = {
      logs: [...data.logs, { start: newDate, duration: Math.max(1, Number(newDuration) || 5), note: newNote || undefined }],
    };
    await save(next);
    toast('Cycle logged (encrypted).');
    setNewNote('');
  };

  const removeLog = async (idx: number) => {
    const next = { logs: data.logs.filter((_, i) => i !== idx) };
    await save(next);
  };

  const lock = () => {
    setUnlocked(false);
    (window as any).__oceanPeriodPass = undefined;
    setSavedPass(false);
    setPassphrase('');
  };

  const predictNext = (): string | null => {
    const sorted = [...data.logs].sort((a, b) => b.start.localeCompare(a.start));
    if (sorted.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = (new Date(sorted[i].start).getTime() - new Date(sorted[i + 1].start).getTime()) / 86400000;
      if (g > 15 && g < 45) gaps.push(Math.round(g));
    }
    if (gaps.length === 0) return null;
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return new Date(new Date(sorted[0].start).getTime() + avg * 86400000).toLocaleDateString();
  };

  const shell = 'fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4';
  const card = 'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';
  const input = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 placeholder-[#8a8172]/60 outline-none focus:border-amber-400 transition-colors';

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Period tracker</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-rose-800/10 dark:bg-rose-400/10 flex items-center justify-center">
                  <Droplets className="text-rose-800 dark:text-rose-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Period Tracker</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Encrypted · on-device only</p>
                </div>
                {unlocked && <Lock size={14} className="text-rose-700 dark:text-rose-300" />}
              </div>

              {!unlocked ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-2xl bg-rose-800/5 dark:bg-rose-400/5 border border-rose-200/60 dark:border-rose-800/40 p-3">
                    <Lock size={14} className="text-rose-700 dark:text-rose-300 shrink-0" />
                    <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                      Data is encrypted in your browser with AES-GCM and never touches the server.
                      Set a passphrase — <b>if you forget it, your data cannot be recovered.</b>
                    </p>
                  </div>
                  <input className={`${input} text-center`} type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder={hasVault ? 'Enter passphrase' : 'Create a passphrase'} onKeyDown={e => { if (e.key === 'Enter' && passphrase.length >= 4) unlock(passphrase); }} />
                  <button onClick={() => passphrase.length >= 4 && unlock(passphrase)} disabled={busy || passphrase.length < 4} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />} {hasVault ? 'Unlock vault' : 'Create vault'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      <Lock size={10} /> Vault unlocked on this device
                    </span>
                    <button onClick={lock} className="text-[10px] font-mono uppercase text-[#8a8172] hover:text-rose-500">Lock</button>
                  </div>

                  {predictNext() && (
                    <div className="rounded-2xl bg-rose-800/5 dark:bg-rose-400/5 border border-rose-200/60 dark:border-rose-800/40 p-3 flex items-center gap-2">
                      <CalendarDays size={14} className="text-rose-700 dark:text-rose-300" />
                      <span className="text-[11px] text-[#5c5446] dark:text-zinc-300">Predicted next cycle: <b className="text-rose-800 dark:text-rose-300">{predictNext()}</b></span>
                    </div>
                  )}

                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Log a cycle</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={input} type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                      <input className={input} type="number" min={1} max={14} value={newDuration} onChange={e => setNewDuration(e.target.value)} placeholder="Duration (days)" />
                    </div>
                    <input className={input} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Note (optional)" />
                    <button onClick={addLog} className={`${btnPrimary} w-full justify-center`}><Plus size={11} /> Save log</button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">History ({data.logs.length})</div>
                    {data.logs.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No cycles logged yet.</p>}
                    {[...data.logs].sort((a, b) => b.start.localeCompare(a.start)).map((l, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5">
                        <Droplets size={11} className="text-rose-600 shrink-0" />
                        <span className="flex-1 text-[11px] text-[#3a342a] dark:text-zinc-100">{new Date(l.start).toLocaleDateString()}</span>
                        <span className="font-mono text-[9px] text-[#8a8172]">{l.duration}d</span>
                        {l.note && <span className="text-[9px] text-[#8a8172] truncate max-w-24">{l.note}</span>}
                        <button onClick={() => removeLog(i)} className="text-[#8a8172] hover:text-rose-500 text-[10px]">✕</button>
                      </div>
                    ))}
                  </div>
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    Not medical advice — for cycle tracking only. Everything stays on this device.
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
