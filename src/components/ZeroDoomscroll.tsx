import { useEffect, useRef, useState } from 'react';
import { X, Timer, Coffee, ThumbsUp, Settings } from 'lucide-react';

/**
 * Ocean — Zero Doomscroll Mode (Feature 153, client-only)
 * Tracks active feed time; after the threshold (default 30 min) a modal asks
 * you to take a break. All state lives in localStorage.
 */
interface ZeroDoomscrollProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const LS_KEY = 'ocean_doomscroll_threshold';

export default function ZeroDoomscroll({ onClose }: ZeroDoomscrollProps) {
  const [threshold, setThreshold] = useState<number>(() => Number(localStorage.getItem(LS_KEY) || 30));
  const [armed, setArmed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [continueMins, setContinueMins] = useState(10);
  const lastActive = useRef<number>(Date.now());
  const activeAccum = useRef(0);
  const armedRef = useRef(false);

  const persist = (v: number) => {
    localStorage.setItem(LS_KEY, String(v));
    setThreshold(v);
  };

  const startTracking = () => {
    setArmed(true);
    setElapsed(0);
    setShowModal(false);
    lastActive.current = Date.now();
    activeAccum.current = 0;
  };

  useEffect(() => {
    if (!armedRef.current) return;
    const iv = setInterval(() => {
      const now = Date.now();
      const gap = now - lastActive.current;
      lastActive.current = now;
      // Only count time the tab is visible AND the user is actually active.
      if (document.visibilityState === 'visible') {
        activeAccum.current += gap;
        const mins = activeAccum.current / 60000;
        setElapsed(mins);
        if (mins >= threshold) {
          setShowModal(true);
          armedRef.current = false;
          setArmed(false);
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [threshold, armed]);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  const continueScrolling = () => {
    activeAccum.current = Math.max(0, activeAccum.current - continueMins * 60000);
    setElapsed(activeAccum.current / 60000);
    setShowModal(false);
    setArmed(true);
  };

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/97 dark:bg-zinc-950/97 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Timer size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Zero Doomscroll</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 153</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            When you've been scrolling the feed for too long, Ocean interrupts — no guilt, just a breath.
            Active time is counted only while the tab is visible and you're engaging.
          </p>
          <label className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 flex items-center gap-1"><Settings size={10} /> Doomscroll limit (minutes)</label>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={threshold}
            onChange={(e) => persist(Number(e.target.value))}
            className="w-full accent-amber-700 dark:accent-amber-400 mt-1 mb-1"
          />
          <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 mb-3">{threshold} minutes</p>

          {!armed ? (
            <button onClick={startTracking} className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-3 hover:brightness-110 transition-all">
              Start tracking session
            </button>
          ) : (
            <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-3 text-center">
              <p className="font-display font-black text-2xl text-[#3a342a] dark:text-zinc-100">{Math.floor(elapsed)}m {Math.round((elapsed % 1) * 60)}s</p>
              <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">active scroll time / {threshold}m</p>
              <button onClick={() => { setArmed(false); armedRef.current = false; }} className="mt-2 text-[10px] font-bold text-[#8a8172] hover:text-rose-600 transition-colors">Stop session</button>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-sm w-full rounded-3xl border border-[#ebdcca] dark:border-zinc-700 bg-[#fcfaf4] dark:bg-zinc-900 p-6 text-center shadow-2xl">
              <Coffee size={30} className="mx-auto text-amber-700 dark:text-amber-400 mb-3" />
              <p className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 mb-1">You've been scrolling for {threshold} minutes</p>
              <p className="text-[11px] text-[#8a8172] dark:text-zinc-400 mb-4">Stand up, stretch, drink some water. The feed will be here when you're back.</p>
              <div className="flex gap-2">
                <button onClick={() => { setShowModal(false); setArmed(false); }} className="flex-1 rounded-xl bg-emerald-600 text-white font-bold text-[12px] py-2.5 hover:brightness-110 transition-all">
                  <span className="flex items-center justify-center gap-1"><ThumbsUp size={13} /> Take a break</span>
                </button>
                <button onClick={continueScrolling} className="flex-1 rounded-xl border border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300 font-bold text-[12px] py-2.5 hover:border-amber-400 transition-all">
                  +{continueMins} min
                </button>
              </div>
              <p className="text-[9px] text-[#b9a98c] dark:text-zinc-600 mt-3">Limit: <input type="range" min={5} max={30} step={5} value={continueMins} onChange={(e) => setContinueMins(Number(e.target.value))} className="w-20 accent-amber-700 align-middle" /> {continueMins}m</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
