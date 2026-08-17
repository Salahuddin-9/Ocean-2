/**
 * rtcConfig — shared WebRTC ICE configuration for ALL keyless P2P call paths
 * (chat 1:1 calls via useP2PCall.ts and random "Meet" calls via
 * useRandomVideoCall.ts). Both are built on CallEngine (callEngine.ts), which
 * constructs every RTCPeerConnection from getRTCConfiguration() below.
 *
 * This mirrors the tinode (chat-master) `webrtc` config pattern: ICE servers
 * are supplied at deploy time. STUN servers are free and built-in; a TURN
 * server is REQUIRED for calls to succeed across strict NATs / firewalls
 * (mobile 4G/5G carrier NATs, mobile hotspots, campus networks, residential
 * CGNAT, Ngrok tunnels, etc.) because STUN can only discover candidates — it
 * cannot relay media when both peers sit behind symmetric NATs.
 *
 * Free public TURN relays (Metered.ca "Open Relay") are included below so
 * calls work out of the box. They use the documented shared community
 * credentials (openrelayproject / openrelayproject) and are fine for dev and
 * demos. They are NOT the paid `relay.metered.ca` service — that hostname
 * requires per-account credentials issued from your Metered dashboard, so a
 * snippet with `relay.metered.ca` + fabricated creds will 401 and burn ICE
 * gathering time; do not re-add it.
 *
 * For production, prefer your own relay via environment variables
 * (see .env.example) — it is prepended so it takes priority:
 *   VITE_TURN_URL        e.g. turn:your-turn-server.example:3478  (or turns:…)
 *   VITE_TURN_USERNAME   TURN credential username (if auth is enabled)
 *   VITE_TURN_CREDENTIAL TURN credential secret
 */

/**
 * Build the ICE server list used to construct every RTCPeerConnection.
 *
 * Strategy — a full fallback ladder, in priority order:
 *   1. VITE_TURN_URL — your own relay, if provisioned (highest priority).
 *   2. Google STUN trio + Open Relay STUN — cheap, fast candidate discovery
 *      for the ~85% of NATs where STUN alone succeeds (host/server-reflexive).
 *   3. Open Relay TURN — the relay that actually tunnels media through
 *      symmetric NAT / strict firewalls: UDP and TCP on BOTH port 80 and
 *      443 (corporate/carrier firewalls almost always permit these), plus a
 *      TURNS (TLS) endpoint on 443 for deep-packet-inspection firewalls.
 *
 * ICE tries servers in order and skips any that fail, so extra entries are a
 * robustness net, not a cost — unless credentials are wrong (see header).
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // STUN — free, fast, handles most NATs, but cannot relay media.
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    // Free public TURN relay (Metered.ca "Open Relay", openrelayproject) —
    // the only way to traverse a symmetric NAT / strict firewall, and the
    // reason calls over an Ngrok tunnel (where host candidates are unusable)
    // connect. Shared community credentials; okay for dev & demos.
    // UDP + TCP on both 80 and 443 so 4G/5G carrier firewalls can pass.
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    // TURNS (TLS on 443) — survives DPI firewalls that block plain UDP/TCP
    // TURN; the strongest fallback for strict carrier networks.
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ];

  try {
    const env = (import.meta as any)?.env || {};
    const turnUrl = env.VITE_TURN_URL;
    if (turnUrl) {
      const turn: RTCIceServer = { urls: String(turnUrl) };
      if (env.VITE_TURN_USERNAME) turn.username = String(env.VITE_TURN_USERNAME);
      if (env.VITE_TURN_CREDENTIAL) turn.credential = String(env.VITE_TURN_CREDENTIAL);
      servers.unshift(turn);
    }
  } catch (e) {
    console.warn('rtcConfig: could not read VITE_TURN_* env vars:', e);
  }

  return servers;
}

/** Convenience: a full RTCConfiguration with the shared ICE servers. */
export function getRTCConfiguration(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    // Increase iceCandidatePoolSize to 10 to speed up connection candidate
    // gathering on slow cellular 4G/5G connections. This pre-gathers candidates
    // before createOffer()/createAnswer() is called, reducing connection latency.
    iceCandidatePoolSize: 10,
  };
}
