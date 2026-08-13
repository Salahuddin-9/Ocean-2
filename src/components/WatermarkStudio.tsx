import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Stamp, Loader2, SearchCheck, BadgeCheck } from 'lucide-react';

/**
 * Ocean — Synthetic Media Watermarking (Feature 242)
 * ----------------------------------------------------
 * Register a C2PA-style provenance manifest for AI-generated assets, verify an
 * asset's provenance, and browse registered manifests. Backed by /api/watermark.
 */

interface WatermarkStudioProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Manifest { id: string; assetId: string; userId: string; generator: string; model: string; at: number; signature: string }

export default function WatermarkStudio({ token, currentUser, onClose }: WatermarkStudioProps) {
  const [visible, setVisible] = useState(true);
  const [assetId, setAssetId] = useState('');
  const [generator, setGenerator] = useState('imagen');
  const [claimsText, setClaimsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifyId, setVerifyId] = useState('');
  const [verdict, setVerdict] = useState<{ verified: boolean; synthetic: boolean; message: string } | null>(null);
  const [mine, setMine] = useState<Manifest[]>([]);

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

  const register = async () => {
    if (!assetId.trim()) return toast('Asset ID is required.');
    setBusy(true);
    try {
      const claims: Record<string, string> = {};
      claimsText.split(',').map(s => s.trim()).filter(Boolean).forEach((pair, i) => {
        const [k, ...rest] = pair.split(':');
        if (k) claims[`c${i}`] = rest.join(':').trim() || k;
      });
      const d = await api('/api/watermark/register', 'POST', { assetId, generator, claims });
      setMine(m => [d.manifest, ...m]);
      toast('C2PA-style manifest registered.');
      setAssetId(''); setClaimsText('');
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
  };

  const verify = async () => {
    if (!verifyId.trim()) return toast('Enter an asset ID to verify.');
    setBusy(true);
    try {
      const d = await api('/api/watermark/verify', 'POST', { assetId: verifyId });
      setVerdict(d);
    } catch (e: any) { toast(e.message, 'destructive'); } finally { setBusy(false); }
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Media watermarking</span>
              <button onClick={() => setVisible(false)} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={card}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-fuchsia-800/10 dark:bg-fuchsia-400/10 flex items-center justify-center">
                  <Stamp className="text-fuchsia-800 dark:text-fuchsia-400" size={17} />
                </span>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Synthetic Media Watermarking</h2>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">C2PA provenance for AI media · feature 242</p>
                </div>
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Stamp size={11} className="inline" /> Register provenance</div>
                  <input className={input} value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="Asset ID (post/reel/media id)" />
                  <div className="grid grid-cols-2 gap-2">
                    <select className={input} value={generator} onChange={e => setGenerator(e.target.value)}>
                      {['imagen', 'faceless-video', 'deep-rank', 'c2pa-ocean-v1'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <input className={input} value={claimsText} onChange={e => setClaimsText(e.target.value)} placeholder="claims: model:v1, dataset:optin" />
                  </div>
                  <button onClick={register} disabled={busy} className={`${btnPrimary} w-full justify-center`}>
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Stamp size={11} />} Register manifest
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><SearchCheck size={11} className="inline" /> Verify an asset</div>
                <div className="flex gap-2">
                  <input className={input} value={verifyId} onChange={e => setVerifyId(e.target.value)} placeholder="Asset ID to check" />
                  <button onClick={verify} disabled={busy} className={btnPrimary}><SearchCheck size={11} /> Verify</button>
                </div>
                {verdict && (
                  <div className={`rounded-xl px-3 py-2 font-mono text-[10px] ${verdict.synthetic ? 'bg-amber-800/10 text-amber-800 dark:text-amber-300' : 'bg-emerald-800/10 text-emerald-800 dark:text-emerald-300'}`}>
                    {verdict.synthetic ? '⚠ AI-generated — C2PA provenance verified.' : verdict.verified ? verdict.message : 'No provenance found — treat as unverified.'}
                  </div>
                )}
              </div>

              {mine.length > 0 && (
                <div className="space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#8a8172] dark:text-zinc-500">My manifests</div>
                  {mine.map(m => (
                    <div key={m.id} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 bg-white/60 dark:bg-zinc-950/40 flex items-center gap-2">
                      <BadgeCheck size={12} className="text-fuchsia-700 dark:text-fuchsia-400" />
                      <span className="font-mono text-[10px] text-[#3a342a] dark:text-zinc-200 break-all flex-1">{m.assetId}</span>
                      <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-fuchsia-800/10 text-fuchsia-700 dark:text-fuchsia-300">{m.generator}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
