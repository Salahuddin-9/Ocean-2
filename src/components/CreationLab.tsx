import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Clapperboard, Wand2, Music4, LayoutTemplate, Download, Video, ImagePlus, Play, Square, ScanFace } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import ARFaceFilters from './ARFaceFilters';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Template { id: string; name: string; kind: string; config: Record<string, unknown> }

async function api<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: authHeaders(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || 'Request failed');
  return res.json() as Promise<T>;
}

function chromaKey(ctx: CanvasRenderingContext2D, key: [number, number, number], tol: number, soft: number) {
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - key[0], dg = d[i + 1] - key[1], db = d[i + 2] - key[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < tol) d[i + 3] = 0;
    else if (dist < tol + soft) d[i + 3] = Math.floor(((dist - tol) / soft) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

export default function CreationLab({ token, currentUser, onClose }: Props) {
  const [tab, setTab] = useState<'green' | 'duet' | 'beat' | 'tpl' | 'ar'>('green');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const srcUrl = useRef('');
  const rafRef = useRef(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [keyColor, setKeyColor] = useState('#00b140');
  const [tolerance, setTolerance] = useState(90);
  const [softness, setSoftness] = useState(40);
  const [recording, setRecording] = useState(false);
  const [faceMode, setFaceMode] = useState(false);
  const [bpm, setBpm] = useState<number | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  const loadTemplates = useCallback(async () => {
    try { setTemplates((await api<{ templates: Template[] }>('/api/editor/templates', token)).templates); } catch { /* noop */ }
  }, [token]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ── greenscreen render loop ──────────────────────────────────────────────
  const renderGreen = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const media = mediaRef.current;
    if (!media) return;
    const hex = keyColor.replace('#', '');
    const key: [number, number, number] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(media as CanvasImageSource, 0, 0, c.width, c.height);
    chromaKey(ctx, key, tolerance, softness);
    if (faceMode) {
      ctx.font = '40px sans-serif';
      ctx.fillText('😎', c.width / 2, c.height / 2);
    }
    rafRef.current = requestAnimationFrame(renderGreen);
  }, [keyColor, tolerance, softness, faceMode]);

  useEffect(() => {
    if (tab === 'green' && mediaRef.current) {
      renderGreen();
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [tab, renderGreen]);

  const pickMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    srcUrl.current = URL.createObjectURL(f);
    const isVideo = f.type.startsWith('video');
    if (isVideo) {
      const v = document.createElement('video');
      v.src = srcUrl.current; v.muted = true; v.loop = true; v.playsInline = true;
      v.onloadeddata = () => { mediaRef.current = v; v.play().catch(() => {}); renderGreen(); };
    } else {
      const img = new Image();
      img.onload = () => { mediaRef.current = img; renderGreen(); };
      img.src = srcUrl.current;
    }
  };

  const startRecord = () => {
    const c = canvasRef.current;
    if (!c) return;
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    chunksRef.current = [];
    rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `creation-lab-${Date.now()}.webm`; a.click();
      setRecording(false);
      toast('✅ Clip recorded & downloaded');
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
    setTimeout(() => rec.stop(), 6000);
  };

  const capturePng = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png'); a.download = `green-screen-${Date.now()}.png`; a.click();
    toast('🖼️ Frame exported');
  };

  // ── duet / stitch ─────────────────────────────────────────────────────────
  const [leftSrc, setLeftSrc] = useState('');
  const [rightSrc, setRightSrc] = useState('');
  const duetCanvasRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLVideoElement | null>(null);
  const rightRef = useRef<HTMLVideoElement | null>(null);
  const duetRaf = useRef(0);

  const duetRender = () => {
    const c = duetCanvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    if (leftRef.current) ctx.drawImage(leftRef.current, 0, 0, c.width / 2, c.height);
    if (rightRef.current) ctx.drawImage(rightRef.current, c.width / 2, 0, c.width / 2, c.height);
    duetRaf.current = requestAnimationFrame(duetRender);
  };

  useEffect(() => { duetRender(); return () => cancelAnimationFrame(duetRaf.current); }, []);

  const pickDuet = (side: 'left' | 'right') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.loop = true; v.playsInline = true;
    v.onloadeddata = () => { v.play().catch(() => {}); if (side === 'left') { leftRef.current = v; setLeftSrc(url); } else { rightRef.current = v; setRightSrc(url); } };
  };

  const recordDuet = () => {
    const c = duetCanvasRef.current;
    if (!c) return;
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    chunksRef.current = [];
    rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `duet-${Date.now()}.webm`; a.click();
      setRecording(false);
      toast('✅ Duet recorded & downloaded');
    };
    rec.start(); recRef.current = rec; setRecording(true);
    setTimeout(() => rec.stop(), 6000);
  };

  // ── beat sync ─────────────────────────────────────────────────────────────
  const detectBpm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      // onset envelope: energy of short windows
      const win = Math.floor(audio.sampleRate / 20);
      const energy: number[] = [];
      for (let i = 0; i + win < data.length; i += win) {
        let e2 = 0;
        for (let j = 0; j < win; j++) e2 += data[i + j] * data[i + j];
        energy.push(Math.sqrt(e2 / win));
      }
      // simple peak detection with 0.25s min spacing (adaptive ~ find dominant interval)
      let bestBpm = 0, bestScore = 0;
      for (let b = 70; b <= 180; b += 1) {
        const period = (60 / b) / 0.05; // windows per beat
        let score = 0;
        for (let i = Math.floor(period); i < energy.length; i += Math.floor(period)) score += energy[i];
        // normalize
        const s = score / (energy.length / period);
        if (s > bestScore) { bestScore = s; bestBpm = b; }
      }
      setBpm(bestBpm || 120);
      toast(`🎵 Detected ~${bestBpm || 120} BPM`);
      ctx.close();
    } catch { toast('⛔ Could not decode audio'); }
  };

  const saveTemplate = async () => {
    try {
      await api('/api/editor/templates', token, {
        name: `Green ${keyColor} @${tolerance}`, kind: 'video',
        config: { type: 'greenscreen', keyColor, tolerance, softness },
      });
      toast('📋 Template saved');
      loadTemplates();
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  return (
    <FeatureShell title="Ocean Creation Lab" badge="257 · tiktok tools" icon={<Wand2 size={18} className="text-fuchsia-700 dark:text-fuchsia-400" />} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {([['green', 'Green screen', null], ['duet', 'Duet / Stitch', null], ['beat', 'Beat sync', null], ['ar', 'AR filters', null], ['tpl', 'Templates', null]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${tab === id ? 'bg-fuchsia-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'ar' && <ARFaceFilters />}

      {tab === 'green' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Clapperboard size={11} /> Chroma key canvas</p>
            <canvas ref={canvasRef} width={480} height={640} className="w-full rounded-xl bg-black max-h-96 object-contain" />
            <div className="flex gap-1.5 mt-2">
              <label className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[#ebdcca] dark:border-zinc-700 py-2 text-[10px] font-bold text-[#8a8172] cursor-pointer hover:border-fuchsia-400">
                <ImagePlus size={12} /> Photo / video
                <input type="file" accept="image/*,video/*" className="hidden" onChange={pickMedia} />
              </label>
              <button onClick={capturePng} className="flex-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold py-2"><Download size={11} className="inline mr-1" />Frame PNG</button>
              <button onClick={recording ? () => recRef.current?.stop() : startRecord}
                className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold py-2">
                {recording ? <><Square size={11} className="inline mr-1" />Stop</> : <><Video size={11} className="inline mr-1" />Record 6s</>}
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Key color</p>
              <div className="flex items-center gap-2">
                <input type="color" value={keyColor} onChange={(e) => setKeyColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[#ebdcca] dark:border-zinc-700 cursor-pointer" />
                <span className="font-mono text-[10px] text-[#8a8172]">{keyColor}</span>
                <button onClick={() => setKeyColor('#00b140')} className="ml-auto text-[9px] rounded-lg bg-emerald-600 text-white px-2 py-1 font-bold">Standard green</button>
              </div>
              {([['Tolerance', tolerance, setTolerance], ['Softness', softness, setSoftness]] as const).map(([label, val, set]) => (
                <label key={label} className="flex items-center gap-2 mt-2 text-[10px] text-[#8a8172] font-bold">
                  {label} <input type="range" min={0} max={200} value={val} onChange={(e) => set(Number(e.target.value))} className="flex-1" />
                  <span className="font-mono w-8 text-right">{val}</span>
                </label>
              ))}
              <button onClick={() => setFaceMode(!faceMode)}
                className={`mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[10px] font-bold transition-all ${faceMode ? 'border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-700 dark:text-fuchsia-300' : 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                <ScanFace size={12} /> AR overlay {faceMode ? 'ON' : 'OFF'}
              </button>
              <p className="text-[8px] text-[#8a8172] mt-1.5">Real per-pixel chroma key on canvas — recorded clips come out with the background removed.</p>
            </div>
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><LayoutTemplate size={11} /> Save as template</p>
              <button onClick={saveTemplate} className="w-full rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-bold py-2">Save current settings</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'duet' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Side-by-side duet</p>
            <canvas ref={duetCanvasRef} width={480} height={640} className="w-full rounded-xl bg-black max-h-96" />
            <div className="flex gap-1.5 mt-2">
              <label className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 py-2 text-[9px] font-bold text-[#8a8172] cursor-pointer hover:border-fuchsia-400">
                {leftSrc ? 'Left ✓' : 'Left video'} <input type="file" accept="video/*" className="hidden" onChange={pickDuet('left')} />
              </label>
              <label className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 py-2 text-[9px] font-bold text-[#8a8172] cursor-pointer hover:border-fuchsia-400">
                {rightSrc ? 'Right ✓' : 'Right video'} <input type="file" accept="video/*" className="hidden" onChange={pickDuet('right')} />
              </label>
              <button onClick={recordDuet} disabled={!leftSrc && !rightSrc} className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-[9px] font-bold py-2"><Video size={11} className="inline mr-1" />Record</button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Music4 size={11} /> Auto beat sync</p>
              <label className="w-full flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[#ebdcca] dark:border-zinc-700 py-2.5 text-[10px] font-bold text-[#8a8172] cursor-pointer hover:border-fuchsia-400">
                <Play size={12} /> Load a song to detect BPM
                <input type="file" accept="audio/*" className="hidden" onChange={detectBpm} />
              </label>
              {bpm && (
                <div className="mt-2 rounded-xl bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-3 text-center">
                  <p className="text-2xl font-bold text-fuchsia-600 dark:text-fuchsia-400">{bpm} <span className="text-[10px] text-[#8a8172]">BPM</span></p>
                  <p className="text-[9px] text-[#8a8172] mt-1">Beat length: {(60 / bpm).toFixed(2)}s — cut duet clips to this length for on-beat transitions.</p>
                </div>
              )}
              <p className="text-[8px] text-[#8a8172] mt-1.5">Onset-energy peak detection via WebAudio — no upload, works offline.</p>
            </div>
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">How it composes</p>
              <p className="text-[9px] text-[#8a8172] leading-relaxed">Both clips are drawn onto one canvas side-by-side and recorded with MediaRecorder (webm). Trim them first in Ocean Cut (#250) to the beat length for a perfectly synced stitch.</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'tpl' && (
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2">Saved Creation Lab templates</p>
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2 border-b border-[#ebdcca]/60 dark:border-zinc-800 last:border-0">
              <LayoutTemplate size={13} className="text-[#8a8172]" />
              <div className="flex-1">
                <p className="text-[11px] font-bold text-[#3a342a] dark:text-zinc-100">{t.name}</p>
                <p className="text-[8px] font-mono text-[#8a8172]">{JSON.stringify(t.config).slice(0, 90)}</p>
              </div>
              <span className="text-[8px] text-[#8a8172] font-mono uppercase">{t.kind}</span>
            </div>
          ))}
          {templates.length === 0 && <p className="text-[9px] text-[#8a8172] italic">No templates yet — save one from the Green screen tab.</p>}
        </div>
      )}
    </FeatureShell>
  );
}
