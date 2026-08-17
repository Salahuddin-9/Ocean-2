import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * JitsiMeeting — embed a Jitsi Meet conference (from jitsi-meet-master) in a
 * full-screen modal. Works with zero API keys: it loads the open-source Jitsi
 * Meet iframe API from a configurable host.
 *
 * Default host is `8x8.vc` (the open public Jitsi deployment that permits free
 * iframe embedding on mobile/4G); if its external_api.js cannot be reached the
 * component automatically falls back to `meet.jit.si`. Set VITE_JITSI_HOST in
 * the environment to pin a specific (e.g. self-hosted) server.
 */

const DEFAULT_JITSI_HOST = '8x8.vc';
const FALLBACK_JITSI_HOST = 'meet.jit.si';

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
  const [resolvedHost, setResolvedHost] = useState<string>('');

  // Single source of truth for the Jitsi host — every link (iframe, "open in
  // new tab", error fallback) honors VITE_JITSI_HOST instead of hardcoding it.
  // Stable across renders (import.meta.env is static) so the effect never
  // re-runs on a fresh array identity.
  const hostCandidates = useMemo(() => {
    const envHost = (import.meta as any)?.env?.VITE_JITSI_HOST;
    return envHost ? [envHost] : [DEFAULT_JITSI_HOST, FALLBACK_JITSI_HOST];
  }, []);

  const safeRoom = roomName.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 80);
  const meetingUrl = `https://${resolvedHost || hostCandidates[0]}/${safeRoom}`;

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const ensureScript = (host: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve(window.JitsiMeetExternalAPI);
          return;
        }
        const existing = document.querySelector(`script[data-jitsi-api="${host}"]`);
        if (existing) {
          const check = () =>
            window.JitsiMeetExternalAPI ? resolve(window.JitsiMeetExternalAPI) : setTimeout(check, 200);
          check();
          return;
        }
        const script = document.createElement('script');
        script.src = `https://${host}/external_api.js`;
        script.dataset.jitsiApi = host;
        script.async = true;
        script.onload = () =>
          window.JitsiMeetExternalAPI ? resolve(window.JitsiMeetExternalAPI) : reject(new Error('Jitsi API missing'));
        script.onerror = () => reject(new Error(`Failed to load Jitsi API script from ${host}`));
        document.head.appendChild(script);
      });
    };

    // Try each candidate host in order so a flaky/unreachable default (common
    // on mobile 4G) degrades to the next public instance instead of a blank
    // screen. The first host whose external_api.js loads wins.
    const loadWithFallback = async (hosts: string[]): Promise<{ host: string; Api: any }> => {
      let lastErr: any = null;
      for (const host of hosts) {
        try {
          const Api = await ensureScript(host);
          if (Api) return { host, Api };
        } catch (e) {
          lastErr = e;
          console.warn(`Jitsi: ${host} unavailable, trying next host.`, e);
        }
      }
      throw lastErr || new Error('All Jitsi hosts failed');
    };

    loadWithFallback(hostCandidates)
      .then(({ host, Api }) => {
        if (disposed || !containerRef.current) return;
        setResolvedHost(host);

        // Mobile viewport scaling: the iframe API reliably fills the screen
        // when given explicit pixel dimensions (the '100%' string form is
        // known to collapse to 0-height on some mobile browsers). Measure the
        // container and keep it in sync via ResizeObserver (rotation, browser
        // chrome show/hide, split-screen).
        const el = containerRef.current;
        const width = el.clientWidth || window.innerWidth || 1280;
        const height = el.clientHeight || window.innerHeight || 720;

        apiRef.current = new Api(host, {
          roomName: safeRoom,
          width,
          height,
          parentNode: el,
          userInfo: { displayName: displayName || 'Guest' },
          configOverwrite: {
            disableInviteFunctions: false,
            // Keep the meeting inside the iframe on mobile: without this the
            // client can redirect to the native "open in Jitsi app" deep link,
            // which leaves the iframe blank.
            disableDeepLinking: true,
            // Explicitly allow third-party requests (Gravatar avatars etc.) so
            // the lobby renders fully rather than being stripped blank.
            disableThirdPartyRequests: false,
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            // Audio-only meetings (isVideo=false) never turn the camera on.
            startWithVideoMuted: isVideo ? false : true,
          },
          interfaceConfigOverwrite: {
            // Hide the "Download the app" promo that can overlay/redirect the
            // embedded meeting on phones.
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: '#0b0a0e',
          },
        });

        try {
          resizeObserver = new ResizeObserver(() => {
            const container = containerRef.current;
            if (container && apiRef.current) {
              try {
                apiRef.current.resize(container.clientWidth, container.clientHeight);
              } catch (e) {
                /* ignore */
              }
            }
          });
          resizeObserver.observe(el);
        } catch (e) {
          // ResizeObserver unavailable (very old browsers) — initial size still applies.
        }
      })
      .catch(() => {
        if (!disposed) setScriptError(true);
      });

    return () => {
      disposed = true;
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (e) {
          /* ignore */
        }
        apiRef.current = null;
      }
    };
  }, [roomName, displayName, isVideo, safeRoom, hostCandidates]);

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
              Open {resolvedHost || hostCandidates[0]} instead
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
