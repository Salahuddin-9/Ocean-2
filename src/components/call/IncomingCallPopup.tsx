import { useEffect, useState } from "react";
import { useCalls, CallingState, Call } from "@stream-io/video-react-sdk";

interface IncomingCallPopupProps {
  onAccept: (call: Call) => void;
}

export default function IncomingCallPopup({ onAccept }: IncomingCallPopupProps) {
  const calls = useCalls();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [timer, setTimer] = useState(30);

  const incomingCalls = calls.filter(
    (call) => !call.isCreatedByMe && call.state.callingState === CallingState.RINGING
  );

  useEffect(() => {
    if (incomingCalls.length > 0) {
      setIncomingCall(incomingCalls[0]);
      setTimer(30);
    } else {
      setIncomingCall(null);
    }
  }, [incomingCalls]);

  useEffect(() => {
    if (!incomingCall) return;

    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          rejectCall();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [incomingCall]);

  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      const isVideo = incomingCall.state.custom?.isVideo ?? true;
      if (!isVideo) {
        try {
          await incomingCall.camera.disable();
        } catch (e) {
          console.warn("Could not disable camera for audio call:", e);
        }
      }
      await incomingCall.join();
    } catch (err) {
      console.warn("Accept call warning:", err);
    } finally {
      onAccept(incomingCall);
      setIncomingCall(null);
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    try {
      await incomingCall.reject();
    } catch (err) {
      console.warn("Reject call failed:", err);
    } finally {
      setIncomingCall(null);
    }
  };

  if (!incomingCall) return null;

  const callerName =
    incomingCall.state.members?.find((m: any) => m.user_id !== incomingCall.state.createdBy?.id)?.user?.name ||
    incomingCall.state.members?.[0]?.user?.name ||
    "Unknown User";

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#fcfaf4] border border-[#ebdcca] rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center animate-slide-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-[#3a342a] mb-1 font-display uppercase tracking-tight">
          Incoming Call
        </h3>
        <p className="text-[#5c5446] mb-1 font-semibold">{callerName}</p>
        <p className="text-sm text-[#8a8172] mb-6 font-mono">{timer}s remaining</p>
        <div className="flex gap-3">
          <button
            onClick={rejectCall}
            className="flex-1 py-3 bg-rose-700 hover:bg-rose-800 text-white font-semibold rounded-xl transition-colors"
          >
            Reject
          </button>
          <button
            onClick={acceptCall}
            className="flex-1 py-3 bg-amber-800 hover:bg-amber-900 text-white font-semibold rounded-xl transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
