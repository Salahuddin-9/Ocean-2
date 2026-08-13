/**
 * NSFW moderation sensitivity settings (ported from nsfw-filter's strictness
 * slider + filter-effect modes).
 *
 * - strictness: 1..100  (<30 lenient, 30-70 balanced, >70 strict)
 * - mode:        'blur' | 'grayscale' | 'hide'
 *
 * Persisted to localStorage and broadcast on the 'nsfw-settings-changed'
 * event so any mounted media guard can re-render.
 */
import type { NSFWVerdict } from '../../turtleNSFWFilter';

export type NsfwFilterMode = 'blur' | 'grayscale' | 'hide';

export interface NsfwSettings {
  strictness: number;
  mode: NsfwFilterMode;
}

const STRICTNESS_KEY = 'ocean_nsfw_strictness';
const MODE_KEY = 'ocean_nsfw_mode';

const DEFAULTS: NsfwSettings = { strictness: 50, mode: 'blur' };

export function getNsfwSettings(): NsfwSettings {
  try {
    const s = Number(localStorage.getItem(STRICTNESS_KEY));
    const mode = localStorage.getItem(MODE_KEY) as NsfwFilterMode | null;
    return {
      strictness: Number.isFinite(s) ? Math.max(1, Math.min(100, s)) : DEFAULTS.strictness,
      mode: mode === 'blur' || mode === 'grayscale' || mode === 'hide' ? mode : DEFAULTS.mode,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setNsfwSettings(settings: Partial<NsfwSettings>) {
  const next = { ...getNsfwSettings(), ...settings };
  try {
    localStorage.setItem(STRICTNESS_KEY, String(next.strictness));
    localStorage.setItem(MODE_KEY, next.mode);
  } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('nsfw-settings-changed', { detail: next }));
}

/**
 * Adjusts a base model verdict by the user's strictness level.
 * Lenient users only see hard "block" verdicts; strict users also blur
 * borderline signal and escalate strong signal to a block.
 */
export function applyStrictness(
  verdict: NSFWVerdict,
  predictions: Array<{ className: string; probability: number }>,
  strictness: number = DEFAULTS.strictness,
): NSFWVerdict {
  const byClass: Record<string, number> = {};
  for (const p of predictions || []) byClass[p.className] = p.probability;
  const porn = byClass['Porn'] ?? 0;
  const hentai = byClass['Hentai'] ?? 0;
  const sexy = byClass['Sexy'] ?? 0;
  const explicit = porn + hentai;

  if (strictness < 30) {
    // Lenient: only explicit block survives; borderline blur becomes safe.
    if (verdict === 'block') return explicit >= 0.6 ? 'block' : 'blur';
    return 'safe';
  }

  if (strictness > 70) {
    // Strict: escalate borderline signal to blur, strong explicit to block.
    if (verdict === 'safe') {
      if (explicit >= 0.2 || (sexy >= 0.5 && explicit >= 0.05)) return 'blur';
      return 'safe';
    }
    if (verdict === 'blur' && explicit >= 0.45) return 'block';
    return verdict;
  }

  return verdict;
}

/** CSS filter classes for each mode (applied to the media element). */
export function nsfwFilterClass(mode: NsfwFilterMode): string {
  switch (mode) {
    case 'grayscale': return 'filter grayscale scale-100 opacity-80 pointer-events-none';
    case 'hide': return 'opacity-0 pointer-events-none';
    case 'blur':
    default: return 'filter blur-2xl scale-110 opacity-60 pointer-events-none';
  }
}

export function nsfwLevelLabel(strictness: number): string {
  if (strictness < 30) return 'Lenient';
  if (strictness <= 70) return 'Balanced';
  return 'Strict';
}
