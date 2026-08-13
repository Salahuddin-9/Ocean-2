/**
 * IncomingCallPopup — the keyless incoming-call dialog rendered by the
 * CallEngineProvider when the engine is in the 'ringing' phase.
 *
 * Shows a 30s UI countdown (RING_UI_COUNTDOWN_S); the engine hard-enforces the
 * 45s CALL_ESTABLISHMENT_TIMEOUT auto-decline. The dialog disappears on its own
 * when the caller cancels (the engine leaves the ringing phase).
 */

import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video, Mic } from 'lucide-react';
import type { CallType } from './types';
import { RING_UI_COUNTDOWN_S } from './types';

interface IncomingCallPopupProps {
  callerName: string;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallPopup({ callerName, callType, onAccept, onReject }: IncomingCallPopupProps) {
  const [countdown, setCountdown] = useState(RING_UI_COUNTDOWN_S);
  const rejectedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          // Auto-decline when the visible countdown expires (matches the
          // engine's 45s hard timeout — first one to fire wins).
          if (!rejectedRef.current) {
            rejectedRef.current = true;
            onReject();
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReject]);

  const initial = callerName?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#16120c] border border-white/10 rounded-3xl p-6 shadow-2xl text-center relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />

        {/* Ringing pulse avatar */}
        <div className="relative w-24 h-24 mx-auto mt-4 mb-4">
          <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-3xl font-bold shadow-2xl">
            {initial}
          </div>
        </div>

        <div className="text-white font-semibold text-lg">{callerName || 'Someone'}</div>
        <div className="flex items-center justify-center gap-1.5 text-white/50 text-xs font-mono uppercase tracking-widest mt-1">
          {callType === 'video' ? <Video size={12} /> : <Mic size={12} />}
          {callType === 'video' ? 'Incoming video call' : 'Incoming voice call'}
        </div>

        {/* Countdown ring */}
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-white/40">
          <span className="w-5 h-5 rounded-full border-2 border-white/20 text-[9px] flex items-center justify-center">
            {countdown}
          </span>
          Auto-decline in {countdown}s
        </div>

        <div className="flex items-center justify-center gap-6 mt-6">
          <button
            onClick={onReject}
            className="inline-flex flex-col items-center gap-1.5 text-white/70 hover:text-white"
            title="Decline"
          >
            <span className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-colors">
              <PhoneOff size={22} />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider">Decline</span>
          </button>

          <button
            onClick={onAccept}
            className="inline-flex flex-col items-center gap-1.5 text-white/70 hover:text-white"
            title="Answer"
          >
            <span className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-lg animate-pulse transition-colors">
              <Phone size={26} />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider">Answer</span>
          </button>
        </div>
      </div>
    </div>
  );
}
