import { useEffect, useState } from 'react';
import { X, Accessibility, MonitorPlay, Wand2, Contrast } from 'lucide-react';

/**
 * Ocean — Sensory-Safe Mode (Feature 157, client-only)
 * Toggles a global `.sensory-safe` class on <html>: CSS kills animations &
 * transitions, forces low-contrast calming colors, and the page gets a
 * "no autoplay" flag (ocean_autoplay_disabled) that video/reel components can honor.
 */
interface SensorySafeModeProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const LS_FLAG = 'ocean_sensory_safe';
const AUTOPLAY_FLAG = 'ocean_autoplay_disabled';

export default function SensorySafeMode({ onClose }: SensorySafeModeProps) {
  const [enabled, setEnabled] = useState<boolean>(() => localStorage.getItem(LS_FLAG) === '1');
  const [autoplayOff, setAutoplayOff] = useState<boolean>(() => localStorage.getItem(AUTOPLAY_FLAG) === '1');

  useEffect(() => {
    document.documentElement.classList.toggle('sensory-safe', enabled);
    localStorage.setItem(LS_FLAG, enabled ? '1' : '0');
    localStorage.setItem(AUTOPLAY_FLAG, autoplayOff ? '1' : '0');
  }, [enabled, autoplayOff]);

  useEffect(() => () => {
    // Cleanup on unmount only if the user never changed the toggle.
    if (localStorage.getItem(LS_FLAG) !== '1') document.documentElement.classList.remove('sensory-safe');
  }, []);

  const Switch = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-12 h-7 rounded-full transition-colors ${value ? 'bg-teal-600' : 'bg-[#d8cdb8] dark:bg-zinc-700'}`}
      aria-label={label}
    >
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[115] bg-[#141b2b]/60 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Accessibility size={18} className="text-amber-800 dark:text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">Sensory-Safe Mode</h2>
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">Feature 157</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 mb-3">
          <p className="text-[11px] text-[#5c5446] dark:text-zinc-300 leading-relaxed mb-4">
            A calmer Ocean: animations and transitions are disabled via a global CSS class,
            colors shift to a low-contrast palette, and videos never autoplay.
          </p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-3">
              <Wand2 size={16} className={enabled ? 'text-teal-600' : 'text-amber-700 dark:text-amber-400'} />
              <div className="flex-1">
                <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">Sensory-safe styling</p>
                <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">.sensory-safe on &lt;html&gt; · animations off · low contrast</p>
              </div>
              <Switch value={enabled} onChange={setEnabled} label="Sensory-safe styling" />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-[#ebdcca] dark:border-zinc-800 p-3">
              <MonitorPlay size={16} className={autoplayOff ? 'text-teal-600' : 'text-amber-700 dark:text-amber-400'} />
              <div className="flex-1">
                <p className="text-[12px] font-bold text-[#3a342a] dark:text-zinc-100">Disable autoplay</p>
                <p className="text-[9px] text-[#8a8172] dark:text-zinc-500">Videos & reels wait for a tap (ocean_autoplay_disabled)</p>
              </div>
              <Switch value={autoplayOff} onChange={setAutoplayOff} label="Disable autoplay" />
            </div>
          </div>

          {enabled && (
            <div className="mt-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                <Contrast size={12} /> Preview — this is what sensory-safe looks like
              </p>
              <div className="mt-2 h-2 w-24 rounded-full bg-[#c9c2b4] dark:bg-zinc-600" />
              <div className="mt-2 h-2 w-32 rounded-full bg-[#a8b8b0]" />
              <p className="text-[9px] text-teal-700/70 dark:text-teal-300/70 mt-1">Calm, muted tones · no motion</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
