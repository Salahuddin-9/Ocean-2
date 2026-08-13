import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Hash, Fingerprint, KeyRound, Download, Upload, FileJson, Copy,
  CheckCircle2, XCircle, Users, Search, AlertTriangle, RefreshCw, ShieldCheck,
} from 'lucide-react';

/**
 * Ocean — De-centralized Profiles (FEATURE 136)
 * ----------------------------------------------
 * W3C-style DIDs (did:ocean:…) with portable identity. Backed by
 * src/turtleDecentralizedProfilesBackend.ts (/api/did/*).
 *
 *   - My DID tab: create a DID (returns a one-time Ed25519 private key — shown
 *     with a prominent warning), view my public identity, and export a portable
 *     profile bundle (JSON + copy).
 *   - Registry tab: browse all public identities and resolve each DID to its
 *     public profile document.
 *   - Import / Verify tab: paste a portable bundle to import it, and verify an
 *     Ed25519 signature against a DID's public key.
 *
 * Every mutating call goes through the canonical api() helper (relative fetch,
 * Authorization: Bearer token — same pattern as EmergencyView.tsx).
 */

interface DIDIdentity {
  did: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  publicKeyPem: string;
  createdAt?: number;
}

interface DIDRegistryEntry {
  did: string;
  username: string;
  displayName: string;
  publicKeyPem: string;
}

interface PortableProfileBundle {
  did: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  publicKeyPem: string;
  exportedAt: number;
}

interface DecentralizedProfilesProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

type Tab = 'mine' | 'registry' | 'import';
type CopyTarget = '' | 'did' | 'priv' | 'bundle';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500 mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

function RegistryCard({
  entry,
  resolved,
  resolving,
  onResolve,
  key,
}: {
  entry: DIDRegistryEntry;
  resolved: DIDIdentity | null | undefined;
  resolving: boolean;
  onResolve: () => void;
  key?: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-700 p-4 space-y-2 bg-white/60 dark:bg-zinc-800/60">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">
            {entry.displayName || entry.username}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
            @{entry.username}
          </p>
        </div>
        <button
          onClick={onResolve}
          disabled={resolving}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
        >
          <Search size={11} />
          {resolving ? 'Resolving…' : 'Resolve'}
        </button>
      </div>
      <code className="block rounded-lg bg-white dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 px-3 py-2 text-[10px] font-mono text-[#3a342a] dark:text-zinc-100 break-all">
        {entry.did}
      </code>
      {resolved && (
        <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-3 space-y-1.5 bg-[#fcfaf4] dark:bg-zinc-900">
          <p className="text-[9px] font-mono uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={10} /> Resolved document
          </p>
          <p className="text-xs text-[#3a342a] dark:text-zinc-100">
            Display name: <b>{resolved.displayName || '—'}</b>
          </p>
          <p className="text-xs text-[#3a342a] dark:text-zinc-100">
            Username: <b>@{resolved.username}</b>
          </p>
          <code className="block rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-2 py-1.5 text-[9px] font-mono text-[#8a8172] break-all max-h-24 overflow-y-auto">
            {resolved.publicKeyPem}
          </code>
        </div>
      )}
      {resolved === null && (
        <p className="text-[9px] font-mono uppercase tracking-wider text-rose-600 flex items-center gap-1">
          <XCircle size={10} /> DID not found or resolve failed
        </p>
      )}
    </div>
  );
}

export default function DecentralizedProfiles({ token, currentUser, onClose }: DecentralizedProfilesProps) {
  const [tab, setTab] = useState<Tab>('mine');
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<DIDIdentity | null>(null);
  const [privateKeyPem, setPrivateKeyPem] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bundle, setBundle] = useState<PortableProfileBundle | null>(null);
  const [copied, setCopied] = useState<CopyTarget>('');

  // Registry tab
  const [registry, setRegistry] = useState<DIDRegistryEntry[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [resolved, setResolved] = useState<Record<string, DIDIdentity | null | undefined>>({});
  const [resolvingDid, setResolvingDid] = useState<string | null>(null);

  // Import tab
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ status: string; did: string } | null>(null);

  // Verify tab
  const [verifyForm, setVerifyForm] = useState({ did: '', message: '', signature: '' });
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);

  const toast = useCallback((msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  }, []);

  const api = useCallback(
    async (path: string, method = 'GET', body?: any) => {
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
    },
    [token]
  );

  const loadMine = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await api('/api/did/mine', 'GET');
      setIdentity(data.identity || null);
    } catch (e) {
      // 404 — no DID yet. Keep identity null so the create card shows.
      setIdentity(null);
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  const loadRegistry = async () => {
    setRegistryLoading(true);
    try {
      const data = await api('/api/did/registry', 'GET');
      setRegistry(data.identities || []);
    } catch (e: any) {
      toast(e.message || 'Failed to load registry.', 'destructive');
    } finally {
      setRegistryLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'registry') loadRegistry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const createDID = async () => {
    if (!token) return toast('Sign in to create a DID.', 'destructive');
    setCreating(true);
    try {
      const data = await api('/api/did/create', 'POST', {
        displayName: createName.trim() || undefined,
      });
      setIdentity(data.identity || null);
      setPrivateKeyPem(data.privateKeyPem || null);
      toast('DID created. Copy your private key now — it is shown once.');
    } catch (e: any) {
      toast(e.message || 'Failed to create DID.', 'destructive');
    } finally {
      setCreating(false);
    }
  };

  const exportBundle = async () => {
    if (!token) return toast('Sign in to export a bundle.', 'destructive');
    setExporting(true);
    try {
      const data = await api('/api/did/export', 'POST');
      setBundle(data.bundle || null);
      toast('Portable bundle exported.');
    } catch (e: any) {
      toast(e.message || 'Failed to export bundle.', 'destructive');
    } finally {
      setExporting(false);
    }
  };

  const resolveDID = async (entry: DIDRegistryEntry) => {
    setResolvingDid(entry.did);
    try {
      const data = await api(`/api/did/resolve/${encodeURIComponent(entry.did)}`, 'GET');
      setResolved((prev) => ({ ...prev, [entry.did]: data as DIDIdentity }));
    } catch (e: any) {
      setResolved((prev) => ({ ...prev, [entry.did]: null }));
      toast(e.message || 'Failed to resolve DID.', 'destructive');
    } finally {
      setResolvingDid(null);
    }
  };

  const importBundle = async () => {
    if (!token) return toast('Sign in to import a bundle.', 'destructive');
    let parsed: any;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      return toast('Bundle must be valid JSON.', 'destructive');
    }
    setImporting(true);
    try {
      const data = await api('/api/did/import', 'POST', { bundle: parsed.bundle || parsed });
      setImportResult({ status: data.status || 'imported', did: data.did || '' });
      toast(data.status === 'already_imported' ? 'Bundle was already imported.' : 'Bundle imported.');
    } catch (e: any) {
      setImportResult(null);
      toast(e.message || 'Failed to import bundle.', 'destructive');
    } finally {
      setImporting(false);
    }
  };

  const verifySignature = async () => {
    if (!token) return toast('Sign in to verify a signature.', 'destructive');
    if (!verifyForm.did.trim() || !verifyForm.message.trim() || !verifyForm.signature.trim()) {
      return toast('DID, message and signature are all required.', 'destructive');
    }
    setVerifying(true);
    try {
      const data = await api('/api/did/verify', 'POST', {
        did: verifyForm.did.trim(),
        message: verifyForm.message,
        signature: verifyForm.signature.trim(),
      });
      setVerifyResult(!!data.valid);
    } catch (e: any) {
      setVerifyResult(null);
      toast(e.message || 'Verification failed.', 'destructive');
    } finally {
      setVerifying(false);
    }
  };

  const copy = async (text: string, what: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
      toast('Copied to clipboard.');
    } catch (e) {
      toast('Could not copy — copy it manually.');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="decentralized-profiles"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
      >
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#3a342a] text-[#f4f1ea]">
                <Hash size={20} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-[#3a342a] dark:text-zinc-100">
                  De-centralized Profiles
                </h2>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Feature 136 · W3C-style DIDs
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
            >
              <X size={12} /> Close
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {([
              ['mine', 'My DID'],
              ['registry', 'Registry'],
              ['import', 'Import / Verify'],
            ] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
                  tab === k
                    ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                    : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ---------- MY DID TAB ---------- */}
          {tab === 'mine' && (
            <div className="space-y-4">
              {loading ? (
                <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-10 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">
                    Loading your DID…
                  </p>
                </div>
              ) : !identity ? (
                <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#3a342a] text-[#f4f1ea]">
                      <Fingerprint size={13} />
                    </span>
                    <h3 className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 uppercase font-mono tracking-wider">
                      Create your DID
                    </h3>
                  </div>
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                    Generate a W3C-style decentralized identifier (
                    <code className="font-mono">did:ocean:…</code>) backed by an Ed25519 keypair.
                    Your public key is published to the registry; your private key is returned
                    <b> once and never stored</b>.
                  </p>
                  {!token && (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-rose-600">
                      Sign in to create a DID.
                    </p>
                  )}
                  <input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={
                      currentUser?.name
                        ? `Display name (default: ${currentUser.name})`
                        : 'Display name (optional)'
                    }
                    className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={createDID}
                    disabled={creating || !token}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                  >
                    <KeyRound size={11} />
                    {creating ? 'Creating…' : 'Create DID'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Identity */}
                  <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#3a342a] text-[#f4f1ea]">
                        <Hash size={13} />
                      </span>
                      <h3 className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 uppercase font-mono tracking-wider">
                        My decentralized identity
                      </h3>
                      {identity.createdAt ? (
                        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                          created {timeAgo(identity.createdAt)}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <Field label="DID">
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-3 py-2 text-xs font-mono text-[#3a342a] dark:text-zinc-100 break-all">
                            {identity.did}
                          </code>
                          <button
                            onClick={() => copy(identity.did, 'did')}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                          >
                            <Copy size={11} /> {copied === 'did' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </Field>
                      <Field label="Username">
                        <p className="text-sm font-mono text-[#3a342a] dark:text-zinc-100">
                          @{identity.username}
                        </p>
                      </Field>
                      <Field label="Display name">
                        <p className="text-sm text-[#3a342a] dark:text-zinc-100">
                          {identity.displayName}
                        </p>
                      </Field>
                      <Field label="Public key (SPKI PEM)">
                        <code className="block rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-3 py-2 text-[10px] font-mono text-[#3a342a] dark:text-zinc-100 break-all max-h-28 overflow-y-auto">
                          {identity.publicKeyPem}
                        </code>
                      </Field>
                    </div>
                  </div>

                  {/* One-time private key warning */}
                  {privateKeyPem && (
                    <div className="rounded-3xl border border-amber-300/60 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30 p-5 space-y-3">
                      <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle size={11} /> Save your private key now
                      </p>
                      <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                        This is the only time your Ed25519 private key is shown — the server never
                        stores it. Copy it somewhere safe to sign proofs and prove ownership of
                        this DID.
                      </p>
                      <div className="flex items-start gap-2">
                        <code className="flex-1 rounded-lg bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-700/50 px-3 py-2 text-[10px] font-mono text-[#3a342a] dark:text-zinc-100 break-all max-h-32 overflow-y-auto">
                          {privateKeyPem}
                        </code>
                        <button
                          onClick={() => copy(privateKeyPem, 'priv')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                        >
                          <Copy size={11} /> {copied === 'priv' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Export bundle */}
                  <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#3a342a] text-[#f4f1ea]">
                        <FileJson size={13} />
                      </span>
                      <h3 className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 uppercase font-mono tracking-wider">
                        Portable profile bundle
                      </h3>
                    </div>
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                      Export a portable bundle of this profile so you can carry your DID to another
                      app — or re-import it here later via the Import tab.
                    </p>
                    <button
                      onClick={exportBundle}
                      disabled={exporting}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                    >
                      <Download size={11} />
                      {exporting ? 'Exporting…' : 'Export portable bundle'}
                    </button>
                    {bundle && (
                      <div className="flex items-start gap-2">
                        <code className="flex-1 rounded-lg bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 px-3 py-2 text-[10px] font-mono text-[#3a342a] dark:text-zinc-100 break-all max-h-48 overflow-y-auto whitespace-pre-wrap">
                          {JSON.stringify(bundle, null, 2)}
                        </code>
                        <button
                          onClick={() => copy(JSON.stringify(bundle, null, 2), 'bundle')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                        >
                          <Copy size={11} /> {copied === 'bundle' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---------- REGISTRY TAB ---------- */}
          {tab === 'registry' && (
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#3a342a] text-[#f4f1ea]">
                  <Users size={13} />
                </span>
                <h3 className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 uppercase font-mono tracking-wider">
                  DID registry
                </h3>
                <button
                  onClick={loadRegistry}
                  disabled={registryLoading}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
              <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                Every public identity on Ocean. Resolve any DID to its public profile document —
                no sign-in needed.
              </p>
              {registryLoading ? (
                <p className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">
                  Loading registry…
                </p>
              ) : registry.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#8a8172]">
                  No DIDs registered yet. Create one on the My DID tab.
                </p>
              ) : (
                <div className="space-y-3">
                  {registry.map((entry) => (
                    <RegistryCard
                      key={entry.did}
                      entry={entry}
                      resolved={resolved[entry.did]}
                      resolving={resolvingDid === entry.did}
                      onResolve={() => resolveDID(entry)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------- IMPORT / VERIFY TAB ---------- */}
          {tab === 'import' && (
            <div className="space-y-4">
              {/* Import */}
              <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#3a342a] text-[#f4f1ea]">
                    <Upload size={13} />
                  </span>
                  <h3 className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 uppercase font-mono tracking-wider">
                    Import a portable bundle
                  </h3>
                </div>
                <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                  Paste a portable profile bundle JSON exported from any Ocean app to record this
                  DID on your account. It must contain a valid{' '}
                  <code className="font-mono">did</code>, a non-empty{' '}
                  <code className="font-mono">username</code> and a{' '}
                  <code className="font-mono">publicKeyPem</code>.
                </p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{ "did": "did:ocean:…", "username": "alice", "displayName": "Alice", "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n…" }'
                  rows={5}
                  className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
                />
                <button
                  onClick={importBundle}
                  disabled={importing || !token}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                >
                  <Upload size={11} />
                  {importing ? 'Importing…' : 'Import bundle'}
                </button>
                {!token && (
                  <p className="text-[10px] font-mono uppercase tracking-wider text-rose-600">
                    Sign in to import a bundle.
                  </p>
                )}
                {importResult && (
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={12} />
                    {importResult.status === 'already_imported' ? 'Already imported: ' : 'Imported: '}
                    <code className="font-mono">{importResult.did}</code>
                  </div>
                )}
              </div>

              {/* Verify */}
              <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#3a342a] text-[#f4f1ea]">
                    <ShieldCheck size={13} />
                  </span>
                  <h3 className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100 uppercase font-mono tracking-wider">
                    Verify a signature
                  </h3>
                </div>
                <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                  Verify an Ed25519 signature against a DID's public key. Provide the DID, the
                  original message, and the signature as base64.
                </p>
                <div className="space-y-3">
                  <Field label="DID">
                    <input
                      value={verifyForm.did}
                      onChange={(e) => setVerifyForm({ ...verifyForm, did: e.target.value })}
                      placeholder="did:ocean:…"
                      className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
                    />
                  </Field>
                  <Field label="Message">
                    <textarea
                      value={verifyForm.message}
                      onChange={(e) => setVerifyForm({ ...verifyForm, message: e.target.value })}
                      placeholder="The original signed message"
                      rows={2}
                      className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
                    />
                  </Field>
                  <Field label="Signature (base64)">
                    <textarea
                      value={verifyForm.signature}
                      onChange={(e) => setVerifyForm({ ...verifyForm, signature: e.target.value })}
                      placeholder="Base64 Ed25519 signature"
                      rows={2}
                      className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
                    />
                  </Field>
                  <button
                    onClick={verifySignature}
                    disabled={verifying || !token}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                  >
                    <ShieldCheck size={11} />
                    {verifying ? 'Verifying…' : 'Verify signature'}
                  </button>
                  {!token && (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-rose-600">
                      Sign in to verify a signature.
                    </p>
                  )}
                  {verifyResult !== null &&
                    (verifyResult ? (
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 size={12} /> Signature is valid for this DID.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <XCircle size={12} /> Signature is invalid for this DID.
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
