import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Hourglass, X, Lock, Unlock, Trash2, KeyRound, CalendarClock,
  ShieldCheck, MessageSquareText, Eye,
} from 'lucide-react';

/**
 * Ocean — Encrypted Time Capsule
 * -------------------------------
 * Write a message, pick an unlock date, optionally protect it with a passphrase.
 * If a passphrase is given the message is encrypted client-side with AES-256-GCM
 * (key derived from the passphrase via PBKDF2-SHA256, 150,000 iterations) using
 * the WebCrypto API — only `{ ciphertext, iv, salt }` ever touches localStorage,
 * so the plaintext is unreadable without the passphrase.
 *
 * Persistence: localStorage key "ocean_time_capsules".
 */

const CAPSULE_STORAGE_KEY = 'ocean_time_capsules';
const PBKDF2_ITERATIONS = 150000;

interface TimeCapsule {
  id: string;
  unlockAt: string;            // ISO string of the unlock moment
  createdAt: number;
  hasPassphrase: boolean;
  text?: string;               // plaintext (no passphrase)
  ciphertextBase64?: string;   // AES-GCM ciphertext
  ivBase64?: string;
  saltBase64?: string;
}

interface EncryptedTimeCapsuleModalProps {
  token: string | null;
  onClose: () => void;
}

// --- base64 <-> bytes --------------------------------------------------------
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- WebCrypto helpers -------------------------------------------------------
async function encryptWithPassphrase(text: string, passphrase: string) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return {
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
    ivBase64: bytesToBase64(iv),
    saltBase64: bytesToBase64(salt),
  };
}

async function decryptWithPassphrase(c: TimeCapsule, passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const salt = base64ToBytes(c.saltBase64 || '');
  const iv = base64ToBytes(c.ivBase64 || '');

  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  // Throws OperationError on a wrong passphrase / tampered ciphertext.
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBytes(c.ciphertextBase64 || '').buffer,
  );
  return dec.decode(plaintext);
}

// --- small helpers -----------------------------------------------------------
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatUnlock(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return iso;
  }
}

function loadCapsules(): TimeCapsule[] {
  try {
    const raw = localStorage.getItem(CAPSULE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function EncryptedTimeCapsuleModal({ token, onClose }: EncryptedTimeCapsuleModalProps) {
  void token; // reserved: could scope capsules per user later
  const [visible, setVisible] = useState(true);
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [now, setNow] = useState<number>(Date.now());

  const [message, setMessage] = useState('');
  const [unlockAt, setUnlockAt] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [sealing, setSealing] = useState(false);

  const [revealId, setRevealId] = useState<string | null>(null);
  const [revealPass, setRevealPass] = useState('');
  const [revealError, setRevealError] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const toast = (message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  };

  // Load stored capsules once.
  useEffect(() => {
    setCapsules(loadCapsules());
  }, []);

  // Tick so capsules flip from "Sealed" to "Reveal" on time.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);

  const seal = async () => {
    const text = message.trim();
    if (!text) return toast('Write a message for the future.', 'destructive');
    if (!unlockAt) return toast('Pick an unlock date and time.', 'destructive');
    const unlockMs = new Date(unlockAt).getTime();
    if (!Number.isFinite(unlockMs) || unlockMs <= Date.now()) {
      return toast('Unlock time must be in the future.', 'destructive');
    }

    setSealing(true);
    try {
      const base: TimeCapsule = {
        id: `tc-${Date.now()}`,
        unlockAt: new Date(unlockMs).toISOString(),
        createdAt: Date.now(),
        hasPassphrase: false,
      };

      const pwd = passphrase.trim();
      const record: TimeCapsule = pwd
        ? { ...base, hasPassphrase: true, ...(await encryptWithPassphrase(text, pwd)) }
        : { ...base, text };

      const next = [...capsules, record].sort((a, b) => a.unlockAt.localeCompare(b.unlockAt));
      localStorage.setItem(CAPSULE_STORAGE_KEY, JSON.stringify(next));
      setCapsules(next);
      setMessage('');
      setPassphrase('');
      toast(pwd ? 'Capsule sealed & encrypted. Your secret is safe.' : 'Capsule sealed.');
    } catch (e: any) {
      toast(e?.message || 'Failed to seal capsule.', 'destructive');
    } finally {
      setSealing(false);
    }
  };

  const reveal = (c: TimeCapsule) => {
    if (c.hasPassphrase) {
      setRevealId(c.id);
      setRevealPass('');
      setRevealError(false);
      return;
    }
    setRevealed(prev => ({ ...prev, [c.id]: c.text || '' }));
  };

  const decryptAndReveal = async (c: TimeCapsule) => {
    if (!revealPass.trim()) {
      setRevealError(true);
      return;
    }
    try {
      const plain = await decryptWithPassphrase(c, revealPass);
      setRevealed(prev => ({ ...prev, [c.id]: plain }));
      setRevealId(null);
      setRevealError(false);
      toast('Capsule unlocked.');
    } catch {
      setRevealError(true);
    }
  };

  const destroy = (id: string) => {
    const next = capsules.filter(c => c.id !== id);
    localStorage.setItem(CAPSULE_STORAGE_KEY, JSON.stringify(next));
    setCapsules(next);
    setRevealed(prev => {
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
    if (revealId === id) setRevealId(null);
    toast('Capsule destroyed.');
  };

  const minUnlock = toLocalInputValue(Date.now() + 60000);

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setVisible(false)}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[1.75rem] p-6 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <Hourglass className="text-amber-800 dark:text-amber-400" size={18} />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Time Capsule</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                    Sealed messages for the future
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVisible(false)}
                className="text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Compose */}
            <div className="space-y-3 rounded-2xl border-2 border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/30 p-4">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
                <MessageSquareText size={11} /> Your message
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder="Write something for your future self — or someone else…"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />

              <div>
                <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
                  <CalendarClock size={11} /> Unlock at
                </label>
                <input
                  type="datetime-local"
                  value={unlockAt}
                  min={minUnlock}
                  onChange={e => setUnlockAt(e.target.value)}
                  className="w-full mt-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
                  <KeyRound size={11} /> Passphrase (optional — encrypts your message)
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  placeholder="e.g. a safe combination"
                  autoComplete="off"
                  className="w-full mt-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                />
              </div>

              <button
                onClick={seal}
                disabled={sealing}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Lock size={12} /> {sealing ? 'Sealing…' : 'Seal capsule'}
              </button>
            </div>

            {/* List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
                  <ShieldCheck size={11} /> Sealed capsules
                </span>
                <span className="font-mono text-[9px] text-[#8a8172] dark:text-zinc-500">{capsules.length}</span>
              </div>

              {capsules.length === 0 ? (
                <div className="text-center py-8 space-y-1 rounded-2xl border-2 border-dashed border-[#ebdcca] dark:border-zinc-800">
                  <Hourglass className="mx-auto text-[#8a8172] dark:text-zinc-500" size={22} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No capsules yet.</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    Seal one above and the future will wait.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {capsules.map(c => {
                    const locked = now < new Date(c.unlockAt).getTime();
                    const isRevealed = revealed[c.id] !== undefined;
                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/30 p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          {locked ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 bg-amber-800/10 dark:bg-amber-400/10 px-2 py-1 rounded-lg">
                              <Lock size={11} className="animate-pulse" /> Sealed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-700/10 px-2 py-1 rounded-lg">
                              <Unlock size={11} /> Ready
                            </span>
                          )}
                          <span className="font-mono text-[9px] text-[#8a8172] dark:text-zinc-400 ml-auto flex items-center gap-1">
                            <CalendarClock size={11} /> {formatUnlock(c.unlockAt)}
                          </span>
                        </div>

                        {!locked && c.hasPassphrase && revealId === c.id && (
                          <div className="space-y-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-3">
                            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center gap-1">
                              <KeyRound size={11} /> Enter passphrase to reveal
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="password"
                                value={revealPass}
                                onChange={e => { setRevealPass(e.target.value); setRevealError(false); }}
                                onKeyDown={e => { if (e.key === 'Enter') decryptAndReveal(c); }}
                                placeholder="Passphrase"
                                autoFocus
                                autoComplete="off"
                                className={`flex-1 min-w-0 bg-white dark:bg-zinc-800 border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-amber-400 ${
                                  revealError ? 'border-red-400 dark:border-red-600' : 'border-[#ebdcca] dark:border-zinc-700'
                                }`}
                              />
                              <button
                                onClick={() => decryptAndReveal(c)}
                                className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 transition-all flex items-center gap-1"
                              >
                                <Eye size={11} /> Reveal
                              </button>
                            </div>
                            {revealError && (
                              <p className="text-[10px] text-red-600 dark:text-red-400 font-mono">
                                Wrong passphrase — could not decrypt.
                              </p>
                            )}
                          </div>
                        )}

                        {!locked && isRevealed && (
                          <div className="rounded-xl bg-[#ebdcca]/30 dark:bg-zinc-800 p-3 text-xs text-[#5c5446] dark:text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                            {revealed[c.id]}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {!locked && !isRevealed && !(c.hasPassphrase && revealId === c.id) && (
                            <button
                              onClick={() => reveal(c)}
                              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 dark:hover:bg-amber-300 transition-all flex items-center gap-1"
                            >
                              <Unlock size={11} /> Reveal
                            </button>
                          )}
                          <button
                            onClick={() => destroy(c.id)}
                            className="ml-auto font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-red-100 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-all flex items-center gap-1"
                          >
                            <Trash2 size={11} /> Destroy
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
