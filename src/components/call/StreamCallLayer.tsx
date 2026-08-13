import {
  createContext,
  useCallback,
  useContext,
  useState,
  ReactNode,
} from "react";
import { Call } from "@stream-io/video-react-sdk";
import StreamProvider, { useStreamVideoClientSafe, StreamUser } from "./StreamProvider";
import IncomingCallPopup from "./IncomingCallPopup";
import { ActiveCallScreen } from "./ActiveCallScreen";
import { useCallEngineContext } from "../../calling/useCallEngine";

interface ActiveCallInfo {
  callId: string;
  callType: string;
}

interface StreamCallContextValue {
  startCall: (targetUserId: string, callType?: "audio" | "video") => Promise<boolean>;
  activeCall: ActiveCallInfo | null;
  endCall: () => void;
}

const StreamCallContext = createContext<StreamCallContextValue | null>(null);

export function useStreamCall(): StreamCallContextValue | null {
  return useContext(StreamCallContext);
}

interface StreamCallLayerProps {
  user: StreamUser | null;
  token: string | null;
  children: ReactNode;
}

export default function StreamCallLayer({ user, token, children }: StreamCallLayerProps) {
  return (
    <StreamProvider user={user} token={token}>
      <StreamCallLayerInner user={user} token={token}>{children}</StreamCallLayerInner>
    </StreamProvider>
  );
}

function StreamCallLayerInner({ user, token, children }: { user: StreamUser | null; token: string | null; children: ReactNode }) {
  const client = useStreamVideoClientSafe();
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);

  const endCall = useCallback(() => {
    setActiveCall(null);
  }, []);

  const startCall = useCallback(
    async (targetUserId: string, callType: "audio" | "video" = "audio"): Promise<boolean> => {
      if (!client || !user || !targetUserId) return false;

      try {
        if (token) {
          try {
            await fetch("/api/stream/upsert-target", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ targetUserId }),
            });
          } catch (upsertErr) {
            console.warn("Failed to pre-upsert target user:", upsertErr);
          }
        }

        const callId = `call_${[user.id, targetUserId].sort().join("_")}`;
        const call = client.call("default", callId);

        const isVideo = callType === "video";
        await call.getOrCreate({
          data: {
            members: [{ user_id: user.id }, { user_id: targetUserId }],
            custom: { isVideo },
          },
          ring: true,
        });

        if (!isVideo) {
          try {
            await call.camera.disable();
          } catch (e) {
            console.warn("Camera disable warning for audio call:", e);
          }
        }

        try {
          await call.join();
        } catch (joinErr) {
          console.warn("Call join media warning:", joinErr);
        }

        setActiveCall({ callId, callType: "default" });
        return true;
      } catch (err) {
        console.error("Call failed:", err);
        return false;
      }
    },
    [client, user, token]
  );

  const handleIncomingAccept = useCallback((call: Call) => {
    setActiveCall({ callId: call.id, callType: call.type || "default" });
  }, []);

  if (!client || !user) {
    return <>{children}</>;
  }

  const contextValue: StreamCallContextValue = { startCall, activeCall, endCall };

  return (
    <StreamCallContext.Provider value={contextValue}>
      <IncomingCallPopup onAccept={handleIncomingAccept} />
      {activeCall && (
        <ActiveCallScreen
          callId={activeCall.callId}
          callType={activeCall.callType}
          onLeave={endCall}
          token={token}
          currentUser={user ? { id: user.id, name: user.name } : null}
          boardId={`stream-${activeCall.callId}`}
        />
      )}
      {children}
    </StreamCallContext.Provider>
  );
}

interface StartCallButtonProps {
  targetUserId: string;
  callType?: "audio" | "video";
  /** Display name of the recipient (shown on the caller's ringing screen). */
  peerName?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function StartCallButton({
  targetUserId,
  callType = "audio",
  peerName,
  className = "",
  title = "Start Call",
  disabled = false,
  children,
}: StartCallButtonProps) {
  const streamCall = useStreamCall();
  const engine = useCallEngineContext();

  const handleClick = async () => {
    if (!targetUserId || disabled) return;
    // Prefer Stream Video when a client is ready (API keys configured) — an
    // optional enhancement. With no keys it is skipped, and the call runs on
    // the built-in self-contained engine (no external platform required).
    if (streamCall) {
      const ok = await streamCall.startCall(targetUserId, callType);
      if (ok) return;
    }
    if (engine) {
      await engine.startCall(targetUserId, callType, peerName);
    }
  };

  const isUnavailable = !targetUserId;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isUnavailable}
      className={`${className} ${isUnavailable ? "opacity-50 cursor-not-allowed" : ""}`}
      title={isUnavailable ? "No recipient available" : title}
    >
      {children}
    </button>
  );
}
