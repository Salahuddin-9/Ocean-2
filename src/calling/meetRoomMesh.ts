/**
 * meetRoomMesh.ts — standalone mesh WebRTC video-room engine.
 *
 * Implements the classic SimpleWebRTC / Socket.io "join-room" mesh architecture
 * over Ocean's own authenticated `/ws/chat` socket (ringSocket.ts):
 *
 *   client → server:  'join-room' | 'sending-signal' | 'leave-room'
 *   server → client:  'all-users' | 'user-connected' | 'returning-signal'
 *                     | 'user-disconnected'
 *
 * Room semantics (the "standard mesh that always works"):
 *   - A NEWCOMER who receives 'all-users' opens peer connections to every
 *     existing member and WAITS for their offer.
 *   - An EXISTING member who receives 'user-connected' opens a peer connection
 *     to the newcomer and INITIATES (sends the offer).
 *   - That yields exactly one offer per pair regardless of join order — no
 *     offer/answer glare, even when two users join the same room together.
 *   - SDP offers/answers and ICE candidates travel inside 'sending-signal' /
 *     'returning-signal' envelopes; the server relays them to the target's
 *     live sockets.
 *
 * Media: `startCamera()` calls navigator.mediaDevices.getUserMedia (the REAL
 * stream — no mock), and every RTCPeerConnection is built from
 * getRTCConfiguration(), which includes the working openrelay.metered.ca
 * STUN + TURN + TURNS ladder so calls punch through strict 4G carrier NATs.
 *
 * The class holds no React — it emits immutable snapshots through callbacks,
 * which the React hook (useMeetRoomMesh.tsx) mirrors.
 */

import { getRTCConfiguration } from '../lib/rtcConfig';
import { openRingSocket, RingSocketHandle } from './ringSocket';
import { mapGumError } from './media';

export interface MeetPeer {
  userId: string;
  name: string;
  /** Stable MediaStream — bind once to a <video srcObject>; tracks arrive live. */
  stream: MediaStream;
  connected: boolean;
}

export type MeetRoomStatus = 'idle' | 'joining' | 'connected' | 'error' | 'closed';

/** Envelope carried inside sending-signal / returning-signal. */
export interface MeshSignal {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface MeetRoomMeshOptions {
  currentUser: { id: string; name: string };
  token: string;
  roomId: string;
  /** Optional already-acquired local stream (e.g. acquired during search). */
  initialStream?: MediaStream | null;
  onPeers: (peers: MeetPeer[]) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onStatus: (status: MeetRoomStatus) => void;
  onError?: (message: string) => void;
}

interface PeerEntry {
  userId: string;
  name: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
  connected: boolean;
  isInitiator: boolean;
  makingOffer: boolean;
}

export class MeetRoomMesh {
  readonly roomId: string;
  private currentUser: { id: string; name: string };
  private token: string;
  private onPeers: (peers: MeetPeer[]) => void;
  private onLocalStream: (stream: MediaStream | null) => void;
  private onStatus: (status: MeetRoomStatus) => void;
  private onError?: (message: string) => void;

  private socket: RingSocketHandle | null = null;
  private localStream: MediaStream | null = null;
  private micOn = false;
  private camOn = false;
  private peers = new Map<string, PeerEntry>();
  private joined = false;
  private disposed = false;

  constructor(opts: MeetRoomMeshOptions) {
    this.currentUser = opts.currentUser;
    this.token = opts.token;
    this.roomId = opts.roomId;
    this.onPeers = opts.onPeers;
    this.onLocalStream = opts.onLocalStream;
    this.onStatus = opts.onStatus;
    this.onError = opts.onError;
    if (opts.initialStream) {
      this.localStream = opts.initialStream;
      this.micOn = opts.initialStream.getAudioTracks().length > 0;
      this.camOn = opts.initialStream.getVideoTracks().length > 0;
    }
  }

  // ── accessors ─────────────────────────────────────────────────────────────

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  isMicOn(): boolean {
    return this.micOn;
  }

  isCamOn(): boolean {
    return this.camOn;
  }

  hasJoined(): boolean {
    return this.joined;
  }

  // ── media (real getUserMedia) ─────────────────────────────────────────────

  /**
   * Acquire the local camera + microphone. Reuses an already-acquired stream.
   * Any existing peers get the new tracks attached immediately.
   */
  async startCamera(): Promise<MediaStream | null> {
    if (this.localStream) return this.localStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });
      this.localStream = stream;
      this.micOn = true;
      this.camOn = true;
      this.peers.forEach((p) => this.addLocalTracksTo(p.pc));
      this.onLocalStream(stream);
      return stream;
    } catch (e) {
      const msg = mapGumError(e);
      this.onError?.(`⚠️ ${msg} — allow camera & microphone access to start video.`);
      this.onLocalStream(null);
      return null;
    }
  }

  /** Enable/disable the microphone track (no renegotiation). Returns new state. */
  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return this.micOn;
    track.enabled = !track.enabled;
    this.micOn = track.enabled;
    return this.micOn;
  }

  /** Enable/disable the camera track (no renegotiation). Returns new state. */
  toggleCamera(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return this.camOn;
    track.enabled = !track.enabled;
    this.camOn = track.enabled;
    return this.camOn;
  }

  private addLocalTracksTo(pc: RTCPeerConnection): void {
    if (!this.localStream) return;
    this.localStream.getTracks().forEach((t) => {
      try {
        pc.addTrack(t, this.localStream!);
      } catch (e) {
        // Track already added to this pc — fine.
      }
    });
  }

  // ── room lifecycle ────────────────────────────────────────────────────────

  /**
   * Open the authenticated chat socket (shared, singleton per tab) and send
   * 'join-room'. The server replies with 'all-users' and fans out
   * 'user-connected' — both handled below.
   */
  joinRoom(): void {
    if (this.disposed || this.joined) return;
    this.joined = true;
    this.onStatus('joining');

    this.socket = openRingSocket({
      token: this.token,
      userId: this.currentUser.id,
      name: this.currentUser.name || 'User',
      onEvent: (data) => {
        try {
          this.handleSocketEvent(data);
        } catch (e) {
          console.warn('mesh socket event error:', e);
        }
      },
    });

    this.socket.send({
      type: 'join-room',
      roomId: this.roomId,
      name: this.currentUser.name || 'User',
    });
  }

  /** Leave the room (server broadcasts 'user-disconnected') and keep the camera. */
  leaveRoom(): void {
    if (this.socket) {
      try {
        this.socket.send({ type: 'leave-room', roomId: this.roomId });
      } catch (e) {
        /* ignore */
      }
    }
    this.teardownPeers();
    this.joined = false;
    this.onStatus('closed');
  }

  /** Full stop: leave the room, release camera/mic, close the socket. */
  stop(): void {
    this.leaveRoom();
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        /* ignore */
      }
      this.localStream = null;
      this.micOn = false;
      this.camOn = false;
      this.onLocalStream(null);
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        /* ignore */
      }
      this.socket = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  // ── signaling handling ────────────────────────────────────────────────────

  private handleSocketEvent(data: any): void {
    if (!data || typeof data.type !== 'string') return;
    if (data.roomId && data.roomId !== this.roomId) return;
    switch (data.type) {
      case 'all-users': {
        // I am the newcomer: open a peer to each existing member and WAIT for
        // their offer (they initiate — no glare).
        const users: any[] = Array.isArray(data.users) ? data.users : [];
        users.forEach((u: any) => {
          if (!u || u.userId === this.currentUser.id) return;
          this.connectToPeer(u.userId, u.name || 'Stranger', false);
        });
        break;
      }
      case 'user-connected': {
        // Someone joined after me: I am the existing member → I INITIATE.
        if (data.userId === this.currentUser.id) return;
        this.connectToPeer(data.userId, data.name || 'Stranger', true);
        break;
      }
      case 'returning-signal': {
        if (data.fromUserId === this.currentUser.id) return;
        // Absolute error boundary: a rejected SDP/ICE negotiation must never
        // surface as an unhandled promise rejection that breaks the socket.
        void this.handleSignal(data.fromUserId, data.signal).catch((e) => {
          console.warn('mesh returning-signal handler failed:', e);
        });
        break;
      }
      case 'user-disconnected': {
        if (data.userId === this.currentUser.id) return;
        this.removePeer(data.userId);
        break;
      }
      default:
        break;
    }
  }

  private connectToPeer(userId: string, name: string, initiate: boolean): void {
    if (this.disposed) return;
    if (this.peers.has(userId)) return;
    const pc = new RTCPeerConnection(getRTCConfiguration());
    const entry: PeerEntry = {
      userId,
      name,
      pc,
      stream: new MediaStream(),
      connected: false,
      isInitiator: initiate,
      makingOffer: false,
    };
    this.peers.set(userId, entry);

    this.addLocalTracksTo(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal(userId, { candidate: event.candidate.toJSON() });
    };

    pc.ontrack = (event) => {
      const s = entry.stream;
      // Explicitly group both audio AND video tracks into a unified media stream
      // before assigning to the remote video element's srcObject. This ensures
      // proper stream synchronization on strict 4G/5G mobile carrier networks.
      if (event.track && !s.getTracks().some((t) => t.id === event.track!.id)) {
        s.addTrack(event.track);
      }
      // Also process event.streams for browsers (e.g., Safari) that may fire
      // ontrack with an empty event.streams — always capture event.track too.
      event.streams.forEach((st) => {
        st.getTracks().forEach((t) => {
          if (!s.getTracks().some((x) => x.id === t.id)) s.addTrack(t);
        });
      });
      this.emitPeers();
    };

    pc.onconnectionstatechange = () => {
      if (this.disposed) return;
      const cs = pc.connectionState;
      const wasConnected = entry.connected;
      entry.connected = cs === 'connected';
      if (cs === 'failed' || cs === 'closed') {
        this.removePeer(userId);
        return;
      }
      if (entry.connected !== wasConnected) this.emitPeers();
    };

    if (initiate) {
      entry.makingOffer = true;
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (pc.localDescription) this.sendSignal(userId, { sdp: pc.localDescription });
        })
        .catch((e) => console.warn('mesh offer failed:', e))
        .finally(() => {
          entry.makingOffer = false;
        });
    }

    this.emitPeers();
  }

  /** Handle an incoming offer/answer/candidate from a peer. */
  private async handleSignal(fromUserId: string, signal: MeshSignal | null | undefined): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (!peer || this.disposed) return;
    const pc = peer.pc;
    try {
      if (signal && signal.sdp) {
        const desc = signal.sdp as RTCSessionDescriptionInit;
        // Glare guard: if we already sent an offer and the peer's offer lands
        // before our answer round-trips, ignore the colliding offer — our
        // existing negotiation wins and the peer's answer resolves it.
        const offerCollision =
          desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        if (offerCollision) return;
        await pc.setRemoteDescription(new RTCSessionDescription(desc));
        if (desc.type === 'offer') {
          peer.isInitiator = false;
          peer.makingOffer = true;
          try {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) this.sendSignal(fromUserId, { sdp: pc.localDescription });
          } finally {
            peer.makingOffer = false;
          }
        }
      } else if (signal && signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          // Expected when a candidate arrives between setRemoteDescription calls.
          console.warn('mesh addIceCandidate skipped:', e);
        }
      }
    } catch (e) {
      console.warn('mesh handleSignal error:', e);
    }
  }

  private sendSignal(toUserId: string, signal: MeshSignal): void {
    if (!this.socket) return;
    try {
      this.socket.send({
        type: 'sending-signal',
        roomId: this.roomId,
        userToSignal: toUserId,
        signal,
      });
    } catch (e) {
      console.warn('mesh signal send failed:', e);
    }
  }

  private removePeer(userId: string): void {
    const peer = this.peers.get(userId);
    if (!peer) return;
    try {
      peer.pc.close();
    } catch (e) {
      /* ignore */
    }
    this.peers.delete(userId);
    this.emitPeers();
  }

  private teardownPeers(): void {
    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch (e) {
        /* ignore */
      }
    });
    this.peers.clear();
    this.emitPeers();
  }

  private emitPeers(): void {
    if (this.disposed) return;
    const list: MeetPeer[] = Array.from(this.peers.values()).map((p) => ({
      userId: p.userId,
      name: p.name,
      stream: p.stream,
      connected: p.connected,
    }));
    this.onPeers(list);
    // Once any peer connects, surface the live status.
    if (list.some((p) => p.connected) && !this.disposed) this.onStatus('connected');
  }
}
