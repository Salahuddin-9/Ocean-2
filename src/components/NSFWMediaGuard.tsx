import React, { useState, useEffect } from 'react';
import { screenImageSource, NSFWVerdict } from '../../turtleNSFWFilter';
import { Eye, EyeOff, AlertTriangle, ShieldAlert } from 'lucide-react';
import { getNsfwSettings, applyStrictness, nsfwFilterClass, type NsfwSettings, type NsfwFilterMode } from '../lib/nsfwSettings';

interface NSFWMediaGuardProps {
  src: string;
  alt?: string;
  className?: string;
  isNsfw?: boolean;
  isSensitiveText?: boolean;
  onFullscreen?: () => void;
  onError?: (e: any) => void;
}

export const NSFWMediaGuard: React.FC<NSFWMediaGuardProps> = ({
  src,
  alt = 'Media',
  className = '',
  isNsfw = false,
  isSensitiveText = false,
  onFullscreen,
  onError,
}) => {
  const [verdict, setVerdict] = useState<NSFWVerdict>('safe');
  const [predictions, setPredictions] = useState<Array<{ className: string; probability: number }>>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [settings, setSettings] = useState<NsfwSettings>(() => getNsfwSettings());

  // Re-apply verdict whenever sensitivity settings change.
  const applyVerdict = (raw: NSFWVerdict, preds: Array<{ className: string; probability: number }>) => {
    setPredictions(preds);
    setVerdict(applyStrictness(raw, preds, getNsfwSettings().strictness));
  };

  useEffect(() => {
    const onSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail as NsfwSettings | undefined;
      if (detail) {
        setSettings(detail);
        setVerdict(applyStrictness(baseVerdictRef.current, predictionsRef.current, detail.strictness));
      }
    };
    window.addEventListener('nsfw-settings-changed', onSettings);
    return () => window.removeEventListener('nsfw-settings-changed', onSettings);
  }, []);

  const baseVerdictRef = React.useRef<NSFWVerdict>('safe');
  const predictionsRef = React.useRef<Array<{ className: string; probability: number }>>([]);

  useEffect(() => {
    let active = true;
    screenImageSource(src).then((res) => {
      if (active) {
        baseVerdictRef.current = res.verdict;
        predictionsRef.current = res.predictions || [];
        setPredictions(res.predictions || []);
        setVerdict(applyStrictness(res.verdict, res.predictions || [], getNsfwSettings().strictness));
      }
    }).catch(() => {
      if (active) {
        const fallback: NSFWVerdict = (isNsfw || isSensitiveText) ? 'blur' : 'safe';
        baseVerdictRef.current = fallback;
        predictionsRef.current = [];
        setPredictions([]);
        setVerdict(fallback);
      }
    });
    return () => { active = false; };
  }, [src, isNsfw, isSensitiveText]);

  const filterMode: NsfwFilterMode = settings.mode;
  if (verdict === 'block') {
    return (
      <div className={`p-6 bg-rose-950/80 border border-rose-800/60 rounded-xl flex flex-col items-center justify-center text-center gap-2 text-rose-200 min-h-[160px] ${className}`}>
        <ShieldAlert size={32} className="text-rose-400 animate-pulse" />
        <span className="font-bold text-xs uppercase tracking-wider text-rose-300">🚨 Content Blocked by AI Safety Filter</span>
        <p className="text-[11px] text-rose-300/80 max-w-md">
          This image was blocked because it contains explicit or adult/NSFW content violating safety guidelines.
        </p>
      </div>
    );
  }

  const isBlurred = (verdict === 'blur' || isSensitiveText) && !isRevealed;

  return (
    <div className={`relative overflow-hidden group ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`w-full h-auto object-cover transition-all duration-500 ${
          isBlurred ? nsfwFilterClass(filterMode) : 'scale-100 opacity-100 cursor-pointer'
        }`}
        referrerPolicy="no-referrer"
        onError={onError}
        onClick={!isBlurred ? onFullscreen : undefined}
      />

      {isBlurred && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-black/60 backdrop-blur-md text-white text-center gap-2">
          <AlertTriangle size={24} className="text-amber-400 animate-bounce" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-bold text-xs uppercase tracking-wider text-amber-300">🔞 Sensitive / Adult Content</span>
            <span className="text-[10px] text-stone-300">Blurred automatically by Safety Engine</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsRevealed(true);
            }}
            className="mt-1 px-3 py-1.5 bg-stone-800/90 hover:bg-stone-700 text-stone-100 font-mono text-[10px] font-bold uppercase rounded-lg border border-stone-600/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
          >
            <Eye size={12} className="text-amber-400" />
            Show Image
          </button>
        </div>
      )}

      {!isBlurred && verdict === 'blur' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsRevealed(false);
          }}
          className="absolute top-2 right-2 z-20 px-2 py-1 bg-black/70 hover:bg-black/90 text-stone-300 text-[9px] font-mono uppercase font-bold rounded flex items-center gap-1 backdrop-blur-xs transition-colors cursor-pointer"
        >
          <EyeOff size={10} className="text-amber-400" />
          Hide
        </button>
      )}
    </div>
  );
};
