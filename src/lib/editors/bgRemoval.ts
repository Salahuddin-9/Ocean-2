/**
 * Ocean — AI background removal wrapper (#251)
 * ---------------------------------------------
 * Thin wrapper around `@imgly/background-removal` (on-device, WASM/WebGL).
 * Returns null when the library or model can't load so callers can fall back
 * to a manual threshold method. The model (~40MB) is fetched once from
 * img.ly's static CDN on first use and cached.
 */
let cachedFn: ((src: Blob, cfg: Record<string, unknown>) => Promise<Blob>) | null | undefined;

export async function removeBackgroundAI(
  file: Blob,
  onProgress?: (pct: number) => void
): Promise<Blob | null> {
  try {
    if (cachedFn === undefined) {
      cachedFn = null;
      const mod = await import('@imgly/background-removal');
      cachedFn = mod.removeBackground as typeof cachedFn;
    }
    if (!cachedFn) return null;
    const blob = await cachedFn(file, {
      progress: (key: string, current: number, total: number) => {
        if (onProgress && total) onProgress(Math.min(100, Math.round((current / total) * 100)));
      },
    });
    return blob;
  } catch {
    return null;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
