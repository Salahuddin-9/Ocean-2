/**
 * useMeetRoomMesh.ts — React bridge over the standalone mesh room engine
 * (meetRoomMesh.ts).
 *
 * The LOCAL CAMERA is owned by this hook, not the engine: `ensureCamera()`
 * calls navigator.mediaDevices.getUserMedia once and keeps the stream alive
 * across rooms (search → join → skip), so the user sees their own preview
 * immediately. `joinRoom()` hands that stream to a fresh engine per room.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MeetPeer, MeetRoomMesh, MeetRoomStatus } from './meetRoomMesh';
import { mapGumError } from './media';

export interface UseMeetRoomMeshOptions {
  currentUser: { id: string; name: string } | null;
  token?: string | null;
  onToast?: (msg: string) => void;
}

export interface UseMeetRoomMeshResult {
  roomId: string | null;
  status: MeetRoomStatus;
  joined: boolean;
  localStream: MediaStream | null;
  peers: MeetPeer[];
  micOn: boolean;
  camOn: boolean;
  error: string | null;
  /** Real getUserMedia — call before searching / joining. */
  ensureCamera: () => Promise<MediaStream | null>;
  /** Join a mesh room with the already-acquired (or freshly acquired) stream. */
  joinRoom: (roomId: string) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  /** Leave the current room only — the camera stays on for the next search. */
  leaveRoom: () => void;
  /** Full stop: leave the room and release the camera/mic. */
  stop: () => void;
  reset: () => void;
  clearError: () => void;
}

export function useMeetRoomMesh({
  currentUser,
  token,
  onToast,
}: UseMeetRoomMeshOptions): UseMeetRoomMeshResult {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<MeetRoomStatus>('idle');
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<MeetPeer[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<MeetRoomMesh | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      if (localStreamRef.current) {
        try {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch (e) {
          /* ignore */
        }
        localStreamRef.current = null;
      }
    };
  }, []);

  const ensureCamera = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!currentUser) {
      setError('⚠️ Sign in required to start video rooms.');
      onToast?.('⚠️ Sign in required to start video rooms.');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicOn(stream.getAudioTracks().length > 0);
      setCamOn(stream.getVideoTracks().length > 0);
      setError(null);
      return stream;
    } catch (e) {
      const msg = mapGumError(e);
      setError(`⚠️ ${msg} — allow camera & microphone access to start video.`);
      onToast?.(`⚠️ ${msg} — allow camera & microphone access to start video.`);
      return null;
    }
  }, [currentUser, onToast]);

  const joinRoom = useCallback(
    async (rid: string): Promise<void> => {
      if (!currentUser || !token) {
        setError('⚠️ Sign in required to start video rooms.');
        onToast?.('⚠️ Sign in required to start video rooms.');
        return;
      }
      // Camera must already be on (component calls ensureCamera() first).
      if (!localStreamRef.current) {
        await ensureCamera();
      }
      // Tear down any previous room engine but KEEP the camera.
      engineRef.current?.leaveRoom();
      engineRef.current = null;

      const engine = new MeetRoomMesh({
        currentUser,
        token,
        roomId: rid,
        initialStream: localStreamRef.current,
        onPeers: (p) => setPeers(p),
        onLocalStream: (s) => {
          if (s) setLocalStream(s);
        },
        onStatus: (st) => setStatus(st),
        onError: (msg) => {
          setError(msg);
          onToast?.(msg);
        },
      });
      engineRef.current = engine;
      setRoomId(rid);
      setJoined(true);
      setError(null);
      engine.joinRoom();
    },
    [currentUser, token, onToast, ensureCamera]
  );

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  const leaveRoom = useCallback(() => {
    engineRef.current?.leaveRoom();
    engineRef.current = null;
    setRoomId(null);
    setJoined(false);
    setPeers([]);
    setStatus('idle');
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (e) {
        /* ignore */
      }
      localStreamRef.current = null;
    }
    setRoomId(null);
    setJoined(false);
    setPeers([]);
    setLocalStream(null);
    setMicOn(false);
    setCamOn(false);
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.leaveRoom();
    engineRef.current = null;
    setRoomId(null);
    setJoined(false);
    setPeers([]);
    setStatus('idle');
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    roomId,
    status,
    joined,
    localStream,
    peers,
    micOn,
    camOn,
    error,
    ensureCamera,
    joinRoom,
    toggleMute,
    toggleCamera,
    leaveRoom,
    stop,
    reset,
    clearError,
  };
}
