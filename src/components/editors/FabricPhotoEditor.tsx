/**
 * Ocean — Fabric.js photo editor (feature #251)
 * ----------------------------------------------
 * Advanced canvas editing powered by Fabric.js: draggable / editable text,
 * emoji stickers, image filters, AI background removal and PNG export.
 * Drafts are handed to the post composer via the ocean:attach-media event.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, Textbox, Image as FabricImage, filters as FabricFilters } from 'fabric';
import { Upload, Type, Sticker, Sparkles, Eraser, Download, Trash2, RotateCcw } from 'lucide-react';
import { toast } from '../FeatureShell';
import { removeBackgroundAI, blobToDataUrl } from '../../lib/editors/bgRemoval';

interface Props {
  baseData: string;          // original image data URL
  onImageChange: (dataUrl: string) => void;
}

const STICKERS = ['😎', '🔥', '❤️', '😂', '🎉', '✨', '😍', '🤯', '💯', '🌊', '🐢', '🇧🇩'];
const CANVAS_W = 360, CANVAS_H = 640;

export default function FabricPhotoEditor({ baseData, onImageChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [color, setColor] = useState('#ffffff');
  const [size, setSize] = useState(28);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [sat, setSat] = useState(0);
  const [filter, setFilter] = useState<'none' | 'bw' | 'sepia' | 'invert' | 'vintage'>('none');
  const [removing, setRemoving] = useState(false);
  const [rmPct, setRmPct] = useState(0);
  const [busy, setBusy] = useState(false);

  // ── init fabric canvas ────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;
    try {
      if (!live || !wrapRef.current) return;
      const fc = new Canvas(wrapRef.current, { width: CANVAS_W, height: CANVAS_H, backgroundColor: '#0c0c0c' });
      canvasRef.current = fc;
      setReady(true);
    } catch (e: any) { toast(`⛔ Fabric init failed: ${e?.message || e}`); }
    return () => { live = false; canvasRef.current?.dispose(); canvasRef.current = null; };
  }, []);

  // ── (re)load background image ─────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !canvasRef.current || !baseData) return;
    (async () => {
      const fc = canvasRef.current!;
      fc.clear();
      fc.backgroundColor = '#0c0c0c';
      try {
        const img = await FabricImage.fromURL(baseData, { crossOrigin: 'anonymous' });
        const k = Math.min(CANVAS_W / (img.width || 1), CANVAS_H / (img.height || 1));
        img.set({ left: (CANVAS_W - (img.width || 1) * k) / 2, top: (CANVAS_H - (img.height || 1) * k) / 2, scaleX: k, scaleY: k, selectable: false, evented: false });
        fc.backgroundImage = img as never;
        fc.requestRenderAll();
        applyFilters();
      } catch { /* keep empty */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, baseData]);

  // ── filters ───────────────────────────────────────────────────────────────
  const applyFilters = () => {
    const fc = canvasRef.current;
    if (!fc || !fc.backgroundImage) return;
    const img = fc.backgroundImage as unknown as FabricImage;
    const chain: unknown[] = [];
    if (filter === 'bw') chain.push(new FabricFilters.Grayscale());
    if (filter === 'sepia') chain.push(new FabricFilters.Sepia());
    if (filter === 'invert') chain.push(new FabricFilters.Invert());
    if (filter === 'vintage') chain.push(new FabricFilters.Sepia({ intensity: 0.35 }));
    if (brightness) chain.push(new FabricFilters.Brightness({ brightness: brightness / 100 }));
    if (contrast) chain.push(new FabricFilters.Contrast({ contrast: contrast / 100 }));
    if (sat) chain.push(new FabricFilters.Saturation({ saturation: sat / 100 }));
    img.filters = chain as never[];
    img.applyFilters();
    fc.requestRenderAll();
  };

  useEffect(() => { applyFilters(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brightness, contrast, sat, filter, ready]);

  // ── actions ────────────────────────────────────────────────────────────────
  const addText = () => {
    const fc = canvasRef.current;
    if (!fc) return;
    const tb = new Textbox(text.trim() || 'Your text', {
      left: CANVAS_W / 2 - 80, top: CANVAS_H / 2 - 16, width: 160, fontSize: size,
      fill: color, stroke: '#000', strokeWidth: 2, textAlign: 'center', originX: 'center', originY: 'center',
    });
    fc.add(tb);
    fc.setActiveObject(tb);
    fc.requestRenderAll();
  };

  const addSticker = (s: string) => {
    const fc = canvasRef.current;
    if (!fc) return;
    const tb = new Textbox(s, { left: CANVAS_W / 2 - 30, top: CANVAS_H / 2 - 30, width: 60, fontSize: 48, textAlign: 'center', originX: 'center', originY: 'center' });
    fc.add(tb);
    fc.setActiveObject(tb);
    fc.requestRenderAll();
  };

  const deleteSelected = () => {
    const fc = canvasRef.current;
    if (!fc) return;
    const sel = fc.getActiveObjects();
    if (!sel.length) return toast('ℹ️ Select an object on the canvas first');
    sel.forEach((o) => fc.remove(o));
    fc.discardActiveObject();
    fc.requestRenderAll();
  };

  const removeBackground = async () => {
    const fc = canvasRef.current;
    if (!fc || !baseData || removing) return;
    setRemoving(true); setRmPct(0);
    try {
      const blob = await (await fetch(baseData)).blob();
      const out = await removeBackgroundAI(blob, setRmPct);
      if (out) {
        const dataUrl = await blobToDataUrl(out);
        onImageChange(dataUrl);
        toast('🧹 Background removed with @imgly AI');
      } else {
        toast('⛔ AI model unavailable — try again online');
      }
    } catch (e: any) { toast(`⛔ ${e?.message || 'Removal failed'}`); }
    setRemoving(false);
  };

  const exportPng = () => {
    const fc = canvasRef.current;
    if (!fc) return;
    const dataUrl = fc.toDataURL({ format: 'png', multiplier: 2 });
    const a = document.createElement('a');
    a.href = dataUrl; a.download = `ocean-fabric-${Date.now()}.png`; a.click();
    localStorage.setItem('ocean_photo_draft', dataUrl);
    window.dispatchEvent(new CustomEvent('ocean:attach-media', { detail: { type: 'image', dataUrl } }));
    toast('✅ Exported — draft saved for the post composer');
  };

  return (
    <div className="space-y-3">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
        <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1">
          <Sparkles size={11} /> Fabric.js canvas — drag, double-click to edit text, then export
        </p>
        <div className="relative rounded-xl overflow-hidden bg-black/90">
          <div ref={wrapRef} className="w-full h-auto" style={{ aspectRatio: '360/640' }} />
          {!ready && <p className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500">Loading Fabric…</p>}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="flex gap-1.5">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text…" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none min-w-0" />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded-lg border border-[#ebdcca] dark:border-zinc-700 cursor-pointer shrink-0" />
            <input type="number" min={10} max={80} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-14 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1.5 text-[11px] outline-none shrink-0" />
            <button onClick={addText} className="rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-2.5 text-[10px] font-bold shrink-0"><Type size={11} /></button>
          </div>
          <button onClick={deleteSelected} className="flex items-center justify-center gap-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 text-[10px] font-bold text-rose-500 hover:border-rose-400">
            <Trash2 size={11} /> Delete selected
          </button>
        </div>

        <div className="mt-2 flex gap-1 flex-wrap">
          {STICKERS.map((s) => <button key={s} onClick={() => addSticker(s)} className="text-lg hover:scale-125 transition-transform" title="Add sticker">{s}</button>)}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <p className="text-[8px] font-mono uppercase text-[#8a8172]">Adjust</p>
            {([['Brightness', brightness, setBrightness], ['Contrast', contrast, setContrast], ['Saturation', sat, setSat]] as const).map(([label, val, set]) => (
              <label key={label} className="flex items-center gap-2 text-[9px] text-[#8a8172] font-bold">
                {label} <input type="range" min={-50} max={50} value={val} onChange={(e) => set(Number(e.target.value))} className="flex-1" />
                <span className="font-mono w-7 text-right">{val > 0 ? `+${val}` : val}</span>
              </label>
            ))}
          </div>
          <div>
            <p className="text-[8px] font-mono uppercase text-[#8a8172] mb-1">Filters</p>
            <div className="grid grid-cols-2 gap-1">
              {([['none', 'None'], ['bw', 'B&W'], ['sepia', 'Sepia'], ['invert', 'Invert'], ['vintage', 'Vintage']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setFilter(v)}
                  className={`rounded-lg border px-1.5 py-1 text-[9px] font-bold transition-all ${filter === v ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300' : 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex gap-1.5">
          <button onClick={removeBackground} disabled={removing}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold py-2 transition-all disabled:opacity-40">
            <Eraser size={11} /> {removing ? `AI removing… ${rmPct}%` : 'AI remove background'}
          </button>
          <button onClick={exportPng} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold py-2 transition-all">
            <Download size={11} /> Export PNG
          </button>
        </div>
        <p className="text-[8px] text-[#8a8172] mt-1.5">Fabric.js gives you selectable objects — resize with the corner handles, edit text by double-clicking.</p>
      </div>
    </div>
  );
}
