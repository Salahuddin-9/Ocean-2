/**
 * Ocean — AR Face Filters (feature #257)
 * ---------------------------------------
 * Real-time face tracking for camera previews:
 *  - MediaPipe Face Mesh (@mediapipe/tasks-vision FaceLandmarker) as the primary
 *    engine — 478 landmarks, CPU/GPU, no special headers needed.
 *  - MindAR (opt-in) loads its face-tracking wasm from CDN; it needs COOP/COEP
 *    headers for the multi-threaded build, so it degrades gracefully to MediaPipe.
 * Filters are emoji anchored to landmarks (glasses, crown, nose, lips, cheeks).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, Camera, Download, Loader2, Sparkles } from 'lucide-react';
import { toast } from './FeatureShell';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

type FilterId = 'glasses' | 'crown' | 'nose' | 'lips' | 'cheeks' | 'none';

const FILTERS: { id: FilterId; emoji: string; label: string }[] = [
  { id: 'none', emoji: '🚫', label: 'None' },
  { id: 'glasses', emoji: '👓', label: 'Glasses' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'nose', emoji: '👃', label: 'Nose' },
  { id: 'lips', emoji: '💋', label: 'Lips' },
  { id: 'cheeks', emoji: '❤️', label: 'Cheeks' },
];

interface Landmark { x: number; y: number; z?: number }

export default function ARFaceFilters() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef(0);
  const [engine, setEngine] = useState<'idle' | 'mediapipe' | 'mindar' | 'error'>('idle');
  const [camOn, setCamOn] = useState(false);
  const [filter, setFilter] = useState<FilterId>('glasses');
  const [faces, setFaces] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mindarMsg, setMindarMsg] = useState('');

  // ── camera ───────────────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      await initMediaPipe();
    } catch { toast('⛔ Camera permission denied'); }
  };

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    setFaces(0);
  };

  useEffect(() => () => stopCamera(), []);

  // ── MediaPipe engine (primary) ───────────────────────────────────────────────
  const initMediaPipe = async () => {
    setLoading(true);
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
      landmarkerRef.current = landmarker;
      setEngine('mediapipe');
      loop();
    } catch (e: any) {
      setEngine('error');
      toast(`⛔ MediaPipe model load failed: ${e?.message || e}`);
    }
    setLoading(false);
  };

  const loop = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !landmarkerRef.current) return;
    const ctx = c.getContext('2d')!;
    if (v.readyState >= 2) {
      if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const result = landmarkerRef.current.detectForVideo(v, performance.now());
      const lm: Landmark[] | undefined = result?.faceLandmarks?.[0];
      if (lm) { setFaces(1); drawFilter(ctx, lm, c.width, c.height); }
      else setFaces(0);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [filter]);

  // ── filter drawing (emoji anchored to landmarks) ─────────────────────────────
  const drawFilter = (ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number) => {
    const pt = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
    const L = pt(33), R = pt(263);                 // eye outer corners
    const eyeDist = Math.max(10, Math.hypot(R.x - L.x, R.y - L.y));
    const draw = (emoji: string, x: number, y: number, size: number) => {
      ctx.font = `${Math.round(size)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, x, y);
    };
    if (filter === 'glasses') {
      draw('👓', (L.x + R.x) / 2, (L.y + R.y) / 2, eyeDist * 1.15);
    } else if (filter === 'crown') {
      const top = pt(10);
      draw('👑', top.x, top.y - eyeDist * 0.55, eyeDist * 1.1);
    } else if (filter === 'nose') {
      const nose = pt(4);
      draw('👃', nose.x, nose.y, eyeDist * 0.85);
    } else if (filter === 'lips') {
      const lips = pt(13);
      draw('💋', lips.x, lips.y, eyeDist * 0.7);
    } else if (filter === 'cheeks') {
      draw('❤️', pt(50).x, pt(50).y, eyeDist * 0.42);
      draw('❤️', pt(280).x, pt(280).y, eyeDist * 0.42);
    }
  };

  // ── MindAR (opt-in; needs COOP/COEP headers) ─────────────────────────────────
  const tryMindAR = async () => {
    setLoading(true); setMindarMsg('');
    try {
      // MindAR ships a classic script on CDN (mindar-face-three.prod.js) — load it
      // at runtime so the bundler never tries to resolve the remote URL.
      await loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-face-three.prod.js');
      const MindARThree = (window as any).MindARThree;
      if (!MindARThree) throw new Error('MindARThree global not found');
      // Multi-threaded wasm needs COOP/COEP; detect & warn gracefully.
      if (!window.crossOriginIsolated) {
        setMindarMsg('⚠️ MindAR needs COOP/COEP headers (crossOriginIsolated). Enable them in the server response headers, or stick with the MediaPipe engine.');
        setEngine('mediapipe');
        return;
      }
      const mindARThree = new MindARThree();
      await mindARThree.start();
      setEngine('mindar');
      toast('🧠 MindAR face tracking started');
    } catch (e: any) {
      setEngine('mediapipe');
      setMindarMsg(`⚠️ MindAR unavailable (${e?.message || e}) — using MediaPipe engine.`);
    }
    setLoading(false);
  };

  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script load failed'));
    document.head.appendChild(s);
  });

  const snapshot = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl; a.download = `ocean-ar-${Date.now()}.png`; a.click();
    localStorage.setItem('ocean_photo_draft', dataUrl);
    window.dispatchEvent(new CustomEvent('ocean:attach-media', { detail: { type: 'image', dataUrl } }));
    toast('📸 Snapshot saved — ready for the post composer');
  };

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
        <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><ScanFace size={11} /> AR camera <span className="ml-auto flex items-center gap-1 text-emerald-600 dark:text-emerald-400">{engine === 'mediapipe' && <><Sparkles size={9} /> MediaPipe Face Mesh</>}{engine === 'mindar' && 'MindAR'}</span></p>
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" muted playsInline />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
          {!camOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className="text-[10px] text-zinc-400">{loading ? 'Loading model…' : 'Camera off'}</p>
              {!loading && (
                <button onClick={startCamera} className="flex items-center gap-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-bold uppercase tracking-wider px-4 py-2 transition-all">
                  <Camera size={12} /> Start camera
                </button>
              )}
            </div>
          )}
          {camOn && <span className={`absolute top-2 right-2 rounded-lg px-2 py-0.5 text-[8px] font-bold ${faces > 0 ? 'bg-emerald-500/80 text-white' : 'bg-zinc-800/70 text-zinc-300'}`}>{faces > 0 ? `${faces} face tracked` : 'no face'}</span>}
        </div>
        <div className="flex gap-1.5 mt-2">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`flex-1 rounded-lg border py-1.5 text-[10px] font-bold transition-all ${filter === f.id ? 'border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-700 dark:text-fuchsia-300' : 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
              {f.emoji} {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          {camOn && <button onClick={stopCamera} className="flex-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold py-2">Stop camera</button>}
          <button onClick={snapshot} disabled={!camOn} className="flex-1 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-bold py-2 transition-all disabled:opacity-40"><Download size={11} className="inline mr-1" />Snapshot</button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Sparkles size={11} /> Engines</p>
          <p className="text-[9px] text-[#8a8172] leading-relaxed mb-2">
            <b className="text-[#3a342a] dark:text-zinc-200">MediaPipe Face Mesh</b> (default): 478 landmarks via @mediapipe/tasks-vision — runs on GPU, no special headers. <b className="text-[#3a342a] dark:text-zinc-200">MindAR</b> is opt-in and needs COOP/COEP response headers for its multi-threaded wasm.
          </p>
          <button onClick={tryMindAR} disabled={loading} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold py-2 transition-all disabled:opacity-40">
            {loading ? <><Loader2 size={11} className="animate-spin" /> Loading…</> : <><ScanFace size={11} /> Try MindAR engine</>}
          </button>
          {mindarMsg && <p className="text-[8px] text-amber-600 dark:text-amber-400 mt-1.5">{mindarMsg}</p>}
        </div>
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Pair with Creation Lab</p>
          <p className="text-[9px] text-[#8a8172] leading-relaxed">Combine AR filters with the Green screen tab (#257): record a canvas capture while tracking your face, then chroma-key the background for a professional look. Snapshot PNGs flow straight into the post composer.</p>
        </div>
      </div>
    </div>
  );
}
