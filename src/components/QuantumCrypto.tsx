import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, KeyRound, Send, ShieldCheck, Loader2, Atom, Lock, Eye } from 'lucide-react';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import SimulationModeBadge from './SimulationModeBadge';

/**
 * Ocean — Quantum-Resistant Cryptography (Feature 240)
 * ------------------------------------------------------
 * Hybrid KEM channel: REAL X25519 (Curve25519) ECDH + a SIMULATED ML-KEM-768
 * (Kyber) key encapsulation, combined through HKDF-SHA256 into an AES-GCM key.
 *
 * The X25519 leg is genuine post-quantum-vulnerable crypto (it protects
 * against today's attackers). The Kyber-768 leg is a faithful *shape*
 * simulation — real post-quantum security requires liboqs / kyber-js
 * (WebAssembly); the KEM API surface here (keygen → encaps → decaps) matches
 * the real one 1:1 so the swap is drop-in. Private keys never leave the device.
 *
 * Backed by /api/pq (server relays ciphertext only).
 */

interface QuantumCryptoProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface PQMsg { id: string; fromId: string; toId: string; ct: string; nonce: string; at: number; read: boolean }

// ---------------------------------------------------------------------------
// KEM placeholder for CRYSTALS-Kyber-768 (ML-KEM-768)
// ---------------------------------------------------------------------------
// A FAITHFUL KEM SHAPE implemented with RSA-OAEP: encaps picks a random seed,
// seals it under the recipient's public key, and derives the shared secret
// from the seed; only the holder of the private key can recover the seed.
// This is NOT post-quantum — RSA is used purely so the hybrid envelope
// (X25519 ECDH + KEM + HKDF) exercises a real encapsulation contract where
// the ciphertext is not derivable from public data. Swap this module for
// liboqs / kyber-js (WebAssembly ML-KEM-768) in production; the API surface
// (keygen → encaps → decaps) matches 1:1.
const KEM_SEED_LEN = 32;

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(b64Str: string): Uint8Array {
  const s = atob(b64Str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function hkdf(ikm: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  return nobleHkdf(nobleSha256, ikm, new Uint8Array(0), info, len);
}

function pemEncode(label: string, der: ArrayBuffer): string {
  const b64body = btoa(String.fromCharCode(...new Uint8Array(der)));
  const lines = b64body.match(/.{1,64}/g)?.join('\n') || b64body;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function pemDecode(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer as ArrayBuffer;
}

async function kemKeygen(): Promise<{ publicPem: string; privatePem: string }> {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );
  const pub = await crypto.subtle.exportKey('spki', kp.publicKey);
  const priv = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
  return { publicPem: pemEncode('PUBLIC KEY', pub), privatePem: pemEncode('PRIVATE KEY', priv) };
}

/** KEM encaps: random seed → shared secret; seed sealed under the public key. */
async function kemEncaps(pubPem: string): Promise<{ ct: Uint8Array; sharedSecret: Uint8Array }> {
  const pub = await crypto.subtle.importKey('spki', pemDecode(pubPem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const seed = randomBytes(KEM_SEED_LEN);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, seed as unknown as ArrayBuffer));
  const sharedSecret = hkdf(seed, new TextEncoder().encode('ocean-kem-ss-v1'), KEM_SEED_LEN);
  return { ct, sharedSecret };
}

/** KEM decaps: only the private-key holder can recover the seed from ct. */
async function kemDecaps(privPem: string, ct: Uint8Array): Promise<Uint8Array> {
  const priv = await crypto.subtle.importKey('pkcs8', pemDecode(privPem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  const seed = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, ct as unknown as ArrayBuffer));
  return hkdf(seed, new TextEncoder().encode('ocean-kem-ss-v1'), KEM_SEED_LEN);
}

// ---------------------------------------------------------------------------
// Hybrid envelope: X25519 + Kyber(sim) -> HKDF -> AES-GCM
// ---------------------------------------------------------------------------

async function aesGcmEncrypt(key: Uint8Array, plaintext: string): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = randomBytes(12);
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(plaintext));
  return { iv, ct: new Uint8Array(enc) };
}

async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<string> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct as unknown as ArrayBuffer);
  return new TextDecoder().decode(dec);
}

interface HybridKeys {
  xPriv: Uint8Array;
  xPub: Uint8Array;
  kyberPub: string;   // PEM (RSA-OAEP KEM placeholder for ML-KEM-768)
  kyberSec: string;   // PEM private half — never leaves the device
}

const KEYS_KEY = 'ocean_pq_keys_v3';
const HYBRID_PREFIX = 'HYBRID:x25519:';

function encodePublic(k: HybridKeys): string {
  return `${HYBRID_PREFIX}${b64(k.xPub)}:kyber:${b64(new TextEncoder().encode(k.kyberPub))}`;
}

function parsePublic(encoded: string): { xPub: Uint8Array; kyberPub: string } {
  const parts = encoded.split(':');
  // HYBRID:x25519:<b64>:kyber:<PEM>  (PEM bodies contain no colons)
  const xB64 = parts[2];
  const pem = parts.slice(4).join(':');
  if (!xB64 || !pem) throw new Error('Unsupported key format.');
  return { xPub: unb64(xB64), kyberPub: pem };
}

function persistKeys(k: HybridKeys) {
  localStorage.setItem(KEYS_KEY, JSON.stringify({
    xPriv: b64(k.xPriv), xPub: b64(k.xPub), kyberPub: k.kyberPub, kyberSec: k.kyberSec,
  }));
}

function loadKeys(): HybridKeys | null {
  try {
    const raw = localStorage.getItem(KEYS_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { xPriv: unb64(d.xPriv), xPub: unb64(d.xPub), kyberPub: d.kyberPub, kyberSec: d.kyberSec };
  } catch {
    return null;
  }
}

async function generateHybridKeys(): Promise<HybridKeys> {
  const xPriv = randomBytes(32);
  const xPub = x25519.getPublicKey(xPriv);
  const kem = await kemKeygen();
  return { xPriv, xPub, kyberPub: kem.publicPem, kyberSec: kem.privatePem };
}

/** Encrypt a message to a recipient's encoded public key. Returns the v2 blob. */
async function hybridEncrypt(my: HybridKeys, theirPublic: string, plaintext: string): Promise<string> {
  const { xPub: theirXPub, kyberPub: theirKyberPub } = parsePublic(theirPublic);
  const xSS = x25519.getSharedSecret(my.xPriv, theirXPub);
  const { ct: kyberCt, sharedSecret: kyberSS } = await kemEncaps(theirKyberPub);
  const hybridKey = hkdf(concatBytes(xSS, kyberSS), new TextEncoder().encode('ocean-hybrid-kem-v1'), 32);
  const { iv, ct } = await aesGcmEncrypt(hybridKey, plaintext);
  // v2:<senderXPub>:<kyberCt>:<iv>:<aesCt>
  return `v2:${b64(my.xPub)}:${b64(kyberCt)}:${b64(iv)}:${b64(ct)}`;
}

/** Decrypt a v2 blob received from `fromXPubOwner` — returns plaintext or throws. */
async function hybridDecrypt(my: HybridKeys, blob: string): Promise<string> {
  const parts = blob.split(':');
  if (parts[0] !== 'v2' || parts.length !== 5) throw new Error('Unsupported envelope version.');
  const fromXPub = unb64(parts[1]);
  const kyberCt = unb64(parts[2]);
  const iv = unb64(parts[3]);
  const ct = unb64(parts[4]);
  const xSS = x25519.getSharedSecret(my.xPriv, fromXPub);
  const kyberSS = await kemDecaps(my.kyberSec, kyberCt);
  const hybridKey = hkdf(concatBytes(xSS, kyberSS), new TextEncoder().encode('ocean-hybrid-kem-v1'), 32);
  return aesGcmDecrypt(hybridKey, iv, ct);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuantumCrypto({ token, currentUser, onClose }: QuantumCryptoProps) {
  const [visible, setVisible] = useState(true);
  const [messages, setMessages] = useState<PQMsg[]>([]);
  const [registered, setRegistered] = useState(false);
  const [toUserId, setToUserId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});

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
      const [k, m] = await Promise.all([api('/api/pq/keys', 'GET'), api('/api/pq/messages', 'GET')]);
      setRegistered((k.keys || []).length > 0);
      setMessages(m.messages || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    setBusy(true);
    try {
      if (!crypto?.subtle) throw new Error('WebCrypto unavailable — connect over HTTPS or localhost.');
      let keys = loadKeys();
      if (!keys) {
        keys = await generateHybridKeys();
        persistKeys(keys);
      }
      await api('/api/pq/keys', 'POST', { kyberPublicKey: encodePublic(keys) });
      toast('Hybrid key registered — X25519 (real) + KEM (RSA-shape placeholder for ML-KEM-768, swap for kyber-js).');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const send = async () => {
    if (!toUserId.trim() || !text.trim()) return toast('Recipient and message are required.');
    setBusy(true);
    try {
      const keys = loadKeys();
      if (!keys) throw new Error('Register your key first.');
      const ex = await api('/api/pq/exchange', 'POST', { toUserId });
      const blob = await hybridEncrypt(keys, ex.publicKey as string, text.trim());
      await api('/api/pq/messages', 'POST', { toUserId, ct: blob, nonce: `n-${Date.now()}` });
      toast('Relayed under the hybrid KEM envelope — X25519 ECDH + Kyber KEM, AES-GCM sealed.');
      setText('');
      await load();
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const reveal = async (m: PQMsg) => {
    if (decrypted[m.id]) return;
    try {
      const keys = loadKeys();
      if (!keys) throw new Error('No keys on this device.');
      const plain = await hybridDecrypt(keys, m.ct);
      setDecrypted((d) => ({ ...d, [m.id]: plain }));
    } catch (e: any) { toast('Decrypt failed: ' + e.message, 'destructive'); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Quantum-resistant crypto</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-violet-800/10 dark:bg-violet-400/10 flex items-center justify-center">
                  <Atom className="text-violet-800 dark:text-violet-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Hybrid PQ Channel</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">X25519 + Kyber-768(sim) · feature 240</p>
                </div>
                {registered
                  ? <span className="flex items-center gap-1 font-mono text-[9px] uppercase text-emerald-700 dark:text-emerald-400"><ShieldCheck size={11} /> hybrid key active</span>
                  : <button onClick={register} disabled={busy} className={btnPrimary}><KeyRound size={11} /> {busy ? <Loader2 size={11} className="animate-spin" /> : 'Generate hybrid key'}</button>}
              </div>

              <SimulationModeBadge
                title="Kyber-768 leg is simulated (RSA-OAEP stand-in)"
                detail="The X25519 ECDH leg is real cryptography, but the ML-KEM-768 (Kyber) encapsulation is a faithful API-shaped placeholder implemented with RSA-OAEP — RSA is NOT post-quantum. True quantum resistance requires liboqs / kyber-js (WebAssembly) or a hardware PQC module; the KEM surface here (keygen → encaps → decaps) matches those drop-in so the swap is in-place."
              />

              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                Real X25519 ECDH + a faithful KEM placeholder (RSA-OAEP seed-encapsulation standing in for ML-KEM-768 — swap in liboqs/kyber-js for true post-quantum security; same API), combined via HKDF-SHA256 into an AES-GCM seal. Private keys never leave this device.
              </p>

              {registered && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Send size={11} className="inline" /> Send hybrid-encrypted message</div>
                  <input className={input} value={toUserId} onChange={e => setToUserId(e.target.value)} placeholder="Recipient user ID" />
                  <textarea className={`${input} min-h-[60px] resize-none`} value={text} onChange={e => setText(e.target.value)} placeholder="Message (AES-GCM under the hybrid X25519+Kyber shared secret)" />
                  <button onClick={send} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />} Encrypt & relay
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {messages.length === 0 && <p className="text-center text-[10px] text-[#8a8172] dark:text-zinc-500 py-4">No PQ messages yet.</p>}
                {messages.map(m => (
                  <div key={m.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={12} className="text-violet-700 dark:text-violet-400" />
                      <span className="font-mono text-[9px] uppercase text-[#8a8172] dark:text-zinc-500">from {m.fromId.slice(0, 8)}… · {new Date(m.at).toLocaleTimeString()}</span>
                      {!decrypted[m.id] && (
                        <button onClick={() => reveal(m)} className="ml-auto flex items-center gap-1 text-[9px] font-mono uppercase text-violet-700 dark:text-violet-300 hover:underline">
                          <Eye size={10} /> decrypt on device
                        </button>
                      )}
                    </div>
                    {decrypted[m.id]
                      ? <p className="text-xs text-[#3a342a] dark:text-zinc-200 mt-1.5">{decrypted[m.id]}</p>
                      : <p className="font-mono text-[9px] text-[#3a342a] dark:text-zinc-300 mt-1 break-all line-clamp-2">{m.ct.slice(0, 90)}…</p>}
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
