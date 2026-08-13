import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wallet, Plug, Trash2, Loader2, Check } from 'lucide-react';

/**
 * Ocean — Hardware Wallet Integration (Feature 238)
 * --------------------------------------------------
 * Register a hardware wallet (Ledger/Trezor-style) via device handshake:
 * paste the device public key + signed challenge, server verifies and
 * registers. ⚠ SIMULATION: no physical device is connected — the handshake
 * is validated server-side by shape only. Connect a real wallet via the
 * device's WebUSB/WebHID flow in Settings when hardware signing is enabled.
 * Backed by /api/hardware-wallet.
 */

interface HardwareWalletProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Wallet { id: string; label: string; publicKey: string; verified: boolean; verifiedAt?: number }

export default function HardwareWallet({ token, currentUser, onClose }: HardwareWalletProps) {
  const [visible, setVisible] = useState(true);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [label, setLabel] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [signature, setSignature] = useState('');
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
      const d = await api('/api/hardware-wallet', 'GET');
      setWallets(d.wallets || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!publicKey.trim() || !signature.trim()) return toast('Public key and device signature are required.');
    setBusy(true);
    try {
      await api('/api/hardware-wallet', 'POST', {
        label,
        publicKey,
        signature,
        message: 'ocean-device-handshake',
      });
      toast('Wallet registered — device verified.');
      setLabel(''); setPublicKey(''); setSignature('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/hardware-wallet/${id}`, 'DELETE');
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Hardware wallet</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center">
                  <Wallet className="text-amber-800 dark:text-amber-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Hardware Wallet</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Sign with a physical device · feature 238</p>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/30 p-3">
                <p className="font-mono text-[9px] uppercase tracking-wider text-amber-800 dark:text-amber-300 font-bold mb-1">⚠ Simulation in effect</p>
                <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                  No physical wallet is connected — this is a simulated device handshake for demo purposes.
                  To connect a real Ledger/Trezor-style wallet, use the device's WebUSB/WebHID pairing in Settings (hardware signing must be enabled there first).
                </p>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plug size={11} className="inline" /> Register device (simulated handshake — paste public key + signed challenge)</div>
                  <input className={input} value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. Ledger Nano S)" />
                  <input className={`${input} font-mono text-[10px] break-all`} value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder="Device public key" />
                  <input className={`${input} font-mono text-[10px]`} value={signature} onChange={e => setSignature(e.target.value)} placeholder="Signed challenge (base64)" />
                  <button onClick={register} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />} Verify & register
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {wallets.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No wallets connected.</p>}
                {wallets.map(w => (
                  <div key={w.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <Wallet size={13} className="text-amber-700 dark:text-amber-400" />
                      <span className="font-mono text-[11px] font-bold text-[#3a342a] dark:text-zinc-200">{w.label}</span>
                      {w.verified
                        ? <span className="ml-auto flex items-center gap-1 font-mono text-[9px] uppercase text-emerald-700 dark:text-emerald-400"><Check size={10} /> verified</span>
                        : <span className="ml-auto font-mono text-[9px] uppercase text-amber-700 dark:text-amber-400">pending</span>}
                      <button onClick={() => remove(w.id)} className="text-[#8a8172] hover:text-red-600 transition-colors" aria-label="Remove">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-500 mt-1 break-all">{w.publicKey.slice(0, 48)}…</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
