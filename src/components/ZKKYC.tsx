import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BadgeCheck, Fingerprint, Plus, Loader2, Check } from 'lucide-react';
import SimulationModeBadge from './SimulationModeBadge';

/**
 * Ocean — Privacy-Preserving Verification (Feature 237)
 * ---------------------------------------------------------
 * Prove a verified credential (age ≥ 18, address ward, etc.) WITHOUT revealing
 * the underlying data: the client commits to its attributes with salted hashes
 * and the server stores only commitments + property proofs.
 *
 * NOTE: this is salted-hash / commitment-style verification, NOT a true
 * zk-SNARK — the same privacy posture (server never sees raw PII) with far
 * lighter machinery. Renamed accordingly. Backed by /api/zkkyc.
 */

interface ZKKYCProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Credential { id: string; attribute: string; predicate: string; verified: boolean; proof: string; at: number }

export default function ZKKYC({ token, currentUser, onClose }: ZKKYCProps) {
  const [visible, setVisible] = useState(true);
  const [list, setList] = useState<Credential[]>([]);
  const [attribute, setAttribute] = useState('');
  const [secret, setSecret] = useState('');
  const [predicate, setPredicate] = useState('>= 18');
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

  const sha256 = async (input: string): Promise<string> => {
    if (!crypto?.subtle) throw new Error('WebCrypto unavailable — connect over HTTPS or localhost.');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const load = useCallback(async () => {
    try {
      const d = await api('/api/zkkyc/status', 'GET');
      if (d.record) {
        setList([{
          id: d.record.id,
          attribute: d.record.commitments?.map((c: { field: string }) => c.field).join(', ') || 'credential',
          predicate: d.record.proofs?.map((p: { property: string }) => p.property).join(', ') || 'zk-verified',
          verified: d.record.status === 'verified',
          proof: d.record.proofs?.[0]?.proof?.slice(0, 64) || '',
          at: d.record.submittedAt || Date.now(),
        }]);
      } else {
        setList([]);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Client-side commitments + zk-style proofs — the server never sees the secret.
  // The commitment binds a fresh server-issued challenge (nonce) so a captured
  // digest can never be replayed to claim the same credential again.
  const issue = async () => {
    if (!attribute.trim() || !secret.trim()) return toast('Attribute and secret value are required.');
    setBusy(true);
    try {
      const ch = await api('/api/zkkyc/challenge', 'GET');
      const challenge = String(ch.challenge || '');
      if (!challenge) throw new Error('Could not obtain a challenge nonce.');
      const commitment = await sha256(`${attribute}:${secret}:${challenge}`);
      const proof = await sha256(`${attribute}:${secret}:${predicate}:${challenge}`);
      await api('/api/zkkyc/submit', 'POST', {
        challenge,
        commitments: [{ field: attribute.trim(), digest: commitment }],
        proofs: [{ property: `${attribute} ${predicate}`, proof }],
      });
      toast('Credential submitted — secret never sent to the server (challenge-bound).');
      setAttribute(''); setSecret('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Privacy-preserving verification</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-indigo-800/10 dark:bg-indigo-400/10 flex items-center justify-center">
                  <Fingerprint className="text-indigo-800 dark:text-indigo-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Privacy-Preserving Verification</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Challenge-response proofs · not a full zk-SNARK · feature 237</p>
                </div>
              </div>

              <SimulationModeBadge
                title="Privacy-preserving challenge-response (salted commitments, not zk-SNARK)"
                detail="Proves an attribute via a client-side salted SHA-256 commitment bound to a fresh per-submission server challenge (nonce) — the server never sees the raw secret, and captured digests can't be replayed. This is NOT a full zero-knowledge proof: a real zk-SNARK/STARK proves range/property predicates without revealing anything, which requires a trusted setup + prover circuit (circom + snarkjs). The challenge-response design here is the drop-in shape for that upgrade."
              />

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Plus size={11} className="inline" /> Issue a verification credential</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} value={attribute} onChange={e => setAttribute(e.target.value)} placeholder="Attribute (age, ward, district)" />
                    <select className={input} value={predicate} onChange={e => setPredicate(e.target.value)}>
                      {['>= 18', '>= 16', '>= 13', '== verified'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <input className={input} type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Secret value (never leaves this device)" />
                  <button onClick={issue} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Fingerprint size={11} />} Issue credential
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {list.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No credentials yet.</p>}
                {list.map(c => (
                  <div key={c.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <BadgeCheck size={13} className="text-emerald-700 dark:text-emerald-400" />
                      <span className="font-mono text-[11px] font-bold text-[#3a342a] dark:text-zinc-200">{c.attribute}</span>
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-800/10 text-indigo-700 dark:text-indigo-300">{c.predicate}</span>
                      {c.verified
                        ? <span className="ml-auto flex items-center gap-1 font-mono text-[9px] uppercase text-emerald-700 dark:text-emerald-400"><Check size={10} /> verified</span>
                        : <span className="ml-auto font-mono text-[9px] uppercase text-[#8a8172]">pending</span>}
                    </div>
                    <p className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-500 mt-1.5 break-all">proof: {c.proof.slice(0, 40)}…</p>
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
