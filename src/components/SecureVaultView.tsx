import { useEffect, useState } from 'react';
import { X, Key, Lock, Unlock, Plus, Pin, PinOff, Trash2, Eye, EyeOff } from 'lucide-react';

/**
 * Ocean — Secure Vault (Feature 135)
 * Passcode-protected encrypted notes. Content is AES-256-GCM encrypted server-side;
 * only a salted scrypt hash of the passcode is ever stored.
 */
interface SecureVaultViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface VaultStatus {
  hasProfile: boolean;
  biometricEnabled: boolean;
  entryCount: number;
  locked: boolean;
}

interface VaultEntry {
  id: string;
  kind: 'note' | 'photo';
  title: string;
  pinned: boolean;
  createdAt: number;
  content?: string;
}

export default function SecureVaultView({ token, currentUser, onClose }: SecureVaultViewProps) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [pin, setPin] = useState('');
  const [pinSetup, setPinSetup] = useState('');
  const [biometric, setBiometric] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlockedOnce, setUnlockedOnce] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const api = async (path: string, method = 'GET', body?: any) => {
    const r = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  };

  const refreshStatus = async () => {
    try {
      setStatus(await api('/api/vault/status'));
    } catch { /* non-fatal */ }
  };

  const refreshEntries = async () => {
    try {
      const d = await api('/api/vault/entries');
      setEntries(d.entries || []);
      setUnlockedOnce(true);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const setup = async () => {
    if (pinSetup.length < 4) return setError('Passcode must be 4–8 characters.');
    setBusy(true);
    setError('');
    try {
      await api('/api/vault/setup', 'POST', { pin: pinSetup, biometricEnabled: biometric });
      setPinSetup('');
      await refreshStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/vault/unlock', 'POST', { method: 'passcode', pin });
      setPin('');
      await refreshStatus();
      await refreshEntries();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unlockBiometric = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/vault/unlock', 'POST', { method: 'biometric' });
      await refreshStatus();
      await refreshEntries();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addEntry = async () => {
    if (!content.trim()) return setError('Content is required.');
    setBusy(true);
    setError('');
    try {
      await api('/api/vault/entries', 'POST', { kind: 'note', title: title || 'Untitled', content });
      setTitle('');
      setContent('');
      await refreshEntries();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (id: string) => {
    try {
      await api(`/api/vault/entries/${id}/pin`, 'POST', {});
      await refreshEntries();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/vault/entries/${id}`, 'DELETE');
      await refreshEntries();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const reveal = async (id: string) => {
    try {
      const d = await api(`/api/vault/entries/${id}`);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, content: d.entry.content } : e)));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const locked = status ? status.locked : true;

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Secure Vault</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 135</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 mb-3">{error}</p>}

        {!status ? (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-6 text-center text-[11px] text-[#8a8172] dark:text-zinc-400">
            Loading vault…
          </div>
        ) : !status.hasProfile ? (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-5">
            <p className="flex items-center gap-2 font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 mb-2"><Lock size={14} className="text-amber-700 dark:text-amber-400" /> Set up your vault</p>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 mb-3">Your passcode is stored only as a salted hash — content is AES-256-GCM encrypted.</p>
            <input
              type="password"
              value={pinSetup}
              onChange={(e) => setPinSetup(e.target.value)}
              placeholder="4–8 character passcode"
              className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] mb-2 focus:outline-none focus:border-amber-500"
            />
            <label className="flex items-center gap-2 text-[11px] text-[#5c5446] dark:text-zinc-300 mb-3 cursor-pointer">
              <input type="checkbox" checked={biometric} onChange={(e) => setBiometric(e.target.checked)} className="accent-amber-700" />
              Enable simulated biometric unlock
            </label>
            <button onClick={setup} disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40">
              {busy ? 'Saving…' : 'Create vault'}
            </button>
          </div>
        ) : locked ? (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-5">
            <p className="flex items-center gap-2 font-bold text-[12px] text-[#3a342a] dark:text-zinc-100 mb-2"><Lock size={14} className="text-amber-700 dark:text-amber-400" /> Vault locked</p>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 mb-3">{status.entryCount} encrypted entr{status.entryCount === 1 ? 'y' : 'ies'} · encrypted at rest</p>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlock()}
              placeholder="Passcode"
              className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] mb-2 focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2">
              <button onClick={unlock} disabled={busy} className="flex-1 rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[12px] py-2.5 hover:brightness-110 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                <Unlock size={13} /> Unlock
              </button>
              {status.biometricEnabled && (
                <button onClick={unlockBiometric} disabled={busy} className="flex-1 rounded-xl border border-amber-700/40 dark:border-amber-400/40 text-amber-800 dark:text-amber-300 font-bold text-[12px] py-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all">
                  Biometric
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">
                <Plus size={12} className="text-amber-600" /> New encrypted note
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] mb-2 focus:outline-none focus:border-amber-500"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                placeholder="Secret content…"
                className="w-full px-3 py-2.5 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] focus:outline-none focus:border-amber-500 resize-none mb-2"
              />
              <button onClick={addEntry} disabled={busy} className="w-full rounded-xl bg-amber-800 dark:bg-amber-400 text-white dark:text-zinc-950 font-bold text-[11px] py-2 hover:brightness-110 transition-all disabled:opacity-40">
                {busy ? 'Encrypting…' : 'Encrypt & store'}
              </button>
            </div>

            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">My entries ({entries.length})</p>
              {entries.length === 0 && <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">Nothing stored yet.</p>}
              <div className="space-y-1.5">
                {entries.map((e) => (
                  <div key={e.id} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">{e.title}</span>
                      {e.pinned && <Pin size={11} className="text-amber-600" />}
                      <span className="ml-auto flex gap-1">
                        <button onClick={() => reveal(e.id)} className="p-1 text-[#8a8172] hover:text-amber-700 transition-colors" title="Reveal"><Eye size={12} /></button>
                        <button onClick={() => togglePin(e.id)} className="p-1 text-[#8a8172] hover:text-amber-700 transition-colors" title={e.pinned ? 'Unpin' : 'Pin'}>{e.pinned ? <PinOff size={12} /> : <Pin size={12} />}</button>
                        <button onClick={() => remove(e.id)} className="p-1 text-[#8a8172] hover:text-rose-600 transition-colors" title="Delete"><Trash2 size={12} /></button>
                      </span>
                    </div>
                    {e.content !== undefined && (
                      <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-1 break-words">{e.content}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {!unlockedOnce && <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 mt-2"><EyeOff size={10} className="inline" /> Metadata only — tap the eye to decrypt a note.</p>}
          </>
        )}
      </div>
    </div>
  );
}
