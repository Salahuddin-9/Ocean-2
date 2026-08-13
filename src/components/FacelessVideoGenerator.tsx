import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clapperboard, Sparkles, Download, Play, Pause, X, Film, History, Volume2, Loader2, Type, Mic, Wand2,
  Image as ImageIcon,
} from 'lucide-react';

/**
 * Ocean — "Faceless" AI Video Generator
 * --------------------------------------
 * Frontend for /api/ai/faceless-video*. Takes a topic + duration + style, POSTs to
 * the backend which writes a split-scene voiceover script (LLM or template) and —
 * when the server has ffmpeg — assembles a placeholder MP4. This component shows
 * the scene cards, offers a local animated "Render scenes" preview when no MP4 was
 * rendered, lets you read each voiceover aloud (client-speech TTS), and lists your
 * past generations.
 */

interface FacelessScene {
  index: number;
  voiceover: string;
  visual: string;
  onscreenText: string;
  durationSec: number;
  color: string;
}

interface FacelessPlan {
  id: string;
  userId?: string;
  topic: string;
  style: string;
  durationSec: number;
  scenes: FacelessScene[];
  script: string;
  mode: 'gemini' | 'template';
  tts?: { mode: string; note?: string };
  assembly: 'rendered' | 'ffmpeg-required';
  videoUrl?: string | null;
  createdAt: number;
}

interface FacelessVideoGeneratorProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const STYLES = ['motivational', 'educational', 'storytelling', 'fun', 'cinematic', 'documentary'];
const DURATIONS = [15, 30, 45, 60, 90];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function FacelessVideoGenerator({ token, currentUser, onClose }: FacelessVideoGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(30);
  const [style, setStyle] = useState('motivational');
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<FacelessPlan | null>(null);
  const [history, setHistory] = useState<FacelessPlan[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  // Same local api helper as EmergencyView — relative fetch, Bearer token.
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
    return res.json();
  };

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await api('/api/ai/faceless-video', 'GET');
      setHistory(data.plans || []);
    } catch {
      /* ignore — history is best-effort */
    }
    setLoadingHistory(false);
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const generate = async () => {
    if (!topic.trim()) return toast('Enter a topic first.');
    setGenerating(true);
    setError('');
    setPlaying(false);
    setActiveScene(0);
    try {
      const data = await api('/api/ai/faceless-video', 'POST', {
        topic: topic.trim(),
        durationSec: duration,
        style,
      });
      setPlan(data.plan);
      loadHistory();
    } catch (e: any) {
      const msg = e.message || 'Generation failed.';
      setError(msg);
      toast(msg, 'destructive');
    } finally {
      setGenerating(false);
    }
  };

  const openPlan = (p: FacelessPlan) => {
    setPlan(p);
    setActiveScene(0);
    setPlaying(false);
  };

  // Auto-advance the local scene preview at each scene's durationSec.
  useEffect(() => {
    if (!playing || !plan || plan.scenes.length === 0) return;
    const secs = Math.max(2, plan.scenes[activeScene]?.durationSec || 3);
    const t = setTimeout(() => setActiveScene((a) => (a + 1) % plan.scenes.length), secs * 1000);
    return () => clearTimeout(t);
  }, [playing, plan, activeScene]);

  // Client-side speech (matches the backend's "client-speech" TTS plan).
  const speak = (text: string) => {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  };

  // -------------------------------------------------------------------------
  // Self-contained local renderer (no server ffmpeg needed): Canvas slides +
  // Web Speech TTS narration, captured with MediaRecorder into a downloadable
  // WebM. Every frame carries the visible "AI GENERATED BY OCEAN" watermark.
  // Note: browsers cannot capture speechSynthesis output into the file, so the
  // voiceover is narrated live while the slide video is recorded.
  // -------------------------------------------------------------------------
  const renderSceneToCanvas = (canvas: HTMLCanvasElement, s: FacelessScene, p: FacelessPlan) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, s.color);
    grad.addColorStop(1, '#0d0b09');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = 'bold 64px Georgia, serif';
    wrapText(ctx, s.onscreenText || s.visual || p.topic, w / 2, h / 2 - 60, w - 180, 78, 64);
    ctx.font = '28px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`Scene ${s.index} / ${p.scenes.length}`, w / 2, h - 170);
    // Visible synthetic-media watermark (Feature 242).
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 68, w, 68);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px ui-monospace, monospace';
    ctx.fillText('AI GENERATED BY OCEAN', w / 2, h - 27);
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, baseSize: number) => {
    ctx.font = `bold ${baseSize}px Georgia, serif`;
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let lineY = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, lineY);
  };

  const stopRecording = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') mediaRecRef.current.stop();
    setRecording(false);
  };

  const recordLocalVideo = async () => {
    if (!plan || recording) return;
    if (typeof MediaRecorder === 'undefined') {
      return toast('MediaRecorder is not supported in this browser — use the server render or the preview.', 'destructive');
    }
    if (recordedUrl) { try { URL.revokeObjectURL(recordedUrl); } catch { /* ignore */ } }
    setRecording(true);
    setRecordedUrl(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const stream = canvas.captureStream(30);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      mediaRecRef.current = rec;
      recChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recChunksRef.current, { type: mime });
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start(250);
      for (const s of plan.scenes) {
        if (rec.state === 'inactive') break;
        renderSceneToCanvas(canvas, s, plan);
        speak(s.voiceover);
        await new Promise((r) => setTimeout(r, Math.max(2000, s.durationSec * 1000)));
      }
      await new Promise((r) => setTimeout(r, 900));
      if (rec.state !== 'inactive') rec.stop();
      setRecording(false);
      toast('Local render complete — downloadable reel (slides + live TTS narration).');
    } catch (e: any) {
      setRecording(false);
      toast('Recording failed: ' + (e.message || e), 'destructive');
    }
  };

  const scene = plan?.scenes[activeScene];

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-full bg-amber-800/10 flex items-center justify-center">
            <Clapperboard className="text-amber-800 dark:text-amber-400" size={18} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Faceless Video Generator</h2>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              Topic → script → downloadable reel
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 flex items-center justify-center hover:bg-[#ebdcca]/70 transition-colors"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Generate card */}
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Wand2 className="text-amber-800 dark:text-amber-400" size={16} />
          <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">New faceless reel</h3>
        </div>
        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Describe a topic — the generator writes a split-scene voiceover script, plans the B-roll and on-screen
          captions, then (when the server has <b>ffmpeg</b>) assembles a placeholder 1280×720 MP4 you can download.
        </p>

        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] block mb-1">Topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') generate(); }}
            placeholder="e.g. How to start a YouTube channel"
            className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] block mb-1">Duration</label>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`font-mono text-[9px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full transition-all ${
                  duration === d
                    ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                    : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] block mb-1">Style</label>
          <div className="flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`font-mono text-[9px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full transition-all ${
                  style === s
                    ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                    : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={generate}
          disabled={generating || !topic.trim()}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50 w-full"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? 'Generating…' : 'Generate script'}
        </button>
        {error && <p className="text-[10px] font-mono text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {/* Result card */}
      <AnimatePresence>
        {plan && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{plan.topic}</h3>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                  {plan.style} · {plan.durationSec}s · {plan.scenes.length} scenes · {timeAgo(plan.createdAt)}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
                  {plan.mode === 'gemini' ? 'AI script' : 'template'}
                </span>
                <span
                  className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full ${
                    plan.assembly === 'rendered'
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                  }`}
                  title={
                    plan.assembly === 'rendered'
                      ? 'MP4 rendered with ffmpeg'
                      : 'No ffmpeg on the server — preview the scenes locally instead'
                  }
                >
                  {plan.assembly === 'rendered' ? 'mp4 ready' : 'ffmpeg-required'}
                </span>
              </div>
            </div>

            {/* Preview / download — video when rendered, local animated preview otherwise */}
            {plan.assembly === 'rendered' && plan.videoUrl ? (
              <div className="space-y-2">
                <video
                  src={plan.videoUrl}
                  controls
                  playsInline
                  className="w-full rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-black aspect-video"
                />
                <a
                  href={plan.videoUrl}
                  download
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] w-full"
                >
                  <Download size={12} /> Download reel (.mp4)
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <div
                  className="rounded-2xl overflow-hidden border border-[#ebdcca] dark:border-zinc-800 aspect-video"
                  style={{ background: scene?.color || '#3a342a' }}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={scene?.index}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center"
                    >
                      <span className="text-white text-lg md:text-2xl font-display font-bold tracking-wide drop-shadow">
                        {scene?.onscreenText || ''}
                      </span>
                      <span className="text-white/70 text-[10px] font-mono uppercase">
                        {scene ? `Scene ${scene.index} / ${plan.scenes.length} · ${scene.durationSec}s` : ''}
                      </span>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                  >
                    {playing ? <Pause size={12} /> : <Play size={12} />}
                    {playing ? 'Pause' : 'Render scenes'}
                  </button>
                  <div className="flex gap-1 ml-1">
                    {plan.scenes.map((s) => (
                      <button
                        key={s.index}
                        onClick={() => setActiveScene(s.index - 1)}
                        title={`Scene ${s.index}`}
                        className={`w-6 h-1.5 rounded-full transition-colors ${
                          activeScene === s.index - 1 ? 'bg-amber-700 dark:bg-amber-400' : 'bg-[#ebdcca] dark:bg-zinc-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">
                    local preview
                  </span>
                </div>
                <div className="rounded-2xl border border-amber-300/60 dark:border-amber-700/40 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-2">
                  <div className="font-mono text-[9px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <Clapperboard size={11} /> Record locally — no server ffmpeg needed
                  </div>
                  {recordedUrl ? (
                    <div className="space-y-2">
                      <video src={recordedUrl} controls playsInline className="w-full rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-black aspect-video" />
                      <a
                        href={recordedUrl}
                        download={`ocean-${plan.topic.slice(0, 24).replace(/[^a-z0-9]+/gi, '-')}.webm`}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] w-full"
                      >
                        <Download size={12} /> Download reel (.webm)
                      </a>
                    </div>
                  ) : recording ? (
                    <button onClick={stopRecording} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-700 text-white text-[10px] font-mono uppercase font-bold w-full">
                      Stop recording ({Math.round(plan.durationSec)}s slide show in progress…)
                    </button>
                  ) : (
                    <button onClick={recordLocalVideo} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-800 text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-amber-900 w-full">
                      <Film size={12} /> Render scenes → video (TTS narrated)
                    </button>
                  )}
                  <p className="text-[9px] font-mono text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                    Draws each slide to a canvas with the visible “AI GENERATED BY OCEAN” watermark and records with MediaRecorder (~{plan.durationSec}s).
                    Voiceover plays live via Web Speech — browsers can't capture speechSynthesis into the file, so the WebM contains the narrated slides.
                  </p>
                </div>
              </div>
            )}

            {/* Scene cards */}
            <div className="space-y-2">
              {plan.scenes.map((s) => (
                <div
                  key={s.index}
                  className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                      <Film size={11} /> Scene {s.index} · {s.durationSec}s
                    </span>
                    <button
                      onClick={() => speak(s.voiceover)}
                      className="text-[#8a8172] hover:text-amber-800 dark:hover:text-amber-400 transition-colors"
                      title="Read voiceover aloud"
                    >
                      <Volume2 size={13} />
                    </button>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[#8a8172] mb-1">
                      <Mic size={10} /> Voiceover
                    </div>
                    <p className="text-xs text-[#3a342a] dark:text-zinc-100 leading-relaxed">{s.voiceover}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[#8a8172] mb-1">
                      <ImageIcon size={10} /> Visual
                    </div>
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">{s.visual}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[#8a8172] mb-1">
                      <Type size={10} /> Onscreen
                    </div>
                    <span
                      className="inline-flex px-2 py-1 rounded-lg text-[10px] font-bold font-mono uppercase"
                      style={{ background: s.color, color: '#f4f1ea' }}
                    >
                      {s.onscreenText || '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[#8a8172] mb-1">
                <Clapperboard size={10} /> Full script
              </div>
              <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed italic">{plan.script}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 space-y-3 shadow-xs">
        <div className="flex items-center gap-2">
          <History size={14} className="text-amber-800 dark:text-amber-400" />
          <h3 className="font-display text-sm font-bold text-[#3a342a] dark:text-zinc-100">Past generations</h3>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">{history.length}</span>
        </div>
        {loadingHistory ? (
          <div className="py-6 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
            Loading…
          </div>
        ) : history.length === 0 ? (
          <div className="py-6 text-center space-y-1">
            <Clapperboard className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
              No reels generated yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {history.map((p) => (
              <button
                key={p.id}
                onClick={() => openPlan(p)}
                className="w-full text-left rounded-xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 px-3 py-2 flex items-center gap-2 hover:border-amber-300 dark:hover:border-amber-800 transition-colors"
              >
                <span
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: p.scenes[0]?.color || '#3a342a' }}
                >
                  <Clapperboard size={11} className="text-[#f4f1ea]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-xs font-bold text-[#3a342a] dark:text-zinc-100">{p.topic}</span>
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    {p.style} · {p.durationSec}s · {p.scenes.length} scenes
                  </span>
                </span>
                <span
                  className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full ${
                    p.assembly === 'rendered'
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                  }`}
                >
                  {p.assembly === 'rendered' ? 'rendered' : 'scenes'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
