import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Vault, Lock, Plus, Loader2, Trash2, Eye, KeyRound } from 'lucide-react';

/**
 * Ocean — Harassment Evidence Vault (Feature 207)
 * -------------------------------------------------
 * Encrypted evidence locker. Notes are encrypted with AES-GCM in the browser
 * before upload — the server stores only ciphertext. A master passphrase
 * unlocks this device's copy of the key material.
 * Backed by /api/vault/entries.
 */

interface EvidenceVaultProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface VaultMeta { id: string; title: string; kind: string; createdAt: number }
interface VaultEntry extends VaultMeta { iv: string; ciphertext: string }

const KEY_SALT = 'ocean-evidence-salt';

async function getKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(KEY_SALT), iterations: 100_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptText(text: string, passphrase: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(passphrase);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: btoa(String.fromCharCode(...iv)), ct: btoa(String.fromCharCode(...new Uint8Array(ct))) };
}

async function decryptText(ivB64: string, ctB64: string, passphrase: string): Promise<string> {
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
  const key = await getKey(passphrase);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export default function EvidenceVault({ token, currentUser, onClose }: EvidenceVaultProps) {
  const [visible, setVisible] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [hasPass, setHasPass] = useState(false);
  const [entries, setEntries] = useState<VaultMeta[]>([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [decrypted, setDecrypted] = useState('');

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
    if (!currentUser) return;
    setLoading(true);
    try {
      const d = await api('/api/vault/entries', 'GET');
      setEntries(d.entries || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setHasPass(!!localStorage.getItem('ocean_evidence_pass_set')); }, []);

  const saveEntry = async () => {
    if (!title.trim() || !text.trim()) return toast('Title and content are required.');
    if (!passphrase) return toast('Set a master passphrase first.');
    setBusy(true);
    try {
      const { iv, ct } = await encryptText(text, passphrase);
      await api('/api/vault/entries', 'POST', { title, kind: 'note', iv, ciphertext: ct });
      localStorage.setItem('ocean_evidence_pass_set', '1');
      toast('Evidence stored — server only saw ciphertext.');
      setTitle(''); setText('');
      await load();
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const openEntry = async (id: string) => {
    setBusy(true);
    try {
      const d = await api(`/api/vault/entries/${id}`, 'GET');
      const entry: VaultEntry = d.entry;
      let plain = '';
      try {
        plain = await decryptText(entry.iv, entry.ciphertext, passphrase);
      } catch {
        plain = '⚠ Could not decrypt — check your passphrase.';
      }
      setViewing(entry.title);
      setDecrypted(plain);
    } catch (e: any) { toast(e.message || 'Failed.', 'destructive'); } finally { setBusy(false); }
  };

  const removeEntry = async (id: string) => {
    try {
      await api(`/api/vault/entries/${id}`, 'DELETE');
      toast('Entry deleted.');
      setViewing(null);
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Evidence vault</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-zinc-800/10 dark:bg-zinc-400/10 flex items-center justify-center">
                  <Vault className="text-zinc-800 dark:text-zinc-300" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Evidence Vault</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Encrypted harassment evidence</p>
                </div>
                {hasPass && <Lock size={14} className="text-zinc-700 dark:text-zinc-300" />}
              </div>

              {!currentUser ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-400 text-center py-6">Sign in to use the encrypted vault.</p>
              ) : viewing ? (
                <div className="space-y-3">
                  <button onClick={() => setViewing(null)} className="text-[10px] font-mono uppercase text-[#8a8172] hover:text-[#3a342a] dark:hover:text-zinc-100">← Back</button>
                  <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-4 bg-white/60 dark:bg-zinc-950/40">
                    <div className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 mb-2">{viewing}</div>
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{decrypted}</p>
                  </div>
                  <button onClick={() => setViewing(null)} className={`${btnPrimary} w-full justify-center`}><Eye size={11} /> Close view</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-2xl bg-zinc-800/5 dark:bg-zinc-400/5 border border-zinc-200/60 dark:border-zinc-800/40 p-3">
                    <KeyRound size={13} className="text-zinc-700 dark:text-zinc-300 shrink-0" />
                    <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                      Your notes are encrypted in-browser before upload. The server stores ciphertext only.
                      Use the same passphrase to re-open entries.
                    </p>
                  </div>
                  <input className={`${input} text-center`} type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder={hasPass ? 'Master passphrase' : 'Set a master passphrase'} />
                  <div className="grid grid-cols-1 gap-2">
                    <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g. Screenshots 2024-06-12)" />
                    <textarea className={`${input} resize-none`} rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Encrypted note / evidence description (screenshots & timestamps)" />
                  </div>
                  <button onClick={saveEntry} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Encrypt &amp; store
                  </button>

                  <div className="space-y-1.5">
                    <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Stored entries ({entries.length})</div>
                    {loading ? (
                      <div className="py-6 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 flex items-center justify-center gap-2">
                        <Loader2 size={12} className="animate-spin" /> Loading…
                      </div>
                    ) : entries.length === 0 ? (
                      <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">No entries yet.</p>
                    ) : (
                      entries.map(e => (
                        <div key={e.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2.5 py-1.5">
                          <Lock size={11} className="text-zinc-600 shrink-0" />
                          <span className="flex-1 min-w-0 text-[11px] text-[#3a342a] dark:text-zinc-100 truncate">{e.title}</span>
                          <span className="font-mono text-[8px] uppercase text-[#8a8172] shrink-0">{new Date(e.createdAt).toLocaleDateString()}</span>
                          <button onClick={() => openEntry(e.id)} disabled={busy} className="text-[#8a8172] hover:text-zinc-800 dark:hover:text-zinc-100" aria-label="Open"><Eye size={12} /></button>
                          <button onClick={() => removeEntry(e.id)} className="text-[#8a8172] hover:text-rose-500" aria-label="Delete"><Trash2 size={12} /></button>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="font-mono text-[8px] uppercase tracking-wide text-[#8a8172] dark:text-zinc-500">
                    Keep the passphrase safe — ciphertext without it cannot be read by anyone, including us.
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
