/**
 * Ocean — Client-side FFmpeg WASM video processing engine
 * -------------------------------------------------------
 * Wraps `@ffmpeg/ffmpeg` v0.12 + `@ffmpeg/util` v0.12 for trimming,
 * speed changes, and audio merging — all running in the browser via
 * the single-threaded WebAssembly core (no COOP/COEP headers needed).
 *
 * The WASM assets are vendored in `public/ffmpeg/` so no CDN is hit.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

/* -------------------------------------------------------------------------- */
/*  Singleton loader                                                          */
/* -------------------------------------------------------------------------- */

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/** Lazily load (or reuse) the FFmpeg WASM singleton. */
export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    const coreURL = await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript');
    const wasmURL = await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm');
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

/** Terminate the FFmpeg worker to free memory. Call when the editor closes. */
export function terminateFFmpeg(): void {
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
    ffmpegInstance = null;
    loadPromise = null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

type ProgressCallback = (progress: number) => void;

function withProgress<R>(ffmpeg: FFmpeg, onProgress: ProgressCallback | undefined, fn: () => Promise<R>): Promise<R> {
  if (!onProgress) return fn();
  const handler = (e: { progress: number }) => onProgress(Math.min(1, Math.max(0, e.progress)));
  ffmpeg.on('progress', handler);
  return fn().finally(() => ffmpeg.off('progress', handler));
}

async function runExec(ffmpeg: FFmpeg, args: string[]): Promise<void> {
  const exitCode = await ffmpeg.exec(args);
  if (exitCode !== 0) {
    throw new Error(`FFmpeg exited with code ${exitCode}.`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/** Trim a video by start time and duration. Returns MP4 Blob. */
export async function trimVideo(
  file: File,
  opts: { startSec: number; durationSec: number },
  onProgress?: ProgressCallback
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  return withProgress(ffmpeg, onProgress, async () => {
    const data = await fetchFile(file);
    await ffmpeg.writeFile('input.mp4', data);
    await runExec(ffmpeg, [
      '-i', 'input.mp4',
      '-ss', String(opts.startSec),
      '-t', String(opts.durationSec),
      '-c', 'copy',
      '-y', 'output.mp4',
    ]);
    const output = await ffmpeg.readFile('output.mp4', 'binary') as Uint8Array;
    await ffmpeg.deleteFile('input.mp4');
    await ffmpeg.deleteFile('output.mp4');
    return new Blob([output], { type: 'video/mp4' });
  });
}

/** Change playback speed. `rate=2` means double speed. Returns MP4 Blob. */
export async function changeSpeed(
  file: File,
  rate: number,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  return withProgress(ffmpeg, onProgress, async () => {
    const data = await fetchFile(file);
    await ffmpeg.writeFile('input.mp4', data);

    // Build atempo filter chain (ffmpeg atempo only supports 0.5–2.0 range)
    const atempoFilter = buildAtempoChain(rate);

    await runExec(ffmpeg, [
      '-i', 'input.mp4',
      '-filter:v', `setpts=${(1 / rate).toFixed(4)}*PTS`,
      '-filter:a', atempoFilter,
      '-y', 'output.mp4',
    ]);

    const output = await ffmpeg.readFile('output.mp4', 'binary') as Uint8Array;
    await ffmpeg.deleteFile('input.mp4');
    await ffmpeg.deleteFile('output.mp4');
    return new Blob([output], { type: 'video/mp4' });
  });
}

/** Merge a video with an audio track (replaces audio). Returns MP4 Blob. */
export async function mergeAudio(
  videoFile: File,
  audioFile: File,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  return withProgress(ffmpeg, onProgress, async () => {
    const vidData = await fetchFile(videoFile);
    const audData = await fetchFile(audioFile);
    await ffmpeg.writeFile('video.mp4', vidData);
    await ffmpeg.writeFile('audio.mp3', audData);

    await runExec(ffmpeg, [
      '-i', 'video.mp4',
      '-i', 'audio.mp3',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      '-y', 'output.mp4',
    ]);

    const output = await ffmpeg.readFile('output.mp4', 'binary') as Uint8Array;
    await ffmpeg.deleteFile('video.mp4');
    await ffmpeg.deleteFile('audio.mp3');
    await ffmpeg.deleteFile('output.mp4');
    return new Blob([output], { type: 'video/mp4' });
  });
}

/* -------------------------------------------------------------------------- */
/*  Internal                                                                  */
/* -------------------------------------------------------------------------- */

/** Build an atempo filter chain for rates outside the 0.5–2.0 native range. */
function buildAtempoChain(rate: number): string {
  if (rate >= 0.5 && rate <= 2) return `atempo=${rate.toFixed(4)}`;

  const parts: string[] = [];
  let remaining = rate;

  if (rate > 2) {
    while (remaining > 2) {
      parts.push('atempo=2.0');
      remaining /= 2;
    }
  } else {
    while (remaining < 0.5) {
      parts.push('atempo=0.5');
      remaining /= 0.5;
    }
  }
  parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(',');
}
