import { useEffect, useState } from "react";
import {
  StreamCall,
  useCallStateHooks,
  CallingState,
  SpeakerLayout,
  useCall,
  useStreamVideoClient,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import { Shapes } from "lucide-react";
import CallWhiteboard from "./CallWhiteboard";

interface ActiveCallScreenProps {
  callId: string;
  callType?: string;
  onLeave?: () => void;
  token?: string | null;
  currentUser?: { id: string; name: string } | null;
  boardId?: string;
}

export function ActiveCallScreen({ callId, callType = "default", onLeave, token, currentUser, boardId }: ActiveCallScreenProps) {
  const client = useStreamVideoClient();

  if (!client) return null;

  const call = client.call(callType, callId);

  return (
    <StreamCall call={call}>
      <CallUI onLeave={onLeave} token={token} currentUser={currentUser} boardId={boardId} />
    </StreamCall>
  );
}

function CallUI({ onLeave, token, currentUser, boardId }: { onLeave?: () => void; token?: string | null; currentUser?: { id: string; name: string } | null; boardId?: string }) {
  const call = useCall();
  const { useCallCallingState, useParticipantCount } = useCallStateHooks();
  const callingState = useCallCallingState();
  const participantCount = useParticipantCount();
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [showBoard, setShowBoard] = useState(false);

  useEffect(() => {
    if (!call) return;
    async function initMediaCall() {
      try {
        if (call.state.callingState !== CallingState.JOINED) {
          await call.join({ create: true });
        }
        await call.camera.enable();
        await call.microphone.enable();
      } catch (err) {
        console.warn("Media call join error:", err);
      }
    }
    initMediaCall();
  }, [call]);

  useEffect(() => {
    if (callingState !== CallingState.JOINED) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [callingState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleMute = async () => {
    if (!call) return;
    try {
      await call.microphone.toggle();
      setIsMuted(!isMuted);
    } catch (err) {
      console.warn("Microphone toggle error:", err);
      setIsMuted(true);
    }
  };

  const toggleCamera = async () => {
    if (!call) return;
    try {
      await call.camera.toggle();
      setIsCameraOff(!isCameraOff);
    } catch (err) {
      console.warn("Camera toggle error:", err);
      setIsCameraOff(true);
    }
  };

  const handleLeave = async () => {
    if (!call) return;
    await call.leave();
    onLeave?.();
  };

  if (callingState === CallingState.JOINING || callingState === CallingState.RECONNECTING) {
    return (
      <div className="fixed inset-0 z-[110] bg-[#2e2920] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">
            {callingState === CallingState.JOINING ? "Connecting..." : "Reconnecting..."}
          </p>
        </div>
      </div>
    );
  }

  if (callingState === CallingState.LEFT) {
    return (
      <div className="fixed inset-0 z-[110] bg-[#2e2920] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white mb-4">Call ended</p>
          <button
            onClick={onLeave}
            className="px-6 py-2 bg-amber-700 text-white rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] bg-[#14110e] flex flex-col">
      <div className="flex-1 relative">
        <SpeakerLayout VideoPlaceholder={() => null} PictureInPicturePlaceholder={() => null} />

        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleLeave}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              title="End and leave"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <p className="text-white font-medium text-sm">
                {participantCount} participant{participantCount !== 1 ? "s" : ""}
              </p>
              <p className="text-white/70 text-xs">{formatDuration(callDuration)}</p>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? "bg-rose-700 hover:bg-rose-800" : "bg-white/20 hover:bg-white/30 text-white"
            }`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          <button
            onClick={toggleCamera}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isCameraOff ? "bg-rose-700 hover:bg-rose-800" : "bg-white/20 hover:bg-white/30 text-white"
            }`}
            title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            {isCameraOff ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setShowBoard(true)}
            className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-white"
            title="Open shared whiteboard"
          >
            <Shapes className="w-6 h-6" />
          </button>

          <button
            onClick={handleLeave}
            className="w-14 h-14 rounded-full bg-rose-700 hover:bg-rose-800 flex items-center justify-center transition-colors"
            title="End Call"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18" />
            </svg>
          </button>
        </div>
      </div>

      {showBoard && (
        <CallWhiteboard
          token={token ?? null}
          currentUser={currentUser ?? null}
          onClose={() => setShowBoard(false)}
          boardId={boardId}
          title="Call — Whiteboard"
        />
      )}
    </div>
  );
}
