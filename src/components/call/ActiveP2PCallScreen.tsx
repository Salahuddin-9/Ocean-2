import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, PhoneCall, X, Shapes } from 'lucide-react';
import type { P2PCallStatus } from '../../hooks/useP2PCall';
import CallWhiteboard from './CallWhiteboard';

interface ActiveP2PCallScreenProps {
  status: P2PCallStatus;
  callType: 'audio' | 'video';
  peerName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  callSeconds: number;
  onMute: () => void;
  onToggleCamera: () => void;
  onHangUp: () => void;
  onCancel: () => void;
  token?: string | null;
  currentUser?: { id: string; name: string } | null;
  boardId?: string;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const ActiveP2PCallScreen: React.FC<ActiveP2PCallScreenProps> = ({
  status,
  callType,
  peerName,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  callSeconds,
  onMute,
  onToggleCamera,
  onHangUp,
  onCancel,
  token,
  currentUser,
  boardId,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [showBoard, setShowBoard] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  const ringing = status === 'outgoing' || status === 'ringing';

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            {peerName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-white font-semibold text-base">{peerName || 'Call'}</div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
              {ringing ? (
                status === 'outgoing' ? 'Ringing…' : 'Incoming…'
              ) : status === 'connected' ? (
                `Connected · ${formatTime(callSeconds)}`
              ) : (
                'Call ended'
              )}
            </div>
          </div>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-white/40 border border-white/15 px-2 py-1 rounded-full">
          {callType === 'audio' ? 'Voice' : 'Video'} · Direct
        </div>
      </div>

      {/* Media area */}
      <div className="flex-1 relative overflow-hidden">
        {status === 'connected' && callType === 'video' ? (
          <>
            {/* Remote video fills the screen */}
            <video
              ref={remoteVideoRef}
              autoPlay playsInline
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
            {/* Local PiP */}
            <div className="absolute top-3 right-3 w-36 h-28 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-900">
              <video
                ref={localVideoRef}
                autoPlay playsInline muted
                className={`w-full h-full object-cover ${isCameraOff ? 'opacity-0' : ''}`}
              />
              {isCameraOff && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                  <VideoOff size={20} />
                </div>
              )}
            </div>
          </>
        ) : (
          /* Audio-only (or not-yet-connected): show peer avatar card */
          <div className="w-full h-full flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <div className={`w-36 h-36 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-5xl shadow-2xl ${status === 'connected' ? 'animate-pulse' : ''}`}>
                {peerName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              {status === 'connected' && (
                <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-4 border-black rounded-full" />
              )}
            </div>
            <div className="text-white/70 text-sm">{callType === 'audio' ? 'Voice call' : 'Video call'}</div>
            {status === 'connected' && callType === 'audio' && (
              <div className="flex items-center gap-2">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Local preview for outgoing/ringing video */}
        {ringing && callType === 'video' && localStream && (
          <div className="absolute top-3 right-3 w-36 h-28 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-6 flex items-center justify-center gap-5">
        {status === 'outgoing' || status === 'ringing' ? (
          <>
            <button
              onClick={onCancel}
              className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white"
            >
              <span className="w-14 h-14 rounded-full bg-rose-600/90 hover:bg-rose-500 flex items-center justify-center transition-colors shadow-xl">
                <X size={22} />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider">Cancel</span>
            </button>
            {status === 'ringing' && (
              <button
                onClick={onHangUp}
                className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white"
              >
                <span className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center animate-pulse shadow-xl">
                  <PhoneCall size={22} />
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider">Answer</span>
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={onMute} className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white" title={isMuted ? 'Unmute' : 'Mute'}>
              <span className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-colors ${isMuted ? 'bg-rose-600/90' : 'bg-white/10 hover:bg-white/20'}`}>
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider">{isMuted ? 'Muted' : 'Mute'}</span>
            </button>

            {callType === 'video' && (
              <button onClick={onToggleCamera} className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white" title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}>
                <span className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-colors ${isCameraOff ? 'bg-rose-600/90' : 'bg-white/10 hover:bg-white/20'}`}>
                  {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider">Camera</span>
              </button>
            )}

            {status === 'connected' && (
              <button onClick={() => setShowBoard(true)} className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white" title="Open shared whiteboard">
                <span className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shadow-xl transition-colors">
                  <Shapes size={22} />
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider">Board</span>
              </button>
            )}

            <button onClick={onHangUp} className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white" title="Hang up">
              <span className="w-14 h-14 rounded-full bg-rose-600/90 hover:bg-rose-500 flex items-center justify-center transition-colors shadow-xl">
                <PhoneOff size={22} />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider">Hang Up</span>
            </button>
          </>
        )}
      </div>

      {/* Shared workspace whiteboard (feature 109) */}
      {showBoard && (
        <CallWhiteboard
          token={token ?? null}
          currentUser={currentUser ?? null}
          onClose={() => setShowBoard(false)}
          boardId={boardId}
          title={`${peerName || 'Call'} — Whiteboard`}
        />
      )}
    </div>
  );
};
