import { useEffect, useRef, useState } from 'react';
import { X, Wind, SkipForward, Info } from 'lucide-react';

/**
 * Ocean — "Take a Breath" Interstitial (Feature 158, client-only)
 * Detects rapid scrolling (big scroll distance in a short window, twice in a row)
 * and interrupts with a 10-second breathing overlay. No backend.
 */
interface TakeABreathProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const LS_FLAG = 'ocean_breath_enabled';
const RAPID_WINDOW_MS = 6000;
const RAPID_DISTANCE = 2600; // px scrolled per window
const BREATH_SECONDS = 10;

type Phase = 'inhale' | 'hold' | 'exhale';

export default function TakeABreath({ onClose }: TakeABreathProps) {
  const [enabled, setEnabled] = useState<boolean>(() => localStorage.getItem(LS_FLAG) !== '0');
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('inhale');
  const [countdown, setCountdown] = useState(BREATH_SECONDS);
  const [rapidCount, setRapidCount] = useState(0);
  const windowStart = useRef(Date.now());
  const distance = useRef(0);
  const breathTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_FLAG, enabled ? '1' : '0');
  }, [enabled]);

  // Rapid-scroll detector (global).
  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => {
      if (active) return;
      const now = Date.now();
      if (now - windowStart.current >= RAPID_WINDOW_MS) {
        windowStart.current = now;
        distance.current = 0;
      }
      distance.current += Math.abs(window.scrollY - (window.__lastScrollY || window.scrollY));
      window.__lastScrollY = window.scrollY;
      if (distance.current >= RAPID_DISTANCE) {
        setRapidCount((c) => c + 1);
        windowStart.current = now;
        distance.current = 0;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled, active]);

  // Trigger on the SECOND rapid-scroll window.
  useEffect(() => {
    if (rapidCount >= 2 && enabled) {
      setRapidCount(0);
      setActive(true);
      setCountdown(BREATH_SECONDS);
    }
  }, [rapidCount, enabled]);

  // Breathing cycle: inhale 4s -> hold 4s -> exhale (until 10s total).
  useEffect(() => {
    if (!active) return;
    setPhase('inhale');
    const phaseMap: { at: number; phase: Phase }[] = [
      { at: 4, phase: 'hold' },
      { at: 8, phase: 'exhale' },
    ];
    let elapsed = 0;
    breathTimer.current = setInterval(() => {
      elapsed += 1;
      setCountdown(Math.max(0, BREATH_SECONDS - elapsed));
      const next = phaseMap.find((p) => elapsed === p.at);
      if (next) setPhase(next.phase);
      if (elapsed >= BREATH_SECONDS) {
        setActive(false);
      }
    }, 1000);
    return () => {
      if (breathTimer.current) clearInterval(breathTimer.current);
    };
  }, [active]);

  const scale = phase === 'inhale' ? 1 : phase === 'hold' ? 1.5 : 0.7;
  const phaseLabel = phase === 'inhale' ? 'Inhale deeply…' : phase === 'hold' ? 'Hold…' : 'Exhale slowly…';

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wind size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Take a Breath</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 158</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-[12px] text-[#3a342a] dark:text-zinc-100">Rapid-scroll breathing break</p>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">Two fast-scroll windows in a row trigger a 10s pause</p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative w-12 h-7 rounded-full transition-colors ${enabled ? 'bg-teal-600' : 'bg-[#d8cdb8] dark:bg-zinc-700'}`}
              aria-label="Toggle breath break"
            >
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-center">
            <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">Preview</p>
            <div className="flex items-center justify-center gap-6">
              <div
                className="w-24 h-24 rounded-full border-4 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 transition-transform duration-[3000ms]"
                style={{ transform: `scale(${scale})` }}
              />
              <div className="text-left">
                <p className="font-bold text-[13px] text-[#3a342a] dark:text-zinc-100">{phaseLabel}</p>
                <p className="font-mono text-[10px] text-[#8a8172] dark:text-zinc-500">{countdown}s remaining</p>
                <p className="flex items-center gap-1 text-[9px] text-[#8a8172] dark:text-zinc-500 mt-1"><Info size={9} /> The real interstitial shows when it triggers.</p>
              </div>
            </div>
          </div>
        </div>

        {active && (
          <div className="fixed inset-0 z-[130] bg-[#141b2b]/65 dark:bg-[#05060c]/85 flex flex-col items-center justify-center p-6">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400 mb-4">Scroll-check</p>
            <div
              className="w-40 h-40 rounded-full border-4 border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center transition-transform duration-[4000ms]"
              style={{ transform: `scale(${scale})` }}
            >
              <span className="font-display font-black text-2xl text-teal-700 dark:text-teal-300">{countdown}</span>
            </div>
            <p className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 mt-5">{phaseLabel}</p>
            <p className="text-[11px] text-[#8a8172] dark:text-zinc-400 mt-1">You've been scrolling fast. Breathe with the circle.</p>
            <button
              onClick={() => setActive(false)}
              className="mt-6 flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300 text-[11px] font-bold hover:border-amber-400 transition-all"
            >
              <SkipForward size={12} /> Skip (I'm okay)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// tiny ambient typing augmentation
declare global {
  interface Window {
    __lastScrollY?: number;
  }
}
