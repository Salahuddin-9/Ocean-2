/**
 * rtcConfig — shared WebRTC ICE configuration for ALL keyless P2P call paths
 * (chat 1:1 calls via useP2PCall.ts and random "Meet" calls via
 * useRandomVideoCall.ts).
 *
 * This mirrors the tinode (chat-master) `webrtc` config pattern: ICE servers
 * are supplied at deploy time. STUN servers are free and built-in; a TURN
 * server is REQUIRED for calls to succeed across strict NATs / firewalls
 * (mobile hotspots, campus networks, etc.).
 *
 * Configure via environment variables (see .env.example):
 *   VITE_TURN_URL        e.g. turn:your-turn-server.example:3478  (or turns:…)
 *   VITE_TURN_USERNAME   TURN credential username (if auth is enabled)
 *   VITE_TURN_CREDENTIAL TURN credential secret
 */

/**
 * Build the ICE server list used to construct every RTCPeerConnection.
 * Public Google STUN servers are the default; an optional TURN server is
 * appended when VITE_TURN_URL is set so media still flows behind strict NATs.
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  try {
    const env = (import.meta as any)?.env || {};
    const turnUrl = env.VITE_TURN_URL;
    if (turnUrl) {
      const turn: RTCIceServer = { urls: String(turnUrl) };
      if (env.VITE_TURN_USERNAME) turn.username = String(env.VITE_TURN_USERNAME);
      if (env.VITE_TURN_CREDENTIAL) turn.credential = String(env.VITE_TURN_CREDENTIAL);
      servers.push(turn);
    }
  } catch (e) {
    console.warn('rtcConfig: could not read VITE_TURN_* env vars:', e);
  }

  return servers;
}

/** Convenience: a full RTCConfiguration with the shared ICE servers. */
export function getRTCConfiguration(): RTCConfiguration {
  return { iceServers: getIceServers() };
}
