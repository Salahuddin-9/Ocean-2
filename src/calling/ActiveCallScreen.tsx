/**
 * ActiveCallScreen — the shared full-screen chat call UI for the engine.
 *
 * A superset of the old ActiveP2PCallScreen: audio calls render an avatar card
 * (the camera is never requested), video calls render remote-fill + local PiP.
 * Adds the engine's richer phases (connecting/ending/ended), a Jitsi-style
 * connection-quality indicator, a media-error → audio-only banner, and a device
 * switch popover (replaceTrack, no renegotiation).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneCall,
  PhoneMissed,
  X,
  Settings2,
  Wifi,
} from 'lucide-react';
import type { CallPhase, CallType, CallDisposition } from './types';
import { attachToElement } from './media';

interface ActiveCallScreenProps {
  phase: CallPhase;
  callType: CallType;
  peerName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteConnected: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  callSeconds: number;
  mediaError: 'audio' | 'video' | null;
  connectionQuality: number;
  disposition: CallDisposition | null;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onHangUp: () => void;
  onClose: () => void;
  onMute: () => void;
  onToggleCamera: () => void;
  onSwitchDevice: (kind: 'audio' | 'video', deviceId: string) => void;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function qualityBars(quality: number): { on: boolean }[] {
  const level = quality >= 80 ? 3 : quality >= 50 ? 2 : quality >= 25 ? 1 : 0;
  return [0, 1, 2].map((i) => ({ on: i < level }));
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  phase,
  callType,
  peerName,
  localStream,
  remoteStream,
  remoteConnected,
  isMuted,
  isCameraOff,
  callSeconds,
  mediaError,
  connectionQuality,
  disposition,
  onAccept,
  onReject,
  onCancel,
  onHangUp,
  onClose,
  onMute,
  onToggleCamera,
  onSwitchDevice,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<{ audioInputs: MediaDeviceInfo[]; videoInputs: MediaDeviceInfo[] }>({
    audioInputs: [],
    videoInputs: [],
  });

  // The <video> elements only mount once the call is 'connected'. The remote
  // tracks usually arrive first (pc.ontrack fires while still 'connecting'), so
  // when remoteStream/localStream change, the refs above are still null and a
  // bare [stream] effect would no-op — leaving the element without a srcObject
  // and rendering a blank/black video. Re-running the attach on `showVideo`
  // (which flips exactly when the elements mount) guarantees the stream lands
  // on the element regardless of ordering.
  const showVideo = phase === 'connected' && callType === 'video';

  useEffect(() => {
    attachToElement(localVideoRef.current, localStream);
  }, [localStream, showVideo]);
  useEffect(() => {
    attachToElement(remoteVideoRef.current, remoteStream);
  }, [remoteStream, showVideo]);

  // Auto-dismiss the "ended" overlay shortly after it appears.
  useEffect(() => {
    if (phase !== 'ended') return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  const ringing = phase === 'outgoing' || phase === 'ringing';
  const ended = phase === 'ended';
  const avatarName = peerName?.charAt(0)?.toUpperCase() || '?';

  const openDevices = async () => {
    setShowDevices((v) => !v);
    if (!showDevices) {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          audioInputs: list.filter((d) => d.kind === 'audioinput'),
          videoInputs: list.filter((d) => d.kind === 'videoinput'),
        });
      } catch (e) {
        console.warn('enumerateDevices failed:', e);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            {avatarName}
          </div>
          <div>
            <div className="text-white font-semibold text-base">{peerName || 'Call'}</div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
              {ringing ? (
                phase === 'outgoing' ? 'Ringing…' : 'Incoming…'
              ) : phase === 'connecting' ? (
                'Connecting…'
              ) : phase === 'connected' ? (
                `Connected · ${formatTime(callSeconds)}`
              ) : phase === 'ending' ? (
                'Ending call…'
              ) : (
                'Call ended'
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'connected' && (
            <div
              className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/50 border border-white/15 px-2 py-1 rounded-full"
              title={`Connection quality ${connectionQuality}%`}
            >
              <Wifi size={11} className={connectionQuality < 50 ? 'text-amber-400' : 'text-emerald-400'} />
              {qualityBars(connectionQuality).map((b, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-sm ${b.on ? 'bg-emerald-400' : 'bg-white/20'}`}
                  style={{ height: 4 + i * 3 }}
                />
              ))}
            </div>
          )}
          <div className="text-[10px] font-mono uppercase tracking-widest text-white/40 border border-white/15 px-2 py-1 rounded-full">
            {callType === 'audio' ? 'Voice' : 'Video'} · Direct
          </div>
        </div>
      </div>

      {/* Media error banner (camera denied → audio-only) */}
      {mediaError && phase !== 'ended' && (
        <div className="px-5 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-[11px] font-mono uppercase tracking-wide flex items-center gap-2">
          <VideoOff size={12} />
          {mediaError === 'video'
            ? 'Camera unavailable — continuing with audio only'
            : 'Audio unavailable — continuing without sound'}
        </div>
      )}

      {/* Media area */}
      <div className="flex-1 relative overflow-hidden">
        {showVideo ? (
          <>
            {/* Remote video fills the screen */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
            {/* Local PiP */}
            <div className="absolute top-3 right-3 w-36 h-28 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-900">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isCameraOff && (
                <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center text-white/40">
                  <VideoOff size={20} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Avatar card for audio calls / ringing / connecting */}
            <div className="text-center">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-4xl font-bold shadow-2xl mx-auto mb-4 animate-pulse">
                {avatarName}
              </div>
              <div className="text-white text-lg font-semibold">{peerName || 'Call'}</div>
              <div className="text-white/40 text-xs font-mono uppercase tracking-widest mt-1">
                {callType === 'audio' ? 'Voice call' : 'Video call'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-5 px-4 flex-wrap">
        {ringing && phase === 'outgoing' ? (
          <>
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-2xl transition-colors"
            >
              <X size={15} /> Cancel
            </button>
          </>
        ) : ringing && phase === 'ringing' ? (
          <>
            <button
              onClick={onReject}
              className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-2xl transition-colors"
            >
              <PhoneMissed size={15} /> Decline
            </button>
            <button
              onClick={onAccept}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-2xl transition-colors animate-pulse"
            >
              <PhoneCall size={15} /> Answer
            </button>
          </>
        ) : ended ? (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-2xl transition-colors"
          >
            <X size={15} /> Close
          </button>
        ) : (
          <>
            {/* Mute */}
            <button
              onClick={onMute}
              className={`p-4 rounded-2xl transition-colors ${
                isMuted
                  ? 'bg-red-500/25 text-red-400 border border-red-500/40'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Camera toggle (video calls only) */}
            {callType === 'video' && (
              <button
                onClick={onToggleCamera}
                className={`p-4 rounded-2xl transition-colors ${
                  isCameraOff
                    ? 'bg-red-500/25 text-red-400 border border-red-500/40'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
            )}

            {/* Device switch */}
            {phase === 'connected' && (
              <button
                onClick={openDevices}
                className="p-4 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-colors"
                title="Switch device"
              >
                <Settings2 size={20} />
              </button>
            )}

            {/* Hang up */}
            <button
              onClick={onHangUp}
              className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-6 py-4 rounded-2xl transition-colors"
              title="End call"
            >
              <PhoneOff size={18} /> {phase === 'connecting' ? 'End' : 'Hang Up'}
            </button>
          </>
        )}
      </div>

      {/* Device switch popover */}
      {showDevices && phase === 'connected' && (
        <div className="absolute right-4 bottom-24 z-10 w-64 bg-zinc-900 border border-white/10 rounded-2xl p-3 shadow-2xl">
          <div className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">Switch device</div>
          {devices.audioInputs.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-emerald-400 mb-1">Microphone</div>
              {devices.audioInputs.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => onSwitchDevice('audio', d.deviceId)}
                  className="block w-full text-left text-[11px] text-white/80 hover:bg-white/10 px-2 py-1 rounded-lg truncate"
                >
                  {d.label || `Microphone ${d.deviceId.slice(0, 4)}`}
                </button>
              ))}
            </div>
          )}
          {devices.videoInputs.length > 0 && callType === 'video' && (
            <div>
              <div className="text-[10px] text-emerald-400 mb-1">Camera</div>
              {devices.videoInputs.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => onSwitchDevice('video', d.deviceId)}
                  className="block w-full text-left text-[11px] text-white/80 hover:bg-white/10 px-2 py-1 rounded-lg truncate"
                >
                  {d.label || `Camera ${d.deviceId.slice(0, 4)}`}
                </button>
              ))}
            </div>
          )}
          {devices.audioInputs.length === 0 && devices.videoInputs.length === 0 && (
            <div className="text-[11px] text-white/40">No alternate devices found.</div>
          )}
        </div>
      )}

      {/* Terminal disposition label on the ended screen */}
      {ended && disposition && (
        <div className="pb-3 text-center text-[10px] font-mono uppercase tracking-widest text-white/30">
          {disposition}
        </div>
      )}
    </div>
  );
};

export default ActiveCallScreen;
