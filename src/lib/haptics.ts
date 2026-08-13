// Lightweight haptic feedback helper using the Vibration API.
export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* unsupported */
  }
}

export const haptics = {
  tap: () => haptic(8),
  react: () => haptic(12),
  success: () => haptic([10, 30, 10]),
  send: () => haptic([6, 20, 6]),
  warn: () => haptic([20, 40, 20]),
};
