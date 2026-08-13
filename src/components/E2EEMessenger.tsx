import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Lock, KeyRound, Send, X, ShieldCheck, Users, MessageSquareLock, Fingerprint,
  RefreshCw, AlertTriangle, CheckCircle2, Copy, Unlock, Server,
} from 'lucide-react';

/**
 * Ocean — End-to-End Encrypted Messenger  [FEATURE 132]
 * -----------------------------------------------------
 * E2E-encrypted direct messages. All cryptography runs client-side with Web Crypto
 * (window.crypto.subtle) — the server only ever stores opaque ciphertext and PUBLIC
 * keys. The private key is generated in this tab and never leaves it.
 *
 * Crypto flow:
 *  1. Key exchange — generate RSA-OAEP-2048 keypair (SHA-256); export the PUBLIC
 *     key as PEM (spki) and publish it via POST /api/e2ee/keys. A SHA-256
 *     fingerprint binds the identity. The private key stays in memory only.
 *  2. Send — per-message AES-256-GCM session key encrypts the plaintext; the
 *     session key is RSA-OAEP-wrapped with the peer's public key (wrappedKey), and
 *     also wrapped with my own public key (wrappedKeyForSender) so I can re-read my
 *     sent messages. Only ciphertext + iv + wrapped keys reach the server.
 *  3. Receive — fetch messages, RSA-OAEP-unwrap the session key with my private
 *     key, then AES-GCM-decrypt locally. Nothing decryptable is ever stored.
 */

interface E2EEMessengerProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface KeyContact {
  userId: string;
  name: string;
  fingerprint: string;
}

interface E2EEMessage {
  id: string;
  fromId: string;
  toId: string;
  ciphertext: string;
  iv: string;
  wrappedKey: string;
  wrappedKeyForSender: string | null;
  fromPublicKeyFingerprint: string;
  createdAt: number;
  read: boolean;
}

interface MessageRow {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  createdAt: number;
  read: boolean;
  fingerprint: string;
  status: 'decrypted' | 'locked';
  self: boolean;
}

// ---------------------------------------------------------------------------
// Web Crypto helpers (all client-side)
// ---------------------------------------------------------------------------

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToPem(buf: ArrayBuffer): string {
  const b64 = bufToB64(buf);
  const lines = b64.match(/.{1,64}/g)?.join('\n') || b64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

async function sha256Hex(str: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateRsaKeys(): Promise<{ publicPem: string; privateKey: CryptoKey; publicKey: CryptoKey }> {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, // extractable so the PUBLIC key can be exported; the private key is never exported or sent
    ['encrypt', 'decrypt'],
  );
  const spki = await crypto.subtle.exportKey('spki', kp.publicKey);
  return { publicPem: arrayBufferToPem(spki), privateKey: kp.privateKey, publicKey: kp.publicKey };
}

async function importPeerKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', pemToArrayBuffer(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

async function unwrapAesKey(wrappedB64: string, privKey: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, b64ToBuf(wrappedB64));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt', 'encrypt']);
}

async function decryptAes(aesKey: CryptoKey, ivB64: string, cipherB64: string): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(ivB64) }, aesKey, b64ToBuf(cipherB64));
  return new TextDecoder().decode(plain);
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Local child components (rendered inside .map() — key added to props type)
// ---------------------------------------------------------------------------

function ContactRow({
  c, active, onSelect, onCopy,
}: {
  c: KeyContact;
  active: boolean;
  onSelect: () => void;
  onCopy: (t: string) => void;
  key?: string | number;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all ${
        active
          ? 'border-[#3a342a] bg-[#3a342a]/5'
          : 'border-[#ebdcca]/70 bg-white/50 dark:bg-zinc-800/50 hover:border-[#cfcac0]'
      }`}
    >
      <span className="w-8 h-8 rounded-full bg-[#3a342a]/10 flex items-center justify-center shrink-0">
        <Users size={13} className="text-[#3a342a]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</span>
        <span className="block font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 truncate">
          {c.fingerprint}
        </span>
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onCopy(c.fingerprint); }}
        className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center gap-1"
        title="Copy fingerprint"
      >
        <Copy size={9} /> key
      </button>
    </button>
  );
}

function MessageRowView({
  m, meName, peerName,
}: {
  m: MessageRow;
  meName: string;
  peerName: string;
  key?: string | number;
}) {
  const isSelf = m.self;
  const who = isSelf ? meName || 'You' : peerName || 'Peer';
  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[82%] rounded-2xl px-3 py-2 border ${
        isSelf
          ? 'bg-[#3a342a] text-[#f4f1ea] border-[#3a342a]'
          : 'bg-white/70 dark:bg-zinc-800 border-[#ebdcca] dark:border-zinc-700'
      }`}>
        {m.status === 'decrypted' ? (
          <p className="text-xs whitespace-pre-wrap break-words">{m.text}</p>
        ) : (
          <p className="text-xs flex items-center gap-1.5 text-[#8a8172] dark:text-zinc-400">
            <Lock size={11} /> Encrypted — private key needed
          </p>
        )}
        <div className={`mt-1 flex items-center gap-2 font-mono text-[8px] uppercase tracking-wider ${isSelf ? 'text-[#f4f1ea]/70' : 'text-[#8a8172]'}`}>
          <span>{who}</span>
          <span>{m.fingerprint.slice(0, 8)}</span>
          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {m.read && (
            <span className="flex items-center gap-0.5">
              <CheckCircle2 size={9} /> read
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function E2EEMessenger({ token, currentUser, onClose }: E2EEMessengerProps) {
  const subtleOk = typeof window !== 'undefined' && !!window.crypto && !!window.crypto.subtle;

  const [hasKey, setHasKey] = useState(false);
  const [myPem, setMyPem] = useState('');
  const [myFingerprint, setMyFingerprint] = useState('');
  const [myPubKey, setMyPubKey] = useState<CryptoKey | null>(null);
  const [myPrivKey, setMyPrivKey] = useState<CryptoKey | null>(null);
  const [keysBusy, setKeysBusy] = useState(false);
  const [armRegen, setArmRegen] = useState(false);

  const [contacts, setContacts] = useState<KeyContact[]>([]);
  const [peerId, setPeerId] = useState('');
  const [peerName, setPeerName] = useState('');
  const [peerPubKey, setPeerPubKey] = useState<CryptoKey | null>(null);
  const [peerFingerprint, setPeerFingerprint] = useState('');

  const [rows, setRows] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [compose, setCompose] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [error, setError] = useState('');

  // Per-message AES session keys held in memory for THIS session (never persisted).
  const sessionKeys = useRef<Map<string, CryptoKey>>(new Map());

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/api/e2ee/status', 'GET');
      setHasKey(!!data.hasKey);
      setContacts(data.contactsWithKeys || []);
    } catch (e) {
      /* ignore — first mount may race with auth restore */
    }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard?.writeText(t);
      toast('Copied to clipboard.');
    } catch {
      toast('Copy failed.', 'destructive');
    }
  };

  const genKeys = async () => {
    if (!subtleOk) return toast('Web Crypto is unavailable in this browser.', 'destructive');
    setKeysBusy(true);
    try {
      const { publicPem, privateKey, publicKey } = await generateRsaKeys();
      const fp = (await sha256Hex(publicPem)).slice(0, 12);
      const data = await api('/api/e2ee/keys', 'POST', { publicKeyPem: publicPem });
      setMyPubKey(publicKey);
      setMyPrivKey(privateKey);
      setMyPem(publicPem);
      setMyFingerprint(data.fingerprint || fp);
      setHasKey(true);
      setArmRegen(false);
      toast('E2EE keypair generated and public key published.');
      loadStatus();
    } catch (e: any) {
      toast(e.message || 'Key generation failed.', 'destructive');
    } finally {
      setKeysBusy(false);
    }
  };

  const selectPeer = async (c: KeyContact) => {
    if (!token) return;
    setPeerId(c.userId);
    setPeerName(c.name);
    setPeerFingerprint(c.fingerprint);
    setPeerPubKey(null);
    setRows([]);
    try {
      const data = await api(`/api/e2ee/keys/${c.userId}`, 'GET');
      const pub = await importPeerKey(data.publicKeyPem);
      setPeerPubKey(pub);
      setPeerFingerprint(data.fingerprint || c.fingerprint);
      loadMessages(c.userId);
    } catch (e: any) {
      toast(e.message || 'Failed to load peer key.', 'destructive');
    }
  };

  const loadMessages = useCallback(async (withId: string) => {
    if (!token || !currentUser) return;
    setLoadingMsgs(true);
    setError('');
    try {
      const data = await api(`/api/e2ee/messages?with=${encodeURIComponent(withId)}`, 'GET');
      const msgs: E2EEMessage[] = data.messages || [];
      const out: MessageRow[] = [];
      for (const m of msgs) {
        const self = m.fromId === currentUser.id;
        let text = '';
        let status: 'decrypted' | 'locked' = 'locked';
        try {
          let aesKey = sessionKeys.current.get(m.id) || null;
          if (!aesKey && myPrivKey) {
            const wrapped = self ? m.wrappedKeyForSender || m.wrappedKey : m.wrappedKey;
            if (wrapped) aesKey = await unwrapAesKey(wrapped, myPrivKey);
          }
          if (aesKey) {
            text = await decryptAes(aesKey, m.iv, m.ciphertext);
            sessionKeys.current.set(m.id, aesKey);
            status = 'decrypted';
          }
        } catch {
          status = 'locked';
        }
        out.push({
          id: m.id,
          fromId: m.fromId,
          toId: m.toId,
          text,
          createdAt: m.createdAt,
          read: m.read,
          fingerprint: m.fromPublicKeyFingerprint || 'unknown',
          status,
          self,
        });
        // Mark incoming messages read after successful local decryption.
        if (!self && m.toId === currentUser.id && !m.read && status === 'decrypted') {
          api(`/api/e2ee/messages/${m.id}/read`, 'POST', {}).catch(() => {});
        }
      }
      setRows(out);
    } catch (e: any) {
      setError(e.message || 'Failed to load encrypted messages.');
    } finally {
      setLoadingMsgs(false);
    }
  }, [token, currentUser, myPrivKey]);

  useEffect(() => {
    if (peerId) loadMessages(peerId);
  }, [peerId, myPrivKey]);

  const sendMessage = async () => {
    const text = compose.trim();
    if (!text) return;
    if (!peerId || !peerPubKey) return toast('Select a contact with a published key first.', 'destructive');
    if (!currentUser) return toast('Sign in required.', 'destructive');
    if (!myPubKey) return toast('Generate your E2EE keypair first.', 'destructive');
    setSendBusy(true);
    try {
      // 1. Generate a fresh AES-256-GCM session key for this message.
      const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      // 2. Encrypt the plaintext with AES-GCM.
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        aesKey,
        new TextEncoder().encode(text) as BufferSource,
      );
      // 3. Wrap the session key for the recipient (RSA-OAEP) and for myself.
      const rawAes = await crypto.subtle.exportKey('raw', aesKey);
      const wrappedForPeer = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, peerPubKey, rawAes as BufferSource);
      const wrappedForSender = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, myPubKey, rawAes as BufferSource);
      // 4. Only ciphertext + iv + wrapped keys leave the device.
      const data = await api('/api/e2ee/messages', 'POST', {
        toUserId: peerId,
        ciphertext: bufToB64(cipher),
        iv: bufToB64(iv),
        wrappedKey: bufToB64(wrappedForPeer),
        wrappedKeyForSender: bufToB64(wrappedForSender),
        fromPublicKeyFingerprint: myFingerprint,
      });
      sessionKeys.current.set(data.message.id, aesKey);
      setCompose('');
      toast('Encrypted message sent.');
      loadMessages(peerId);
    } catch (e: any) {
      toast(e.message || 'Send failed.', 'destructive');
    } finally {
      setSendBusy(false);
    }
  };

  const regenButton = () => {
    if (hasKey && !armRegen) {
      setArmRegen(true);
      setTimeout(() => setArmRegen(false), 4000);
      return;
    }
    genKeys();
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        {!subtleOk && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              <b>Web Crypto unavailable.</b> This browser does not expose <code>window.crypto.subtle</code>, which
              End-to-End Encryption requires. Encryption is disabled here.
            </span>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-sm"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-[#3a342a]/10 flex items-center justify-center">
                <Lock className="text-[#3a342a]" size={18} />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">E2EE Messenger</h2>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                  End-to-end encrypted direct messages
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 text-[#8a8172] hover:text-[#3a342a] flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed flex items-start gap-1.5">
            <Server size={13} className="mt-0.5 shrink-0 text-[#8a8172]" />
            <span>
              Messages are encrypted <b>on your device</b> with Web Crypto (AES-256-GCM + RSA-OAEP). The server only
              stores opaque ciphertext and <b>public</b> keys — it can never read your messages, even with a full
              database dump. Your private key never leaves this tab.
            </span>
          </p>

          {/* My key panel */}
          <div className="border border-[#ebdcca]/70 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1.5">
                <KeyRound size={12} /> My key
              </span>
              <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${
                hasKey ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}>
                {hasKey ? 'published' : 'not published'}
              </span>
            </div>

            {myFingerprint ? (
              <div className="flex items-center gap-2 text-xs">
                <Fingerprint size={13} className="text-[#8a8172]" />
                <span className="font-mono text-[#3a342a] dark:text-zinc-200">{myFingerprint}</span>
                <button onClick={() => copyText(myFingerprint)} className="text-[#8a8172] hover:text-[#3a342a]">
                  <Copy size={12} />
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#8a8172] dark:text-zinc-400">
                Generate an RSA-OAEP 2048 keypair and publish your public key to start encrypting.
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={regenButton}
                disabled={keysBusy || !subtleOk}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
              >
                <RefreshCw size={12} className={keysBusy ? 'animate-spin' : ''} />
                {armRegen ? 'Click again to confirm' : hasKey ? 'Regenerate keypair' : 'Generate keypair'}
              </button>
              {armRegen && (
                <span className="font-mono text-[8px] uppercase text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={10} /> Old messages stay encrypted to the old key
                </span>
              )}
            </div>
            <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
              Private key is memory-only — closing this view regenerates it next time.
            </p>
          </div>

          {/* Contacts panel */}
          <div className="border border-[#ebdcca]/70 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-[#5c5446]" />
              <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                Contacts with keys
              </span>
              <span className="font-mono text-[8px] uppercase text-[#8a8172]">({contacts.length})</span>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-[#8a8172] dark:text-zinc-500">
                No contacts have published E2EE keys yet. Ask a friend to open this panel and publish their key.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {contacts.map((c) => (
                  <ContactRow
                    key={c.userId}
                    c={c}
                    active={peerId === c.userId}
                    onSelect={() => selectPeer(c)}
                    onCopy={(t) => copyText(t)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Conversation panel */}
          <div className="border border-[#ebdcca]/70 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <MessageSquareLock size={12} className="text-[#5c5446]" />
                <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                  {peerId ? `Conversation with ${peerName}` : 'Conversation'}
                </span>
              </div>
              {peerFingerprint && (
                <span className="font-mono text-[8px] uppercase text-[#8a8172] flex items-center gap-1">
                  <Fingerprint size={10} /> {peerFingerprint.slice(0, 12)}
                </span>
              )}
            </div>

            {!peerId ? (
              <div className="py-6 text-center space-y-1.5">
                <ShieldCheck className="mx-auto text-[#8a8172]" size={22} />
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                  Select a contact above to open an encrypted thread
                </p>
              </div>
            ) : loadingMsgs ? (
              <div className="py-8 text-center font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                Decrypting…
              </div>
            ) : error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : rows.length === 0 ? (
              <div className="py-6 text-center space-y-1.5">
                <Unlock className="mx-auto text-[#8a8172]" size={20} />
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                  No messages yet — say something encrypted
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {rows.map((m) => (
                  <MessageRowView
                    key={m.id}
                    m={m}
                    meName={currentUser?.name || 'You'}
                    peerName={peerName}
                  />
                ))}
              </div>
            )}

            {peerId && (
              <div className="flex gap-2 pt-1 border-t border-[#ebdcca]/60 dark:border-zinc-800">
                <textarea
                  value={compose}
                  onChange={(e) => setCompose(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  rows={2}
                  placeholder={peerPubKey ? `Encrypt a message for ${peerName}…` : 'Peer key not loaded…'}
                  disabled={!peerPubKey || !myPubKey}
                  className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={sendBusy || !peerPubKey || !myPubKey || !compose.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                >
                  <Send size={12} /> Send
                </button>
              </div>
            )}
          </div>

          <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] text-center flex items-center justify-center gap-1">
            <ShieldCheck size={10} /> Server never sees plaintext or private keys
          </p>
        </motion.div>
      </div>
    </div>
  );
}
