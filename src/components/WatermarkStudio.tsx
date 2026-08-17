import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Stamp, Loader2, SearchCheck, BadgeCheck, ImagePlus, Download } from 'lucide-react';
import SimulationModeBadge from './SimulationModeBadge';

/**
 * Ocean — Synthetic Media Watermarking (Feature 242)
 * ----------------------------------------------------
 * 1) VISIBLE watermark stamp: upload an image (AI-generated or any media),
 *    stamp a semi-transparent diagonal “AI-generated · Ocean” text overlay,
 *    and export the watermarked PNG.
 * 2) Register a C2PA-style provenance manifest for the asset, verify an asset's
 *    provenance, and browse registered manifests. Backed by /api/watermark.
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
  // visible stamp state
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stampImg, setStampImg] = useState<HTMLImageElement | null>(null);
  const [stampText, setStampText] = useState('AI-generated · Ocean');
  const [stampOpacity, setStampOpacity] = useState(0.35);
  const [stamped, setStamped] = useState(false);

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

  // ── visible watermark stamp ──────────────────────────────────────────────
  const loadStampFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => { setStampImg(img); setStamped(false); };
    img.src = URL.createObjectURL(f);
  };

  const stamp = () => {
    const img = stampImg;
    const c = canvasRef.current;
    if (!img || !c) return toast('Upload an image first.');
    const maxW = 1200;
    const k = Math.min(1, maxW / img.width);
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // diagonal tiled semi-transparent text overlay
    ctx.save();
    ctx.globalAlpha = stampOpacity;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.font = `bold ${Math.max(14, Math.round(c.width / 28))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const step = Math.max(120, c.width / 4.5);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(-Math.PI / 5);
    for (let y = -c.height; y < c.height * 2; y += step) {
      for (let x = -c.width; x < c.width * 2; x += step * 2) {
        ctx.strokeText(stampText || 'AI-generated', x, y);
        ctx.fillText(stampText || 'AI-generated', x, y);
      }
    }
    ctx.restore();
    setStamped(true);
    toast('Visible watermark stamped — export to save.');
  };

  const exportStamped = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ocean-watermarked-${Date.now()}.png`;
    a.click();
    toast('Watermarked image downloaded.');
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

              <SimulationModeBadge
                title="Registry-only C2PA — visible stamp is client-side; no jumbox embedding yet"
                detail="The visible watermark (below) is a real semi-transparent overlay baked into the exported PNG. The C2PA-style provenance manifest is kept in Ocean's database, but not physically embedded into the media file's C2PA jumbox/EXIF, so a copy exported outside Ocean loses the registry proof. A production build uses the C2PA Rust/JS SDK to embed the manifest at generation time and signs with a cert-chain key."
              />

              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><ImagePlus size={11} className="inline" /> 1 · Stamp a visible watermark</div>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={loadStampFile} />
                  <button onClick={() => fileRef.current?.click()} className={`${btnPrimary} flex-1 justify-center`}><ImagePlus size={11} /> Choose image</button>
                  {stampImg && <button onClick={stamp} className={`${btnPrimary} flex-1 justify-center`}>Stamp</button>}
                  {stamped && <button onClick={exportStamped} className={`${btnPrimary} flex-1 justify-center bg-amber-800 dark:bg-amber-500`}><Download size={11} /> Export PNG</button>}
                </div>
                {stampImg && (
                  <>
                    <input className={input} value={stampText} onChange={e => setStampText(e.target.value)} placeholder="Watermark text" />
                    <label className="flex items-center gap-2 text-[10px] text-[#8a8172] font-bold">
                      Opacity <input type="range" min={0.1} max={0.7} step={0.05} value={stampOpacity} onChange={e => setStampOpacity(Number(e.target.value))} className="flex-1" />
                      <span className="font-mono w-8 text-right">{Math.round(stampOpacity * 100)}%</span>
                    </label>
                    <div className="rounded-xl overflow-hidden bg-black/80 flex items-center justify-center">
                      <canvas ref={canvasRef} className="max-h-64 w-auto" />
                    </div>
                  </>
                )}
              </div>

              {currentUser && (
                <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300"><Stamp size={11} className="inline" /> 2 · Register provenance manifest</div>
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
