/**
 * Ocean — Live gift fly-in overlay (#252)
 * ----------------------------------------
 * Fullscreen Lottie animation (lottie-web) that plays when a gift is sent.
 */
import { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import { giftLottie, type GiftAnimSpec } from '../lib/lottieGifts';

interface Props {
  spec: GiftAnimSpec;
  fromName: string;
  giftName: string;
  onDone: () => void;
}

export default function GiftFly({ spec, fromName, giftName, onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let anim: { destroy: () => void } | null = null;
    try {
      anim = lottie.loadAnimation({
        container: ref.current,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: giftLottie(spec) as never,
      });
    } catch { /* animation optional */ }
    const t = setTimeout(onDone, 2300);
    return () => { anim?.destroy(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  return (
    <div className="fixed inset-0 z-[140] pointer-events-none flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div className="w-72 h-72" ref={ref} />
      <div className="absolute inset-x-0 top-[38%] text-center">
        <span className="block text-7xl drop-shadow-lg">{spec.emoji}</span>
        <p className="mt-2 text-white text-sm font-bold drop-shadow">{fromName} sent {giftName} 💛</p>
        <p className="text-[10px] text-white/70 font-mono">lottie-web · LottieFiles</p>
      </div>
    </div>
  );
}
