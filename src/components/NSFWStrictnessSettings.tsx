import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, SlidersHorizontal, Waves, Contrast, EyeOff } from 'lucide-react';

/**
 * Ocean — Content Moderation Sensitivity
 * --------------------------------------
 * Settings card for NSFW filtering strictness (1..100) and filter mode
 * (blur | grayscale | hide). Persists to localStorage ('ocean_nsfw_strictness',
 * 'ocean_nsfw_mode') and broadcasts 'nsfw-settings-changed' so any mounted
 * NSFW media guard can re-render. No required props — safe to drop anywhere.
 */

type NsfwMode = 'blur' | 'grayscale' | 'hide';

interface NSFWStrictnessSettingsProps {}

const STRICTNESS_KEY = 'ocean_nsfw_strictness';
const MODE_KEY = 'ocean_nsfw_mode';

const MODES: Array<{ id: NsfwMode; label: string; hint: string; icon: typeof Waves }> = [
  { id: 'blur', label: 'Blur', hint: 'Soften the image', icon: Waves },
  { id: 'grayscale', label: 'Grayscale', hint: 'Drop all color', icon: Contrast },
  { id: 'hide', label: 'Hide', hint: 'Remove entirely', icon: EyeOff },
];

function levelLabel(strictness: number): string {
  if (strictness < 30) return 'Lenient';
  if (strictness <= 70) return 'Balanced';
  return 'Strict';
}

function readStored(): { strictness: number; mode: NsfwMode } {
  let strictness = 50;
  let mode: NsfwMode = 'blur';
  try {
    const s = Number(localStorage.getItem(STRICTNESS_KEY));
    if (Number.isFinite(s) && s >= 1 && s <= 100) strictness = Math.round(s);
    const m = localStorage.getItem(MODE_KEY);
    if (m === 'blur' || m === 'grayscale' || m === 'hide') mode = m;
  } catch {
    /* localStorage unavailable (private mode) — use defaults */
  }
  return { strictness, mode };
}

export default function NSFWStrictnessSettings(_props: NSFWStrictnessSettingsProps = {}) {
  const [settings, setSettings] = useState<{ strictness: number; mode: NsfwMode }>(readStored);

  const commit = (next: Partial<{ strictness: number; mode: NsfwMode }>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    try {
      localStorage.setItem(STRICTNESS_KEY, String(merged.strictness));
      localStorage.setItem(MODE_KEY, merged.mode);
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent('nsfw-settings-changed', { detail: merged }));
  };

  return (
    <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 space-y-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="text-amber-800 dark:text-amber-400" size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Content moderation sensitivity</h2>
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">NSFW filtering level</p>
        </div>
      </div>

      <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
        Tune how aggressively Ocean screens photos and videos. A <b className="text-[#3a342a] dark:text-zinc-100">Strict</b> level
        also blurs borderline images, while <b className="text-[#3a342a] dark:text-zinc-100">Lenient</b> only blocks explicit
        content. The filter mode decides what happens to flagged media.
      </p>

      {/* Strictness slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
            <SlidersHorizontal size={11} /> Sensitivity
          </span>
          <span className="font-mono text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-800/10 dark:bg-amber-400/10 text-amber-800 dark:text-amber-400">
            {levelLabel(settings.strictness)} · {settings.strictness}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={settings.strictness}
          onChange={e => commit({ strictness: Number(e.target.value) })}
          aria-label="Content moderation sensitivity"
          className="w-full accent-amber-600 dark:accent-amber-400 cursor-pointer"
        />
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
          <span>Lenient</span>
          <span>Balanced</span>
          <span>Strict</span>
        </div>
      </div>

      {/* Filter mode buttons */}
      <div className="space-y-2">
        <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 block">
          Filter mode
        </span>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(m => {
            const Icon = m.icon;
            const active = settings.mode === m.id;
            return (
              <motion.button
                key={m.id}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => commit({ mode: m.id })}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border font-mono text-[9px] uppercase font-bold tracking-wider transition-all ${
                  active
                    ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 border-amber-800 dark:border-amber-400 shadow-sm'
                    : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 border-transparent hover:bg-[#ebdcca]/70 dark:hover:bg-zinc-700'
                }`}
              >
                <Icon size={14} />
                {m.label}
                <span className={`text-[8px] font-normal normal-case tracking-normal ${active ? 'opacity-80' : 'text-[#8a8172] dark:text-zinc-400'}`}>
                  {m.hint}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
