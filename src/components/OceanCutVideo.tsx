import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Clapperboard, Upload, Scissors, Gauge, Crop, Captions, Download, Film, Loader2, Rocket, Wand2, Zap } from 'lucide-react';
import FeatureShell, { toast, authHeaders } from './FeatureShell';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

interface Props {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface SubSegment { start: number; end: number; text: string }

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Normalize an FFmpeg readFile result (Uint8Array | string | File) into bytes. */
async function toBytes(d: Uint8Array | string | File): Promise<Uint8Array> {
  if (d instanceof Uint8Array) return d;
  return new Uint8Array(await new Blob([d as BlobPart]).arrayBuffer());
}

export default function OceanCutVideo({ token, currentUser, onClose }: Props) {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const workRef = useRef<Uint8Array | null>(null); // cumulative working copy
  const [srcUrl, setSrcUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [inT, setInT] = useState(0);
  const [outT, setOutT] = useState(0);
  const [cutA, setCutA] = useState(2);
  const [cutB, setCutB] = useState(5);
  const [speed, setSpeed] = useState(1);
  const [reelCrop, setReelCrop] = useState(false);
  const [transition, setTransition] = useState<'none' | 'fade' | 'zoom' | 'flip' | 'rotate'>('none');
  const [burnSubs, setBurnSubs] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [subs, setSubs] = useState<SubSegment[] | null>(null);
  const [subsMode, setSubsMode] = useState('');

  const pushLog = (m: string) => setLog((l) => `${l}\n${m}`.slice(-1200));

  useEffect(() => {
    if (ffmpegRef.current) return;
    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;
    ffmpeg.on('log', ({ message }) => { if (message && message.trim()) pushLog(message); });
    (async () => {
      try {
        pushLog('Loading FFmpeg.wasm core…');
        await ffmpeg.load({
          coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setReady(true);
        pushLog('✅ FFmpeg ready (in-browser, nothing uploaded).');
      } catch (e: any) {
        pushLog(`⛔ FFmpeg load failed: ${e?.message || e} (need internet for the wasm core).`);
      }
    })();
  }, []);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    workRef.current = new Uint8Array(await f.arrayBuffer());
    setFile(f);
    setSrcUrl(URL.createObjectURL(f));
    setInT(0); setOutT(0); setSubs(null); setTranscript('');
  };

  /** Input bytes for the next operation: the cumulative working copy, or the original file. */
  const getInput = async (): Promise<Uint8Array> => {
    if (workRef.current) return workRef.current;
    if (!file) throw new Error('No video loaded');
    workRef.current = new Uint8Array(await file.arrayBuffer());
    return workRef.current;
  };

  const run = useCallback(async (args: string[], label: string): Promise<void> => {
    const ffmpeg = ffmpegRef.current!;
    pushLog(`▶ ${label}`);
    await ffmpeg.exec(args);
  }, []);

  const writeIn = async (name: string, data: Uint8Array) => {
    await ffmpegRef.current!.deleteFile(name).catch(() => {});
    await ffmpegRef.current!.writeFile(name, data);
  };

  // ── trim ────────────────────────────────────────────────────────────────────
  const doTrim = async () => {
    if (!file || !ready) return;
    setBusy(true);
    try {
      const ffmpeg = ffmpegRef.current!;
      await writeIn('in.mp4', await getInput());
      const start = Math.max(0, inT), end = Math.min(duration || outT, outT);
      if (end <= start) { toast('⛔ End must be after start'); return; }
      await run(['-ss', String(start), '-to', String(end), '-i', 'in.mp4', '-c', 'copy', 'trim.mp4'], `Trim ${fmt(start)} → ${fmt(end)}`);
      const bytes = await toBytes(await ffmpeg.readFile('trim.mp4'));
      workRef.current = bytes;
      setSrcUrl(URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' })));
      setDuration(end - start); setInT(0); setOutT(end - start);
      toast('✅ Trimmed — working copy updated');
    } catch (e: any) { toast(`⛔ ${e?.message || 'Trim failed'}`); pushLog(`⛔ ${e?.message || e}`); }
    setBusy(false);
  };

  // ── cut middle segment ───────────────────────────────────────────────────────
  const doCut = async () => {
    if (!file && !srcUrl) { toast('⛔ Load a video first'); return; }
    if (!ready) return;
    setBusy(true);
    try {
      const ffmpeg = ffmpegRef.current!;
      await writeIn('in.mp4', await getInput());
      const total = duration;
      const a = Math.max(0, Math.min(cutA, total)), b = Math.min(Math.max(a + 0.5, cutB), total);
      if (b >= total) { toast('⛔ Cut end must be before the end'); return; }
      await run(['-ss', '0', '-to', String(a), '-i', 'in.mp4', '-c', 'copy', 'seg1.mp4'], `Segment 1 (0 → ${fmt(a)})`);
      await run(['-ss', String(b), '-i', 'in.mp4', '-c', 'copy', 'seg2.mp4'], `Segment 2 (${fmt(b)} → end)`);
      await writeIn('list.txt', new TextEncoder().encode("file 'seg1.mp4'\nfile 'seg2.mp4'\n"));
      await run(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'work.mp4'], 'Concatenate (delete middle)');
      const bytes = await toBytes(await ffmpeg.readFile('work.mp4'));
      workRef.current = bytes;
      setSrcUrl(URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' })));
      setDuration(total - (b - a)); setOutT(total - (b - a));
      toast(`✅ Removed ${fmt(b - a)} of middle footage`);
    } catch (e: any) { toast(`⛔ ${e?.message || 'Cut failed'}`); pushLog(`⛔ ${e?.message || e}`); }
    setBusy(false);
  };

  // ── speed ────────────────────────────────────────────────────────────────────
  const doSpeed = async () => {
    if (!file) { toast('⛔ Load a video first'); return; }
    if (!ready) return;
    setBusy(true);
    try {
      const ffmpeg = ffmpegRef.current!;
      await writeIn('in.mp4', await getInput());
      const vf = `setpts=${(1 / speed).toFixed(4)}*PTS`;
      // atempo supports 0.5–2.0 only; chain filters for >2
      let af = '';
      let s = speed;
      const chain: string[] = [];
      while (s > 2) { chain.push('atempo=2.0'); s /= 2; }
      chain.push(`atempo=${Math.max(0.5, s).toFixed(4)}`);
      af = chain.join(',');
      await run(['-i', 'in.mp4', '-filter:v', vf, '-filter:a', af, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', 'work.mp4'], `Speed ×${speed}`);
      const bytes = await toBytes(await ffmpeg.readFile('work.mp4'));
      workRef.current = bytes;
      setSrcUrl(URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' })));
      setDuration(duration / speed); setOutT(duration / speed);
      toast('✅ Speed applied');
    } catch (e: any) { toast(`⛔ ${e?.message || 'Speed failed'}`); pushLog(`⛔ ${e?.message || e}`); }
    setBusy(false);
  };

  // ── Bengali subtitles ──────────────────────────────────────────────────────────
  const genSubs = async () => {
    if (!transcript.trim()) { toast('⛔ Paste a transcript first'); return; }
    try {
      const res = await fetch('/api/ai/subtitle-bengali', {
        method: 'POST', headers: authHeaders(token), body: JSON.stringify({ text: transcript, language: 'bn' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Subtitle generation failed');
      setSubs(d.subtitles); setSubsMode(d.mode);
      toast(d.mode === 'llm' ? `✅ Gemini made ${d.subtitles.length} subtitle lines` : `ℹ️ ${d.note}`);
    } catch (e: any) { toast(`⛔ ${e.message}`); }
  };

  const applySubs = async () => {
    if (!subs || !file) { toast('⛔ Generate subtitles first'); return; }
    if (!ready) return;
    setBusy(true);
    try {
      const ffmpeg = ffmpegRef.current!;
      await writeIn('in.mp4', await getInput());
      const srt = subs.map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.text}\n`).join('\n');
      await writeIn('subs.srt', new TextEncoder().encode(srt));
      await run(['-i', 'in.mp4', '-i', 'subs.srt', '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=ben', 'work.mp4'], 'Mux Bengali soft subtitles');
      const bytes = await toBytes(await ffmpeg.readFile('work.mp4'));
      workRef.current = bytes;
      setSrcUrl(URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' })));
      toast('✅ Subtitles muxed (soft subs — toggle with the CC button)');
    } catch (e: any) { toast(`⛔ ${e?.message || 'Subtitle mux failed'}`); pushLog(`⛔ ${e?.message || e}`); }
    setBusy(false);
  };

  // ── export ─────────────────────────────────────────────────────────────────────
  const doExport = async () => {
    if (!ready || (!file && !srcUrl)) { toast('⛔ Load a video first'); return; }
    setBusy(true);
    try {
      const ffmpeg = ffmpegRef.current!;
      await writeIn('in.mp4', await getInput());
      const filters: string[] = [];
      if (reelCrop) filters.push('crop=min(iw\\,ih*9/16):ih');
      if (transition === 'fade') filters.push(`fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, duration - 0.6)}:d=0.6`);
      if (transition === 'zoom') filters.push("zoompan=z='min(zoom+0.0018,1.6)':d=1:s=1280x720:fps=30");
      if (transition === 'flip') filters.push('hflip');
      if (transition === 'rotate') filters.push('rotate=0.12*PI:c=black@0.0');
      if (burnSubs && subs) filters.push('subtitles=subs.srt');
      const args = ['-i', 'in.mp4'];
      if (burnSubs && subs) await writeIn('subs.srt', new TextEncoder().encode(subs.map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.text}\n`).join('\n')));
      if (filters.length) args.push('-vf', filters.join(','));
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', 'out.mp4');
      await run(args, `${reelCrop ? 'Reel crop' : 'Export'}${transition !== 'none' ? ` + ${transition} transition` : ''}${burnSubs && subs ? ' + burned subtitles' : ''}`);
      // Note: if the libass `subtitles` filter is missing from this wasm build, run()
      // throws and the outer catch falls back to a soft-subtitle mux pass.
      const bytes = await toBytes(await ffmpeg.readFile('out.mp4'));
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ocean-cut-${Date.now()}.mp4`;
      a.click();
      localStorage.setItem('ocean_reel_draft', a.href);
      toast('✅ Exported & downloaded — reel-ready!');
    } catch (e: any) {
      // burn-in fallback: subtitles filter unsupported → mux soft subs instead
      if (burnSubs && subs) {
        try {
          const ffmpeg = ffmpegRef.current!;
          await writeIn('in.mp4', await getInput());
          await writeIn('subs.srt', new TextEncoder().encode(subs.map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.text}\n`).join('\n')));
          await run(['-i', 'in.mp4', '-i', 'subs.srt', '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=ben', 'out.mp4'], 'Fallback: soft subtitle mux');
          const bytes = await toBytes(await ffmpeg.readFile('out.mp4'));
          const blob = new Blob([bytes], { type: 'video/mp4' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = `ocean-cut-${Date.now()}.mp4`; a.click();
          workRef.current = bytes;
          toast('✅ Exported with soft subtitles (burn-in unsupported by this wasm build)');
        } catch { toast(`⛔ ${e?.message || 'Export failed'}`); pushLog(`⛔ ${e?.message || e}`); }
      } else {
        toast(`⛔ ${e?.message || 'Export failed'}`); pushLog(`⛔ ${e?.message || e}`);
      }
    }
    setBusy(false);
  };

  const publishReel = async () => {
    if (!ready || (!file && !srcUrl)) { toast('⛔ Load a video first'); return; }
    setBusy(true);
    try {
      const bytes = workRef.current || new Uint8Array(await file!.arrayBuffer());
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const fd = new FormData();
      fd.append('file', blob, `reel-${Date.now()}.mp4`);
      const up = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const upData = await up.json();
      if (!up.ok || !upData.url) throw new Error(upData.error || 'Upload failed');
      const res = await fetch('/api/reels/upload', {
        method: 'POST', headers: authHeaders(token),
        body: JSON.stringify({ videoUrl: upData.url, caption: `🎬 Ocean Cut edit${subs ? ' · বাংলা সাবটাইটেল' : ''}`, audioUrl: '' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Publish failed');
      toast('📽️ Reel published to the feed!');
    } catch (e: any) { toast(`⛔ ${e.message}`); }
    setBusy(false);
  };

  return (
    <FeatureShell title="Ocean Cut — Video Editor" badge="250 · ffmpeg.wasm" icon={<Clapperboard size={18} className="text-rose-700 dark:text-rose-400" />} onClose={onClose}>
      <div className="grid md:grid-cols-2 gap-3">
        {/* left: source + preview */}
        <div className="space-y-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <label className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ebdcca] dark:border-zinc-700 py-4 text-[11px] font-bold text-[#8a8172] cursor-pointer hover:border-rose-400 transition-all">
              <Upload size={14} /> {file ? file.name : 'Choose a video (mp4/webm)'}
              <input type="file" accept="video/*" className="hidden" onChange={pickFile} />
            </label>
            {srcUrl && (
              <video
                key={srcUrl} ref={videoRef} src={srcUrl} controls className="mt-2 w-full rounded-xl bg-black max-h-64"
                onLoadedMetadata={() => {
                  const d = videoRef.current?.duration || 0;
                  if (d > 0) { setDuration(d); setOutT(d); setCutB(Math.min(5, d)); }
                }}
              />
            )}
            <p className="text-[8px] text-[#8a8172] mt-1.5">Duration: {fmt(duration)} · FFmpeg.wasm: {ready ? '✅' : '⏳ loading…'}</p>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Scissors size={11} /> Trim & cut</p>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <label className="text-[9px] text-[#8a8172]">In: <input type="number" min={0} step={0.5} value={inT} onChange={(e) => setInT(Number(e.target.value))} className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[11px] outline-none" /></label>
              <label className="text-[9px] text-[#8a8172]">Out: <input type="number" min={0} step={0.5} value={outT} onChange={(e) => setOutT(Number(e.target.value))} className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[11px] outline-none" /></label>
              <div className="flex items-end">
                <button onClick={doTrim} disabled={busy} className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold py-1.5 disabled:opacity-40">{busy ? <Loader2 size={11} className="animate-spin mx-auto" /> : 'Trim'}</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <label className="text-[9px] text-[#8a8172]">Cut from: <input type="number" min={0} step={0.5} value={cutA} onChange={(e) => setCutA(Number(e.target.value))} className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[11px] outline-none" /></label>
              <label className="text-[9px] text-[#8a8172]">to: <input type="number" min={0} step={0.5} value={cutB} onChange={(e) => setCutB(Number(e.target.value))} className="w-full rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[11px] outline-none" /></label>
              <div className="flex items-end">
                <button onClick={doCut} disabled={busy} className="w-full rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-bold py-1.5 disabled:opacity-40">{busy ? <Loader2 size={11} className="animate-spin mx-auto" /> : 'Delete'}</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <div className="flex items-center gap-2">
                <Gauge size={12} className="text-[#8a8172]" />
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-[11px] outline-none">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((s) => <option key={s} value={s}>×{s}</option>)}
                </select>
                <button onClick={doSpeed} disabled={busy} className="rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-bold px-3 py-1.5 disabled:opacity-40">Apply</button>
              </div>
              <button onClick={() => setReelCrop(!reelCrop)} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-all ${reelCrop ? 'border-rose-400 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                <Crop size={11} /> 9:16 reel crop
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Wand2 size={12} className="text-[#8a8172]" />
              <span className="text-[9px] text-[#8a8172] font-bold uppercase tracking-wider">Transition</span>
              <div className="flex gap-1">
                {([['none', 'None'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['flip', 'Flip'], ['rotate', 'Tilt']] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setTransition(v)} disabled={busy}
                    className={`rounded-lg px-2 py-1 text-[9px] font-bold transition-all disabled:opacity-40 ${transition === v ? 'bg-rose-600 text-white' : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#8a8172]'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {transition !== 'none' && <span className="text-[8px] text-[#8a8172]">applied on export (FFmpeg -vf)</span>}
            </div>
          </div>
        </div>

        {/* right: subtitles + export */}
        <div className="space-y-3">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Captions size={11} /> AI Bengali subtitles</p>
            <textarea
              value={transcript} onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste or type the video transcript (Bangla or English) — Gemini will time it into subtitle lines…"
              rows={4}
              className="w-full rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-[11px] text-[#3a342a] dark:text-zinc-100 outline-none focus:border-rose-400 resize-none"
            />
            <div className="flex gap-1.5 mt-1.5">
              <button onClick={genSubs} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold py-2 transition-all">Generate subtitles</button>
              <button onClick={applySubs} disabled={!subs || busy} className="flex-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-bold py-2 transition-all disabled:opacity-40">Mux into video</button>
            </div>
            <label className="mt-1.5 flex items-center gap-1.5 text-[9px] text-[#8a8172] font-bold cursor-pointer">
              <input type="checkbox" checked={burnSubs} onChange={(e) => setBurnSubs(e.target.checked)} className="accent-rose-600" />
              Burn Bengali subtitles into the video on export <Zap size={9} className="text-amber-500" />
            </label>
            {subs && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded-xl bg-black/5 dark:bg-zinc-800/60 p-2 space-y-1">
                <p className="text-[8px] text-[#8a8172] font-mono uppercase tracking-wider">{subsMode === 'llm' ? 'Gemini' : 'Local'} · {subs.length} lines</p>
                {subs.slice(0, 8).map((s, i) => (
                  <p key={i} className="text-[10px] text-[#3a342a] dark:text-zinc-300"><b>{fmt(s.start)}-{fmt(s.end)}</b> {s.text}</p>
                ))}
                {subs.length > 8 && <p className="text-[8px] text-[#8a8172]">+{subs.length - 8} more…</p>}
              </div>
            )}
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-2 flex items-center gap-1"><Film size={11} /> Export</p>
            <button onClick={doExport} disabled={busy || !ready} className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 transition-all disabled:opacity-40">
              {busy ? <><Loader2 size={13} className="animate-spin" /> Processing…</> : <><Download size={13} /> Export MP4</>}
            </button>
            <button onClick={publishReel} disabled={!srcUrl} className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[10px] font-bold py-2 transition-all disabled:opacity-40">
              <Rocket size={12} /> Queue as reel
            </button>
            <p className="text-[8px] text-[#8a8172] mt-1.5">Processing happens 100% in your browser via FFmpeg.wasm — no upload. Connect trending sounds from the Reels composer (#73).</p>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8a8172] mb-1.5">Console</p>
            <pre className="max-h-32 overflow-y-auto text-[9px] leading-relaxed text-emerald-700 dark:text-emerald-400 font-mono whitespace-pre-wrap">{log || 'Waiting…'}</pre>
          </div>
        </div>
      </div>
    </FeatureShell>
  );
}

function toSrtTime(s: number): string {
  const ms = Math.floor((s % 1) * 1000);
  const sec = Math.floor(s);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor((sec % 3600) / 60))}:${p(sec % 60)},${ms}`;
}
