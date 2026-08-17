import { useEffect, useRef, useState } from 'react';
import { X, ScanFace, Activity, ShieldCheck, RotateCcw } from 'lucide-react';

/**
 * Ocean — Humanity Score (Feature 137)
 * Collects REAL behavioral samples for a few seconds (click rhythm, typing
 * rhythm, scroll cadence, pointer smoothness, burst control) then POSTs only
 * derived aggregates to /api/auth/humanity-score. Never sends raw input.
 */
interface HumanityScoreProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

interface Breakdown {
  clickRhythm: number;
  typingRhythm: number;
  scrollCadence: number;
  pointerSmoothness: number;
  burstControl: number;
  sessionPacing: number;
}

interface Result {
  score: number;
  tier: string;
  breakdown: Breakdown;
  sampleCount: number;
}

const SAMPLE_MS = 6000;
const CAPTURE_MS = 6000;

export default function HumanityScore({ token, currentUser, onClose }: HumanityScoreProps) {
  const [phase, setPhase] = useState<'idle' | 'collecting' | 'scored' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<{ score: number; tier: string; sampledAt: number }[]>([]);

  const clicks = useRef<number[]>([]);
  const keys = useRef<number[]>([]);
  const scrolls = useRef<number[]>([]);
  const pointers = useRef<number[]>([]);
  const listeners = useRef<(() => void)[]>([]);

  const stdDev = (arr: number[]) => {
    if (arr.length < 2) return undefined;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  };

  const maxBurst = (arr: number[]) => {
    if (arr.length < 2) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    let max = 1;
    for (let i = 0; i < sorted.length; i++) {
      let j = i;
      while (j < sorted.length && sorted[j] - sorted[i] <= 2000) j++;
      max = Math.max(max, j - i);
    }
    return max;
  };

  const stdIntervals = (arr: number[]) => {
    if (arr.length < 3) return undefined;
    const diffs = [];
    for (let i = 1; i < arr.length; i++) diffs.push(arr[i] - arr[i - 1]);
    return stdDev(diffs);
  };

  const beginCollection = () => {
    setPhase('collecting');
    setError('');
    setProgress(0);
    clicks.current = [];
    keys.current = [];
    scrolls.current = [];
    pointers.current = [];
    const started = performance.now();
    let lastPointer: { t: number; x: number; y: number } | null = null;

    const onMouseDown = () => clicks.current.push(performance.now());
    const onKeyDown = () => keys.current.push(performance.now());
    const onWheel = (e: WheelEvent) => scrolls.current.push(e.deltaY);
    const onMove = (e: MouseEvent) => {
      if (lastPointer) {
        const dt = (e.timeStamp - lastPointer.t) / 1000 || 0.001;
        const dx = e.clientX - lastPointer.x;
        const dy = e.clientY - lastPointer.y;
        pointers.current.push(Math.sqrt(dx * dx + dy * dy) / dt);
      }
      lastPointer = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel);
    window.addEventListener('mousemove', onMove);
    listeners.current = [() => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMove);
    }];

    const iv = setInterval(() => {
      const pct = Math.min(100, Math.round(((performance.now() - started) / CAPTURE_MS) * 100));
      setProgress(pct);
      if (performance.now() - started >= CAPTURE_MS) {
        clearInterval(iv);
        listeners.current.forEach((fn) => fn());
        const samples = {
          clickIntervalStdMs: stdIntervals(clicks.current),
          maxClickBurst: maxBurst(clicks.current),
          typingIntervalStdMs: stdIntervals(keys.current),
          scrollDeltaStdPx: stdDev(scrolls.current),
          pointerSpeedStd: stdDev(pointers.current),
          sessionSeconds: SAMPLE_MS / 1000,
          sampleCount: clicks.current.length + keys.current.length + scrolls.current.length + pointers.current.length,
        };
        submit(samples);
      }
    }, 150);
  };

  const submit = async (samples: Record<string, number | undefined>) => {
    try {
      const res = await fetch('/api/auth/humanity-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ samples }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scoring failed');
      setResult(data);
      setPhase('scored');
      loadHistory();
    } catch (e: any) {
      setError(e.message || 'Scoring failed');
      setPhase('error');
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/auth/humanity-score', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setHistory((data.history || []).map((h: any) => ({ score: h.score, tier: h.tier, sampledAt: h.sampledAt })));
    } catch {
      /* non-fatal */
    }
  };

  const reset = async () => {
    try {
      await fetch('/api/auth/humanity-reset', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* non-fatal */ }
    setResult(null);
    setHistory([]);
    setPhase('idle');
  };

  useEffect(() => () => listeners.current.forEach((fn) => fn()), []);

  const tierColor = (t: string) =>
    t === 'high' ? 'text-emerald-700 dark:text-emerald-400' : t === 'medium' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400';

  const rows = result
    ? [
        ['Click rhythm', result.breakdown.clickRhythm],
        ['Typing rhythm', result.breakdown.typingRhythm],
        ['Scroll cadence', result.breakdown.scrollCadence],
        ['Pointer smoothness', result.breakdown.pointerSmoothness],
        ['Burst control', result.breakdown.burstControl],
        ['Session pacing', result.breakdown.sessionPacing],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScanFace size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Humanity Score</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 137</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
            Prove you're human with <strong>behavioral biometrics</strong>. Ocean samples your click rhythm, typing
            cadence, scroll pattern and pointer smoothness for a few seconds — bots are metronomically even; people aren't.
            Only derived aggregates leave your device. No keystrokes or input content are ever transmitted.
          </p>
        </div>

        {!currentUser && (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 text-[11px] text-amber-800 dark:text-amber-300 mb-3">
            Log in to collect a Humanity Score.
          </div>
        )}

        {phase === 'collecting' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-6 text-center">
            <Activity size={28} className="mx-auto text-amber-700 dark:text-amber-400 animate-pulse mb-2" />
            <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100 mb-1">Collecting behavioral samples…</p>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-400 mb-3">            Click, type and scroll naturally for {SAMPLE_MS / 1000} seconds</p>
            <div className="h-2 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-amber-700 transition-all duration-150" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {phase === 'idle' && currentUser && (
          <button
            onClick={beginCollection}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-3.5 hover:brightness-110 transition-all shadow-sm"
          >
            Begin {SAMPLE_MS / 1000}-second sample
          </button>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-[11px] text-rose-700 dark:text-rose-300 mb-3">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-full border-2 border-amber-600 dark:border-amber-400 flex items-center justify-center font-display font-black text-lg text-[#3a342a] dark:text-zinc-100">
                {result.score}
              </div>
              <div>
                <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100">
                  {result.tier === 'high' ? 'High humanity' : result.tier === 'medium' ? 'Medium humanity' : 'Low humanity'}
                </p>
                <p className={`font-mono text-[9px] uppercase tracking-widest ${tierColor(result.tier)}`}>{result.tier} tier</p>
                <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">{result.sampleCount} samples analyzed</p>
              </div>
              <button onClick={reset} className="ml-auto flex items-center gap-1 text-[10px] text-[#8a8172] dark:text-zinc-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors" title="Reset my history">
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {rows.map(([label, val]) => (
                <div key={label as string} className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">{label}</span>
                    <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">{val}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#ebdcca] dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-amber-600 dark:bg-amber-400" style={{ width: `${val}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {result.tier === 'low' && (
              <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-3 flex items-center gap-1">
                <ShieldCheck size={12} /> Low scores are used to spot bot accounts — repeat the sample with more natural movement.
              </p>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Recent samples</p>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] text-[#5c5446] dark:text-zinc-300 border-b border-[#f0e8da] dark:border-zinc-800 pb-1">
                  <span>{new Date(h.sampledAt).toLocaleString()}</span>
                  <span className={`font-bold ${tierColor(h.tier)}`}>{h.score} · {h.tier}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
