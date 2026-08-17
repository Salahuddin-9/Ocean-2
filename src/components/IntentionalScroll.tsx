import { useEffect, useState } from 'react';
import { X, TimerReset, HandHeart, Play, Square } from 'lucide-react';

/**
 * Ocean — Intentional Scroll Mode (Feature 154, client-only)
 * Before a scrolling session you set a time limit; Ocean gently reminds you when
 * it's up. The opposite of doomscrolling — you decide first.
 */
interface IntentionalScrollProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const LS_KEY = 'ocean_intentional_limit';

export default function IntentionalScroll({ onClose }: IntentionalScrollProps) {
  const [limit, setLimit] = useState<number>(() => Number(localStorage.getItem(LS_KEY) || 15));
  const [remaining, setRemaining] = useState<number | null>(null);
  const [reminder, setReminder] = useState(false);

  const start = () => {
    localStorage.setItem(LS_KEY, String(limit));
    setRemaining(limit * 60);
    setReminder(false);
  };

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      setRemaining(null);
      setReminder(true);
      return;
    }
    const t = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const mm = remaining === null ? '--' : String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = remaining === null ? '--' : String(remaining % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TimerReset size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Intentional Scroll</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 154</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-3">
            Decide your scroll time <strong>before</strong> you start — Ocean keeps a gentle countdown and
            reminds you when it's time to close the app.
          </p>
          <label className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">Session limit (minutes)</label>
          <input
            type="range"
            min={5}
            max={45}
            step={5}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full accent-amber-700 dark:accent-amber-400 mt-1 mb-1"
          />
          <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 mb-3">{limit} minutes</p>

          {remaining === null ? (
            <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 text-white font-bold text-[12px] py-3 hover:brightness-110 transition-all">
              <Play size={14} /> Start intentional session
            </button>
          ) : (
            <div className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-4 text-center">
              <p className="font-display font-black text-3xl text-[#3a342a] dark:text-zinc-100 tabular-nums">{mm}:{ss}</p>
              <p className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500 mb-2">remaining — scroll with intention</p>
              <button onClick={() => { setRemaining(null); setReminder(false); }} className="flex items-center gap-1 mx-auto text-[10px] font-bold text-[#8a8172] hover:text-rose-600 transition-colors">
                <Square size={10} /> End early
              </button>
            </div>
          )}
        </div>

        {reminder && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-center">
            <HandHeart size={24} className="mx-auto text-emerald-700 dark:text-emerald-400 mb-2" />
            <p className="font-bold text-[13px] text-emerald-800 dark:text-emerald-300">Time's up — nicely done.</p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400/80 mt-1">You set out to scroll for {limit} minutes and you kept your word. Come back refreshed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
