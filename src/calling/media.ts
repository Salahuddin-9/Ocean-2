/**
 * media.ts — getUserMedia + MediaStream/track helpers.
 *
 * Ports Jitsi's robust media lifecycle into a browser-only caller:
 *   - split audio/video GUM fallback chain (a combined request that fails
 *     retries each side independently so a denied camera still yields audio),
 *   - per-device error mapping for friendly banners,
 *   - `track.enabled` for mute/cam-off (no renegotiation) vs `replaceTrack`
 *     for device switching (Jitsi),
 *   - `devicechange` monitoring,
 *   - remote-stream merging so a <video> element never flickers,
 *   - Fonoster MuteDirection-style in/out/both muting.
 *
 * Audio-only mode NEVER requests the camera — an audio call acquires
 * { audio: true, video: false } only.
 */

export interface AcquireMediaResult {
  stream: MediaStream | null;
  /** Which side(s) of a request failed. 'both' = audio AND video unavailable. */
  mediaError?: 'audio' | 'video' | 'both' | null;
  errorMessage?: string;
}

/** Normalize a 'both' failure down to the kind the caller cares about. */
export function normalizeMediaError(e: 'audio' | 'video' | 'both' | null | undefined): 'audio' | 'video' | null {
  if (e === 'both') return 'audio';
  return e || null;
}

/** Map a getUserMedia error to a human-friendly message (JitsiTrackErrors). */
export function mapGumError(e: any): string {
  const name = e?.name || e?.message || 'unknown';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permission denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No device found';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Device is in use by another app';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'Requested constraints are not supported';
    case 'TimeoutError':
      return 'Timed out waiting for media';
    default:
      return 'Unable to access media device';
  }
}

/**
 * Acquire media with a split audio/video fallback chain. For a video call, if
 * the combined request fails, each side is tried independently; whichever side
 * succeeds is returned with `mediaError` set to the failed side, so the caller
 * can continue audio-only (Jitsi createInitialAVTracks). For an audio call only
 * audio is requested — the camera is never touched.
 */
export async function acquireMedia(opts: {
  audio: boolean;
  video: boolean;
  videoConstraints?: MediaTrackConstraints;
}): Promise<AcquireMediaResult> {
  const videoConstraints = opts.video ? opts.videoConstraints || true : false;

  if (opts.audio && opts.video) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoConstraints });
      return { stream };
    } catch (err) {
      // Fall through to the split attempt.
      const audio = await navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .catch(() => null);
      const video = await navigator.mediaDevices
        .getUserMedia({ audio: false, video: videoConstraints })
        .catch(() => null);

      if (audio && video) {
        const stream = new MediaStream([...audio.getTracks(), ...video.getTracks()]);
        return { stream, mediaError: null, errorMessage: mapGumError(err) };
      }
      if (audio) {
        return { stream: audio, mediaError: 'video', errorMessage: mapGumError(err) };
      }
      if (video) {
        return { stream: video, mediaError: 'audio', errorMessage: mapGumError(err) };
      }
      return { stream: null, mediaError: 'both', errorMessage: mapGumError(err) };
    }
  }

  // Single-side request (audio call, or meet video-only acquisition step).
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: opts.audio,
      video: opts.video ? videoConstraints : false,
    });
    return { stream };
  } catch (err) {
    return { stream: null, mediaError: opts.audio ? 'audio' : 'video', errorMessage: mapGumError(err) };
  }
}

/** Bind a stream to a video element, retrying play() (iOS ignores volume/autoplay). */
export function attachToElement(el: HTMLVideoElement | null, stream: MediaStream | null): void {
  if (!el) return;
  if (!stream) {
    el.srcObject = null;
    return;
  }
  el.srcObject = stream;
  const tryPlay = (attempt: number) => {
    try {
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (attempt < 3) setTimeout(() => tryPlay(attempt + 1), 1000);
        });
      }
    } catch (e) {
      /* ignore */
    }
  };
  tryPlay(0);
}

/**
 * Merge incoming remote tracks into a stable MediaStream so <video> never
 * flickers when tracks are (re)added. Returns the stable stream.
 */
export function wireRemoteStream(pc: RTCPeerConnection, onStream: (stream: MediaStream) => void): MediaStream {
  const merged = new MediaStream();
  pc.getReceivers().forEach((r) => {
    if (r.track && !merged.getTracks().some((t) => t.id === r.track!.id)) merged.addTrack(r.track);
  });
  pc.ontrack = (event) => {
    // Some browsers (e.g. Safari) fire ontrack with an empty `event.streams` —
    // always capture `event.track` too so the remote stream is never blank.
    if (event.track && !merged.getTracks().some((t) => t.id === event.track!.id)) {
      merged.addTrack(event.track);
    }
    event.streams.forEach((s) => {
      s.getTracks().forEach((t) => {
        if (!merged.getTracks().some((mt) => mt.id === t.id)) merged.addTrack(t);
      });
    });
    if (merged.getTracks().length > 0) onStream(merged);
  };
  return merged;
}

/**
 * Switch a peer connection's track of the given kind to a new device stream.
 * Uses replaceTrack (Jitsi) — no renegotiation, no remove+add.
 */
export async function replaceTrack(
  pc: RTCPeerConnection,
  kind: 'audio' | 'video',
  newStream: MediaStream | null
): Promise<boolean> {
  const sender = pc.getSenders().find((s) => s.track?.kind === kind);
  if (!sender) return false;
  const track = newStream?.getTracks().find((t) => t.kind === kind) ?? null;
  try {
    await sender.replaceTrack(track);
    return true;
  } catch (e) {
    console.warn(`replaceTrack(${kind}) failed:`, e);
    return false;
  }
}

export interface DeviceList {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
}

/**
 * Watch for device plug/unplug (devicechange) and report changes by kind.
 * Returns an unsubscribe function.
 */
export function watchDeviceChanges(cb: (devices: DeviceList) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return () => {};
  if (typeof navigator.mediaDevices.ondevicechange !== 'boolean' && !('ondevicechange' in navigator.mediaDevices)) {
    return () => {};
  }
  let audioInputs: MediaDeviceInfo[] = [];
  let videoInputs: MediaDeviceInfo[] = [];

  const refresh = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const ai = devices.filter((d) => d.kind === 'audioinput');
      const vi = devices.filter((d) => d.kind === 'videoinput');
      const sameIds = (a: MediaDeviceInfo[], b: MediaDeviceInfo[]) =>
        a.length === b.length && a.every((d, i) => d.deviceId === b[i]?.deviceId);
      if (!sameIds(ai, audioInputs) || !sameIds(vi, videoInputs)) {
        audioInputs = ai;
        videoInputs = vi;
        cb({ audioInputs: ai, videoInputs: vi });
      }
    } catch (e) {
      /* ignore enumerateDevices permission errors */
    }
  };

  navigator.mediaDevices.ondevicechange = refresh;
  return () => {
    navigator.mediaDevices.ondevicechange = null;
  };
}

/** Fonoster MuteDirection-style muting: out = your mic, in = the peer's audio. */
export function setMute(
  local: MediaStream | null,
  remote: MediaStream | null,
  direction: 'in' | 'out' | 'both',
  muted: boolean
): void {
  if (direction === 'out' || direction === 'both') {
    local?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }
  if (direction === 'in' || direction === 'both') {
    remote?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }
}
