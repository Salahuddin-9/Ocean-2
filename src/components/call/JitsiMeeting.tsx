import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * JitsiMeeting — embed a Jitsi Meet conference (from jitsi-meet-master) in a
 * full-screen modal. Works with zero API keys: it loads the open-source Jitsi
 * Meet iframe API from a configurable host (defaults to the public meet.jit.si).
 * Set JITSI_HOST in the environment to point at a self-hosted Jitsi server.
 */

const DEFAULT_JITSI_HOST = 'meet.jit.si';

interface JitsiMeetingProps {
  roomName: string;
  displayName?: string;
  isVideo?: boolean;
  onClose?: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export const JitsiMeeting: React.FC<JitsiMeetingProps> = ({ roomName, displayName, isVideo = true, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [scriptError, setScriptError] = useState(false);

  // Single source of truth for the Jitsi host — every link (iframe, "open in
  // new tab", error fallback) honors VITE_JITSI_HOST instead of hardcoding it.
  const host = (import.meta as any)?.env?.VITE_JITSI_HOST || DEFAULT_JITSI_HOST;
  const safeRoom = roomName.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 80);
  const meetingUrl = `https://${host}/${safeRoom}`;

  useEffect(() => {
    let disposed = false;

    const ensureScript = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve(window.JitsiMeetExternalAPI);
          return;
        }
        const existing = document.querySelector('script[data-jitsi-api]');
        if (existing) {
          const check = () =>
            window.JitsiMeetExternalAPI ? resolve(window.JitsiMeetExternalAPI) : setTimeout(check, 200);
          check();
          return;
        }
        const script = document.createElement('script');
        script.src = `https://${host}/external_api.js`;
        script.dataset.jitsiApi = '1';
        script.async = true;
        script.onload = () =>
          window.JitsiMeetExternalAPI ? resolve(window.JitsiMeetExternalAPI) : reject(new Error('Jitsi API missing'));
        script.onerror = () => reject(new Error('Failed to load Jitsi API script'));
        document.head.appendChild(script);
      });
    };

    ensureScript()
      .then((Api) => {
        if (disposed || !containerRef.current) return;
        apiRef.current = new Api(host, {
          roomName: safeRoom,
          width: '100%',
          height: '100%',
          parentNode: containerRef.current,
          userInfo: { displayName: displayName || 'Guest' },
          configOverwrite: {
            disableInviteFunctions: false,
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            // Audio-only meetings (isVideo=false) never turn the camera on.
            startWithVideoMuted: isVideo ? false : true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: '#0b0a0e',
          },
        });
      })
      .catch(() => {
        if (!disposed) setScriptError(true);
      });

    return () => {
      disposed = true;
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          /* ignore */
        }
        apiRef.current = null;
      }
    };
  }, [roomName, displayName, isVideo, host, safeRoom]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-white/10">
        <div className="text-white font-semibold text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Jitsi Meeting · {roomName}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-white border border-white/15 px-2 py-1 rounded-full"
          >
            Open in new tab
          </a>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-rose-600/80 flex items-center justify-center text-white transition-colors"
            title="Leave meeting"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 relative">
        <div ref={containerRef} className="absolute inset-0" />
        {scriptError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white bg-zinc-950">
            <div className="text-3xl">🎥</div>
            <div className="text-sm font-semibold">Couldn't load Jitsi Meet</div>
            <div className="text-xs text-white/50 max-w-md text-center px-6">
              The Jitsi external API script couldn't be loaded. Check your internet connection, or set a
              self-hosted <code className="text-emerald-400">VITE_JITSI_HOST</code> in your environment.
            </div>
            <a
              href={meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold"
            >
              Open {host} instead
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
