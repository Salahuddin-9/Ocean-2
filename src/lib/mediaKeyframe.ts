/**
 * Ocean — media keyframe client util (FEATURE 110 — Semantic Media Search)
 * ------------------------------------------------------------------------
 * Captures a still frame from a video element (reel) via <canvas> and uploads
 * it through the existing generic `POST /api/upload` route so the backend only
 * ever sees a real `/uploads/<name>.jpg` url — never base64 in the database.
 */

/** Converts a `data:image/...;base64,...` URL into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mimeMatch = /data:(.*?)(;base64)?$/i.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Resolves once the video fires `event` (or rejects on error / timeout). */
function waitForEvent(
  video: HTMLVideoElement,
  event: 'loadeddata' | 'seeked',
  timeoutMs = 8000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const onOk = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
      reject(new Error(`video ${event} failed`));
    };
    timer = window.setTimeout(() => {
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    video.addEventListener(event, onOk);
    video.addEventListener('error', onErr);
  });
}

/**
 * Captures a JPEG data URL of a frame from `videoUrl`, seeking to `seekTo`
 * seconds (default 1s). Frames are downscaled to max 480px wide.
 * Returns null on any failure (bad url, unsupported codec, empty canvas).
 */
export async function captureKeyframe(videoUrl: string, seekTo = 1): Promise<string | null> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Keep it attached (offscreen + hidden) — most reliable for canvas drawing.
  video.style.cssText =
    'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
  video.src = videoUrl;
  document.body.appendChild(video);
  try {
    await waitForEvent(video, 'loadeddata');
    if (video.duration && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(seekTo, video.duration - 0.1));
      await waitForEvent(video, 'seeked');
    }
    const maxW = 480;
    const srcW = video.videoWidth || maxW;
    const srcH = video.videoHeight || maxW;
    const scale = Math.min(1, maxW / srcW);
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch (e) {
    console.warn('[mediaKeyframe] capture failed:', e);
    return null;
  } finally {
    // Release the media element so we don't pin the resource.
    video.pause();
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    if (video.parentNode) video.parentNode.removeChild(video);
  }
}

/**
 * Captures a keyframe and uploads it via `POST /api/upload` (multipart field
 * `file`), returning the `/uploads/<name>` url, or null on any failure.
 */
export async function captureAndUploadKeyframe(
  videoUrl: string,
  token: string | null
): Promise<string | null> {
  try {
    const dataUrl = await captureKeyframe(videoUrl, 1);
    if (!dataUrl) return null;
    const blob = dataUrlToBlob(dataUrl);
    const fd = new FormData();
    fd.append('file', blob, `keyframe-${Date.now()}.jpg`);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    const data = await res.json();
    return typeof data.url === 'string' ? data.url : null;
  } catch (e) {
    console.warn('[mediaKeyframe] upload failed:', e);
    return null;
  }
}
