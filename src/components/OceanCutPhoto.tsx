import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Image as ImageIcon, Upload, Crop, Type, Sticker, Wand2, Download, Eraser, Trash2, Sparkles, Palette } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import FabricPhotoEditor from './editors/FabricPhotoEditor';
import { removeBackgroundAI, blobToDataUrl } from '../lib/editors/bgRemoval';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface OverlayItem { id: string; type: 'text' | 'emoji'; text: string; color: string; size: number; x: number; y: number }
interface CropRect { x: number; y: number; w: number; h: number }

const FILTERS = [
  { name: 'Original', css: 'none' },
  { name: 'B&W', css: 'grayscale(1)' },
  { name: 'Sepia', css: 'sepia(0.8) contrast(1.05)' },
  { name: 'Vintage', css: 'sepia(0.45) contrast(1.1) brightness(0.95) saturate(0.85)' },
  { name: 'Ocean', css: 'saturate(1.3) hue-rotate(-10deg) brightness(1.05)' },
  { name: 'Noir', css: 'grayscale(1) contrast(1.35) brightness(0.9)' },
  { name: 'Invert', css: 'invert(1)' },
  { name: 'Warm', css: 'sepia(0.25) saturate(1.4) brightness(1.05)' },
];

const STICKERS = ['😎', '🔥', '❤️', '😂', '🎉', '✨', '😍', '🤯', '💯', '🌊', '🐢', '🇧🇩'];

const CANVAS_W = 360, CANVAS_H = 640;

export default function OceanCutPhoto({ token, currentUser, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState<HTMLImageElement | null>(null);
  const [baseData, setBaseData] = useState('');
  const [filterName, setFilterName] = useState('Original');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [sat, setSat] = useState(100);
  const [tool, setTool] = useState<'select' | 'crop' | 'text' | 'emoji' | 'bgremove'>('select');
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [bgThreshold, setBgThreshold] = useState(40);
  const [enhancing, setEnhancing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rmPct, setRmPct] = useState(0);
  const [mode, setMode] = useState<'classic' | 'fabric'>('classic');
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  const filterCss = useCallback(() => {
    return `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${sat / 100}) ${FILTERS.find((f) => f.name === filterName)?.css || 'none'}`;
  }, [brightness, contrast, sat, filterName]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (!base) return;
    // fit image into canvas
    const k = Math.min(CANVAS_W / base.width, CANVAS_H / base.height);
    const w = base.width * k, h = base.height * k;
    const x = (CANVAS_W - w) / 2, y = (CANVAS_H - h) / 2;
    ctx.save();
    ctx.filter = filterCss();
    ctx.drawImage(base, x, y, w, h);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0)';
    // overlays
    for (const it of items) {
      ctx.font = `${it.size}px ${it.type === 'emoji' ? 'sans-serif' : 'system-ui, sans-serif'}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (it.type === 'emoji') ctx.fillText(it.text, it.x, it.y);
      else {
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(it.text, it.x, it.y);
        ctx.fillStyle = it.color;
        ctx.fillText(it.text, it.x, it.y);
      }
    }
    // selection + crop rect
    if (cropRect) {
      ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.setLineDash([]);
    }
    if (selected) {
      const it = items.find((i) => i.id === selected);
      if (it) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.strokeRect(it.x - it.size / 2, it.y - it.size / 2, it.size, it.size);
      }
    }
  }, [base, filterCss, items, cropRect, selected]);

  useEffect(() => { draw(); }, [draw]);

  const loadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => { setBase(img); setBaseData(img.src); setItems([]); setCropRect(null); setFilterName('Original'); };
    img.src = URL.createObjectURL(f);
  };

  const canvasPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CANVAS_W, y: ((e.clientY - r.top) / r.height) * CANVAS_H };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = canvasPos(e);
    if (tool === 'crop') { cropStartRef.current = p; setCropRect({ x: p.x, y: p.y, w: 0, h: 0 }); return; }
    if (tool === 'text' || tool === 'emoji') {
      const id = `ov-${Date.now()}`;
      setItems((prev) => [...prev, { id, type: tool, text: tool === 'text' ? newText || 'Your text' : STICKERS[Math.floor(Math.random() * STICKERS.length)], color: textColor, size: 28, x: p.x, y: p.y }]);
      setSelected(id);
      setTool('select');
      return;
    }
    // select / drag
    const hit = [...items].reverse().find((it) => Math.abs(it.x - p.x) < it.size && Math.abs(it.y - p.y) < it.size);
    if (hit) { setSelected(hit.id); dragRef.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y }; (e.target as Element).setPointerCapture(e.pointerId); }
    else setSelected(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = canvasPos(e);
    if (tool === 'crop' && cropStartRef.current) {
      const s = cropStartRef.current;
      setCropRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
      return;
    }
    if (dragRef.current) {
      setItems((prev) => prev.map((it) => it.id === dragRef.current!.id ? { ...it, x: p.x - dragRef.current!.dx, y: p.y - dragRef.current!.dy } : it));
    }
  };

  const onPointerUp = () => { dragRef.current = null; cropStartRef.current = null; };

  const applyCrop = () => {
    if (!cropRect || !base) return;
    const { x, y, w, h } = cropRect;
    if (w < 10 || h < 10) { toast('⛔ Crop too small'); return; }
    const k = Math.min(CANVAS_W / base.width, CANVAS_H / base.height);
    const imgX = (CANVAS_W - base.width * k) / 2, imgY = (CANVAS_H - base.height * k) / 2;
    const sx = Math.max(0, (x - imgX) / k), sy = Math.max(0, (y - imgY) / k);
    const sw = Math.min(base.width - sx, w / k), sh = Math.min(base.height - sy, h / k);
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    c.getContext('2d')!.drawImage(base, sx, sy, sw, sh, 0, 0, sw, sh);
    const img = new Image();
    img.onload = () => { setBase(img); setBaseData(img.src); setCropRect(null); toast('✂️ Cropped'); };
    img.src = c.toDataURL('image/jpeg', 0.92);
  };

  const removeBackground = async () => {
    if (!base) return;
    setRemoving(true); setRmPct(0);
    try {
      const blob = await new Promise<Blob>((res) => base.toBlob((b) => res(b!), 'image/png'));
      const out = await removeBackgroundAI(blob, setRmPct);
      if (out) {
        const dataUrl = await blobToDataUrl(out);
        const img2 = new Image();
        img2.onload = () => { setBase(img2); setBaseData(img2.src); setRemoving(false); toast('🧹 Background removed with @imgly AI'); };
        img2.src = dataUrl;
        return;
      }
    } catch { /* fall back to threshold */ }
    // fallback: corner-color threshold (offline)
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const dd = img.data;
    const sample = (px: number, py: number) => { const i = (py * c.width + px) * 4; return [dd[i], dd[i + 1], dd[i + 2]]; };
    const corners = [sample(0, 0), sample(c.width - 1, 0), sample(0, c.height - 1), sample(c.width - 1, c.height - 1)];
    const t = bgThreshold;
    for (let i = 0; i < dd.length; i += 4) {
      const r = dd[i], g = dd[i + 1], b = dd[i + 2];
      const near = corners.some(([cr, cg, cb]) => Math.abs(r - cr) + Math.abs(g - cg) + Math.abs(b - cb) < t);
      if (near) dd[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    const img2 = new Image();
    img2.onload = () => { setBase(img2); setBaseData(img2.src); setRemoving(false); toast('🧹 Background removed (offline corner-color fallback)'); };
    img2.src = c.toDataURL('image/png');
  };

  const enhance = async () => {
    if (!base) return;
    setEnhancing(true);
    try {
      const c = document.createElement('canvas');
      c.width = base.width; c.height = base.height;
      c.getContext('2d')!.drawImage(base, 0, 0);
      const jpeg = c.toDataURL('image/jpeg', 0.92);
      const res = await fetch('/api/ai/enhance-image', {
        method: 'POST', headers: authHeaders(token), body: JSON.stringify({ image: jpeg, brightness: 6, contrast: 1.12, saturation: 1.18, sharpen: 0.35 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Enhance failed');
      const img = new Image();
      img.onload = () => { setBase(img); setBaseData(img.src); setEnhancing(false); toast('✨ AI auto-enhance applied (contrast · saturation · sharpen)'); };
      img.src = d.image;
    } catch (e: any) { setEnhancing(false); toast(`⛔ ${e.message}`); }
  };

  const exportPng = () => {
    if (!base) return;
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const ctx = c.getContext('2d')!;
    const k = Math.min(CANVAS_W / base.width, CANVAS_H / base.height);
    const imgX = (CANVAS_W - base.width * k) / 2, imgY = (CANVAS_H - base.height * k) / 2;
    ctx.filter = filterCss();
    ctx.drawImage(base, 0, 0);
    ctx.filter = 'none';
    for (const it of items) {
      ctx.font = `${it.size / k}px ${it.type === 'emoji' ? 'sans-serif' : 'system-ui, sans-serif'}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const x = (it.x - imgX) / k, y = (it.y - imgY) / k;
      if (it.type === 'emoji') ctx.fillText(it.text, x, y);
      else { ctx.lineWidth = 4 / k; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(it.text, x, y); ctx.fillStyle = it.color; ctx.fillText(it.text, x, y); }
    }
    const dataUrl = c.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl; a.download = `ocean-photo-${Date.now()}.png`; a.click();
    localStorage.setItem('ocean_photo_draft', dataUrl);
    window.dispatchEvent(new CustomEvent('ocean:attach-media', { detail: { type: 'image', dataUrl } }));
    toast('✅ Exported — draft saved for the post composer');
  };

  const toolBtn = (t: 'select' | 'crop' | 'text' | 'emoji' | 'bgremove', icon: React.ReactNode, label: string) => (
    <button onClick={() => setTool(t)} className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] font-bold transition-all ${tool === t ? 'bg-slate-800 text-white' : 'text-[#8a8172] hover:bg-white dark:hover:bg-zinc-800'}`}>
      {icon}{label}
    </button>
  );

  return (
    <FeatureShell title="Ocean Cut — Photo Editor" badge="251 · fabric+ai" icon={<ImageIcon size={18} className="text-sky-700 dark:text-sky-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3">
        {([['classic', 'Classic canvas', <Palette key="c" size={11} />], ['fabric', 'Fabric.js advanced', <Sparkles key="f" size={11} />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setMode(id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${mode === id ? 'bg-sky-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {icon} {label}
          </button>
        ))}
        <p className="ml-auto text-[8px] text-[#8a8172] font-mono uppercase tracking-wider">@imgly AI bg-removal · /api/ai/enhance-image</p>
      </div>
      {mode === 'fabric' ? (
        <FabricPhotoEditor
          baseData={baseData}
          onImageChange={(d) => {
            const img = new Image();
            img.onload = () => { setBase(img); setBaseData(img.src); setItems([]); };
            img.src = d;
          }}
        />
      ) : (
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <label className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ebdcca] dark:border-zinc-700 py-3 text-[11px] font-bold text-[#8a8172] cursor-pointer hover:border-sky-400 transition-all">
              <Upload size={13} /> {base ? 'Replace photo' : 'Choose a photo'}
              <input type="file" accept="image/*" className="hidden" onChange={loadFile} />
            </label>
            <div className="relative mt-2 rounded-xl overflow-hidden bg-black/90">
              <canvas
                ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                className="w-full h-auto cursor-crosshair touch-none"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              />
              {!base && <p className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500">Photo preview</p>}
            </div>
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
              {toolBtn('select', <span className="text-[11px]">🖱️</span>, 'Select')}
              {toolBtn('crop', <Crop size={11} />, 'Crop')}
              {toolBtn('text', <Type size={11} />, 'Text')}
              {toolBtn('emoji', <Sticker size={11} />, 'Sticker')}
              {toolBtn('bgremove', <Eraser size={11} />, 'BG')}
            </div>
            {tool === 'crop' && (
              <div className="mt-2 flex items-center gap-2">
                <button onClick={applyCrop} className="rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-3 py-1.5">Apply crop</button>
                <button onClick={() => setCropRect(null)} className="rounded-lg border border-[#ebdcca] dark:border-zinc-700 text-[10px] font-bold px-3 py-1.5 text-[#8a8172]">Cancel</button>
              </div>
            )}
            {tool === 'text' && (
              <div className="mt-2 flex gap-1.5">
                <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Type text, then click canvas…" className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] outline-none" />
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-9 h-9 rounded-lg border border-[#ebdcca] dark:border-zinc-700 cursor-pointer" />
              </div>
            )}
            {tool === 'emoji' && (
              <div className="mt-2 flex gap-1 flex-wrap">
                {STICKERS.map((s) => <button key={s} onClick={() => { setTool('emoji'); }} className="text-lg hover:scale-125 transition-transform">{s}</button>)}
                <span className="text-[9px] text-[#8a8172] self-center ml-1">Then click the canvas to place.</span>
              </div>
            )}
            {tool === 'bgremove' && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[9px] text-[#8a8172]">Threshold</span>
                <input type="range" min={10} max={120} value={bgThreshold} onChange={(e) => setBgThreshold(Number(e.target.value))} className="flex-1" />
                <button onClick={removeBackground} disabled={removing} className="rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-bold px-3 py-1.5 disabled:opacity-40">{removing ? (rmPct ? `AI ${rmPct}%` : 'AI…') : 'Remove BG'}</button>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-1.5">Layers ({items.length})</p>
              <div className="space-y-1">
                {items.map((it) => (
                  <div key={it.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${selected === it.id ? 'bg-sky-50 dark:bg-sky-900/20' : ''}`}>
                    <button onClick={() => setSelected(it.id)} className="flex-1 text-left text-[11px] text-[#3a342a] dark:text-zinc-200 truncate">{it.type === 'emoji' ? `${it.text} (sticker)` : it.text}</button>
                    <button onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))} className="text-rose-500 hover:text-rose-400"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <p className="text-[8px] text-[#8a8172] mt-1">Drag layers on the canvas to move them.</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Sparkles size={11} /> Filters</p>
            <div className="grid grid-cols-4 gap-1.5">
              {FILTERS.map((f) => (
                <button key={f.name} onClick={() => setFilterName(f.name)}
                  className={`rounded-lg border px-1.5 py-2 text-[9px] font-bold transition-all ${filterName === f.name ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300' : 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                  {f.name}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {([['Brightness', brightness, setBrightness], ['Contrast', contrast, setContrast], ['Saturation', sat, setSat]] as const).map(([label, val, set]) => (
                <label key={label} className="flex items-center gap-2 text-[10px] text-[#8a8172] font-bold">
                  {label} <input type="range" min={40} max={200} value={val} onChange={(e) => set(Number(e.target.value))} className="flex-1" />
                  <span className="font-mono w-8 text-right">{val}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Wand2 size={11} /> AI tools</p>
            <button onClick={enhance} disabled={!base || enhancing}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 transition-all disabled:opacity-40">
              <Wand2 size={13} /> {enhancing ? 'Enhancing…' : 'AI auto-enhance'}
            </button>
            <p className="text-[8px] text-[#8a8172] mt-1.5">Server-side pixel pipeline: brightness + contrast + saturation + unsharp mask.</p>
            <button onClick={exportPng} disabled={!base}
              className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 transition-all disabled:opacity-40">
              <Download size={13} /> Export PNG
            </button>
          </div>
        </div>
      </div>
      )}
    </FeatureShell>
  );
}
