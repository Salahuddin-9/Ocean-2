/**
 * Ocean — Lottie gift animations (feature #252)
 * ----------------------------------------------
 * Tiny hand-built Lottie animations for live gifts — rendered by LottieFiles'
 * `lottie-web` player. Each spec maps to the backend GIFT_CATALOG entry via the
 * `animated` field (heart/fish/shell/turtle/wave/boat/dolphin/lighthouse/island/crown).
 */
export interface GiftAnimSpec {
  id: string;
  name: string;
  emoji: string;
  color: [number, number, number];
}

export const GIFT_SPECS: Record<string, GiftAnimSpec> = {
  heart: { id: 'g1', name: 'Heart', emoji: '❤️', color: [0.95, 0.2, 0.3] },
  fish: { id: 'g2', name: 'Fish', emoji: '🐟', color: [0.2, 0.6, 0.95] },
  shell: { id: 'g3', name: 'Shell', emoji: '🐚', color: [0.95, 0.72, 0.45] },
  turtle: { id: 'g4', name: 'Turtle', emoji: '🐢', color: [0.25, 0.8, 0.45] },
  wave: { id: 'g5', name: 'Wave', emoji: '🌊', color: [0.1, 0.6, 0.92] },
  boat: { id: 'g6', name: 'Boat', emoji: '⛵', color: [0.62, 0.4, 0.9] },
  dolphin: { id: 'g7', name: 'Dolphin', emoji: '🐬', color: [0.35, 0.7, 0.95] },
  lighthouse: { id: 'g8', name: 'Lighthouse', emoji: '🗼', color: [1, 0.55, 0.2] },
  island: { id: 'g9', name: 'Island', emoji: '🏝️', color: [0.2, 0.8, 0.5] },
  crown: { id: 'g10', name: 'Ocean King', emoji: '👑', color: [1, 0.85, 0.3] },
};

export function giftSpec(animated: string): GiftAnimSpec {
  return GIFT_SPECS[animated] || { id: 'g1', name: 'Gift', emoji: '🎁', color: [0.95, 0.2, 0.3] };
}

/**
 * Build a valid minimal Lottie JSON (shape layers only, no fonts):
 * a colored bubble that pops in and floats up, a fading shockwave ring,
 * and rotating sparkles. ~1.2s at 60fps.
 */
export function giftLottie(spec: GiftAnimSpec): object {
  const [r, g, b] = spec.color;
  const op = 72;
  return {
    v: '5.7.4', fr: 60, ip: 0, op, w: 240, h: 240, nm: spec.name, ddd: 0, assets: [],
    layers: [
      // shockwave ring
      {
        ddd: 0, ind: 1, ty: 4, nm: 'ring', sr: 1,
        ks: {
          o: { a: 1, k: [{ t: 0, s: [0] }, { t: 6, s: [70] }, { t: 40, s: [0] }] },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [120, 150, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 1, k: [{ t: 0, s: [10, 10, 100] }, { t: 36, s: [170, 170, 100] }] },
        },
        ao: 0,
        shapes: [
          { ty: 'el', nm: 'ring-ell', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [78, 78] } },
          { ty: 'sr', nm: 'ring-stroke', c: { a: 0, k: [r, g, b, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 6 }, lc: 2, lj: 1 },
        ],
        ip: 0, op, st: 0,
      },
      // main bubble: pop in + float up
      {
        ddd: 0, ind: 2, ty: 4, nm: 'bubble', sr: 1,
        ks: {
          o: { a: 1, k: [{ t: 0, s: [0] }, { t: 5, s: [100] }, { t: 58, s: [100] }, { t: 70, s: [0] }] },
          r: { a: 0, k: 0 },
          p: { a: 1, k: [{ t: 0, s: [120, 170, 0] }, { t: 58, s: [120, 55, 0] }] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 1, k: [{ t: 0, s: [0, 0, 100] }, { t: 10, s: [125, 125, 100] }, { t: 18, s: [82, 82, 100] }, { t: 26, s: [100, 100, 100] }] },
        },
        ao: 0,
        shapes: [
          { ty: 'el', nm: 'bubble-ell', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [68, 68] } },
          { ty: 'fl', nm: 'bubble-fill', c: { a: 0, k: [r, g, b, 1] }, o: { a: 0, k: 100 } },
        ],
        ip: 0, op, st: 0,
      },
      // rotating sparkles
      {
        ddd: 0, ind: 3, ty: 4, nm: 'sparkle', sr: 1,
        ks: {
          o: { a: 1, k: [{ t: 10, s: [0] }, { t: 16, s: [90] }, { t: 60, s: [0] }] },
          r: { a: 1, k: [{ t: 10, s: [0] }, { t: 60, s: [200] }] },
          p: { a: 0, k: [120, 120, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ao: 0,
        shapes: [
          { ty: 'el', nm: 's1', p: { a: 0, k: [62, 42] }, s: { a: 0, k: [12, 12] } },
          { ty: 'el', nm: 's2', p: { a: 0, k: [-52, 72] }, s: { a: 0, k: [9, 9] } },
          { ty: 'el', nm: 's3', p: { a: 0, k: [72, -48] }, s: { a: 0, k: [8, 8] } },
          { ty: 'el', nm: 's4', p: { a: 0, k: [-62, -42] }, s: { a: 0, k: [11, 11] } },
          { ty: 'fl', nm: 'sparkle-fill', c: { a: 0, k: [1, 1, 0.85, 1] }, o: { a: 0, k: 100 } },
        ],
        ip: 0, op, st: 0,
      },
    ],
  };
}
