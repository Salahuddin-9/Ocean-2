/**
 * Ocean — Offline Peer-to-Peer Messaging Engine (turtleOfflineP2P)
 * =================================================================
 * A fully client-side, zero-server messaging engine that lets two people
 * communicate with NO internet connection:
 *
 *  1. BLUETOOTH (real radio)  — Web Bluetooth GATT client. The browser connects
 *     to any nearby BLE peripheral exposing the Ocean Mesh GATT service and
 *     exchanges messages over TX/RX characteristics. Works with a native app,
 *     ESP32 / Arduino, or any device implementing the documented service.
 *  2. VIRTUAL PERIPHERAL SIM — an in-browser BLE *simulator* over
 *     BroadcastChannel. One tab can "advertise" as a virtual BLE device and
 *     another tab connects to it — so the full Bluetooth message flow can be
 *     tested with zero hardware, between two tabs / phones on the same origin.
 *  3. WEBRTC LAN LINK       — direct browser-to-browser DataChannel over the
 *     local network with manual copy/paste or QR signaling. No internet, no
 *     server, no STUN/TURN needed on the same LAN.
 *  4. STORE-AND-FORWARD      — every message is persisted locally with a
 *     delivery status (queued → sent → delivered). When a peer comes back in
 *     range, pending messages flush automatically; peers also exchange each
 *     other's mailboxes (courier / mesh relay, bounded hops).
 *
 * The GATT protocol (for real hardware interoperability):
 *   Service UUID  e3b5c100-3d1a-4a7f-9c21-5c3d2f0a8b01
 *   TX char       e3b5c101-...-02   (client writes JSON packets here, notify=0x08)
 *   RX char       e3b5c102-...-03   (peripheral streams JSON packets to client)
 *   Packets are UTF-8 JSON, optionally fragmented as `F<i>/<total> <chunk>` when
 *   larger than ~180 bytes (BLE MTU friendly).
 *
 * All state lives in localStorage — nothing is ever sent to any server.
 */

export type TransportVia = 'ble' | 'sim' | 'webrtc' | 'local';
export type MsgStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed';

export interface PeerInfo {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  ts: number;
  direction: 'in' | 'out';
  via: TransportVia | null;
  status?: MsgStatus;
  /** How many relays this message has been through (mesh hops, bounded). */
  hops: number;
}

export interface PeerState {
  id: string;
  name: string;
  lastSeen: number;
  connected: boolean;
  via: TransportVia | null;
}

export interface EngineStatus {
  ble: 'idle' | 'unsupported' | 'scanning' | 'connecting' | 'connected' | 'error';
  bleError?: string;
  simAdvertising: boolean;
  rtc: 'idle' | 'offering' | 'waiting-answer' | 'connecting' | 'connected' | 'error';
  rtcError?: string;
  online: boolean;
  queued: number;
  delivered: number;
  connectedPeers: number;
}

export interface SimDevice {
  id: string;
  name: string;
  lastSeen: number;
}

// ---------------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------------

export type Packet =
  | { t: 'hello'; id: string; name: string; ts: number }
  | { t: 'msg'; id: string; from: string; to: string; body: string; ts: number; hops: number }
  | { t: 'ack'; id: string; ts: number }
  | { t: 'mailbox'; msgs: Array<{ id: string; from: string; to: string; body: string; ts: number; hops: number }> }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'bye'; id?: string; ts: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORE_IDENTITY = 'ocean_p2p_identity';
const STORE_MESSAGES = 'ocean_p2p_messages';
const STORE_PEERS = 'ocean_p2p_peers';

/**
 * Identity lives in sessionStorage (per-tab): two tabs of the same app are two
 * independent devices — exactly like two phones. Messages/peers live in
 * localStorage but are merged on write and re-synced on the `storage` event, so
 * multiple tabs on one machine stay consistent without clobbering each other.
 */
function loadIdentity(): { id: string; name: string } {
  try {
    const raw = sessionStorage.getItem(STORE_IDENTITY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return parsed;
    }
  } catch {
    /* fall through */
  }
  const fresh = { id: uid('peer'), name: `Ocean-${Math.floor(1000 + Math.random() * 9000)}` };
  try {
    sessionStorage.setItem(STORE_IDENTITY, JSON.stringify(fresh));
  } catch {
    /* ignore */
  }
  return fresh;
}

const BLE_SERVICE = 'e3b5c100-3d1a-4a7f-9c21-5c3d2f0a8b01';
const BLE_CHAR_TX = 'e3b5c101-3d1a-4a7f-9c21-5c3d2f0a8b01';
const BLE_CHAR_RX = 'e3b5c102-3d1a-4a7f-9c21-5c3d2f0a8b01';

const SIM_CHANNEL = 'ocean-p2p-sim';
const BLE_FRAME_MAX = 180;
const MAILBOX_MAX = 40;
const MAX_HOPS = 3;
const STORE_MAX_MESSAGES = 400;
/** A peer with no packet traffic for this long is considered out of range. */
const PEER_STALE_MS = 120 * 1000;

// ---------------------------------------------------------------------------
// Minimal ambient types for Web Bluetooth (not in standard TS DOM lib)
// ---------------------------------------------------------------------------

interface BluetoothCharacteristicEvent {
  target: {
    value?: DataView | ArrayBuffer;
  };
}

interface GattCharacteristicLike {
  startNotifications(): Promise<GattCharacteristicLike>;
  stopNotifications(): Promise<GattCharacteristicLike>;
  writeValueWithResponse(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse(value: Uint8Array): Promise<void>;
  addEventListener(type: 'characteristicvaluechanged', cb: (e: BluetoothCharacteristicEvent) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', cb: (e: BluetoothCharacteristicEvent) => void): void;
  value?: DataView;
}

interface GattServiceLike {
  getCharacteristic(uuid: string): Promise<GattCharacteristicLike>;
}

interface BluetoothDeviceLike {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<GattServiceLike> }>;
    disconnect(): void;
  };
  addEventListener(type: 'gattserverdisconnected', cb: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', cb: () => void): void;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice(options: {
      filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
      acceptAllDevices?: boolean;
      optionalServices?: string[];
    }): Promise<BluetoothDeviceLike>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function uid(prefix = 'm'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[p2p] persistence failed:', e);
  }
}

function encodePacket(pkt: Packet): string {
  return JSON.stringify(pkt);
}

function tryParsePacket(raw: string): Packet | null {
  try {
    const obj = JSON.parse(raw) as Packet;
    if (obj && typeof obj.t === 'string') return obj;
  } catch {
    /* ignore partial frames */
  }
  return null;
}

// --- BLE fragmentation (MTU-friendly) -------------------------------------
// Frame format: `F<index>/<total> <chunk>`. The receiver buffers chunks and
// only emits a packet once the full frame set has arrived and parses as JSON.

function fragmentPayload(payload: string, max = BLE_FRAME_MAX): string[] {
  if (payload.length <= max) return [payload];
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += max) {
    chunks.push(payload.slice(i, i + max));
  }
  return chunks.map((chunk, i) => `F${i}/${chunks.length} ${chunk}`);
}

class FrameAssembler {
  private parts = new Map<string, string[]>();
  private totals = new Map<string, number>();
  private pending = new Map<string, string>();
  private lastSeen = new Map<string, number>();

  /**
   * Feed a raw chunk; returns a full packet string when complete, else null.
   * Partially-received frames expire after 5s so a dropped middle chunk can
   * never poison a later frame that happens to share the same chunk count.
   */
  push(raw: string): string | null {
    const match = raw.match(/^F(\d+)\/(\d+) ([\s\S]*)$/);
    if (!match) return raw; // unfragmented
    const idx = Number(match[1]);
    const total = Number(match[2]);
    const key = `${total}`;
    const now = Date.now();
    if (this.totals.has(key) && now - (this.lastSeen.get(key) || 0) > 5000) {
      this.parts.delete(key);
      this.totals.delete(key);
      this.pending.delete(key);
      this.lastSeen.delete(key);
    }
    if (!this.totals.has(key)) {
      this.totals.set(key, total);
      this.parts.set(key, new Array(total).fill(''));
      this.pending.set(key, '');
    }
    this.lastSeen.set(key, now);
    const arr = this.parts.get(key)!;
    if (idx < total) arr[idx] = match[3];
    const assembled = arr.every((c) => c !== undefined && c !== '') ? arr.join('') : null;
    if (assembled !== null) {
      this.parts.delete(key);
      this.totals.delete(key);
      this.pending.delete(key);
      this.lastSeen.delete(key);
      return assembled;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

type EngineEvent = 'message' | 'peer' | 'status' | 'sim-devices' | 'log';
type EngineListener = (...args: any[]) => void;

export class OfflineP2PEngine {
  private listeners = new Map<EngineEvent, Set<EngineListener>>();
  private messages: ChatMessage[] = [];
  private peers = new Map<string, PeerState>();
  private identity: PeerInfo;

  // BLE (real radio)
  private bleDevice: BluetoothDeviceLike | null = null;
  private bleTxChar: GattCharacteristicLike | null = null;
  private bleRxChar: GattCharacteristicLike | null = null;
  private bleOnDisconnect: (() => void) | null = null;
  private bleAssembler = new FrameAssembler();

  // Virtual peripheral (simulator)
  private simChannel: BroadcastChannel | null = null;
  private simAdvertising = false;
  private simDevices = new Map<string, SimDevice>();
  private simConnectedCentral: { id: string; name: string } | null = null;

  // WebRTC
  private rtcPeer: RTCPeerConnection | null = null;
  private rtcChannel: RTCDataChannel | null = null;
  private rtcGathered: RTCIceCandidateInit[] = [];
  private rtcState: EngineStatus['rtc'] = 'idle';

  // Status
  private bleState: EngineStatus['ble'] = 'idle';
  private bleError: string | undefined;
  private rtcError: string | undefined;
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor() {
    this.identity = loadIdentity();

    this.messages = loadJSON<ChatMessage[]>(STORE_MESSAGES, []).slice(0, STORE_MAX_MESSAGES);
    const savedPeers = loadJSON<Record<string, { name: string; lastSeen: number }>>(STORE_PEERS, {});
    for (const [id, p] of Object.entries(savedPeers)) {
      if (id === this.identity.id) continue;
      this.peers.set(id, { id, name: p.name, lastSeen: p.lastSeen, connected: false, via: null });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOnline);
      // Re-sync messages/peers when another tab on this machine writes to the store.
      window.addEventListener('storage', this.handleStorage);
    }
    this.simListen();
    this.emit('status', this.getStatus());
  }

  private handleStorage = (e: StorageEvent): void => {
    if (e.key !== STORE_MESSAGES && e.key !== STORE_PEERS) return;
    this.mergeFromStore();
    this.emit('message', 'sync');
    this.emit('peer', this.getPeers());
    this.emit('status', this.getStatus());
  };

  private mergeFromStore(): void {
    const stored = loadJSON<ChatMessage[]>(STORE_MESSAGES, []);
    const byId = new Map<string, ChatMessage>();
    for (const m of this.messages) byId.set(m.id, m);
    for (const m of stored) if (!byId.has(m.id)) byId.set(m.id, m);
    this.messages = [...byId.values()];

    const storedPeers = loadJSON<Record<string, { name: string; lastSeen: number }>>(STORE_PEERS, {});
    for (const [id, p] of Object.entries(storedPeers)) {
      if (id === this.identity.id) continue;
      if (!this.peers.has(id)) {
        this.peers.set(id, { id, name: p.name, lastSeen: p.lastSeen, connected: false, via: null });
      }
    }
  }

  // ---------------------------------------------------------------- events
  on(event: EngineEvent, cb: EngineListener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: EngineEvent, ...args: any[]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(...args);
      } catch (e) {
        console.warn('[p2p] listener error:', e);
      }
    });
  }

  private log(msg: string): void {
    this.emit('log', msg);
  }

  private handleOnline = (): void => {
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.emit('status', this.getStatus());
  };

  // ---------------------------------------------------------------- identity
  getIdentity(): PeerInfo {
    return this.identity;
  }

  setName(name: string): void {
    const clean = name.trim().slice(0, 30) || this.identity.name;
    this.identity.name = clean;
    try {
      sessionStorage.setItem(STORE_IDENTITY, JSON.stringify(this.identity));
    } catch {
      /* ignore */
    }
    this.emit('peer', this.getPeers());
    this.log(`Identity name set to "${clean}"`);
  }

  // ---------------------------------------------------------------- storage
  getMessages(): ChatMessage[] {
    return this.messages;
  }

  private persist(): void {
    // Merge into whatever another tab wrote most recently, keyed by message id,
    // so concurrent writers on the same machine never clobber each other.
    const stored = loadJSON<ChatMessage[]>(STORE_MESSAGES, []);
    const byId = new Map<string, ChatMessage>();
    for (const m of stored) byId.set(m.id, m);
    for (const m of this.messages) byId.set(m.id, m);
    saveJSON(STORE_MESSAGES, [...byId.values()].slice(-STORE_MAX_MESSAGES));

    const peersObj: Record<string, { name: string; lastSeen: number }> = {};
    for (const [id, p] of this.peers.entries()) {
      peersObj[id] = { name: p.name, lastSeen: p.lastSeen };
    }
    saveJSON(STORE_PEERS, peersObj);
  }

  getPeers(): PeerState[] {
    return [...this.peers.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  private upsertPeer(id: string, name: string, via: TransportVia): void {
    if (!id || id === this.identity.id) return;
    const existing = this.peers.get(id);
    this.peers.set(id, {
      id,
      name: name || existing?.name || 'Peer',
      lastSeen: Date.now(),
      connected: true,
      via,
    });
    this.persist();
    this.emit('peer', this.getPeers());
    this.emit('status', this.getStatus());
  }

  private markPeerDisconnected(id: string): void {
    const p = this.peers.get(id);
    if (p) {
      p.connected = false;
      p.lastSeen = Date.now();
      this.persist();
      this.emit('peer', this.getPeers());
    }
  }

  // ---------------------------------------------------------------- sending
  /** Queue (or send if connected) a message to a peer. */
  send(to: string, body: string, via?: TransportVia): ChatMessage {
    const msg: ChatMessage = {
      id: uid('m'),
      from: this.identity.id,
      to,
      body: body.slice(0, 2000),
      ts: Date.now(),
      direction: 'out',
      via: via || null,
      status: 'queued',
      hops: 0,
    };
    this.messages.push(msg);
    this.persist();
    this.emit('message', msg);
    this.emit('status', this.getStatus());
    this.flushPeer(to, via);
    return msg;
  }

  /** Try to deliver all queued messages addressed to `peerId` over `via`. */
  private flushPeer(peerId: string, via?: TransportVia): void {
    const transport = via ?? this.activeTransportFor(peerId);
    if (!transport || transport === 'local') return;
    // Include 'sending' so an interrupted attempt is retried instead of lost.
    const pending = this.messages.filter(
      (m) =>
        m.direction === 'out' &&
        m.to === peerId &&
        (m.status === 'queued' || m.status === 'failed' || m.status === 'sending')
    );
    for (const m of pending) {
      m.status = 'sending';
      this.persist();
      this.transmit(transport, { t: 'msg', id: m.id, from: m.from, to: m.to, body: m.body, ts: m.ts, hops: m.hops });
      // transmit may be synchronous (sim transport) and the peer's ack can arrive
      // *inside* the call — never overwrite a 'delivered' back to 'sent'.
      if ((m.status as MsgStatus) !== 'delivered') m.status = 'sent';
      this.persist();
      this.emit('message', m);
    }
    if (pending.length > 0) this.emit('status', this.getStatus());
  }

  private activeTransportFor(peerId: string): TransportVia | null {
    const p = this.peers.get(peerId);
    if (!p || !p.connected) return null;
    // Safety net: a peer with zero packet traffic for a while is treated as out
    // of range even if its transport hasn't reported a clean teardown yet.
    if (Date.now() - p.lastSeen > PEER_STALE_MS) {
      p.connected = false;
      this.emit('peer', this.getPeers());
      this.emit('status', this.getStatus());
      return null;
    }
    return p.via;
  }

  private markDelivered(msgId: string): void {
    const m = this.messages.find((x) => x.id === msgId && x.direction === 'out');
    if (m && m.status !== 'delivered') {
      m.status = 'delivered';
      this.persist();
      this.emit('message', m);
      this.emit('status', this.getStatus());
    }
  }

  retryAll(): void {
    const failed = this.messages.filter(
      (m) => m.direction === 'out' && m.from === this.identity.id && m.status === 'failed'
    );
    for (const m of failed) m.status = 'queued';
    this.persist();
    for (const p of this.peers.values()) {
      if (p.connected) this.flushPeer(p.id);
    }
    this.emit('message', 'retry');
    this.emit('status', this.getStatus());
    this.log(`Retrying ${failed.length} queued message(s)`);
  }

  clearDelivered(): void {
    this.messages = this.messages.filter(
      (m) => !(m.direction === 'out' && m.from === this.identity.id && m.status === 'delivered')
    );
    this.persist();
    this.emit('message', 'clear');
  }

  getQueue(): ChatMessage[] {
    return this.messages
      .filter((m) => m.direction === 'out' && m.from === this.identity.id)
      .sort((a, b) => a.ts - b.ts);
  }

  // ---------------------------------------------------------------- incoming
  private ingestIncoming(
    pkt: { id: string; from: string; to: string; body: string; ts: number; hops: number },
    via: TransportVia
  ): void {
    if (!pkt.id || !pkt.body) return;
    if (this.messages.some((m) => m.id === pkt.id)) return; // dedupe
    this.messages.push({
      id: pkt.id,
      from: pkt.from,
      to: pkt.to,
      body: pkt.body,
      ts: pkt.ts || Date.now(),
      direction: 'in',
      via,
      hops: pkt.hops || 0,
    });
    this.persist();
    this.upsertPeer(pkt.from, this.peers.get(pkt.from)?.name || 'Peer', via);
    this.emit('message', this.messages[this.messages.length - 1]);
  }

  /** Courier: a message not addressed to us is queued and relayed toward its target. */
  private relay(pkt: { id: string; from: string; to: string; body: string; ts: number; hops: number }, via: TransportVia): void {
    if (!pkt.to || pkt.to === this.identity.id) return;
    if (pkt.hops >= MAX_HOPS) return;
    if (this.messages.some((m) => m.id === pkt.id)) return;
    this.messages.push({
      id: pkt.id,
      from: pkt.from,
      to: pkt.to,
      body: pkt.body,
      ts: pkt.ts || Date.now(),
      direction: 'out',
      via: null,
      status: 'queued',
      hops: pkt.hops + 1,
    });
    this.persist();
    this.emit('message', this.messages[this.messages.length - 1]);
    this.log(`Relaying a message toward peer ${pkt.to.slice(0, 8)}… (hop ${pkt.hops + 1}/${MAX_HOPS})`);
    // If we happen to have a live route to the target, deliver immediately.
    const route = this.activeTransportFor(pkt.to);
    if (route) this.flushPeer(pkt.to, route);
  }

  // ---------------------------------------------------------------- packets
  /** Handle one decoded packet received over any transport. */
  handlePacket(raw: string, via: TransportVia): void {
    const pkt = tryParsePacket(raw);
    if (!pkt) {
      this.log(`Received an unparseable packet over ${via}`);
      return;
    }
    // Any packet with a sender refreshes that peer's freshness (keeps the
    // stale-peer TTL from dropping a healthy, actively-chatting link).
    if ('from' in pkt && typeof pkt.from === 'string') {
      const p = this.peers.get(pkt.from);
      if (p) {
        p.lastSeen = Date.now();
        this.persist();
      }
    }
    switch (pkt.t) {
      case 'hello': {
        this.upsertPeer(pkt.id, pkt.name, via);
        this.log(`Hello from ${pkt.name} over ${via}`);
        // No auto-greet reply (each side sends hello once on connect, so a reply
        // would ping-pong forever). On receiving a hello we flush any queued
        // messages for that peer and hand over our store-and-forward mailbox.
        this.flushPeer(pkt.id, via);
        this.sendMailbox(pkt.id, via);
        break;
      }
      case 'msg':
        if (pkt.to === this.identity.id) {
          this.ingestIncoming(pkt, via);
          this.transmit(via, { t: 'ack', id: pkt.id, ts: Date.now() });
        } else {
          this.relay(pkt, via);
          // Always ack the courier so the sender can drop its copy.
          this.transmit(via, { t: 'ack', id: pkt.id, ts: Date.now() });
        }
        break;
      case 'ack':
        this.markDelivered(pkt.id);
        break;
      case 'mailbox': {
        for (const m of pkt.msgs) {
          if (m.to === this.identity.id) {
            this.ingestIncoming(m, via);
            this.transmit(via, { t: 'ack', id: m.id, ts: Date.now() });
          } else {
            this.relay(m, via);
          }
        }
        break;
      }
      case 'ping':
        this.transmit(via, { t: 'pong', ts: Date.now() });
        break;
      case 'pong':
        break;
      case 'bye':
        if (pkt.id) this.markPeerDisconnected(pkt.id);
        break;
      default:
        break;
    }
  }

  /** Send queued messages for `peerId` as a mailbox burst (store-and-forward). */
  private sendMailbox(peerId: string, via: TransportVia): void {
    const msgs = this.messages
      .filter((m) => m.direction === 'out' && m.to === peerId && (m.status === 'queued' || m.status === 'failed'))
      .slice(0, MAILBOX_MAX)
      .map((m) => ({ id: m.id, from: m.from, to: m.to, body: m.body, ts: m.ts, hops: m.hops }));
    if (msgs.length === 0) return;
    this.transmit(via, { t: 'mailbox', msgs });
    for (const m of msgs) {
      const msg = this.messages.find((x) => x.id === m.id);
      if (msg) {
        // Same synchronous-ack guard as flushPeer.
        if (msg.status !== 'delivered') msg.status = 'sent';
        this.persist();
        this.emit('message', msg);
      }
    }
    this.log(`Sent mailbox with ${msgs.length} queued message(s) to ${peerId.slice(0, 8)}…`);
  }

  // ---------------------------------------------------------------- transmit
  private transmit(via: TransportVia, pkt: Packet): void {
    try {
      const data = encodePacket(pkt);
      if (via === 'ble') {
        this.bleWrite(data);
      } else if (via === 'sim') {
        this.simWriteToCentral(data);
      } else if (via === 'webrtc') {
        if (this.rtcChannel?.readyState === 'open') this.rtcChannel.send(data);
      }
    } catch (e: any) {
      this.log(`Transmit failed over ${via}: ${e?.message || e}`);
    }
  }

  // ------------------------------------------------------------------ status
  getStatus(): EngineStatus {
    const out = this.messages.filter((m) => m.direction === 'out' && m.from === this.identity.id);
    return {
      ble: this.bleState,
      bleError: this.bleError,
      simAdvertising: this.simAdvertising,
      rtc: this.rtcState,
      rtcError: this.rtcError,
      online: this.online,
      queued: out.filter((m) => m.status === 'queued' || m.status === 'sending' || m.status === 'failed').length,
      delivered: out.filter((m) => m.status === 'delivered').length,
      connectedPeers: [...this.peers.values()].filter((p) => p.connected).length,
    };
  }

  // ==================================================================== BLE
  bleSupported(): boolean {
    return !!(navigator as NavigatorWithBluetooth).bluetooth;
  }

  /** Scan for a real BLE peripheral advertising the Ocean Mesh service and connect. */
  async bleScanAndConnect(): Promise<PeerInfo | null> {
    const bt = (navigator as NavigatorWithBluetooth).bluetooth;
    if (!bt) {
      this.bleState = 'unsupported';
      this.bleError = 'Web Bluetooth is not available (needs HTTPS or localhost + Chrome/Edge).';
      this.emit('status', this.getStatus());
      return null;
    }
    this.bleState = 'scanning';
    this.bleError = undefined;
    this.emit('status', this.getStatus());
    try {
      const device = await bt.requestDevice({
        filters: [{ services: [BLE_SERVICE] }],
        optionalServices: [BLE_SERVICE],
      });
      this.log(`BLE device found: ${device.name || device.id}`);
      await this.bleConnect(device);
      return { id: device.id, name: device.name || 'BLE device' };
    } catch (e: any) {
      this.bleState = 'idle';
      this.bleError = e?.message || 'Bluetooth scan was cancelled or failed.';
      this.emit('status', this.getStatus());
      return null;
    }
  }

  private async bleConnect(device: BluetoothDeviceLike): Promise<void> {
    this.bleState = 'connecting';
    this.emit('status', this.getStatus());
    this.bleDevice = device;
    this.bleOnDisconnect = () => {
      this.bleState = 'idle';
      this.bleRxChar?.removeEventListener('characteristicvaluechanged', this.bleOnNotify);
      this.bleRxChar = null;
      this.bleTxChar = null;
      this.log(`BLE link to ${device.name || 'device'} lost`);
      this.emit('status', this.getStatus());
    };
    device.addEventListener('gattserverdisconnected', this.bleOnDisconnect);

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(BLE_SERVICE);
    const tx = await service.getCharacteristic(BLE_CHAR_TX);
    const rx = await service.getCharacteristic(BLE_CHAR_RX);
    this.bleTxChar = tx;
    this.bleRxChar = rx;
    rx.addEventListener('characteristicvaluechanged', this.bleOnNotify);
    await rx.startNotifications();
    this.bleState = 'connected';
    this.emit('status', this.getStatus());
    this.log('BLE connected — performing handshake');
    this.transmit('ble', { t: 'hello', id: this.identity.id, name: this.identity.name, ts: Date.now() });
  }

  private bleOnNotify = (e: BluetoothCharacteristicEvent): void => {
    const dv = e.target?.value;
    if (!dv) return;
    const bytes =
      dv instanceof DataView ? new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength) : new Uint8Array(dv);
    const chunk = new TextDecoder().decode(bytes);
    const full = this.bleAssembler.push(chunk);
    if (full !== null) this.handlePacket(full, 'ble');
  };

  private async bleWrite(data: string): Promise<void> {
    if (!this.bleTxChar) return;
    for (const frame of fragmentPayload(data)) {
      const bytes = new TextEncoder().encode(frame);
      try {
        await this.bleTxChar.writeValueWithResponse(bytes);
      } catch {
        await this.bleTxChar.writeValueWithoutResponse(bytes);
      }
    }
  }

  bleDisconnect(): void {
    // Tell the peripheral we are leaving, then tear the link down.
    this.transmit('ble', { t: 'bye', id: this.identity.id, ts: Date.now() });
    try {
      this.bleDevice?.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.bleDevice && this.bleOnDisconnect) {
      try {
        this.bleDevice.removeEventListener('gattserverdisconnected', this.bleOnDisconnect);
      } catch {
        /* ignore */
      }
    }
    this.bleRxChar?.removeEventListener('characteristicvaluechanged', this.bleOnNotify);
    this.bleRxChar = null;
    this.bleTxChar = null;
    this.bleOnDisconnect = null;
    this.bleDevice = null;
    this.bleState = 'idle';
    this.emit('status', this.getStatus());
  }

  // ============================================================ SIM (virtual BLE)
  simAvailable(): boolean {
    return typeof BroadcastChannel !== 'undefined';
  }

  /** Start advertising this tab as a virtual BLE peripheral (simulator). */
  simStartAdvertising(name?: string): boolean {
    if (this.simAdvertising) return true;
    if (!this.simAvailable()) {
      this.log('Virtual peripheral requires BroadcastChannel support.');
      return false;
    }
    this.simAdvertising = true;
    this.log('Virtual Bluetooth peripheral advertising started (simulator)');
    this.emit('status', this.getStatus());
    this.simAdTick(name);
    this.simAdInterval = setInterval(() => this.simAdTick(name), 2000);
    return true;
  }

  simStopAdvertising(): void {
    if (this.simConnectedCentral) {
      this.simPost({ op: 'bye', to: this.simConnectedCentral.id, from: this.identity.id });
    }
    this.simAdvertising = false;
    if (this.simAdInterval) {
      clearInterval(this.simAdInterval);
      this.simAdInterval = null;
    }
    this.simConnectedCentral = null;
    this.emit('status', this.getStatus());
    this.log('Virtual Bluetooth peripheral advertising stopped');
  }

  private simAdInterval: ReturnType<typeof setInterval> | null = null;

  private simAdTick(name?: string): void {
    this.simPost({ op: 'ad', deviceId: this.identity.id, name: name || this.identity.name });
  }

  private simPost(msg: Record<string, unknown>): void {
    try {
      this.simChannel?.postMessage(msg);
    } catch {
      /* ignore */
    }
  }

  private simListen(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.simChannel = new BroadcastChannel(SIM_CHANNEL);
    } catch {
      return;
    }
    this.simChannel.onmessage = (ev: MessageEvent) => {
      const msg = (ev.data || {}) as Record<string, any>;
      const op = msg.op as string;
      if (op === 'bye') {
        if (msg.to === this.identity.id && msg.from) this.markPeerDisconnected(msg.from);
      } else if (op === 'ad') {
        if (msg.deviceId && msg.deviceId !== this.identity.id) {
          this.simDevices.set(msg.deviceId, { id: msg.deviceId, name: msg.name || 'Virtual device', lastSeen: Date.now() });
          this.emit('sim-devices', this.simScan());
        }
      } else if (op === 'scan-req') {
        if (this.simAdvertising) {
          this.simPost({ op: 'scan-res', from: msg.from, deviceId: this.identity.id, name: this.identity.name });
        }
      } else if (op === 'scan-res') {
        if (msg.from === this.identity.id && msg.deviceId !== this.identity.id) {
          this.simDevices.set(msg.deviceId, { id: msg.deviceId, name: msg.name || 'Virtual device', lastSeen: Date.now() });
          this.emit('sim-devices', this.simScan());
        }
      } else if (op === 'conn-req') {
        if (this.simAdvertising && msg.to === this.identity.id) {
          this.simConnectedCentral = { id: msg.from, name: msg.fromName || 'Peer' };
          this.simPost({ op: 'conn-res', from: this.identity.id, to: msg.from, ok: true, name: this.identity.name });
          this.log(`Virtual device connected to ${this.simConnectedCentral.name}`);
          // Greet the central so the peer registers under our name.
          this.simPost({ op: 'rx', to: msg.from, data: encodePacket({ t: 'hello', id: this.identity.id, name: this.identity.name, ts: Date.now() }) });
        }
      } else if (op === 'conn-res') {
        if (msg.to === this.identity.id && msg.ok) {
          this.simConnectedCentral = { id: msg.from, name: msg.name || 'Virtual device' };
          this.upsertPeer(msg.from, msg.name || 'Virtual device', 'sim');
          this.log(`Connected to virtual device "${msg.name}"`);
          this.transmit('sim', { t: 'hello', id: this.identity.id, name: this.identity.name, ts: Date.now() });
        }
      } else if (op === 'tx') {
        // A central wrote to us (we are the virtual peripheral).
        if (msg.to === this.identity.id) {
          this.handlePacket(String(msg.data || ''), 'sim');
        }
      } else if (op === 'rx') {
        // A peripheral streamed data to us (we are the central).
        if (msg.to === this.identity.id) {
          this.handlePacket(String(msg.data || ''), 'sim');
        }
      }
    };
  }

  simScan(): SimDevice[] {
    const now = Date.now();
    for (const [id, d] of this.simDevices.entries()) {
      if (now - d.lastSeen > 8000) this.simDevices.delete(id);
    }
    this.simPost({ op: 'scan-req', from: this.identity.id });
    return [...this.simDevices.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /** Connect (as central) to a discovered virtual device. */
  simConnect(deviceId: string): void {
    const dev = this.simDevices.get(deviceId);
    if (!dev) return;
    this.log(`Connecting to virtual device "${dev.name}"…`);
    this.simConnectedCentral = { id: dev.id, name: dev.name };
    this.simPost({ op: 'conn-req', to: deviceId, from: this.identity.id, fromName: this.identity.name });
  }

  private simWriteToCentral(data: string): void {
    const target = this.simConnectedCentral?.id;
    if (target) this.simPost({ op: 'tx', to: target, data });
  }

  // =================================================================== WEBRTC
  /**
   * Initiator: create an offer and return a compact pairing code.
   * Works fully offline on a shared LAN — no STUN/TURN needed for host
   * candidates. The code is exchanged manually (copy/paste or QR scan).
   */
  async rtcCreateOffer(): Promise<string> {
    this.rtcReset();
    this.rtcState = 'offering';
    this.emit('status', this.getStatus());
    const pc = this.makePeerConnection();
    this.rtcPeer = pc;
    this.rtcChannel = pc.createDataChannel('ocean', { ordered: true });
    this.wireChannel(this.rtcChannel, 'webrtc');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIce(pc);
    const code = {
      v: 1,
      offer: pc.localDescription,
      candidates: this.rtcGathered,
    };
    this.rtcState = 'waiting-answer';
    this.emit('status', this.getStatus());
    return encodeP2PCode(code);
  }

  /** Responder: paste the initiator's code, returns an answer code to send back. */
  async rtcAcceptOffer(code: string): Promise<string> {
    this.rtcReset();
    this.rtcState = 'connecting';
    this.emit('status', this.getStatus());
    const parsed = decodeP2PCode(code);
    if (!parsed || !parsed.offer) throw new Error('Invalid pairing code.');
    const pc = this.makePeerConnection();
    this.rtcPeer = pc;
    pc.ondatachannel = (ev) => {
      this.rtcChannel = ev.channel;
      this.wireChannel(ev.channel, 'webrtc');
    };
    await pc.setRemoteDescription(new RTCSessionDescription(parsed.offer));
    for (const c of parsed.candidates || []) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignore */
      }
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIce(pc);
    const out = { v: 1, answer: pc.localDescription, candidates: this.rtcGathered };
    this.rtcState = 'waiting-answer';
    this.emit('status', this.getStatus());
    return encodeP2PCode(out);
  }

  /** Initiator: paste the responder's answer code to complete the connection. */
  async rtcCompleteOffer(answerCode: string): Promise<void> {
    const parsed = decodeP2PCode(answerCode);
    if (!parsed || !parsed.answer) throw new Error('Invalid answer code.');
    this.rtcState = 'connecting';
    this.emit('status', this.getStatus());
    const pc = this.rtcPeer;
    if (!pc) throw new Error('Start a pairing link first.');
    await pc.setRemoteDescription(new RTCSessionDescription(parsed.answer));
    for (const c of parsed.candidates || []) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignore */
      }
    }
  }

  private makePeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [],
      iceCandidatePoolSize: 0,
    });
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        this.rtcState = 'connected';
        this.emit('status', this.getStatus());
      } else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
        if (s === 'failed') this.rtcError = 'No direct path could be established between the two devices.';
        // Clean up every peer that was linked over WebRTC.
        for (const p of this.peers.values()) {
          if (p.via === 'webrtc') {
            p.connected = false;
            p.via = null;
          }
        }
        this.persist();
        this.rtcState = 'idle';
        this.emit('peer', this.getPeers());
        this.emit('status', this.getStatus());
      }
    };
    return pc;
  }

  private wireChannel(channel: RTCDataChannel, via: TransportVia): void {
    channel.onopen = () => {
      this.rtcState = 'connected';
      this.emit('status', this.getStatus());
      this.log('Direct link established (offline, no internet).');
      this.transmit('webrtc', { t: 'hello', id: this.identity.id, name: this.identity.name, ts: Date.now() });
    };
    channel.onclose = () => {
      this.transmit('webrtc', { t: 'bye', id: this.identity.id, ts: Date.now() });
      for (const p of this.peers.values()) {
        if (p.via === 'webrtc') {
          p.connected = false;
          p.via = null;
        }
      }
      this.persist();
      this.rtcState = 'idle';
      this.emit('peer', this.getPeers());
      this.emit('status', this.getStatus());
    };
    channel.onmessage = (ev) => {
      this.handlePacket(String(ev.data || ''), via);
    };
    channel.onerror = (e) => {
      this.rtcError = 'Data channel error.';
      this.emit('status', this.getStatus());
    };
  }

  private waitForIce(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      this.rtcGathered = [];
      const t = setTimeout(() => {
        cleanup();
        resolve();
      }, 3000);
      const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate) {
          this.rtcGathered.push(ev.candidate.toJSON());
        } else {
          cleanup();
          resolve();
        }
      };
      const onState = () => {
        if (pc.iceGatheringState === 'complete') {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        pc.removeEventListener('icecandidate', onCandidate);
        pc.removeEventListener('icegatheringstatechange', onState);
        clearTimeout(t);
      };
      pc.addEventListener('icecandidate', onCandidate);
      pc.addEventListener('icegatheringstatechange', onState);
    });
  }

  rtcReset(): void {
    try {
      this.rtcChannel?.close();
      this.rtcPeer?.close();
    } catch {
      /* ignore */
    }
    this.rtcChannel = null;
    this.rtcPeer = null;
    this.rtcGathered = [];
    this.rtcState = 'idle';
    this.rtcError = undefined;
    this.emit('status', this.getStatus());
  }

  /** Utility: copy a connection's code to the clipboard (used by the UI). */
  async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Pairing code encoding (WebRTC signaling blob)
// ---------------------------------------------------------------------------

const CODE_PREFIX = 'OCEANP2P1:';

interface SignalingPayload {
  v: number;
  offer?: RTCSessionDescriptionInit | null;
  answer?: RTCSessionDescriptionInit | null;
  candidates?: RTCIceCandidateInit[];
}

function encodeP2PCode(payload: SignalingPayload): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return CODE_PREFIX + b64;
}

export function decodeP2PCode(code: string): SignalingPayload | null {
  try {
    let clean = code.trim();
    if (clean.startsWith(CODE_PREFIX)) clean = clean.slice(CODE_PREFIX.length);
    // Textareas often add line breaks when copying long codes — strip ALL
    // whitespace so pasted codes always decode.
    clean = clean.replace(/\s+/g, '');
    const json = decodeURIComponent(escape(atob(clean)));
    return JSON.parse(json) as SignalingPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------

/** Singleton engine shared by the whole app. */
export const p2p = new OfflineP2PEngine();
