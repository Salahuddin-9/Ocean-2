/**
 * Shared client-side media helpers for the editor engines.
 *
 * Self-contained on purpose: these do NOT import from App.tsx (which would create
 * a circular dependency). They mirror the multipart/JSON POST behaviour the app
 * already uses so editor output can be pushed straight to the existing backend
 * upload handlers (`/api/upload`, `/api/stories/create`, `/api/reels/upload`).
 */

/** The auth token key the rest of the app uses. */
const AUTH_TOKEN_KEY = 'turtle_auth_token';

export function getAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Convert a data URL (from filerobot / fabric exports) into a Blob. */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const [head, payload] = dataUrl.split(',');
      const mimeMatch = head.match(/data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const byteString = atob(payload);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      resolve(new Blob([bytes], { type: mime }));
    } catch (err) {
      reject(err);
    }
  });
}

/** Create a temporary object URL for a Blob (call revokeObjectUrl when done). */
export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/** Revoke a URL created via blobToObjectUrl — safe no-op for invalid input. */
export function revokeObjectUrl(url?: string | null): void {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/** Render an HTMLCanvasElement to a Blob (PNG default, JPEG supports quality). */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/png',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export returned null blob.'));
      },
      type,
      quality
    );
  });
}

/**
 * Upload a File/Blob to `/api/upload` (multipart — the app's primary upload
 * path). Returns the persisted URL (`/uploads/...`). Throws on failure so the
 * UI can surface a real error.
 */
export async function uploadToApi(file: File | Blob, token?: string | null): Promise<string> {
  const storedToken = token !== undefined ? token : getAuthToken();
  const ext = file.type.includes('video')
    ? 'mp4'
    : file.type.includes('audio')
      ? 'webm'
      : 'jpg';
  const fileName =
    file instanceof File
      ? file.name
      : `editor-${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', file, fileName);

  const headers: Record<string, string> = {};
  if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    let msg = 'Upload failed.';
    try {
      const errData = await res.json();
      if (errData?.error) msg = errData.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data?.url) throw new Error('Upload returned no URL.');
  return data.url;
}

/** POST a JSON payload to a backend route. Returns parsed JSON (throws on !ok). */
export async function postJsonToApi(
  url: string,
  body: object,
  token?: string | null
): Promise<any> {
  const storedToken = token !== undefined ? token : getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = 'Request failed.';
    try {
      const errData = await res.json();
      if (errData?.error) msg = errData.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  return res.json();
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Read a File/Blob into a data URL (used to feed filerobot's `source`). */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('File read failed.'));
    reader.readAsDataURL(file);
  });
}

/** Generate a unique id for stories/reels records (mirrors `post-<ts>` style). */
export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
